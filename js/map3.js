// 3.0 · Mapa de KX-7: relevo sombreado com as cores dos biomas, água, curvas de nível, névoa do que você
// ainda não explorou, veios (tamanho = pureza), fábrica, cabos, jogadores e marcadores seus.
// Roda do mouse: zoom · arrastar: mover · botão direito: põe/tira marcador · C: centralizar.
import { game } from './state.js';
import { world, HALF, BIOMES, BIOME_KEYS, heightAt, biomeAt, WATER } from './terrain.js';
import { nodes } from './world.js';
import { ORES, MACHINES, CELL } from './data.js';
import { foundations } from './machines.js';
import { wires } from './power.js';

const FOG_N = 128, FOG_M = (HALF * 2) / FOG_N;   // névoa: células de 8 m
const BIOME_COL = { floresta: [63, 122, 74], canion: [184, 92, 58], tundra: [214, 224, 234], cristal: [126, 91, 194], pantano: [58, 104, 88] };
const ORE_COL = { ferro: '#9fb4d6', cobre: '#e8844a', calcario: '#e2dccb', carvao: '#4a4a58', quartzo: '#f3c4ff', cristal: '#b07cff', luminita: '#5dffa8', estelar: '#b18cff' };
const TYPE_COL = { central: '#5ff5e0', bancada: '#ffae34', minerador: '#ffb347', fornalha: '#ff7a3a', construtora: '#7fb8ff', montadora: '#9a8cff', gerador: '#ffd84a', gerador_carvao: '#ffd84a', painel_solar: '#ffe98a', poste: '#ffd84a', computador: '#3ee6b8', laboratorio: '#c58aff', plataforma: '#ffb020', bau: '#c8a070' };
const MARK_COL = ['#ff5a6e', '#ffd84a', '#3ee6b8', '#7fb8ff', '#ff9ad8'];

export const explore = { fog: new Uint8Array(FOG_N * FOG_N), dirty: true };
game.explore = explore;
export const markers = [];                       // [{ x, z, c }]
game.markers = markers;
const view = { zoom: 1, cx: 0, cz: 0, drag: null, moved: false, hover: null, layers: { veios: true, fabrica: true, curvas: true } };
let relief = null, fogCanvas = null;

// ─── exploração ───
export function revealAround(x, z, r) {
  const i0 = Math.max(0, Math.floor((x - r + HALF) / FOG_M)), i1 = Math.min(FOG_N - 1, Math.floor((x + r + HALF) / FOG_M));
  const j0 = Math.max(0, Math.floor((z - r + HALF) / FOG_M)), j1 = Math.min(FOG_N - 1, Math.floor((z + r + HALF) / FOG_M));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const cx = -HALF + (i + 0.5) * FOG_M, cz = -HALF + (j + 0.5) * FOG_M;
    const d = Math.hypot(cx - x, cz - z);
    if (d > r) continue;
    const v = d < r * 0.7 ? 255 : Math.round(255 * (1 - (d - r * 0.7) / (r * 0.3)));
    const k = j * FOG_N + i;
    if (v > explore.fog[k]) { explore.fog[k] = v; explore.dirty = true; }
  }
}
let exT = 0;
export function updateExplore(dt) {
  exT -= dt;
  if (exT > 0 || !world.ready) return;
  exT = 0.5;
  const p = game.camera.position;
  // de cima de um morro dá pra ver mais longe
  const r = 70 + Math.max(0, p.y - heightAt(p.x, p.z) - 1.6) * 1.5 + Math.max(0, p.y - 20) * 0.6;
  revealAround(p.x, p.z, Math.min(220, r));
  for (const peer of game.mp?.peers?.values?.() || []) if (peer.obj) revealAround(peer.obj.position.x, peer.obj.position.z, 70);
}
export function isExplored(x, z) {
  const i = Math.floor((x + HALF) / FOG_M), j = Math.floor((z + HALF) / FOG_M);
  return i >= 0 && j >= 0 && i < FOG_N && j < FOG_N && explore.fog[j * FOG_N + i] > 100;
}
export function serializeExplore() {
  let s = '';
  const f = explore.fog;
  for (let i = 0; i < f.length; i += 8192) s += String.fromCharCode.apply(null, f.subarray(i, i + 8192));
  return { fog: btoa(s), markers };
}
export function loadExplore(d) {
  explore.fog.fill(0);
  markers.length = 0;
  if (!d) return;
  try { const s = atob(d.fog || ''); for (let i = 0; i < Math.min(s.length, explore.fog.length); i++) explore.fog[i] = s.charCodeAt(i); } catch { /* ignora */ }
  for (const m of d.markers || []) markers.push(m);
  explore.dirty = true;
}

