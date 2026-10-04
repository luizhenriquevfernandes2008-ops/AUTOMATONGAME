// Monta o planeta KX-7 a partir da semente: terreno (terrain.js), água, veios de minério por bioma,
// destroços pra explorar e a cápsula de pouso na área escolhida.
import * as THREE from 'three';
import { assets, cloneModel } from './assets.js';
import { CELL, ORES, PURITY } from './data.js';
import { ores, purity, key } from './machines.js';
import { addStatic, setStaticScale } from './staticBatch.js';
import { game } from './state.js';
import { mulberry32 } from './noise.js';
import { puff } from './fx.js';
import {
  world, createWorld, heightAt, slopeAt, weightsAt, biomeAt, BIOMES, BIOME_KEYS, START_BIOMES, HALF, WATER, flattenAt,
  buildTerrainMeshes, makeTerrainMaterial, buildWater, inMap,
} from './terrain.js';

export const colliders = [];      // círculos {x, z, r} que o jogador não atravessa
export const interactables = [];  // {obj, label, action}
export const nodes = [];          // veios: {type, cx, cz, x, z, y, purity, biome}

// minérios de cada bioma (peso do sorteio). Cristal KX e Luminita só existem nos biomas de explorar.
const ORE_WEIGHTS = {
  floresta: { ferro: 3, cobre: 2, calcario: 2, carvao: 2, quartzo: 0.6 },
  canion: { ferro: 3.2, cobre: 3, calcario: 1, carvao: 0.8, quartzo: 1.2 },
  tundra: { carvao: 3, calcario: 2.4, ferro: 2, cobre: 1, quartzo: 1 },
  cristal: { quartzo: 3, cristal: 3, cobre: 1, calcario: 1 },
  pantano: { luminita: 3, carvao: 2, ferro: 1, calcario: 1 },
};
// veios garantidos em volta de cada área de pouso
const START_NODES = {
  floresta: ['ferro', 'ferro', 'ferro', 'cobre', 'cobre', 'calcario', 'calcario', 'carvao'],
  canion: ['ferro', 'ferro', 'ferro', 'cobre', 'cobre', 'calcario', 'carvao', 'quartzo'],
  tundra: ['ferro', 'ferro', 'cobre', 'calcario', 'calcario', 'carvao', 'carvao', 'quartzo'],
};

const pick = (rnd, weights) => {
  const e = Object.entries(weights);
  let t = rnd() * e.reduce((a, [, w]) => a + w, 0);
  for (const [k, w] of e) { t -= w; if (t <= 0) return k; }
  return e[0][0];
};

