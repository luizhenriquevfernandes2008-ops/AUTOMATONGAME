// 🌐 Multiplayer cooperativo: até 4 pessoas construindo a MESMA fábrica ao mesmo tempo.
//
// Como funciona:
//  - Um jogador é o ANFITRIÃO: o jogo dele roda a fábrica de verdade (máquinas, programas, dinheiro) e salva.
//  - Os CONVIDADOS veem uma cópia: quando entram recebem a fábrica inteira, e depois o anfitrião manda
//    o que mudou 4 vezes por segundo. Nada é salvo no PC do convidado (a fábrica dele fica guardada).
//  - Tudo que um convidado faz (colocar, tirar, ligar cabo, programar, comprar…) vira um pedido pro
//    anfitrião, que confere, executa e avisa todo mundo.
//  - Por padrão os PCs se ligam direto (p2p.js, WebRTC). Opcional: um servidor pequeno de salas
//    (pasta servidor-online) que só liga os jogadores e repassa as mensagens.
//
// Os outros arquivos chamam game.mp?.intercept(...) / game.mp?.op(...) / game.mp?.guestRpc(...)
// (sem importar este arquivo, pra não ter import circular).
import * as THREE from 'three';
import { game } from './state.js';
import { settings, saveSettings } from './settings.js';
import { grid, gridUp, key, createEntity, addEntity, removeEntity, cellCenter, refreshBeltsAround } from './machines.js';
import { MACHINES, DECOR, CELL, PAINTINGS, PAINT_PRICE, MATERIAL_SHOP, MATERIALS, UPGRADES, REGIONS, TIERS, TECHS, BELT_TIERS } from './data.js';
import { connect, disconnect, disconnectAll, loadWires, powerRatio, usesPower, updatePower } from './power.js';
import { structures, addStructure, removeStructure, paintStructure, addPainting, loadStructures, pieceCost } from './structures.js';
import { saveData } from './save.js';
import { loadSky, serializeSky } from './sky.js';
import { loadEvents } from './events.js';
import { minerOres, clearRegion } from './world.js';
import { cloneModel } from './assets.js';
import { makeLabel } from './fx.js';
import { releaseItemMesh } from './itemMeshes.js';
import { acceptContract, cancelContract } from './contracts.js';
import { audio } from './audio.js';
import { openP2P } from './p2p.js';
import { ITEMS, HAND } from './data.js';
import { removeFlora, loadFlora } from './flora.js';
import { craftOnce } from './hub.js';
import { togglePower } from './ui3.js';
import { world } from './terrain.js';
import { setPendingJoin } from './save.js';

export const DEFAULT_SERVER = 'wss://automaton-multiplayer.onrender.com';
const escH = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const myName = () => (settings.nome || '').trim() || 'Jogador(a)';
const GUEST_JOB = { label: '' };
const SPACING = 0.34;

// endereço de uma entidade: "x,z,andar" (é igual nos dois jogos)
export const addr = (e) => `${e.x},${e.z},${e.layer || 0}`;
function find(a) {
  if (!a) return null;
  const [x, z, l] = a.split(',').map(Number);
  const e = (l ? gridUp : grid).get(key(x, z));
  return e && e.type && !e.static ? e : null;
}

