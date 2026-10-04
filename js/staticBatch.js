// Cenário parado (árvores, pedras, flores da floresta) desenhado em lote: um InstancedMesh por peça
// de cada modelo. Antes eram ~1500 objetos separados = centenas de chamadas de desenho por quadro,
// o que derrubava o FPS (principalmente no Firefox, onde cada chamada custa mais).
import * as THREE from 'three';
import { assets } from './assets.js';
import { game } from './state.js';

const groups = new Map(); // modelo -> { parts, items: Map(id -> Matrix4), meshes, dirty }
let nextId = 1;
const byId = new Map();   // id -> modelo

// tint = { cor, emissivo, forca }: recolore o lote inteiro (ex: cristais de cada minério)
function partsOf(key, tint) {
  const tpl = assets.models[key];
  tpl.updateMatrixWorld(true);
  const inv = tpl.matrixWorld.clone().invert();
  const parts = [];
  tpl.traverse((o) => {
    if (!o.isMesh) return;
    let mat = o.material;
    if (tint) {
      mat = mat.clone();
      mat.color = new THREE.Color(tint.cor);
      if (tint.emissivo) { mat.emissive = new THREE.Color(tint.emissivo); mat.emissiveIntensity = tint.forca || 0; }
    }
    // InstancedMesh não tem morphTargetInfluences: geometria com morph vai sem os morphs
    let geo = o.geometry;
    if (Object.keys(geo.morphAttributes || {}).length) { geo = geo.clone(); geo.morphAttributes = {}; }
    parts.push({ geo, mat, local: inv.clone().multiply(o.matrixWorld), cast: o.castShadow });
  });
  return parts;
}

const _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0), _p = new THREE.Vector3(), _s = new THREE.Vector3();
// põe um modelo no cenário (posição, giro em y, escala). Retorna um id pra tirar depois
export function addStatic(key, x, z, rotY = 0, scale = 1, y = 0, tint = null) {
  const gk = tint ? `${key}#${tint.cor}#${tint.forca || 0}` : key;
  let g = groups.get(gk);
  if (!g) { g = { parts: partsOf(key, tint), items: new Map(), meshes: [], dirty: true }; groups.set(gk, g); }
  const it = { x, y, z, rotY, scale, visible: true, m: new THREE.Matrix4() };
  it.m.compose(_p.set(x, y, z), _q.setFromAxisAngle(_up, rotY), _s.setScalar(scale));
  const id = nextId++;
  g.items.set(id, it);
  g.dirty = true;
  byId.set(id, gk);
  return id;
}
const itemOf = (id) => { const gk = byId.get(id); return gk ? [groups.get(gk), groups.get(gk).items.get(id)] : [null, null]; };
export function removeStatic(id) {
  const [g] = itemOf(id);
  if (!g) return;
  byId.delete(id);
  g.items.delete(id);
  g.dirty = true;
}
export function setStaticScale(id, scale) {
  const [g, it] = itemOf(id);
  if (!it || it.scale === scale) return;
  it.scale = scale;
  it.m.compose(_p.set(it.x, it.y, it.z), _q.setFromAxisAngle(_up, it.rotY), _s.setScalar(scale));
  g.dirty = true;
}
export function setStaticVisible(id, v) {
  const [g, it] = itemOf(id);
  if (!it || it.visible === v) return;
  it.visible = v;
  g.dirty = true;
}

// remonta os lotes que mudaram (chamado uma vez por quadro, custa quase nada quando nada mudou)
export function flushStatic() {
  const tmp = new THREE.Matrix4();
  for (const g of groups.values()) {
    if (!g.dirty) continue;
    g.dirty = false;
    for (const m of g.meshes) { game.scene.remove(m); m.dispose(); }
    const list = [...g.items.values()].filter((it) => it.visible).map((it) => it.m);
    g.meshes = list.length ? g.parts.map((p) => {
      const im = new THREE.InstancedMesh(p.geo, p.mat, list.length);
      list.forEach((mat, i) => im.setMatrixAt(i, tmp.multiplyMatrices(mat, p.local)));
      im.castShadow = p.cast;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      game.scene.add(im);
      return im;
    }) : [];
  }
}
