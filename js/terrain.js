// O planeta KX-7 gerado por semente: cinco biomas que se encaixam, relevo de verdade (serras, mesas,
// cânions, planaltos, lagos), um anel de cordilheiras fechando o mapa e as áreas de pouso achatadas.
// A altura vem de uma grade de 2 m (heightfield) calculada uma vez; tudo no jogo consulta heightAt().
import * as THREE from 'three';
import { makeSimplex, mulberry32, hashSeed, fbm, ridged, smooth, lerp, clamp } from './noise.js';

export const HALF = 512;                 // o mapa vai de -512 a 512 m
export const RES = 2;                    // uma amostra de altura a cada 2 m
export const N = (HALF * 2) / RES + 1;   // 513 amostras por lado
export const WATER = 0;                  // nível da água
export const LIMIT = HALF - 14;          // até onde dá pra andar

// os cinco biomas (as três primeiras são áreas de início)
export const BIOMES = {
  floresta: {
    id: 0, nome: 'Floresta das Serras', icone: '🌲', inicio: true, dificuldade: 'Fácil',
    desc: 'Vales verdes entre serras altas, lagos e mata fechada. Ferro, cobre, calcário e carvão perto da base, e muita madeira.',
    fog: 0x8fa6b0, water: 0x2d6f78,
  },
  canion: {
    id: 1, nome: 'Cânion Vermelho', icone: '🏜️', inicio: true, dificuldade: 'Média',
    desc: 'Mesas de pedra em camadas, cânions fundos e chão plano de areia vermelha. Ferro e cobre puros, pouca planta.',
    fog: 0xc28c6c, water: 0x3f7d86,
  },
  tundra: {
    id: 2, nome: 'Tundra Gelada', icone: '❄️', inicio: true, dificuldade: 'Difícil',
    desc: 'Planalto de neve com lagos congelados, rochas afiadas e as auroras mais fortes do planeta. Muito carvão e calcário.',
    fog: 0xb9c8d8, water: 0x6fb2d6,
  },
  cristal: {
    id: 3, nome: 'Campos de Cristal', icone: '💎', inicio: false, dificuldade: 'Explorar',
    desc: 'Planície roxa com cristais gigantes e veios que brilham à noite. Único lugar com Cristal KX.',
    fog: 0x8f7fb0, water: 0x7a5fb8,
  },
  pantano: {
    id: 4, nome: 'Pântano Luminoso', icone: '🍄', inicio: false, dificuldade: 'Explorar',
    desc: 'Terra baixa e alagada, cogumelos gigantes e plantas que brilham. Único lugar com Luminita.',
    fog: 0x5f7a6a, water: 0x2f5a4a,
  },
};
export const BIOME_KEYS = ['floresta', 'canion', 'tundra', 'cristal', 'pantano'];
export const START_BIOMES = BIOME_KEYS.filter((k) => BIOMES[k].inicio);

// estado do mundo atual
export const world = {
  ready: false, seedText: '', seed: 0, start: 'floresta',
  sites: [],        // centro de cada bioma, na ordem de BIOME_KEYS
  spots: {},        // área de pouso achatada de cada bioma de início: {x, z, h}
  heights: null,    // Float32Array N*N
  weights: null,    // Float32Array N*N*5 (peso de cada bioma)
};

let nA, nB, nC, nD, nE, nF, nG, nM, nW1, nW2, nDet;

// semente legível pro jogador: KX-0000 a KX-9999
export function randomSeedText() {
  return 'KX-' + String(Math.floor(Math.random() * 10000)).padStart(4, '0');
}

// ─── pesos dos biomas (Voronoi distorcido e suavizado) ───
const _w = new Float32Array(5);
function weightsRaw(x, z, out = _w) {
  const wx = x + fbm(nW1, x / 230, z / 230, 3) * 85;
  const wz = z + fbm(nW2, x / 230, z / 230, 3) * 85;
  let dmin = 1e9;
  const s = world.sites;
  const d = [0, 0, 0, 0, 0];
  for (let i = 0; i < 5; i++) { d[i] = Math.hypot(wx - s[i].x, wz - s[i].z); if (d[i] < dmin) dmin = d[i]; }
  let sum = 0;
  for (let i = 0; i < 5; i++) { const w = Math.exp(-(d[i] - dmin) / 20); out[i] = w; sum += w; }
  for (let i = 0; i < 5; i++) out[i] /= sum;
  return out;
}

