// Contratos: um quadro no escritório com pedidos de clientes. Aceite, mande os itens por esteira
// pra Doca de Entrega e ganhe dinheiro, XP e 🎟️ fichas. Perder o prazo não tira nada: outro pedido aparece.
import * as THREE from 'three';
import { game } from './state.js';
import { ITEMS, CLIENTS, RARITY, SMELT, RECIPES, recipeOut, TECHS } from './data.js';
import { ENTITY_CLASSES, Machine, itemName, isItem } from './machines.js';
import { releaseItemMesh } from './itemMeshes.js';
import { cloneModel } from './assets.js';
import { audio } from './audio.js';
import { puff, floatText, confetti } from './fx.js';
import { colliders, interactables } from './world.js';
import { JDict, JiboiaError } from './lang/jiboia.js';
import { thumbs } from './thumbs.js';

const MAX_OFFERS = 4;
export const UNLOCK_LEVEL = 2;
const fmt = (n) => Math.round(n).toLocaleString('pt-BR');

function st() {
  const eco = game.economy;
  if (!eco.contracts) eco.contracts = { offers: [], active: [], next: 5, seq: 1, slots: 2 };
  return eco.contracts;
}
export const contractState = st;

// ─── o que o jogador já consegue fazer ───
export function canMake(item) {
  const eco = game.economy;
  if (item === 'minerio_ferro' || item === 'minerio_cobre') return true;
  if (item === 'quartzo') return eco.level >= 5;
  if (item === 'carvao') return eco.hasTech('carvao');
  if (item === 'escoria') return false;
  if (item === 'fragmento_estelar') return (eco.stats.fragments || 0) > 0 || (eco.stats.produced.fragmento_estelar || 0) > 0;
  if (ITEMS[item].horta || item === 'madeira') return true;
  const ok = (r, k) => r.nivel <= eco.level && (!r.tech || eco.hasTech(r.tech)) && (!r.alt || eco.hasAlt(k));
  if (Object.entries(SMELT).some(([k, r]) => r.out === item && ok(r, k))) return true;
  if (Object.entries(RECIPES).some(([k, r]) => recipeOut(k, r) === item && ok(r, k))) return true;
  return false;
}

const pick = (a) => a[Math.floor(Math.random() * a.length)];
function niceQty(q) { return q > 30 ? Math.round(q / 10) * 10 : q > 10 ? Math.round(q / 5) * 5 : Math.max(2, Math.round(q)); }

export function makeOffer(forceRarity) {
  const eco = game.economy;
  const s = st();
  const makeable = Object.keys(ITEMS).filter((k) => canMake(k) && ITEMS[k].base >= 2);
  if (!makeable.length) return null;
  let rar = forceRarity;
  if (!rar) {
    const r = Math.random();
    rar = eco.level >= 5 && r < 0.09 ? 'lendario' : r < 0.36 ? 'raro' : 'comum';
  }
  const kinds = rar === 'lendario' ? 3 : rar === 'raro' ? 2 : 1 + (Math.random() < 0.35 ? 1 : 0);
  const clients = CLIENTS.filter((c) => c.gosta.some((k) => makeable.includes(k)));
  const client = pick(clients.length ? clients : CLIENTS);
  const liked = client.gosta.filter((k) => makeable.includes(k));
  // lendários preferem os itens mais valiosos
  const pool = [...liked, ...makeable.filter((k) => !liked.includes(k))];
  const chosen = [];
  const sorted = rar === 'lendario' ? [...pool].sort((a, b) => ITEMS[b].base - ITEMS[a].base).slice(0, 6) : pool;
  while (chosen.length < Math.min(kinds, pool.length)) {
    const src = chosen.length === 0 && liked.length ? liked : sorted;
    const k = pick(src);
    if (!chosen.includes(k)) chosen.push(k);
  }
  const scale = { comum: 1, raro: 2, lendario: 4 }[rar];
  const target = (70 + eco.level * 60) * scale;
  const itens = {};
  let value = 0;
  for (const k of chosen) {
    const q = Math.min(200, niceQty(target / chosen.length / ITEMS[k].base));
    itens[k] = q;
    value += q * ITEMS[k].base;
  }
  const R = RARITY[rar];
  const premio = Math.round((value * R.mult) / 5) * 5;
  const o = {
    id: s.seq++, cliente: client.nome, icone: client.icone, raridade: rar, itens, progresso: {},
    premio, fichas: R.fichas, disco: rar === 'lendario' ? 1 : 0,
    prazo: Math.round(R.prazo * (1 + (chosen.length - 1) * 0.25)), expira: game.time + 480,
  };
  return o;
}

