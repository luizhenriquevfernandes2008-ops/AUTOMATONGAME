// Grid, entidades e máquinas da fábrica.
import * as THREE from 'three';
import { CELL, ITEMS, ORES, SMELT, RECIPES, CONSTRUCT, MACHINES, DECOR, TIERS, TIERABLE, DECOR_BONUS, DECOR_BONUS_MAX, recipeOut, BELT_TIERS, isBeltTier, PURITY, FUELS } from './data.js';
import { cloneModel, assets } from './assets.js';
import { PAL } from './palette.js';
import { game } from './state.js';
import { takeItemMesh, releaseItemMesh } from './itemMeshes.js';
import { Blocking, Builtin, JDict, JiboiaError, suggest } from './lang/jiboia.js';
import { audio } from './audio.js';
import { heightAt } from './terrain.js';
import { virtualLight } from './lights.js';
import { puff, floatText, makeLabel, setLabel } from './fx.js';
import { powerRatio, powerText, usesPower, disconnectAll, recompute as recomputePower, canWire, outputOf } from './power.js';

export const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // N L S O
export const grid = new Map();     // "x,z" -> entidade ou bloqueio estático (chão)
export const gridUp = new Map();   // "x,z" -> entidade no 2º andar (esteiras elevadas)
export const ELEV = 1.8;           // altura do 2º andar
export const ores = new Map();     // "x,z" -> tipo de minério
export const purity = new Map();   // "x,z" -> impuro | normal | puro
export const ENTITY_CLASSES = {};
export const key = (x, z) => x + ',' + z;
// altura do piso de cada célula: topo da fundação, se tiver, senão o chão do terreno
export const foundations = new Map(); // "x,z" -> altura do topo da fundação
export function floorY(x, z) {
  const f = foundations.get(x + ',' + z);
  return f !== undefined ? f : heightAt((x + 0.5) * CELL, (z + 0.5) * CELL);
}
export const cellCenter = (x, z) => new THREE.Vector3((x + 0.5) * CELL, floorY(x, z), (z + 0.5) * CELL);
export const worldToCell = (wx, wz) => ({ x: Math.floor(wx / CELL), z: Math.floor(wz / CELL) });

// Ajuste de orientação de cada modelo (pra "frente" do modelo apontar pro norte, -z)
const AX_X = new THREE.Vector3(1, 0, 0), AX_Y = new THREE.Vector3(0, 1, 0), AX_Z = new THREE.Vector3(0, 0, 1);
const LAMP_GEO = new THREE.BoxGeometry(0.3, 0.08, 0.06);
export const MODEL_YAW = {
  belt: Math.PI / 2, beltCorner: 0, miner: -Math.PI / 2, smelter: -Math.PI / 2, assembler: -Math.PI / 2, sorter: Math.PI / 2,
  seller: 0, chest: 0, computer: 0,
};

const BELT_Y = 0.4 * CELL; // altura da superfície da esteira
const SPACING = 0.5;

// setinhas animadas em cima das esteiras (uma textura só, compartilhada)
function chevronTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(255,190,90,0.95)';
  g.lineWidth = 10;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(14, 44); g.lineTo(32, 22); g.lineTo(50, 44);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const chevTex = chevronTexture();
chevTex.repeat.set(1, 2);
export const chevronMat = new THREE.MeshBasicMaterial({ map: chevTex, transparent: true, depthWrite: false, opacity: 0.85 });
const chevTexShort = chevTex.clone();
chevTexShort.repeat.set(1, 1);
const chevronMatShort = new THREE.MeshBasicMaterial({ map: chevTexShort, transparent: true, depthWrite: false, opacity: 0.85 });
const chevGeo = new THREE.PlaneGeometry(CELL * 0.42, CELL);
const chevGeoShort = new THREE.PlaneGeometry(CELL * 0.42, CELL * 0.5);
// setinhas de cada tipo de esteira (cor e velocidade próprias: rápida = ciano, expressa = rosa)
const TIER_COLOR = { esteira: 0xffffff, esteira_rapida: 0x7ff4ff, esteira_expressa: 0xff8ae8, esteira_mk4: 0xffd34a, esteira_mk5: 0x9dff7a };
const chevByTier = { esteira: { tex: chevTex, texShort: chevTexShort, mat: chevronMat, matShort: chevronMatShort } };
function chevFor(type) {
  if (!isBeltTier(type)) type = 'esteira';
  if (!chevByTier[type]) {
    const tex = chevTex.clone(), texShort = chevTexShort.clone();
    tex.repeat.set(1, 2); texShort.repeat.set(1, 1);
    const mk = (map) => new THREE.MeshBasicMaterial({ map, color: TIER_COLOR[type], transparent: true, depthWrite: false, opacity: 0.95 });
    chevByTier[type] = { tex, texShort, mat: mk(tex), matShort: mk(texShort) };
  }
  return chevByTier[type];
}
export function animateBelts(dt) {
  const v = (game.economy?.beltSpeed || 1) * dt;
  for (const [type, c] of Object.entries(chevByTier)) {
    const k = BELT_TIERS[type] || 1;
    c.tex.offset.y -= v * 2 * k;
    c.texShort.offset.y -= v * 2 * k;
    c.tex.offset.y %= 1; c.texShort.offset.y %= 1;
  }
}

// ─── esteiras desenhadas de uma vez (instancing) ───
// Cada esteira continua tendo seu modelo (invisível, só pra mira), mas o que aparece na tela
// é um InstancedMesh por peça do modelo: centenas de esteiras custam poucas chamadas de desenho.
const beltBatch = { dirty: true, groups: {} };
export function markBeltsDirty() { beltBatch.dirty = true; }
function batchGroup(name, parts) {
  let g = beltBatch.groups[name];
  if (!g) g = beltBatch.groups[name] = { parts, meshes: [], cap: 0 };
  return g;
}
function modelParts(key, tint) {
  const tpl = assets.models[key];
  tpl.updateMatrixWorld(true);
  const inv = tpl.matrixWorld.clone().invert();
  const parts = [];
  tpl.traverse((o) => {
    if (!o.isMesh) return;
    let mat = o.material;
    // só a faixa lateral muda de cor com o Mk (como no Satisfactory)
    if (tint != null && mat.userData.tierStripe) { mat = mat.clone(); mat.color = new THREE.Color(tint); mat.emissive = new THREE.Color(tint).multiplyScalar(0.3); }
    parts.push({ geo: o.geometry, mat, local: inv.clone().multiply(o.matrixWorld), cast: o.castShadow });
  });
  return parts;
}
function fillGroup(g, mats) {
  if (mats.length > g.cap) {
    for (const m of g.meshes) { game.scene.remove(m); m.dispose(); }
    g.cap = Math.max(64, mats.length * 2);
    g.meshes = g.parts.map((p) => {
      const m = new THREE.InstancedMesh(p.geo, p.mat, g.cap);
      m.castShadow = p.cast; m.receiveShadow = true;
      if (p.order) m.renderOrder = p.order;
      game.scene.add(m);
      return m;
    });
  }
  const tmp = new THREE.Matrix4();
  g.meshes.forEach((m, k) => {
    for (let i = 0; i < mats.length; i++) m.setMatrixAt(i, tmp.multiplyMatrices(mats[i], g.parts[k].local));
    m.count = mats.length;
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  });
}
export function flushBelts() {
  if (!beltBatch.dirty || !assets.models.belt) return;
  beltBatch.dirty = false;
  // um lote por tipo de esteira (comum, rápida, expressa)
  const lists = {};
  for (const t of Object.keys(BELT_TIERS)) lists[t] = { belt: [], beltCorner: [], chev: [], chevShort: [] };
  for (const e of game.entities) {
    if (!e.instanced || e.removed) continue;
    e.obj.updateMatrixWorld(true);
    const L = lists[e.type];
    L[e.shape === 'straight' ? 'belt' : 'beltCorner'].push(e.model.matrixWorld.clone());
    L[e.shape === 'straight' ? 'chev' : 'chevShort'].push(e.chev.matrixWorld.clone());
  }
  const I = new THREE.Matrix4();
  for (const [t, L] of Object.entries(lists)) {
    const pre = t === 'esteira' ? '' : t + ':';
    const tint = t === 'esteira' ? null : TIER_COLOR[t];
    if (!beltBatch.groups[pre + 'belt'] && !L.belt.length && !L.beltCorner.length) continue; // tipo ainda não usado
    const c = chevFor(t);
    fillGroup(batchGroup(pre + 'belt', modelParts('belt', tint)), L.belt);
    fillGroup(batchGroup(pre + 'beltCorner', modelParts('beltCorner', tint)), L.beltCorner);
    fillGroup(batchGroup(pre + 'chev', [{ geo: chevGeo, mat: c.mat, local: I, cast: false, order: 2 }]), L.chev);
    fillGroup(batchGroup(pre + 'chevShort', [{ geo: chevGeoShort, mat: c.matShort, local: I, cast: false, order: 2 }]), L.chevShort);
  }
}