// ─── relevo de cada bioma (metros) ───
function hFloresta(x, z) {
  const hills = fbm(nA, x / 150, z / 150, 4) * 12 + 10;
  const range = smooth(-0.35, 0.25, fbm(nB, x / 300 + 7, z / 300, 3));
  // cordilheira: cristas com o eixo entortado (nada de linhas retas) e base larga
  const wx = x + fbm(nG, x / 220, z / 220, 2) * 55, wz = z + fbm(nG, x / 220 + 31, z / 220, 2) * 55;
  const r = ridged(nC, wx / 330, wz / 330, 6, 2.0, 0.5);
  const peaks = (Math.pow(r, 2.1) * 125 + Math.max(0, fbm(nE, x / 260, z / 260, 3)) * 22) * range;
  const lake = smooth(-0.25, -0.5, fbm(nD, x / 150, z / 150, 3)) * (1 - range * 0.9);
  return lerp(hills + peaks, -3.2, lake);
}
function hCanion(x, z) {
  const base = 8 + fbm(nA, x / 230 + 3, z / 230, 3) * 3;
  const m = fbm(nE, x / 150, z / 150, 4);
  const plateau = smooth(0.06, 0.13, m) * 15 + smooth(0.28, 0.34, m) * 12 + smooth(0.48, 0.52, m) * 9;
  const c = Math.abs(fbm(nF, x / 250, z / 250, 3));
  const carve = (1 - smooth(0.0, 0.065, c)) * 13;
  const dunes = Math.sin((x * 0.8 + z * 0.6) / 7 + fbm(nB, x / 60, z / 60, 2) * 3) * 0.5;
  return base + plateau - carve + dunes;
}
function hTundra(x, z) {
  const base = 15 + fbm(nA, x / 210 + 9, z / 210, 5) * 7;
  const rocky = Math.pow(ridged(nC, x / 230 + 11, z / 230, 5), 1.8) * 46 * smooth(-0.1, 0.45, fbm(nD, x / 300, z / 300, 2));
  const lake = smooth(-0.25, -0.5, fbm(nG, x / 140, z / 140, 3));
  const ice = 12.5 + fbm(nA, x / 700, z / 700, 2) * 2; // lago congelado: plano
  return lerp(base + rocky, ice, lake);
}
function hCristal(x, z) {
  const base = 3.5 + fbm(nA, x / 260 + 5, z / 260, 3) * 2.2 + fbm(nB, x / 40, z / 40, 2) * 0.35;
  const mound = Math.pow(Math.max(0, fbm(nC, x / 95, z / 95, 3)), 2) * 12;
  const lake = smooth(-0.18, -0.42, fbm(nD, x / 130 + 9, z / 130, 3));
  return lerp(base + mound, -1.8, lake);
}
function hPantano(x, z) {
  const base = 0.45 + fbm(nA, x / 110 + 2, z / 110, 4) * 2.3;
  const islands = Math.max(0, fbm(nC, x / 70, z / 70, 3)) * 3.2;
  return base + islands;
}
const HF = [hFloresta, hCanion, hTundra, hCristal, hPantano];

// borda do mapa: cordilheira alta que fecha o mundo (e continua no horizonte)
function edgeDist(x, z) { return Math.pow(Math.pow(Math.abs(x), 6) + Math.pow(Math.abs(z), 6), 1 / 6); }
function border(x, z) {
  const e = edgeDist(x, z);
  const m = smooth(HALF - 120, HALF - 8, e);
  if (m <= 0) return 0;
  const far = smooth(HALF, HALF + 400, e);
  return m * (40 + Math.pow(ridged(nM, x / 260, z / 260, 6), 1.5) * (110 + far * 140));
}

// altura "crua" (sem achatar as áreas de pouso nem os veios)
function rawHeight(x, z, w = weightsRaw(x, z)) {
  let h = 0;
  for (let i = 0; i < 5; i++) if (w[i] > 0.008) h += w[i] * HF[i](x, z);
  return h + border(x, z);
}
function withSpots(x, z, h) {
  for (const s of Object.values(world.spots)) {
    const d = Math.hypot(x - s.x, z - s.z);
    if (d > 70) continue;
    const m = 1 - smooth(30, 70, d);
    h = lerp(h, s.h + fbm(nB, x / 25, z / 25, 2) * 0.25 * (d / 30), m);
  }
  return h;
}

