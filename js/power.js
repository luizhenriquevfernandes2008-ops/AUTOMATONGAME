// Energia: cabos entre geradores, postes e máquinas. Cada grupo conectado é uma "rede".
import * as THREE from 'three';
import { game } from './state.js';
import { MACHINES, WIRE_MAX, WIRE_MAX_MACHINE, WIRE_MAX_LEN, TIERS } from './data.js';

export const wires = []; // {a, b, mesh}
const wireMat = new THREE.MeshStandardMaterial({ color: 0x2b2445, roughness: 0.6 });
const wireMatLive = new THREE.MeshStandardMaterial({ color: 0x3a2f60, roughness: 0.5, emissive: 0xffa640, emissiveIntensity: 0.25 });

// consumo/geração
export const usesPower = (e) => !!(MACHINES[e.type]?.energia);
export const makesPower = (e) => !!(MACHINES[e.type]?.gera);
// quanto ⚡ a entidade gera AGORA (carvão precisa de combustível, solar depende do sol)
export const outputOf = (e) => (e.powerOutput ? e.powerOutput() : (MACHINES[e.type]?.gera || 0));
// quanto ⚡ ela pede (Mk2/Mk3 gastam mais)
export const demandOf = (e) => Math.round(((MACHINES[e.type]?.energia || 0) * (TIERS[e.tier || 0]?.energia || 1) * (e.turboK ? Math.pow(e.turboK, 1.6) : 1) + (e.hwEnergy || 0)) * 10) / 10;
export function wireMax(e) {
  if (WIRE_MAX[e.type]) return WIRE_MAX[e.type];
  return usesPower(e) ? WIRE_MAX_MACHINE : 0;
}
export const canWire = (e) => !!e && !e.static && wireMax(e) > 0;
export const wiresOf = (e) => wires.filter((w) => w.a === e || w.b === e);

// ponto onde o cabo prende na entidade
export function wirePoint(e) {
  const h = e.type === 'poste' ? 4.55 : (e.model?.userData.size?.y || 1.2) * 0.85;
  return new THREE.Vector3(e.pos.x, e.pos.y + h, e.pos.z);
}

function buildWireMesh(a, b, live) {
  const p1 = wirePoint(a), p2 = wirePoint(b);
  const len = p1.distanceTo(p2);
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const p = p1.clone().lerp(p2, t);
    p.y -= Math.sin(t * Math.PI) * Math.min(0.9, len * 0.06); // barriguinha do fio
    pts.push(p);
  }
  const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.028, 5, false);
  const m = new THREE.Mesh(geo, live ? wireMatLive : wireMat);
  m.castShadow = true;
  return m;
}

export function checkConnect(a, b) {
  if (!canWire(a) || !canWire(b)) return 'Isso não recebe cabo de energia';
  if (a === b) return 'Escolha outra coisa pra ligar';
  if (wires.some((w) => (w.a === a && w.b === b) || (w.a === b && w.b === a))) return 'Já estão ligados';
  const d = wirePoint(a).distanceTo(wirePoint(b));
  if (d > WIRE_MAX_LEN) return `Longe demais (${d.toFixed(0)} m, máx ${WIRE_MAX_LEN} m). Use postes no meio`;
  if (wiresOf(a).length >= wireMax(a)) return `${nameOf(a)} já tem o máximo de cabos (${wireMax(a)})`;
  if (wiresOf(b).length >= wireMax(b)) return `${nameOf(b)} já tem o máximo de cabos (${wireMax(b)})`;
  return null;
}
const nameOf = (e) => MACHINES[e.type]?.nome || e.type;

const addrOf = (e) => `${e.x},${e.z},${e.layer || 0}`;
export function connect(a, b) {
  if (game.mp?.intercept('wire', { a: addrOf(a), b: addrOf(b) })) return null; // multiplayer: o anfitrião liga
  const err = checkConnect(a, b);
  if (err) return err;
  const w = { a, b, mesh: null };
  wires.push(w);
  recompute();
  game.mp?.op('wire', { a: addrOf(a), b: addrOf(b) });
  return null;
}

export function disconnectAll(e) {
  if (game.mp?.intercept('unwireAll', { a: addrOf(e) })) return wires.filter((w) => w.a === e || w.b === e).length;
  let n = 0;
  for (let i = wires.length - 1; i >= 0; i--) {
    const w = wires[i];
    if (w.a === e || w.b === e) {
      if (w.mesh) { game.scene.remove(w.mesh); w.mesh.geometry.dispose(); }
      wires.splice(i, 1);
      n++;
    }
  }
  if (n) { recompute(); game.mp?.op('unwireAll', { a: addrOf(e) }); }
  return n;
}

export function disconnect(a, b) {
  if (game.mp?.intercept('unwire', { a: addrOf(a), b: addrOf(b) })) return true;
  const i = wires.findIndex((w) => (w.a === a && w.b === b) || (w.a === b && w.b === a));
  if (i < 0) return false;
  const w = wires[i];
  if (w.mesh) { game.scene.remove(w.mesh); w.mesh.geometry.dispose(); }
  wires.splice(i, 1);
  recompute();
  game.mp?.op('unwire', { a: addrOf(a), b: addrOf(b) });
  return true;
}

