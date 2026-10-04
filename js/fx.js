// Partículas e textos flutuantes simples.
import * as THREE from 'three';
import { game } from './state.js';

let softTex = null;
function getSoftTex() {
  if (softTex) return softTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.4, 'rgba(255,255,255,0.6)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  softTex = new THREE.CanvasTexture(c);
  softTex.colorSpace = THREE.SRGBColorSpace;
  return softTex;
}

const particles = [];
const pool = [];

export function puff(pos, opts = {}) {
  const n = opts.count ?? 6;
  for (let i = 0; i < n; i++) {
    let s = pool.pop();
    if (!s) {
      s = new THREE.Sprite(new THREE.SpriteMaterial({ map: getSoftTex(), transparent: true, depthWrite: false }));
    }
    s.material.color.set(opts.color ?? 0xffffff);
    s.material.opacity = opts.opacity ?? 0.7;
    s.material.blending = opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    s.position.set(pos.x + (Math.random() - 0.5) * (opts.spread ?? 0.4), pos.y, pos.z + (Math.random() - 0.5) * (opts.spread ?? 0.4));
    const size = (opts.size ?? 0.3) * (0.7 + Math.random() * 0.6);
    s.scale.setScalar(size);
    s.visible = true;
    game.scene.add(s);
    particles.push({
      s, life: 0, max: (opts.life ?? 1.2) * (0.7 + Math.random() * 0.6), size, grow: opts.grow ?? 1.5,
      v: new THREE.Vector3((Math.random() - 0.5) * (opts.speed ?? 0.4), (opts.up ?? 0.8) * (0.6 + Math.random() * 0.8), (Math.random() - 0.5) * (opts.speed ?? 0.4)),
      g: opts.gravity ?? 0, o0: s.material.opacity,
    });
  }
}

// texto que sobe e some (ex: "+$12")
const floaters = [];
export function floatText(pos, text, color = '#ffd35a') {
  // a largura acompanha o texto (antes cortava "Minério de Fe...")
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  const font = '800 40px "Big Shoulders Display", sans-serif';
  g.font = font;
  const w = Math.min(2048, Math.max(256, Math.ceil(g.measureText(text).width + 32)));
  c.width = w; c.height = 64;
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 8;
  g.strokeStyle = 'rgba(30,20,50,0.85)';
  g.strokeText(text, w / 2, 34);
  g.fillStyle = color;
  g.fillText(text, w / 2, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false }));
  s.renderOrder = 999;
  s.scale.set(1.6 * (w / 256), 0.4, 1);
  s.position.copy(pos);
  game.scene.add(s);
  floaters.push({ s, life: 0 });
}

export function updateFx(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life += dt;
    const k = p.life / p.max;
    if (k >= 1) {
      p.s.visible = false;
      game.scene.remove(p.s);
      pool.push(p.s);
      particles.splice(i, 1);
      continue;
    }
    p.v.y -= p.g * dt;
    p.s.position.addScaledVector(p.v, dt);
    p.s.scale.setScalar(p.size * (1 + k * p.grow));
    p.s.material.opacity = p.o0 * (1 - k);
  }
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i];
    f.life += dt;
    f.s.position.y += dt * 0.7;
    f.s.material.opacity = Math.min(1, 2.5 - f.life * 1.4);
    if (f.life > 1.8) {
      game.scene.remove(f.s);
      f.s.material.map.dispose();
      f.s.material.dispose();
      floaters.splice(i, 1);
    }
  }
}

// placa com nome em cima das máquinas
export function makeLabel(text) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
  s.scale.set(1.3, 0.325, 1);
  s.userData.canvas = c;
  setLabel(s, text);
  return s;
}
export function setLabel(sprite, text) {
  const c = sprite.userData.canvas;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 256, 64);
  g.font = '800 30px "Big Shoulders Display", sans-serif';
  const w = Math.min(248, g.measureText(text).width + 30);
  g.fillStyle = 'rgba(10,14,20,0.82)';
  const x = 128 - w / 2;
  g.beginPath();
  g.roundRect(x, 10, w, 44, 22);
  g.fill();
  g.fillStyle = '#fff4e0';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 33);
  sprite.material.map.needsUpdate = true;
}

// confete na tela (marcos importantes): canvas por cima de tudo, some sozinho
let confCanvas = null, confBits = [], confRaf = 0;
export function confetti(n = 120) {
  if (typeof document === 'undefined' || confBits.length > 500) return;
  if (!confCanvas) {
    confCanvas = document.createElement('canvas');
    confCanvas.id = 'confetti';
    document.body.appendChild(confCanvas);
  }
  confCanvas.width = innerWidth; confCanvas.height = innerHeight;
  const cols = ['#ffcf5c', '#ff6ec7', '#3ee6b8', '#7fb2ff', '#ff9a4a', '#b18cff'];
  for (let i = 0; i < n; i++) {
    confBits.push({
      x: innerWidth * (0.2 + Math.random() * 0.6), y: innerHeight * 0.35 + (Math.random() - 0.5) * 80,
      vx: (Math.random() - 0.5) * 900, vy: -300 - Math.random() * 700, r: Math.random() * 6, vr: (Math.random() - 0.5) * 14,
      w: 6 + Math.random() * 8, h: 4 + Math.random() * 6, c: cols[i % cols.length], life: 2.6 + Math.random(),
    });
  }
  if (!confRaf) { let last = performance.now(); const step = (now) => { const dt = Math.min(0.05, (now - last) / 1000); last = now; drawConfetti(dt); confRaf = confBits.length ? requestAnimationFrame(step) : 0; }; confRaf = requestAnimationFrame(step); }
}
function drawConfetti(dt) {
  const g = confCanvas.getContext('2d');
  g.clearRect(0, 0, confCanvas.width, confCanvas.height);
  for (let i = confBits.length - 1; i >= 0; i--) {
    const b = confBits[i];
    b.life -= dt;
    b.vy += 1100 * dt; b.vx *= 1 - dt * 1.5;
    b.x += b.vx * dt; b.y += b.vy * dt; b.r += b.vr * dt;
    if (b.life <= 0 || b.y > confCanvas.height + 20) { confBits.splice(i, 1); continue; }
    g.save(); g.globalAlpha = Math.min(1, b.life); g.translate(b.x, b.y); g.rotate(b.r); g.scale(1, Math.abs(Math.cos(b.r * 1.7)) + 0.2);
    g.fillStyle = b.c; g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h); g.restore();
  }
}
