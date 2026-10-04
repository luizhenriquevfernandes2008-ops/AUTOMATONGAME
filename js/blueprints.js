// 📐 Projetos: grupos de máquinas copiados (C) salvos com nome. Valem pra todas as fábricas deste navegador
// e viram um código de texto pra trocar com amigos.
import { game } from './state.js';
import { MACHINES, DECOR } from './data.js';
import { audio } from './audio.js';

const KEY = 'automaton_blueprints';
const PREFIX = 'AUTOMATON1:';
const escH = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function loadBlueprints() {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v.filter((b) => validClip(b.data)) : []; } catch { return []; }
}
function storeBlueprints(list) { try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch { return false; } }

// confere que o grupo só tem máquinas/decoração conhecidas e tamanho razoável
export function validClip(c) {
  if (!c || !Array.isArray(c.items) || !Array.isArray(c.wires) || !c.items.length || c.items.length > 800) return false;
  if (!(c.w >= 1 && c.h >= 1 && c.w <= 96 && c.h <= 96)) return false;
  for (const it of c.items) {
    if (!it || (!MACHINES[it.type] && !DECOR[it.type])) return false;
    if (!(it.dx >= 0 && it.dz >= 0 && it.dx < c.w && it.dz < c.h) || ![0, 1, 2, 3].includes(it.dir)) return false;
    if (it.data && typeof it.data !== 'object') return false;
  }
  return c.wires.every((w) => Array.isArray(w) && w.length === 2 && w.every((i) => Number.isInteger(i) && i >= 0 && i < c.items.length));
}
export function encode(bp) {
  const json = JSON.stringify({ n: bp.name, c: bp.data });
  return PREFIX + btoa(unescape(encodeURIComponent(json)));
}
export function decode(text) {
  const t = String(text).trim();
  if (!t.startsWith(PREFIX)) throw new Error('Esse código não é de um projeto do AUTOMATON (começa com AUTOMATON1:)');
  let d;
  try { d = JSON.parse(decodeURIComponent(escape(atob(t.slice(PREFIX.length).replace(/\s+/g, ''))))); } catch { throw new Error('Código quebrado: confira se copiou inteiro'); }
  if (!validClip(d.c)) throw new Error('O projeto tem peças desconhecidas ou está grande demais');
  // tira campos estranhos do código dos computadores
  for (const it of d.c.items) if (it.data) it.data = { ...it.data, type: it.type, running: false }; // código importado não roda sozinho
  return { name: String(d.n || 'Projeto importado').slice(0, 40), data: d.c, savedAt: Date.now() };
}

export function saveClipboard(name) {
  const clip = game.builder.clipboard;
  if (!clip) return 'Copie um grupo de máquinas antes (tecla C, depois clique em dois cantos)';
  const list = loadBlueprints();
  list.unshift({ name: name.slice(0, 40) || `Projeto ${list.length + 1}`, data: JSON.parse(JSON.stringify(clip)), savedAt: Date.now() });
  if (!storeBlueprints(list.slice(0, 60))) return 'Não consegui salvar (o navegador bloqueou o armazenamento)';
  game.economy.stats.blueprints = (game.economy.stats.blueprints || 0) + 1;
  return null;
}
const pieceSummary = (c) => {
  const n = {};
  for (const it of c.items) n[it.type] = (n[it.type] || 0) + 1;
  return Object.entries(n).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t, q]) => `${q}× ${(MACHINES[t] || DECOR[t]).nome}`).join(', ');
};
const cost = (c) => c.items.reduce((a, it) => a + ((MACHINES[it.type] || DECOR[it.type]).preco || 0), 0);