// ─── criação ───
export function createWorld(seedText, start = 'floresta', onProgress) {
  world.seedText = String(seedText || randomSeedText()).trim().slice(0, 24) || 'KX-0001';
  world.seed = hashSeed(world.seedText);
  world.start = START_BIOMES.includes(start) ? start : 'floresta';
  const s0 = world.seed;
  [nA, nB, nC, nD, nE, nF, nG, nM, nW1, nW2, nDet] = Array.from({ length: 11 }, (_, i) => makeSimplex(s0 + i * 7919));
  const rnd = mulberry32(s0 ^ 0x5bd1e995);
  // centros dos biomas: anel em volta do centro do mapa, em ordem sorteada
  const order = [...BIOME_KEYS];
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const a0 = rnd() * Math.PI * 2;
  world.sites = new Array(5);
  order.forEach((b, k) => {
    const a = a0 + (k / 5) * Math.PI * 2 + (rnd() - 0.5) * 0.35;
    const r = 225 + rnd() * 70;
    world.sites[BIOMES[b].id] = { b, x: Math.cos(a) * r, z: Math.sin(a) * r };
  });
  // área de pouso de cada bioma de início: o lugar mais plano perto do centro do bioma
  world.spots = {};
  for (const b of START_BIOMES) {
    const site = world.sites[BIOMES[b].id];
    let best = null;
    for (let i = 0; i < 70; i++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 120;
      const x = site.x + Math.cos(a) * r * 0.9, z = site.z + Math.sin(a) * r * 0.9;
      if (weightsRaw(x, z)[BIOMES[b].id] < 0.9) continue;
      let sum = 0, sum2 = 0, low = 0;
      for (let k = 0; k < 14; k++) {
        const aa = (k / 14) * Math.PI * 2, rr = k % 2 ? 18 : 34;
        const h = rawHeight(x + Math.cos(aa) * rr, z + Math.sin(aa) * rr);
        sum += h; sum2 += h * h;
        if (h < WATER + 1.5) low++;
      }
      const mean = sum / 14, varc = sum2 / 14 - mean * mean;
      const score = varc + low * 8 + r * 0.02;
      if (!best || score < best.score) best = { x, z, h: mean, score };
    }
    if (!best) best = { x: site.x, z: site.z, h: rawHeight(site.x, site.z) };
    world.spots[b] = { x: best.x, z: best.z, h: Math.max(WATER + 2.6, best.h) };
  }
  // heightfield + pesos
  world.heights = new Float32Array(N * N);
  world.weights = new Float32Array(N * N * 5);
  const w = new Float32Array(5);
  for (let j = 0; j < N; j++) {
    const z = -HALF + j * RES;
    for (let i = 0; i < N; i++) {
      const x = -HALF + i * RES;
      weightsRaw(x, z, w);
      const idx = j * N + i;
      world.heights[idx] = withSpots(x, z, rawHeight(x, z, w));
      world.weights.set(w, idx * 5);
    }
    if (onProgress && j % 64 === 0) onProgress(j / N);
  }
  world.ready = true;
  return world;
}

// prévia do planeta pro menu (mapinha sombreado), sem mexer no mundo que já está carregado
export function previewWorld(seedText, size = 180) {
  const saved = { ...world, noises: [nA, nB, nC, nD, nE, nF, nG, nM, nW1, nW2, nDet] };
  const fakeWorld = { ...world };
  try {
    // monta só os centros, as áreas de pouso e amostra a altura numa grade grossa
    world.seedText = String(seedText || '').trim().slice(0, 24) || 'KX-0001';
    world.seed = hashSeed(world.seedText);
    const s0 = world.seed;
    [nA, nB, nC, nD, nE, nF, nG, nM, nW1, nW2, nDet] = Array.from({ length: 11 }, (_, i) => makeSimplex(s0 + i * 7919));
    const rnd = mulberry32(s0 ^ 0x5bd1e995);
    const order = [...BIOME_KEYS];
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const a0 = rnd() * Math.PI * 2;
    world.sites = new Array(5);
    order.forEach((b, k) => {
      const a = a0 + (k / 5) * Math.PI * 2 + (rnd() - 0.5) * 0.35;
      const r = 225 + rnd() * 70;
      world.sites[BIOMES[b].id] = { b, x: Math.cos(a) * r, z: Math.sin(a) * r };
    });
    world.spots = {};
    // (mesma escolha de lugar plano do createWorld, mas com menos tentativas)
    for (const b of START_BIOMES) {
      const site = world.sites[BIOMES[b].id];
      let best = null;
      for (let i = 0; i < 70; i++) {
        const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 120;
        const x = site.x + Math.cos(a) * r * 0.9, z = site.z + Math.sin(a) * r * 0.9;
        if (weightsRaw(x, z)[BIOMES[b].id] < 0.9) continue;
        let sum = 0, sum2 = 0, low = 0;
        for (let k = 0; k < 14; k++) {
          const aa = (k / 14) * Math.PI * 2, rr = k % 2 ? 18 : 34;
          const h = rawHeight(x + Math.cos(aa) * rr, z + Math.sin(aa) * rr);
          sum += h; sum2 += h * h;
          if (h < WATER + 1.5) low++;
        }
        const mean = sum / 14, varc = sum2 / 14 - mean * mean;
        const score = varc + low * 8 + r * 0.02;
        if (!best || score < best.score) best = { x, z, h: mean, score };
      }
      world.spots[b] = best ? { x: best.x, z: best.z, h: Math.max(WATER + 2.6, best.h) } : { x: site.x, z: site.z, h: 5 };
    }
    const img = new Uint8ClampedArray(size * size * 4);
    const H = new Float32Array(size * size);
    const w = new Float32Array(5);
    const col = new THREE.Color(), tmpC = new THREE.Color();
    const BC = [0x4f8a5a, 0xc8764c, 0xe6edf5, 0x7d64ae, 0x3c5a3c];
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
      const x = -HALF + (i + 0.5) * (HALF * 2 / size), z = -HALF + (j + 0.5) * (HALF * 2 / size);
      weightsRaw(x, z, w);
      const h = withSpots(x, z, rawHeight(x, z, w));
      H[j * size + i] = h;
      col.setRGB(0, 0, 0);
      for (let b = 0; b < 5; b++) { tmpC.setHex(BC[b]); col.r += tmpC.r * w[b]; col.g += tmpC.g * w[b]; col.b += tmpC.b * w[b]; }
      if (h > 60) col.lerp(tmpC.setHex(0xf0f4fa), Math.min(1, (h - 60) / 40));
      if (h < WATER) col.setHex(0x2d6f8a);
      const k = (j * size + i) * 4;
      img[k] = col.r * 255; img[k + 1] = col.g * 255; img[k + 2] = col.b * 255; img[k + 3] = 255;
    }
    // sombreamento (luz vindo do noroeste)
    for (let j = 1; j < size; j++) for (let i = 1; i < size; i++) {
      const d = (H[j * size + i] - H[(j - 1) * size + i - 1]) * 0.06;
      const f = Math.max(0.45, Math.min(1.5, 1 + d));
      const k = (j * size + i) * 4;
      img[k] *= f; img[k + 1] *= f; img[k + 2] *= f;
    }
    const spots = Object.fromEntries(Object.entries(world.spots).map(([b, p]) => [b, { u: (p.x + HALF) / (HALF * 2), v: (p.z + HALF) / (HALF * 2) }]));
    const sites = world.sites.map((p) => ({ b: p.b, u: (p.x + HALF) / (HALF * 2), v: (p.z + HALF) / (HALF * 2) }));
    return { img, size, spots, sites };
  } finally {
    [nA, nB, nC, nD, nE, nF, nG, nM, nW1, nW2, nDet] = saved.noises;
    delete saved.noises;
    Object.assign(world, saved);
    void fakeWorld;
  }
}