// sorteia os veios (antes de montar a malha, porque cada veio achata um pouquinho o chão em volta)
function generateNodes() {
  nodes.length = 0;
  const rnd = mulberry32(world.seed ^ 0xa11ce);
  const taken = new Set();
  const okSpot = (x, z) => inMap(x, z) && heightAt(x, z) > WATER + 0.6 && slopeAt(x, z) < 0.32;
  const add = (type, x, z, pu) => {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) if (taken.has(key(cx + dx, cz + dz))) return false;
    const c = { x: (cx + 0.5) * CELL, z: (cz + 0.5) * CELL };
    const h = flattenAt(c.x, c.z, 1.6, heightAt(c.x, c.z), 2.2);
    taken.add(key(cx, cz));
    nodes.push({ type, cx, cz, x: c.x, z: c.z, y: h, purity: pu, biome: biomeAt(c.x, c.z) });
    return true;
  };
  // em volta de cada área de pouso: o kit garantido (normais, um puro de ferro no cânion)
  for (const b of START_BIOMES) {
    const s = world.spots[b];
    const list = START_NODES[b];
    let placed = 0, tries = 0;
    while (placed < list.length && tries < 400) {
      tries++;
      const a = (placed / list.length) * Math.PI * 2 + rnd() * 0.5, r = 16 + rnd() * 22;
      const x = s.x + Math.cos(a) * r, z = s.z + Math.sin(a) * r;
      if (!okSpot(x, z)) continue;
      const pu = b === 'canion' && placed === 0 ? 'puro' : placed === list.length - 1 ? 'impuro' : 'normal';
      if (add(list[placed], x, z, pu)) placed++;
    }
  }
  // grupos de veios espalhados pelo mapa
  const centers = [];
  for (let i = 0; i < 4000 && centers.length < 230; i++) {
    const x = (rnd() * 2 - 1) * (HALF - 70), z = (rnd() * 2 - 1) * (HALF - 70);
    if (!okSpot(x, z)) continue;
    if (Object.values(world.spots).some((s) => Math.hypot(s.x - x, s.z - z) < 75)) continue;
    if (centers.some((c) => Math.hypot(c.x - x, c.z - z) < 34)) continue;
    centers.push({ x, z });
    const b = biomeAt(x, z);
    const type = pick(rnd, ORE_WEIGHTS[b]);
    const explore = !BIOMES[b].inicio;
    const nearStart = Math.min(...Object.values(world.spots).map((s) => Math.hypot(s.x - x, s.z - z)));
    const far = Math.min(1, nearStart / 400);
    const n = 1 + Math.floor(rnd() * (type === 'cristal' || type === 'luminita' ? 3 : 4));
    for (let k = 0; k < n; k++) {
      const a = rnd() * Math.PI * 2, r = k ? 4 + rnd() * 6 : 0;
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (!okSpot(px, pz)) continue;
      const t = k && rnd() < 0.25 ? pick(rnd, ORE_WEIGHTS[b]) : type;
      const q = rnd();
      const pPure = (explore ? 0.38 : 0.12) + far * 0.18, pImp = (explore ? 0.15 : 0.38) - far * 0.15;
      add(t, px, pz, q < pPure ? 'puro' : q < pPure + pImp ? 'impuro' : 'normal');
    }
  }
}

