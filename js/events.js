// 3.0 · Natureza viva de KX-7: eventos naturais com efeitos leves e bons, e a "vida" do ar.
//  · ☄️ Chuva de meteoros (noite): estrelas cadentes no céu, uns caem perto de você e deixam um veio
//    de meteorito (minerador tira Fragmento Estelar) e pedrinhas pra pegar com E.
//  · 🌌 Aurora (noite, mais comum na tundra e com Júpiter perto): painéis solares rendem 25% à noite.
//  · 🌿 Floração luminosa (noite): a flora brilha forte, plantas rendem o dobro, Luminita +30%.
//  · 🪐 Júpiter perto (oposição): ressonância — Cristal KX e Quartzo +25% (+50% na Grande Aproximação).
//  · 🌑 Eclipse de Mira: dia vira noite por uns segundos, a flora acende e a Luminita rende o dobro.
//  · ☄️ Cometa (às vezes, por 2 noites) e 🌈 arco-íris depois da chuva.
//  · Ar de cada bioma: vaga-lumes na floresta e no pântano, esporos no pântano, pólen de dia,
//    faíscas no campo de cristal, pó de diamante na tundra; e o tempo ruim vira chuva, neve ou areia.
import * as THREE from 'three';
import { game } from './state.js';
import { CELL } from './data.js';
import { cloneModel, tint } from './assets.js';
import { audio } from './audio.js';
import { puff, floatText } from './fx.js';
import { grid, ores, purity, key, cellCenter, foundations } from './machines.js';
import { isBuildableCell } from './world.js';
import { slopeAt, heightAt, WATER } from './terrain.js';
import { clearFloraCell } from './flora.js';
import { gainDisk } from './disks.js';
import { virtualLight } from './lights.js';

const VEIN_SIZE = 40;         // fragmentos em cada veio de meteorito
const DUR = { meteoros: 60, aurora: 200, floracao: 170, arcoiris: 100 };
const state = {
  next: 220,                  // segundos até sortear o próximo evento
  active: null,               // { tipo, ate, t0 }
  veins: [],                  // [{ x, z, left }]
  pickups: [],                // [{ x, z }]
  jupAnn: null, eclAnn: null, // última oposição / eclipse anunciados
};
game.events = state;
game.pickups = [];            // objetos 3D das pedrinhas (a mira detecta)
const fx = { reson: 0, lumi: 0, bloom: 0, aurora: 0, rainbow: 0 };
game.natureFx = fx;
let falling = [], lastWet = 0, fields = null;

// ─── efeitos leves nas máquinas (Machine.speedMul chama isto) ───
game.eventMul = (m) => {
  if (m.type !== 'minerador' || !m.oreType) return 1;
  const o = m.oreType;
  if (fx.reson > 0 && (o === 'cristal' || o === 'quartzo')) return 1 + fx.reson;
  if (fx.lumi > 0 && o === 'luminita') return 1 + fx.lumi;
  return 1;
};
export function natureBonuses() {
  const l = [];
  if (fx.reson > 0) l.push(`🪐 Ressonância: Cristal KX e Quartzo +${Math.round(fx.reson * 100)}%`);
  if (fx.lumi > 0) l.push(`✨ Luminita +${Math.round(fx.lumi * 100)}%`);
  if (fx.bloom > 0.5) l.push('🌿 Floração: plantas rendem o dobro');
  if ((game.auroraK || 0) > 0.2) l.push('🌌 Aurora: painéis solares funcionam à noite');
  return l;
}

