// Computador: roda programas Jiboia devagarinho e controla as máquinas.
import * as THREE from 'three';
import { Machine, ENTITY_CLASSES, MachineRef, findByName } from './machines.js';
import { parse, Interpreter, Builtin, Blocking, JiboiaError, JDict, JRange, STEP, WAIT, suggest, str, repr, truthy, jEq } from './lang/jiboia.js';
const jEqSafe = (a, b) => { try { return jEq(a, b); } catch { return a === b; } };
import { powerText } from './power.js';
import { ITEMS, STARTER_CODE, MACHINES, PC_UPGRADES } from './data.js';
import { PAL } from './palette.js';
import { game } from './state.js';
import { audio } from './audio.js';
import { CHALLENGES } from './challenges.js';
import { jiboiaContracts, neededTotals, UNLOCK_LEVEL } from './contracts.js';

const SCREEN_W = 512, SCREEN_H = 234;
// posição da tela em cima do modelo "screen-panel-wide" (coordenadas do modelo já normalizado)
export const SCREEN_POSE = { x: 0, y: 0.775, z: 0.01, rx: -0.2014, ry: Math.PI, w: 1.17, h: 0.535 };

// pesquisas que liberam partes da linguagem
const TECH_LABEL = { rede: 'Rede de Computadores', sensores: 'Sensores e Eventos' };
function needTech(id) {
  if (!game.economy.hasTech(id)) throw new JiboiaError(`Isso precisa da pesquisa "${TECH_LABEL[id]}" no Laboratório`);
}
// cópia de valores pra mandar pela rede (listas e dicionários não ficam compartilhados)
function copyValue(v) {
  if (Array.isArray(v)) return v.map(copyValue);
  if (v instanceof JDict) return new JDict([...v.m].map(([k, x]) => [k, copyValue(x)]));
  if (v instanceof JRange) return v;
  return v;
}

// funções liberadas resolvendo desafios no 🧩 Terminal de Desafios
// 3.0: as funções que antes saíam dos desafios ficam liberadas desde o começo
function needChallenge() { }
void CHALLENGES;
const needList = (v, fn) => { if (!Array.isArray(v)) throw new JiboiaError(`${fn}() precisa de uma lista`); return v; };
const escH = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// eventos globais (vendas, sensores) chegam em quem estiver ouvindo
game.on('evento', (ev) => {
  for (const pc of game.entities) {
    if (pc.type !== 'computador' || !pc.running) continue;
    if (ev.tipo === 'venda' && pc.listening.has('vendas')) pc.pushEvent(ev);
    if (ev.tipo === 'item' && pc.listening.has(ev.fonte)) pc.pushEvent(ev);
  }
});

export class Computer extends Machine {
  partsOn() { return this.running && !this.paused; }
  constructor(type, x, z, dir) {
    super(type, x, z, dir);
    const first = !game.entities.some((e) => e.type === 'computador');
    this.code = first && !game.economy.stats.ranCode ? STARTER_CODE : '# Novo programa\n\nwhile True:\n    print("Olá, fábrica!")\n    esperar(2)\n';
    this.running = false;
    this.console = [];
    this.error = null;
    this.errorLine = null;
    this.curLine = 0;
    this.acc = 0;
    this.timers = [];
    this.instructions = 0;
    this.makeScreen();
    this.dirty = true;
    this.screenTimer = 0;
    // depurador
    this.breakpoints = new Set();
    this.paused = false;
    this.stepOnce = false;
    this.skipBreak = false;
    // rede e eventos
    this.inbox = [];
    this.msgWaiters = [];
    this.events = [];
    this.eventWaiters = [];
    this.listening = new Map(); // fonte -> intervalo (pra "tempo")
    // placar de eficiência
    this.sc = { items: 0, money: 0 };
    this.scHist = [];
    this.scT = 10;
    this.lastInstr = 0;
    this.board = { itemsMin: 0, moneyMin: 0, instrPerItem: 0, medal: null };
    // hardware (overclock e memória)
    this.hw = { clock: 0, memoria: 0 };
  }

