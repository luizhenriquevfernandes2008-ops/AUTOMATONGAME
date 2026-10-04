// Editor de código dos computadores: realce, autocompletar, depurador e bibliotecas.
import { game } from './state.js';
import { EXAMPLES, MACHINES, ITEMS, TECHS, PC_UPGRADES } from './data.js';
import { manualHTML } from './docs.js';
import { guideHTML } from './guide.js';
import { parse, JiboiaError } from './lang/jiboia.js';
import { settings, saveSettings } from './settings.js';

const PY_KW = ['if', 'elif', 'else', 'while', 'for', 'in', 'def', 'return', 'break', 'continue', 'pass', 'and', 'or', 'not', 'is', 'global', 'True', 'False', 'None'];
const PT_KW = ['se', 'senaose', 'senao', 'enquanto', 'para', 'em', 'funcao', 'retorne', 'pare', 'continuar', 'passe', 'nao', 'Verdadeiro', 'Falso', 'Nada'];
const KW = new Set(PY_KW.concat(PT_KW).filter((w) => !['True', 'False', 'None', 'Verdadeiro', 'Falso', 'Nada'].includes(w)));
const CONSTS = new Set(['True', 'False', 'None', 'Verdadeiro', 'Falso', 'Nada']);
const GAME_FUNCS = ['maquina', 'maquinas', 'esperar', 'tempo', 'dinheiro', 'nivel', 'preco', 'itens', 'apitar', 'eu', 'energia',
  'enviar', 'receber', 'tem_mensagem', 'compartilhar', 'ler', 'ouvir', 'esperar_evento', 'esperar_ate', 'importar',
  'contratos', 'fichas', 'estrelas', 'anunciar', 'contar', 'media', 'unicos', 'mais_caro', 'maior_chave', 'faltando', 'relatorio', 'inverter', 'chance'];
const STD_FUNCS = ['print', 'escrever', 'mostrar', 'len', 'tamanho', 'range', 'intervalo', 'str', 'texto', 'int', 'inteiro', 'float', 'decimal', 'bool',
  'abs', 'round', 'arredondar', 'min', 'max', 'sum', 'soma', 'list', 'lista', 'dict', 'sorted', 'ordenado', 'aleatorio', 'randint', 'random', 'tipo', 'type'];