// ─── sorteio e eventos do céu ───
export function updateEvents(dt) {
  const sky = game.sky, A = sky?.astro;
  const a = state.active;
  if (a) {
    if (game.time >= a.ate) endEvent();
  } else {
    state.next -= dt;
    if (state.next <= 0) {
      state.next = 240 + Math.random() * 300;
      const r = Math.random();
      const bw = sky?.biomeW || {};
      if (game.isNight) {
        const pAur = 0.3 + 0.35 * (bw.tundra || 0) + 0.25 * (A?.jupNear || 0);
        if (r < 0.32) startEvent('meteoros');
        else if (r < 0.32 + pAur) startEvent('aurora');
        else startEvent('floracao');
      }
    }
  }
  if (A) {
    // Júpiter chegando perto
    if (A.jupNear > 0.8 && state.jupAnn !== A.oppIndex && game.mode !== 'menu') {
      state.jupAnn = A.oppIndex;
      if (A.grand) game.ui?.banner('🪐 GRANDE APROXIMAÇÃO de Júpiter', 'O gigante nunca esteve tão perto', ['Olhe pro céu esta noite: ele está enorme', 'Ressonância: mineradores de Cristal KX e Quartzo +50%', 'Auroras muito mais fortes']);
      else game.ui?.banner('🪐 Júpiter está perto', 'Oposição: ele passa a noite inteira no céu', ['Ressonância: mineradores de Cristal KX e Quartzo +25%', 'A "luz de Júpiter" clareia a noite']);
      audio.play('quest', { volume: 0.5 });
      game.emit('evento_mundo', 'jupiter');
      if (A.grand && !state.active) state.next = Math.min(state.next, 30);
    }
    // eclipse
    if (A.eclipse > 0.03 && state.eclAnn !== Math.round(A.nextEcl) && game.mode !== 'menu') {
      state.eclAnn = Math.round(A.nextEcl);
      game.ui?.banner('🌑 Eclipse de Mira!', 'A lua Mira está passando na frente do sol', ['Por um minuto o dia vira noite', 'A flora acende e a Luminita rende o dobro']);
      game.emit('evento_mundo', 'eclipse');
    }
    const near = A.jupNear > 0.8;
    fx.reson = near ? (A.grand ? 0.5 : 0.25) : 0;
    fx.lumi = A.eclipse > 0.3 ? 1 : (fx.bloom > 0.5 ? 0.3 : 0);
  }
  // intensidades suaves dos eventos
  const ramp = (tipo, inS, outS) => (a?.tipo === tipo ? Math.max(0, Math.min(1, (game.time - a.t0) / inS, (a.ate - game.time) / outS)) : 0);
  const night = game.nightK ?? 0;
  const auroraBase = (A?.grand ? 0.5 : 0) + (sky?.biomeW?.tundra || 0) * 0.15;
  fx.aurora += (Math.max(ramp('aurora', 14, 14), auroraBase) - fx.aurora) * Math.min(1, dt * 0.5);
  fx.bloom += (ramp('floracao', 10, 12) - fx.bloom) * Math.min(1, dt * 0.5);
  fx.rainbow += (ramp('arcoiris', 8, 12) * (1 - (sky?.rainK || 0)) - fx.rainbow) * Math.min(1, dt * 0.5);
  if (sky) {
    sky.aurora = fx.aurora;
    sky.rainbow = fx.rainbow;
    sky.meteorRate = a?.tipo === 'meteoros' ? 2.4 : 1 / 40;
  }
  game.auroraK = fx.aurora * night;
  game.plantBonus = fx.bloom > 0.5 ? 2 : 1;
  game.floraNight = Math.min(1.8, Math.max(night, (game.eclipseK || 0) * 1.2) + fx.bloom * 0.9);
  if (game.mode === 'play' && game.auroraK > 0.4) game.economy.stats.auroraSeen = true;
  // arco-íris quando a chuva (de verdade, não neve nem areia) passa de dia
  const wet = sky?.wetK || 0;
  if (lastWet > 0.5 && wet < 0.3 && !game.isNight && !state.active) startEvent('arcoiris');
  lastWet = wet;
  if (a?.tipo === 'meteoros') updateMeteorShower(dt);
  updateFalling(dt);
  updateFields(dt);
  // pedrinhas giram devagar
  for (const p of game.pickups) { p.rotation.y += dt * 0.8; p.position.y = p.userData.baseY + 0.25 + Math.sin(game.time * 2 + p.position.x) * 0.05; }
}

