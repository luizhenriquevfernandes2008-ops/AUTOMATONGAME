// A Central (HUB) 3×3 e a Bancada: onde você paga os Marcos e fabrica peças na mão.
import * as THREE from 'three';
import { game } from './state.js';
import { HAND, recipeOut, ITEMS } from './data.js';
import { ENTITY_CLASSES, Machine } from './machines.js';
import { puff, floatText } from './fx.js';
import { audio } from './audio.js';
import { virtualLight } from './lights.js';

export class Hub extends Machine {
  constructor(...a) {
    super(...a);
    this.solid = true;
    this.label.position.y = 6.2;
    this.label.scale.multiplyScalar(1.4);
    const l = virtualLight(new THREE.PointLight(0x5ff5e0, 6, 12, 1.4));
    l.position.set(0, 2.6, -2.2); // na frente da porta
    this.obj.add(l);
    this.glow = l;
    this.status = 'Pronta';
  }
  labelText() { return '🏠 Central'; }
  get inputSides() { return []; }
  canAccept() { return false; }
  update(dt) { this.anim += dt; this.animateParts(dt, true); this.glow.intensity = 5 + Math.sin(this.anim * 1.5) * 1.5; this.lamp.material.color.setHex(0x5ff5e0); this.lamp.material.emissive.setHex(0x3fe0cc); this.lamp.material.emissiveIntensity = 1; }
  infoLines() { return ['Marcos, Bancada e inventário: aperte E']; }
}

export class Workbench extends Machine {
  get inputSides() { return []; }
  canAccept() { return false; }
  update(dt) { this.anim += dt; this.status = 'Pronta pra fabricar'; this.lamp.material.color.setHex(0xffae34); this.animateParts(dt, craft.active); }
  infoLines() { return ['Fabrique peças na mão: aperte E']; }
}
Object.assign(ENTITY_CLASSES, { central: Hub, bancada: Workbench });

// ─── fabricar na mão (Bancada) ───
// segura o botão: a cada `mao` segundos sai um lote da receita
export const craft = { recipe: null, t: 0, active: false };
export function handRecipes() {
  const eco = game.economy;
  return Object.entries(HAND).filter(([k, r]) => eco.recipeUnlocked(k, r) && (eco.done('m0_1') || ['biomassa', 'biomassa_madeira', 'biomassa_fibra', 'biomassa_esporos'].includes(k)));
}
export function canCraft(k) {
  const r = HAND[k];
  return !!r && game.economy.has(r.in) && game.economy.room(recipeOut(k, r)) >= r.qtd;
}
export function craftStep(dt) {
  if (!craft.active || !craft.recipe) return 0;
  const r = HAND[craft.recipe];
  if (!r || !canCraft(craft.recipe)) { craft.t = 0; return 0; }
  craft.t += dt / (r.mao / (game.economy.collectorSpeed > 1 ? 1.25 : 1));
  if (craft.t >= 1) {
    craft.t = 0;
    craftOnce(craft.recipe);
  }
  return craft.t;
}
export function craftOnce(k) {
  const r = HAND[k];
  if (!r || !canCraft(k)) return false;
  if (game.mp?.guestRpc?.('craft', { k })) return true;
  const eco = game.economy;
  eco.pay(r.in);
  const out = recipeOut(k, r);
  eco.give(out, r.qtd);
  eco.produced(out, r.qtd);
  eco.stats.handCrafted = (eco.stats.handCrafted || 0) + 1;
  audio.play('assemble', { volume: 0.35, rate: 1.1 + Math.random() * 0.2 });
  game.emit('crafted', { k, out, n: r.qtd });
  return true;
}
void puff; void floatText; void ITEMS;
