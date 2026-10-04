// Salvar/carregar no navegador (localStorage).
import { serializeExplore, loadExplore } from './map3.js';
import { game } from './state.js';
import { createEntity, addEntity, cellCenter, grid, gridUp, key, footprint } from './machines.js';
import { serializeSky, loadSky } from './sky.js';
import { serializeWires, loadWires } from './power.js';
import { minerOres } from './world.js';
import { MACHINES, DECOR, CELL } from './data.js';
import { audio } from './audio.js';
import { serializeStructures, loadStructures } from './structures.js';
import { serializeFlora, loadFlora } from './flora.js';
import { serializeEvents, loadEvents } from './events.js';

// 3 fábricas (espaços de save). A 3.0 (planeta gerado por semente) usa chaves novas.
export const SLOTS = [1, 2, 3];
const slotKey = (n) => `automaton3_slot${n}`;
// saves das versões antigas não servem no mundo novo: apaga (decisão do jogo 3.0)
try {
  for (const k of ['automaton_save_v1', 'automaton_save_slot2', 'automaton_save_slot3', 'automaton_visit', 'fabriquinha_save_v1']) localStorage.removeItem(k);
} catch { /* sem localStorage */ }
// jogo novo pedido no menu (semente + área): vale pro próximo carregamento da página
const NEW_KEY = 'automaton3_new';
export function requestNewGame(p) { try { localStorage.setItem(NEW_KEY, JSON.stringify(p)); } catch { /* ignora */ } }
// multiplayer: o convidado recarrega pra gerar o planeta do anfitrião e entra de novo na sala
const JOIN_KEY = 'automaton3_join';
export function setPendingJoin(p) { try { sessionStorage.setItem(JOIN_KEY, JSON.stringify(p)); } catch { /* ignora */ } }
export function takePendingJoin() {
  try { const d = JSON.parse(sessionStorage.getItem(JOIN_KEY) || 'null'); sessionStorage.removeItem(JOIN_KEY); return d; } catch { return null; }
}
export function takeNewGame() {
  try { const d = JSON.parse(localStorage.getItem(NEW_KEY) || 'null'); localStorage.removeItem(NEW_KEY); return d; } catch { return null; }
}
export function currentSlot() {
  try { const n = +localStorage.getItem('automaton_slot'); return SLOTS.includes(n) ? n : 1; } catch { return 1; }
}
export function setSlot(n) { try { localStorage.setItem('automaton_slot', String(n)); } catch { /* ignora */ } }
// visitando a fábrica de um amigo (?visita=1): carrega de outra chave e nunca salva
export const VISITING = typeof location !== 'undefined' && new URLSearchParams(location.search).has('visita');
export const VISIT_KEY = 'automaton_visit';
const KEY = VISITING ? VISIT_KEY : slotKey(currentSlot());
// semente e área do save atual (pra montar o mundo antes de carregar o resto)
export function peekWorld() {
  try { const d = JSON.parse(localStorage.getItem(KEY) || 'null'); return d?.world || null; } catch { return null; }
}

export function saveInfo(slot = currentSlot()) {
  try {
    const d = JSON.parse(localStorage.getItem(slotKey(slot)) || 'null');
    if (!d) return null;
    const isBelt = (t) => t.startsWith('esteira');
    return {
      milestones: (d.economy?.milestones || []).length,
      tier: Math.max(0, ...(d.economy?.milestones || []).map((m) => (m[0] === 'm' ? 0 : +m[1]))),
      phase: d.economy?.phase || 0,
      time: d.time || 0,
      machines: (d.entities || []).filter((e) => !isBelt(e.type)).length,
      belts: (d.entities || []).filter((e) => isBelt(e.type)).length,
      objective: d.economy?.objective || 0,
      seed: d.world?.seed || '?',
      start: d.world?.start || 'floresta',
      name: d.name || '',
      saved: d.savedAt || 0,
    };
  } catch { return null; }
}

