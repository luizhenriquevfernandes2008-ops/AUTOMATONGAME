// Construção: paredes, janelas, portas, cercas (nas bordas das células), pisos e tetos,
// materiais (madeira, tijolo, concreto, vidro, aço), pintura e quadros pendurados nas paredes.
import * as THREE from 'three';
import { game } from './state.js';
import { CELL, PIECES, MATERIALS, PAINTS, PAINTINGS, ITEMS } from './data.js';
import { cloneModel } from './assets.js';
import { foundations, refreshBeltsAround } from './machines.js';
import { heightAt } from './terrain.js';
import { clearFloraCell } from './flora.js';

export const WALL_H = 2.58;           // altura das paredes (e do teto)
const THICK = 0.09;                   // meia espessura usada na colisão
export const structures = new Map();  // chave -> peça
export const structRoot = new THREE.Group();
structRoot.name = 'estruturas';

// ─── chaves ───
// borda norte da célula (x,z): "e:x,z,n" · borda oeste: "e:x,z,w" · piso "f:x,z" · teto "c:x,z" · quadro "p:<borda>:<lado>"
export function edgeKey(x, z, o) { return `e:${x},${z},${o}`; }
export function parseEdge(k) {
  const m = /^e:(-?\d+),(-?\d+),([nw])$/.exec(k);
  return m ? { x: +m[1], z: +m[2], o: m[3] } : null;
}
// borda mais perto de um ponto no chão
export function nearestEdge(px, pz) {
  const x = Math.floor(px / CELL), z = Math.floor(pz / CELL);
  const u = px / CELL - x, v = pz / CELL - z;
  const d = [v, 1 - v, u, 1 - u];
  const i = d.indexOf(Math.min(...d));
  if (i === 0) return { x, z, o: 'n' };
  if (i === 1) return { x, z: z + 1, o: 'n' };
  if (i === 2) return { x, z, o: 'w' };
  return { x: x + 1, z, o: 'w' };
}
// segmento da borda em metros
export function edgeSegment(e) {
  const ax = e.x * CELL, az = e.z * CELL;
  return e.o === 'n' ? { ax, az, bx: ax + CELL, bz: az } : { ax, az, bx: ax, bz: az + CELL };
}
// células dos dois lados da borda
export function edgeCells(e) {
  return e.o === 'n' ? [[e.x, e.z - 1], [e.x, e.z]] : [[e.x - 1, e.z], [e.x, e.z]];
}
function segDist(px, pz, s) {
  const dx = s.bx - s.ax, dz = s.bz - s.az;
  const L = dx * dx + dz * dz;
  let t = L ? ((px - s.ax) * dx + (pz - s.az) * dz) / L : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = s.ax + dx * t, cz = s.az + dz * t;
  return Math.hypot(px - cx, pz - cz);
}

