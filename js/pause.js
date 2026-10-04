// 3.0 · Menu de pausa com cara de editor: cada opção é uma linha de código (menu.jib) que você "roda",
// e embaixo um terminal mostra o estado do jogo (último save, fps, jogadores, tier, céu).
import { game } from './state.js';
import { audio } from './audio.js';
import { BIOMES, world } from './terrain.js';
import { skyInfo } from './sky.js';
import { MILESTONES } from './data.js';

const $ = (s) => document.querySelector(s);
let cur = 0, timer = null;
const lines = () => [...document.querySelectorAll('#pause-code > button.ln:not(.hidden), #pause-settings:not(.hidden) button.ln')];

function mark(i, scroll = true) {
  const L = lines();
  if (!L.length) return;
  cur = (i + L.length) % L.length;
  L.forEach((b, k) => b.classList.toggle('cur', k === cur));
  if (scroll) L[cur].scrollIntoView({ block: 'nearest' });
  const n = L[cur].querySelector('.no')?.textContent || '9';
  $('#pause-ln').textContent = `Ln ${n}, Col 1`;
}

function ago(ms) {
  const s = Math.round(ms / 1000);
  if (s < 10) return 'agora mesmo';
  if (s < 60) return `há ${s} s`;
  return `há ${Math.round(s / 60)} min`;
}

function term() {
  const el = $('#pause-term');
  if (!el || !game.economy) return;
  const eco = game.economy;
  const done = MILESTONES.filter((m) => eco.done(m.id)).length;
  const players = 1 + (game.mp?.peers?.size || 0);
  const i = game.sky?.astro ? skyInfo() : null;
  const out = [
    `<span class="ok">✔</span> salvo ${game.lastSave ? ago(Date.now() - game.lastSave) : '— ainda não'} · ${game.fps || '—'} fps · ${players} jogador${players > 1 ? 'es' : ''}`,
    `<span class="ok">✔</span> tier ${eco.tier} · ${done}/${MILESTONES.length} marcos · fase ${(eco.phase || 0) + 1} do foguete · 🎒 ${eco.slotsUsed()}/${eco.slots}`,
  ];
  if (i) out.push(`<span class="ok">✔</span> dia ${i.dia} · 🪐 Júpiter ${i.jupiter}`, `<span class="ok">✔</span> próxima oposição ${i.oposicao} · Grande Aproximação ${i.grande} · 🌑 eclipse ${i.eclipse}`);
  el.innerHTML = out.map((l) => `<div>&gt; ${l}</div>`).join('');
}

export function openPause() {
  const B = BIOMES[world.start];
  $('#pause-head').textContent = `# KX-7 · ${B ? B.icone + ' ' + B.nome : ''} · semente ${world.seedText || '—'}`;
  term();
  clearInterval(timer);
  timer = setInterval(() => { if (game.mode === 'pause') term(); else clearInterval(timer); }, 1000);
  mark(0, false);
}

export function initPause() {
  const fold = $('#pause-settings');
  $('#btn-settings').onclick = () => {
    fold.classList.toggle('hidden');
    $('#set-fold').textContent = fold.classList.contains('hidden') ? '# ▸ abrir' : '# ▾ fechar';
    audio.play('click', { volume: 0.4 });
  };
  $('#btn-allsettings').onclick = () => game.ui.openOverlay('settings');
  document.querySelectorAll('#pause-code button.ln').forEach((b) => b.addEventListener('mouseenter', () => { const k = lines().indexOf(b); if (k >= 0) mark(k, false); }));
  addEventListener('keydown', (e) => {
    if (game.mode !== 'pause' || game.ui?.overlay || game.ui?.confirmCb) return;
    if (e.target?.tagName === 'INPUT' && e.target.type !== 'range') return;
    if (e.code === 'ArrowDown' || e.code === 'KeyS') { e.preventDefault(); mark(cur + 1); audio.play('tick', { volume: 0.25 }); }
    else if (e.code === 'ArrowUp' || e.code === 'KeyW') { e.preventDefault(); mark(cur - 1); audio.play('tick', { volume: 0.25 }); }
    else if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); lines()[cur]?.click(); }
    else if (e.code === 'Escape') { e.preventDefault(); game.gesture = true; game.setMode('play'); }
  });
}