// achata um círculo do heightfield (veios de minério, destroços): tudo determinístico
export function flattenAt(x, z, r, h = heightAt(x, z), blend = 2.5) {
  const i0 = Math.max(0, Math.floor((x - r - blend + HALF) / RES)), i1 = Math.min(N - 1, Math.ceil((x + r + blend + HALF) / RES));
  const j0 = Math.max(0, Math.floor((z - r - blend + HALF) / RES)), j1 = Math.min(N - 1, Math.ceil((z + r + blend + HALF) / RES));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const px = -HALF + i * RES, pz = -HALF + j * RES;
    const d = Math.hypot(px - x, pz - z);
    const m = 1 - smooth(r, r + blend, d);
    if (m <= 0) continue;
    const idx = j * N + i;
    world.heights[idx] = lerp(world.heights[idx], h, m);
  }
  return h;
}

// ─── consultas ───
export function heightAt(x, z) {
  const gx = (x + HALF) / RES, gz = (z + HALF) / RES;
  if (!world.heights || gx < 0 || gz < 0 || gx > N - 1 || gz > N - 1) return world.ready ? rawHeight(x, z) : 0;
  const i = Math.min(N - 2, Math.floor(gx)), j = Math.min(N - 2, Math.floor(gz));
  const fx = gx - i, fz = gz - j;
  const H = world.heights, k = j * N + i;
  // dois triângulos (igual à malha), pra o jogador pisar exatamente no chão desenhado
  if (fx + fz <= 1) return H[k] + (H[k + 1] - H[k]) * fx + (H[k + N] - H[k]) * fz;
  return H[k + N + 1] + (H[k + N] - H[k + N + 1]) * (1 - fx) + (H[k + 1] - H[k + N + 1]) * (1 - fz);
}
// inclinação (0 = plano, 1 = 45°)
export function slopeAt(x, z) {
  const e = 1;
  const dx = heightAt(x + e, z) - heightAt(x - e, z), dz = heightAt(x, z + e) - heightAt(x, z - e);
  return Math.hypot(dx, dz) / (2 * e);
}
export function weightsAt(x, z) {
  const i = clamp(Math.round((x + HALF) / RES), 0, N - 1), j = clamp(Math.round((z + HALF) / RES), 0, N - 1);
  const k = (j * N + i) * 5;
  return world.weights ? world.weights.subarray(k, k + 5) : _w;
}
export function biomeAt(x, z) {
  const w = weightsAt(x, z);
  let best = 0;
  for (let i = 1; i < 5; i++) if (w[i] > w[best]) best = i;
  return BIOME_KEYS[best];
}
export const isWater = (x, z) => heightAt(x, z) < WATER - 0.15;
export const inMap = (x, z) => Math.abs(x) < LIMIT && Math.abs(z) < LIMIT;
export function detailNoise(x, z) { return nDet ? nDet(x, z) : 0; }

// ─── malha do terreno ───
const COL = {
  floresta: { grass: [0x3f7a52, 0x5f9a5a], dirt: 0x6a5a42, rock: 0x6d7378, high: 0x8a8f96 },
  canion: { grass: [0xc7764c, 0xd99566], dirt: 0xb86a44, rock: 0x9c4a30, high: 0x7d3524 },
  tundra: { grass: [0xdfe8f2, 0xf2f6fb], dirt: 0x9aa6b4, rock: 0x5f6772, high: 0xf4f8ff },
  cristal: { grass: [0x5d4686, 0x7d64ae], dirt: 0x8f7ab8, rock: 0x4a3a66, high: 0xb9a7e6 },
  pantano: { grass: [0x3c5a3c, 0x2f4a40], dirt: 0x3d3a2a, rock: 0x4a4a3c, high: 0x5c6a4c },
};
const GLOW = { cristal: new THREE.Color(0x9f6bff), pantano: new THREE.Color(0x4dffa0) };
const _c = new THREE.Color(), _c2 = new THREE.Color(), _acc = new THREE.Color();