const BUILTINS = new Set(GAME_FUNCS.concat(STD_FUNCS));
// métodos que aparecem depois do "."
const METHODS = ['minerar', 'minerio', 'fundir', 'receitas', 'fabricar', 'pode_fabricar', 'vender', 'preco', 'esperar_item', 'enviar', 'item', 'retirar',
  'quantidade', 'estoque', 'saida', 'ocupada', 'status', 'energia', 'producao', 'consumo', 'pesquisa', 'progresso', 'faltando', 'pesquisar', 'drone',
  'ir', 'ir_para', 'voltar', 'pegar', 'soltar', 'carga', 'posicao', 'ocupado', 'embaixo', 'ligar', 'desligar', 'cor', 'piscar', 'ligada', 'escrever',
  'mostrar', 'limpar', 'titulo', 'grafico', 'tocar', 'som', 'contagem', 'ultimo', 'zerar', 'combustivel', 'ligado', 'destruidos', 'nome', 'tipo', 'entregues', 'aceita',
  'mover', 'segurando', 'atras', 'frente', 'movidos', 'dizer', 'pular', 'seguir', 'ficar', 'colher', 'humor', 'amizade',
  'append', 'pop', 'insert', 'remove', 'index', 'count', 'sort', 'reverse', 'copy', 'keys', 'values', 'items', 'get', 'upper', 'lower', 'split', 'strip',
  'replace', 'startswith', 'endswith', 'join', 'find'];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function highlight(src) {
  const re = /(#.*$)|([fF]?"(?:[^"\\]|\\.)*"?|[fF]?'(?:[^'\\]|\\.)*'?)|(\b\d+\.?\d*\b)|(\.[A-Za-z_À-ɏ][\wÀ-ɏ]*)|([A-Za-z_À-ɏ][\wÀ-ɏ]*)|([^#"'\w.]+|.)/gm;
  let out = '', m, prevDef = false;
  while ((m = re.exec(src))) {
    if (m[0] === '') { re.lastIndex++; continue; }
    if (m[1]) out += `<span class="t-com">${esc(m[1])}</span>`;
    else if (m[2]) out += `<span class="t-str">${esc(m[2])}</span>`;
    else if (m[3]) out += `<span class="t-num">${m[3]}</span>`;
    else if (m[4]) out += `.<span class="t-meth">${esc(m[4].slice(1))}</span>`;
    else if (m[5]) {
      const w = m[5];
      if (prevDef) out += `<span class="t-def">${w}</span>`;
      else if (KW.has(w)) out += `<span class="t-kw">${w}</span>`;
      else if (CONSTS.has(w)) out += `<span class="t-const">${w}</span>`;
      else if (BUILTINS.has(w)) out += `<span class="t-fn">${w}</span>`;
      else out += esc(w);
      prevDef = w === 'def' || w === 'funcao';
      continue;
    } else out += esc(m[6]);
    if (!/^\s*$/.test(m[0])) prevDef = false;
  }
  return out + '\n';
}

export class Editor {
  constructor() {
    this.el = document.getElementById('editor');
    this.ta = this.el.querySelector('#code');
    this.hl = this.el.querySelector('#code-hl');
    this.gutter = this.el.querySelector('#gutter');
    this.execLine = this.el.querySelector('#exec-line');
    this.errLine = this.el.querySelector('#err-line');
    this.consoleEl = this.el.querySelector('#console');
    this.status = this.el.querySelector('#ed-status');
    this.title = this.el.querySelector('#ed-title');
    this.lint = this.el.querySelector('#ed-lint');
    this.ac = this.el.querySelector('#ac');
    this.acItems = [];
    this.acSel = 0;
    this.pc = null;
    this.lineH = 21;
    this.tab = 'console';
    this.lib = 'util';
    this.charW = 8.4;

    this.ta.addEventListener('input', () => { this.onInput(); this.autocomplete(); });
    this.ta.addEventListener('scroll', () => { this.syncScroll(); this.hideAc(); });
    this.ta.addEventListener('keydown', (e) => this.onKey(e));
    this.ta.addEventListener('blur', () => setTimeout(() => this.hideAc(), 150));
    this.ta.addEventListener('click', () => this.hideAc());
    this.gutter.addEventListener('mousedown', (e) => {
      const l = e.target.closest('.gl');
      if (!l || !this.pc) return;
      e.preventDefault();
      this.pc.toggleBreak(+l.dataset.l);
      this.renderGutter();
    });
    const $ = (s) => this.el.querySelector(s);
    $('#ed-run').onclick = () => this.run();
    $('#ed-stop').onclick = () => { this.pc && this.pc.stop(); this.refresh(); };
    $('#ed-close').onclick = () => game.ui.closeOverlay();
    $('#ed-pause').onclick = () => { this.pc?.pause(); this.showTab('depurar'); };
    $('#ed-step').onclick = () => { this.pc?.step(); this.showTab('depurar'); };
    $('#ed-resume').onclick = () => { this.pc?.resume(); };
    const acBox = $('#ed-ac-toggle');
    acBox.checked = settings.autocomplete !== false;
    acBox.onchange = () => { settings.autocomplete = acBox.checked; saveSettings(); if (!acBox.checked) this.hideAc(); };
    const sel = $('#ed-examples');
    EXAMPLES.forEach((ex, i) => { const o = document.createElement('option'); o.value = i; o.textContent = ex.nome; sel.appendChild(o); });
    sel.onchange = () => {
      const ex = EXAMPLES[+sel.value];
      sel.value = '';
      if (!ex || !this.pc) return;
      if (this.ta.value.trim() && !confirm('Substituir o código atual pelo exemplo "' + ex.nome + '"?')) return;
      this.ta.value = ex.code;
      this.onInput();
    };
    this.el.querySelectorAll('.ed-tab').forEach((b) => { b.onclick = () => this.showTab(b.dataset.tab); });
    game.on('console', (pc) => { if (pc === this.pc && this.tab === 'console') this.renderConsole(); });
    game.on('computer', (pc) => { if (pc === this.pc) { this.refresh(); if (pc.paused && this.tab !== 'depurar') this.showTab('depurar'); } });
    // mede a largura de um caractere da fonte do código
    const c = document.createElement('canvas').getContext('2d');
    c.font = '14px "JetBrains Mono", monospace';
    document.fonts.ready.then(() => { this.charW = c.measureText('MMMMMMMMMM').width / 10 || 8.4; });
  }

  open(pc) {
    this.pc = pc;
    this.ta.value = pc.code;
    this.title.textContent = '🐍 ' + pc.name;
    this.onInput();
    this.showTab(this.tab);
    this.refresh();
    game.emit('editorOpen', pc);
    setTimeout(() => this.ta.focus(), 50);
  }

  close() {
    if (this.pc) {
      this.pc.code = this.ta.value;
      game.mp?.guestRpc('code', { a: this.pc.addr, code: this.pc.code }); // multiplayer: guarda o código no anfitrião
    }
    this.pc = null;
    this.hideAc();
  }

  showTab(t) {
    this.tab = t;
    this.el.querySelectorAll('.ed-tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === t));
    const side = this.el.querySelector('#ed-side');
    if (t === 'console') { side.innerHTML = ''; side.appendChild(this.consoleEl); this.renderConsole(); }
    else if (t === 'manual') { side.innerHTML = manualHTML(game.economy.level); }
    else if (t === 'guia') { side.innerHTML = guideHTML(); }
    else if (t === 'maquinas') this.renderMachines(side);
    else if (t === 'depurar') this.renderDebug(side);
    else if (t === 'libs') this.renderLibs(side);
    else if (t === 'hardware') this.renderHardware(side);
  }

  renderMachines(side) {
    const list = game.entities.filter((e) => e.isMachine && e.name).concat(game.drones || []);
    side.innerHTML = `<div class="doc"><h3>Suas máquinas</h3><p>Clique pra inserir <code>maquina("nome")</code> no código.</p>
      <div class="mlist">${list.map((e) => `<button class="mitem" data-n="${e.name}"><b>${e.name}</b><span>${MACHINES[e.type]?.nome || 'Drone'}</span></button>`).join('') || '<i>Nenhuma máquina ainda.</i>'}</div></div>`;
    side.querySelectorAll('.mitem').forEach((b) => { b.onclick = () => this.insert(`maquina("${b.dataset.n}")`); });
  }

  // ─── depurador ───
  renderDebug(side) {
    side = side || this.el.querySelector('#ed-side');
    const pc = this.pc;
    if (!pc) return;
    const v = pc.vars();
    const rows = (l) => l.map(([k, x]) => `<tr><td><code>${esc(k)}</code></td><td class="dbg-v">${esc(String(x)).slice(0, 160)}</td></tr>`).join('') || '<tr><td colspan="2" class="muted">—</td></tr>';
    side.innerHTML = `<div class="doc dbg">
      <h3>Depurador</h3>
      <p class="muted">Clique no número de uma linha pra marcar um <b style="color:var(--bad)">● breakpoint</b>: o programa pausa antes de rodar ela. Use <b>⏭ Passo</b> pra rodar uma instrução por vez.</p>
      <div class="dbg-state">${pc.running ? (pc.paused ? `⏸ pausado na linha <b>${pc.curLine}</b>` : `▶ rodando (linha ${pc.curLine})`) : '■ parado'} · breakpoints: ${[...pc.breakpoints].sort((a, b) => a - b).join(', ') || 'nenhum'}</div>
      <h3>Variáveis globais</h3><table>${rows(v.globais)}</table>
      <h3>Variáveis da função atual</h3><table>${rows(v.locais)}</table>
      ${pc.breakpoints.size ? '<button id="dbg-clear" class="danger">Limpar breakpoints</button>' : ''}
    </div>`;
    const b = side.querySelector('#dbg-clear');
    if (b) b.onclick = () => { pc.breakpoints.clear(); this.renderGutter(); this.renderDebug(); };
  }

  // ─── bibliotecas ───
  renderLibs(side) {
    const libs = game.economy.libs;
    if (!libs[this.lib]) this.lib = Object.keys(libs)[0] || null;
    side.innerHTML = `<div class="doc libs">
      <h3>Bibliotecas de funções</h3>
      <p class="muted">Escreva funções aqui uma vez e use em qualquer computador com <code>importar("nome")</code>.</p>
      <div class="lib-list">${Object.keys(libs).map((n) => `<button class="lib-b ${n === this.lib ? 'active' : ''}" data-n="${n}">${n}</button>`).join('')}
        <button id="lib-new">+ nova</button></div>
      ${this.lib ? `<textarea id="lib-code" spellcheck="false" wrap="off">${esc(libs[this.lib])}</textarea>
      <div class="lib-foot"><span id="lib-lint" class="muted"></span><span class="grow"></span>
        <button id="lib-insert">Inserir importar("${this.lib}")</button><button id="lib-del" class="danger">Apagar</button></div>` : ''}
    </div>`;
    side.querySelectorAll('.lib-b').forEach((b) => { b.onclick = () => { this.lib = b.dataset.n; this.renderLibs(side); }; });
    side.querySelector('#lib-new').onclick = () => {
      const n = (prompt('Nome da biblioteca (letras, números e _):') || '').trim();
      if (!/^[A-Za-z_][\w]*$/.test(n)) return;
      if (!libs[n]) libs[n] = `# Biblioteca "${n}"\n\ndef minha_funcao():\n    print("olá da biblioteca ${n}")\n`;
      this.lib = n;
      this.renderLibs(side);
    };
    const ta = side.querySelector('#lib-code');
    if (ta) {
      const lint = () => {
        try { parse(ta.value); side.querySelector('#lib-lint').textContent = '✓ sintaxe ok'; }
        catch (e) { side.querySelector('#lib-lint').textContent = `⚠ linha ${e.line}: ${e.message}`; }
      };
      ta.addEventListener('input', () => { libs[this.lib] = ta.value; lint(); });
      ta.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Tab') { e.preventDefault(); ta.setRangeText('    ', ta.selectionStart, ta.selectionEnd, 'end'); libs[this.lib] = ta.value; }
      });
      lint();
      side.querySelector('#lib-insert').onclick = () => this.insert(`importar("${this.lib}")\n`);
      side.querySelector('#lib-del').onclick = () => {
        if (!confirm(`Apagar a biblioteca "${this.lib}"?`)) return;
        delete libs[this.lib];
        this.lib = null;
        this.renderLibs(side);
      };
    }
  }

  insert(text) {
    const ta = this.ta;
    const s = ta.selectionStart, e = ta.selectionEnd;
    ta.setRangeText(text, s, e, 'end');
    ta.focus();
    this.onInput();
  }

  renderConsole() {
    const pc = this.pc;
    if (!pc) return;
    const c = this.consoleEl;
    const atBottom = c.scrollTop + c.clientHeight >= c.scrollHeight - 30;
    c.innerHTML = pc.console.slice(-200).map((l) => `<div class="c-${l.kind}">${esc(l.text)}</div>`).join('') || '<div class="c-sys">O que o programa escrever com print() aparece aqui.</div>';
    if (atBottom) c.scrollTop = c.scrollHeight;
  }

  renderGutter() {
    const n = this.ta.value.split('\n').length;
    const bp = this.pc ? this.pc.breakpoints : new Set();
    let g = '';
    for (let i = 1; i <= n; i++) g += `<div class="gl${bp.has(i) ? ' bp' : ''}" data-l="${i}">${i}</div>`;
    this.gutter.innerHTML = g;
  }

  onInput() {
    const v = this.ta.value;
    this.hl.innerHTML = highlight(v);
    this.renderGutter();
    if (this.pc) this.pc.code = v;
    clearTimeout(this.lintT);
    this.lintT = setTimeout(() => {
      try { parse(v); this.lint.textContent = '✓ sintaxe ok'; this.lint.className = 'ok'; }
      catch (e) { if (e instanceof JiboiaError) { this.lint.textContent = `⚠ linha ${e.line}: ${e.message}`; this.lint.className = 'bad'; } }
      this.refresh();
    }, 350);
    this.syncScroll();
  }

  syncScroll() {
    const y = this.ta.scrollTop, x = this.ta.scrollLeft;
    this.hl.style.transform = `translate(${-x}px, ${-y}px)`;
    this.gutter.style.transform = `translateY(${-y}px)`;
    this.scrollY = y;
    this.positionMarkers();
  }

  positionMarkers() {
    const pc = this.pc;
    const y = this.scrollY || 0;
    const pad = 10;
    if (pc && pc.running) {
      this.execLine.style.display = 'block';
      this.execLine.style.top = (pad + (pc.curLine - 1) * this.lineH - y) + 'px';
      this.execLine.classList.toggle('waiting', pc.lastYield === 'wait');
      this.execLine.classList.toggle('paused', !!pc.paused);
    } else this.execLine.style.display = 'none';
    const errL = pc && pc.error ? pc.errorLine : null;
    if (errL) {
      this.errLine.style.display = 'block';
      this.errLine.style.top = (pad + (errL - 1) * this.lineH - y) + 'px';
    } else this.errLine.style.display = 'none';
  }

  refresh() {
    const pc = this.pc;
    if (!pc) return;
    const $ = (s) => this.el.querySelector(s);
    this.status.textContent = pc.statusText;
    this.status.className = pc.error ? 'err' : pc.paused ? 'wait' : pc.running ? (pc.lastYield === 'wait' ? 'wait' : 'run') : '';
    $('#ed-run').textContent = pc.running ? '↻ Reiniciar' : '▶ Executar';
    $('#ed-pause').style.display = pc.running && !pc.paused ? '' : 'none';
    $('#ed-step').style.display = pc.running ? '' : 'none';
    $('#ed-resume').style.display = pc.running && pc.paused ? '' : 'none';
    const b = pc.board;
    $('#ed-cpu').innerHTML = `${pc.medalIcon} ${b.itemsMin} itens/min · CPU ${pc.hz.toFixed(1)} instr/s${pc.hw.clock ? ' ⏩' : ''}`;
    this.positionMarkers();
  }

  // tamanho da fonte do código (Configurações)
  setFont(px) {
    px = Math.max(11, Math.min(22, +px || 14));
    this.lineH = Math.round(px * 1.5);
    this.el.style.setProperty('--ed-fs', px + 'px');
    this.el.style.setProperty('--ed-lh', this.lineH + 'px');
    const c = document.createElement('canvas').getContext('2d');
    c.font = `${px}px "JetBrains Mono", monospace`;
    this.charW = c.measureText('MMMMMMMMMM').width / 10 || px * 0.6;
    document.fonts.ready.then(() => { c.font = `${px}px "JetBrains Mono", monospace`; this.charW = c.measureText('MMMMMMMMMM').width / 10 || this.charW; });
    if (this.pc) { this.onInput(); this.positionMarkers(); }
  }

  // ─── ⚙ hardware deste computador ───
  renderHardware(side = this.el.querySelector('#ed-side')) {
    const pc = this.pc;
    if (!pc) return;
    const eco = game.economy;
    const inf = (v) => (v === Infinity ? '∞' : v);
    const card = (k) => {
      const u = PC_UPGRADES[k];
      const l = pc.hw[k];
      const max = l >= u.custos.length;
      const lock = !max && !eco.hasTech('hardware');
      const val = (i) => (k === 'clock' ? `${u.valores[i]}×` : `${inf(u.valores[i])} variáveis · listas até ${inf(u.lista[i])}`);
      const pips = u.valores.map((_, i) => `<i class="${i <= l ? 'on' : ''}"></i>`).join('');
      return `<div class="hw-card"><div class="hw-h">${u.icone} <b>${u.nome}</b><span class="pips">${pips}</span></div>
        <div class="muted">${u.desc}</div>
        <div>Agora: <b>${val(l)}</b>${k === 'clock' ? ` · ${pc.hz.toFixed(1)} instr/s` : ''}</div>
        ${max ? '<div class="amber">No máximo ✨</div>' : `<div>Próximo: ${val(l + 1)} · gasta +${u.energia[l + 1] - u.energia[l]} ⚡</div>
        <button class="primary hw-up" data-k="${k}" ${lock || !eco.has(u.custos[l]) ? 'disabled' : ''}>${lock ? '🔒 Pesquisa "Hardware"' : `Melhorar · ${Object.entries(u.custos[l]).map(([i, n]) => `${n}× ${ITEMS[i].nome}`).join(' + ')}`}</button>`}
      </div>`;
    };
    const mem = pc.memUsage(), lim = pc.limits;
    side.innerHTML = `<div class="hw">
      <p class="muted">Cada computador tem o próprio hardware. O <b>Clock da CPU</b> sobe com os marcos e vale pra todos; o <b>Overclock</b> aqui multiplica só este.</p>
      ${card('clock')}${card('memoria')}
      <div class="hw-card"><div class="hw-h">📊 <b>Uso agora</b></div>
        <div>Variáveis: <b>${mem.vars}</b> / ${inf(lim.vars)}</div>
        <div>Maior lista: <b>${mem.maiorLista}</b> / ${inf(lim.lista)} itens</div>
        <div>Energia extra do hardware: <b>${pc.hwEnergy}</b> ⚡</div>
        <div class="muted">Funções (<code>def</code>) não contam como variáveis. Se encher, o programa para com um aviso.</div>
      </div></div>`;
    side.querySelectorAll('.hw-up').forEach((b) => {
      b.onclick = () => {
        const err = pc.hwUpgrade(b.dataset.k);
        if (err) game.ui.toast(err, 'warn');
        else game.ui.toast(`${PC_UPGRADES[b.dataset.k].icone} ${pc.name}: ${PC_UPGRADES[b.dataset.k].nome} melhorado!`, 'good');
        this.renderHardware();
        this.refresh();
      };
    });
  }

  run() {
    if (!this.pc) return;
    this.pc.code = this.ta.value;
    this.pc.run();
    this.showTab('console');
    this.refresh();
  }

  // ─── autocompletar ───
  hideAc() { this.ac.classList.add('hidden'); this.acItems = []; }
  autocomplete() {
    if (settings.autocomplete === false) return this.hideAc();
    const ta = this.ta;
    const pos = ta.selectionStart;
    const before = ta.value.slice(0, pos);
    const lineStart = before.lastIndexOf('\n') + 1;
    const line = before.slice(lineStart);
    if (/#/.test(line.replace(/"[^"]*"|'[^']*'/g, ''))) return this.hideAc();
    let prefix = '', cands = [], kind = '';
    let m;
    if ((m = /maquina\(\s*["']([\wÀ-ɏ]*)$/.exec(line)) || (m = /ir_para\(\s*["']([\wÀ-ɏ]*)$/.exec(line)) || (m = /(?:enviar|ouvir)\(\s*["']([\wÀ-ɏ]*)$/.exec(line))) {
      prefix = m[1]; kind = 'nome';
      cands = game.entities.filter((e) => e.name).map((e) => e.name).concat((game.drones || []).map((d) => d.name), ['todos', 'vendas', 'rede', 'tempo']);
    } else if ((m = /(?:pesquisar)\(\s*["']([\w]*)$/.exec(line))) {
      prefix = m[1]; kind = 'nome'; cands = Object.keys(TECHS);
    } else if ((m = /["']([a-z_]*)$/.exec(line)) && (line.split('"').length % 2 === 0 || line.split("'").length % 2 === 0)) {
      prefix = m[1]; kind = 'item';
      cands = Object.keys(ITEMS).concat(['esquerda', 'direita', 'frente', 'verde', 'vermelho', 'azul', 'amarelo', 'do', 're', 'mi', 'fa', 'sol', 'la', 'si']);
      if (!prefix) return this.hideAc();
    } else if ((m = /\.([\wÀ-ɏ]*)$/.exec(line))) {
      prefix = m[1]; kind = 'método'; cands = METHODS;
    } else if ((m = /([A-Za-z_À-ɏ][\wÀ-ɏ]*)$/.exec(line))) {
      prefix = m[1]; kind = 'palavra';
      if (prefix.length < 2) return this.hideAc();
      const vars = new Set();
      for (const mm of ta.value.matchAll(/(?:^|\n)\s*(?:def|funcao)\s+([\wÀ-ɏ]+)|([\wÀ-ɏ]+)\s*=[^=]/g)) vars.add(mm[1] || mm[2]);
      cands = [...vars].concat(GAME_FUNCS, STD_FUNCS, PY_KW, PT_KW);
    } else return this.hideAc();
    const p = prefix.toLowerCase();
    const list = [...new Set(cands)].filter((c) => c && c.toLowerCase().startsWith(p) && c !== prefix).sort((a, b) => a.length - b.length).slice(0, 8);
    if (!list.length) return this.hideAc();
    this.acItems = list;
    this.acSel = 0;
    this.acPrefix = prefix;
    this.ac.innerHTML = list.map((c, i) => `<div class="ac-i ${i === 0 ? 'sel' : ''}" data-i="${i}"><span class="ac-w"><b>${esc(c.slice(0, prefix.length))}</b>${esc(c.slice(prefix.length))}</span><span class="ac-k">${kind}</span></div>`).join('');
    this.ac.querySelectorAll('.ac-i').forEach((d) => { d.onmousedown = (e) => { e.preventDefault(); this.acSel = +d.dataset.i; this.acceptAc(); }; });
    // posição do cursor na tela
    const row = before.split('\n').length - 1;
    const col = line.length;
    this.ac.style.left = Math.max(0, 12 + (col - prefix.length) * this.charW - ta.scrollLeft) + 'px';
    this.ac.style.top = (10 + (row + 1) * this.lineH - ta.scrollTop) + 'px';
    this.ac.classList.remove('hidden');
  }
  acceptAc() {
    const w = this.acItems[this.acSel];
    if (!w) return;
    const ta = this.ta;
    const pos = ta.selectionStart;
    ta.setRangeText(w, pos - this.acPrefix.length, pos, 'end');
    this.hideAc();
    this.onInput();
  }

  onKey(e) {
    const ta = this.ta;
    const acOpen = !this.ac.classList.contains('hidden') && this.acItems.length;
    if (acOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        this.acSel = (this.acSel + (e.key === 'ArrowDown' ? 1 : -1) + this.acItems.length) % this.acItems.length;
        this.ac.querySelectorAll('.ac-i').forEach((d, i) => d.classList.toggle('sel', i === this.acSel));
        e.stopPropagation();
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.ctrlKey)) { e.preventDefault(); e.stopPropagation(); this.acceptAc(); return; }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.hideAc(); return; }
    }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); game.ui.closeOverlay(); return; }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.stopPropagation(); this.run(); return; }
    if (e.key === 'F10') { e.preventDefault(); this.pc?.step(); return; }
    if (e.key === ' ' && e.ctrlKey) { e.preventDefault(); this.autocomplete(); return; }
    if (e.key === 'Tab') {
      e.preventDefault();
      const s = ta.selectionStart, en = ta.selectionEnd;
      const v = ta.value;
      if (s !== en || e.shiftKey) {
        const ls = v.lastIndexOf('\n', s - 1) + 1;
        const block = v.slice(ls, en);
        const nb = e.shiftKey ? block.replace(/^ {1,4}/gm, '') : block.replace(/^/gm, '    ');
        ta.setRangeText(nb, ls, en, 'select');
      } else ta.setRangeText('    ', s, s, 'end');
      this.onInput();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const s = ta.selectionStart;
      const v = ta.value;
      const ls = v.lastIndexOf('\n', s - 1) + 1;
      const line = v.slice(ls, s);
      let ind = /^ */.exec(line)[0];
      if (/:\s*(#.*)?$/.test(line)) ind += '    ';
      ta.setRangeText('\n' + ind, s, ta.selectionEnd, 'end');
      this.onInput();
      return;
    }
    if (e.key === 'Backspace' && ta.selectionStart === ta.selectionEnd) {
      const s = ta.selectionStart, v = ta.value;
      const ls = v.lastIndexOf('\n', s - 1) + 1;
      const before = v.slice(ls, s);
      if (before.length >= 4 && /^ +$/.test(before) && before.length % 4 === 0) {
        e.preventDefault();
        ta.setRangeText('', s - 4, s, 'end');
        this.onInput();
      }
    }
    e.stopPropagation();
  }

  update() {
    if (!this.pc) return;
    this.refresh();
    if (this.tab === 'depurar' && this.pc.paused !== this.lastPaused) { this.lastPaused = this.pc.paused; this.renderDebug(); }
    this.dbgT = (this.dbgT || 0) - 1;
    if (this.tab === 'depurar' && this.dbgT <= 0) { this.dbgT = 20; this.renderDebug(); }
    if (this.tab === 'hardware') { this.hwT = (this.hwT || 0) - 1; if (this.hwT <= 0) { this.hwT = 30; if (!this.el.querySelector('.hw-up:hover')) this.renderHardware(); } }
  }
}