// setinha no chão (laranja = saída, azul = entrada)
// a ponta aponta pra -z local (a "frente"); yaw gira o grupo
export function groundArrow(color, size = 1, yaw = 0) {
  const s = new THREE.Shape();
  s.moveTo(0, 0.22); s.lineTo(0.2, -0.05); s.lineTo(0.07, -0.05); s.lineTo(0.07, -0.2);
  s.lineTo(-0.07, -0.2); s.lineTo(-0.07, -0.05); s.lineTo(-0.2, -0.05); s.closePath();
  const m = new THREE.Mesh(new THREE.ShapeGeometry(s), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.scale.setScalar(size);
  const g = new THREE.Group();
  g.add(m);
  g.rotation.y = yaw;
  return g;
}
// coloca a seta na borda da célula. side: 0 frente, 1 direita, 2 trás, 3 esquerda (local). inward: aponta pra dentro
function portArrow(color, side, inward, size = 1) {
  const yawOut = [0, -Math.PI / 2, Math.PI, Math.PI / 2][side];
  const a = groundArrow(color, size > 1 ? 1.1 : 0.8, inward ? yawOut + Math.PI : yawOut);
  const d = CELL * size * 0.5 + (size > 1 ? 0.18 : -0.02);
  const off = [[0, -d], [d, 0], [0, d], [-d, 0]][side];
  a.position.set(off[0], 0.035, off[1]);
  return a;
}

export function isItem(name) { return Object.prototype.hasOwnProperty.call(ITEMS, name); }
export function itemName(t) { return ITEMS[t]?.nome || t; }

export function uniqueName(prefix) {
  let i = 1;
  const names = new Set(game.entities.map((e) => e.name).concat((game.drones || []).map((d) => d.name)));
  while (names.has(prefix + i)) i++;
  return prefix + i;
}

// ───────────────────────── Entidade base ─────────────────────────
export class Entity {
  constructor(type, x, z, dir) {
    this.type = type;
    this.x = x; this.z = z; this.dir = dir;
    this.def = MACHINES[type] || DECOR[type] || {};
    this.name = '';
    this.removed = false;
    this.obj = new THREE.Group();
    this.obj.position.copy(cellCenter(x, z));
    this.obj.rotation.y = -dir * Math.PI / 2;
    this.obj.userData.entity = this;
    this.solid = !!this.def.solido;
  }
  get pos() { return this.obj.position; }
  get isMachine() { return !!MACHINES[this.type]; }
  // célula vizinha no lado d (prédios 3×3: a do meio do lado, fora do prédio)
  cellIn(d) { const r = ((this.def.tamanho || 1) - 1) / 2 + 1; return [this.x + DIRS[d][0] * r, this.z + DIRS[d][1] * r]; }
  entityIn(d) { const [x, z] = this.cellIn(d); return grid.get(key(x, z)); }
  // pra onde o item vai quando sai (esteiras elevadas e rampas mudam isso)
  nextTarget(d = this.dir) { return this.entityIn(d); }
  get layer() { return 0; }
  canAccept() { return false; }
  accept() { }
  update() { }
  onRemove() { }
  addModel(modelKey) {
    const m = cloneModel(modelKey);
    m.rotation.y = MODEL_YAW[modelKey] || 0;
    this.model = m;
    this.obj.add(m);
    m.traverse((o) => { if (o.isMesh) o.userData.entity = this; });
    return m;
  }
  serialize() { return { type: this.type, x: this.x, z: this.z, dir: this.dir, name: this.name }; }
  load() { }
  infoLines() { return []; }
}

// ───────────────────────── Esteira ─────────────────────────
export class Belt extends Entity {
  constructor(type, x, z, dir) {
    super(type, x, z, dir);
    this.items = [];
    this.shape = 'straight';
    this.addModel('belt');
    this.name = '';
    this.chev = new THREE.Mesh(chevGeo, chevFor(type).mat);
    this.chev.rotation.x = -Math.PI / 2; // +v da textura aponta pra -z local (a frente)
    this.chev.position.y = BELT_Y + 0.006;
    this.chev.renderOrder = 2;
    this.obj.add(this.chev);
    // esteira comum: desenhada em lote (ver flushBelts)
    this.instanced = isBeltTier(type);
    if (this.instanced) { this.model.visible = false; this.chev.visible = false; }
  }
  get outputDirs() { return [this.dir]; }
  canAccept(type, travelDir) {
    if (travelDir === (this.dir + 2) % 4) return false;
    if (this.items.length >= 3) return false;
    const last = this.items[this.items.length - 1];
    return !last || last.p >= SPACING;
  }
  accept(type, travelDir, mesh) {
    mesh = mesh || takeItemMesh(type);
    if (mesh.parent !== game.scene) game.scene.add(mesh);
    const it = { type, p: 0, entry: travelDir < 0 ? (this.dir + 2) % 4 : (travelDir + 2) % 4, mesh };
    this.items.push(it);
    this.placeItem(it);
  }
  placeItem(it) {
    const c = this.obj.position;
    const e = DIRS[it.entry], x = DIRS[this.dir];
    let px, pz;
    if (it.p < 0.5) { const k = it.p * 2; px = e[0] * 0.5 * (1 - k); pz = e[1] * 0.5 * (1 - k); }
    else { const k = (it.p - 0.5) * 2; px = x[0] * 0.5 * k; pz = x[1] * 0.5 * k; }
    // inclinação: o item sobe/desce entre a altura da entrada e a da saída
    const hi = this.hIn || 0, ho = this.hOut || 0;
    const dy = this.shape === 'straight' ? hi + (ho - hi) * it.p : it.p < 0.5 ? hi * (1 - it.p * 2) : ho * (it.p - 0.5) * 2;
    it.mesh.position.set(c.x + px * CELL, c.y + dy + this.itemY(it), c.z + pz * CELL);
    it.mesh.rotation.y = -this.dir * Math.PI / 2;
  }
  itemY() { return BELT_Y; }
  onItemPassed() { }
  update(dt) {
    const v = game.economy.beltSpeed * (BELT_TIERS[this.type] || 1) * dt;
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      const limit = i === 0 ? 1 : this.items[i - 1].p - SPACING;
      if (it.p < limit) it.p = Math.min(it.p + v, limit);
      if (it.p >= 0.5 && !it.seen) { it.seen = true; this.onItemPassed(it.type); }
      if (i === 0 && it.p >= 1) {
        const t = this.nextTarget();
        if (t && !t.removed && t.canAccept(it.type, this.dir)) {
          this.items.shift();
          i--;
          t.accept(it.type, this.dir, it.mesh);
          continue;
        }
      }
      this.placeItem(it);
    }
  }
  // esteira no relevo: altura da entrada e da saída = média com a célula vizinha (fica inclinada)
  refreshSlope() {
    if (!isBeltTier(this.type) && this.type !== 'sensor') return;
    const hC = floorY(this.x, this.z);
    this.obj.position.y = hC;
    const inDir = this.shape === 'left' ? (this.dir + 3) % 4 : this.shape === 'right' ? (this.dir + 1) % 4 : (this.dir + 2) % 4;
    const side = (d) => { const n = this.entityIn(d); if (!n || n.static) return 0; const [x, z] = this.cellIn(d); return THREE.MathUtils.clamp((floorY(x, z) - hC) / 2, -CELL * 0.5, CELL * 0.5); };
    this.hIn = side(inDir);
    this.hOut = side(this.dir);
    const straight = this.shape === 'straight';
    const dh = straight ? this.hOut - this.hIn : 0;
    const ang = Math.atan2(dh, CELL), len = Math.hypot(CELL, dh) / CELL;
    if (straight) {
      this.model.rotation.set(ang, MODEL_YAW.belt, 0);
      this.model.scale.set(len, 1, 1);
      this.model.position.y = (this.hIn + this.hOut) / 2;
      this.chev.rotation.x = -Math.PI / 2 + ang;
      this.chev.scale.y = len;
      this.chev.position.y = BELT_Y + 0.006 + (this.hIn + this.hOut) / 2;
    } else this.chev.position.y = BELT_Y + 0.006;
    if (this.instanced) markBeltsDirty();
  }
  // escolhe entre reta e curva olhando os vizinhos
  refreshShape() {
    const feedsMe = (d) => {
      const n = this.entityIn(d);
      if (!n || !n.outputDirs) return false;
      return n.outputDirs.includes((d + 2) % 4);
    };
    const back = (this.dir + 2) % 4, left = (this.dir + 3) % 4, right = (this.dir + 1) % 4;
    let shape = 'straight';
    if (!feedsMe(back)) {
      if (feedsMe(left) && !feedsMe(right)) shape = 'left';
      else if (feedsMe(right) && !feedsMe(left)) shape = 'right';
    }
    if (shape === this.shape) { this.refreshSlope(); return; }
    this.shape = shape;
    this.obj.remove(this.model);
    if (shape === 'straight') {
      this.addModel('belt');
      this.chev.geometry = chevGeo;
      this.chev.material = chevFor(this.type).mat;
      this.chev.position.z = 0;
    } else {
      // o modelo da curva, sem girar, liga os lados oeste e sul; giramos pra ligar entrada -> frente
      const m = this.addModel('beltCorner');
      m.rotation.y = shape === 'left' ? -Math.PI / 2 : -Math.PI;
      this.chev.geometry = chevGeoShort;
      this.chev.material = chevFor(this.type).matShort;
      this.chev.position.z = -CELL * 0.25;
    }
    if (this.instanced) { this.model.visible = false; markBeltsDirty(); }
    this.refreshSlope();
  }
  onRemove() {
    for (const it of this.items) releaseItemMesh(it.mesh);
    this.items = [];
  }
  serialize() { return { ...super.serialize(), items: this.items.map((i) => [i.type, i.p, i.entry]) }; }
  load(d) {
    for (const [type, p, entry] of d.items || []) {
      if (!isItem(type)) continue;
      const it = { type, p, entry, mesh: takeItemMesh(type) };
      this.items.push(it);
      this.placeItem(it);
    }
  }
}

