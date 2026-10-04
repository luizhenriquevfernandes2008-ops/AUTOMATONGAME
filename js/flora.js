// A vida de KX-7: plantas próprias de cada bioma. Algumas vêm do kit de natureza (retingidas com as cores
// do planeta), outras são montadas por código (cacto-lanterna, samambaia-espiral, junco luminoso,
// espinhos de gelo, árvore-guarda-chuva). Tudo instanciado: milhares de plantas custam poucas chamadas.
// À noite muitas brilham; algumas se encolhem quando você chega perto (a "dormideira" de KX-7); o vento balança tudo.
import * as THREE from 'three';
import { assets } from './assets.js';
import { game } from './state.js';
import { CELL } from './data.js';
import { makeSimplex, mulberry32, fbm, smooth } from './noise.js';
import { world, heightAt, slopeAt, weightsAt, HALF, WATER, BIOME_KEYS } from './terrain.js';
import { nodes } from './world.js';

// ─── espécies ───
// h: altura [min, max] (m) · p: chance por amostra · drop: o que dá ao coletar · col: raio de colisão por metro de altura
// dist: até onde aparece (m) · wind/react/glow: vento, reação ao jogador, brilho noturno
export const SPECIES = [
  // Floresta das Serras
  { id: 'pinheiro_azul', nome: 'Pinheiro-azul', biome: 'floresta', models: ['f_tree_pineTallA', 'f_tree_pineTallB'], h: [7, 13], tint: { leafsDark: 0x2c7c8c, woodBarkDark: 0x5a3e34 }, kind: 'arvore', drop: { madeira: [4, 6], folhas: [2, 3] }, col: 0.045, dist: 320, wind: 0.5 },
  { id: 'arvore_lira', nome: 'Árvore-lira', biome: 'floresta', models: ['f_tree_plateau'], h: [6, 10], tint: { leafsGreen: 0x3fc2a6, woodBark: 0x6a4e9a }, kind: 'arvore', drop: { madeira: [3, 5], folhas: [3, 4] }, col: 0.05, dist: 320, wind: 0.6, glow: { leafsGreen: 0x2fffd0 }, glowK: 0.18 },
  { id: 'carvalho_ambar', nome: 'Carvalho-âmbar', biome: 'floresta', models: ['f_tree_oak', 'f_tree_detailed'], h: [5, 8], tint: { leafsGreen: 0xd8902a, woodBark: 0x5e4636, _defaultMat: 0x5e4636 }, kind: 'arvore', drop: { madeira: [3, 5], folhas: [2, 4] }, col: 0.06, dist: 300, wind: 0.6 },
  { id: 'arbusto_azul', nome: 'Arbusto-azul', biome: 'floresta', models: ['f_plant_bush', 'f_plant_bushLarge'], h: [0.8, 1.6], tint: { grass: 0x3f9a8a }, kind: 'arbusto', drop: { folhas: [2, 3], fibra: [1, 1] }, dist: 140, wind: 1.2 },
  { id: 'samambaia_espiral', nome: 'Samambaia-espiral', biome: 'floresta', models: ['p_fern'], h: [0.6, 1.2], tint: { leafs: 0x56b07a }, kind: 'arbusto', drop: { folhas: [1, 2], fibra: [1, 2] }, dist: 110, wind: 1.4, react: 1, glow: { tip: 0x9dff7a }, glowK: 0.6 },
  { id: 'capim_serra', nome: 'Capim-da-serra', biome: 'floresta', models: ['f_grass_large', 'f_grass'], h: [0.45, 0.9], tint: { grass: 0x5fae6a }, kind: 'capim', drop: { fibra: [1, 1] }, dist: 75, wind: 2 },
  { id: 'sensitiva', nome: 'Sensitiva-violeta', biome: 'floresta', models: ['f_flower_purpleA', 'f_flower_purpleB', 'f_flower_purpleC'], h: [0.45, 0.8], tint: { grass: 0x4f9a6a, colorPurple: 0xc58aff }, kind: 'flor', drop: { fibra: [1, 1], folhas: [1, 1] }, dist: 80, wind: 1.6, react: 1, glow: { colorPurple: 0xb070ff }, glowK: 0.9 },
  // Cânion Vermelho
  { id: 'cacto_lanterna', nome: 'Cacto-lanterna', biome: 'canion', models: ['p_cactus'], h: [1.6, 3.6], tint: { leafs: 0x6f9a62 }, kind: 'cacto', drop: { fibra: [2, 4] }, col: 0.09, dist: 220, wind: 0.1, glow: { tip: 0xffa640 }, glowK: 1.1 },
  { id: 'arbusto_ferrugem', nome: 'Arbusto-ferrugem', biome: 'canion', models: ['f_plant_bushSmall', 'f_plant_bush'], h: [0.6, 1.2], tint: { grass: 0xa0522d }, kind: 'arbusto', drop: { folhas: [1, 2], fibra: [1, 2] }, dist: 120, wind: 1 },
  { id: 'capim_seco', nome: 'Capim-seco', biome: 'canion', models: ['f_grass'], h: [0.35, 0.7], tint: { grass: 0xc8a060 }, kind: 'capim', drop: { fibra: [1, 1] }, dist: 70, wind: 1.8 },
  { id: 'agulha', nome: 'Agulha de pedra', biome: 'canion', models: ['a_spire'], h: [5, 10], kind: 'rocha', col: 0.12, dist: 420, wind: 0, solid: true },
  { id: 'rochedo', nome: 'Rochedo', biome: 'canion', models: ['a_boulder', 'a_rockA'], h: [1.2, 3.2], kind: 'rocha', col: 0.35, dist: 260, wind: 0, solid: true },
  // Tundra Gelada
  { id: 'pinheiro_gelo', nome: 'Pinheiro-de-gelo', biome: 'tundra', models: ['f_tree_pineRoundA', 'f_tree_pineRoundB', 'f_tree_pineRoundC'], h: [5, 10], tint: { leafsDark: 0xcfe6f2, woodBarkDark: 0x4a3e3a }, kind: 'arvore', drop: { madeira: [3, 5], folhas: [1, 2] }, col: 0.06, dist: 320, wind: 0.35 },
  { id: 'espinho_gelo', nome: 'Espinhos de gelo', biome: 'tundra', models: ['p_ice'], h: [1, 3.2], tint: { ice: 0x9fe0ff }, kind: 'gelo', col: 0.25, dist: 240, wind: 0, glow: { ice: 0x6fd8ff }, glowK: 0.25, solid: true },
  { id: 'musgo_aurora', nome: 'Musgo-aurora', biome: 'tundra', models: ['f_grass_leafs', 'f_plant_bushSmall'], h: [0.3, 0.6], tint: { grass: 0x4fc8b8 }, kind: 'capim', drop: { fibra: [1, 1], folhas: [1, 1] }, dist: 85, wind: 0.8, glow: { grass: 0x40ffd0 }, glowK: 0.55, react: 0.6 },
  // Campos de Cristal
  { id: 'cristal_gigante', nome: 'Cristal gigante', biome: 'cristal', models: ['a_crystalK', 'a_crystalK2'], h: [2.5, 7], tint: { rock: 0x4a3f5e, rockTrack: 0x3a3048, crystal: 0xb48aff }, kind: 'cristal', drop: { quartzo: [2, 4] }, col: 0.12, dist: 380, wind: 0, glow: { crystal: 0xa070ff }, glowK: 0.7, solid: true },
  { id: 'guarda_chuva', nome: 'Árvore-guarda-chuva', biome: 'cristal', models: ['p_umbrella'], h: [6, 11], tint: { wood: 0xe8dcf0, leafs: 0x8a5ad8 }, kind: 'arvore', drop: { madeira: [2, 4], folhas: [3, 5] }, col: 0.03, dist: 340, wind: 0.4, glow: { tip: 0xd08aff }, glowK: 1 },
  { id: 'flor_prisma', nome: 'Flor-prisma', biome: 'cristal', models: ['f_flower_yellowA', 'f_flower_redA'], h: [0.5, 0.9], tint: { grass: 0x7a6ab8, colorYellow: 0x7ff4ff, colorRed: 0xff8ae8 }, kind: 'flor', drop: { fibra: [1, 1] }, dist: 85, wind: 1.4, react: 1, glow: { colorYellow: 0x7ff4ff, colorRed: 0xff7ae0 }, glowK: 1 },
  { id: 'grama_lilas', nome: 'Grama-lilás', biome: 'cristal', models: ['f_grass', 'f_grass_large'], h: [0.4, 0.8], tint: { grass: 0x9a80d0 }, kind: 'capim', drop: { fibra: [1, 1] }, dist: 75, wind: 1.8 },
  // Pântano Luminoso
  { id: 'cogumelo_gigante', nome: 'Cogumelo-gigante', biome: 'pantano', models: ['f_mushroom_redTall', 'f_mushroom_tanTall'], h: [3, 8], tint: { colorRed: 0x2fbf8a, colorTan: 0x3fa8c8, _defaultMat: 0xe6dcc8 }, kind: 'cogumelo', drop: { esporos: [3, 5], biomassa: [1, 2] }, col: 0.05, dist: 340, wind: 0.15, glow: { colorRed: 0x3dffb0, colorTan: 0x4dd8ff }, glowK: 0.9 },
  { id: 'cogumelo_pequeno', nome: 'Cogumelos-vaga-lume', biome: 'pantano', models: ['f_mushroom_redGroup', 'f_mushroom_tanGroup'], h: [0.4, 0.8], tint: { colorRed: 0x5fe0a0, colorTan: 0x8fe0ff, _defaultMat: 0xe6dcc8 }, kind: 'flor', drop: { esporos: [1, 2] }, dist: 90, wind: 0.2, react: 1, glow: { colorRed: 0x5dffb0, colorTan: 0x8de8ff }, glowK: 1.2 },
  { id: 'junco', nome: 'Junco-luminoso', biome: 'pantano', models: ['p_reeds'], h: [1.2, 2.2], tint: { leafs: 0x4f7a4a }, kind: 'capim', drop: { fibra: [1, 2] }, dist: 110, wind: 1.6, react: 0.8, glow: { tip: 0x7dff9a }, glowK: 1.2 },
  { id: 'vitoria_regia', nome: 'Vitória-régia-de-luz', biome: 'pantano', models: ['f_lily_large', 'f_lily_small'], h: [1.4, 2.6], tint: { leafsGreen: 0x3f8a5a, leafsDark: 0x2f6a4a, colorRed: 0xff9ad8 }, kind: 'agua', drop: { folhas: [1, 2] }, dist: 120, wind: 0.2, glow: { colorRed: 0xff7ad0 }, glowK: 1, water: true },
  { id: 'arvore_morta', nome: 'Árvore-fantasma', biome: 'pantano', models: ['f_tree_simple_fall', 'f_tree_tall'], h: [4, 7], tint: { leafsFall: 0x6a8a6a, woodBirch: 0xb8b0a0, leafsGreen: 0x5a7a5a, woodBark: 0x5a4a3a }, kind: 'arvore', drop: { madeira: [2, 4], folhas: [1, 2] }, col: 0.05, dist: 300, wind: 0.4 },
];
const SP = Object.fromEntries(SPECIES.map((s, i) => [s.id, i]));