export function acceptContract(id) {
  if (game.mp?.guestRpc('contract', { id })) return null;
  const s = st();
  const i = s.offers.findIndex((o) => o.id === id);
  if (i < 0) return 'Esse pedido não existe mais';
  if (usedSlots() >= s.slots) return `Você já tem ${s.slots} contratos em andamento`;
  const o = s.offers.splice(i, 1)[0];
  o.t0 = game.time;
  o.ate = game.time + o.prazo;
  s.active.push(o);
  if (!game.entities.some((e) => e.type === 'doca_entrega')) game.ui?.toast('📦 Coloque uma <b>Doca de Entrega</b> (loja) e mande os itens por esteira até ela.', 'warn');
  audio.play('buy', { volume: 0.5 });
  game.emit('contracts');
  return null;
}
export function cancelContract(id) {
  if (game.mp?.guestRpc('uncontract', { id })) return;
  const s = st();
  const i = s.active.findIndex((o) => o.id === id);
  if (i >= 0) { s.active.splice(i, 1); game.emit('contracts'); }
}
const missing = (o, k) => Math.max(0, (o.itens[k] || 0) - (o.progresso[k] || 0));
export const contractPercent = (o) => {
  let need = 0, have = 0;
  for (const [k, n] of Object.entries(o.itens)) { need += n; have += Math.min(n, o.progresso[k] || 0); }
  return need ? have / need : 0;
};
export function wants(item) { return st().active.some((o) => missing(o, item) > 0); }
// um item chegou numa doca
export function deliver(item, dock) {
  const s = st();
  const o = s.active.find((c) => missing(c, item) > 0);
  if (!o) return false;
  o.progresso[item] = (o.progresso[item] || 0) + 1;
  if (contractPercent(o) >= 1) complete(o, dock);
  else game.emit('contractProgress', o);
  return true;
}
// parcerias (contrato em dupla com um amigo) não ocupam vaga e não têm prazo
export const usedSlots = () => st().active.filter((o) => !o.parceria).length;
export function addPartnerContract(o) {
  const s = st();
  if (s.active.some((c) => c.parceria === o.parceria)) return false;
  s.active.push({ ...o, id: s.seq++, progresso: {}, t0: game.time, ate: game.time + 1e8, prazo: 1e8 });
  game.emit('contracts');
  return true;
}
function complete(o, dock) {
  const s = st();
  const eco = game.economy;
  s.active = s.active.filter((c) => c !== o);
  const fast = !o.parceria && game.time - o.t0 <= o.prazo / 2;
  let money = o.premio;
  if (fast) { money = Math.round(money * 1.25); eco.stats.fastContracts = (eco.stats.fastContracts || 0) + 1; }
  let fichas = o.fichas;
  if (o.raridade !== 'comum' && eco.friendLevel >= 5) fichas++;
  eco.addMoney(money);
  eco.stats.earned += money;
  eco.addXp(money / 4);
  eco.addTokens(fichas);
  if (o.disco) { eco.disks += o.disco; eco.stats.disksFound = (eco.stats.disksFound || 0) + o.disco; }
  eco.stats.contracts = (eco.stats.contracts || 0) + 1;
  if (o.raridade === 'lendario') eco.stats.legendary = (eco.stats.legendary || 0) + 1;
  audio.play('levelup', { volume: 0.7 });
  if (dock) {
    floatText(new THREE.Vector3(dock.pos.x, 2.6, dock.pos.z), `+$ ${fmt(money)}`, '#ffcf5c');
    floatText(new THREE.Vector3(dock.pos.x, 3.2, dock.pos.z), `+${fichas} 🎟️`, '#ff9ae0');
    shipFrom(dock);
  }
  if (o.raridade !== 'comum') confetti(o.raridade === 'lendario' ? 160 : 70);
  game.ui?.banner(`${o.icone} Contrato cumprido!`, `${o.cliente} · ${RARITY[o.raridade].nome}`, [
    `+$ ${fmt(money)}${fast ? ' (entrega relâmpago ⚡ +25%)' : ''}`, `+${fichas} 🎟️ ficha${fichas > 1 ? 's' : ''}`, o.disco ? '+1 💾 disco de dados' : '']);
  game.emit('contractDone', o);
  game.emit('contracts');
}