// ───────────────────────── Máquina base ─────────────────────────
export class Machine extends Entity {
  constructor(type, x, z, dir) {
    super(type, x, z, dir);
    this.inv = {};
    this.out = [];
    this.outCap = 10;
    this.job = null;
    this.queue = [];
    this.status = 'Parada';
    this.ejectCd = 0;
    this.anim = 0;
    this.name = uniqueName(this.def.prefixo || type);
    this.tier = 0;
    this.decorVel = 0;
    this.decorCpu = 0;
    this.recipe = null;     // receita escolhida no painel (ou por .receita())
    this.turboK = 0;        // overclock por código (.turbo): some se o programa parar de pedir
    this.turboUntil = 0;
    this.inCap = 100;
    this.addModel(this.def.model);
    // nome: não fica flutuando em cima (aparece ao mirar e no painel); a placa existe pro rename() e afins
    this.label = makeLabel(this.name);
    this.label.position.y = (this.model.userData.size?.y || 1.3) + 0.45;
    this.label.visible = false;
    this.obj.add(this.label);
    // luz de status: faixa embutida na frente do prédio (ponto 'status' do modelo)
    this.lamp = new THREE.Mesh(LAMP_GEO, new THREE.MeshStandardMaterial({ color: 0x777777, emissive: 0x000000 }));
    const st = this.model.getObjectByName('status');
    if (st) { this.model.updateMatrixWorld(true); this.obj.updateMatrixWorld(true); this.lamp.position.copy(this.obj.worldToLocal(st.getWorldPosition(new THREE.Vector3()))); }
    else this.lamp.position.set(CELL * 0.3, 0.12, -CELL * 0.47);
    this.obj.add(this.lamp);
    // portas: laranja = saída (frente), azul = entrada
    const sz = this.def.tamanho || 1;
    if (this.hasOutput) this.obj.add(portArrow(0xffa640, 0, false, sz));
    for (const side of this.inputSides) this.obj.add(portArrow(0x5fb4ff, side, true, sz));
  }
  get hasOutput() { return false; }
  get outputDirs() { return this.hasOutput ? [this.dir] : []; }
  get inputSides() { return []; } // lados locais que recebem itens: 1 direita, 2 trás, 3 esquerda, 0 frente
  // item chegando pela frente (andando contra a máquina)?
  fromFront(travelDir) { return travelDir === (this.dir + 2) % 4; }
  get power() { return powerRatio(this); }
  get canTier() { return TIERABLE.includes(this.type); }
  // multiplicador de velocidade: melhoria global × Mk × decoração
  get speedMul() { return game.economy.machineSpeed * (TIERS[this.tier]?.vel || 1) * (1 + this.decorVel) * game.economy.typeSpeed(this.type) * (this.turboK || 1) * (game.eventMul?.(this) || 1); }
  // turbo por código: vale por 10 s (o programa precisa continuar pedindo)
  setTurbo(k) {
    const max = game.economy.turboMax;
    if (typeof k !== 'number' || !(k > 0)) throw new JiboiaError('turbo() precisa de um número, ex: .turbo(1.5)');
    this.turboK = Math.min(max, Math.max(0.1, k));
    this.turboUntil = game.time + 10;
    if (k > max) game.ui?.toast(`⏩ ${this.name}: turbo máximo é ${max}× (pesquise "Turbo por Código" pra subir)`, 'warn');
    game.economy.stats.turbos = (game.economy.stats.turbos || 0) + 1;
    return this.turboK;
  }
  // receitas que esta máquina conhece (fornalha, construtora, montadora)
  recipeTable() { return null; }
  setRecipe(r) {
    const T = this.recipeTable();
    if (!T) return;
    if (r != null && !T[r]) throw new JiboiaError(`"${r}" não é receita desta máquina. Receitas: ${Object.keys(T).filter((k) => game.economy.recipeUnlocked(k, T[k])).join(', ')}`);
    this.recipe = r;
    if (this.auto) this.auto.arg = r;
  }
  // coloca itens do inventário do jogador (painel da máquina)
  insertFromPlayer(item, n) {
    const room = Math.max(0, this.inCap - this.invCount());
    const k = Math.min(n, room, game.economy.count(item));
    if (k <= 0) return 0;
    game.economy.take(item, k);
    this.addInv(item, k);
    return k;
  }
  // pega o que saiu (painel)
  takeOutput() {
    let n = 0;
    while (this.out.length) {
      if (!game.economy.give(this.out[0], 1)) break;
      this.out.shift(); n++;
    }
    return n;
  }
  takeInput(item) {
    const have = this.inv[item] || 0;
    const k = game.economy.give(item, have);
    if (k) this.takeInv(item, k);
    return k;
  }
  labelText() { return this.name + (this.tier ? ' ' + TIERS[this.tier].nome : ''); }
  rename(n) { this.name = n; setLabel(this.label, this.labelText()); }
  setTier(t) {
    this.tier = t;
    setLabel(this.label, this.labelText());
    if (this.tierRing) this.obj.remove(this.tierRing);
    if (t > 0) {
      const col = t === 1 ? 0x3ee6b8 : 0xffcf5c;
      this.tierRing = new THREE.Mesh(new THREE.TorusGeometry(CELL * 0.44, 0.035, 6, 32), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.6 }));
      this.tierRing.rotation.x = Math.PI / 2;
      this.tierRing.position.y = 0.06;
      this.obj.add(this.tierRing);
    }
  }
  invCount(t) { return t ? (this.inv[t] || 0) : Object.values(this.inv).reduce((a, b) => a + b, 0); }
  addInv(t, n = 1) { this.inv[t] = (this.inv[t] || 0) + n; }
  takeInv(t, n = 1) { this.inv[t] -= n; if (this.inv[t] <= 0) delete this.inv[t]; }

  accept(type, travelDir, mesh) {
    releaseItemMesh(mesh);
    this.addInv(type);
  }

  // pedido vindo de um programa. check() => null se pode começar, texto se deve esperar; lança erro se inválido
  request(opts) {
    const b = new Blocking();
    b.label = opts.label || '';
    b.owner = game.currentPC || null; // quem pediu (pro placar)
    this.queue.push({ ...opts, b });
    return b;
  }

  // ─── modo contínuo: a máquina repete sozinha um trabalho (ligado por programa com .ligar()) ───
  // autoRequest(kind, arg) é de cada máquina; aqui só o liga/desliga e o controle de erro
  setAuto(kind, arg = null) { this.auto = kind ? { kind, arg } : null; this.autoB = null; this.autoErr = null; }
  autoRequest() { return null; }
  autoApi(doc, validate) {
    return {
      ligar: {
        max: 2, doc,
        fn: (a) => { const arg = validate ? validate(a) : null; this.setAuto('on', arg); game.economy.stats.autoOn = (game.economy.stats.autoOn || 0) + 1; return null; },
      },
      desligar: { fn: () => { this.setAuto(null); return null; }, doc: 'Desliga o modo contínuo' },
      ligada: { fn: () => !!this.auto, doc: 'True se o modo contínuo está ligado' },
    };
  }
  runAuto() {
    if (!this.auto || this.job || this.queue.length) return;
    if (this.autoB && this.autoB.error) { // o último deu erro de verdade (não é só "esperando"): desliga
      this.autoErr = this.autoB.error;
      this.auto = null;
      return;
    }
    try { this.autoB = this.autoRequest(this.auto.kind, this.auto.arg); } catch (e) { this.autoErr = e.message; this.auto = null; }
  }

  // avisa o computador dono do pedido (placar de eficiência)
  credit(b, v, kind) {
    const pc = b.owner;
    if (!pc || !pc.score) return;
    if (kind === 'item' && typeof v === 'string') pc.score('item', 1);
    if (kind === 'money' && typeof v === 'number') pc.score('money', v);
  }

  update(dt) {
    if (this.turboK && game.time > this.turboUntil) this.turboK = 0;
    const pw = this.power;
    this.noPower = pw <= 0;
    if (this.job) {
      this.job.t += dt * this.speedMul * pw;
      if (this.job.t >= this.job.dur) {
        const j = this.job;
        this.job = null;
        const v = j.finish ? j.finish() : null;
        if (j.counts) this.credit(j.b, v, j.counts);
        j.b.resolve(v);
      }
    }
    if (!this.job) {
      let waiting = null;
      while (this.queue.length) {
        const q = this.queue[0];
        if (q.b.cancelled) { this.queue.shift(); continue; }
        if (this.noPower && usesPower(this)) { waiting = 'Sem energia ⚡'; break; }
        let r = null;
        try { r = q.check ? q.check() : null; }
        catch (e) { this.queue.shift(); q.b.fail(e.message); continue; }
        if (r) { waiting = r; break; }
        this.queue.shift();
        if (q.start) q.start();
        const dur = typeof q.dur === 'function' ? q.dur() : q.dur;
        if (!dur) { const v = q.finish ? q.finish() : null; if (q.counts) this.credit(q.b, v, q.counts); q.b.resolve(v); continue; }
        this.job = { ...q, dur, t: 0 };
        break;
      }
      this.status = this.job ? this.job.label : waiting || (this.out.length ? 'Entregando' : 'Parada');
      this.waiting = !!waiting;
    } else this.status = this.job.label;
    if (this.noPower && (this.job || this.queue.length)) this.status = 'Sem energia ⚡';
    if (this.auto) { this.runAuto(); this.status = '♾ ' + this.status; } else if (this.autoErr && !this.job && !this.queue.length) this.status = 'Modo contínuo parou: ' + this.autoErr;
    this.tryEject(dt);
    this.animate(dt);
  }

  tryEject(dt) {
    this.ejectCd -= dt;
    if (this.ejectCd > 0 || !this.out.length) return;
    const t = this.entityIn(this.dir);
    if (t && !t.removed && t.canAccept(this.out[0], this.dir)) {
      t.accept(this.out.shift(), this.dir, null);
      this.ejectCd = 0.05;
    }
  }

  // 3.0.2: peças com nome nos prédios novos (fogo, luzes, rotor, tela) reagem ao trabalho
  animateParts(dt, working) {
    // peças com nome no modelo (models3/models4): vários nomes separados por espaço, ex. 'spin bob'
    if (!this.parts) {
      const P = this.parts = { fire: [], glow: [], spin: [], spinx: [], spinz: [], bob: [], screen: [] };
      this.model?.traverse((o) => {
        if (!o.isMesh || !o.name) return;
        const tags = o.name.split(' ').filter((n) => P[n]);
        if (!tags.length) return;
        if (o.material && tags.some((n) => n === 'fire' || n === 'glow' || n === 'screen')) { o.material = o.material.clone(); o.userData.e0 = o.material.emissiveIntensity ?? 1; }
        o.userData.y0 = o.position.y;
        for (const n of tags) P[n].push(o);
      });
      this.bobT = 0; this.spinV = 0;
    }
    const P = this.parts, t = this.anim;
    // a velocidade de giro acelera e desacelera devagar (a broca não para de repente)
    this.spinV += ((working ? 6 : 0.35) - this.spinV) * Math.min(1, dt * 1.5);
    const a = dt * this.spinV;
    for (const f of P.fire) { const want = working ? 1.6 + Math.sin(t * 13 + f.id) * 0.3 + Math.sin(t * 7.1) * 0.25 : 0.08; f.material.emissiveIntensity += (want - f.material.emissiveIntensity) * Math.min(1, dt * 6); }
    for (const g of P.glow) g.material.emissiveIntensity = working ? g.userData.e0 * (1.3 + Math.sin(t * 5) * 0.45) : g.userData.e0 * 0.5;
    for (const s of P.spin) s.rotateOnWorldAxis(AX_Y, a);
    for (const s of P.spinx) s.rotateOnWorldAxis(AX_X, a * 0.8);
    for (const s of P.spinz) s.rotateOnWorldAxis(AX_Z, a * 0.6);
    // sobe e desce: broca descendo no veio, pistão da prensa batendo
    if (P.bob.length) {
      if (working) this.bobT += dt;
      const k = working ? Math.pow(Math.abs(Math.sin(this.bobT * 2.2)), 3) : 0;
      this.bobK = (this.bobK || 0) + (k - (this.bobK || 0)) * Math.min(1, dt * 8);
      for (const b of P.bob) b.position.y = b.userData.y0 - this.bobK * 0.45;
    }
    for (const s of P.screen) s.material.emissiveIntensity = (working ? 1.1 : 0.55) + (Math.random() < 0.03 ? -0.3 : 0);
  }

  animate(dt) {
    this.anim += dt;
    // partsOn(): máquinas sem 'job' (laboratório, computador) dizem quando estão trabalhando
    this.animateParts(dt, (this.partsOn ? this.partsOn() : !!this.job) && !(usesPower(this) && this.noPower));
    if (usesPower(this) && this.noPower) {
      // sem energia: luz vermelha piscando devagar
      this.lamp.material.color.setHex(PAL.bad);
      this.lamp.material.emissive.setHex(PAL.badGlow);
      this.lamp.material.emissiveIntensity = Math.sin(this.anim * 4) > 0 ? 1.4 : 0.1;
      if (this.model) this.model.scale.set(1, 1, 1);
      return;
    }
    const working = !!this.job;
    const target = working ? PAL.work : this.waiting ? PAL.wait : (this.out.length ? PAL.out : PAL.idle);
    this.lamp.material.color.setHex(target);
    this.lamp.material.emissive.setHex(target);
    this.lamp.material.emissiveIntensity = working ? 1.2 + Math.sin(this.anim * 10) * 0.4 : 0.5;
    if (this.model) {
      const s = working ? 1 + Math.sin(this.anim * 16) * 0.012 : 1;
      this.model.scale.set(1 / Math.sqrt(s), s, 1 / Math.sqrt(s));
    }
  }

  onRemove() { for (const q of this.queue) q.b.fail(`A máquina '${this.name}' foi removida`); if (this.job) this.job.b.fail(`A máquina '${this.name}' foi removida`); }

  infoLines() {
    const l = [`Status: ${this.status}`];
    const pt = powerText(this);
    if (pt) l.push(pt);
    if (this.canTier || this.decorVel) l.push(`Velocidade: ${this.speedMul.toFixed(2)}×${this.tier ? ' (' + TIERS[this.tier].nome + ')' : ''}${this.decorVel ? ` · decoração +${Math.round(this.decorVel * 100)}%` : ''}`);
    const inv = Object.entries(this.inv);
    if (inv.length) l.push('Entrada: ' + inv.map(([k, v]) => `${v}× ${itemName(k)}`).join(', '));
    if (this.out.length) l.push(`Saída: ${this.out.length}× ${itemName(this.out[0])}${this.out.length >= this.outCap ? ' (cheia!)' : ''}`);
    return l;
  }

  serialize() { return { ...super.serialize(), inv: this.inv, out: this.out, tier: this.tier, auto: this.auto || null, recipe: this.recipe }; }
  load(d) {
    if (d.name) this.rename(d.name);
    const T = this.recipeTable();
    this.recipe = T && d.recipe && T[d.recipe] ? d.recipe : null;
    if (d.tier) this.setTier(d.tier);
    this.auto = d.auto && d.auto.kind ? { kind: d.auto.kind, arg: d.auto.arg ?? null } : null;
    this.inv = {}; for (const [k, v] of Object.entries(d.inv || {})) if (isItem(k)) this.inv[k] = v;
    this.out = (d.out || []).filter(isItem);
  }

  // métodos disponíveis na Jiboia
  api() {
    return {
      ocupada: { fn: () => !!this.job || this.queue.length > 0, doc: 'True se estiver trabalhando' },
      status: { fn: () => this.status, doc: 'Texto com o que a máquina está fazendo' },
      estoque: { fn: () => new JDict(Object.entries(this.inv)), doc: 'Dicionário com os itens guardados' },
      quantidade: { fn: (a) => this.invCount(a[0] || null), max: 1, doc: 'Quantos itens (de um tipo, ou todos) tem dentro' },
      saida: { fn: () => this.out.length, doc: 'Quantos itens estão esperando pra sair' },
      energia: { fn: () => Math.round(this.power * 100) / 100, doc: '1 = energia total, 0 = sem energia' },
      turbo: { min: 1, max: 1, fn: ([k]) => this.setTurbo(k), doc: 'Overclock por código: .turbo(1.5) = 50% mais rápida por 10 s (repita no laço). Gasta mais ⚡' },
      ...(this.recipeTable() ? {
        receita: { max: 1, fn: (a) => { if (a.length) { this.setRecipe(a[0]); return null; } return this.recipe; }, doc: 'Escolhe a receita: .receita("placa_ferro") (sem nada: diz a atual)' },
        receitas: { fn: () => Object.keys(this.recipeTable()).filter((k) => game.economy.recipeUnlocked(k, this.recipeTable()[k])), doc: 'Receitas que esta máquina já sabe fazer' },
      } : {}),
    };
  }
}

