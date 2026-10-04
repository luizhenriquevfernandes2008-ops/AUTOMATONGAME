// Orçamento de luzes: cada luz pontual pesa em TODOS os pixels da tela, e o three.js recompila
// os shaders sempre que o número de luzes muda (colocar uma luminária travava o jogo um instante).
// Aqui as luzes do jogo viram "virtuais" (invisíveis pro three.js) e só as N mais perto da câmera
// são desenhadas, copiadas pra um grupo fixo de luzes de verdade. O número nunca muda: sem travadas.
import * as THREE from 'three';
import { game } from './state.js';

const virtual = [];       // { l: PointLight invisível, t: quando registrou }
let real = [];            // PointLights de verdade (sempre visíveis, número fixo)
let budget = 8;
const tmp = new THREE.Vector3();

// chame logo depois de criar uma PointLight (antes ou depois de pôr na cena, tanto faz)
export function virtualLight(l) {
  l.visible = false;
  l.castShadow = false;
  virtual.push({ l, t: performance.now() });
  return l;
}

export function setLightBudget(n) {
  budget = n;
  if (!game.scene) return;
  for (const r of real) game.scene.remove(r);
  real = [];
  for (let i = 0; i < n; i++) {
    const r = new THREE.PointLight(0xffffff, 0, 1, 2);
    r.castShadow = false;
    game.scene.add(r);
    real.push(r);
  }
}

function inScene(o) {
  while (o.parent) o = o.parent;
  return o === game.scene;
}

let pruneT = 0;
export function updateLights(dt) {
  if (!game.scene) return;
  if (real.length !== budget) setLightBudget(budget);
  const cam = game.camera.position;
  pruneT -= dt;
  const prune = pruneT <= 0;
  if (prune) pruneT = 2;
  const cand = [];
  for (let i = virtual.length - 1; i >= 0; i--) {
    const v = virtual[i];
    if (!inScene(v.l)) {
      // saiu da cena há um tempo (máquina guardada, caixa aberta…): esquece
      if (prune && performance.now() - v.t > 5000) virtual.splice(i, 1);
      continue;
    }
    if (v.l.intensity <= 0.01) continue;
    v.l.getWorldPosition(tmp);
    const d = tmp.distanceTo(cam);
    const reach = v.l.distance || 20;
    if (d > reach + 45) continue; // longe demais pra iluminar o que aparece na tela
    cand.push({ l: v.l, d: d - reach * 0.5, x: tmp.x, y: tmp.y, z: tmp.z });
  }
  cand.sort((a, b) => a.d - b.d);
  for (let i = 0; i < real.length; i++) {
    const r = real[i], c = cand[i];
    if (!c) { r.intensity = 0; continue; }
    r.position.set(c.x, c.y, c.z);
    r.color.copy(c.l.color);
    r.intensity = c.l.intensity;
    r.distance = c.l.distance;
    r.decay = c.l.decay;
  }
}
export const lightStats = () => ({ virtuais: virtual.length, reais: real.length });