export function updateContracts(dt) {
  const eco = game.economy;
  if (!eco || eco.level < UNLOCK_LEVEL) return;
  const s = st();
  s.tick = (s.tick || 0) - dt;
  if (s.tick > 0) return;
  s.tick = 1;
  let changed = false;
  for (const o of [...s.active]) {
    if (!o.parceria && game.time > o.ate) {
      s.active = s.active.filter((c) => c !== o);
      game.ui?.toast(`${o.icone} O prazo do pedido de <b>${o.cliente}</b> acabou. Sem problemas: outros clientes vão aparecer 😊`);
      changed = true;
    }
  }
  const before = s.offers.length;
  s.offers = s.offers.filter((o) => game.time < o.expira);
  if (s.offers.length !== before) changed = true;
  s.next -= 1;
  if (s.next <= 0 && s.offers.length < MAX_OFFERS) {
    s.next = 75 + Math.random() * 60;
    const o = makeOffer();
    if (o) {
      s.offers.push(o);
      changed = true;
      if (o.raridade === 'lendario') { game.ui?.toast(`🌟 Pedido <b>lendário</b> no Quadro de Contratos: ${o.icone} ${o.cliente}!`, 'ach'); audio.play('quest', { volume: 0.6 }); }
    }
  }
  if (changed) game.emit('contracts');
  drawBoard();
}

// ─── Doca de Entrega ───
export class DeliveryDock extends Machine {
  constructor(...a) { super(...a); this.delivered = 0; this.lamp.visible = true; }
  get inputSides() { return [0, 1, 2, 3]; }
  canAccept(type) { return wants(type); }
  accept(type, travelDir, mesh) {
    releaseItemMesh(mesh);
    if (deliver(type, this)) {
      this.delivered++;
      this.bump = 0.2;
      if (Math.random() < 0.3) audio.play('drop', { pos: this.pos, volume: 0.3 });
    }
  }
  update(dt) {
    this.anim += dt;
    const s = st();
    this.status = game.economy.level < UNLOCK_LEVEL ? `Contratos liberam no nível ${UNLOCK_LEVEL}` : s.active.length ? `Recebendo pra ${s.active.length} contrato(s)` : 'Nenhum contrato aceito: veja o 📋 Quadro de Contratos';
    const on = s.active.length > 0;
    this.lamp.material.color.setHex(on ? 0x3ee67a : 0x777777);
    this.lamp.material.emissive.setHex(on ? 0x3ee67a : 0x000000);
    this.lamp.material.emissiveIntensity = on ? 0.8 : 0;
    if (this.bump > 0) { this.bump -= dt; const k = 1 + this.bump * 0.25; this.model.scale.set(k, 1 / k, k); }
  }
  api() {
    return {
      faltando: { fn: () => new JDict(neededTotals()), doc: 'Dicionário com o que ainda falta entregar em todos os contratos aceitos' },
      entregues: { fn: () => this.delivered, doc: 'Quantos itens esta doca já recebeu' },
      aceita: {
        min: 1, max: 1, doc: 'True se algum contrato aceito ainda precisa desse item',
        fn: ([k]) => { if (!isItem(k)) throw new JiboiaError(`O item "${k}" não existe`); return wants(k); },
      },
    };
  }
  infoLines() {
    const s = st();
    const l = [`Status: ${this.status}`, `Itens recebidos: ${this.delivered}`];
    const need = Object.entries(neededTotals());
    if (need.length) l.push('Falta: ' + need.map(([k, n]) => `${n}× ${itemName(k)}`).join(', '));
    void s;
    return l;
  }
  serialize() { return { ...super.serialize(), delivered: this.delivered }; }
  load(d) { super.load(d); this.delivered = d.delivered || 0; }
}
ENTITY_CLASSES.doca_entrega = DeliveryDock;