  // ─── hardware ───
  get clockMul() { return PC_UPGRADES.clock.valores[this.hw.clock]; }
  get limits() { return { vars: PC_UPGRADES.memoria.valores[this.hw.memoria], lista: PC_UPGRADES.memoria.lista[this.hw.memoria] }; }
  get hwEnergy() { return PC_UPGRADES.clock.energia[this.hw.clock] + PC_UPGRADES.memoria.energia[this.hw.memoria]; }
  get hz() { return game.economy.cpuHz * this.clockMul * (1 + this.decorCpu) * game.economy.cpuMul; }
  hwUpgrade(k) {
    if (game.mp?.guestRpc('hw', { a: this.addr, k })) return null;
    const u = PC_UPGRADES[k];
    const lvl = this.hw[k];
    if (lvl >= u.custos.length) return 'Já está no máximo';
    if (!game.economy.hasTech('hardware')) return 'Pesquise "Hardware dos Computadores" no Laboratório';
    if (!game.economy.pay(u.custos[lvl])) return 'Faltam itens no inventário';
    this.hw[k]++;
    game.economy.stats.hwUpgrades = (game.economy.stats.hwUpgrades || 0) + 1;
    audio.play('levelup', { pos: this.pos, volume: 0.5 });
    game.emit('power');
    game.emit('computer', this);
    return null;
  }
  // uso da memória agora (pro painel ⚙ Hardware)
  memUsage() {
    const I = this.interp;
    if (!I || !this.running) return { vars: 0, maiorLista: 0 };
    let big = 0;
    const scan = (m) => { for (const v of m.values()) if (Array.isArray(v)) big = Math.max(big, v.length); };
    scan(I.globals);
    if (I.frame && !I.frame.isGlobal) scan(I.frame.vars);
    return { vars: I.varCount(I.frame), maiorLista: big };
  }

  // chamado pelas máquinas quando um pedido deste computador termina
  score(kind, n) {
    if (kind === 'item') this.sc.items += n;
    if (kind === 'money') this.sc.money += n;
  }
  updateBoard(dt) {
    this.scT -= dt;
    if (this.scT > 0) return;
    this.scT = 10;
    this.scHist.push({ items: this.sc.items, money: this.sc.money, instr: this.instructions - this.lastInstr });
    this.sc = { items: 0, money: 0 };
    this.lastInstr = this.instructions;
    if (this.scHist.length > 6) this.scHist.shift();
    const n = this.scHist.length;
    const it = this.scHist.reduce((a, b) => a + b.items, 0);
    const mo = this.scHist.reduce((a, b) => a + b.money, 0);
    const ins = this.scHist.reduce((a, b) => a + b.instr, 0);
    const mins = (n * 10) / 60;
    const b = this.board;
    b.itemsMin = Math.round((it / mins) * 10) / 10;
    b.moneyMin = Math.round((mo / mins) * 10) / 10;
    b.instrPerItem = it ? Math.round((ins / it) * 10) / 10 : 0;
    b.medal = n < 3 ? null : (b.itemsMin >= 30 || b.moneyMin >= 300) ? 'ouro' : (b.itemsMin >= 12 || b.moneyMin >= 100) ? 'prata' : (b.itemsMin >= 4 || b.moneyMin >= 25) ? 'bronze' : null;
    if (b.medal === 'ouro') game.economy.stats.gold = true;
  }
  get medalIcon() { return { ouro: '🥇', prata: '🥈', bronze: '🥉' }[this.board.medal] || ''; }