export function startEvent(tipo) {
  if (!DUR[tipo]) return;
  if (state.active) endEvent(true);
  state.active = { tipo, ate: game.time + DUR[tipo], t0: game.time };
  if (tipo === 'meteoros') {
    state.active.landings = 2 + Math.floor(Math.random() * 2);
    state.active.landT = 9;
    game.ui?.banner('☄️ Chuva de meteoros!', 'Olhe pro céu', ['Alguns vão cair perto de você', 'Deixam um veio de meteorito (coloque um minerador!)', 'Pegue as pedrinhas brilhantes com E']);
  }
  if (tipo === 'aurora') game.ui?.toast('🌌 Uma aurora apareceu no céu! Painéis solares funcionam um pouco à noite.', 'good');
  if (tipo === 'floracao') game.ui?.toast('🌿 Floração luminosa! A flora brilha e as plantas rendem o dobro.', 'good');
  if (tipo === 'arcoiris') game.ui?.toast('🌈 Arco-íris depois da chuva!', 'good');
  game.emit('evento_mundo', tipo);
}
function endEvent() { state.active = null; }
game.startEvent = startEvent;

// cometa: aparece às vezes na virada do dia e fica 2 noites
game.on?.('newday', () => {
  const sky = game.sky;
  if (!sky || (sky.comet && sky.day < sky.comet.ate)) return;
  if (Math.random() < 0.14) {
    const ra = Math.random() * Math.PI * 2, dec = 0.2 + Math.random() * 0.5;
    sky.comet = { dir: [Math.cos(dec) * Math.cos(ra), Math.sin(dec), Math.cos(dec) * Math.sin(ra)], ate: sky.day + 2.2 };
    setTimeout(() => game.ui?.toast('☄️ Um cometa apareceu! Procure no céu à noite.', 'good'), 1000);
    game.emit('evento_mundo', 'cometa');
  }
});

// ─── meteoros que caem de verdade ───
function freeCellNear() {
  const p = game.camera.position;
  for (let tries = 0; tries < 120; tries++) {
    const ang = Math.random() * Math.PI * 2, r = 14 + Math.random() * 32;
    const wx = p.x + Math.cos(ang) * r, wz = p.z + Math.sin(ang) * r;
    const x = Math.floor(wx / CELL), z = Math.floor(wz / CELL);
    const k = key(x, z);
    if (!isBuildableCell(x, z) || grid.has(k) || ores.has(k) || foundations.has(k)) continue;
    const cx = (x + 0.5) * CELL, cz = (z + 0.5) * CELL;
    if (slopeAt(cx, cz) > 0.45 || heightAt(cx, cz) < WATER + 0.3) continue;
    let near = false;
    for (let dx = -1; dx <= 1 && !near; dx++) for (let dz = -1; dz <= 1; dz++) if (ores.has(key(x + dx, z + dz)) || grid.has(key(x + dx, z + dz))) near = true;
    if (near) continue;
    return { x, z };
  }
  return null;
}
function launchMeteor() {
  const cell = freeCellNear();
  if (!cell) return;
  const c = cellCenter(cell.x, cell.z);
  const m = cloneModel('meteorRock');
  tint(m, 0x7a5aa8, 0xff7a3a, 0.8);
  const from = new THREE.Vector3(c.x + 40, c.y + 80, c.z - 30);
  m.position.copy(from);
  game.scene.add(m);
  falling.push({ m, from, to: c, t: 0, cell });
}
function updateMeteorShower(dt) {
  const a = state.active;
  a.landT -= dt;
  if (a.landT <= 0 && a.landings > 0) { a.landings--; a.landT = 10 + Math.random() * 9; launchMeteor(); }
}
function updateFalling(dt) {
  for (let i = falling.length - 1; i >= 0; i--) {
    const f = falling[i];
    f.t += dt / 2.2;
    const k = Math.min(1, f.t);
    f.m.position.lerpVectors(f.from, f.to, k * k);
    f.m.rotation.x += dt * 3; f.m.rotation.z += dt * 2;
    if (Math.random() < dt * 40) puff(f.m.position.clone(), { color: 0xffa050, count: 1, size: 1.2, up: 0.2, life: 0.8, additive: true, spread: 0.3 });
    if (k >= 1) { land(f); falling.splice(i, 1); }
  }
}
function land(f) {
  game.scene.remove(f.m);
  const y = f.to.y;
  audio.play('meteor', { pos: f.to, volume: 0.9 });
  puff(new THREE.Vector3(f.to.x, y + 0.6, f.to.z), { color: 0xffa060, count: 22, size: 0.8, up: 2.5, spread: 2.5, life: 1.6, additive: true });
  puff(new THREE.Vector3(f.to.x, y + 0.4, f.to.z), { color: 0x9a8a7a, count: 14, size: 1.1, up: 1.2, spread: 3, life: 2.4, opacity: 0.6 });
  const k = key(f.cell.x, f.cell.z);
  if (!grid.has(k) && !ores.has(k)) { clearFloraCell(f.cell.x, f.cell.z); addVein(f.cell.x, f.cell.z, VEIN_SIZE); }
  const n = 3 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) {
    const ang = Math.random() * Math.PI * 2, r = 1.6 + Math.random() * 2.2;
    addPickup(f.to.x + Math.cos(ang) * r, f.to.z + Math.sin(ang) * r);
  }
  game.pet?.say('Caiu um meteoro! ☄️ Bora pegar as pedrinhas?', 5);
}

