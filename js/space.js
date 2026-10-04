// Programa Espacial: depois do primeiro lançamento a plataforma continua. Cada missão põe um satélite
// em órbita (bônus permanente) e dá ⭐ estrelas pras pesquisas infinitas. Os satélites aparecem no céu à noite.
import * as THREE from 'three';
import { game } from './state.js';
import { ITEMS, SATELLITES, SAT_MAX, missionNeeds, missionPrize } from './data.js';
import { thumbs } from './thumbs.js';
import { audio } from './audio.js';

const fmt = (n) => Math.round(n).toLocaleString('pt-BR');
const icon = (k) => `<img class="ic" src="${thumbs['item:' + k] || ''}" alt="">`;

export function renderSpace(el) {
  const eco = game.economy;
  const pl = game.platform;
  const m = eco.mission;
  const total = Object.values(eco.sats).reduce((a, b) => a + b, 0);
  const orbit = Object.entries(SATELLITES).map(([k, s]) => {
    const lvl = eco.satLvl(k);
    const pips = Array.from({ length: SAT_MAX }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('');
    return `<button class="sp-sat ${m.sat === k ? 'cur' : ''}" data-sat="${k}" ${m.sat || lvl >= SAT_MAX || pl.launching ? 'disabled' : ''}>
      <div class="rs-top"><span class="rs-ic">${s.icone}</span><b>${s.nome}</b></div>
      <div class="rs-desc">${s.desc} (cada)</div>
      <div class="pips">${pips}</div>
      <div class="rs-costs">${Object.keys(s.extra).map((i) => `<span class="rs-cost">${icon(i)}</span>`).join('')}${lvl >= SAT_MAX ? '<span class="good">máximo ✨</span>' : ''}</div>
    </button>`;
  }).join('');
  let mission = '';
  if (m.sat) {
    const need = missionNeeds(m.n, m.sat);
    const rows = Object.entries(need).map(([k, n]) => {
      const have = Math.min(n, m.progress[k] || 0);
      return `<div class="pf-row">${icon(k)}<div class="pf-name">${ITEMS[k].nome}<small><code>"${k}"</code></small></div>
        <div class="pf-bar"><i style="width:${(have / n) * 100}%"></i></div><div class="pf-n">${have}/${n}</div></div>`;
    }).join('');
    const prize = missionPrize(m.n);
    mission = `<div class="card-x pf-card">
      <div class="card-h"><span>// missão ${m.n + 2} · ${SATELLITES[m.sat].icone} ${SATELLITES[m.sat].nome}</span><b>$ ${fmt(prize.dinheiro)} · ⭐ ${prize.estrelas}</b></div>
      <p class="muted" style="margin-top:0">Leve os itens por esteira até a plataforma e lance. O satélite fica em órbita pra sempre.</p>
      ${rows}
      <div class="row"><button id="pf-launch" class="big" ${pl.readyToLaunch() ? '' : 'disabled'}>🚀 Lançar missão</button><button id="sp-change" class="mini">trocar satélite</button></div>
    </div>`;
  } else mission = `<div class="card-x"><div class="card-h"><span>// próxima missão: ${m.n + 2}</span><b>escolha um satélite ↓</b></div><p class="muted" style="margin:0">Cada missão pede módulos de foguete, satélites e itens de ponta (baterias, painéis de LED…), e fica um pouco maior a cada vez.</p></div>`;
  el.innerHTML = `
    <div class="sp-head">
      <div class="sp-big">🛰️</div>
      <div><h2 style="margin:0">Programa Espacial</h2>
      <div class="muted">${total} satélite(s) em órbita · ${m.n} missão(ões) extra · ⭐ <b class="amber">${eco.stars}</b> estrelas (use nas ♾️ pesquisas infinitas do Laboratório)</div></div>
    </div>
    ${mission}
    <h3 class="rec-h">Satélites <small class="muted">(até ${SAT_MAX} de cada · os bônus somam)</small></h3>
    <div class="sp-grid">${orbit}</div>`;
  el.querySelectorAll('[data-sat]').forEach((b) => {
    b.onclick = () => {
      const why = pl.chooseMission(b.dataset.sat);
      if (why) { game.ui.toast(why, 'warn'); return; }
      audio.play('select', { volume: 0.6 });
      renderSpace(el);
    };
  });
  const lb = el.querySelector('#pf-launch');
  if (lb) lb.onclick = () => { pl.launch(); game.ui.closeOverlay(); };
  const ch = el.querySelector('#sp-change');
  if (ch) ch.onclick = () => {
    if (Object.keys(m.progress).length && !confirm('Trocar de satélite? Os itens já entregues nesta missão serão perdidos.')) return;
    if (game.mp?.guestRpc('unmission', {})) return;
    m.sat = null; m.progress = {}; pl.buildRocket(); renderSpace(el);
  };
}

// ─── satélites no céu (pontinhos que cruzam o céu à noite) ───
let dots = [], tex = null;
function dotTex() {
  if (tex) return tex;
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.3, 'rgba(255,240,200,0.7)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 32, 32);
  tex = new THREE.CanvasTexture(c);
  return tex;
}
export function updateOrbit(dt) {
  const eco = game.economy;
  if (!eco) return;
  const want = Math.min(30, Object.values(eco.sats).reduce((a, b) => a + b, 0) + (eco.launched ? 1 : 0));
  while (dots.length < want) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex(), transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
    s.scale.setScalar(2.2);
    s.renderOrder = -1;
    game.scene.add(s);
    dots.push({ s, a: Math.random() * Math.PI * 2, tilt: (Math.random() - 0.5) * 1.2, v: 0.02 + Math.random() * 0.03, r: 170 + Math.random() * 40 });
  }
  while (dots.length > want) { const d = dots.pop(); game.scene.remove(d.s); }
  const night = game.isNight ? 1 : 0.15;
  const cam = game.camera.position;
  for (const d of dots) {
    d.a += d.v * dt;
    const x = Math.cos(d.a) * d.r, y = Math.sin(d.a) * d.r;
    d.s.position.set(cam.x + x, 60 + Math.abs(y) * 0.7, cam.z + y * Math.cos(d.tilt));
    d.s.material.opacity = night * (0.6 + 0.4 * Math.sin(game.time * 3 + d.a * 10));
  }
}