export function neededTotals() {
  const out = {};
  for (const o of st().active) for (const k of Object.keys(o.itens)) { const m = missing(o, k); if (m) out[k] = (out[k] || 0) + m; }
  return out;
}

// função contratos() da Jiboia
export function jiboiaContracts() {
  return st().active.map((o) => new JDict([
    ['id', o.id], ['cliente', o.cliente], ['raridade', o.raridade], ['premio', o.premio],
    ['faltando', new JDict(Object.keys(o.itens).map((k) => [k, missing(o, k)]))],
    ['segundos', Math.max(0, Math.round(o.ate - game.time))],
  ]));
}

// ─── nave de carga que leva a encomenda (efeito) ───
const ships = [];
function shipFrom(dock) {
  const m = cloneModel('cargoShip');
  m.position.set(dock.pos.x, 1.2, dock.pos.z);
  game.scene.add(m);
  ships.push({ m, t: 0, x: dock.pos.x, z: dock.pos.z, a: Math.random() * Math.PI * 2 });
  audio.play('thruster', { pos: dock.pos, volume: 0.6 });
}
export function updateShips(dt) {
  for (let i = ships.length - 1; i >= 0; i--) {
    const s = ships[i];
    s.t += dt;
    const up = Math.min(1, s.t / 1.2);
    const fly = Math.max(0, s.t - 1.2);
    s.m.position.set(s.x + Math.cos(s.a) * fly * fly * 6, 1.2 + up * 3 + fly * fly * 4, s.z + Math.sin(s.a) * fly * fly * 6);
    s.m.rotation.y = -s.a + Math.PI / 2;
    if (Math.random() < dt * 25) puff(s.m.position.clone(), { color: 0xffa640, count: 1, size: 0.5, up: -1, additive: true, life: 0.6 });
    if (s.t > 6) { game.scene.remove(s.m); ships.splice(i, 1); }
  }
}