  // eventos (sensor, vendas, rede, tempo)
  pushEvent(ev) {
    const d = new JDict(Object.entries(ev));
    const w = this.eventWaiters.shift();
    if (w) w.b.resolve(d);
    else { this.events.push(d); if (this.events.length > 50) this.events.shift(); }
  }
  deliver(msg) {
    const d = new JDict([['de', msg.de], ['msg', msg.msg]]);
    const w = this.msgWaiters.shift();
    if (w) w.b.resolve(d);
    else { this.inbox.push(d); if (this.inbox.length > 50) this.inbox.shift(); }
    if (this.listening.has('rede')) this.pushEvent({ tipo: 'mensagem', fonte: msg.de, msg: msg.msg });
  }
  // depurador
  pause() { if (game.mp?.blocked('Depurador')) return; if (this.running) { this.paused = true; this.dirty = true; game.emit('computer', this); } }
  resume() { this.paused = false; this.skipBreak = true; this.stepOnce = false; game.emit('computer', this); }
  step() { if (game.mp?.blocked('Depurador')) return; if (this.running) { this.paused = true; this.stepOnce = true; this.skipBreak = true; } }
  toggleBreak(line) {
    if (game.mp?.guestRpc('bp', { a: this.addr, line })) return;
    if (this.breakpoints.has(line)) this.breakpoints.delete(line); else this.breakpoints.add(line);
    game.emit('computer', this);
  }
  vars() {
    const I = this.interp;
    if (!I) return { globais: [], locais: [] };
    const skip = (v) => v instanceof Builtin;
    const fmt = (m) => [...m].filter(([, v]) => !skip(v) && !(v && v.node)).map(([k, v]) => [k, repr(v)]);
    const f = I.frame;
    return { globais: fmt(I.globals), locais: f && !f.isGlobal ? fmt(f.vars) : [] };
  }

