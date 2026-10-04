// Pouso em KX-7: a cápsula desce do céu soltando fogo, bate no chão levantando poeira
// e a câmera entra em primeira pessoa do lado dela. Depois, a carta de boas-vindas.
import * as THREE from 'three';
import { game } from './state.js';
import { audio } from './audio.js';
import { puff } from './fx.js';
import { BIOMES, world } from './terrain.js';
import { START_KIT, ITEMS } from './data.js';

let L = null;
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
const smooth = (t) => t * t * (3 - 2 * t);

export function startLanding() {
  const pod = game.pod;
  if (!pod) return;
  const target = pod.position.clone();
  L = { t: 0, pod, target, y0: target.y + 160, landed: false, yaw: pod.rotation.y };
  pod.position.y = L.y0;
  game.landingActive = true;
  game.debugCam = true;
  document.body.classList.add('cinema');
  audio.play('launch', { volume: 0.7, rate: 0.8 });
}

export function updateLanding(dt) {
  if (!L) return;
  L.t += dt;
  const cam = game.camera, pod = L.pod, tg = L.target;
  const DESC = 4.2;
  const k = Math.min(1, L.t / DESC);
  // desce rápido e freia no fim
  const ease = 1 - Math.pow(1 - k, 2.6);
  pod.position.y = L.y0 + (tg.y - L.y0) * ease;
  pod.rotation.y = L.yaw + (1 - ease) * 2.5;
  if (k < 1 && Math.random() < dt * 60) {
    puff(new THREE.Vector3(pod.position.x + (Math.random() - 0.5) * 0.6, pod.position.y - 0.4, pod.position.z + (Math.random() - 0.5) * 0.6), { color: k > 0.8 ? 0xffd28a : 0xff7a2a, count: 2, size: 0.9, up: 4 + 6 * (1 - k), spread: 0.4, life: 0.8, additive: true, grow: 2.5 });
    if (k > 0.7) puff(new THREE.Vector3(tg.x, tg.y + 0.2, tg.z), { color: 0xcab89a, count: 2, size: 1.2, up: 0.5, spread: 5 * (k - 0.6), life: 2, opacity: 0.5, grow: 3 });
  }
  if (k >= 1 && !L.landed) {
    L.landed = true;
    audio.play('place', { volume: 1, rate: 0.5 });
    audio.play('drop', { volume: 0.8, rate: 0.6 });
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      puff(new THREE.Vector3(tg.x + Math.cos(a) * 1.5, tg.y + 0.3, tg.z + Math.sin(a) * 1.5), { color: 0xcab89a, count: 1, size: 1.4, up: 0.8, spread: 1, life: 2.6, opacity: 0.6, grow: 3.5 });
    }
    document.body.classList.add('shake');
    setTimeout(() => document.body.classList.remove('shake'), 600);
    L.camFrom = cam.position.clone();
    L.qFrom = cam.quaternion.clone();
  }
  if (!L.landed) {
    // acompanha a cápsula de perto, e no fim fica no chão olhando ela bater
    const a = 0.9 + L.t * 0.18;
    const follow = new THREE.Vector3(pod.position.x + Math.cos(a) * 9, pod.position.y + 3.5, pod.position.z + Math.sin(a) * 9);
    const ground = new THREE.Vector3(tg.x + Math.cos(a) * 12, tg.y + 3.2, tg.z + Math.sin(a) * 12);
    const m = smooth(Math.min(1, Math.max(0, (k - 0.55) / 0.35)));
    cam.position.lerpVectors(follow, ground, m);
    cam.lookAt(pod.position.x, pod.position.y - 1.5 * (1 - m), pod.position.z);
    return;
  }
  // entra na primeira pessoa do lado da cápsula
  const m = smooth(Math.min(1, (L.t - DESC - 0.6) / 1.4));
  if (L.t < DESC + 0.6) return;
  const s = game.spawn;
  const eye = new THREE.Vector3(s.x, game.player.y + 1.62, s.z);
  cam.position.lerpVectors(L.camFrom, eye, m);
  _e.set(-0.05, game.spawnYaw || 0, 0, 'YXZ');
  _q2.setFromEuler(_e);
  _q1.copy(L.qFrom).slerp(_q2, m);
  cam.quaternion.copy(_q1);
  if (m >= 1) finish();
}

function finish() {
  L = null;
  game.landingActive = false;
  game.debugCam = false;
  document.body.classList.remove('cinema');
  game.player.teleport(game.spawn, game.spawnYaw || 0);
  game.camera.rotation.set(-0.05, game.spawnYaw || 0, 0, 'YXZ');
  const B = BIOMES[world.start];
  const kit = Object.entries(START_KIT).map(([k, n]) => `${n}× ${ITEMS[k].nome}`).join(', ');
  game.ui.confirm(`${B.icone} Bem-vindo(a) a KX-7`, `<p>Você pousou na <b>${B.nome}</b> · planeta <code>${world.seedText}</code>.</p>
    <p>A cápsula trouxe um kit: <span class="muted">${kit}</span>.</p>
    <p>Primeiro passo: monte a <b>🏠 Central</b> num lugar plano aqui perto (tecla <kbd>1</kbd> e clique). Depois pague o primeiro <b>Marco</b> nela.</p>
    <p class="muted">Segure <kbd>E</kbd> em veios e plantas pra coletar · <kbd>B</kbd> menu de construção · <kbd>Tab</kbd> mapa · <kbd>H</kbd> guia</p>`,
  null, { yes: 'Bora! 🚀', noButton: false });
}
export const landingActive = () => !!L;