function vertexColor(x, z, h, slope, w, out) {
  _acc.setRGB(0, 0, 0);
  const mottle = 0.5 + 0.5 * nB(x / 23, z / 23);
  for (let b = 0; b < 5; b++) {
    const wb = w[b];
    if (wb < 0.01) continue;
    const key = BIOME_KEYS[b];
    const P = COL[key];
    _c.setHex(P.grass[0]).lerp(_c2.setHex(P.grass[1]), mottle);
    // terra exposta em manchas
    const dirt = smooth(0.35, 0.6, nE(x / 41, z / 41));
    _c.lerp(_c2.setHex(P.dirt), dirt * 0.45);
    if (key === 'canion') {
      // camadas de rocha (estratos) nas encostas das mesas
      const band = 0.5 + 0.5 * Math.sin(h * 1.25 + nA(x / 80, z / 80) * 2);
      _c2.setHex(P.rock).lerp(new THREE.Color(P.high), band * 0.6);
      _c.lerp(_c2, smooth(0.35, 0.7, slope));
    } else {
      _c.lerp(_c2.setHex(P.rock), smooth(0.45, 0.85, slope));
    }
    if (key === 'floresta') _c.lerp(_c2.setHex(0xf2f5f8), smooth(58, 72, h + nB(x / 30, z / 30) * 6) * (1 - smooth(0.9, 1.4, slope))); // neve nos picos
    if (key === 'tundra' && h < 15.2 && slope < 0.08) _c.setHex(0x9ccfe8); // gelo
    if (h < WATER + 0.9 && key !== 'tundra') _c.lerp(_c2.setHex(key === 'pantano' ? 0x2c2a20 : key === 'cristal' ? 0xa79ac8 : 0xb9a888), smooth(WATER + 0.9, WATER + 0.1, h) * 0.8);
    _acc.r += _c.r * wb; _acc.g += _c.g * wb; _acc.b += _c.b * wb;
  }
  // borda: rocha da cordilheira
  const e = edgeDist(x, z);
  if (e > HALF - 120) {
    _c.setHex(0x5b5e66).lerp(_c2.setHex(0xe8eef6), smooth(70, 110, h));
    _acc.lerp(_c, smooth(HALF - 110, HALF - 40, e));
  }
  out.copy(_acc);
  return out;
}
function glowAt(x, z, w, h, out) {
  out.setRGB(0, 0, 0);
  if (h < WATER - 0.2) return out;
  if (w[3] > 0.05) { const v = 1 - smooth(0, 0.07, Math.abs(nF(x / 13, z / 13))); out.copy(GLOW.cristal).multiplyScalar(v * w[3] * 0.9); }
  if (w[4] > 0.05) { const v = smooth(0.5, 0.72, nG(x / 7, z / 7)); out.add(_c.copy(GLOW.pantano).multiplyScalar(v * w[4] * 0.7)); }
  return out;
}