// ─── fundações (iguais às do Satisfactory): nivelam o chão de uma célula ───
// O topo encaixa no nível de uma fundação vizinha (pra formar um piso plano); R sobe 0,5 m.
export const FOUND_STEP = 0.25;
export function cornerHeights(x, z) {
  return [heightAt(x * CELL, z * CELL), heightAt((x + 1) * CELL, z * CELL), heightAt(x * CELL, (z + 1) * CELL), heightAt((x + 1) * CELL, (z + 1) * CELL)];
}
export function foundationLevel(x, z, offset = 0) {
  const top = Math.max(...cornerHeights(x, z), heightAt((x + 0.5) * CELL, (z + 0.5) * CELL));
  let h = Math.ceil((top + 0.05) / FOUND_STEP) * FOUND_STEP;
  let best = null;
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    if (!dx && !dz) continue;
    const f = foundations.get((x + dx) + ',' + (z + dz));
    if (f === undefined || f < top + 0.02 || Math.abs(f - h) > 1.3) continue;
    if (best === null || Math.abs(f - h) < Math.abs(best - h)) best = f;
  }
  if (best !== null) h = best;
  return h + offset;
}
// desenho: um InstancedMesh pra todas (caixa com topo em y=0 e altura 1, esticada até o chão)
const foundGeo = new THREE.BoxGeometry(CELL, 1, CELL).translate(0, -0.5, 0);
const foundMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.78, metalness: 0.25 });
foundMat.onBeforeCompile = (sh) => {
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vFW; varying float vFTop;')
    .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
vec4 fw = modelMatrix * instanceMatrix * vec4(transformed, 1.0); vFW = fw.xyz;
vFTop = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).y;`);
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vFW; varying float vFTop;')
    .replace('#include <color_fragment>', `#include <color_fragment>
{
  float below = vFTop - vFW.y;
  vec2 g = abs(fract(vFW.xz / ${CELL.toFixed(2)} + 0.5) - 0.5);
  float seam = smoothstep(0.47, 0.5, max(g.x, g.y));
  float plate = step(below, 0.02);
  vec2 q = abs(fract(vFW.xz / ${(CELL / 2).toFixed(2)}) - 0.5);
  float rivet = (1.0 - smoothstep(0.03, 0.06, length(q - 0.42))) * plate;
  diffuseColor.rgb *= mix(1.0, 0.62, seam * plate) * (1.0 - rivet * 0.35);
  float band = (1.0 - plate) * (1.0 - smoothstep(0.08, 0.16, below));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.62, 0.18), band);
  diffuseColor.rgb *= mix(1.0, 0.72, smoothstep(0.2, 1.4, below));
}`);
};
const foundBatch = { mesh: null, list: [], dirty: true, cap: 0 };
export function foundationMesh() { return foundBatch.mesh; }
export function flushFoundations() {
  if (!foundBatch.dirty) return;
  foundBatch.dirty = false;
  const list = [...structures.values()].filter((s) => s.kind === 'peca' && s.piece === 'fundacao');
  foundBatch.list = list;
  if (!foundBatch.mesh || list.length > foundBatch.cap) {
    if (foundBatch.mesh) { structRoot.remove(foundBatch.mesh); foundBatch.mesh.dispose(); }
    foundBatch.cap = Math.max(64, list.length * 2);
    const m = new THREE.InstancedMesh(foundGeo, foundMat, foundBatch.cap);
    m.castShadow = true; m.receiveShadow = true;
    m.userData.foundBatch = foundBatch;
    structRoot.add(m);
    foundBatch.mesh = m;
  }
  const M = new THREE.Matrix4();
  list.forEach((s, i) => {
    const bottom = Math.min(...cornerHeights(s.x, s.z)) - 0.6;
    const hgt = Math.max(0.3, s.h - bottom);
    M.makeScale(1, hgt, 1).setPosition((s.x + 0.5) * CELL, s.h, (s.z + 0.5) * CELL);
    foundBatch.mesh.setMatrixAt(i, M);
  });
  foundBatch.mesh.count = list.length;
  foundBatch.mesh.instanceMatrix.needsUpdate = true;
  foundBatch.mesh.computeBoundingSphere();
}
// estrutura mirada num raio (pra fundações, que estão num lote só)
export function structFromHit(h) {
  const b = h.object.userData.foundBatch;
  return b ? b.list[h.instanceId] || null : null;
}

// ─── materiais (cacheados pra não criar um por peça) ───
const matCache = new Map();
function bodyMaterial(orig, matId, paint) {
  const k = `${orig.uuid}|${matId}|${paint ?? ''}`;
  let m = matCache.get(k);
  if (m) return m;
  const M = MATERIALS[matId];
  m = orig.clone();
  const col = paint != null && !M.vidro ? paint : M.cor;
  m.color = new THREE.Color(col);
  m.roughness = M.rough;
  m.metalness = M.metal || 0;
  if (M.vidro) { m.transparent = true; m.opacity = 0.32; m.depthWrite = false; }
  matCache.set(k, m);
  return m;
}
// pinta o corpo da peça (a parte "_defaultMat" das paredes, ou a madeira do piso/cerca)
function applyLook(obj, matId, paint) {
  let bodyName = null;
  obj.traverse((o) => { if (o.isMesh && o.material.name === '_defaultMat') bodyName = '_defaultMat'; });
  if (!bodyName) bodyName = 'wood';
  obj.traverse((o) => {
    if (!o.isMesh) return;
    if (!o.userData.origMat) o.userData.origMat = o.material;
    const orig = o.userData.origMat;
    if (orig.name === bodyName) o.material = bodyMaterial(orig, matId, paint);
    else if (MATERIALS[matId].vidro && orig.name !== 'glass') o.material = bodyMaterial(orig, matId, null);
    else o.material = orig;
    o.castShadow = !MATERIALS[matId].vidro;
  });
}

// ─── custo ───
export function pieceCost(pieceId, matId) {
  const p = PIECES[pieceId];
  const mat = p.fixo || matId;
  const c = { [MATERIALS[mat].item]: p.custo };
  if (p.vidro) c.vidro = (c.vidro || 0) + p.vidro;
  return c;
}
export function costText(cost) {
  return Object.entries(cost).map(([k, n]) => `${n}× ${ITEMS[k]?.nome || k}`).join(' + ');
}

// ─── objeto 3D de uma peça ───
export function buildPieceObject(pieceId, matId, paint, keyInfo) {
  const p = PIECES[pieceId];
  const mat = p.fixo || matId;
  const holder = new THREE.Group();
  if (p.fundacao) { // fantasma da fundação: uma caixa
    const m = new THREE.Mesh(foundGeo, new THREE.MeshBasicMaterial({ color: 0x3fe0cc, transparent: true, opacity: 0.4 }));
    holder.add(m);
    return holder;
  }
  const m = cloneModel(p.model);
  holder.add(m);
  applyLook(m, mat, paint);
  placeObject(holder, pieceId, keyInfo);
  return holder;
}
export function cellFloor(x, z) {
  const f = foundations.get(x + ',' + z);
  return f !== undefined ? f : heightAt((x + 0.5) * CELL, (z + 0.5) * CELL);
}
function placeObject(holder, pieceId, info) {
  const p = PIECES[pieceId];
  if (p.borda) {
    const s = edgeSegment(info);
    const [a, b] = edgeCells(info);
    holder.position.set((s.ax + s.bx) / 2, Math.max(cellFloor(...a), cellFloor(...b)), (s.az + s.bz) / 2);
    holder.rotation.y = info.o === 'n' ? 0 : Math.PI / 2;
  } else {
    holder.position.set((info.x + 0.5) * CELL, cellFloor(info.x, info.z) + (p.alto ? WALL_H - 0.03 : 0.006), (info.z + 0.5) * CELL);
  }
}

// ─── colocar / tirar ───
export function addStructure(d) {
  const p = PIECES[d.piece];
  if (!p) return null;
  // multiplayer: convidado pede pro anfitrião (devolve uma peça de mentirinha pro som/desfazer)
  if (game.mp?.intercept('struct', { d })) return { key: d.key, kind: 'peca', piece: d.piece, mat: d.mat, obj: { position: new THREE.Vector3((d.x + 0.5) * CELL, 1, (d.z + 0.5) * CELL) } };
  const info = p.borda ? parseEdge(d.key) : { x: d.x, z: d.z };
  if (!info) return null;
  if (p.fundacao) {
    const h = Number.isFinite(d.h) ? d.h : foundationLevel(d.x, d.z);
    const s = { key: d.key, kind: 'peca', piece: d.piece, mat: p.fixo, paint: null, x: d.x, z: d.z, h, obj: { position: new THREE.Vector3((d.x + 0.5) * CELL, h, (d.z + 0.5) * CELL) } };
    structures.set(d.key, s);
    foundations.set(d.x + ',' + d.z, h);
    foundBatch.dirty = true;
    clearFloraCell(d.x, d.z);
    refreshBeltsAround(d.x, d.z);
    game.emit('structures');
    game.mp?.op('struct', { d: { key: d.key, piece: d.piece, mat: s.mat, paint: null, x: d.x, z: d.z, h } });
    return s;
  }
  const obj = buildPieceObject(d.piece, d.mat, d.paint, info);
  const s = { key: d.key, kind: 'peca', piece: d.piece, mat: p.fixo || d.mat, paint: d.paint ?? null, x: info.x, z: info.z, o: info.o, obj };
  obj.userData.struct = s;
  obj.traverse((o) => { o.userData.struct = s; });
  structRoot.add(obj);
  structures.set(d.key, s);
  game.emit('structures');
  game.mp?.op('struct', { d: { key: d.key, piece: d.piece, mat: s.mat, paint: s.paint, x: s.x, z: s.z } });
  return s;
}
export function removeStructure(key) {
  const s = structures.get(key);
  if (!s) return null;
  if (game.mp?.intercept('unstruct', { k: key })) return s;
  if (s.piece === 'fundacao') {
    structures.delete(key);
    foundations.delete(s.x + ',' + s.z);
    foundBatch.dirty = true;
    refreshBeltsAround(s.x, s.z);
    game.emit('structures');
    game.mp?.op('unstruct', { k: key });
    return s;
  }
  structRoot.remove(s.obj);
  structures.delete(key);
  // quadros presos nessa parede caem junto (voltam pro inventário)
  if (s.kind === 'peca') for (const side of [1, -1]) {
    const q = structures.get(`p:${key}:${side}`);
    if (q) { removeStructure(q.key); game.economy.addItem(q.painting); }
  }
  game.emit('structures');
  game.mp?.op('unstruct', { k: key });
  return s;
}
export function paintStructure(s, paint) {
  if (game.mp?.intercept('paint', { k: s.key, paint })) return;
  s.paint = paint;
  applyLook(s.obj.children[0], s.mat, paint);
  game.mp?.op('paint', { k: s.key, paint });
}

// ─── quadros ───
const texCache = {};
function paintingTexture(id) {
  if (texCache[id]) return texCache[id];
  const t = new THREE.TextureLoader().load(`assets/paintings/${PAINTINGS[id].img}.jpg`);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  texCache[id] = t;
  return t;
}
const frameMat = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.6 });
const goldMat = new THREE.MeshStandardMaterial({ color: 0xd4a84a, roughness: 0.35, metalness: 0.6 });
export function buildPaintingObject(id) {
  const P = PAINTINGS[id];
  const maxS = 1.05;
  const asp = P.w / P.h;
  const w = asp >= 1 ? maxS : maxS * asp, h = asp >= 1 ? maxS / asp : maxS;
  const g = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.14, h + 0.14, 0.05), frameMat);
  frame.castShadow = true;
  g.add(frame);
  const inner = new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, h + 0.04, 0.052), goldMat);
  g.add(inner);
  const art = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: paintingTexture(id), roughness: 0.7 }));
  art.position.z = 0.028;
  g.add(art);
  return g;
}
export function addPainting(d) {
  if (game.mp?.intercept('painting', { d })) return null;
  const [, edge, side] = /^p:(e:[^:]+):(-?1)$/.exec(d.key) || [];
  const wall = structures.get(edge);
  if (!wall || !PAINTINGS[d.painting]) return null;
  const obj = buildPaintingObject(d.painting);
  const seg = edgeSegment(wall);
  const sd = +side;
  const nx = wall.o === 'n' ? 0 : sd, nz = wall.o === 'n' ? sd : 0;
  obj.position.set((seg.ax + seg.bx) / 2 + nx * 0.075, 1.55, (seg.az + seg.bz) / 2 + nz * 0.075);
  obj.rotation.y = Math.atan2(nx, nz);
  const s = { key: d.key, kind: 'quadro', painting: d.painting, edge, side: sd, obj };
  obj.userData.struct = s;
  obj.traverse((o) => { o.userData.struct = s; });
  structRoot.add(obj);
  structures.set(d.key, s);
  game.emit('structures');
  game.mp?.op('painting', { d: { key: d.key, painting: d.painting } });
  return s;
}

// ─── consultas ───
export function wallAt(key) { const s = structures.get(key); return s && s.kind === 'peca' && PIECES[s.piece].borda ? s : null; }
export function ceilingAt(x, z) { return structures.get(`c:${x},${z}`) || null; }
export function floorAt(x, z) { return structures.get(`f:${x},${z}`) || null; }
export function countPieces() { let n = 0; for (const s of structures.values()) if (s.kind === 'peca') n++; return n; }
export function countPaintings() { let n = 0; for (const s of structures.values()) if (s.kind === 'quadro') n++; return n; }

// o jogador bate nas paredes (portas deixam passar pelo meio)
export function structBlocked(px, pz, radius) {
  const cx = Math.floor(px / CELL), cz = Math.floor(pz / CELL);
  for (let dx = -1; dx <= 2; dx++) for (let dz = -1; dz <= 2; dz++) {
    for (const o of ['n', 'w']) {
      const s = structures.get(edgeKey(cx + dx, cz + dz, o));
      if (!s || s.kind !== 'peca') continue;
      const p = PIECES[s.piece];
      const seg = edgeSegment(s);
      if (p.passa) {
        // só os batentes da porta seguram
        const k = 0.28;
        const a = { ax: seg.ax, az: seg.az, bx: seg.ax + (seg.bx - seg.ax) * k, bz: seg.az + (seg.bz - seg.az) * k };
        const b = { ax: seg.bx - (seg.bx - seg.ax) * k, az: seg.bz - (seg.bz - seg.az) * k, bx: seg.bx, bz: seg.bz };
        if (segDist(px, pz, a) < radius + THICK || segDist(px, pz, b) < radius + THICK) return true;
      } else if (segDist(px, pz, seg) < radius + THICK) return true;
    }
  }
  return false;
}
// distância de um ponto até uma borda (pra não construir parede em cima de alguém/algo)
export function edgeDistance(e, px, pz) { return segDist(px, pz, edgeSegment(e)); }

// ─── piso de madeira faz passo de madeira ───
export function floorMaterialAt(px, pz) {
  const f = floorAt(Math.floor(px / CELL), Math.floor(pz / CELL));
  return f ? f.mat : null;
}

// ─── salvar ───
export function serializeStructures() {
  const out = [];
  for (const s of structures.values()) {
    if (s.kind === 'peca') out.push({ key: s.key, piece: s.piece, mat: s.mat, paint: s.paint, x: s.x, z: s.z, ...(s.piece === 'fundacao' ? { h: s.h } : {}) });
  }
  for (const s of structures.values()) if (s.kind === 'quadro') out.push({ key: s.key, painting: s.painting });
  return out;
}
export function loadStructures(list) {
  // fundações primeiro (as outras peças e as máquinas ficam em cima delas)
  list = [...(list || [])].sort((a, b) => (b.piece === 'fundacao') - (a.piece === 'fundacao'));
  for (const d of list) {
    try { if (d.painting) addPainting(d); else addStructure(d); } catch (e) { console.warn('estrutura não carregou', d, e); }
  }
}
export function paintName(c) { return (PAINTS.find((p) => p.cor === c) || PAINTS[0]).nome; }