export function hasSave() {
  try { return !!localStorage.getItem(KEY); } catch { return false; }
}
export function renameSlot(slot, name) {
  try {
    const d = JSON.parse(localStorage.getItem(slotKey(slot)) || 'null');
    if (!d) return;
    d.name = name;
    localStorage.setItem(slotKey(slot), JSON.stringify(d));
  } catch { /* ignora */ }
}

// tudo que vai no save (também usado pra mandar a fábrica pra um amigo)
export function saveData() {
  const p = game.camera.position;
  return {
    v: 3,
    world: { ...game.worldInfo },
    time: game.time,
    economy: game.economy.serialize(),
    entities: game.entities.map((e) => e.serialize()),
    wires: serializeWires(),
    sky: serializeSky(),
    player: { x: p.x, z: p.z, yaw: game.camera.rotation.y, pitch: game.camera.rotation.x },
    stash: game.builder.codeStash,
    settings: { ...audio.settings, sens: game.player.controls.pointerSpeed, musicOn: audio.musicOn },
    structures: serializeStructures(),
    flora: serializeFlora(),
    explore: serializeExplore(),
    events: serializeEvents(),
    pet: game.pet?.serialize(),
    name: game.slotName || '',
    savedAt: Date.now(),
  };
}
export function saveGame() {
  if (VISITING || game.mp?.isGuest) return false; // visita e convidado no multiplayer nunca salvam
  try {
    const data = saveData();
    localStorage.setItem(KEY, JSON.stringify(data));
    game.lastSave = Date.now();
    return true;
  } catch (e) {
    console.warn('save falhou', e);
    return false;
  }
}

export function loadSettings() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || 'null');
    return d?.settings || null;
  } catch { return null; }
}

export function loadGame() {
  let d;
  try { d = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { d = null; }
  if (!d) return false;
  game.time = d.time || 0;
  game.slotName = d.name || '';
  game.visitDe = VISITING ? String(d.visitDe || '').replace(/[<>&"']/g, '').slice(0, 24) : '';
  game.economy.load(d.economy);
  loadEvents(d.events); // antes das máquinas: o minerador precisa achar o veio de meteorito
  loadFlora(d.flora);
  loadExplore(d.explore);
  loadStructures(d.structures);
  game.pet?.load(d.pet);
  // prédios grandes primeiro: saves antigos tinham minerador/construtora/montadora 1×1. Se agora (3×3) eles
  // cobrem outra peça, ela volta pro inventário em vez de ficar escondida embaixo
  const big = (ed) => (MACHINES[ed.type]?.tamanho || 1) > 1;
  const list = (d.entities || []).filter((ed) => MACHINES[ed.type] || DECOR[ed.type]);
  let moved = 0;
  for (const ed of [...list.filter(big), ...list.filter((ed) => !big(ed))]) {
    try {
      const e = createEntity(ed.type, ed.x, ed.z, ed.dir || 0);
      const cells = (MACHINES[ed.type]?.tamanho || 1) > 1 ? footprint(ed.type, ed.x, ed.z) : [[ed.x, ed.z]];
      const g = e.layer === 1 ? gridUp : grid;
      if (cells.some(([x, z]) => g.has(key(x, z))) || (e.alsoUp && gridUp.has(key(ed.x, ed.z)))) { e.onRemove?.(); game.economy.refundBuild(ed.type); moved++; continue; }
      e.load(ed);
      addEntity(e);
      if (ed.type === 'minerador') minerOres(ed.x, ed.z, false);
    } catch (err) { console.warn('entidade não carregou', ed, err); }
  }
  if (moved) setTimeout(() => game.ui?.toast(`📦 ${moved} peça(s) ficaram embaixo dos prédios maiores e voltaram pro inventário`, 'warn'), 4000);
  loadWires(d.wires, grid, key, gridUp);
  loadSky(d.sky);
  game.builder.codeStash = d.stash || [];
  if (d.player) {
    game.player.teleport({ x: d.player.x, z: d.player.z }, d.player.yaw || 0);
    game.camera.rotation.set(d.player.pitch || 0, d.player.yaw || 0, 0, 'YXZ');
  }
  return true;
}

export function deleteSave(slot = currentSlot()) {
  try { localStorage.removeItem(slotKey(slot)); } catch { /* ignore */ }
}