function checkItemArg(name, fname) {
  if (typeof name !== 'string') throw new JiboiaError(`${fname}() precisa do nome do item entre aspas, ex: "minerio_ferro"`);
  if (!isItem(name)) {
    const s = suggest(name, Object.keys(ITEMS));
    throw new JiboiaError(`O item "${name}" não existe` + (s ? `. Você quis dizer "${s}"?` : ''));
  }
}

// ───────────────────────── Minerador ─────────────────────────
export class Miner extends Machine {
  constructor(type, x, z, dir) {
    super(type, x, z, dir);
    this.oreType = ores.get(key(x, z)) || null;
  }
  get hasOutput() { return true; }
  get purity() { return purity.get(key(this.x, this.z)) || 'normal'; }
  autoRequest() { return this.api().minerar.fn([]); }
  api() {
    return {
      ...super.api(),
      ...this.autoApi('Liga o modo contínuo: minera sem parar (sem travar o programa) até .desligar()'),
      pureza: { fn: () => this.purity, doc: 'Pureza do veio: "impuro" (½×), "normal" ou "puro" (2×)' },
      minerar: {
        doc: 'Tira 1 minério do chão (demora alguns segundos). Retorna o nome do item.',
        fn: () => {
          const ore = ORES[this.oreType];
          if (!ore) throw new JiboiaError(`O minerador '${this.name}' não está em cima de um veio de minério`);
          return this.request({
            label: 'Minerando',
            counts: 'item',
            check: () => {
              if (ore.nivel && game.economy.level < ore.nivel) throw new JiboiaError(`Minerar ${ore.nome} precisa do nível ${ore.nivel}`);
              if (ore.tech && !game.economy.hasTech(ore.tech)) throw new JiboiaError(`Minerar ${ore.nome} precisa da pesquisa "${TECH_NAME(ore.tech)}" no Laboratório`);
              return this.out.length >= this.outCap ? 'Saída cheia' : null;
            },
            dur: () => ore.tempo / PURITY[this.purity].mult,
            finish: () => {
              this.out.push(ore.item);
              game.economy.produced(ore.item);
              if (ore.raro && game.mineVein) game.mineVein(this.x, this.z); // veio de meteorito acaba
              audio.play('mine', { pos: this.pos, volume: 0.6 });
              puff(new THREE.Vector3(this.pos.x, this.pos.y + 0.3, this.pos.z), { color: 0xc9b89a, count: 5, size: 0.35, spread: 1, up: 0.6 });
              return ore.item;
            },
          });
        },
      },
      minerio: { fn: () => this.oreType ? ORES[this.oreType].item : null, doc: 'Qual minério está embaixo' },
    };
  }
  infoLines() {
    const raro = this.oreType && ORES[this.oreType].raro ? ` (restam ${game.veinLeft ? game.veinLeft(this.x, this.z) : '?'})` : '';
    const pu = PURITY[this.purity];
    return [`Veio: ${this.oreType ? `${ORES[this.oreType].nome} ${pu.icone} ${pu.nome} (${pu.mult}×)${raro}` : 'nenhum!'}`, ...super.infoLines()];
  }
}