// ─── relevo (uma vez por mundo) ───
function buildRelief() {
  const N = Math.round(Math.sqrt(world.heights.length));
  const H = world.heights, Wt = world.weights;
  const cv = document.createElement('canvas');
  cv.width = N; cv.height = N;
  const g = cv.getContext('2d');
  const img = g.createImageData(N, N);
  const d = img.data;
  const hAt = (i, j) => H[Math.min(N - 1, Math.max(0, j)) * N + Math.min(N - 1, Math.max(0, i))];
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const k = j * N + i;
      const h = H[k];
      let r = 0, gg = 0, b = 0;
      for (let q = 0; q < 5; q++) { const w = Wt[k * 5 + q], c = BIOME_COL[BIOME_KEYS[q]]; r += c[0] * w; gg += c[1] * w; b += c[2] * w; }
      // pedra e neve no alto
      const rock = Math.max(0, Math.min(1, (h - 45) / 40)), snow = Math.max(0, Math.min(1, (h - 85) / 25));
      r += (128 - r) * rock * 0.6; gg += (124 - gg) * rock * 0.6; b += (132 - b) * rock * 0.6;
      r += (240 - r) * snow; gg += (244 - gg) * snow; b += (250 - b) * snow;
      // sombra do relevo (luz do noroeste)
      const dx = hAt(i + 1, j) - hAt(i - 1, j), dz = hAt(i, j + 1) - hAt(i, j - 1);
      let shade = 1 + (-dx - dz) * 0.09;
      shade = Math.max(0.45, Math.min(1.45, shade));
      r *= shade; gg *= shade; b *= shade;
      if (h < WATER) {
        const dep = Math.min(1, (WATER - h) / 6);
        r = 40 - dep * 22; gg = 110 - dep * 50; b = 138 - dep * 40;
      }
      d[k * 4] = r; d[k * 4 + 1] = gg; d[k * 4 + 2] = b; d[k * 4 + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // curvas de nível a cada 10 m (em outra camada)
  const cl = document.createElement('canvas');
  cl.width = N; cl.height = N;
  const g2 = cl.getContext('2d');
  const img2 = g2.createImageData(N, N);
  for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
    const a = Math.floor(H[j * N + i] / 10), b2 = Math.floor(H[j * N + i + 1] / 10), c2 = Math.floor(H[(j + 1) * N + i] / 10);
    if ((a !== b2 || a !== c2) && H[j * N + i] > WATER) { const k = (j * N + i) * 4; img2.data[k] = img2.data[k + 1] = img2.data[k + 2] = 10; img2.data[k + 3] = a % 5 === 0 ? 70 : 34; }
  }
  g2.putImageData(img2, 0, 0);
  relief = { cv, cl, N, seed: world.seedText };
}
function buildFog() {
  if (!fogCanvas) { fogCanvas = document.createElement('canvas'); fogCanvas.width = FOG_N; fogCanvas.height = FOG_N; }
  const g = fogCanvas.getContext('2d');
  const img = g.createImageData(FOG_N, FOG_N);
  for (let k = 0; k < explore.fog.length; k++) { img.data[k * 4] = 9; img.data[k * 4 + 1] = 12; img.data[k * 4 + 2] = 18; img.data[k * 4 + 3] = 238 - explore.fog[k] * 0.93; }
  g.putImageData(img, 0, 0);
  explore.dirty = false;
}