// quanto de cada espécie por amostra (3,2 m), em função do lugar
function chooseSpecies(b, x, z, h, slope, rnd, nF, nG) {
  const forest = fbm(nF, x / 95, z / 95, 3);
  const meadow = nG(x / 40, z / 40);
  const r = rnd();
  const pick = (list) => { let t = r; for (const [id, p] of list) { if (t < p) return SP[id]; t -= p; } return -1; };
  if (b === 'floresta') {
    if (h > 58 || slope > 1.1) return slope < 1.6 && h < 70 ? pick([['capim_serra', 0.05]]) : -1;
    const tp = smooth(-0.15, 0.35, forest) * (slope > 0.8 ? 0.3 : 1);
    if (r < tp * 0.5) return pickTree(rnd, [['pinheiro_azul', h > 30 ? 0.75 : 0.4], ['arvore_lira', 0.3], ['carvalho_ambar', h > 30 ? 0.05 : 0.3]]);
    return pick([['__', tp * 0.5], ['arbusto_azul', 0.05], ['samambaia_espiral', 0.04 + tp * 0.05], ['capim_serra', 0.16 + Math.max(0, meadow) * 0.2], ['sensitiva', 0.03 + Math.max(0, -meadow) * 0.06]]);
  }
  if (b === 'canion') {
    if (slope > 0.9) return -1; // pedra em encosta íngreme parecia flutuar
    return pick([['cacto_lanterna', 0.035], ['arbusto_ferrugem', 0.04], ['capim_seco', 0.07 + Math.max(0, meadow) * 0.1], ['agulha', 0.0035], ['rochedo', 0.012]]);
  }
  if (b === 'tundra') {
    if (slope > 1) return r < 0.01 ? SP.espinho_gelo : -1;
    const tp = smooth(0.0, 0.45, forest) * 0.35;
    if (r < tp) return SP.pinheiro_gelo;
    return pick([['__', tp], ['espinho_gelo', 0.018], ['musgo_aurora', 0.1 + Math.max(0, meadow) * 0.12]]);
  }
  if (b === 'cristal') {
    if (slope > 0.9) return r < 0.03 ? SP.cristal_gigante : -1;
    const cluster = smooth(0.2, 0.55, forest);
    return pick([['cristal_gigante', 0.01 + cluster * 0.08], ['guarda_chuva', 0.012 + Math.max(0, -forest) * 0.05], ['flor_prisma', 0.05 + Math.max(0, meadow) * 0.08], ['grama_lilas', 0.16]]);
  }
  if (b === 'pantano') {
    const tp = smooth(-0.1, 0.4, forest);
    return pick([['cogumelo_gigante', 0.03 + tp * 0.12], ['arvore_morta', 0.02 + tp * 0.03], ['cogumelo_pequeno', 0.06], ['junco', 0.14 + (h < 1.2 ? 0.15 : 0)]]);
  }
  return -1;
}
function pickTree(rnd, list) {
  let t = rnd() * list.reduce((a, [, p]) => a + p, 0);
  for (const [id, p] of list) { t -= p; if (t <= 0) return SP[id]; }
  return SP[list[0][0]];
}