// nome bonitinho de uma pesquisa (preenchido pelo research.js pra não ter import circular)
export let TECH_NAME = (id) => id;
export function setTechNamer(fn) { TECH_NAME = fn; }

// ───────────────────────── Fornalha ─────────────────────────
const SMELT_INPUTS = new Set(Object.values(SMELT).flatMap((r) => Object.keys(r.in)));
// acha a receita pelo nome passado (o produto, ex "lingote_ferro", ou o minério de entrada, ex "minerio_ferro")
function smeltRecipe(want) {
  if (SMELT[want]) return want;
  const eco = game.economy;
  const byOut = Object.keys(SMELT).filter((r) => SMELT[r].out === want);
  const k = byOut.find((r) => !SMELT[r].alt) || byOut.find((r) => eco.recipeUnlocked(r, SMELT[r]));
  if (k) return k;
  return Object.keys(SMELT).find((r) => !SMELT[r].alt && Object.keys(SMELT[r].in).length === 1 && SMELT[r].in[want]) || null;
}
const lockedMsg = (k, r) => r.alt ? `A receita alternativa "${k}" precisa ser liberada com um 💾 disco de dados (analise no Laboratório)` : `A receita "${k}" ainda está bloqueada: pague o marco que libera ela na Central`;
export class Smelter extends Machine {
  get hasOutput() { return true; }
  get inputSides() { return [1, 2, 3]; }
  recipeTable() { return SMELT; }
  canAccept(type, travelDir) { return !this.fromFront(travelDir) && SMELT_INPUTS.has(type) && this.invCount() < this.inCap; }
  hasInputs(r) { return Object.entries(SMELT[r].in).every(([k, n]) => (this.inv[k] || 0) >= n); }
  autoRequest(kind, arg) { return this.api().fundir.fn(arg || this.recipe ? [arg || this.recipe] : []); }
  api() {
    return {
      ...super.api(),
      ...this.autoApi('Liga a fornalha: funde sem parar a receita escolhida (ou a do argumento: .ligar("aco"))', (a) => {
        const r = a[0] ?? null;
        if (r !== null && !smeltRecipe(r)) throw new JiboiaError(`A fornalha não sabe fazer "${r}". Receitas: ${Object.keys(SMELT).join(', ')}`);
        return r === null ? this.recipe : smeltRecipe(r);
      }),
      fundir: {
        max: 1,
        doc: 'Funde 1 vez a receita pedida (ou a escolhida). Espera os itens chegarem.',
        fn: (a) => {
          const wantRaw = a[0] ?? this.recipe ?? null;
          let want = null;
          if (wantRaw !== null) {
            want = smeltRecipe(wantRaw);
            if (!want) throw new JiboiaError(`A fornalha não sabe fazer "${wantRaw}". Receitas: ${Object.keys(SMELT).join(', ')}`);
          }
          let chosen = null;
          return this.request({
            label: 'Fundindo',
            counts: 'item',
            check: () => {
              if (want && !game.economy.recipeUnlocked(want, SMELT[want])) throw new JiboiaError(lockedMsg(want, SMELT[want]));
              if (this.out.length >= this.outCap) return 'Saída cheia';
              chosen = want || Object.keys(SMELT).find((r) => game.economy.recipeUnlocked(r, SMELT[r]) && this.hasInputs(r));
              if (!chosen || !this.hasInputs(chosen)) {
                if (want) return 'Esperando ' + Object.entries(SMELT[want].in).map(([k, n]) => `${n}× ${itemName(k)}`).join(' + ');
                return 'Esperando minério';
              }
              return null;
            },
            start: () => { for (const [k, n] of Object.entries(SMELT[chosen].in)) this.takeInv(k, n); },
            dur: () => SMELT[chosen].tempo,
            finish: () => {
              const s = SMELT[chosen];
              for (let i = 0; i < (s.qtd || 1); i++) this.out.push(s.out);
              game.economy.produced(s.out, s.qtd || 1);
              audio.play('smelt', { pos: this.pos, volume: 0.3 });
              return s.out;
            },
          });
        },
      },
    };
  }
  animate(dt) {
    super.animate(dt);
    if (this.job && Math.random() < dt * 4) puff(new THREE.Vector3(this.pos.x, this.pos.y + 1.7, this.pos.z), { color: 0xd8d0e8, count: 1, size: 0.4, up: 0.9, life: 1.8, opacity: 0.45 });
    if (this.job && Math.random() < dt * 6) puff(new THREE.Vector3(this.pos.x, this.pos.y + 0.9, this.pos.z), { color: 0xff8a3a, count: 1, size: 0.15, up: 0.5, additive: true, spread: 0.6, life: 0.6 });
  }
}