// ─── construção da cena ───
export function buildWorld(params = {}) {
  const scene = game.scene;
  createWorld(params.seed, params.start, params.onProgress);
  generateNodes();
  game.worldInfo = { seed: world.seedText, start: world.start };

  scene.background = new THREE.Color(0x1a2230);
  scene.environment = assets.envMap;
  scene.environmentIntensity = 0.55;
  scene.fog = new THREE.Fog(BIOMES[world.start].fog, 90, 720);
  // luzes: céu em cima, chão embaixo, sol com sombra, preenchimento oposto
  const hemi = new THREE.HemisphereLight(0xc0c6e0, 0x6a5a48, 1.5);
  scene.add(hemi);
  game.hemi = hemi;
  const sun = new THREE.DirectionalLight(0xffc690, 2.6);
  sun.position.set(40, 60, 25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -48; sc.right = 48; sc.top = 48; sc.bottom = -48; sc.near = 1; sc.far = 260;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  game.sun = sun;
  const fill = new THREE.DirectionalLight(0xa8b8e8, 1.0);
  scene.add(fill, fill.target);
  game.fill = fill;

  // terreno e água
  const detail = assets.textures.ground.clone();
  detail.repeat.set(1, 1);
  detail.needsUpdate = true;
  game.terrainMat = makeTerrainMaterial(detail);
  game.terrain = buildTerrainMeshes(scene, game.terrainMat, params.lowDetail ? 2 : 1);
  game.water = buildWater(scene);

  buildOres();
  buildPod();
}

// veios: cristais (em lote) tingidos com a cor do minério; o tamanho mostra a pureza
function buildOres() {
  game.oreModels = new Map();
  const rnd = mulberry32(world.seed ^ 0x0e5);
  for (const n of nodes) {
    const ore = ORES[n.type];
    const k = key(n.cx, n.cz);
    ores.set(k, n.type);
    purity.set(k, n.purity);
    const scale = PURITY[n.purity].escala;
    const model = n.type === 'calcario' ? 'a_boulder' : rnd() < 0.5 ? 'crystalA' : 'crystalB';
    const s = model === 'a_boulder' ? scale * 0.42 : scale;
    const batch = addStatic(model, n.x, n.z, rnd() * Math.PI * 2, s, n.y - 0.05, { cor: ore.cor, emissivo: ore.cor, forca: n.purity === 'puro' ? 0.4 : 0.12 });
    game.oreModels.set(k, { batch, scale: s });
  }
}

// cápsula de pouso: onde você chega em KX-7
function buildPod() {
  const s = world.spots[world.start];
  const px = s.x - 3, pz = s.z + 2;
  const y = heightAt(px, pz);
  const pod = cloneModel('pod3');
  pod.position.set(px, y - 0.05, pz);
  pod.rotation.y = -2.0; // escotilha virada pro lugar onde você aparece
  game.scene.add(pod);
  // a nave é comprida: um círculo no meio e um em cada ponta (bico e motores)
  const ax = Math.cos(pod.rotation.y), az = -Math.sin(pod.rotation.y);
  colliders.push({ x: px, z: pz, r: 2.0 }, { x: px + ax * 2.6, z: pz + az * 2.6, r: 1.3 }, { x: px - ax * 2.4, z: pz - az * 2.4, r: 1.3 });
  game.pod = pod;
  pod.updateMatrixWorld(true);
  game.podSmoke = pod.getObjectByName('smoke');
  game.podGlow = pod.getObjectByName('glow');
  if (game.podGlow) game.podGlow.material = game.podGlow.material.clone();
  game.spawn = new THREE.Vector3(s.x + 2.5, 0, s.z + 4.5);
  game.spawnYaw = Math.atan2(px - game.spawn.x, pz - game.spawn.z) + Math.PI;
}

// nave caída: fumacinha saindo do motor e a luz de emergência piscando
let podT = 0, smokeT = 0;
const _sp = new THREE.Vector3();
export function updatePod(dt) {
  if (!game.pod) return;
  podT += dt; smokeT -= dt;
  if (game.podGlow) game.podGlow.material.emissiveIntensity = Math.sin(podT * 4) > 0.3 ? 2.2 : 0.15;
  if (game.podSmoke && smokeT <= 0 && game.camera.position.distanceToSquared(game.pod.position) < 120 * 120) {
    smokeT = 0.35;
    game.podSmoke.getWorldPosition(_sp);
    puff(_sp, { color: 0x5a5e66, count: 1, size: 0.7, up: 1.1, spread: 0.25, life: 3.2, opacity: 0.35, grow: 3 });
  }
}

// ─── consultas usadas pelo resto do jogo ───
export function isBuildableCell(x, z) {
  const c = { x: (x + 0.5) * CELL, z: (z + 0.5) * CELL };
  return inMap(c.x, c.z) && heightAt(c.x, c.z) > WATER - 0.4;
}
export function purityAt(x, z) { return purity.get(key(x, z)) || 'normal'; }
export function setOreVisible(x, z, v, k = 0.45) {
  const m = game.oreModels?.get(key(x, z));
  if (!m) return;
  if (m.batch) setStaticScale(m.batch, v ? m.scale : m.scale * k);
  else m.scale.setScalar(v ? 0.95 : 0.95 * k); // veio de meteorito (objeto comum)
}
// minerador 3×3: o veio do meio fica baixinho embaixo da broca e os outros do terreno somem
export function minerOres(x, z, v) {
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) setOreVisible(x + dx, z + dz, v, dx || dz ? 0.001 : 0.45);
}
export function groundY(x, z) { return heightAt(x, z); }
export { biomeAt, weightsAt, BIOMES, BIOME_KEYS, world };
// sistemas antigos (regiões compráveis e painel do mercado) não existem mais
export function regionAt() { return null; }
export function clearRegion() { }
export function updateMarketBoard() { }
export function isPadCell() { return false; }