// ─── quadro físico no escritório ───
let board = null;
export function buildContractBoard() {
  const x = -12.2, z = 25.2;
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = Math.PI / 2; // de frente pro escritório (+x)
  game.scene.add(g);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.2, 0.15), new THREE.MeshStandardMaterial({ color: 0x28313b, roughness: 0.6 }));
  frame.position.y = 2.05;
  frame.castShadow = true;
  g.add(frame);
  for (const sx of [-1.35, 1.35]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.2, 0.14), new THREE.MeshStandardMaterial({ color: 0x1e252d }));
    post.position.set(sx, 0.6, 0);
    g.add(post);
  }
  const c = document.createElement('canvas');
  c.width = 640; c.height = 440;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 2.06), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  screen.position.set(0, 2.05, 0.08);
  g.add(screen);
  // caixas de papelão de enfeite
  const b1 = cloneModel('boxCard'); b1.position.set(1.9, 0, 0.3); g.add(b1);
  const b2 = cloneModel('boxCardOpen'); b2.position.set(-1.9, 0, 0.35); b2.rotation.y = 0.4; g.add(b2);
  colliders.push({ x, z: z - 1.35, r: 0.35 }, { x, z: z + 1.35, r: 0.35 }, { x: x + 0.3, z: z - 1.9, r: 0.35 }, { x: x + 0.35, z: z + 1.9, r: 0.35 });
  interactables.push({ obj: g, label: '📋 Quadro de Contratos: pedidos de clientes', action: 'contracts' });
  board = { c, tex, t: 0 };
  drawBoard(); // já nasce desenhado (antes ficava vazio até o nível 2)
}
function drawBoard() {
  if (!board) return;
  board.t -= 1;
  if (board.t > 0) return;
  board.t = 2;
  const g = board.c.getContext('2d');
  const W = 640, H = 440;
  // v2 · KX-7: painel de terminal escuro (no lugar da cortiça)
  g.fillStyle = '#05080c'; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(63,224,204,.45)'; g.lineWidth = 3; g.strokeRect(2, 2, W - 4, H - 4);
  g.fillStyle = '#ffae34'; g.font = '900 40px "Big Shoulders Display", sans-serif'; g.textBaseline = 'middle';
  g.fillText('CONTRATOS', 20, 34);
  g.fillStyle = '#8a9aab';
  const eco = game.economy;
  const s = st();
  g.font = '500 18px "Barlow", sans-serif'; g.textAlign = 'right';
  g.fillText(`🎟️ ${eco.tokens} fichas`, W - 20, 34); g.textAlign = 'left';
  if (eco.level < UNLOCK_LEVEL) {
    g.font = '800 26px "Big Shoulders Display", sans-serif'; g.fillStyle = '#e9eef3';
    g.fillText(`🔒 Libera no nível ${UNLOCK_LEVEL}`, 40, 200);
    board.tex.needsUpdate = true;
    return;
  }
  const cards = [...s.active.map((o) => ({ o, on: true })), ...s.offers.map((o) => ({ o, on: false }))].slice(0, 6);
  cards.forEach(({ o, on }, i) => {
    const cx = 18 + (i % 3) * 205, cy = 66 + Math.floor(i / 3) * 184;
    g.save();
    // (cards retos: agora é uma tela, não papel preso na cortiça)
    g.fillStyle = on ? '#0e1a20' : '#0e151d'; g.fillRect(cx, cy, 190, 170);
    g.strokeStyle = on ? 'rgba(63,224,204,.6)' : '#233140'; g.lineWidth = 2; g.strokeRect(cx + 1, cy + 1, 188, 168);
    g.fillStyle = RARITY[o.raridade].cor; g.fillRect(cx, cy, 4, 170);
    g.fillStyle = '#e9eef3'; g.font = '600 17px "Barlow", sans-serif';
    g.font = '600 15px "Barlow", sans-serif';
    g.fillText(`${o.icone} ${o.cliente}`.slice(0, 23), cx + 8, cy + 30);
    g.font = '500 15px "Barlow", sans-serif';
    Object.entries(o.itens).forEach(([k, n], j) => g.fillText(`${on ? Math.min(n, o.progresso[k] || 0) + '/' : ''}${n}× ${ITEMS[k].nome}`.slice(0, 24), cx + 8, cy + 58 + j * 22));
    g.fillStyle = '#ffae34'; g.font = '600 17px "Barlow", sans-serif';
    g.fillText(`$ ${fmt(o.premio)} · ${o.fichas}🎟️`, cx + 8, cy + 132);
    g.fillStyle = on ? '#3fe0cc' : '#8a9aab'; g.font = '500 14px "Barlow", sans-serif';
    g.fillText(on ? `em andamento · ${Math.round(contractPercent(o) * 100)}%` : RARITY[o.raridade].nome.toLowerCase(), cx + 8, cy + 155);
    g.restore();
  });
  if (!cards.length) { g.font = '500 22px "Barlow", sans-serif'; g.fillStyle = '#8a9aab'; g.fillText('Nenhum pedido agora… já já chega um ☕', 40, 200); }
  board.tex.needsUpdate = true;
}