// ───────────────────────── Montadora (2 entradas) e Construtora (1 entrada) ─────────────────────────
const INGREDIENTS = (T) => new Set(Object.values(T).flatMap((r) => Object.keys(r.in)));
const ASM_IN = INGREDIENTS(RECIPES), CON_IN = INGREDIENTS(CONSTRUCT);
export class Assembler extends Machine {
  get hasOutput() { return true; }
  get inputSides() { return [1, 2, 3]; }
  recipeTable() { return RECIPES; }
  get ingredients() { return ASM_IN; }
  canAccept(type, travelDir) {
    if (this.fromFront(travelDir) || this.invCount() >= this.inCap) return false;
    const r = this.recipe && this.recipeTable()[this.recipe];
    return r ? !!r.in[type] && (this.inv[type] || 0) < r.in[type] * 6 : this.ingredients.has(type);
  }
  hasIngredients(r) { return Object.entries(this.recipeTable()[r].in).every(([k, n]) => (this.inv[k] || 0) >= n); }
  autoRequest(kind, arg) { return this.api().fabricar.fn([arg || this.recipe]); }
  checkRecipe(r) {
    const T = this.recipeTable();
    if (typeof r !== 'string') throw new JiboiaError('Escolha a receita: no painel (E) ou com .receita("placa_ferro")');
    if (!T[r]) {
      const s = suggest(r, Object.keys(T));
      throw new JiboiaError(`Receita "${r}" não existe aqui` + (s ? `. Você quis dizer "${s}"?` : `. Receitas: ${Object.keys(T).join(', ')}`));
    }
    if (!game.economy.recipeUnlocked(r, T[r])) throw new JiboiaError(lockedMsg(r, T[r]));
  }
  api() {
    const T = this.recipeTable();
    return {
      ...super.api(),
      ...this.autoApi('Liga a máquina: fabrica a receita sem parar (a escolhida, ou .ligar("placa_ferro"))', (a) => {
        const r = a[0] ?? this.recipe;
        this.checkRecipe(r);
        return r;
      }),
      fabricar: {
        max: 1,
        doc: 'Fabrica 1 vez a receita (espera os ingredientes chegarem).',
        fn: (a) => {
          const r = a[0] ?? this.recipe;
          this.checkRecipe(r);
          const rec = T[r];
          const outItem = recipeOut(r, rec);
          return this.request({
            label: 'Fabricando ' + itemName(outItem),
            counts: 'item',
            check: () => {
              if (this.out.length + rec.qtd > this.outCap) return 'Saída cheia';
              if (!this.hasIngredients(r)) return 'Esperando ' + Object.entries(rec.in).map(([k, n]) => `${n}× ${itemName(k)}`).join(' + ');
              return null;
            },
            start: () => { for (const [k, n] of Object.entries(rec.in)) this.takeInv(k, n); },
            dur: () => rec.tempo,
            finish: () => {
              for (let i = 0; i < rec.qtd; i++) this.out.push(outItem);
              game.economy.produced(outItem, rec.qtd);
              audio.play('assemble', { pos: this.pos, volume: 0.3 });
              return outItem;
            },
          });
        },
      },
      pode_fabricar: { min: 1, max: 1, fn: ([r]) => { this.checkRecipe(r); return this.hasIngredients(r); }, doc: 'True se já tem os ingredientes da receita' },
    };
  }
  animate(dt) {
    super.animate(dt);
    if (this.cog) this.cog.rotation.y += dt * (this.job ? 4 : 0.4);
  }
}
export class Constructor extends Assembler {
  recipeTable() { return CONSTRUCT; }
  get ingredients() { return CON_IN; }
}