export function renderBlueprints(el) {
  const list = loadBlueprints();
  const clip = game.builder.clipboard;
  el.innerHTML = `
    <div class="bp-top">
      <div class="card-x"><div class="card-h"><span>// salvar o grupo copiado</span><b>${clip ? `${clip.items.length} peças · ${clip.w}×${clip.h}` : 'nada copiado'}</b></div>
        <div class="row"><input id="bp-name" maxlength="40" placeholder="Nome do projeto (ex: Linha de chips)" ${clip ? '' : 'disabled'}><button id="bp-save" class="primary" ${clip ? '' : 'disabled'}>💾 Salvar projeto</button></div>
        <p class="muted" style="margin:6px 0 0;font-size:12.5px">Copie com <kbd>C</kbd> (clique em dois cantos). Máquinas, direção, código dos computadores e cabos vão junto.</p></div>
      <div class="card-x"><div class="card-h"><span>// importar de um amigo</span></div>
        <div class="row"><textarea id="bp-code" rows="2" placeholder="Cole aqui o código AUTOMATON1:…"></textarea><button id="bp-import">📥 Importar</button></div></div>
    </div>
    <h3 class="rec-h">Seus projetos <small class="muted">(valem pra todas as fábricas deste navegador)</small></h3>
    <div class="bp-list">${list.map((b, i) => `<div class="bp-card">
        <div><b>📐 ${escH(b.name)}</b><small class="muted">${b.data.items.length} peças · ${b.data.w}×${b.data.h} · ~$ ${cost(b.data).toLocaleString('pt-BR')}</small><small>${escH(pieceSummary(b.data))}</small></div>
        <div class="row"><button class="primary" data-use="${i}">📋 Colar</button><button data-share="${i}">🔗 Código</button><button class="mini danger" data-del="${i}">apagar</button></div>
      </div>`).join('') || '<p class="muted">Nenhum projeto salvo ainda.</p>'}</div>
    <div id="bp-share" class="hidden card-x"><div class="card-h"><span>// código pra compartilhar</span><button id="bp-copy" class="mini">copiar</button></div><textarea id="bp-out" rows="4" readonly></textarea></div>`;
  const $ = (s) => el.querySelector(s);
  el.querySelectorAll('input, textarea').forEach((i) => i.addEventListener('keydown', (e) => e.stopPropagation()));
  $('#bp-save').onclick = () => {
    const why = saveClipboard($('#bp-name').value.trim());
    if (why) { game.ui.toast(why, 'warn'); return; }
    audio.play('buy', { volume: 0.5 });
    game.ui.toast('📐 Projeto salvo!', 'good');
    renderBlueprints(el);
  };
  $('#bp-import').onclick = () => {
    try {
      const bp = decode($('#bp-code').value);
      const l = loadBlueprints();
      l.unshift(bp);
      storeBlueprints(l.slice(0, 60));
      game.economy.stats.blueprints = (game.economy.stats.blueprints || 0) + 1;
      audio.play('buy', { volume: 0.5 });
      game.ui.toast(`📥 Projeto "${escH(bp.name)}" importado!`, 'good');
      renderBlueprints(el);
    } catch (e) { game.ui.toast(e.message, 'warn'); audio.play('deny'); }
  };
  el.querySelectorAll('[data-use]').forEach((b) => {
    b.onclick = () => {
      const bp = list[+b.dataset.use];
      game.builder.clipboard = JSON.parse(JSON.stringify(bp.data));
      game.ui.closeOverlay();
      game.builder.startPaste();
      game.ui.toast(`📋 Colando "${escH(bp.name)}": clique pra colar, <kbd>R</kbd> gira. Peças que faltarem são compradas.`);
    };
  });
  el.querySelectorAll('[data-share]').forEach((b) => {
    b.onclick = () => {
      const code = encode(list[+b.dataset.share]);
      $('#bp-share').classList.remove('hidden');
      $('#bp-out').value = code;
      $('#bp-out').select();
      $('#bp-copy').onclick = () => { navigator.clipboard?.writeText(code).then(() => game.ui.toast('Código copiado! 📋', 'good'), () => game.ui.toast('Selecione e copie com Ctrl+C', 'warn')); };
    };
  });
  el.querySelectorAll('[data-del]').forEach((b) => {
    b.onclick = () => {
      if (!confirm('Apagar esse projeto?')) return;
      const l = loadBlueprints(); l.splice(+b.dataset.del, 1); storeBlueprints(l); renderBlueprints(el);
    };
  });
}