// ─── modelos montados por código (altura 1, materiais com nome pra retingir) ───
function stdMat(name, color, opts = {}) { const m = new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...opts }); m.name = name; return m; }
function wrapModel(g) {
  const o = new THREE.Group();
  o.add(g);
  o.userData.size = new THREE.Vector3(1, 1, 1);
  o.traverse((x) => { if (x.isMesh) { x.castShadow = true; x.receiveShadow = true; } });
  return o;
}
function buildProceduralFlora() {
  const M = assets.models;
  const leafs = stdMat('leafs', 0x5f9a62), tip = stdMat('tip', 0xffd090), wood = stdMat('wood', 0xd8d0e0), ice = stdMat('ice', 0xa8e4ff, { roughness: 0.15, metalness: 0.1 });
  // cacto-lanterna: tronco, dois braços e pontas que acendem à noite
  {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.72, 4, 8), leafs); body.position.y = 0.46; g.add(body);
    for (const [sx, y, h] of [[1, 0.42, 0.3], [-1, 0.55, 0.22]]) {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.16, 3, 6), leafs); arm.rotation.z = Math.PI / 2; arm.position.set(sx * 0.15, y, 0); g.add(arm);
      const up = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, h, 3, 6), leafs); up.position.set(sx * 0.26, y + h / 2 + 0.04, 0); g.add(up);
      const t = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 6), tip); t.position.set(sx * 0.26, y + h + 0.1, 0); g.add(t);
    }
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 6), tip); top.position.y = 0.92; g.add(top);
    M.p_cactus = wrapModel(g);
  }
  // samambaia-espiral: folhas que terminam enroladas (com um brotinho que brilha)
  {
    const g = new THREE.Group();
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      const pts = [];
      for (let i = 0; i <= 16; i++) {
        const t = i / 16;
        const r = t < 0.7 ? t * 0.55 : 0.385 + Math.sin((t - 0.7) * 14) * 0.08;
        const y = t < 0.7 ? Math.sin(t / 0.7 * Math.PI * 0.5) * 0.8 : 0.8 - (1 - Math.cos((t - 0.7) * 14)) * 0.08;
        pts.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
      }
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.022, 4), leafs);
      g.add(tube);
      const bud = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), tip); bud.position.copy(pts[pts.length - 1]); g.add(bud);
    }
    M.p_fern = wrapModel(g);
  }
  // junco luminoso: hastes finas com a ponta acesa
  {
    const g = new THREE.Group();
    const rnd = mulberry32(77);
    for (let k = 0; k < 9; k++) {
      const h = 0.6 + rnd() * 0.4, a = rnd() * Math.PI * 2, r = rnd() * 0.18;
      const s = new THREE.Mesh(new THREE.ConeGeometry(0.018, h, 4), leafs);
      s.position.set(Math.cos(a) * r, h / 2, Math.sin(a) * r);
      s.rotation.set((rnd() - 0.5) * 0.3, 0, (rnd() - 0.5) * 0.3);
      g.add(s);
      const t = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), tip); t.position.set(s.position.x, h, s.position.z); g.add(t);
    }
    M.p_reeds = wrapModel(g);
  }
  // espinhos de gelo
  {
    const g = new THREE.Group();
    const rnd = mulberry32(99);
    for (let k = 0; k < 6; k++) {
      const h = 0.45 + rnd() * 0.55, a = rnd() * Math.PI * 2, r = k ? 0.15 + rnd() * 0.2 : 0;
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.08 + h * 0.12, h, 5), ice);
      c.position.set(Math.cos(a) * r, h / 2 - 0.03, Math.sin(a) * r);
      c.rotation.set(Math.sin(a) * r * 1.4, 0, -Math.cos(a) * r * 1.4);
      g.add(c);
    }
    M.p_ice = wrapModel(g);
  }
  // árvore-guarda-chuva: tronco fino e torto, copa achatada com a borda acesa por baixo
  {
    const g = new THREE.Group();
    const pts = [0, 0.25, 0.5, 0.75, 0.9].map((y, i) => new THREE.Vector3(Math.sin(i * 0.9) * 0.04, y, Math.cos(i * 1.3) * 0.03));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.035, 6), wood));
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.16, 0.08, 12), leafs); cap.position.y = 0.92; g.add(cap);
    const cap2 = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 0.06, 12), leafs); cap2.position.y = 0.99; g.add(cap2);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.022, 6, 24), tip); ring.rotation.x = Math.PI / 2; ring.position.y = 0.88; g.add(ring);
    M.p_umbrella = wrapModel(g);
  }
}