// ───────────────────────── Separador ─────────────────────────
export class Sorter extends Machine {
  constructor(...a) {
    super(...a);
    this.held = null;
    this.obj.add(portArrow(0xffa640, 1, false), portArrow(0xffa640, 3, false));
  }
  get hasOutput() { return true; }
  get inputSides() { return [2]; }
  get outputDirs() { return [this.dir, (this.dir + 1) % 4, (this.dir + 3) % 4]; }
  canAccept(type, travelDir) { return !this.held && travelDir === this.dir; } // só entra por trás
  accept(type, travelDir, mesh) {
    mesh = mesh || takeItemMesh(type);
    if (mesh.parent !== game.scene) game.scene.add(mesh);
    mesh.position.set(this.pos.x, this.pos.y + 0.62, this.pos.z);
    this.held = { type, mesh };
  }
  tryEject() { }
  // modo contínuo: regras {"item": "lado"} e um lado padrão pro resto
  autoRequest(kind, arg) {
    const rules = arg?.regras || {}, padrao = arg?.padrao || 'frente';
    let d = null;
    return this.request({
      label: 'Separando',
      check: () => {
        if (!this.held) return 'Esperando item';
        const lado = rules[this.held.type] || padrao;
        d = this.dirFromName(lado);
        const t = this.entityIn(d);
        if (!t || !t.canAccept(this.held.type, d)) return `Saída "${lado}" bloqueada`;
        return null;
      },
      start: () => { this.entityIn(d).accept(this.held.type, d, this.held.mesh); this.held = null; audio.play('sorter', { pos: this.pos, volume: 0.3 }); },
      dur: 0.35, finish: () => true,
    });
  }
  dirFromName(n) {
    const map = { frente: 0, direita: 1, esquerda: 3, tras: 2, 'trás': 2 };
    if (!(n in map)) throw new JiboiaError(`Direção "${n}" não existe. Use "esquerda", "direita" ou "frente"`);
    return (this.dir + map[n]) % 4;
  }
  api() {
    return {
      ...super.api(),
      ...this.autoApi('Separa sozinho: .ligar({"minerio_ferro": "esquerda"}, "direita") (regras por item e um lado pro resto)', (a) => {
        const regras = {};
        if (a[0] != null) {
          if (!(a[0] instanceof JDict)) throw new JiboiaError('ligar() do separador precisa de um dicionário, ex: {"minerio_ferro": "esquerda"}');
          for (const [k, v] of a[0].m) { checkItemArg(k, 'ligar'); this.dirFromName(v); regras[k] = v; }
        }
        const padrao = a[1] ?? 'frente';
        this.dirFromName(padrao);
        return { regras, padrao };
      }),
      item: { fn: () => this.held ? this.held.type : null, doc: 'Nome do item que está no separador (ou None)' },
      esperar_item: {
        doc: 'Espera chegar um item e retorna o nome dele',
        fn: () => this.request({ label: 'Esperando item', check: () => this.held ? null : 'Esperando item', finish: () => this.held.type }),
      },
      enviar: {
        min: 1, max: 1, doc: 'Manda o item pra "esquerda", "direita" ou "frente"',
        fn: ([n]) => {
          const d = this.dirFromName(n);
          return this.request({
            label: 'Enviando',
            check: () => {
              if (!this.held) return 'Esperando item';
              const t = this.entityIn(d);
              if (!t || !t.canAccept(this.held.type, d)) return `Saída "${n}" bloqueada`;
              return null;
            },
            start: () => {
              const t = this.entityIn(d);
              t.accept(this.held.type, d, this.held.mesh);
              this.held = null;
              audio.play('sorter', { pos: this.pos, volume: 0.4 });
            },
            dur: 0.35,
            finish: () => true,
          });
        },
      },
    };
  }
  onRemove() { super.onRemove(); if (this.held) releaseItemMesh(this.held.mesh); }
  infoLines() { return [`Segurando: ${this.held ? itemName(this.held.type) : 'nada'}`, `Status: ${this.status}`]; }
  serialize() { return { ...super.serialize(), held: this.held?.type }; }
  load(d) { super.load(d); if (d.held && isItem(d.held)) this.accept(d.held, this.dir, null); }
}

// ───────────────────────── Contêiner (baú) ─────────────────────────
export class Chest extends Machine {
  constructor(...a) { super(...a); this.stacks = 24; }
  get hasOutput() { return true; }
  get inputSides() { return [1, 2, 3]; }
  stacksUsed(extra) { let s = 0; for (const [k, n] of Object.entries(this.inv)) s += Math.ceil((n + (k === extra ? 1 : 0)) / (ITEMS[k]?.pilha || 100)); if (extra && !this.inv[extra]) s++; return s; }
  hasRoom(type) { return this.stacksUsed(type) <= this.stacks; }
  canAccept(type, travelDir) { return !this.fromFront(travelDir) && this.hasRoom(type); }
  insertFromPlayer(item, n) {
    let k = 0;
    while (k < n && game.economy.count(item) > 0 && this.hasRoom(item)) { game.economy.take(item, 1); this.addInv(item, 1); k++; }
    return k;
  }
  tryEject() { }
  api() {
    return {
      ...super.api(),
      retirar: {
        max: 1, doc: 'Solta 1 item (do tipo pedido, ou qualquer um) pela frente',
        fn: (a) => {
          const want = a[0] ?? null;
          if (want !== null) checkItemArg(want, 'retirar');
          let chosen = null;
          return this.request({
            label: 'Retirando',
            check: () => {
              chosen = want || Object.keys(this.inv)[0];
              if (!chosen || !this.inv[chosen]) return want ? `Sem ${itemName(want)}` : 'Vazio';
              const t = this.entityIn(this.dir);
              if (!t || !t.canAccept(chosen, this.dir)) return 'Saída bloqueada';
              return null;
            },
            start: () => { this.takeInv(chosen); this.entityIn(this.dir).accept(chosen, this.dir, null); },
            dur: 0.3,
            finish: () => chosen,
          });
        },
      },
    };
  }
  // 3.0.3: as caixas nas prateleiras aparecem conforme o depósito enche
  animate(dt) {
    super.animate(dt);
    this.crateT = (this.crateT || 0) - dt;
    if (this.crateT > 0) return;
    this.crateT = 0.5;
    if (!this.crates) { this.crates = []; this.model?.traverse((o) => { if (o.name === 'crate') this.crates.push(o); }); this.crates.sort((a, b) => a.userData.order - b.userData.order); }
    const n = Math.ceil((this.stacksUsed() / this.stacks) * this.crates.length);
    this.crates.forEach((c, i) => { c.visible = i < n; });
  }
  infoLines() { return [`Guardado: ${this.stacksUsed()}/${this.stacks} pilhas (${this.invCount()} itens)`, ...super.infoLines().slice(1)]; }
}

// ───────────────────────── Decoração ─────────────────────────
export class Decor extends Entity {
  constructor(type, x, z, dir) {
    super(type, x, z, dir);
    // tapete e ventilador de teto não atrapalham a passagem
    this.solid = !this.def.baixo && !this.def.noTeto;
    this.addModel(this.def.model);
    if (this.def.noTeto) this.model.position.y = 2.2; // pendurado perto do teto
    if (this.def.luz) {
      const l = virtualLight(new THREE.PointLight(0xffc98a, 6, 7, 1.5));
      l.position.y = this.def.casa ? 1.1 : 1.6;
      this.obj.add(l);
    }
  }
  update(dt) { if (this.def.noTeto) this.model.rotation.y += dt * 4; }
}

