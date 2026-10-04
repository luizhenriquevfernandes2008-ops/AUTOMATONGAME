// 💾 Discos de dados: achados em caixas perdidas na floresta, na chuva de meteoros, no correio da manhã
// e em contratos lendários. Analisados no Laboratório, liberam receitas alternativas (escolha 1 de 2).
import * as THREE from 'three';
import { game } from './state.js';
import { ITEMS, RECIPES, SMELT, recipeOut } from './data.js';
import { cloneModel } from './assets.js';
import { audio } from './audio.js';
import { puff } from './fx.js';
import { colliders, interactables } from './world.js';
import { thumbs } from './thumbs.js';
import { virtualLight } from './lights.js';

// caixas perdidas espalhadas pela floresta (posição em metros). Cada uma tem 1 disco (e um trocado)
export const CRATES = [
  { id: 'c1', x: -44, z: -8, dica: 'perto do acampamento, a oeste' },
  { id: 'c2', x: 46, z: 18, dica: 'no Vale Leste, perto da beira' },
  { id: 'c3', x: 12, z: -46, dica: 'lá no fundo do Cânion Norte' },
  { id: 'c4', x: -30, z: 44, dica: 'na Planície do Sul, do lado oeste' },
  { id: 'c5', x: 52, z: -44, dica: 'no cantinho nordeste do mapa' },
  { id: 'c6', x: -54, z: -50, dica: 'no cantinho noroeste, bem escondida' },
  { id: 'c7', x: 34, z: 52, dica: 'no sudeste, depois das árvores' },
  { id: 'c8', x: -6, z: 58, dica: 'bem ao sul, passando o escritório' },
];
const crateObjs = new Map();

export function buildCrates() {
  for (const c of CRATES) {
    if (game.economy.crates.includes(c.id)) continue;
    const g = new THREE.Group();
    g.position.set(c.x, 0, c.z);
    g.rotation.y = (c.x * 13 + c.z * 7) % 6;
    const box = cloneModel('crateLost');
    g.add(box);
    const glow = virtualLight(new THREE.PointLight(0x6cf5ff, 2.2, 4, 1.6));
    glow.position.y = 0.9;
    g.add(glow);
    game.scene.add(g);
    const col = { x: c.x, z: c.z, r: 0.5 };
    colliders.push(col);
    // tira árvores que estejam em cima da caixa
    const inter = { obj: g, label: '📦 Caixa perdida: abrir', action: 'crate:' + c.id };
    interactables.push(inter);
    crateObjs.set(c.id, { g, col, inter });
  }
}
export function openCrate(id) {
  const eco = game.economy;
  const o = crateObjs.get(id);
  if (!o || eco.crates.includes(id)) return;
  eco.crates.push(id);
  game.scene.remove(o.g);
  const i = interactables.indexOf(o.inter); if (i >= 0) interactables.splice(i, 1);
  const ci = colliders.indexOf(o.col); if (ci >= 0) colliders.splice(ci, 1);
  crateObjs.delete(id);
  const cash = 150 + eco.level * 60;
  eco.addMoney(cash);
  gainDisk('caixa');
  audio.play('achievement', { volume: 0.6 });
  puff(new THREE.Vector3(o.g.position.x, 0.8, o.g.position.z), { color: 0x6cf5ff, count: 20, size: 0.2, up: 2, gravity: 3, additive: true, spread: 0.8, life: 1.2 });
  game.ui?.toast(`📦 Caixa perdida! <b>+1 💾 disco de dados</b> e +$ ${cash}. Analise no Laboratório. (${eco.crates.length}/${CRATES.length} caixas)`, 'ach');
}
export function crateHint() {
  const left = CRATES.filter((c) => !game.economy.crates.includes(c.id));
  return left.length ? left[Math.floor(Math.random() * left.length)].dica : null;
}

export function gainDisk(from) {
  const eco = game.economy;
  eco.disks++;
  eco.stats.disksFound = (eco.stats.disksFound || 0) + 1;
  game.emit('disk', from);
}