export const mp = {
  role: null,          // null | 'host' | 'guest'
  ws: null,
  room: null,
  myId: null,
  hostId: null,
  applying: false,     // aplicando o que veio do anfitrião (aí nada vira pedido)
  ready: false,        // convidado já recebeu a fábrica
  peers: new Map(),    // id -> { name, obj, target, yaw }
  chat: [],
  last: new Map(),     // anfitrião: último estado mandado de cada entidade
  codeSent: new Map(),
  lastEco: '',
  t: { st: 0, eco: 0, pos: 0, sky: 0, roster: 0 },
  status: 'desconectado',

  get active() { return !!this.role; },
  get isGuest() { return this.role === 'guest'; },

  // ─── ganchos chamados pelo resto do jogo ───
  // convidado mexendo no mundo: vira pedido pro anfitrião (retorna true = não faça localmente)
  intercept(kind, payload) {
    if (this.role !== 'guest' || this.applying) return false;
    this.send('host', { k: 'req', a: kind, p: payload });
    return true;
  },
  // pedidos que não mexem no mundo direto (comprar, pesquisar, rodar programa…)
  guestRpc(kind, payload) { return this.intercept(kind, payload); },
  // anfitrião avisa todo mundo de uma mudança estrutural (máquina nova, cabo, parede…)
  op(kind, payload) {
    if (this.role !== 'host' || !this.peers.size) return;
    this.send('all', { k: 'op', o: kind, p: payload });
  },
  // entidade de mentirinha que o convidado usa até o anfitrião confirmar
  fake(t, x, z, dir) { return { fake: true, type: t, x, z, dir, layer: t === 'esteira_alta' ? 1 : 0, pos: cellCenter(x, z), removed: false, name: '' }; },
  // janelas que ficam só com o anfitrião
  blocked(what) {
    if (this.role !== 'guest') return false;
    game.ui?.toast(`${what}: no multiplayer isso fica com o anfitrião 🙂`, 'warn');
    return true;
  },

  // ─── conexão ───
  // vazio = conexão direta P2P (padrão). Um ws:// ou wss:// = servidor de salas próprio (Render, PC)
  url() { const u = (settings.mpUrl || '').trim(); return u && u !== DEFAULT_SERVER && /^wss?:\/\//.test(u) ? u : ''; },
  open() {
    if (!this.url()) return openP2P((raw) => this.onRaw(raw), () => this.onClose());
    return new Promise((resolve, reject) => {
      let ws;
      try { ws = new WebSocket(this.url()); } catch (e) { reject(new Error('Endereço do servidor inválido')); return; }
      const to = setTimeout(() => { reject(new Error('O servidor não respondeu. Se ele estiver "dormindo" (plano grátis), espere uns 50 s e tente de novo.')); try { ws.close(); } catch { /* */ } }, 60000);
      ws.onopen = () => { clearTimeout(to); resolve(ws); };
      ws.onerror = () => { clearTimeout(to); reject(new Error('Não consegui conectar no servidor. Confira o endereço e a internet.')); };
      ws.onmessage = (ev) => this.onRaw(ev.data);
      ws.onclose = () => this.onClose();
    });
  },
  send(to, m) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify({ t: 'to', to, m })); },
  async host() {
    if (this.role) return;
    this.status = 'conectando…';
    this.ws = await this.open();
    this.ws.send(JSON.stringify({ t: 'host', name: myName() }));
  },
  async join(code) {
    if (this.role) return;
    this.status = 'conectando…';
    this.ws = await this.open();
    this.ws.send(JSON.stringify({ t: 'join', code, name: myName() }));
  },
  leave() {
    const wasGuest = this.role === 'guest';
    this.role = null;
    try { this.ws?.close(); } catch { /* */ }
    this.ws = null;
    for (const p of this.peers.values()) if (p.obj) game.scene.remove(p.obj);
    this.peers.clear();
    this.status = 'desconectado';
    document.body.classList.remove('mp-guest', 'mp-host');
    if (wasGuest) { game.skipSave = true; location.replace(location.pathname); } // volta pra sua fábrica
    game.emit('mp');
  },
  onClose() {
    if (!this.role) return;
    const guest = this.role === 'guest';
    game.ui?.toast(guest ? '🌐 A conexão com o anfitrião caiu. Voltando pra sua fábrica…' : '🌐 A conexão com o servidor caiu. Sua fábrica continua salva normalmente.', 'warn');
    if (guest) setTimeout(() => this.leave(), 2500); else this.leave();
  },

  onRaw(raw) {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'room') {
      this.role = 'host'; this.room = m.code; this.myId = m.id; this.status = 'anfitrião';
      document.body.classList.add('mp-host');
      game.ui?.toast(`🌐 Sala criada! Código: <b>${m.code}</b>. Mande pro seu amigo.`, 'ach');
      game.emit('mp');
    } else if (m.t === 'joined') {
      this.role = 'guest'; this.room = m.code; this.myId = m.id; this.hostId = m.host.id; this.status = 'convidado';
      this.peers.set(m.host.id, { name: m.host.name });
      for (const p of m.players) if (p.id !== m.id && !this.peers.has(p.id)) this.peers.set(p.id, { name: p.name });
      document.body.classList.add('mp-guest');
      game.skipSave = true;
      game.ui?.toast(`🌐 Entrou na sala de <b>${escH(m.host.name)}</b>. Carregando a fábrica…`, 'good');
      game.emit('mp');
    } else if (m.t === 'error') {
      this.status = 'desconectado';
      try { this.ws?.close(); } catch { /* */ }
      this.ws = null;
      game.ui?.toast('🌐 ' + escH(m.msg), 'warn');
      game.emit('mp');
    } else if (m.t === 'peer') {
      if (m.join) {
        this.peers.set(m.id, { name: m.name });
        game.ui?.toast(`🌐 <b>${escH(m.name)}</b> entrou na fábrica!`, 'good');
        audio.play('achievement', { volume: 0.5 });
        if (this.role === 'host') this.sendFull(m.id);
      } else if (m.leave) {
        const p = this.peers.get(m.id);
        if (p?.obj) game.scene.remove(p.obj);
        this.peers.delete(m.id);
        game.ui?.toast(`🌐 ${escH(m.name)} saiu.`);
      }
      game.emit('mp');
    } else if (m.t === 'closed') {
      game.ui?.toast('🌐 ' + escH(m.msg), 'warn');
    } else if (m.t === 'msg') this.onMsg(m.from, m.m);
  },

  onMsg(from, m) {
    if (!m || typeof m !== 'object') return;
    if (m.k === 'pos') return this.onPos(from, m);
    if (m.k === 'chat') return this.onChat(from, m);
    if (this.role === 'host') {
      if (m.k === 'req') return this.onRequest(from, m.a, m.p || {});
      if (m.k === 'needFull') return this.sendFull(from);
      return;
    }
    // convidado: só aceita o que vem do anfitrião
    if (from !== this.hostId) return;
    if (m.k === 'full') return this.applyFull(m.d);
    if (!this.ready) return;
    if (m.k === 'op') return this.applyOp(m.o, m.p || {});
    if (m.k === 'st') return this.applyStates(m.s);
    if (m.k === 'eco') return this.applyEco(m.d);
    if (m.k === 'sky') return loadSky(m.d);
    if (m.k === 'roster') return this.checkRoster(m);
    if (m.k === 'toast') return game.ui?.toast(escH(m.msg), m.warn ? 'warn' : '');
  },

  // ─── anfitrião ───
  sendFull(to) {
    const d = saveData();
    d.hostName = myName();
    this.send(to, { k: 'full', d });
  },
  onRequest(from, a, p) {
    const reply = (msg) => { if (msg) this.send(from, { k: 'toast', msg, warn: true }); };
    const who = this.peers.get(from)?.name || 'convidado';
    try { reply(HOST[a] ? HOST[a](p, who) : null); } catch (e) { console.warn('pedido do convidado falhou', a, e); reply('Não deu certo: ' + e.message); }
  },
  stateOf(e, a) {
    const d = e.serialize();
    if (d.items) d.items = d.items.map(([t, p, en]) => [t, Math.round(p * 100) / 100, en]);
    if (e.type === 'computador') {
      const code = d.code;
      delete d.code;
      if (this.codeSent.get(a) !== code) { d.code = code; this.codeSent.set(a, code); }
      d._run = e.running; d._cur = e.curLine; d._err = e.error; d._errL = e.errorLine; d._pa = e.paused;
      d._cons = e.console.slice(-14).map((c) => [c.text, c.kind]);
    } else if (e.queue) { d._st = e.status; d._w = e.job ? 1 : 0; d._wt = e.waiting ? 1 : 0; }
    return d;
  },
  hostTick(dt) {
    if (!this.peers.size) return;
    const T = this.t;
    T.st -= dt; T.eco -= dt; T.sky -= dt; T.roster -= dt;
    if (T.st <= 0) {
      T.st = 0.25;
      const changed = [], cur = new Map();
      for (const e of game.entities) {
        const a = addr(e);
        const s = this.stateOf(e, a);
        const j = JSON.stringify(s);
        cur.set(a, j);
        if (this.last.get(a) !== j) changed.push([a, s]);
        else if (s.code !== undefined) this.codeSent.delete(a); // não mandou: manda o código na próxima
      }
      this.last = cur;
      if (changed.length) this.send('all', { k: 'st', s: changed });
    }
    if (T.eco <= 0) {
      T.eco = 0.5;
      const e = game.economy.serialize();
      for (const k of ['series', 'libs', 'challenges', 'weekly', 'partners', 'netStore', 'daily', 'crates', 'diskChoice', 'tutorialStep', 'lastSeen']) delete e[k];
      const j = JSON.stringify(e);
      if (j !== this.lastEco) { this.lastEco = j; this.send('all', { k: 'eco', d: e }); }
    }
    if (T.sky <= 0) { T.sky = 3; this.send('all', { k: 'sky', d: serializeSky() }); }
    if (T.roster <= 0) {
      T.roster = 5;
      let h = 0;
      for (const e of game.entities) for (const ch of addr(e) + e.type) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
      this.send('all', { k: 'roster', n: game.entities.length, h });
    }
  },

  // ─── convidado: aplicar o que veio ───
  applyFull(d) {
    // 3.0: o planeta é gerado pela semente. Se o do anfitrião for outro, recarrega com a semente dele
    if (d.world && (d.world.seed !== world.seedText || d.world.start !== world.start)) {
      game.ui?.toast(`🌐 Gerando o planeta <b>${escH(d.world.seed)}</b> do anfitrião…`, 'good');
      setPendingJoin({ code: this.room, seed: d.world.seed, start: d.world.start, url: settings.mpUrl || '' });
      game.skipSave = true;
      setTimeout(() => location.reload(), 600);
      return;
    }
    this.applying = true;
    try {
      for (const e of [...game.entities]) removeEntity(e);
      for (const k of [...structures.keys()]) removeStructure(k);
      const eco = game.economy;
      d.economy.lastSeen = Date.now(); // sem progresso offline na cópia
      eco.load(d.economy);
      eco.offlineReport = null;
      loadStructures(d.structures);
      if (!this.ready && d.events?.veins) loadEvents({ veins: d.events.veins });
      for (const ed of d.entities || []) {
        if (!MACHINES[ed.type] && !DECOR[ed.type]) continue;
        try {
          const e = createEntity(ed.type, ed.x, ed.z, ed.dir || 0);
          e.load(ed);
          addEntity(e);
          if (ed.type === 'minerador') minerOres(ed.x, ed.z, false);
        } catch (err) { console.warn('entidade não veio', ed, err); }
      }
      loadWires(d.wires, grid, key, gridUp);
      for (const r of eco.regions) clearRegion(r);
      loadSky(d.sky);
      if (d.flora) loadFlora(d.flora);
      this.last.clear();
      if (!this.ready && d.player) game.player.teleport(new THREE.Vector3(d.player.x + 1.5, d.player.y || 0, d.player.z + 1.5), game.camera.rotation.y);
    } finally { this.applying = false; }
    this.ready = true;
    this.hostName = d.hostName || this.peers.get(this.hostId)?.name || 'anfitrião';
    game.ui?.updateStats(); game.ui?.renderHotbar(); game.ui?.renderObjective();
    game.ui?.toast(`🌐 Você está na fábrica de <b>${escH(this.hostName)}</b>. Tudo que você construir aparece pra todo mundo!`, 'ach');
    game.emit('mp');
  },
  applyOp(o, p) {
    this.applying = true;
    try {
      const b = game.builder;
      if (o === 'spawn') { if (!find(`${p.x},${p.z},${p.t === 'esteira_alta' ? 1 : 0}`)) b.spawn(p.t, p.x, p.z, p.dir, p.d); }
      else if (o === 'despawn') { const e = find(p.a); if (e) b.despawn(e); }
      else if (o === 'rotate') { const e = find(p.a); if (e) { e.dir = p.dir; e.obj.rotation.y = -p.dir * Math.PI / 2; game.emit('moved', e); refreshBeltsAround(e.x, e.z); } }
      else if (o === 'wire') { const A = find(p.a), B = find(p.b); if (A && B) connect(A, B); }
      else if (o === 'unwire') { const A = find(p.a), B = find(p.b); if (A && B) disconnect(A, B); }
      else if (o === 'unwireAll') { const e = find(p.a); if (e) disconnectAll(e); }
      else if (o === 'struct') { if (!structures.has(p.d.key)) addStructure(p.d); }
      else if (o === 'unstruct') { if (structures.has(p.k)) removeStructure(p.k); }
      else if (o === 'paint') { const s = structures.get(p.k); if (s) paintStructure(s, p.paint); }
      else if (o === 'painting') { if (!structures.has(p.d.key)) addPainting(p.d); }
      else if (o === 'flora') removeFlora(p.id, true);
    } catch (e) { console.warn('op do anfitrião falhou', o, e); } finally { this.applying = false; }
  },
  applyStates(list) {
    this.applying = true;
    try {
      for (const [a, d] of list) {
        const e = find(a);
        if (!e || e.type !== d.type) continue;
        applyState(e, d);
      }
    } finally { this.applying = false; }
  },
  applyEco(d) {
    const e = game.economy;
    const newRegions = (d.regions || []).filter((r) => !e.regions.includes(r));
    for (const k of Object.keys(d)) if (k !== 'sat') e[k] = d[k];
    e.stats = { ...e.stats, ...d.stats };
    if (d.sat) for (const [k, v] of Object.entries(d.sat)) if (e.market[k]) e.market[k].sat = v;
    for (const r of newRegions) clearRegion(r);
    game.emit('money'); game.emit('xp'); game.emit('inventory'); game.emit('materials');
    this.objT = (this.objT || 0) + 1;
    if (this.objT % 2 === 0) game.ui?.renderObjective();
  },
  checkRoster(m) {
    let h = 0;
    for (const e of game.entities) for (const ch of addr(e) + e.type) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
    if (h !== m.h || game.entities.length !== m.n) {
      // algo se perdeu no caminho: pede a fábrica de novo
      if (!this.askedFull || performance.now() - this.askedFull > 8000) { this.askedFull = performance.now(); this.send('host', { k: 'needFull' }); }
    }
  },

  // o convidado não simula a fábrica: só anima o que o anfitrião mandou (esteiras andando, luzes)
  guestStep(dt) {
    game.time += dt;
    game.economy.marketTime += dt;
    this.powerT = (this.powerT || 0) - dt;
    if (this.powerT <= 0) { this.powerT = 0.5; updatePower(true); }
    const bs = game.economy.beltSpeed;
    for (const e of game.entities) {
      if (e.items) {
        const v = bs * (BELT_TIERS[e.type] || 1) * dt;
        for (let i = 0; i < e.items.length; i++) {
          const it = e.items[i];
          const lim = i === 0 ? 1 : e.items[i - 1].p - SPACING;
          if (it.p < lim) it.p = Math.min(it.p + v, lim);
          e.placeItem(it);
        }
        if (e.flash !== undefined) e.flash -= dt;
      } else if (e.type === 'computador') {
        e.noPower = powerRatio(e) <= 0;
        e.animate(dt);
        e.screenTimer -= dt;
        if (e.dirty && e.screenTimer <= 0 && e.pos.distanceTo(game.camera.position) < 30) { e.drawScreen(); e.dirty = false; e.screenTimer = 0.2; }
      } else if (['lampada', 'tela', 'poste'].includes(e.type) || (!e.queue && e.update && !e.items)) {
        if (e.queue) e.noPower = powerRatio(e) <= 0;
        try { e.update(dt); } catch { /* visual */ }
      } else if (e.animate) {
        if (usesPower(e)) e.noPower = powerRatio(e) <= 0;
        e.animate(dt);
      }
    }
    for (const d of game.drones || []) { d.obj.position.copy(d.p); d.obj.userData.rotors?.forEach((r) => { r.rotation.y += dt * 40; }); if (d.cargo) d.cargo.mesh.position.set(d.p.x, d.p.y - 0.45, d.p.z); }
  },

  // ─── jogadores (bonequinhos) ───
  onPos(from, m) {
    let p = this.peers.get(from);
    if (!p) { p = { name: m.n || '?' }; this.peers.set(from, p); }
    if (!p.obj) {
      const g = new THREE.Group();
      const body = cloneModel('d_astronaut');
      body.rotation.y = Math.PI;
      g.add(body);
      const lab = makeLabel(p.name);
      lab.position.y = 2.05;
      lab.scale.multiplyScalar(1.2);
      g.add(lab);
      g.position.set(m.x, 0, m.z);
      game.scene.add(g);
      p.obj = g;
      p.target = new THREE.Vector3(m.x, 0, m.z);
    }
    p.target.set(m.x, Math.max(0, (m.y || 1.62) - 1.62), m.z);
    p.yaw = m.yaw;
    p.seen = performance.now();
  },
  onChat(from, m) {
    const name = this.peers.get(from)?.name || m.n || '?';
    const text = String(m.text || '').slice(0, 160);
    this.chat.push({ name, text });
    if (this.chat.length > 40) this.chat.shift();
    game.ui?.toast(`💬 <b>${escH(name)}</b>: ${escH(text)}`);
    audio.play('beep', { volume: 0.4 });
    game.emit('mpChat');
  },
  say(text) {
    text = String(text).trim().slice(0, 160);
    if (!text || !this.role) return;
    this.send('all', { k: 'chat', text, n: myName() });
    this.chat.push({ name: myName() + ' (você)', text });
    game.emit('mpChat');
  },
  update(dt) {
    if (!this.role) return;
    if (this.role === 'host') this.hostTick(dt);
    this.t.pos -= dt;
    if (this.t.pos <= 0 && this.ws) {
      this.t.pos = 0.1;
      const c = game.camera.position;
      this.send('all', { k: 'pos', x: +c.x.toFixed(2), y: +c.y.toFixed(2), z: +c.z.toFixed(2), yaw: +game.camera.rotation.y.toFixed(2), n: myName() });
    }
    for (const p of this.peers.values()) {
      if (!p.obj) continue;
      p.obj.position.lerp(p.target, Math.min(1, dt * 10));
      let d = (p.yaw || 0) - p.obj.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      p.obj.rotation.y += d * Math.min(1, dt * 10);
    }
  },
};
game.mp = mp;