// ─── janela (E no quadro) ───
export function renderContracts(el) {
  const eco = game.economy;
  const s = st();
  if (eco.level < UNLOCK_LEVEL) {
    el.innerHTML = `<p class="muted">🔒 O Quadro de Contratos libera no <b>nível ${UNLOCK_LEVEL}</b>. Clientes vão pedir itens da sua fábrica em troca de dinheiro e 🎟️ fichas!</p>`;
    return;
  }
  const icon = (k) => `<img class="ic" src="${thumbs['item:' + k] || ''}" alt="">`;
  const card = (o, on) => {
    const left = on ? Math.max(0, o.ate - game.time) : o.prazo;
    const timeTxt = o.parceria ? '🤝 sem prazo' : null;
    const mm = Math.floor(left / 60), ss = Math.floor(left % 60);
    const rows = Object.entries(o.itens).map(([k, n]) => {
      const h = Math.min(n, o.progresso[k] || 0);
      return `<div class="ct-row">${icon(k)}<span>${ITEMS[k].nome}${canMake(k) ? '' : ' <em class="bad">ainda não sabe fazer</em>'}</span>${on ? `<i><b style="width:${(h / n) * 100}%"></b></i><em>${h}/${n}</em>` : `<em>${n}×</em>`}</div>`;
    }).join('');
    return `<div class="ct-card ${o.raridade} ${on ? 'on' : ''}">
      <div class="ct-head"><span class="ct-cli">${o.icone} ${o.cliente}</span><span class="ct-rar">${RARITY[o.raridade].nome}</span></div>
      ${rows}
      <div class="ct-foot"><span class="amber">$ ${fmt(o.premio)}</span><span>🎟️ ${o.fichas}</span>${o.disco ? '<span>💾 1</span>' : ''}<span class="muted">${timeTxt || `⏱ ${mm}:${String(ss).padStart(2, '0')}${on ? '' : ' de prazo'}`}</span></div>
      ${on ? `<div class="ct-bar"><i style="width:${contractPercent(o) * 100}%"></i></div><button class="mini" data-cancel="${o.id}">desistir</button>`
    : `<button class="primary" data-accept="${o.id}" ${usedSlots() >= s.slots ? 'disabled' : ''}>Aceitar</button>`}
    </div>`;
  };
  const docks = game.entities.filter((e) => e.type === 'doca_entrega').length;
  el.innerHTML = `
    <div class="ct-top"><div>🎟️ <b>${eco.tokens}</b> fichas · contratos cumpridos: <b>${eco.stats.contracts || 0}</b> · vagas: <b>${usedSlots()}/${s.slots}</b></div>
    <div class="muted">${docks ? `${docks} doca(s) de entrega` : '⚠️ Coloque uma <b>Doca de Entrega</b> (loja) e mande os itens por esteira até ela'}</div></div>
    <h3 class="rec-h">Em andamento</h3>
    <div class="ct-grid">${s.active.map((o) => card(o, true)).join('') || '<p class="muted">Nenhum. Aceite um pedido abaixo.</p>'}</div>
    <h3 class="rec-h">Pedidos no quadro <small class="muted">(chega um novo a cada ~2 min · ficam 8 min no quadro)</small></h3>
    <div class="ct-grid">${s.offers.map((o) => card(o, false)).join('') || '<p class="muted">Nenhum pedido agora… já já chega um ☕</p>'}</div>
    <p class="muted" style="margin-top:10px">Perder o prazo não tira nada: o pedido só some. Entregar na <b>primeira metade do prazo</b> dá <b>+25%</b> ⚡. No código: <code>contratos()</code> lista os aceitos e <code>maquina("doca_entrega1").faltando()</code> diz o que falta. Troque fichas na loja (aba 🎟️ Fichas).</p>`;
  el.querySelectorAll('[data-accept]').forEach((b) => { b.onclick = () => { const why = acceptContract(+b.dataset.accept); if (why) game.ui.toast(why, 'warn'); renderContracts(el); }; });
  el.querySelectorAll('[data-cancel]').forEach((b) => { b.onclick = () => { if (confirm('Desistir desse contrato? O que já foi entregue não volta.')) { cancelContract(+b.dataset.cancel); renderContracts(el); } }; });
}
void TECHS;