// veio raro de meteorito (um minerador em cima tira fragmentos estelares)
const veinObjs = new Map();
export function addVein(x, z, left) {
  const k = key(x, z);
  ores.set(k, 'estelar');
  purity.set(k, 'normal');
  const c = cellCenter(x, z);
  const g = new THREE.Group();
  g.position.copy(c);
  const crater = cloneModel('crater'); g.add(crater);
  const rock = cloneModel('meteorRock');
  tint(rock, 0x6a4a9a, 0xb18cff, 0.5);
  rock.position.y = 0.05;
  g.add(rock);
  const light = virtualLight(new THREE.PointLight(0xb18cff, 3, 5, 1.5));
  light.position.y = 1;
  g.add(light);
  game.scene.add(g);
  veinObjs.set(k, g);
  game.oreModels = game.oreModels || new Map();
  game.oreModels.set(k, rock);
  state.veins = state.veins.filter((v) => !(v.x === x && v.z === z));
  state.veins.push({ x, z, left });
}
// chamado pelo minerador a cada fragmento tirado
export function mineVein(x, z) {
  const v = state.veins.find((a) => a.x === x && a.z === z);
  if (!v) return true;
  v.left--;
  if (v.left > 0) return true;
  const k = key(x, z);
  ores.delete(k);
  const g = veinObjs.get(k);
  if (g) { game.scene.remove(g); veinObjs.delete(k); }
  game.oreModels?.delete(k);
  state.veins = state.veins.filter((a) => a !== v);
  const m = grid.get(k);
  if (m && m.type === 'minerador') { m.oreType = null; }
  game.ui?.toast('☄️ O veio de meteorito acabou. Espere a próxima chuva de meteoros!');
  return false;
}
export function veinLeft(x, z) { return state.veins.find((a) => a.x === x && a.z === z)?.left ?? 0; }
game.mineVein = mineVein;
game.veinLeft = veinLeft;

function addPickup(x, z) {
  const m = cloneModel('meteorSmall');
  tint(m, 0x8a6ad8, 0xb18cff, 0.9);
  const y = Math.max(heightAt(x, z), game.floorAt ? game.floorAt(x, z) : -1e9);
  m.position.set(x, y + 0.25, z);
  m.userData.baseY = y;
  const p = { x, z, obj: m };
  m.userData.pickup = p;
  m.traverse((o) => { o.userData.pickup = p; });
  game.scene.add(m);
  game.pickups.push(m);
  state.pickups.push(p);
  return p;
}
export function collectPickup(p, by = 'jogador') {
  const i = state.pickups.indexOf(p);
  if (i < 0) return 0;
  const eco = game.economy;
  const n = 1 + (Math.random() < 0.35 ? 1 : 0);
  if (eco.give && eco.give('fragmento_estelar', n) <= 0) { game.ui?.toast('🎒 Inventário cheio!', 'bad'); return 0; }
  state.pickups.splice(i, 1);
  game.scene.remove(p.obj);
  game.pickups = game.pickups.filter((o) => o !== p.obj);
  eco.stats.fragments = (eco.stats.fragments || 0) + n;
  audio.play('glass', { volume: 0.6, rate: 1.4 });
  const at = p.obj.position.clone();
  puff(at, { color: 0xb18cff, count: 12, size: 0.18, up: 1.6, gravity: 3, additive: true, life: 0.9 });
  floatText(at.add(new THREE.Vector3(0, 0.5, 0)), `+${n} Fragmento Estelar${by === 'oopi' ? ' (TÊTÊ)' : ''}`, '#c9a8ff');
  if (Math.random() < 0.15) { gainDisk('meteoro'); game.ui?.toast('💾 Tinha um <b>disco de dados</b> grudado na pedrinha! Analise no Laboratório.', 'ach'); }
  return n;
}