// aplica o estado de uma entidade que veio do anfitrião
function applyState(e, d) {
  if (d.dir !== undefined && d.dir !== e.dir) {
    e.dir = d.dir;
    e.obj.rotation.y = -d.dir * Math.PI / 2;
    game.emit('moved', e);
    refreshBeltsAround(e.x, e.z);
  }
  const s = { ...d };
  if (s.name === e.name) delete s.name;               // evita redesenhar a plaquinha à toa
  if ((s.tier || 0) === (e.tier || 0)) delete s.tier;
  if (e.items) { for (const it of e.items) releaseItemMesh(it.mesh); e.items = []; }
  if (e.held && s.held !== undefined) { releaseItemMesh(e.held.mesh); e.held = null; }
  if (e.drone?.cargo) { releaseItemMesh(e.drone.cargo.mesh); e.drone.cargo = null; }
  if (e.type === 'computador' && s.code === undefined) s.code = e.code;
  e.load(s);
  if (e.type === 'computador') {
    e.running = !!d._run; e.curLine = d._cur || 0; e.error = d._err || null; e.errorLine = d._errL || null; e.paused = !!d._pa;
    if (d._cons) e.console = d._cons.map(([text, kind]) => ({ text, kind, t: game.time }));
    e.lastYield = d._run ? 'step' : null;
    e.dirty = true;
  } else if (e.queue) {
    e.status = d._st || e.status;
    e.job = d._w ? GUEST_JOB : null;
    e.waiting = !!d._wt;
    if (e.job) GUEST_JOB.label = d._st;
  }
}