// ─── janela ───
export function renderMap(el) {
  if (!el.querySelector('canvas')) {
    el.innerHTML = `<div class="map3">
      <canvas id="mapc" width="1200" height="800"></canvas>
      <aside class="map3-side">
        <div class="map3-h">// biomas</div>
        <div id="map3-biomes"></div>
        <div class="map3-h">// veios</div>
        <div class="map3-ores">${Object.entries(ORE_COL).map(([k, c]) => `<span><i style="background:${c}"></i>${ORES[k]?.nome || k}</span>`).join('')}</div>
        <div class="map3-pur"><span><b class="pd big"></b>puro 2×</span><span><b class="pd"></b>normal</span><span><b class="pd small"></b>impuro ½×</span></div>
        <div class="map3-h">// camadas</div>
        <div class="map3-layers">${Object.keys(view.layers).map((k) => `<label><input type="checkbox" data-l="${k}" ${view.layers[k] ? 'checked' : ''}> ${k}</label>`).join('')}</div>
        <div class="map3-h">// aqui</div>
        <div id="map3-hover" class="muted">passe o mouse no mapa</div>
        <div class="map3-keys muted">roda: zoom · arrastar: mover<br>botão direito: marcador · <kbd>C</kbd> centraliza · <kbd>Tab</kbd> fecha</div>
        <button id="map3-me" class="mini">◎ centralizar em mim</button>
      </aside></div>`;
    const c = el.querySelector('canvas');
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = c.getBoundingClientRect(), s0 = scaleOf(c);
      const mx = (e.clientX - r.left) * (c.width / r.width), my = (e.clientY - r.top) * (c.height / r.height);
      const wx = view.cx + (mx - c.width / 2) / s0, wz = view.cz + (my - c.height / 2) / s0;
      view.zoom = Math.max(0.8, Math.min(14, view.zoom * (e.deltaY < 0 ? 1.18 : 0.85)));
      const s1 = scaleOf(c);
      view.cx = wx - (mx - c.width / 2) / s1; view.cz = wz - (my - c.height / 2) / s1;
      draw(c);
    }, { passive: false });
    c.addEventListener('mousedown', (e) => { if (e.button === 0) view.drag = { x: e.clientX, y: e.clientY, cx: view.cx, cz: view.cz }; view.moved = false; });
    addEventListener('mouseup', () => { view.drag = null; });
    c.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const w = toWorld(c, e);
      const near = markers.findIndex((m) => Math.hypot(m.x - w.x, m.z - w.z) < 10 / scaleOf(c) * 1.5);
      if (near >= 0) markers.splice(near, 1);
      else markers.push({ x: Math.round(w.x), z: Math.round(w.z), c: markers.length % MARK_COL.length });
      draw(c);
    });
    c.addEventListener('mousemove', (e) => {
      if (view.drag) {
        const s = scaleOf(c);
        view.cx = view.drag.cx - (e.clientX - view.drag.x) * (c.width / c.clientWidth) / s;
        view.cz = view.drag.cz - (e.clientY - view.drag.y) * (c.height / c.clientHeight) / s;
        draw(c);
      }
      const w = toWorld(c, e);
      const hv = el.querySelector('#map3-hover');
      if (Math.abs(w.x) > HALF || Math.abs(w.z) > HALF) { hv.textContent = 'fora do mapa'; return; }
      if (!isExplored(w.x, w.z)) { hv.innerHTML = '<span class="muted">??? ainda não explorado</span>'; return; }
      const b = BIOMES[biomeAt(w.x, w.z)];
      const h = heightAt(w.x, w.z);
      const nd = nodes.find((n) => Math.hypot(n.x - w.x, n.z - w.z) < Math.max(3, 8 / scaleOf(c)));
      hv.innerHTML = `${b.icone} ${b.nome}<br>x ${Math.round(w.x)} · z ${Math.round(w.z)} · ${h < WATER ? 'água' : 'altura ' + Math.round(h) + ' m'}${nd ? `<br>⛏️ ${ORES[nd.type].nome} <b>${nd.purity}</b>` : ''}`;
    });
    el.querySelectorAll('[data-l]').forEach((cb) => { cb.onchange = () => { view.layers[cb.dataset.l] = cb.checked; draw(c); }; });
    el.querySelector('#map3-me').onclick = () => { center(); draw(c); };
    center();
  }
  const bl = el.querySelector('#map3-biomes');
  if (bl) bl.innerHTML = BIOME_KEYS.map((k, i) => {
    const s = world.sites[i];
    const seen = s && isExplored(s.x, s.z);
    const c = BIOME_COL[k];
    return `<div class="map3-b ${seen ? '' : 'unseen'}"><i style="background:rgb(${c.join(',')})"></i>${seen ? BIOMES[k].icone + ' ' + BIOMES[k].nome : '??? não descoberto'}</div>`;
  }).join('');
  draw(el.querySelector('canvas'));
}
function center() { const p = game.camera.position; view.cx = p.x; view.cz = p.z; view.zoom = Math.max(view.zoom, 2.2); }
game.mapKey = (code) => { if (code === 'KeyC') { center(); const c = document.querySelector('#mapc'); if (c) draw(c); } };
const scaleOf = (c) => (Math.min(c.width, c.height) / (HALF * 2)) * view.zoom;
function toWorld(c, e) {
  const r = c.getBoundingClientRect(), s = scaleOf(c);
  const mx = (e.clientX - r.left) * (c.width / r.width), my = (e.clientY - r.top) * (c.height / r.height);
  return { x: view.cx + (mx - c.width / 2) / s, z: view.cz + (my - c.height / 2) / s };
}