export function clearAll() {
  for (const w of wires) if (w.mesh) { game.scene.remove(w.mesh); w.mesh.geometry.dispose(); }
  wires.length = 0;
}

// monta as redes e calcula geração × consumo
export function recompute() {
  const ents = game.entities.filter((e) => canWire(e));
  for (const e of ents) e.net = null;
  const adj = new Map(ents.map((e) => [e, []]));
  for (const w of wires) { adj.get(w.a)?.push(w.b); adj.get(w.b)?.push(w.a); }
  const nets = [];
  for (const start of ents) {
    if (start.net) continue;
    const net = { supply: 0, demand: 0, ratio: 0, members: [] };
    const stack = [start];
    start.net = net;
    while (stack.length) {
      const e = stack.pop();
      net.members.push(e);
      for (const n of adj.get(e) || []) if (!n.net) { n.net = net; stack.push(n); }
    }
    nets.push(net);
  }
  // máquina sozinha, sem cabo nenhum: sem rede
  for (const e of ents) if (usesPower(e) && !wiresOf(e).length) e.net = null;
  game.powerNets = nets.filter((n) => n.members.some((m) => m.net === n));
  for (const n of game.powerNets) n.members = n.members.filter((m) => m.net === n);
  updatePower(true);
  // redesenha cabos (acesos se a rede tem energia)
  for (const w of wires) {
    if (w.mesh) { game.scene.remove(w.mesh); w.mesh.geometry.dispose(); }
    w.mesh = buildWireMesh(w.a, w.b, (w.a.net?.supply || 0) > 0);
    w.live = (w.a.net?.supply || 0) > 0;
    game.scene.add(w.mesh);
  }
  game.emit('power');
}

// recalcula geração x consumo de cada rede (chamado sempre, porque carvão/sol mudam)
export function updatePower(silent) {
  let changed = false;
  for (const net of game.powerNets || []) {
    let s = 0, d = 0;
    for (const e of net.members) { if (!e.removed) { s += outputOf(e); d += demandOf(e); } }
    s = Math.round(s * 10) / 10;
    d = Math.round(d * 10) / 10;
    if (s !== net.supply || d !== net.demand) changed = true;
    net.supply = s; net.demand = d;
    net.ratio = d === 0 ? 1 : Math.min(1, s / d);
  }
  if (changed && !silent) {
    for (const w of wires) {
      const live = (w.a.net?.supply || 0) > 0;
      if (w.mesh && live !== w.live) { w.mesh.material = live ? wireMatLive : wireMat; w.live = live; }
    }
    game.emit('power');
  }
}

// 0..1: quanto da energia pedida a máquina está recebendo
export function powerRatio(e) {
  if (!usesPower(e)) return 1;
  if (!e.net || e.net.supply <= 0) return 0;
  return e.net.ratio;
}

export function powerText(e) {
  if (makesPower(e)) {
    const n = e.net;
    const now = outputOf(e);
    const extra = e.powerNote ? ' · ' + e.powerNote() : '';
    return n ? `⚡ Gerando ${Math.round(now)}${extra} · rede usa ${n.demand}/${n.supply}${n.demand > n.supply ? ' (sobrecarregada!)' : ''}` : `⚡ Gerando ${Math.round(now)}${extra}`;
  }
  if (!usesPower(e)) return '';
  const r = powerRatio(e);
  const need = demandOf(e);
  if (!e.net) return `⚡ Sem energia: ligue um cabo 🔌 (gasta ${need} ⚡)`;
  if (r === 0) return `⚡ Sem energia: a rede não tem gerador (gasta ${need} ⚡)`;
  if (r < 1) return `⚡ Energia fraca (${Math.round(r * 100)}%): rede usa ${e.net.demand}, gera ${e.net.supply}. Compre mais geradores!`;
  return `⚡ Com energia (gasta ${need}; rede ${e.net.demand}/${e.net.supply})`;
}

export function totals() {
  let s = 0, d = 0;
  for (const n of game.powerNets || []) { s += n.supply; d += n.demand; }
  return { supply: s, demand: d };
}

// preview do cabo enquanto o jogador escolhe o segundo ponto
let preview = null;
export function showPreview(from, toPoint, ok) {
  if (preview) { game.scene.remove(preview); preview.geometry.dispose(); preview = null; }
  if (!from || !toPoint) return;
  const p1 = wirePoint(from);
  const geo = new THREE.TubeGeometry(new THREE.LineCurve3(p1, toPoint), 1, 0.03, 5, false);
  preview = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: ok ? 0x3fe0cc : 0xff4455, transparent: true, opacity: 0.8 }));
  game.scene.add(preview);
}

export function serializeWires() {
  return wires.map((w) => [w.a.x, w.a.z, w.b.x, w.b.z]);
}
export function loadWires(list, grid, key) {
  for (const [ax, az, bx, bz] of list || []) {
    const a = grid.get(key(ax, az)), b = grid.get(key(bx, bz));
    if (a && b && !a.static && !b.static) wires.push({ a, b, mesh: null });
  }
  recompute();
}