// dados que vêm de um convidado: tira < > " ' ` dos textos (menos o código Jiboia) e o que não se ganha de graça
function cleanGuestData(d) {
  const strip = (v, k) => {
    if (typeof v === 'string') return k === 'code' ? v.slice(0, 20000) : v.replace(/[<>"'`&]/g, '').slice(0, 200);
    if (Array.isArray(v)) return v.slice(0, 500).map((x) => strip(x, k));
    if (v && typeof v === 'object') { const o = {}; for (const [kk, x] of Object.entries(v)) if (kk !== '__proto__') o[kk.replace(/[<>"'`&]/g, '')] = strip(x, kk); return o; }
    return v;
  };
  const o = strip(d, '');
  delete o.tier; delete o.hw; delete o.inv; delete o.out; delete o.items; delete o.progress; delete o.held; delete o.stars; // melhorias e itens não vêm de graça
  if (o.name && !/^[\wÀ-ɏ-]{1,20}$/.test(o.name)) delete o.name;
  o.running = false;
  return o;
}

// ─── o que o anfitrião faz com cada pedido de um convidado ───
// retorna um texto (aviso pro convidado) quando não deu
const HOST = {
  spawn(p) {
    const b = game.builder, eco = game.economy;
    if (!MACHINES[p.t] && !DECOR[p.t]) return 'Peça desconhecida';
    const why = b.cellValid(p.x, p.z, p.t);
    if (why && why !== 'Você está em cima!') return why;
    if (!eco.takeItem(p.t)) {
      const def = MACHINES[p.t] || DECOR[p.t];
      if (def.fichas) return `Falta ${def.nome}`;
      if (!eco.spend(def.preco || 0)) return `Falta ${def.nome} e dinheiro pra comprar`;
    }
    const d = p.d && typeof p.d === 'object' ? cleanGuestData(p.d) : null;
    b.spawn(p.t, p.x, p.z, [0, 1, 2, 3].includes(p.dir) ? p.dir : 0, d);
  },
  despawn(p) { const e = find(p.a); if (!e || e.isPlatform) return; game.builder.despawn(e); game.economy.addItem(e.type); },
  rotate(p) { const e = find(p.a); if (e) game.builder.rotateEntity(e); },
  wire(p) { const A = find(p.a), B = find(p.b); if (!A || !B) return 'A máquina sumiu'; return connect(A, B); },
  unwire(p) { const A = find(p.a), B = find(p.b); if (A && B) disconnect(A, B); },
  unwireAll(p) { const e = find(p.a); if (e) disconnectAll(e); },
  struct(p) {
    const d = p.d || {};
    if (typeof d.key !== 'string' || !/^[a-z]:[-\d,a-z]+$/.test(d.key)) return 'Peça inválida';
    if (structures.has(d.key)) return 'Já tem uma peça aqui';
    if (!MATERIALS[d.mat]) return 'Material inválido';
    if (!game.economy.pay(pieceCost(d.piece, d.mat))) return 'Faltam itens';
    addStructure({ key: d.key, piece: d.piece, mat: d.mat, paint: null, x: d.x, z: d.z, o: d.o, h: d.h });
  },
  unstruct(p) {
    const s = structures.get(p.k);
    if (!s) return;
    if (s.kind === 'quadro') game.economy.addItem(s.painting);
    else game.economy.refund(pieceCost(s.piece, s.mat));
    removeStructure(p.k);
  },
  paint(p) { const s = structures.get(p.k); if (!s) return; if (p.paint != null && !game.economy.spend(PAINT_PRICE)) return 'Sem dinheiro pra tinta'; paintStructure(s, p.paint); },
  painting(p) { const d = p.d || {}; if (!PAINTINGS[d.painting] || typeof d.key !== 'string' || !/^p:e:[-\d,a-z]+:-?1$/.test(d.key) || structures.has(d.key)) return; if (!game.economy.takeItem(d.painting)) return 'Falta o quadro'; addPainting(d); },
  // economia compartilhada
  buy(p) {
    const d = MACHINES[p.k] || DECOR[p.k] || PAINTINGS[p.k];
    const n = Math.max(1, Math.min(50, p.n | 0));
    if (!d) return;
    if (d.nivel && game.ui.lockReason(d)) return 'Ainda bloqueado';
    if (d.fichas) { if (!game.economy.spendTokens(d.fichas * n)) return 'Fichas insuficientes'; }
    else if (!game.economy.spend(d.preco * n)) return 'Dinheiro insuficiente';
    game.economy.addItem(p.k, n);
  },
  upgrade(p) {
    const u = UPGRADES[p.k], eco = game.economy;
    if (!u) return;
    const lvl = eco.upgrades[p.k];
    if (lvl >= u.precos.length || u.niveis[lvl] > eco.level) return 'Não dá pra melhorar agora';
    if (!eco.spend(u.precos[lvl])) return 'Dinheiro insuficiente';
    eco.upgrades[p.k]++;
    game.ui.updateStats();
  },
  buyMat(p) {
    const mk = Object.keys(MATERIALS).find((m) => MATERIALS[m].item === p.item);
    const n = Math.max(1, Math.min(50, p.n | 0));
    if (!mk) return;
    if (!game.economy.spend(MATERIAL_SHOP[mk] * n)) return 'Dinheiro insuficiente';
    game.economy.materials[p.item] = (game.economy.materials[p.item] || 0) + n;
    game.emit('materials');
  },
  region(p) {
    const r = REGIONS[p.id], eco = game.economy;
    if (!r || eco.hasRegion(p.id)) return;
    if (eco.level < r.nivel) return `Precisa do nível ${r.nivel}`;
    if (!eco.spend(r.preco)) return 'Dinheiro insuficiente';
    eco.regions.push(p.id);
    game.emit('region', p.id);
  },
  contract(p) { return acceptContract(p.id); },
  uncontract(p) { cancelContract(p.id); },
  research(p) { const e = find(p.a); if (e?.type === 'laboratorio') return e.setResearch(p.id); },
  tier(p) {
    const e = find(p.a), eco = game.economy;
    if (!e) return;
    const next = TIERS[(e.tier || 0) + 1];
    if (!next || (next.tech && !eco.hasTech(next.tech))) return 'Precisa da pesquisa';
    if (!eco.pay(next.custo || {})) return 'Faltam itens pra melhorar';
    e.setTier((e.tier || 0) + 1);
    game.emit('power');
  },
  rename(p) {
    const e = find(p.a), v = String(p.n || p.name || '').trim();
    if (!e || !/^[\wÀ-ɏ-]{1,20}$/.test(v)) return 'Nome inválido';
    if (game.entities.some((o) => o !== e && o.name === v)) return 'Já existe uma máquina com esse nome';
    e.rename(v);
  },
  panelAct(p) {
    const e = find(p.a);
    if (!e) return;
    // 3.0: painel novo das máquinas (receita, colocar/tirar itens, liga/desliga)
    if (p.act === 'recipe') return e.setRecipe?.(String(p.v)) === false ? 'Receita bloqueada' : null;
    if (p.act === 'insert') return e.insertFromPlayer?.(String(p.v), Math.max(1, Math.min(9999, p.n | 0))) ? null : 'Não coube';
    if (p.act === 'back') { e.takeInput?.(String(p.v)); return; }
    if (p.act === 'take') { e.takeOutput?.(); return; }
    if (p.act === 'power') { togglePower(e); return; }
    const a = e?.panelActions?.()[p.i]; if (a && !a.disabled) a.fn();
  },
  // 3.0: coleta, bancada e marcos (o inventário é um só, o do anfitrião)
  give(p) {
    const n = Math.max(1, Math.min(8, p.n | 0));
    if (!ITEMS[p.item]) return;
    if (!game.economy.give(p.item, n)) return 'Inventário cheio!';
    game.economy.produced?.(p.item, n);
  },
  collect(p) { if (Number.isInteger(p.id)) removeFlora(p.id); },
  craft(p) { if (HAND[p.k]) return craftOnce(p.k) ? null : 'Faltam itens'; },
  milestone(p) { return game.economy.payMilestone(String(p.id)); },
  code(p) { const e = find(p.a); if (e?.type === 'computador' && typeof p.code === 'string') e.code = p.code.slice(0, 20000); },
  run(p) { const e = find(p.a); if (e?.type !== 'computador') return; if (typeof p.code === 'string') e.code = p.code.slice(0, 20000); e.run(); },
  stop(p) { const e = find(p.a); if (e?.type === 'computador') e.stop(); },
  hw(p) { const e = find(p.a); if (e?.type === 'computador') return e.hwUpgrade(p.k); },
  bp(p) { const e = find(p.a); if (e?.type === 'computador' && Number.isInteger(p.line)) e.toggleBreak(p.line); },
  launch() { game.platform?.launch(); },
  mission(p) { return game.platform?.chooseMission(p.sat); },
  unmission() { const m = game.economy.mission; m.sat = null; m.progress = {}; game.platform?.buildRocket(); },
};

// ─── janela 🌐 Multiplayer ───
export function renderMultiplayer(el) {
  const players = [{ name: myName() + ' (você)', host: mp.role === 'host' }, ...[...mp.peers.entries()].map(([id, p]) => ({ name: p.name, host: id === mp.hostId }))];
  el.innerHTML = `
  <div class="mp-win">
    <div class="card-x"><div class="card-h"><span>// jogar junto na mesma fábrica</span><b>${mp.role === 'host' ? `anfitrião · sala ${mp.room}` : mp.role === 'guest' ? `convidado · sala ${mp.room}` : 'desconectado'}</b></div>
      <p style="margin-top:0">Até <b>4 pessoas</b> constroem a <b>mesma fábrica</b> ao mesmo tempo. O <b>anfitrião</b> é quem tem a fábrica: o jogo dele roda tudo e salva. Os convidados veem e mexem em tudo junto (dinheiro, peças e pesquisas são compartilhados), e a fábrica deles fica guardada esperando.</p>
      <div class="row"><label class="fr-name">Seu nome <input id="mp-name" maxlength="24" value="${escH(settings.nome || '')}" placeholder="Jogador(a)" ${mp.role ? 'disabled' : ''}></label></div>
    </div>
    ${mp.role ? `
    <div class="fr-cols">
      <div class="card-x"><div class="card-h"><span>// ${mp.role === 'host' ? 'código da sala' : 'sala'}</span></div>
        <div class="mp-code">${mp.room}</div>
        <p class="muted" style="margin:6px 0">${mp.role === 'host' ? 'Mande esse código pro seu amigo. Ele abre o jogo, vai em 🌐 Jogar junto e digita o código.' : `Você está na fábrica de <b>${escH(mp.hostName || '…')}</b>.`}</p>
        <div class="row">${mp.role === 'host' ? '<button id="mp-copy">📋 Copiar código</button>' : ''}<button id="mp-leave" class="danger">${mp.role === 'host' ? 'Fechar a sala' : 'Sair e voltar pra minha fábrica'}</button></div></div>
      <div class="card-x"><div class="card-h"><span>// jogadores (${players.length}/4)</span></div>
        <div class="mp-players">${players.map((p) => `<div>${p.host ? '👑' : '🧑‍🚀'} ${escH(p.name)}</div>`).join('')}</div></div>
    </div>
    <div class="card-x"><div class="card-h"><span>// conversa</span></div>
      <div class="mp-chat" id="mp-chat">${mp.chat.map((c) => `<div><b>${escH(c.name)}:</b> ${escH(c.text)}</div>`).join('') || '<span class="muted">Diga oi! 👋</span>'}</div>
      <div class="row"><input id="mp-say" maxlength="160" placeholder="Escreva e aperte Enter"><button id="mp-send">Enviar</button></div></div>`
    : `
    <div class="fr-cols">
      <div class="card-x"><div class="card-h"><span>// criar uma sala (você é o anfitrião)</span></div>
        <p class="muted" style="margin-top:0">Usa a <b>sua fábrica atual</b>. Ela continua salvando normalmente.</p>
        <button id="mp-host" class="primary">🌐 Criar sala</button></div>
      <div class="card-x"><div class="card-h"><span>// entrar na sala de um amigo</span></div>
        <div class="row"><input id="mp-join-code" maxlength="5" placeholder="CÓDIGO" style="text-transform:uppercase;letter-spacing:.2em;width:110px"><button id="mp-join" class="primary">Entrar</button></div>
        <p class="muted" style="margin:6px 0 0">A sua fábrica fica salva e esperando; ao sair, você volta pra ela.</p></div>
    </div>
    <details class="card-x"><summary>⚙️ Conexão: ${mp.url() ? 'servidor próprio' : 'direta (P2P), sem servidor'}</summary>
      <p class="muted">Por padrão os PCs se ligam <b>direto</b> (pela internet ou na mesma rede): não precisa instalar nem subir nada. Se a sua rede bloquear (algumas redes de escola/empresa), dá pra usar um <b>servidor de salas próprio</b> (pasta <code>servidor-online</code>, no Render ou no seu PC): cole o endereço <code>wss://…</code> aqui. Deixe vazio pra conexão direta. Os dois jogadores precisam usar o mesmo.</p>
      <div class="row"><input id="mp-url" value="${escH(mp.url())}" placeholder="vazio = conexão direta" style="flex:1"><button id="mp-url-save">Salvar</button></div>
    </details>`}
    <p class="muted" id="mp-status">${escH(mp.status)}</p>
  </div>`;
  const $ = (s) => el.querySelector(s);
  el.querySelectorAll('input').forEach((i) => i.addEventListener('keydown', (e) => e.stopPropagation()));
  const nm = $('#mp-name');
  if (nm) nm.onchange = () => { settings.nome = nm.value.trim().slice(0, 24); saveSettings(); };
  const busy = (b, fn) => async () => {
    b.disabled = true;
    $('#mp-status').textContent = mp.url() ? 'conectando no servidor… (se ele estava dormindo, pode levar até 1 minuto)' : 'conectando…';
    try { await fn(); } catch (e) { game.ui.toast('🌐 ' + escH(e.message), 'warn'); mp.status = 'desconectado'; }
    renderMultiplayer(el);
  };
  if ($('#mp-host')) $('#mp-host').onclick = busy($('#mp-host'), () => mp.host());
  if ($('#mp-join')) $('#mp-join').onclick = busy($('#mp-join'), () => { const c = $('#mp-join-code').value.trim().toUpperCase(); if (c.length !== 5) throw new Error('O código tem 5 letras'); return mp.join(c); });
  if ($('#mp-url-save')) $('#mp-url-save').onclick = () => { settings.mpUrl = $('#mp-url').value.trim(); saveSettings(); game.ui.toast('Servidor salvo'); };
  if ($('#mp-copy')) $('#mp-copy').onclick = () => navigator.clipboard?.writeText(mp.room).then(() => game.ui.toast('Código copiado! 📋', 'good'));
  if ($('#mp-leave')) $('#mp-leave').onclick = () => { if (confirm(mp.role === 'host' ? 'Fechar a sala? Os convidados voltam pras fábricas deles.' : 'Sair da sala e voltar pra sua fábrica?')) { mp.leave(); renderMultiplayer(el); } };
  const say = () => { const i = $('#mp-say'); mp.say(i.value); i.value = ''; renderMultiplayer(el); setTimeout(() => el.querySelector('#mp-say')?.focus(), 10); };
  if ($('#mp-send')) $('#mp-send').onclick = say;
  if ($('#mp-say')) $('#mp-say').addEventListener('keydown', (e) => { if (e.key === 'Enter') say(); });
  const ch = $('#mp-chat'); if (ch) ch.scrollTop = ch.scrollHeight;
}
void CELL; void TECHS;