function draw(c) {
  if (!world.heights) return;
  if (!relief || relief.seed !== world.seedText) buildRelief();
  if (explore.dirty || !fogCanvas) buildFog();
  const g = c.getContext('2d');
  const W = c.width, H = c.height, s = scaleOf(c);
  const X = (x) => W / 2 + (x - view.cx) * s, Z = (z) => H / 2 + (z - view.cz) * s;
  g.fillStyle = '#070a0f'; g.fillRect(0, 0, W, H);
  g.imageSmoothingEnabled = true;
  g.drawImage(relief.cv, X(-HALF), Z(-HALF), HALF * 2 * s, HALF * 2 * s);
  if (view.layers.curvas) g.drawImage(relief.cl, X(-HALF), Z(-HALF), HALF * 2 * s, HALF * 2 * s);
  // grade de 64 m
  g.strokeStyle = 'rgba(255,255,255,0.05)'; g.lineWidth = 1;
  for (let v = -HALF; v <= HALF; v += 64) { g.beginPath(); g.moveTo(X(v), Z(-HALF)); g.lineTo(X(v), Z(HALF)); g.moveTo(X(-HALF), Z(v)); g.lineTo(X(HALF), Z(v)); g.stroke(); }
  // fábrica
  if (view.layers.fabrica) {
    g.fillStyle = 'rgba(200,205,215,0.55)';
    for (const k of foundations.keys()) { const [x, z] = k.split(',').map(Number); g.fillRect(X(x * CELL), Z(z * CELL), CELL * s + 0.5, CELL * s + 0.5); }
    g.strokeStyle = '#ffa64099'; g.lineWidth = Math.max(1, s * 0.15);
    for (const w of wires) { g.beginPath(); g.moveTo(X((w.a.x + 0.5) * CELL), Z((w.a.z + 0.5) * CELL)); g.lineTo(X((w.b.x + 0.5) * CELL), Z((w.b.z + 0.5) * CELL)); g.stroke(); }
    for (const e of game.entities) {
      const t = e.type;
      const sz = (MACHINES[t]?.tamanho || 1);
      const off = Math.floor(sz / 2);
      const belt = t.startsWith('esteira') || t.startsWith('rampa') || t === 'divisor' || t === 'juntador' || t === 'separador';
      g.fillStyle = belt ? '#d9b25a' : TYPE_COL[t] || '#9aa4b8';
      const x = X((e.x - off) * CELL), z = Z((e.z - off) * CELL), w = sz * CELL * s;
      if (belt) g.fillRect(x + w * 0.2, z + w * 0.2, Math.max(1.5, w * 0.6), Math.max(1.5, w * 0.6));
      else { g.fillRect(x, z, Math.max(2.5, w), Math.max(2.5, w)); if (MACHINES[t]?.energia && e.noPower) { g.strokeStyle = '#ff5a6e'; g.lineWidth = 2; g.strokeRect(x, z, w, w); } }
      if (t === 'central' && s > 0.6) { g.font = `${Math.max(14, w)}px sans-serif`; g.textAlign = 'center'; g.fillText('🏠', x + w / 2, z - 4); g.textAlign = 'left'; }
    }
  }
  // veios (só os já vistos)
  if (view.layers.veios) {
    for (const n of nodes) {
      if (!isExplored(n.x, n.z)) continue;
      const r = Math.max(2.2, Math.min(9, s * 1.6)) * (n.purity === 'puro' ? 1.35 : n.purity === 'impuro' ? 0.7 : 1);
      g.fillStyle = ORE_COL[n.type] || '#fff';
      g.beginPath(); g.arc(X(n.x), Z(n.z), r, 0, Math.PI * 2); g.fill();
      g.lineWidth = n.purity === 'puro' ? 2 : 1; g.strokeStyle = n.purity === 'puro' ? '#ffffff' : 'rgba(0,0,0,0.55)'; g.stroke();
    }
    for (const v of game.events?.veins || []) { if (!isExplored((v.x + 0.5) * CELL, (v.z + 0.5) * CELL)) continue; g.fillStyle = '#b18cff'; g.beginPath(); g.arc(X((v.x + 0.5) * CELL), Z((v.z + 0.5) * CELL), Math.max(4, s * 2), 0, Math.PI * 2); g.fill(); g.strokeStyle = '#fff'; g.stroke(); }
  }
  // névoa de guerra
  g.imageSmoothingEnabled = true;
  g.drawImage(fogCanvas, X(-HALF), Z(-HALF), HALF * 2 * s, HALF * 2 * s);
  // borda do mapa
  g.strokeStyle = 'rgba(255,176,32,0.4)'; g.setLineDash([8, 6]); g.lineWidth = 1.5;
  g.strokeRect(X(-HALF + 14), Z(-HALF + 14), (HALF * 2 - 28) * s, (HALF * 2 - 28) * s); g.setLineDash([]);
  // nomes dos biomas descobertos
  g.textAlign = 'center';
  world.sites.forEach((st, i) => {
    if (!isExplored(st.x, st.z)) return;
    const b = BIOMES[BIOME_KEYS[i]];
    g.font = `600 ${Math.round(Math.max(12, Math.min(22, 9 + s * 4)))}px "Big Shoulders Display", sans-serif`;
    g.lineWidth = 4; g.strokeStyle = 'rgba(5,8,12,0.8)'; g.strokeText(b.nome.toUpperCase(), X(st.x), Z(st.z));
    g.fillStyle = '#f2ead8'; g.fillText(b.nome.toUpperCase(), X(st.x), Z(st.z));
  });
  // cápsula de pouso
  if (game.pod) { g.font = '16px sans-serif'; g.fillText('🛬', X(game.pod.position.x), Z(game.pod.position.z) + 5); }
  // marcadores
  markers.forEach((m, i) => {
    const x = X(m.x), z = Z(m.z);
    g.fillStyle = MARK_COL[m.c % MARK_COL.length];
    g.beginPath(); g.moveTo(x, z); g.arc(x, z - 14, 7, Math.PI * 0.8, Math.PI * 2.2); g.closePath(); g.fill();
    g.fillStyle = '#0b0f15'; g.font = '700 10px "JetBrains Mono", monospace'; g.fillText(String(i + 1), x, z - 11);
  });
  // outros jogadores
  for (const peer of game.mp?.peers?.values?.() || []) {
    if (!peer.obj) continue;
    const x = X(peer.obj.position.x), z = Z(peer.obj.position.z);
    g.fillStyle = '#7fb8ff'; g.beginPath(); g.arc(x, z, 6, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.stroke();
    g.fillStyle = '#e8f1ff'; g.font = '11px "JetBrains Mono", monospace'; g.fillText(peer.name || '?', x, z - 10);
  }
  g.textAlign = 'left';
  // você
  const p = game.camera.position;
  const fx = -Math.sin(game.camera.rotation.y), fz = -Math.cos(game.camera.rotation.y);
  const px = X(p.x), pz = Z(p.z);
  g.fillStyle = 'rgba(255,90,110,0.18)'; g.beginPath(); g.arc(px, pz, 16, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ff5a6e'; g.beginPath();
  g.moveTo(px + fx * 12, pz + fz * 12); g.lineTo(px - fz * 7 - fx * 6, pz + fx * 7 - fz * 6); g.lineTo(px + fz * 7 - fx * 6, pz - fx * 7 - fz * 6); g.closePath(); g.fill();
  g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.stroke();
  // escala
  const meters = [25, 50, 100, 200, 400].find((m) => m * s > 70) || 400;
  g.fillStyle = '#e9e2cf'; g.fillRect(20, H - 24, meters * s, 3); g.font = '11px "JetBrains Mono", monospace'; g.fillText(`${meters} m`, 20, H - 30);
}