// material do terreno: cor por vértice + detalhe da textura (projeção triplanar) + brilho noturno + grade de construção
export const terrainUniforms = {
  uTime: { value: 0 }, uNight: { value: 0 }, uGrid: { value: 0 }, uGridPos: { value: new THREE.Vector2() },
  uDetail: { value: null }, uCell: { value: 1.5 },
};
export function makeTerrainMaterial(detailTex) {
  terrainUniforms.uDetail.value = detailTex;
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, terrainUniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aGlow;\nvarying vec3 vGlow;\nvarying vec3 vWPos;\nvarying vec3 vWNorm;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGlow = aGlow;\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWNorm = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vGlow; varying vec3 vWPos; varying vec3 vWNorm;
uniform float uTime, uNight, uGrid, uCell; uniform vec2 uGridPos; uniform sampler2D uDetail;
float lum(vec3 c){ return dot(c, vec3(0.299,0.587,0.114)); }
float vTerrSteep = 0.0, vTerrBlades = 0.0;
float th21(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float tvn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(th21(i), th21(i + vec2(1.0, 0.0)), f.x), mix(th21(i + vec2(0.0, 1.0)), th21(i + vec2(1.0, 1.0)), f.x), f.y); }
vec3 tri(vec3 p, vec3 n, float s){
  vec3 b = pow(abs(n), vec3(4.0)); b /= (b.x+b.y+b.z);
  return texture2D(uDetail, p.zy*s).rgb*b.x + texture2D(uDetail, p.xz*s).rgb*b.y + texture2D(uDetail, p.xy*s).rgb*b.z;
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec3 n = normalize(vWNorm);
  float d1 = lum(tri(vWPos, n, 0.09));
  float d2 = lum(tri(vWPos, n, 0.013));
  float det = mix(d1, d2, 0.5) / 0.36;
  diffuseColor.rgb *= clamp(mix(1.0, det, 0.55), 0.55, 1.45);
  // 3.0.2: variação grande (manchas), rocha de verdade nas encostas e grama miudinha de perto
  float dist = length(vWPos - cameraPosition);
  float macro = tvn(vWPos.xz * 0.011) * 0.6 + tvn(vWPos.xz * 0.037 + 3.0) * 0.4;
  diffuseColor.rgb *= 0.84 + macro * 0.32;
  float steep = 1.0 - smoothstep(0.5, 0.82, n.y);
  // rocha: estratos largos e suaves (detalhe fino demais vira chuvisco/camuflagem)
  float strata = tvn(vec2(vWPos.y * 0.3, (vWPos.x + vWPos.z) * 0.025)) * 0.75 + tvn(vWPos.xz * 0.08) * 0.25;
  strata = mix(0.5, strata, 1.0 - smoothstep(30.0, 90.0, dist));
  vec3 rockC = diffuseColor.rgb * (0.7 + strata * 0.3);
  diffuseColor.rgb = mix(diffuseColor.rgb, rockC, steep * 0.9);
  float near = 1.0 - smoothstep(8.0, 40.0, dist);
  float blades = tvn(vWPos.xz * 5.0) * 0.55 + tvn(vWPos.xz * 13.0 + 7.0) * 0.45;
  diffuseColor.rgb *= 1.0 + (blades - 0.5) * 0.22 * near * (1.0 - steep);
  vTerrSteep = steep; vTerrBlades = blades * near;
}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  // relevo fino por derivadas (pedrinhas, sulcos e a grama), mais forte na rocha
  float bh = tvn(vWPos.xz * 1.4) * 0.55 + tvn(vWPos.xz * 3.7 + 1.7) * 0.3 + vTerrBlades * 0.25;
  float bDist = length(vWPos - cameraPosition);
  vec2 dH = vec2(dFdx(bh), dFdy(bh)) * (0.8 + vTerrSteep * 0.4) * (1.0 - smoothstep(15.0, 50.0, bDist));
  vec3 sX = dFdx(-vViewPosition), sY = dFdy(-vViewPosition);
  vec3 R1 = cross(sY, normal), R2 = cross(normal, sX);
  float fDet = dot(sX, R1) * faceDirection;
  normal = normalize(abs(fDet) * normal - sign(fDet) * (dH.x * R1 + dH.y * R2));
}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  float pulse = 0.65 + 0.35 * sin(uTime * 1.3 + vWPos.x * 0.07 + vWPos.z * 0.05);
  // manchas orgânicas (musgo/fungo) em vez dos quadrados do terreno, com pontinhos que piscam
  float mask = smoothstep(0.42, 0.68, tvn(vWPos.xz * 0.11) * 0.65 + tvn(vWPos.xz * 0.37 + 7.0) * 0.35);
  vec2 sc = floor(vWPos.xz * 1.7);
  float sp = step(0.9, fract(sin(dot(sc, vec2(12.9898, 78.233))) * 43758.5453)) * (1.0 - smoothstep(0.04, 0.16, length(fract(vWPos.xz * 1.7) - 0.5))) * (0.5 + 0.5 * sin(uTime * 2.3 + sc.x * 1.7 + sc.y));
  totalEmissiveRadiance += vGlow * uNight * pulse * (mask * 1.9 + sp * 1.4);
  if (uGrid > 0.0) {
    vec2 g = abs(fract(vWPos.xz / uCell) - 0.5);
    float line = smoothstep(0.47, 0.495, max(g.x, g.y));
    float fade = 1.0 - smoothstep(6.0, 16.0, distance(vWPos.xz, uGridPos));
    totalEmissiveRadiance += vec3(0.25, 0.9, 0.8) * line * fade * uGrid * 0.6;
  }
}`);
  };
  return mat;
}

// constrói os pedaços (chunks) do terreno. stride 1 = 2 m por quadrado; 2 = 4 m (qualidade baixa)
export function buildTerrainMeshes(scene, material, stride = 1) {
  const CH = 128;                         // tamanho do pedaço (m)
  const per = CH / RES;                   // amostras por pedaço
  const group = new THREE.Group();
  group.name = 'terrain';
  const color = new THREE.Color(), glow = new THREE.Color();
  const H = world.heights;
  // normais da grade inteira (diferenças centrais)
  const norms = new Float32Array(N * N * 3);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const hl = H[j * N + Math.max(0, i - 1)], hr = H[j * N + Math.min(N - 1, i + 1)];
    const hd = H[Math.max(0, j - 1) * N + i], hu = H[Math.min(N - 1, j + 1) * N + i];
    const nx = (hl - hr), nz = (hd - hu), ny = 2 * RES;
    const l = Math.hypot(nx, ny, nz);
    const k = (j * N + i) * 3;
    norms[k] = nx / l; norms[k + 1] = ny / l; norms[k + 2] = nz / l;
  }
  world.normals = norms;
  const chunks = (HALF * 2) / CH;
  for (let cz = 0; cz < chunks; cz++) for (let cx = 0; cx < chunks; cx++) {
    const n = per / stride + 1;
    const pos = new Float32Array(n * n * 3), nor = new Float32Array(n * n * 3), col = new Float32Array(n * n * 3), glw = new Float32Array(n * n * 3);
    for (let b = 0; b < n; b++) for (let a = 0; a < n; a++) {
      const i = cx * per + a * stride, j = cz * per + b * stride;
      const idx = j * N + i, v = (b * n + a) * 3;
      const x = -HALF + i * RES, z = -HALF + j * RES, h = H[idx];
      pos[v] = x; pos[v + 1] = h; pos[v + 2] = z;
      nor[v] = norms[idx * 3]; nor[v + 1] = norms[idx * 3 + 1]; nor[v + 2] = norms[idx * 3 + 2];
      const w = world.weights.subarray(idx * 5, idx * 5 + 5);
      const slope = Math.hypot(nor[v], nor[v + 2]) / Math.max(0.05, nor[v + 1]);
      vertexColor(x, z, h, slope, w, color);
      col[v] = color.r; col[v + 1] = color.g; col[v + 2] = color.b;
      glowAt(x, z, w, h, glow);
      glw[v] = glow.r; glw[v + 1] = glow.g; glw[v + 2] = glow.b;
    }
    const idxs = [];
    for (let b = 0; b < n - 1; b++) for (let a = 0; a < n - 1; a++) {
      const p0 = b * n + a, p1 = p0 + 1, p2 = p0 + n, p3 = p2 + 1;
      idxs.push(p0, p2, p1, p1, p2, p3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aGlow', new THREE.BufferAttribute(glw, 3));
    g.setIndex(idxs);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    const m = new THREE.Mesh(g, material);
    m.receiveShadow = true;
    m.castShadow = true;
    m.name = 'terrainChunk';
    group.add(m);
  }
  // horizonte: a cordilheira continua além do mapa (malha grossa)
  group.add(buildSkirt(material));
  scene.add(group);
  return group;
}

function buildSkirt(material) {
  const R = 2600, step = 40;
  const n = Math.round((R * 2) / step) + 1;
  const pos = [], col = [], nor = [], glw = [], idx = [];
  const map = new Int32Array(n * n).fill(-1);
  const color = new THREE.Color();
  const inner = HALF - 60;
  const w5 = new Float32Array(5);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = -R + i * step, z = -R + j * step;
    if (Math.abs(x) < inner - step && Math.abs(z) < inner - step) continue;
    let h = rawHeight(x, z, weightsRaw(x, z, w5));
    if (Math.abs(x) < HALF && Math.abs(z) < HALF) h -= 1.5; // por baixo do terreno detalhado
    map[j * n + i] = pos.length / 3;
    pos.push(x, h, z);
    const e = 4;
    const hx = rawHeight(x + e, z) - rawHeight(x - e, z), hz = rawHeight(x, z + e) - rawHeight(x, z - e);
    const l = Math.hypot(hx, 2 * e, hz);
    nor.push(-hx / l, (2 * e) / l, -hz / l);
    color.setHex(0x4e535c).lerp(new THREE.Color(0xe9eef6), smooth(80, 150, h));
    col.push(color.r, color.g, color.b);
    glw.push(0, 0, 0);
  }
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
    const a = map[j * n + i], b = map[j * n + i + 1], c = map[(j + 1) * n + i], d = map[(j + 1) * n + i + 1];
    if (a < 0 || b < 0 || c < 0 || d < 0) continue;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aGlow', new THREE.Float32BufferAttribute(glw, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, material);
  m.name = 'terrainSkirt';
  m.receiveShadow = true;
  return m;
}

// ─── água: plano com ondinhas, cor do bioma, transparência pela profundidade e espuma na margem ───
export const waterUniforms = { uTime: { value: 0 }, uHeight: { value: null }, uBiome: { value: null }, uNight: { value: 0 }, uSkyZ: { value: new THREE.Color(0x2c63b0) }, uSkyH: { value: new THREE.Color(0xbfd6e6) }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 1, 1) }, uSunK: { value: 1 } };
export function buildWater(scene) {
  // textura de altura (half float) e de bioma pra o shader da água saber a profundidade e a cor
  const hdata = new Uint16Array(N * N);
  for (let k = 0; k < N * N; k++) hdata[k] = THREE.DataUtils.toHalfFloat(world.heights[k]);
  const ht = new THREE.DataTexture(hdata, N, N, THREE.RedFormat, THREE.HalfFloatType);
  ht.magFilter = ht.minFilter = THREE.LinearFilter;
  ht.needsUpdate = true;
  const bdata = new Uint8Array(N * N * 4);
  for (let k = 0; k < N * N; k++) {
    const w = world.weights.subarray(k * 5, k * 5 + 5);
    bdata[k * 4] = w[0] * 255; bdata[k * 4 + 1] = w[1] * 255; bdata[k * 4 + 2] = w[3] * 255; bdata[k * 4 + 3] = w[4] * 255;
  }
  const bt = new THREE.DataTexture(bdata, N, N, THREE.RGBAFormat);
  bt.magFilter = bt.minFilter = THREE.LinearFilter;
  bt.needsUpdate = true;
  waterUniforms.uHeight.value = ht;
  waterUniforms.uBiome.value = bt;
  const mat = new THREE.MeshStandardMaterial({ color: 0x2d6f78, roughness: 0.08, metalness: 0.15, transparent: true, depthWrite: false });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, waterUniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWPos; uniform float uTime, uNight, uSunK; uniform sampler2D uHeight, uBiome; uniform vec3 uSkyZ, uSkyH, uSunDir, uSunCol; vec3 wWorldN = vec3(0.0, 1.0, 0.0);
vec2 wuv(vec2 p){ return (p + ${HALF.toFixed(1)}) / ${(HALF * 2).toFixed(1)}; }
float wh(vec2 p){ vec2 uv = wuv(p); if (uv.x<0.0||uv.y<0.0||uv.x>1.0||uv.y>1.0) return -4.0; return texture2D(uHeight, uv).r; }
float wn(vec2 p){ return sin(p.x*0.9+uTime*1.1)*0.5 + sin(p.y*1.3-uTime*0.8)*0.35 + sin((p.x+p.y)*2.1+uTime*1.7)*0.15 + sin(p.x*3.7-p.y*2.9+uTime*2.6)*0.08 + sin(p.y*4.3+p.x*1.9-uTime*3.1)*0.06; }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec4 bw = texture2D(uBiome, wuv(vWPos.xz));
  float tw = clamp(1.0 - bw.r - bw.g - bw.b - bw.a, 0.0, 1.0);
  vec3 col = vec3(0.12,0.40,0.44)*bw.r + vec3(0.20,0.46,0.50)*bw.g + vec3(0.40,0.66,0.82)*tw + vec3(0.42,0.30,0.70)*bw.b + vec3(0.14,0.32,0.26)*bw.a;
  float depth = -wh(vWPos.xz);
  diffuseColor.rgb = mix(col * 1.35, col * 0.55, smoothstep(0.0, 4.0, depth));
  float foam = 1.0 - smoothstep(0.0, 0.35, depth + wn(vWPos.xz*0.7)*0.06);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9,0.95,0.95), foam*0.6);
  diffuseColor.a = clamp(smoothstep(-0.05, 2.2, depth) * 0.8 + 0.2 + foam*0.3, 0.0, 0.94);
}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  vec2 p = vWPos.xz;
  float e = 0.15;
  float dx = wn(p + vec2(e,0.0)) - wn(p - vec2(e,0.0));
  float dz = wn(p + vec2(0.0,e)) - wn(p - vec2(0.0,e));
  vec3 wnrm = normalize(vec3(-dx*0.35, 1.0, -dz*0.35));
  wWorldN = wnrm;
  normal = normalize((viewMatrix * vec4(wnrm, 0.0)).xyz);
}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  vec4 bw2 = texture2D(uBiome, wuv(vWPos.xz));
  float sp = smoothstep(0.82, 0.98, sin(vWPos.x*1.7+uTime*0.6)*sin(vWPos.z*1.9-uTime*0.4));
  totalEmissiveRadiance += vec3(0.3,1.0,0.6) * sp * bw2.a * uNight * 0.8 + vec3(0.6,0.4,1.0) * sp * bw2.b * uNight * 0.5;
  // 3.0.2: reflexo do céu de agora (fresnel) e o brilho do sol nas ondas
  vec3 V = normalize(vWPos - cameraPosition);
  vec3 Rf = reflect(V, wWorldN);
  float fres = 0.04 + 0.96 * pow(1.0 - max(dot(-V, wWorldN), 0.0), 5.0);
  vec3 sky = mix(uSkyH, uSkyZ, smoothstep(0.0, 0.6, Rf.y));
  totalEmissiveRadiance += sky * fres * 0.85;
  diffuseColor.rgb *= 1.0 - fres * 0.6;
  float glint = pow(max(dot(Rf, normalize(uSunDir)), 0.0), 220.0) * 6.0 + pow(max(dot(Rf, normalize(uSunDir)), 0.0), 24.0) * 0.25;
  totalEmissiveRadiance += uSunCol * glint * uSunK;
}`);
  };
  const g = new THREE.PlaneGeometry(HALF * 2 + 400, HALF * 2 + 400, 1, 1);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, mat);
  m.position.y = WATER;
  m.renderOrder = 1;
  m.name = 'water';
  scene.add(m);
  return m;
}

// ─── raio contra o terreno (mira de construção), sem raycast em malha ───
const _p = new THREE.Vector3();
export function rayTerrain(origin, dir, maxDist = 20) {
  let prev = 0;
  const step = 0.2;
  for (let t = step; t <= maxDist; t += step) {
    _p.copy(origin).addScaledVector(dir, t);
    if (_p.y <= heightAt(_p.x, _p.z)) {
      let a = prev, b = t;
      for (let k = 0; k < 10; k++) {
        const m = (a + b) / 2;
        _p.copy(origin).addScaledVector(dir, m);
        if (_p.y <= heightAt(_p.x, _p.z)) b = m; else a = m;
      }
      _p.copy(origin).addScaledVector(dir, b);
      return { point: _p.clone(), distance: b };
    }
    prev = t;
  }
  return null;
}