  makeScreen() {
    const c = document.createElement('canvas');
    c.width = SCREEN_W; c.height = SCREEN_H;
    this.canvas = c;
    this.ctx2d = c.getContext('2d');
    this.tex = new THREE.CanvasTexture(c);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN_POSE.w, SCREEN_POSE.h), new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false }));
    m.position.set(SCREEN_POSE.x, SCREEN_POSE.y, SCREEN_POSE.z);
    m.rotation.set(SCREEN_POSE.rx, SCREEN_POSE.ry, 0, 'YXZ');
    m.userData.entity = this;
    this.screen = m;
    this.model.add(m);
    // o modelo interno é girado; a tela fica "na frente" do modelo
  }

  log(text, kind = 'out') {
    this.console.push({ text, kind, t: game.time });
    if (this.console.length > 300) this.console.splice(0, this.console.length - 300);
    this.dirty = true;
    game.emit('console', this);
  }

  get addr() { return `${this.x},${this.z},${this.layer || 0}`; }
  run() {
    if (game.mp?.guestRpc('run', { a: this.addr, code: this.code })) return true; // multiplayer: roda no anfitrião
    this.stop(true);
    this.console = [];
    this.error = null; this.errorLine = null;
    let ast;
    try { ast = parse(this.code); }
    catch (e) {
      this.fail(e);
      return false;
    }
    this.interp = new Interpreter(ast, { print: (s) => { this.log(s); audio.play('beep', { pos: this.pos, volume: 0.25 }); }, builtins: this.builtins(), limits: () => this.limits });
    this.gen = this.interp.run();
    this.lastYield = STEP;
    this.acc = 1;
    this.running = true;
    this.instructions = 0;
    this.lastInstr = 0;
    this.paused = false;
    this.stepOnce = false;
    this.skipBreak = false;
    this.events = [];
    this.inbox = [];
    this.listening = new Map();
    this.log('▶ Programa iniciado', 'sys');
    game.economy.stats.ranCode = true;
    audio.play('run', { pos: this.pos, volume: 0.6 });
    game.emit('computer', this);
    return true;
  }

  stop(silent) {
    if (!silent && game.mp?.guestRpc('stop', { a: this.addr })) return;
    if (this.interp && this.interp.currentBlocking) this.interp.currentBlocking.cancelled = true;
    for (const t of this.timers) t.b.cancelled = true;
    this.timers = [];
    for (const w of [...this.msgWaiters, ...this.eventWaiters]) w.b.cancelled = true;
    this.msgWaiters = [];
    this.eventWaiters = [];
    this.paused = false;
    const was = this.running;
    this.running = false;
    this.gen = null;
    this.dirty = true;
    if (was && !silent) { this.log('■ Programa parado', 'sys'); audio.play('stop', { pos: this.pos, volume: 0.5 }); }
    game.emit('computer', this);
  }

  fail(e) {
    const line = e instanceof JiboiaError ? e.line : this.curLine;
    const msg = e instanceof JiboiaError ? e.message : 'Erro interno: ' + (e.message || e);
    if (!(e instanceof JiboiaError)) console.error(e);
    const lib = e && e.lib;
    this.error = msg;
    this.errorLine = lib ? this.curLine : line;
    game.economy.stats.errors = (game.economy.stats.errors || 0) + 1;
    this.log(lib ? `✖ Biblioteca "${lib}", linha ${line}: ${msg}` : `✖ Linha ${line}: ${msg}`, 'err');
    this.stop(true);
    audio.play('error', { pos: this.pos, volume: 0.6 });
    game.emit('computerError', this);
  }

  builtins() {
    const B = (name, fn, min = 0, max = min) => new Builtin(name, fn, min, max);
    const self = this;
    return {
      maquina: B('maquina', ([n]) => {
        if (typeof n !== 'string') throw new JiboiaError('maquina() precisa do nome entre aspas, ex: maquina("minerador1")');
        const e = findByName(n);
        if (!e) {
          const names = game.entities.filter((x) => x.isMachine && x.name).map((x) => x.name);
          const s = suggest(n, names);
          throw new JiboiaError(`Não achei a máquina "${n}"` + (s ? `. Você quis dizer "${s}"?` : names.length ? `. Existem: ${names.slice(0, 8).join(', ')}` : ''));
        }
        return new MachineRef(e);
      }, 1),
      maquinas: B('maquinas', (a) => {
        const t = a[0] ?? null;
        return game.entities.filter((e) => e.isMachine && e.name && (!t || e.type === t)).map((e) => e.name);
      }, 0, 1),
      esperar: B('esperar', ([s]) => {
        if (typeof s !== 'number' || s < 0) throw new JiboiaError('esperar() precisa de um número de segundos');
        const b = new Blocking();
        b.label = 'esperando';
        self.timers.push({ until: game.time + s, b });
        return b;
      }, 1),
      tempo: B('tempo', () => Math.round(game.time * 100) / 100),
      // quanto tem no inventário (de um item, ou tudo num dicionário)
      inventario: B('inventario', (a) => {
        const eco = game.economy;
        if (!a.length) return new JDict(Object.entries(eco.items));
        if (!ITEMS[a[0]]) throw new JiboiaError(`O item "${a[0]}" não existe`);
        return eco.count(a[0]);
      }, 0, 1),
      tier: B('tier', () => game.economy.tier),
      nivel: B('nivel', () => game.economy.tier),
      itens: B('itens', () => Object.keys(ITEMS)),
      apitar: B('apitar', () => { audio.play('beep', { pos: self.pos, rate: 1.3 }); return null; }),
      eu: B('eu', () => self.name),
      energia: B('energia', () => {
        const n = self.net;
        return new JDict([['gerado', n ? n.supply : 0], ['usado', n ? n.demand : 0], ['nivel', Math.round(self.power * 100) / 100]]);
      }),
      // ── rede entre computadores (pesquisa "rede") ──
      enviar: B('enviar', ([para, msg]) => {
        needTech('rede');
        const alvos = para === 'todos' ? game.entities.filter((e) => e.type === 'computador' && e !== self) : [findByName(para)];
        if (!alvos[0] || alvos[0].type !== 'computador') throw new JiboiaError(`Não achei o computador "${para}". Use o nome dele (ex: "pc2") ou "todos"`);
        for (const a of alvos) a.deliver({ de: self.name, msg: copyValue(msg) });
        game.economy.stats.netMsgs = (game.economy.stats.netMsgs || 0) + 1;
        return alvos.length;
      }, 2),
      receber: B('receber', (a) => {
        needTech('rede');
        const b = new Blocking();
        b.label = 'esperando mensagem';
        if (self.inbox.length) { b.resolve(self.inbox.shift()); return b; }
        const w = { b, until: a.length ? game.time + a[0] : Infinity };
        self.msgWaiters.push(w);
        return b;
      }, 0, 1),
      tem_mensagem: B('tem_mensagem', () => { needTech('rede'); return self.inbox.length > 0; }),
      compartilhar: B('compartilhar', ([k, v]) => { needTech('rede'); if (typeof k !== 'string') throw new JiboiaError('compartilhar() precisa de uma chave de texto'); game.economy.netStore[k] = copyValue(v); return null; }, 2),
      ler: B('ler', (a) => { needTech('rede'); const v = game.economy.netStore[a[0]]; return v === undefined ? (a[1] ?? null) : copyValue(v); }, 1, 2),
      // ── sensores e eventos (pesquisa "sensores") ──
      ouvir: B('ouvir', (a) => {
        needTech('sensores');
        const fonte = a[0];
        if (typeof fonte !== 'string') throw new JiboiaError('ouvir() precisa de uma fonte: "vendas", "rede", "tempo" ou o nome de um sensor');
        if (fonte === 'tempo') {
          const s = a[1] ?? 5;
          if (typeof s !== 'number' || s < 0.5) throw new JiboiaError('ouvir("tempo", segundos) precisa de pelo menos 0.5 segundo');
          self.listening.set('tempo', { every: s, next: game.time + s });
        } else if (fonte === 'vendas' || fonte === 'rede') self.listening.set(fonte, true);
        else {
          const e = findByName(fonte);
          if (!e || e.type !== 'sensor') throw new JiboiaError(`"${fonte}" não é um sensor. Fontes: "vendas", "rede", "tempo" ou o nome de uma Esteira com Sensor`);
          self.listening.set(fonte, true);
        }
        return null;
      }, 1, 2),
      esperar_evento: B('esperar_evento', (a) => {
        needTech('sensores');
        const b = new Blocking();
        b.label = 'esperando evento';
        if (self.events.length) { b.resolve(self.events.shift()); return b; }
        self.eventWaiters.push({ b, until: a.length ? game.time + a[0] : Infinity });
        return b;
      }, 0, 1),
      esperar_ate: new Builtin('esperar_ate', function* ([cond, timeout], I, line) {
        needTech('sensores');
        if (!cond || !(cond.node || cond instanceof Builtin)) throw new JiboiaError('esperar_ate() precisa de uma função, ex: esperar_ate(tem_minerio)');
        const t0 = game.time;
        for (;;) {
          const v = yield* I.call(cond, [], line);
          if (truthy(v)) return true;
          if (timeout != null && game.time - t0 >= timeout) return false;
          I.waitLabel = 'esperando condição';
          yield WAIT;
        }
      }, 1, 2, true),
      // ── contratos ──
      contratos: B('contratos', () => {
        if (game.economy.level < UNLOCK_LEVEL) throw new JiboiaError(`Contratos liberam no nível ${UNLOCK_LEVEL}`);
        return jiboiaContracts();
      }),
      fichas: B('fichas', () => game.economy.tokens),
      estrelas: B('estrelas', () => game.economy.stars),
      // ── funções liberadas pelos desafios ──
      anunciar: B('anunciar', ([t]) => { needChallenge('anunciar'); game.ui?.toast(`📢 <b>${escH(self.name)}</b>: ${escH(str(t)).slice(0, 140)}`); audio.play('quest', { volume: 0.4 }); return null; }, 1),
      contar: B('contar', ([l, x]) => { needChallenge('contar'); return needList(l, 'contar').filter((v) => jEqSafe(v, x)).length; }, 2),
      media: B('media', ([l]) => {
        needChallenge('media');
        needList(l, 'media');
        if (!l.length) return 0;
        if (l.some((v) => typeof v !== 'number')) throw new JiboiaError('media() precisa de uma lista de números');
        return l.reduce((a, b) => a + b, 0) / l.length;
      }, 1),
      unicos: B('unicos', ([l]) => { needChallenge('unicos'); const out = []; for (const v of needList(l, 'unicos')) if (!out.some((o) => jEqSafe(o, v))) out.push(v); return out; }, 1),
      mais_caro: B('mais_caro', ([l]) => {
        needChallenge('mais_caro');
        const items = needList(l, 'mais_caro').filter((k) => ITEMS[k]);
        if (!items.length) return null;
        return items.reduce((a, b) => (game.economy.price(b) > game.economy.price(a) ? b : a));
      }, 1),
      maior_chave: B('maior_chave', ([d]) => {
        needChallenge('maior_chave');
        if (!(d instanceof JDict)) throw new JiboiaError('maior_chave() precisa de um dicionário');
        let best = null, bv = -Infinity;
        for (const [k, v] of d.m) if (typeof v === 'number' && v > bv) { bv = v; best = k; }
        return best;
      }, 1),
      faltando: B('faltando', () => { needChallenge('faltando'); return new JDict(Object.entries(neededTotals())); }),
      relatorio: B('relatorio', () => {
        needChallenge('relatorio');
        const e = game.economy;
        const s = e.series.slice(-6);
        const ipm = s.length ? Math.round((s.reduce((a, b) => a + b.items, 0) / (s.length * 10)) * 60) : 0;
        return new JDict([['tier', e.tier], ['marcos', e.milestones.length], ['fase', e.phase], ['itens_por_minuto', ipm], ['espacos_livres', e.slots - e.slotsUsed()]]);
      }),
      inverter: B('inverter', ([l]) => { needChallenge('inverter'); return [...needList(l, 'inverter')].reverse(); }, 1),
      chance: B('chance', ([p]) => { needChallenge('chance'); if (typeof p !== 'number') throw new JiboiaError('chance() precisa de um número de 0 a 1'); return Math.random() < p; }, 1),
      // ── bibliotecas ──
      importar: new Builtin('importar', function* ([nome], I) {
        const libs = game.economy.libs;
        if (typeof nome !== 'string' || !libs[nome]) {
          const s = suggest(String(nome), Object.keys(libs));
          throw new JiboiaError(`Biblioteca "${nome}" não existe` + (s ? `. Você quis dizer "${s}"?` : `. Crie na aba Bibliotecas do editor`));
        }
        let ast;
        try { ast = parse(libs[nome], nome); }
        catch (e) { throw new JiboiaError(`Erro na biblioteca "${nome}", linha ${e.line}: ${e.message}`); }
        yield* I.execBlock(ast, I.globalFrame);
        game.economy.stats.libsImported = (game.economy.stats.libsImported || 0) + 1;
        return null;
      }, 1, 1, true),
    };
  }

  update(dt) {
    this.animate(dt);
    // timers de esperar()
    for (let i = this.timers.length - 1; i >= 0; i--) {
      if (game.time >= this.timers[i].until) { this.timers[i].b.resolve(null); this.timers.splice(i, 1); }
    }
    // tempo esgotado de receber()/esperar_evento()
    for (const list of [this.msgWaiters, this.eventWaiters]) {
      for (let i = list.length - 1; i >= 0; i--) if (game.time >= list[i].until) { list[i].b.resolve(null); list.splice(i, 1); }
    }
    // eventos de relógio
    const tempo = this.listening.get('tempo');
    if (tempo && this.running && game.time >= tempo.next) { tempo.next = game.time + tempo.every; this.pushEvent({ tipo: 'tempo', fonte: 'relogio', segundos: Math.round(game.time) }); }
    const pw = this.power;
    if (this.noPower !== (pw <= 0)) { this.noPower = pw <= 0; this.dirty = true; }
    if (this.running && this.gen && pw > 0 && (!this.paused || this.stepOnce)) {
      const hz = this.hz * pw;
      this.acc = Math.min(this.acc + dt * hz, Math.max(1.5, hz * 0.25));
      if (this.stepOnce) this.acc = Math.max(this.acc, 1);
      let guard = 0;
      game.currentPC = this;
      try {
        while (this.running && guard++ < 200) {
          if (this.lastYield === STEP) {
            // breakpoint: para ANTES de executar a linha marcada
            if (!this.skipBreak && !this.interp.lib && this.breakpoints.has(this.interp.line)) {
              this.paused = true;
              this.stepOnce = false;
              this.curLine = this.interp.line;
              this.dirty = true;
              game.economy.stats.breakpoints = (game.economy.stats.breakpoints || 0) + 1;
              this.log(`⏸ Parou no breakpoint da linha ${this.curLine}`, 'sys');
              game.emit('computer', this);
              break;
            }
            if (this.paused && !this.stepOnce) break;
            if (this.acc < 1) break;
            this.acc -= 1;
            this.instructions++;
            this.skipBreak = false;
            if (this.stepOnce) this.stepped = true;
          }
          const r = this.gen.next();
          if (r.done) {
            this.running = false;
            this.paused = false;
            this.log('✔ Programa terminou', 'sys');
            game.emit('computer', this);
            break;
          }
          const prevLine = this.curLine;
          this.lastYield = r.value;
          if (!this.interp.lib) this.curLine = this.interp.line;
          if (prevLine !== this.curLine) this.dirty = true;
          if (this.stepOnce && this.stepped && r.value === STEP) { this.stepOnce = false; this.stepped = false; game.emit('computer', this); break; }
          if (r.value === WAIT) break;
        }
      } catch (e) {
        this.fail(e);
      }
      game.currentPC = null;
    }
    if (this.running) this.updateBoard(dt);
    this.screenTimer -= dt;
    if (this.dirty && this.screenTimer <= 0) {
      const d = this.pos.distanceTo(game.camera.position);
      if (d < 30) { this.drawScreen(); this.dirty = false; this.screenTimer = 0.15; }
    }
  }

  animate(dt) {
    this.anim += dt;
    if (this.noPower) {
      this.lamp.material.color.setHex(PAL.bad);
      this.lamp.material.emissive.setHex(PAL.badGlow);
      this.lamp.material.emissiveIntensity = Math.sin(this.anim * 4) > 0 ? 1.4 : 0.1;
      return;
    }
    const col = this.error ? PAL.bad : this.running ? (this.lastYield === WAIT ? PAL.wait : PAL.work) : PAL.idle;
    this.lamp.material.color.setHex(col);
    this.lamp.material.emissive.setHex(col);
    this.lamp.material.emissiveIntensity = this.running ? 1 + Math.sin(this.anim * 8) * 0.4 : 0.4;
  }

  get statusText() {
    if (this.noPower) return 'Sem energia ⚡ (ligue um cabo 🔌)';
    if (this.error) return 'Erro na linha ' + this.errorLine;
    if (!this.running) return 'Parado';
    if (this.paused) return '⏸ Pausado na linha ' + this.curLine;
    if (this.lastYield === WAIT) return 'Esperando: ' + (this.interp?.waitLabel || '...');
    return 'Executando linha ' + this.curLine;
  }

  drawScreen() {
    const g = this.ctx2d;
    if (this.noPower) {
      g.fillStyle = '#07060d';
      g.fillRect(0, 0, SCREEN_W, SCREEN_H);
      g.fillStyle = '#ff6a7a';
      g.font = '800 30px "Big Shoulders Display", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('⚡ SEM ENERGIA', SCREEN_W / 2, SCREEN_H / 2 - 16);
      g.fillStyle = '#8f89b8';
      g.font = '400 18px "Barlow", sans-serif';
      g.fillText('Ligue um cabo 🔌 do gerador até aqui', SCREEN_W / 2, SCREEN_H / 2 + 20);
      g.textAlign = 'left';
      this.tex.needsUpdate = true;
      return;
    }
    g.fillStyle = '#1b1830';
    g.fillRect(0, 0, SCREEN_W, SCREEN_H);
    // barra de título
    g.fillStyle = this.error ? '#7a2a3a' : this.running ? '#2f5a44' : '#3a3560';
    g.fillRect(0, 0, SCREEN_W, 34);
    g.font = '600 20px "Barlow", sans-serif';
    g.fillStyle = '#fff4e0';
    g.textBaseline = 'middle';
    g.fillText('🐍 ' + this.name, 12, 18);
    g.textAlign = 'right';
    g.font = '500 16px "Barlow", sans-serif';
    g.fillText(this.statusText, SCREEN_W - 10, 18);
    g.textAlign = 'left';
    // código
    const lines = this.code.split('\n');
    const lh = 19, visible = Math.floor((SCREEN_H - 84) / lh);
    const focus = this.error ? this.errorLine : this.running ? this.curLine : 1;
    let start = Math.max(1, Math.min(focus - 4, lines.length - visible + 1));
    g.font = '15px "JetBrains Mono", monospace';
    for (let i = 0; i < visible; i++) {
      const ln = start + i;
      if (ln > lines.length) break;
      const y = 44 + i * lh;
      if (ln === focus && (this.running || this.error)) {
        g.fillStyle = this.error ? 'rgba(255,80,100,0.35)' : 'rgba(255,200,80,0.28)';
        g.fillRect(0, y - 2, SCREEN_W, lh);
        g.fillStyle = this.error ? '#ff7a8a' : '#ffc850';
        g.fillText('▶', 4, y + 9);
      }
      g.fillStyle = '#6d6a90';
      g.fillText(String(ln).padStart(2, ' '), 20, y + 9);
      const txt = lines[ln - 1];
      const t = txt.trim();
      g.fillStyle = t.startsWith('#') ? '#7f8a6a' : '#e8e4ff';
      g.fillText(txt.length > 50 ? txt.slice(0, 49) + '…' : txt, 50, y + 9);
    }
    // última saída
    g.fillStyle = '#131126';
    g.fillRect(0, SCREEN_H - 44, SCREEN_W, 44);
    const last = this.console.slice(-2);
    g.font = '14px "JetBrains Mono", monospace';
    last.forEach((l, i) => {
      g.fillStyle = l.kind === 'err' ? '#ff7a8a' : l.kind === 'sys' ? '#8fb0ff' : '#b8f5c8';
      const s = '> ' + l.text;
      g.fillText(s.length > 58 ? s.slice(0, 57) + '…' : s, 10, SCREEN_H - 32 + i * 18);
    });
    this.tex.needsUpdate = true;
  }

  api() { return {}; }
  infoLines() {
    const b = this.board;
    return [this.statusText, powerText(this),
      `Placar: ${this.medalIcon} ${b.itemsMin} itens/min · $ ${b.moneyMin}/min · ${b.instrPerItem || '—'} instr/item`,
      `CPU: ${this.hz.toFixed(1)} instr/s${this.hw.clock ? ` (overclock ${this.clockMul}×)` : ''}${this.decorCpu ? ` (decoração +${Math.round(this.decorCpu * 100)}%)` : ''}`,
      `Memória: ${this.limits.vars === Infinity ? '∞' : this.limits.vars} variáveis · listas até ${this.limits.lista === Infinity ? '∞' : this.limits.lista} itens`];
  }
  serialize() { return { ...super.serialize(), code: this.code, running: this.running, breakpoints: [...this.breakpoints], hw: this.hw }; }
  load(d) {
    super.load(d);
    if (typeof d.code === 'string') this.code = d.code;
    if (d.hw) this.hw = { clock: Math.min(3, d.hw.clock || 0), memoria: Math.min(3, d.hw.memoria || 0) };
    this.breakpoints = new Set(d.breakpoints || []);
    this.dirty = true;
    if (d.running && !game.mp?.isGuest) setTimeout(() => { if (!this.removed) this.run(); }, 500);
  }
  onRemove() { this.stop(true); super.onRemove(); }
}

ENTITY_CLASSES.computador = Computer;
void MACHINES; void str;