// ───────────────────────── Gerador ─────────────────────────
export class Generator extends Machine {
  get producing() { return this.net && this.net.demand > 0; }
  api() {
    return {
      producao: { fn: () => Math.round(outputOf(this) * 10) / 10, doc: 'Quanto ⚡ este gerador produz agora' },
      consumo: { fn: () => this.net ? this.net.demand : 0, doc: 'Quanto ⚡ a rede dele está usando' },
    };
  }
  update(dt) {
    this.status = this.producing ? 'Gerando energia' : 'Ligado (ninguém usando)';
    this.animate(dt);
  }
  animate(dt) {
    this.anim += dt;
    const on = this.producing;
    this.lamp.material.color.setHex(on ? 0xffc040 : 0x7fb2ff);
    this.lamp.material.emissive.setHex(on ? 0xffa020 : 0x4a70c0);
    this.lamp.material.emissiveIntensity = on ? 1.2 + Math.sin(this.anim * 12) * 0.5 : 0.6;
    if (on) {
      const s = 1 + Math.sin(this.anim * 30) * 0.008;
      this.model.scale.set(s, 1 / s, s);
      if (Math.random() < dt * 1.5) puff(new THREE.Vector3(this.pos.x, this.pos.y + 1.1, this.pos.z), { color: 0xcfc8e0, count: 1, size: 0.3, up: 0.8, life: 1.4, opacity: 0.35 });
    }
  }
  infoLines() { return [`Status: ${this.status}`, powerText(this)]; }
}

// ───────────────────────── Poste de energia ─────────────────────────
export class Pole extends Entity {
  constructor(type, x, z, dir) {
    super(type, x, z, dir);
    // 3.0.2: torre de treliça com isoladores e farol (models3.js)
    this.addModel(this.def.model || 'pylon3');
    this.cap = null;
    this.model.traverse((o) => { if (o.name === 'glow' && o.isMesh) { o.material = o.material.clone(); this.cap = o; } });
    this.t = Math.random() * 6;
  }
  update(dt = 0.016) {
    const on = this.net && this.net.supply > 0;
    this.t += dt;
    if (this.cap) this.cap.material.emissiveIntensity = on ? 0.8 + Math.max(0, Math.sin(this.t * 2.2)) * 1.4 : 0.12;
  }
  infoLines() { return [this.net ? `⚡ Rede: gera ${this.net.supply} · usa ${this.net.demand}` : 'Sem cabos']; }
}

Object.assign(ENTITY_CLASSES, {
  esteira: Belt, esteira_rapida: Belt, esteira_expressa: Belt, esteira_mk4: Belt, esteira_mk5: Belt, minerador: Miner, fornalha: Smelter,
  montadora: Assembler, construtora: Constructor, separador: Sorter, bau: Chest, gerador_grande: Generator, poste: Pole,
});

export function createEntity(type, x, z, dir) {
  const C = ENTITY_CLASSES[type] || (DECOR[type] ? Decor : null);
  if (!C) throw new Error('tipo desconhecido ' + type);
  const e = new C(type, x, z, dir);
  if (e.type === 'montadora' || e.type === 'construtora') {
    const c = cloneModel('cog');
    c.position.set(0, (e.model.userData.size?.y || 1.3) + 0.02, 0);
    c.scale.setScalar(1.3);
    e.obj.add(c);
    e.cog = c;
  }
  return e;
}

// células que uma construção ocupa (a Central e a Plataforma são 3×3, centradas)
export function footprint(type, x, z) {
  const n = MACHINES[type]?.tamanho || 1;
  if (n === 1) return [[x, z]];
  const h = (n - 1) / 2, out = [];
  for (let dx = -h; dx <= h; dx++) for (let dz = -h; dz <= h; dz++) out.push([x + dx, z + dz]);
  return out;
}
export function addEntity(e) {
  game.entities.push(e);
  if (e.layer === 1) gridUp.set(key(e.x, e.z), e);
  else for (const [x, z] of footprint(e.type, e.x, e.z)) grid.set(key(x, z), e);
  if (e.alsoUp) gridUp.set(key(e.x, e.z), e); // rampas ocupam os dois andares
  game.scene.add(e.obj);
  if (e.instanced) markBeltsDirty();
  refreshBeltsAround(e.x, e.z);
  if (canWire(e)) recomputePower();
  game.emit('entities');
  return e;
}

export function removeEntity(e) {
  e.removed = true;
  disconnectAll(e);
  e.onRemove();
  game.scene.remove(e.obj);
  const k = key(e.x, e.z);
  for (const [x, z] of footprint(e.type, e.x, e.z)) if (grid.get(key(x, z)) === e) grid.delete(key(x, z));
  if (gridUp.get(k) === e) gridUp.delete(k);
  const i = game.entities.indexOf(e);
  if (i >= 0) game.entities.splice(i, 1);
  if (e.instanced) markBeltsDirty();
  refreshBeltsAround(e.x, e.z);
  recomputePower();
  game.emit('entities');
}

export function refreshBeltsAround(x, z) {
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    const e = grid.get(key(x + dx, z + dz));
    if (e && (isBeltTier(e.type) || e.type === 'sensor')) e.refreshShape();
  }
}
// o jogador pisa no topo das fundações
game.floorAt = (x, z) => { const f = foundations.get(x + ',' + z); return f === undefined ? null : f; };

export function findByName(name) {
  if ((name === 'tete' || name === 'têtê' || name === 'oopi') && game.pet?.obj.visible) return game.pet; // o TÊTÊ também obedece programas (amizade nível 2); "oopi" dos programas antigos
  return game.entities.find((e) => e.name === name && e.isMachine) || (game.drones || []).find((d) => d.name === name && !d.removed);
}

// bônus de decoração perto de máquinas e computadores (recalculado de tempos em tempos)
export function updateDecorBonus() {
  const decos = game.entities.filter((e) => DECOR_BONUS[e.type]);
  for (const e of game.entities) {
    if (!e.isMachine) continue;
    let cpu = 0, vel = 0;
    for (const d of decos) {
      const b = DECOR_BONUS[d.type];
      const r = (b.raio || 3) + 0.5;
      if (Math.abs(d.x - e.x) <= r && Math.abs(d.z - e.z) <= r) { cpu += b.cpu || 0; vel += b.vel || 0; }
    }
    e.decorCpu = Math.min(DECOR_BONUS_MAX, cpu);
    e.decorVel = Math.min(DECOR_BONUS_MAX, vel);
  }
}

// Referência de máquina usada dentro da Jiboia
export class MachineRef {
  constructor(e) { this.e = e; this.jTypeName = 'máquina'; }
  jStr() { return `<máquina ${this.e.name}>`; }
  jEq(o) { return o instanceof MachineRef && o.e === this.e; }
  jGetAttr(name, line, interp) {
    const e = this.e;
    if (e.removed) throw new JiboiaError(`A máquina '${e.name}' não existe mais`, line);
    if (name === 'nome') return e.name;
    if (name === 'tipo') return e.type;
    const api = e.api ? e.api() : {};
    const m = api[name];
    if (!m) {
      const s = suggest(name, Object.keys(api));
      throw new JiboiaError(`${MACHINES[e.type]?.nome || e.type} '${e.name}' não tem o método '${name}'` + (s ? `. Você quis dizer '${s}'?` : `. Métodos: ${Object.keys(api).join(', ')}`), line);
    }
    void interp;
    return new Builtin(name, (args) => m.fn(args), m.min ?? 0, m.max ?? m.min ?? 0);
  }
}