// ─── o ar de cada bioma: partículas que andam na GPU em volta da câmera ───
const fieldVert = /* glsl */`
attribute vec4 seed;
uniform vec3 uCam, uBox, uVel; uniform float uTime, uSize, uSway, uAlpha, uBlink, uScale, uTip;
varying float vA;
void main() {
  float r = seed.w;
  vec3 p = seed.xyz * uBox + uVel * uTime * (0.7 + 0.6 * r);
  p.x += sin(uTime * (0.6 + r) + r * 20.0) * uSway;
  p.z += cos(uTime * (0.5 + r * 0.8) + r * 13.0) * uSway;
  p.y += sin(uTime * (0.4 + r * 0.5) + r * 7.0) * uSway * 0.4;
  vec3 rel = mod(p - uCam + uBox * 0.5, uBox) - uBox * 0.5;
  vec3 wp = uCam + rel;
  #ifdef LINES
  wp -= normalize(uVel) * uTip * position.x;
  #endif
  vec4 mv = modelViewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mv;
  float edge = 1.0 - smoothstep(0.32, 0.5, max(abs(rel.x) / uBox.x, max(abs(rel.z) / uBox.z, abs(rel.y) / uBox.y)));
  float blink = uBlink > 0.0 ? pow(0.5 + 0.5 * sin(uTime * (1.2 + r * 2.5) + r * 40.0), uBlink) : 1.0;
  vA = uAlpha * edge * blink * smoothstep(0.3, 2.0, -mv.z);
  gl_PointSize = uSize * (0.6 + 0.8 * r) * uScale / max(0.5, -mv.z);
}`;
const fieldFrag = /* glsl */`
uniform vec3 uColor; varying float vA;
void main() {
  #ifdef LINES
  float a = vA;
  #else
  float d = length(gl_PointCoord - 0.5);
  float a = (1.0 - smoothstep(0.0, 0.5, d)) * vA;
  #endif
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor * a, a);
}`;
function makeField(o) {
  const n = o.n;
  const geo = new THREE.BufferGeometry();
  const verts = o.lines ? 2 : 1;
  const pos = new Float32Array(n * verts * 3), seed = new Float32Array(n * verts * 4);
  for (let i = 0; i < n; i++) {
    const s = [Math.random(), Math.random(), Math.random(), Math.random()];
    for (let v = 0; v < verts; v++) { seed.set(s, (i * verts + v) * 4); pos[(i * verts + v) * 3] = v; }
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uCam: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(...o.box) }, uVel: { value: new THREE.Vector3(...o.vel) },
      uTime: { value: Math.random() * 100 }, uSize: { value: o.size || 0.1 }, uSway: { value: o.sway || 0 }, uAlpha: { value: 0 },
      uBlink: { value: o.blink || 0 }, uScale: { value: 600 }, uTip: { value: o.tip || 0.6 }, uColor: { value: new THREE.Color(o.color) },
    },
    vertexShader: fieldVert, fragmentShader: fieldFrag, defines: o.lines ? { LINES: 1 } : {},
    transparent: true, depthWrite: false,
    blending: o.additive ? THREE.AdditiveBlending : THREE.CustomBlending,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  const obj = o.lines ? new THREE.LineSegments(geo, mat) : new THREE.Points(geo, mat);
  obj.frustumCulled = false;
  obj.visible = false;
  obj.renderOrder = 2;
  game.scene.add(obj);
  return { obj, u: mat.uniforms, max: o.alpha || 1 };
}
function initFields() {
  fields = {
    chuva: makeField({ lines: true, n: 1800, box: [40, 28, 40], vel: [-1.2, -22, 0.4], color: 0x9fb4c8, tip: 0.7, alpha: 0.5 }),
    neve: makeField({ n: 2600, box: [50, 30, 50], vel: [0.5, -1.5, 0.25], sway: 0.7, size: 0.14, color: 0xf2f6ff, alpha: 0.95 }),
    areia: makeField({ n: 1800, box: [50, 16, 50], vel: [12, -0.4, 3.5], sway: 0.5, size: 0.14, color: 0xcf9a62, alpha: 0.55 }),
    vagalumes: makeField({ n: 260, box: [56, 7, 56], vel: [0.12, 0.05, 0.1], sway: 1.4, size: 0.13, color: 0xd6ff6a, additive: true, blink: 6, alpha: 1.6 }),
    esporos: makeField({ n: 520, box: [50, 16, 50], vel: [0.1, 0.35, 0.05], sway: 0.8, size: 0.08, color: 0x6dffd8, additive: true, blink: 1.5, alpha: 1.2 }),
    faiscas: makeField({ n: 420, box: [50, 14, 50], vel: [0, 0.15, 0], sway: 0.3, size: 0.07, color: 0xd8a8ff, additive: true, blink: 10, alpha: 1.8 }),
    polen: makeField({ n: 360, box: [50, 12, 50], vel: [0.3, -0.06, 0.18], sway: 0.9, size: 0.05, color: 0xffe9a0, additive: true, alpha: 0.6 }),
    diamante: makeField({ n: 420, box: [46, 14, 46], vel: [0.2, -0.25, 0.1], sway: 0.4, size: 0.045, color: 0xeaf6ff, additive: true, blink: 12, alpha: 1.4 }),
  };
}
function updateFields(dt) {
  if (!game.scene || !game.camera) return;
  if (!fields) initFields();
  const sky = game.sky || {};
  const bw = sky.biomeW || {};
  const night = game.nightK ?? 0, day = 1 - night;
  const wet = sky.wetK || 0;
  const want = {
    chuva: sky.wetK || 0,
    neve: Math.max(sky.snowK || 0, 0),
    areia: sky.sandK || 0,
    vagalumes: ((bw.floresta || 0) * 0.8 + (bw.pantano || 0)) * Math.max(0, night - 0.3) * 1.4 * (1 - wet) + fx.bloom * 0.5,
    esporos: (bw.pantano || 0) * (0.3 + 0.7 * night) + fx.bloom * 0.8,
    faiscas: (bw.cristal || 0) * (0.35 + 0.4 * night) + fx.reson * 1.2 * (bw.cristal || 0) + fx.reson * 0.3,
    polen: (bw.floresta || 0) * day * (1 - wet),
    diamante: (bw.tundra || 0) * (0.4 + 0.6 * night) * (1 - (sky.snowK || 0)),
  };
  const cam = game.camera.position;
  const scale = game.renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(game.camera.fov) / 2));
  for (const [k, f] of Object.entries(fields)) {
    const a = Math.min(1, want[k] || 0) * f.max;
    f.u.uAlpha.value += (a - f.u.uAlpha.value) * Math.min(1, dt * 1.5);
    f.obj.visible = f.u.uAlpha.value > 0.01;
    if (!f.obj.visible) continue;
    f.u.uTime.value += dt;
    f.u.uCam.value.copy(cam);
    f.u.uScale.value = scale;
  }
}

// ─── salvar ───
export function serializeEvents() {
  const a = state.active;
  return {
    next: state.next, veins: state.veins, pickups: state.pickups.map((p) => ({ x: p.x, z: p.z })), jupAnn: state.jupAnn, eclAnn: state.eclAnn,
    active: a ? { tipo: a.tipo, resta: a.ate - game.time } : null,
  };
}
export function loadEvents(d) {
  if (!d) return;
  state.next = d.next ?? state.next;
  state.jupAnn = d.jupAnn ?? null;
  state.eclAnn = d.eclAnn ?? null;
  for (const v of d.veins || []) addVein(v.x, v.z, v.left); // carregado antes das máquinas (o minerador precisa achar o veio)
  for (const p of d.pickups || []) addPickup(p.x, p.z);
  if (d.active && DUR[d.active.tipo] && d.active.resta > 5) state.active = { tipo: d.active.tipo, ate: game.time + d.active.resta, t0: game.time - 30 };
}