const ALT = () => [...Object.keys(RECIPES).filter((k) => RECIPES[k].alt), ...Object.keys(SMELT).filter((k) => SMELT[k].alt)];
const recOf = (k) => RECIPES[k] || SMELT[k];
const outOf = (k) => (RECIPES[k] ? recipeOut(k, RECIPES[k]) : SMELT[k].out);
const where = (k) => (RECIPES[k] ? `montadora · <code>fabricar("${k}")</code>` : `fornalha · <code>fundir("${k}")</code>`);
const ic = (k) => `<img class="ic" src="${thumbs['item:' + k] || ''}" alt="">`;
function recipeCard(k, btn) {
  const r = recOf(k);
  return `<div class="dk-card">
    <div class="rs-top">${ic(outOf(k))}<b>${ITEMS[outOf(k)].nome}${(r.qtd || 1) > 1 ? ` ×${r.qtd}` : ''}</b></div>
    <div class="rs-desc">${Object.entries(r.in).map(([i, n]) => `${n}× ${ITEMS[i].nome}`).join(' + ')} · ${r.tempo}s</div>
    <div class="rs-desc">${where(k)}${r.tech ? ' · precisa da pesquisa' : ''} · nível ${r.nivel}</div>
    ${btn || ''}
  </div>`;
}

// analisa um disco: sorteia 2 receitas ainda não conhecidas (fica guardado até escolher)
export function analyzeDisk() {
  if (game.mp?.isGuest) return 'No multiplayer, só o anfitrião analisa discos';
  const eco = game.economy;
  if (eco.diskChoice?.length) return null;
  if (eco.disks <= 0) return 'Você não tem discos. Procure caixas perdidas na floresta 📦';
  const left = ALT().filter((k) => !eco.hasAlt(k));
  eco.disks--;
  if (!left.length) { eco.addTokens(3); return 'Você já conhece todas as receitas! O disco virou 3 🎟️ fichas.'; }
  const pick = [];
  while (pick.length < Math.min(2, left.length)) { const k = left[Math.floor(Math.random() * left.length)]; if (!pick.includes(k)) pick.push(k); }
  eco.diskChoice = pick;
  audio.play('computer', { volume: 0.6 });
  return null;
}
export function chooseAlt(k) {
  const eco = game.economy;
  if (!eco.diskChoice?.includes(k)) return;
  eco.altRecipes.push(k);
  eco.diskChoice = null;
  audio.play('levelup', { volume: 0.7 });
  game.ui?.banner('💾 Receita alternativa!', ITEMS[outOf(k)].nome, [Object.entries(recOf(k).in).map(([i, n]) => `${n}× ${ITEMS[i].nome}`).join(' + ') + ` → ${recOf(k).qtd || 1}×`, RECIPES[k] ? `Na montadora: fabricar("${k}")` : `Na fornalha: fundir("${k}")`]);
  game.emit('altRecipe', k);
}

export function renderDisks(el, rerender) {
  if (!el) return;
  const eco = game.economy;
  const known = ALT().filter((k) => eco.hasAlt(k));
  const choice = eco.diskChoice || [];
  el.innerHTML = `<h3 class="rec-h">💾 Discos de dados <small class="muted">você tem ${eco.disks} · ${known.length}/${ALT().length} receitas alternativas · caixas achadas ${eco.crates.length}/${CRATES.length}</small></h3>
    ${choice.length ? `<p class="amber" style="margin:4px 0">Escolha UMA receita pra liberar:</p><div class="dk-grid">${choice.map((k) => recipeCard(k, `<button class="primary" data-alt="${k}">Liberar esta</button>`)).join('')}</div>`
    : `<div class="row"><button id="dk-analyze" class="primary" ${eco.disks > 0 ? '' : 'disabled'}>🔍 Analisar um disco</button><span class="muted">Discos vêm de caixas perdidas na floresta, meteoros, correio da manhã e contratos lendários.</span></div>`}
    ${known.length ? `<div class="dk-grid" style="margin-top:8px">${known.map((k) => recipeCard(k)).join('')}</div>` : ''}`;
  const a = el.querySelector('#dk-analyze');
  if (a) a.onclick = () => { const msg = analyzeDisk(); if (msg) game.ui.toast(msg, 'warn'); rerender(); };
  el.querySelectorAll('[data-alt]').forEach((b) => { b.onclick = () => { chooseAlt(b.dataset.alt); rerender(); }; });
}
