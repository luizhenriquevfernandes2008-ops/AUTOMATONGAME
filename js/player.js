// Primeira pessoa: corrida com embalo, deslize, salto, colisões e cafezinho.
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { game } from './state.js';
import { grid, key, worldToCell } from './machines.js';
import { colliders } from './world.js';
import { floraBlocked } from './flora.js';
import { heightAt, slopeAt, WATER, LIMIT, biomeAt } from './terrain.js';
import { CELL } from './data.js';
import { audio } from './audio.js';
import { held, keyOf } from './input.js';
import { structBlocked, floorMaterialAt } from './structures.js';

const EYE = 1.62, RADIUS = 0.32, STEP = 0.4, SWIM = 1.25;

// chão sob os pés: terreno, fundações e pisos (o mais alto que dá pra pisar sem escalar)
export function groundAt(x, z, feet = Infinity) {
  let g = heightAt(x, z);
  const c = worldToCell(x, z);
  const f = game.floorAt ? game.floorAt(c.x, c.z) : null;
  if (f != null && f <= feet + STEP + 0.05) g = Math.max(g, f);
  return g;
}

export class Player {
  constructor(camera, dom) {
    this.camera = camera;
    this.controls = new PointerLockControls(camera, dom);
    this.controls.pointerSpeed = 0.8;
    this.vel = new THREE.Vector3();
    this.keys = {};
    this.onGround = true;
    this.y = 0;
    this.stepTimer = 0;
    this.coffee = 0;
    this.momentum = 0;
    this.speed = 0;
    this.sliding = false;
    this.slideTime = 0;
    this.slideCooldown = 0;
    this.slideHeld = false;
    this.eyeHeight = EYE;
    this.bob = 0;
    // controle (gamepad): eixos e botões preenchidos pelo gamepad.js
    this.pad = { x: 0, y: 0, sprint: false, jump: false, slide: false };
    addEventListener('keydown', (e) => {
      if (game.mode !== 'play') return;
      this.keys[e.code] = true;
      const mv = ['frente', 'tras', 'esquerda', 'direita', 'pular', 'deslizar'].map(keyOf);
      if (mv.includes(e.code) || ['ControlRight', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    addEventListener('blur', () => this.stop());
  }

  get position() { return this.camera.position; }

  teleport(v, lookYaw = 0) {
    this.y = groundAt(v.x, v.z);
    if (this.y < WATER - SWIM) this.y = WATER - SWIM;
    this.camera.position.set(v.x, this.y + EYE, v.z);
    this.camera.rotation.set(0, lookYaw, 0, 'YXZ');
    this.stop();
    this.vel.y = 0;
    this.onGround = true;
    this.eyeHeight = EYE;
  }

  stop() {
    this.keys = {};
    if (this.pad) Object.assign(this.pad, { x: 0, y: 0, jump: false, slide: false });
    this.vel.x = this.vel.z = 0;
    this.speed = this.momentum = 0;
    this.sliding = this.slideHeld = false;
    this.slideTime = 0;
  }

  // cafezinho da cafeteira do escritório: +30% de velocidade por 90 s
  drinkCoffee() {
    this.coffee = 90;
    game.economy.stats.coffees = (game.economy.stats.coffees || 0) + 1;
    audio.play('coffee');
  }

  updateCoffee(dt) {
    this.coffee = Math.max(0, this.coffee - dt);
  }

  blockedAt(x, z) {
    const c = worldToCell(x, z);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const e = grid.get(key(c.x + dx, c.z + dz));
      if (!e || !e.solid) continue;
      const cx = (c.x + dx) * CELL, cz = (c.z + dz) * CELL;
      const m = e.static ? 0 : CELL * 0.1;
      const nx = Math.max(cx + m, Math.min(x, cx + CELL - m));
      const nz = Math.max(cz + m, Math.min(z, cz + CELL - m));
      if ((x - nx) ** 2 + (z - nz) ** 2 < RADIUS * RADIUS) return true;
    }
    for (const c2 of colliders) {
      const r = c2.r + RADIUS;
      if (Math.abs(x - c2.x) < r && Math.abs(z - c2.z) < r && (x - c2.x) ** 2 + (z - c2.z) ** 2 < r * r) return true;
    }
    if (structBlocked(x, z, RADIUS)) return true;
    if (floraBlocked(x, z, RADIUS * 0.8)) return true;
    if (Math.abs(x) > LIMIT || Math.abs(z) > LIMIT) return true;
    // paredão: subir mais que um degrau de uma vez (no chão) não dá; pulando dá pra subir um pouco mais
    const g = groundAt(x, z, this.y);
    return g > this.y + (this.swimming ? 1.5 : this.onGround ? STEP : 0.15);
  }

  update(dt, active) {
    if (!active) {
      this.stop();
      return;
    }
    const k = this.keys, pad = this.pad;
    const f = THREE.MathUtils.clamp((held(k, 'frente') || k.ArrowUp ? 1 : 0) - (held(k, 'tras') || k.ArrowDown ? 1 : 0) - pad.y, -1, 1);
    const s = THREE.MathUtils.clamp((held(k, 'direita') || k.ArrowRight ? 1 : 0) - (held(k, 'esquerda') || k.ArrowLeft ? 1 : 0) + pad.x, -1, 1);
    const sprint = held(k, 'correr') || pad.sprint;
    const jumpKey = held(k, 'pular') || pad.jump;
    this.updateCoffee(dt);
    const boost = this.coffee > 0 ? 1.3 : 1;
    const fwd = new THREE.Vector3();
    this.camera.getWorldDirection(fwd);
    fwd.y = 0; fwd.normalize();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const wish = fwd.multiplyScalar(f).add(right.multiplyScalar(s));
    const moving = wish.lengthSq() > 0.01;
    const analog = Math.min(1, wish.length()); // alavanca do controle meio inclinada = mais devagar
    wish.normalize();
    const hsBefore = Math.hypot(this.vel.x, this.vel.z);
    const aligned = hsBefore < 0.5 || (wish.x * this.vel.x + wish.z * this.vel.z) / hsBefore > 0.35;
    // Só ganha embalo correndo de verdade; parar, inverter ou bater desfaz o ganho.
    const gaining = moving && sprint && aligned && hsBefore > 3 && this.onGround && !this.sliding;
    this.momentum = THREE.MathUtils.clamp(this.momentum + dt * (gaining ? 0.24 : this.sliding || !this.onGround ? 0 : -0.8), 0, 1);
    this.slideCooldown = Math.max(0, this.slideCooldown - dt);
    const slideKey = !!(held(k, 'deslizar') || pad.slide);
    if (slideKey && !this.slideHeld && !k.KeyZ && this.onGround && hsBefore >= 5.5 && this.slideCooldown === 0) {
      this.sliding = true;
      this.slideTime = 1.1;
      this.slideCooldown = 1.5;
      const launch = Math.min(hsBefore + 2.4 * boost, 14 * boost);
      this.vel.x *= launch / hsBefore;
      this.vel.z *= launch / hsBefore;
    }
    this.slideHeld = slideKey;
    if (this.sliding) {
      this.slideTime -= dt;
      if (!slideKey || this.slideTime <= 0 || hsBefore < 2.5) this.sliding = false;
    }
    if (this.sliding) {
      // Atrito baixo e direção limitada: olhar para o lado não apaga o impulso.
      const turn = moving ? 1 - Math.exp(-1.2 * dt) : 0;
      const speed = Math.hypot(this.vel.x, this.vel.z);
      this.vel.x += (wish.x * speed - this.vel.x) * turn;
      this.vel.z += (wish.z * speed - this.vel.z) * turn;
      const friction = Math.exp(-0.38 * dt);
      this.vel.x *= friction; this.vel.z *= friction;
    } else if (this.onGround) {
      const terr = this.swimming ? 0.55 : 1 - THREE.MathUtils.clamp((slopeAt(this.camera.position.x, this.camera.position.z) - 0.6) * 0.7, 0, 0.55);
      const speed = (sprint ? 7.2 + 3.6 * this.momentum : 4.3) * boost * terr * (moving ? Math.max(0.35, analog) : 1);
      const blend = 1 - Math.exp(-12 * dt);
      this.vel.x += (wish.x * speed - this.vel.x) * blend;
      this.vel.z += (wish.z * speed - this.vel.z) * blend;
    } else if (moving) {
      // No ar, só muda a direção. Saltar após deslizar conserva a velocidade.
      const speed = Math.max(hsBefore, (sprint ? 7.2 : 4.3) * boost);
      const blend = 1 - Math.exp(-2 * dt);
      this.vel.x += (wish.x * speed - this.vel.x) * blend;
      this.vel.z += (wish.z * speed - this.vel.z) * blend;
    }

    if (jumpKey && this.onGround && !this.swimming) { this.vel.y = 5.2; this.onGround = false; this.sliding = false; audio.play('jump', { volume: 0.25 }); }
    this.vel.y -= 16 * dt;

    const p = this.camera.position;
    // Subpassos menores que o raio evitam atravessar colisores em alta velocidade.
    const steps = Math.max(1, Math.ceil(Math.hypot(this.vel.x, this.vel.z) * dt / (RADIUS * 0.5)));
    let hit = false;
    for (let i = 0; i < steps; i++) {
      const nx = p.x + this.vel.x * dt / steps;
      if (!this.blockedAt(nx, p.z)) p.x = nx; else { this.vel.x = 0; hit = true; }
      const nz = p.z + this.vel.z * dt / steps;
      if (!this.blockedAt(p.x, nz)) p.z = nz; else { this.vel.z = 0; hit = true; }
    }
    if (hit) { this.momentum = 0; this.sliding = false; }

    this.y += this.vel.y * dt;
    let ground = groundAt(p.x, p.z, this.y);
    // água funda: nada (fica boiando com a cabeça de fora)
    this.swimming = ground < WATER - SWIM;
    if (this.swimming) ground = WATER - SWIM;
    // descendo encosta: continua grudado no chão (sem sair voando de cada degrauzinho)
    if (this.onGround && this.vel.y <= 0 && this.y > ground && this.y - ground < 0.7) this.y = ground;
    if (this.y <= ground) { if (!this.onGround && this.vel.y < -6) audio.play('stepConcrete', { volume: 0.4 }); this.y = ground; this.vel.y = 0; this.onGround = true; }
    else if (this.y > ground + 0.05) this.onGround = false;

    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.speed = hs;
    if (this.onGround && hs > 0.5 && !this.sliding) {
      this.bob += dt * hs * 1.9;
      this.stepTimer -= dt * hs;
      if (this.stepTimer <= 0) {
        this.stepTimer = 2.3;
        const c = worldToCell(p.x, p.z);
        const onFloor = game.floorAt && game.floorAt(c.x, c.z) != null && Math.abs(game.floorAt(c.x, c.z) - this.y) < 0.1;
        const floor = floorMaterialAt(p.x, p.z);
        const b = biomeAt(p.x, p.z);
        if (this.swimming) audio.play('water', { volume: 0.25, rate: 0.8 + Math.random() * 0.3 });
        else audio.play(floor === 'madeira' ? 'stepWood' : floor || onFloor || b === 'canion' || b === 'tundra' ? 'stepConcrete' : 'stepGrass', { volume: sprint ? 0.35 : 0.25, rate: b === 'tundra' ? 1.25 : 1 });
      }
    }
    this.eyeHeight += ((this.sliding ? 0.88 : EYE) - this.eyeHeight) * (1 - Math.exp(-14 * dt));
    p.y = this.eyeHeight + this.y + (this.onGround && !this.sliding ? Math.sin(this.bob * 2) * 0.035 * Math.min(1, hs / 4) : 0);

    const r = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    audio.setListener(p, r.x, r.z);
  }
}