// ─── material com vento, brilho e reação ───
export const floraUniforms = { uTime: { value: 0 }, uNight: { value: 0 }, uPlayer: { value: new THREE.Vector3() }, uWind: { value: 1 } };
function floraMaterial(base, sp, glowHex) {
  const m = base.clone();
  const wind = sp.wind || 0, react = sp.react || 0;
  m.userData.glow = glowHex != null ? new THREE.Color(glowHex) : null;
  if (glowHex != null) { m.emissive = new THREE.Color(glowHex); m.emissiveIntensity = 0; }
  else if (m.emissive) { m.emissive.setRGB(0, 0, 0); m.emissiveMap = null; }
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, floraUniforms);
    sh.uniforms.uGlowK = { value: glowHex != null ? sp.glowK ?? 0.6 : 0 };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
uniform float uTime, uWind; uniform vec3 uPlayer; varying float vNear;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
  float hgt = max(0.0, transformed.y);
  float ph = ip.x * 0.31 + ip.z * 0.23;
  float sway = (sin(uTime * 1.6 + ph) + 0.4 * sin(uTime * 3.7 + ph * 2.0)) * uWind * ${wind.toFixed(2)} * hgt * hgt * 0.06;
  transformed.x += sway; transformed.z += sway * 0.6;
  float dP = distance(ip.xz, uPlayer.xz);
  float near = (1.0 - smoothstep(1.2, 4.0, dP)) * ${react.toFixed(2)};
  transformed.xz *= 1.0 - near * 0.35;
  transformed.y *= 1.0 - near * 0.3;
  vNear = near;
}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uTime, uNight, uGlowK; varying float vNear;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance *= 0.0;
totalEmissiveRadiance += emissive * uGlowK * (uNight * (0.75 + 0.25 * sin(uTime * 1.7 + vNear * 3.0)) + vNear * 1.2);`);
  };
  m.customProgramCacheKey = () => `flora|${wind}|${react}|${glowHex != null}`;
  return m;
}

// partes de um modelo (geometria já no espaço do modelo, pra todas as partes usarem a mesma matriz por instância)
function speciesParts(sp, modelKey) {
  const tpl = assets.models[modelKey];
  if (!tpl) return [];
  tpl.updateMatrixWorld(true);
  const inv = tpl.matrixWorld.clone().invert();
  const parts = [];
  tpl.traverse((o) => {
    if (!o.isMesh) return;
    const name = o.material.name;
    let base = o.material;
    const tintHex = sp.tint && sp.tint[name];
    if (tintHex != null || sp.glowAll != null) { base = base.clone(); if (tintHex != null) base.color = new THREE.Color(tintHex); }
    const glowHex = sp.glowAll != null ? sp.glowAll : sp.glow ? sp.glow[name] : null;
    const geo = o.geometry.clone();
    geo.applyMatrix4(inv.clone().multiply(o.matrixWorld));
    geo.morphAttributes = {};
    parts.push({ geo, mat: floraMaterial(base, sp, glowHex), cast: sp.kind !== 'capim' && sp.kind !== 'flor' });
  });
  // todo modelo vira exatamente 1 m de altura com a base no chão (a escala da instância = altura em metros)
  const box = new THREE.Box3();
  for (const p of parts) { p.geo.computeBoundingBox(); box.union(p.geo.boundingBox); }
  const hgt = box.max.y - box.min.y;
  if (hgt > 1e-4) {
    const k = 1 / hgt, cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
    for (const p of parts) { p.geo.translate(-cx, -box.min.y, -cz); p.geo.scale(k, k, k); p.geo.computeBoundingSphere(); }
  }
  return parts;
}

// ─── dados das instâncias ───
const F = {
  n: 0, sp: null, x: null, y: null, z: null, rot: null, sc: null, model: null, alive: null,
  grid: null, G: 0, GS: 8,   // índice espacial: células de 8 m
  groups: [],                // por (espécie, modelo): { sp, parts:[{mesh}], list: Int32Array, attr }
  center: new THREE.Vector3(1e9, 0, 1e9), dirty: true, removed: [],
};
export const flora = F;

export function generateFlora() {
  buildProceduralFlora();
  const rnd = mulberry32(world.seed ^ 0xf10a);
  const nF = makeSimplex(world.seed ^ 0x1f), nG = makeSimplex(world.seed ^ 0x2f);
  const STEP = 3.2;
  const tmp = { sp: [], x: [], y: [], z: [], rot: [], sc: [], model: [] };
  const spots = Object.values(world.spots);
  // células ocupadas por veios (pra não nascer planta em cima)
  const nodeCells = new Set(nodes.map((n) => n.cx + ',' + n.cz));
  for (let gz = -HALF + STEP / 2; gz < HALF; gz += STEP) {
    for (let gx = -HALF + STEP / 2; gx < HALF; gx += STEP) {
      const x = gx + (rnd() - 0.5) * STEP * 0.9, z = gz + (rnd() - 0.5) * STEP * 0.9;
      if (Math.abs(x) > HALF - 30 || Math.abs(z) > HALF - 30) continue;
      const h = heightAt(x, z);
      // bioma desta amostra: sorteado pelos pesos (borda misturada fica natural)
      const w = weightsAt(x, z);
      let t = rnd(), bi = 0;
      for (let i = 0; i < 5; i++) { t -= w[i]; if (t <= 0) { bi = i; break; } }
      const b = BIOME_KEYS[bi];
      const slope = slopeAt(x, z);
      let si = chooseSpecies(b, x, z, h, slope, rnd, nF, nG);
      // vitória-régia: só na água rasa do pântano
      if (b === 'pantano' && h < WATER - 0.25 && h > WATER - 1.8) si = rnd() < 0.18 ? SP.vitoria_regia : -1;
      if (si < 0) continue;
      const s = SPECIES[si];
      if (!s.water && h < WATER + 0.15) continue;
      if (s.kind !== 'capim' && s.kind !== 'flor' && spots.some((p) => Math.hypot(p.x - x, p.z - z) < (s.kind === 'arvore' || s.solid ? 30 : 14))) continue;
      if (nodeCells.has(Math.floor(x / CELL) + ',' + Math.floor(z / CELL))) continue;
      const sc = s.h[0] + rnd() * (s.h[1] - s.h[0]);
      tmp.sp.push(si); tmp.x.push(x); tmp.z.push(z); tmp.y.push(s.water ? WATER + 0.03 : h - 0.05 - (s.kind === 'arvore' ? 0.15 : 0) - (s.solid ? sc * (0.1 + Math.min(slope, 1) * 0.3) : 0));
      tmp.rot.push(rnd() * Math.PI * 2); tmp.sc.push(sc); tmp.model.push(Math.floor(rnd() * s.models.length));
    }
  }
  const n = tmp.sp.length;
  F.n = n;
  F.sp = Uint8Array.from(tmp.sp); F.model = Uint8Array.from(tmp.model);
  F.x = Float32Array.from(tmp.x); F.y = Float32Array.from(tmp.y); F.z = Float32Array.from(tmp.z);
  F.rot = Float32Array.from(tmp.rot); F.sc = Float32Array.from(tmp.sc);
  F.alive = new Uint8Array(n).fill(1);
  // índice espacial
  F.G = Math.ceil((HALF * 2) / F.GS);
  F.grid = Array.from({ length: F.G * F.G }, () => []);
  for (let i = 0; i < n; i++) F.grid[gridIdx(F.x[i], F.z[i])].push(i);
  // grupos de desenho
  F.groups = [];
  const byKey = new Map();
  for (let i = 0; i < n; i++) {
    const k = F.sp[i] * 8 + F.model[i];
    if (!byKey.has(k)) byKey.set(k, { count: 0 });
    byKey.get(k).count++;
  }
  for (const [k, info] of byKey) {
    const si = Math.floor(k / 8), mi = k % 8;
    const sp = SPECIES[si];
    const parts = speciesParts(sp, sp.models[mi]);
    if (!parts.length) continue;
    const cap = Math.min(info.count, 6000);
    const attr = new THREE.InstancedBufferAttribute(new Float32Array(cap * 16), 16);
    attr.setUsage(THREE.DynamicDrawUsage);
    const meshes = parts.map((p) => {
      const m = new THREE.InstancedMesh(p.geo, p.mat, cap);
      m.instanceMatrix = attr;
      m.count = 0;
      m.castShadow = p.cast; m.receiveShadow = true;
      m.frustumCulled = false;
      game.scene.add(m);
      return m;
    });
    F.groups.push({ key: k, si, mi, sp, meshes, attr, cap });
  }
  F.groupOf = new Map(F.groups.map((g) => [g.key, g]));
  F.dirty = true;
  return n;
}
const gridIdx = (x, z) => {
  const i = Math.max(0, Math.min(F.G - 1, Math.floor((x + HALF) / F.GS)));
  const j = Math.max(0, Math.min(F.G - 1, Math.floor((z + HALF) / F.GS)));
  return j * F.G + i;
};

// redesenha só o que está perto do jogador (cada espécie tem sua distância)
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
let distMul = 1;
export function setFloraDistance(k) { distMul = k; F.dirty = true; }
game.setFloraDistance = setFloraDistance;
function rebuild(cx, cz) {
  F.center.set(cx, 0, cz);
  F.dirty = false;
  const counts = new Map(F.groups.map((g) => [g.key, 0]));
  const maxD = 420 * distMul;
  const r = Math.ceil(maxD / F.GS);
  const ci = Math.floor((cx + HALF) / F.GS), cj = Math.floor((cz + HALF) / F.GS);
  for (let j = Math.max(0, cj - r); j <= Math.min(F.G - 1, cj + r); j++) {
    for (let i = Math.max(0, ci - r); i <= Math.min(F.G - 1, ci + r); i++) {
      const cell = F.grid[j * F.G + i];
      for (let k = 0; k < cell.length; k++) {
        const id = cell[k];
        if (!F.alive[id]) continue;
        const sp = SPECIES[F.sp[id]];
        const dx = F.x[id] - cx, dz = F.z[id] - cz, d = sp.dist * distMul;
        if (dx * dx + dz * dz > d * d) continue;
        const gk = F.sp[id] * 8 + F.model[id];
        const g = F.groupOf.get(gk);
        if (!g) continue;
        const c = counts.get(gk);
        if (c >= g.cap) continue;
        const sc = F.sc[id];
        _m.compose(_p.set(F.x[id], F.y[id], F.z[id]), _q.setFromAxisAngle(_up, F.rot[id]), _s.set(sc, sc, sc));
        _m.toArray(g.attr.array, c * 16);
        counts.set(gk, c + 1);
      }
    }
  }
  for (const g of F.groups) {
    const c = counts.get(g.key);
    for (const m of g.meshes) m.count = c;
    g.attr.needsUpdate = true;
  }
}

export function updateFlora(dt) {
  if (!F.n) return;
  const cam = game.camera.position;
  floraUniforms.uTime.value += dt;
  floraUniforms.uPlayer.value.copy(cam);
  floraUniforms.uNight.value = game.floraNight ?? game.nightK ?? (game.isNight ? 1 : 0);
  if (F.dirty || Math.hypot(cam.x - F.center.x, cam.z - F.center.z) > 14) rebuild(cam.x, cam.z);
}

// ─── consultas ───
// colisão do jogador com troncos, rochas, cristais
export function floraBlocked(x, z, r) {
  if (!F.n) return false;
  const ci = Math.floor((x + HALF) / F.GS), cj = Math.floor((z + HALF) / F.GS);
  for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) {
    if (i < 0 || j < 0 || i >= F.G || j >= F.G) continue;
    for (const id of F.grid[j * F.G + i]) {
      if (!F.alive[id]) continue;
      const sp = SPECIES[F.sp[id]];
      if (!sp.col) continue;
      const rr = sp.col * F.sc[id] + r;
      const dx = x - F.x[id], dz = z - F.z[id];
      if (dx * dx + dz * dz < rr * rr) return true;
    }
  }
  return false;
}
// planta na mira: aproxima cada planta por um cilindro em volta do tronco
const _v = new THREE.Vector3();
export function aimFlora(ray, maxDist = 5) {
  if (!F.n) return null;
  const o = ray.origin, d = ray.direction;
  let best = null;
  const ci = Math.floor((o.x + HALF) / F.GS), cj = Math.floor((o.z + HALF) / F.GS);
  for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) {
    if (i < 0 || j < 0 || i >= F.G || j >= F.G) continue;
    for (const id of F.grid[j * F.G + i]) {
      if (!F.alive[id]) continue;
      const sp = SPECIES[F.sp[id]];
      if (!sp.drop) continue;
      const sc = F.sc[id];
      const rad = Math.max(0.35, (sp.col || 0.25) * sc + 0.2), top = F.y[id] + sc * (sp.kind === 'arvore' ? 0.6 : 1);
      // ponto do raio mais perto do eixo da planta (no plano xz)
      const px = F.x[id] - o.x, pz = F.z[id] - o.z;
      const L = d.x * d.x + d.z * d.z;
      const t = L > 1e-6 ? Math.max(0, (px * d.x + pz * d.z) / L) : 0;
      if (t > maxDist) continue;
      _v.copy(o).addScaledVector(d, t);
      const dist2 = (_v.x - F.x[id]) ** 2 + (_v.z - F.z[id]) ** 2;
      if (dist2 > rad * rad || _v.y < F.y[id] - 0.3 || _v.y > top + 0.3) continue;
      if (!best || t < best.dist) best = { id, sp, dist: t, point: _v.clone() };
    }
  }
  return best;
}
export function floraInfo(id) { return { sp: SPECIES[F.sp[id]], x: F.x[id], y: F.y[id], z: F.z[id], sc: F.sc[id] }; }

// tira uma planta (coletada ou por construção). net: veio do multiplayer (não manda de volta)
export function removeFlora(id, net = false) {
  if (!F.alive[id]) return false;
  F.alive[id] = 0;
  F.removed.push(id);
  F.dirty = true;
  if (!net) game.mp?.op?.('flora', { id });
  return true;
}
// construção: limpa as plantas da célula (sem dar itens, igual ao Satisfactory)
export function clearFloraCell(cx, cz) {
  const x0 = cx * CELL - 0.3, x1 = (cx + 1) * CELL + 0.3, z0 = cz * CELL - 0.3, z1 = (cz + 1) * CELL + 0.3;
  const idx = gridIdx((cx + 0.5) * CELL, (cz + 0.5) * CELL);
  const i0 = idx % F.G, j0 = Math.floor(idx / F.G);
  for (let j = j0 - 1; j <= j0 + 1; j++) for (let i = i0 - 1; i <= i0 + 1; i++) {
    if (i < 0 || j < 0 || i >= F.G || j >= F.G) continue;
    for (const id of F.grid[j * F.G + i]) {
      if (!F.alive[id]) continue;
      const sp = SPECIES[F.sp[id]];
      const pad = sp.col ? sp.col * F.sc[id] : 0;
      if (F.x[id] + pad > x0 && F.x[id] - pad < x1 && F.z[id] + pad > z0 && F.z[id] - pad < z1) removeFlora(id);
    }
  }
}

// ─── salvar ───
export function serializeFlora() {
  const r = [...new Set(F.removed)].sort((a, b) => a - b);
  // diferenças entre ids (fica bem menor no save)
  let prev = 0;
  return r.map((v) => { const d = v - prev; prev = v; return d; }).join(',');
}
export function loadFlora(s) {
  if (!s || !F.n) return;
  let acc = 0;
  for (const part of String(s).split(',')) {
    const d = parseInt(part, 10);
    if (!Number.isFinite(d)) continue;
    acc += d;
    if (acc >= 0 && acc < F.n && F.alive[acc]) { F.alive[acc] = 0; F.removed.push(acc); }
  }
  F.dirty = true;
}
