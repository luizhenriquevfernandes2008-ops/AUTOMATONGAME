// Máquinas novas: laboratório, plataforma do foguete, drones, sinais, sensores, logística, 2º andar e energia.
import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { CELL, MACHINES, TECHS, PHASES, ITEMS, INF_TECHS, infCost, SATELLITES, missionNeeds, missionPrize } from './data.js';
import { FUELS } from './data.js';
import { game } from './state.js';
import {
  ENTITY_CLASSES, Entity, Machine, Belt, Generator, grid, gridUp, key, cellCenter, DIRS, ELEV, floorY,
  isItem, itemName, uniqueName,
} from './machines.js';
import { takeItemMesh, releaseItemMesh } from './itemMeshes.js';
import { cloneModel } from './assets.js';
import { Blocking, JiboiaError, JDict, suggest } from './lang/jiboia.js';
import { audio } from './audio.js';
import { virtualLight } from './lights.js';
import { puff, floatText, makeLabel, setLabel, confetti } from './fx.js';
import { powerRatio, outputOf } from './power.js';

const BELT_Y = 0.4 * CELL;
const needItem = (name, fname) => {
  if (typeof name !== 'string') throw new JiboiaError(`${fname}() precisa do nome do item entre aspas`);
  if (!isItem(name)) {
    const s = suggest(name, Object.keys(ITEMS));
    throw new JiboiaError(`O item "${name}" não existe` + (s ? `. Você quis dizer "${s}"?` : ''));
  }
};
const emitEvent = (ev) => game.emit('evento', ev);

// ───────────────────────── Laboratório ─────────────────────────
export class Lab extends Machine {
  constructor(...a) {
    super(...a);
    this.research = null;
    this.progress = {};
  }
  get inputSides() { return [0, 1, 2, 3]; }
  partsOn() { return !!this.research; }
  // custo da pesquisa (as infinitas começam com "inf:" e ficam mais caras a cada nível)
  static costOf(id) {
    if (id && id.startsWith('inf:')) return infCost(id.slice(4), game.economy.infLvl(id.slice(4))).itens;
    return TECHS[id].custo;
  }
  static nameOf(id) {
    if (id && id.startsWith('inf:')) { const k = id.slice(4); return `${INF_TECHS[k].nome} ${game.economy.infLvl(k) + 1}`; }
    return TECHS[id]?.nome || id;
  }
  needs(type) {
    if (!this.research) return false;
    const cost = Lab.costOf(this.research);
    return (cost[type] || 0) > (this.progress[type] || 0);
  }
  canAccept(type) { return !this.noPower && this.needs(type); }
  accept(type, travelDir, mesh) {
    releaseItemMesh(mesh);
    this.progress[type] = (this.progress[type] || 0) + 1;
    this.bump = 0.25;
    this.checkDone();
  }
  // entrega do inventário do jogador (igual ao Satisfactory: dá pra pôr direto)
  deliverFromPlayer() {
    if (!this.research) return 0;
    const cost = Lab.costOf(this.research);
    let n = 0;
    for (const [k, need] of Object.entries(cost)) {
      const left = need - (this.progress[k] || 0);
      const k2 = Math.min(left, game.economy.count(k));
      if (k2 > 0) { game.economy.take(k, k2); this.progress[k] = (this.progress[k] || 0) + k2; n += k2; }
    }
    if (n) this.checkDone();
    return n;
  }
  percent() {
    if (!this.research) return 0;
    const cost = Lab.costOf(this.research);
    let need = 0, have = 0;
    for (const [k, n] of Object.entries(cost)) { need += n; have += Math.min(n, this.progress[k] || 0); }
    return need ? have / need : 0;
  }
  setResearch(id) {
    if (this.research === id) return null;
    if (game.mp?.guestRpc('research', { a: `${this.x},${this.z},0`, id })) return null;
    const eco = game.economy;
    // pesquisas infinitas gastam ⭐ estrelas ao começar (voltam se trocar)
    if (id && id.startsWith('inf:')) {
      const k = id.slice(4);
      if (!INF_TECHS[k]) return 'Pesquisa infinita desconhecida';
      if (!eco.launched) return 'Pesquisas infinitas liberam depois do lançamento do foguete 🚀';
      if (game.entities.some((e) => e.type === 'laboratorio' && e !== this && e.research === id)) return 'Essa pesquisa já está em outro laboratório';
      const stars = infCost(k, eco.infLvl(k)).estrelas;
      if (eco.stars < stars) return `Precisa de ${stars} ⭐ estrela(s). Ganhe estrelas lançando missões no Programa Espacial`;
      eco.stars -= stars;
      this.stars = stars;
    }
    if (this.research && this.research.startsWith('inf:') && this.stars) { eco.stars += this.stars; this.stars = 0; }
    if (!id || !id.startsWith('inf:')) this.stars = 0;
    // itens já entregues voltam como "crédito" só se for a mesma pesquisa; trocar zera
    this.research = id;
    this.progress = {};
    game.emit('research', this);
    return null;
  }
  checkDone() {
    if (this.percent() < 1) return;
    const id = this.research;
    this.research = null;
    this.progress = {};
    if (id.startsWith('inf:')) {
      const k = id.slice(4);
      const eco = game.economy;
      eco.inf[k] = eco.infLvl(k) + 1;
      this.stars = 0;
      eco.addXp(300 * eco.inf[k]);
      game.emit('infDone', k);
      game.ui?.banner(`${INF_TECHS[k].icone} ${INF_TECHS[k].nome} ${eco.inf[k]}`, 'Pesquisa infinita concluída!', [INF_TECHS[k].desc + ` (total: +${Math.round(eco.infBonus(k) * 100)}%)`]);
    } else game.economy.unlockTech(id);
    audio.play('levelup', { pos: this.pos, volume: 0.8 });
    puff(new THREE.Vector3(this.pos.x, this.pos.y + 1.6, this.pos.z), { color: 0x6cf5ff, count: 18, size: 0.18, up: 2.2, gravity: 2, additive: true, spread: 1, life: 1.2 });
    game.emit('research', this);
  }
  update(dt) {
    super.update(dt);
    const r = this.research;
    this.status = this.noPower ? 'Sem energia ⚡' : r ? `Pesquisando ${Lab.nameOf(r)} (${Math.round(this.percent() * 100)}%)` : 'Escolha uma pesquisa (E)';
    if (this.bump > 0) { this.bump -= dt; const k = 1 + this.bump * 0.06; this.model.scale.set(k, k, k); }
    if (r && !this.noPower && Math.random() < dt * 2) puff(new THREE.Vector3(this.pos.x, this.pos.y + 1.6, this.pos.z), { color: 0x6cf5ff, count: 1, size: 0.12, up: 0.8, additive: true, spread: 0.8, life: 1 });
  }
  api() {
    return {
      ...super.api(),
      pesquisa: { fn: () => this.research, doc: 'Pesquisa atual (ou None)' },
      progresso: { fn: () => Math.round(this.percent() * 100), doc: 'Porcentagem da pesquisa atual' },
      faltando: {
        fn: () => {
          if (!this.research) return new JDict();
          const cost = Lab.costOf(this.research);
          return new JDict(Object.entries(cost).map(([k, n]) => [k, Math.max(0, n - (this.progress[k] || 0))]));
        }, doc: 'Dicionário com quantos itens ainda faltam',
      },
      pesquisar: {
        min: 1, max: 1, doc: 'Escolhe a pesquisa pelo nome (ex: "logistica", ou "inf:mineracao" pras infinitas)',
        fn: ([id]) => {
          if (typeof id === 'string' && id.startsWith('inf:')) { const why = this.setResearch(id); if (why) throw new JiboiaError(why); return true; }
          if (!TECHS[id]) { const s = suggest(String(id), Object.keys(TECHS)); throw new JiboiaError(`Pesquisa "${id}" não existe` + (s ? `. Você quis dizer "${s}"?` : '')); }
          const why = game.economy.techBlocked(id);
          if (why) throw new JiboiaError(why);
          this.setResearch(id);
          return true;
        },
      },
    };
  }
  infoLines() {
    const l = [`Status: ${this.status}`];
    if (this.research) {
      const cost = Lab.costOf(this.research);
      l.push('Falta: ' + Object.entries(cost).map(([k, n]) => `${Math.max(0, n - (this.progress[k] || 0))}× ${itemName(k)}`).join(', '));
    }
    return l.concat(super.infoLines().slice(1));
  }
  serialize() { return { ...super.serialize(), research: this.research, progress: this.progress, stars: this.stars || 0 }; }
  load(d) {
    super.load(d);
    const ok = d.research && (TECHS[d.research] || (d.research.startsWith('inf:') && INF_TECHS[d.research.slice(4)]));
    this.research = ok ? d.research : null;
    this.progress = d.progress || {};
    this.stars = d.stars || 0;
  }
}

// ───────────────────────── Plataforma de Lançamento (3x3, construída depois do marco Projeto Foguete) ─────────────────────────
export class Platform extends Entity {
  constructor(type, cx, cz, dir = 0) {
    super(type, cx, cz, 0);
    this.solid = true;
    this.isPlatform = true;
    this.name = 'plataforma';
    this.cx = cx; this.cz = cz;
    void dir;
    const base = cloneModel('launchPad');
    this.obj.add(base);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const t = cloneModel('tower');
      t.position.set(sx * CELL * 1.25, 0, sz * CELL * 1.25);
      this.obj.add(t);
    }
    this.rocket = new THREE.Group();
    this.obj.add(this.rocket);
    this.label = makeLabel('🚀 Projeto Foguete');
    this.label.position.y = 4.2;
    this.label.scale.multiplyScalar(1.6);
    this.label.visible = false;
    this.obj.add(this.label);
    this.obj.traverse((o) => { o.userData.entity = this; });
    this.launching = 0;
    this.buildRocket();
    game.platform = this;
  }
  get isMachine() { return false; }
  onRemove() { if (game.platform === this) game.platform = null; }
  serialize() { return { type: this.type, x: this.x, z: this.z, dir: 0, name: this.name }; }
  get phase() { return game.economy.phase; }
  // o que falta agora: fase do Projeto Foguete, ou a missão do Programa Espacial (depois do 1º lançamento)
  goal() {
    const eco = game.economy;
    if (eco.launched) return null;
    const p = PHASES[this.phase];
    return p ? { itens: p.itens, prog: eco.phaseProgress, final: !!p.final } : null;
  }
  canAccept(type) {
    const g = this.goal();
    if (!g || this.launching) return false;
    return (g.itens[type] || 0) > (g.prog[type] || 0);
  }
  accept(type, travelDir, mesh) {
    releaseItemMesh(mesh);
    const g = this.goal();
    g.prog[type] = (g.prog[type] || 0) + 1;
    if (Math.random() < 0.3) audio.play('drop', { pos: this.pos, volume: 0.3 });
    game.emit('phase');
    if (this.percent() >= 1 && !g.final) this.completePhase();
  }
  percent() {
    const g = this.goal();
    if (!g) return game.economy.launched ? 0 : 1;
    let need = 0, have = 0;
    for (const [k, n] of Object.entries(g.itens)) { need += n; have += Math.min(n, g.prog[k] || 0); }
    return need ? have / need : 0;
  }
  readyToLaunch() { const g = this.goal(); return !!g && g.final && this.percent() >= 1 && !this.launching; }
  deliverFromPlayer() {
    const g = this.goal();
    if (!g || this.launching) return 0;
    let n = 0;
    for (const [k, need] of Object.entries(g.itens)) {
      const left = need - (g.prog[k] || 0);
      const k2 = Math.min(left, game.economy.count(k));
      if (k2 > 0) { game.economy.take(k, k2); g.prog[k] = (g.prog[k] || 0) + k2; n += k2; }
    }
    if (n) { game.emit('phase'); if (this.percent() >= 1 && !g.final) this.completePhase(); }
    return n;
  }
  // Programa Espacial: escolhe o satélite da próxima missão
  chooseMission(sat) {
    if (game.mp?.guestRpc('mission', { sat })) return null;
    const eco = game.economy;
    if (!eco.launched || !SATELLITES[sat] || this.launching) return 'Não dá pra escolher agora';
    if (eco.satLvl(sat) >= 5) return 'Esse satélite já está no máximo (5 em órbita)';
    eco.mission.sat = sat;
    eco.mission.progress = {};
    this.buildRocket();
    game.emit('phase');
    return null;
  }
  completePhase() {
    const eco = game.economy;
    const p = PHASES[this.phase];
    eco.phase++;
    eco.phaseProgress = {};
    audio.play('levelup', { volume: 0.9 });
    floatText(new THREE.Vector3(this.pos.x, this.pos.y + 5, this.pos.z), `Fase ${eco.phase} concluída! ${p.libera || ''}`, '#ffcf5c');
    puff(new THREE.Vector3(this.pos.x, this.pos.y + 2, this.pos.z), { color: 0xffcf5c, count: 30, size: 0.25, up: 3, gravity: 3, additive: true, spread: 3, life: 1.5 });
    this.buildRocket();
    game.emit('phaseDone', eco.phase);
  }
  launch() {
    if (game.mp?.guestRpc('launch', {})) return;
    if (!this.readyToLaunch()) return;
    this.launching = 0.001;
    audio.play('launch', { volume: 1 });
    game.emit('launchStart');
  }
  buildRocket() {
    this.rocket.clear();
    this.rocket.visible = true;
    this.rocket.position.set(0, 0, 0);
    const eco = game.economy;
    const k = eco.launched ? 0 : Math.min(this.phase + 1, 4);
    const parts = [];
    if (k >= 1) parts.push('rocketBase');
    if (k >= 2) parts.push('rocketFuel', 'rocketSides');
    if (k >= 3) parts.push('rocketSides', 'rocketFins');
    if (k >= 4) parts.push('rocketTop');
    let y = 0.15;
    for (const p of parts) {
      const m = cloneModel(p);
      m.position.y = y;
      this.rocket.add(m);
      y += m.userData.size.y * 0.98;
    }
    this.rocket.traverse((o) => { o.userData.entity = this; });
  }
  update(dt) {
    if (!this.launching) return;
    this.launching += dt;
    const t = this.launching;
    if (t < 3) {
      // contagem: fumaça e tremida
      this.rocket.position.x = (Math.random() - 0.5) * 0.06;
      if (Math.random() < dt * 30) puff(new THREE.Vector3(this.pos.x + (Math.random() - 0.5) * 3, this.pos.y + 0.5, this.pos.z + (Math.random() - 0.5) * 3), { color: 0xeeeeee, count: 2, size: 1.2, up: 0.6, spread: 2, life: 3, opacity: 0.6, grow: 3 });
    } else {
      const h = Math.pow(t - 3, 2.2) * 2.2;
      this.rocket.position.y = h;
      this.rocket.position.x = 0;
      if (Math.random() < dt * 40) puff(new THREE.Vector3(this.pos.x, this.pos.y + h, this.pos.z), { color: 0xffa640, count: 2, size: 0.8, up: -2, spread: 0.6, life: 1.2, additive: true, grow: 2 });
      if (Math.random() < dt * 20) puff(new THREE.Vector3(this.pos.x, this.pos.y + h - 2, this.pos.z), { color: 0xdddddd, count: 1, size: 1.5, up: 0.2, spread: 1, life: 4, opacity: 0.5, grow: 3 });
    }
    if (t > 13) {
      this.launching = 0;
      this.rocket.visible = false;
      const eco = game.economy;
      if (!eco.launched) {
        eco.launched = true;
        eco.phase = PHASES.length;
        eco.phaseProgress = {};
        confetti(220);
        game.emit('launched');
      }
      setTimeout(() => this.buildRocket(), 1500);
    }
  }
  infoLines() {
    const eco = game.economy;
    if (eco.launched) return ['🚀 O foguete já foi pro espaço! KX-7 conquistado.'];
    const p = PHASES[this.phase];
    if (!p) return ['🚀 O foguete já foi pro espaço!'];
    return [`Fase ${this.phase + 1}/${PHASES.length}: ${p.nome} (${Math.round(this.percent() * 100)}%)`,
      'Falta: ' + Object.entries(p.itens).map(([k, n]) => `${Math.max(0, n - (game.economy.phaseProgress[k] || 0))}× ${itemName(k)}`).join(', ')];
  }
}

// ───────────────────────── Doca de Drones + Drone ─────────────────────────
export class DroneDock extends Machine {
  constructor(...a) {
    super(...a);
    this.drone = new Drone(this);
  }
  get inputSides() { return []; }
  update(dt) {
    super.update(dt);
    this.status = this.noPower ? 'Sem energia ⚡ (o drone não voa)' : `Drone ${this.drone.name}: ${this.drone.status}`;
  }
  onRemove() { super.onRemove(); this.drone.remove(); }
  api() { return { ...super.api(), drone: { fn: () => this.drone.name, doc: 'Nome do drone desta doca' } }; }
  infoLines() { return [`Status: ${this.status}`, ...super.infoLines().slice(1), `Use no código: d = maquina("${this.drone.name}")`]; }
  serialize() { return { ...super.serialize(), drone: this.drone.serialize() }; }
  load(d) { super.load(d); if (d.drone) this.drone.load(d.drone); }
}

// v2 · KX-7: drone baixado (NateGazzard, CC-BY) — escuro com hélices âmbar, como no trailer
function makeDroneModel() {
  const g = new THREE.Group();
  const m = cloneModel('drone');
  m.position.y = -0.12;
  g.add(m);
  g.userData.rotors = [];
  m.traverse((o) => { if (o.isMesh && /^Rotor/.test(o.name)) g.userData.rotors.push(o); });
  // luz de status (teal = livre, âmbar = carregando, vermelho = sem energia)
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: 0x3fe0cc }));
  eye.position.set(0, -0.02, -0.3);
  g.add(eye);
  g.userData.eye = eye;
  return g;
}

export class Drone {
  constructor(dock) {
    this.dock = dock;
    this.type = 'drone';
    this.isMachine = false;
    this.removed = false;
    this.name = uniqueName('drone');
    this.home = new THREE.Vector3(dock.pos.x, dock.pos.y + 1.9, dock.pos.z);
    this.p = this.home.clone();
    this.obj = makeDroneModel();
    this.obj.position.copy(this.p);
    this.label = makeLabel(this.name);
    this.label.position.y = 0.6;
    this.label.visible = false;
    this.obj.add(this.label);
    this.cargo = null;
    this.task = null;
    this.status = 'Na doca';
    this.anim = Math.random() * 10;
    this.flights = 0;
    game.scene.add(this.obj);
    (game.drones || (game.drones = [])).push(this);
  }
  get pos() { return this.p; }
  get noPower() { return this.dock.noPower; }
  cell() { return { x: Math.floor(this.p.x / CELL), z: Math.floor(this.p.z / CELL) }; }
  below() { const c = this.cell(); return grid.get(key(c.x, c.z)) || gridUp.get(key(c.x, c.z)); }
  rename(n) { this.name = n; setLabel(this.label, n); }
  remove() {
    this.removed = true;
    if (this.task) this.task.b.fail(`O drone '${this.name}' foi removido`);
    if (this.cargo) releaseItemMesh(this.cargo.mesh);
    game.scene.remove(this.obj);
    const i = game.drones.indexOf(this);
    if (i >= 0) game.drones.splice(i, 1);
  }
  flyTo(target, label) {
    if (this.task) throw new JiboiaError(`O drone '${this.name}' já está ocupado`);
    const b = new Blocking();
    b.label = label;
    this.task = { kind: 'fly', to: target, b, phase: 0 };
    return b;
  }
  act(kind, want, label) {
    if (this.task) throw new JiboiaError(`O drone '${this.name}' já está ocupado`);
    const b = new Blocking();
    b.label = label;
    this.task = { kind, want, b, t: 0 };
    return b;
  }
  update(dt) {
    this.anim += dt;
    const spin = this.noPower ? 0 : 40;
    this.obj.userData.rotors.forEach((r) => { r.rotation.y += dt * spin; });
    this.obj.userData.eye.material.color.setHex(this.noPower ? 0xff4455 : this.cargo ? 0xffae34 : 0x3fe0cc);
    const t = this.task;
    let bob = Math.sin(this.anim * 3) * 0.06;
    if (this.noPower) {
      this.status = 'Sem energia ⚡';
      const fl = heightAt(this.p.x, this.p.z) + 0.6;
      if (this.p.y > fl) this.p.y = Math.max(fl, this.p.y - dt * 0.8);
      bob = 0;
    } else if (t && t.kind === 'fly') {
      if (t.b.cancelled) { this.task = null; }
      else {
        const to = t.to;
        // voa 3,4 m acima do chão (olhando um pouco à frente pra subir antes do morro)
        const ahead = new THREE.Vector3(to.x - this.p.x, 0, to.z - this.p.z).normalize().multiplyScalar(4).add(this.p);
        const cruise = Math.max(heightAt(this.p.x, this.p.z), heightAt(ahead.x, ahead.z), to.y - 1) + 3.4;
        const flat = new THREE.Vector3(to.x - this.p.x, 0, to.z - this.p.z);
        const d = flat.length();
        const speed = 6 * game.economy.machineSpeed * game.economy.logMul;
        if (d > 0.08) {
          this.p.y += (cruise - this.p.y) * Math.min(1, dt * 2.5);
          flat.normalize().multiplyScalar(Math.min(d, speed * dt));
          this.p.add(flat);
          this.obj.rotation.y = Math.atan2(-(to.x - this.p.x), -(to.z - this.p.z));
          this.status = 'Voando';
        } else {
          this.p.y += (to.y - this.p.y) * Math.min(1, dt * 4);
          if (Math.abs(this.p.y - to.y) < 0.05) {
            this.task = null;
            this.flights++;
            game.economy.stats.droneFlights = (game.economy.stats.droneFlights || 0) + 1;
            t.b.resolve(true);
            this.status = 'Parado';
          }
        }
      }
    } else if (t) {
      if (t.b.cancelled) { this.task = null; }
      else {
        t.t += dt * game.economy.machineSpeed;
        this.status = t.kind === 'pick' ? 'Pegando' : 'Soltando';
        bob = -Math.sin(Math.min(1, t.t / 0.6) * Math.PI) * 0.4;
        if (t.t >= 0.6) { this.task = null; this.finishAct(t); }
      }
    } else if (!this.noPower) this.status = this.p.distanceTo(this.home) < 0.3 ? 'Na doca' : 'Parado';
    this.obj.position.set(this.p.x, this.p.y + bob, this.p.z);
    if (this.cargo) this.cargo.mesh.position.set(this.p.x, this.p.y + bob - 0.45, this.p.z);
  }
  finishAct(t) {
    const e = this.below();
    if (t.kind === 'pick') {
      if (this.cargo) return t.b.fail('O drone já está carregando algo. Use .soltar() antes');
      if (!e) return t.b.fail('Não tem nada embaixo do drone pra pegar');
      const type = takeFrom(e, t.want);
      if (!type) return t.b.fail(`Nada ${t.want ? 'do tipo "' + t.want + '" ' : ''}pra pegar em '${e.name || e.type}'`);
      const mesh = type.mesh || takeItemMesh(type.type);
      if (mesh.parent !== game.scene) game.scene.add(mesh);
      this.cargo = { type: type.type, mesh };
      audio.play('click', { pos: this.p, volume: 0.4 });
      return t.b.resolve(type.type);
    }
    if (!this.cargo) return t.b.fail('O drone não está carregando nada');
    if (!e) return t.b.fail('Não tem máquina nem esteira embaixo do drone');
    if (!e.canAccept || !e.canAccept(this.cargo.type, -1)) return t.b.fail(`'${e.name || e.type}' não aceitou ${itemName(this.cargo.type)} agora`);
    const c = this.cargo;
    this.cargo = null;
    e.accept(c.type, -1, c.mesh);
    audio.play('drop', { pos: this.p, volume: 0.4 });
    t.b.resolve(true);
  }
  api() {
    const target = (x, z) => new THREE.Vector3((x + 0.5) * CELL, floorY(x, z) + 2.2, (z + 0.5) * CELL);
    return {
      ir: {
        min: 2, max: 2, doc: 'Voa até a célula (x, z) do mapa',
        fn: ([x, z]) => {
          if (typeof x !== 'number' || typeof z !== 'number') throw new JiboiaError('ir(x, z) precisa de dois números');
          return this.flyTo(target(Math.round(x), Math.round(z)), 'Voando');
        },
      },
      ir_para: {
        min: 1, max: 1, doc: 'Voa até ficar em cima de uma máquina: .ir_para("bau1")',
        fn: ([nome]) => {
          const e = game.entities.find((m) => m.name === nome);
          if (!e) {
            const s = suggest(String(nome), game.entities.filter((m) => m.name).map((m) => m.name));
            throw new JiboiaError(`Não achei a máquina "${nome}"` + (s ? `. Você quis dizer "${s}"?` : ''));
          }
          return this.flyTo(target(e.x, e.z), 'Voando pra ' + nome);
        },
      },
      voltar: { fn: () => this.flyTo(this.home.clone(), 'Voltando'), doc: 'Volta pra doca' },
      pegar: {
        max: 1, doc: 'Pega 1 item da máquina/esteira embaixo (do tipo pedido, ou qualquer)',
        fn: (a) => { const w = a[0] ?? null; if (w !== null) needItem(w, 'pegar'); return this.act('pick', w, 'Pegando'); },
      },
      soltar: { fn: () => this.act('drop', null, 'Soltando'), doc: 'Solta o item na máquina/esteira embaixo' },
      carga: { fn: () => this.cargo ? this.cargo.type : null, doc: 'O item que está carregando (ou None)' },
      posicao: { fn: () => { const c = this.cell(); return [c.x, c.z]; }, doc: 'Célula [x, z] onde o drone está' },
      ocupado: { fn: () => !!this.task, doc: 'True se estiver voando/pegando' },
      embaixo: { fn: () => { const e = this.below(); return e ? (e.name || e.type) : null; }, doc: 'Nome do que está embaixo' },
      energia: { fn: () => (this.noPower ? 0 : 1), doc: '1 com energia, 0 sem' },
    };
  }
  serialize() { return { name: this.name, p: [this.p.x, this.p.y, this.p.z], cargo: this.cargo?.type || null, flights: this.flights }; }
  load(d) {
    if (d.name) this.rename(d.name);
    if (d.p) this.p.set(d.p[0], d.p[1], d.p[2]);
    this.flights = d.flights || 0;
    if (d.cargo && isItem(d.cargo)) { const m = takeItemMesh(d.cargo); this.cargo = { type: d.cargo, mesh: m }; }
  }
}

// tira 1 item de uma máquina/esteira (pro drone)
export function takeFrom(e, want) {
  if (e.items && e.items.length) { // esteira
    const i = e.items.findIndex((it) => !want || it.type === want);
    if (i >= 0) { const it = e.items.splice(i, 1)[0]; return { type: it.type, mesh: it.mesh }; }
  }
  if (e.out && e.out.length) {
    const i = e.out.findIndex((t) => !want || t === want);
    if (i >= 0) return { type: e.out.splice(i, 1)[0] };
  }
  if (e.held) { if (!want || e.held.type === want) { const h = e.held; e.held = null; return { type: h.type, mesh: h.mesh }; } }
  if (e.inv && (e.type === 'bau' || e.type === 'venda')) {
    const k = want ? (e.inv[want] ? want : null) : Object.keys(e.inv)[0];
    if (k) { e.takeInv(k); return { type: k }; }
  }
  return null;
}

// ───────────────────────── Lâmpada ─────────────────────────
const COLORS = {
  vermelho: 0xff3b4a, verde: 0x3ee67a, azul: 0x3b8bff, amarelo: 0xffd84a, laranja: 0xffa640,
  roxo: 0xa05bff, rosa: 0xff6ec7, branco: 0xffffff, ciano: 0x3ee6e6,
};
function parseColor(c) {
  if (typeof c !== 'string') throw new JiboiaError('cor() precisa de um nome, ex: "verde", ou "#ff8800"');
  if (COLORS[c.toLowerCase()] !== undefined) return COLORS[c.toLowerCase()];
  if (/^#[0-9a-f]{6}$/i.test(c)) return parseInt(c.slice(1), 16);
  throw new JiboiaError(`Cor "${c}" não conheço. Use: ${Object.keys(COLORS).join(', ')} ou "#rrggbb"`);
}
export class Lamp extends Machine {
  constructor(...a) {
    super(...a);
    this.on = false;
    this.color = COLORS.amarelo;
    this.blink = 0;
    this.bulb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 10), new THREE.MeshStandardMaterial({ color: 0x555566, emissive: 0x000000 }));
    this.bulb.position.y = (this.model.userData.size?.y || 1.2) + 0.12;
    this.obj.add(this.bulb);
    this.light = virtualLight(new THREE.PointLight(this.color, 0, 9, 1.6));
    this.light.position.y = this.bulb.position.y;
    this.obj.add(this.light);
    this.lamp.visible = false;
  }
  update(dt) {
    super.update(dt);
    const lit = this.on && !this.noPower && (this.blink <= 0 || Math.sin(this.anim * Math.PI * 2 / this.blink) > 0);
    this.bulb.material.color.setHex(lit ? this.color : 0x555566);
    this.bulb.material.emissive.setHex(lit ? this.color : 0x000000);
    this.bulb.material.emissiveIntensity = lit ? 2 : 0;
    this.light.color.setHex(this.color);
    this.light.intensity = lit ? 7 : 0;
    this.status = this.noPower ? 'Sem energia ⚡' : this.on ? (this.blink ? 'Piscando' : 'Ligada') : 'Desligada';
  }
  api() {
    return {
      ...super.api(),
      ligar: { fn: () => { this.on = true; this.blink = 0; return null; }, doc: 'Acende' },
      desligar: { fn: () => { this.on = false; return null; }, doc: 'Apaga' },
      cor: { min: 1, max: 1, fn: ([c]) => { this.color = parseColor(c); return null; }, doc: 'Muda a cor: "verde", "vermelho", "#ff8800"…' },
      piscar: { max: 1, fn: (a) => { this.on = true; this.blink = Math.max(0.2, a[0] ?? 1); return null; }, doc: 'Pisca (período em segundos)' },
      ligada: { fn: () => this.on, doc: 'True se está ligada' },
    };
  }
  serialize() { return { ...super.serialize(), on: this.on, color: this.color, blink: this.blink }; }
  load(d) { super.load(d); this.on = !!d.on; this.color = d.color ?? this.color; this.blink = d.blink || 0; }
}

// ───────────────────────── Tela ─────────────────────────
export class Display extends Machine {
  constructor(...a) {
    super(...a);
    this.lines = ['AUTOMATON', 'tela pronta ✓'];
    this.title = this.name;
    this.textColor = '#3ee6b8';
    this.chart = null;
    const c = document.createElement('canvas');
    c.width = 512; c.height = 320;
    this.canvas = c;
    this.tex = new THREE.CanvasTexture(c);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    let screen = null;
    this.model.traverse((o) => { if (o.name === 'screen') screen = o; });
    if (screen) { screen.material = new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false }); screen.userData.entity = this; }
    this.dirty = true;
  }
  draw() {
    const g = this.canvas.getContext('2d');
    g.fillStyle = '#070b10'; g.fillRect(0, 0, 512, 320);
    if (this.noPower) { this.tex.needsUpdate = true; return; }
    g.fillStyle = '#151c27'; g.fillRect(0, 0, 512, 40);
    g.fillStyle = '#ffb020'; g.font = '600 22px "Barlow", sans-serif'; g.textBaseline = 'middle';
    g.fillText(String(this.title).slice(0, 36), 14, 21);
    if (this.chart) {
      const v = this.chart, mx = Math.max(1, ...v.map((x) => +x || 0));
      const w = 480 / v.length;
      v.forEach((x, i) => {
        const h = ((+x || 0) / mx) * 240;
        g.fillStyle = i === v.length - 1 ? '#ffcf5c' : this.textColor;
        g.fillRect(16 + i * w + 2, 305 - h, Math.max(2, w - 4), h);
      });
    } else {
      g.fillStyle = this.textColor; g.font = '24px "JetBrains Mono", monospace';
      this.lines.slice(-9).forEach((l, i) => g.fillText(String(l).slice(0, 34), 14, 64 + i * 29));
    }
    this.tex.needsUpdate = true;
  }
  update(dt) {
    const was = this.noPower;
    super.update(dt);
    if (was !== this.noPower) this.dirty = true;
    if (this.dirty) { this.dirty = false; this.draw(); }
    this.status = this.noPower ? 'Sem energia ⚡' : 'Ligada';
  }
  api() {
    const str = (v) => (typeof v === 'string' ? v : JSON.stringify(v));
    return {
      ...super.api(),
      escrever: { min: 1, max: 1, fn: ([t]) => { this.chart = null; this.lines.push(...str(t).split('\n')); if (this.lines.length > 40) this.lines.splice(0, this.lines.length - 40); this.dirty = true; return null; }, doc: 'Escreve uma linha no fim' },
      mostrar: { min: 1, max: 1, fn: ([t]) => { this.chart = null; this.lines = str(t).split('\n'); this.dirty = true; return null; }, doc: 'Troca todo o texto' },
      limpar: { fn: () => { this.chart = null; this.lines = []; this.dirty = true; return null; }, doc: 'Apaga a tela' },
      titulo: { min: 1, max: 1, fn: ([t]) => { this.title = str(t); this.dirty = true; return null; }, doc: 'Muda o título' },
      cor: { min: 1, max: 1, fn: ([c]) => { this.textColor = '#' + parseColor(c).toString(16).padStart(6, '0'); this.dirty = true; return null; }, doc: 'Cor do texto' },
      grafico: {
        min: 1, max: 1, doc: 'Desenha um gráfico de barras com uma lista de números',
        fn: ([l]) => { if (!Array.isArray(l)) throw new JiboiaError('grafico() precisa de uma lista de números'); this.chart = l.slice(-40); this.dirty = true; return null; },
      },
    };
  }
  serialize() { return { ...super.serialize(), lines: this.lines.slice(-20), title: this.title, textColor: this.textColor }; }
  load(d) { super.load(d); if (d.lines) this.lines = d.lines; if (d.title) this.title = d.title; if (d.textColor) this.textColor = d.textColor; this.dirty = true; }
}

// ───────────────────────── Alto-falante ─────────────────────────
const NOTES = { do: 0, 're': 2, mi: 4, fa: 5, sol: 7, la: 9, si: 11 };
function noteFreq(n) {
  const m = /^(do|re|ré|mi|fa|fá|sol|la|lá|si)(#|b)?(\d)?$/i.exec(String(n).trim().toLowerCase());
  if (!m) throw new JiboiaError(`Nota "${n}" não conheço. Use do, re, mi, fa, sol, la, si (ex: "do", "sol#", "la5")`);
  const base = NOTES[m[1].normalize('NFD').replace(/[̀-ͯ]/g, '')];
  const semi = base + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + ((+(m[3] || 4)) - 4) * 12;
  return 261.63 * Math.pow(2, semi / 12);
}
export class Speaker extends Machine {
  api() {
    return {
      ...super.api(),
      tocar: {
        min: 1, max: 2, doc: 'Toca uma nota: .tocar("do"), .tocar("sol#", 0.5)',
        fn: ([n, d]) => {
          const f = noteFreq(n);
          const dur = Math.max(0.05, Math.min(3, d ?? 0.35));
          if (this.noPower) throw new JiboiaError(`O alto-falante '${this.name}' está sem energia`);
          audio.note(f, dur, this.pos);
          this.bump = 0.2;
          game.economy.stats.notes = (game.economy.stats.notes || 0) + 1;
          const b = new Blocking();
          b.label = 'tocando';
          const until = game.time + dur;
          (game.timers || (game.timers = [])).push({ until, b });
          return b;
        },
      },
      som: {
        min: 1, max: 1, doc: 'Toca um som pronto: "sino", "moeda", "alerta", "sucesso", "erro", "bip"',
        fn: ([s]) => {
          const map = { sino: 'quest', moeda: 'sell', alerta: 'deny', sucesso: 'buy', erro: 'error', bip: 'beep' };
          if (!map[s]) throw new JiboiaError(`Som "${s}" não existe. Use: ${Object.keys(map).join(', ')}`);
          if (!this.noPower) { audio.play(map[s], { pos: this.pos, range: 30 }); this.bump = 0.2; }
          return null;
        },
      },
    };
  }
  update(dt) {
    super.update(dt);
    this.status = this.noPower ? 'Sem energia ⚡' : 'Pronto';
    if (this.bump > 0) { this.bump -= dt; const k = 1 + this.bump * 0.4; this.model.scale.set(k, k, k); }
  }
}

// ───────────────────────── Esteira com Sensor ─────────────────────────
export class SensorBelt extends Belt {
  constructor(type, x, z, dir) {
    super(type, x, z, dir);
    this.name = uniqueName('sensor');
    this.count = 0;
    this.byType = {};
    this.last = null;
    this.waiters = [];
    const arch = cloneModel('scanArch');
    this.obj.add(arch);
    arch.traverse((o) => { if (o.isMesh) o.userData.entity = this; });
    this.label = makeLabel(this.name);
    this.label.position.y = 1.7;
    this.label.visible = false;
    this.obj.add(this.label);
    this.led = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0x3ee6b8 }));
    this.led.position.y = 1.25;
    this.obj.add(this.led);
    this.flash = 0;
  }
  get isMachine() { return true; }
  get noPower() { return powerRatio(this) <= 0; }
  refreshShape() { }
  rename(n) { this.name = n; setLabel(this.label, n); }
  onItemPassed(type) {
    if (this.noPower) return;
    this.count++;
    this.byType[type] = (this.byType[type] || 0) + 1;
    this.last = type;
    this.flash = 0.25;
    for (const b of this.waiters) b.resolve(type);
    this.waiters = [];
    emitEvent({ tipo: 'item', fonte: this.name, item: type });
  }
  update(dt) {
    super.update(dt);
    this.flash -= dt;
    this.led.material.color.setHex(this.noPower ? 0xff4455 : this.flash > 0 ? 0xffffff : 0x3ee6b8);
    this.status = this.noPower ? 'Sem energia ⚡ (não conta)' : `${this.count} itens contados`;
  }
  api() {
    return {
      contagem: { max: 1, fn: (a) => (a.length ? this.byType[a[0]] || 0 : this.count), doc: 'Quantos itens passaram (de um tipo, ou todos)' },
      ultimo: { fn: () => this.last, doc: 'O último item que passou' },
      zerar: { fn: () => { this.count = 0; this.byType = {}; return null; }, doc: 'Zera a contagem' },
      esperar_item: {
        doc: 'Espera o próximo item passar e retorna o nome dele',
        fn: () => { const b = new Blocking(); b.label = 'esperando item no sensor'; this.waiters.push(b); return b; },
      },
      energia: { fn: () => (this.noPower ? 0 : 1), doc: '1 com energia, 0 sem' },
    };
  }
  infoLines() { return [`Status: ${this.status}`, `Último: ${this.last ? itemName(this.last) : '—'}`]; }
  serialize() { return { ...super.serialize(), name: this.name, count: this.count, byType: this.byType }; }
  load(d) { super.load(d); if (d.name) this.rename(d.name); this.count = d.count || 0; this.byType = d.byType || {}; }
}

// ───────────────────────── Divisor e Juntador (automáticos) ─────────────────────────
class Router extends Entity {
  constructor(type, x, z, dir, modelKey) {
    super(type, x, z, dir);
    this.addModel(modelKey);
    this.held = null;
    this.cd = 0;
    this.rr = 0;
    this.chev = new THREE.Mesh(new THREE.PlaneGeometry(CELL * 0.4, CELL * 0.4), new THREE.MeshBasicMaterial({ color: type === 'divisor' ? 0x3ee6b8 : 0xffcf5c, transparent: true, opacity: 0.6 }));
    this.chev.rotation.x = -Math.PI / 2;
    this.chev.position.y = BELT_Y + 0.01;
    this.obj.add(this.chev);
  }
  hold(type, mesh) {
    mesh = mesh || takeItemMesh(type);
    if (mesh.parent !== game.scene) game.scene.add(mesh);
    mesh.position.set(this.pos.x, this.pos.y + BELT_Y, this.pos.z);
    this.held = { type, mesh };
    this.cd = 0.18 / game.economy.beltSpeed;
  }
  onRemove() { if (this.held) releaseItemMesh(this.held.mesh); }
  serialize() { return { ...super.serialize(), held: this.held?.type || null }; }
  load(d) { if (d.held && isItem(d.held)) this.hold(d.held, null); }
}
export class Splitter extends Router {
  constructor(type, x, z, dir) { super(type, x, z, dir, 'splitter3'); }
  get outputDirs() { return [(this.dir + 3) % 4, this.dir, (this.dir + 1) % 4]; }
  canAccept(type, travelDir) { return !this.held && (travelDir === this.dir || travelDir < 0); }
  accept(type, travelDir, mesh) { this.hold(type, mesh); }
  update(dt) {
    this.cd -= dt;
    if (!this.held || this.cd > 0) return;
    const outs = this.outputDirs;
    for (let i = 0; i < 3; i++) {
      const d = outs[(this.rr + i) % 3];
      const t = this.entityIn(d);
      if (t && !t.removed && t.canAccept(this.held.type, d)) {
        t.accept(this.held.type, d, this.held.mesh);
        this.held = null;
        this.rr = (this.rr + i + 1) % 3;
        return;
      }
    }
  }
  infoLines() { return ['Reparte os itens: esquerda → frente → direita']; }
}
export class Merger extends Router {
  constructor(type, x, z, dir) { super(type, x, z, dir, 'merger3'); }
  get outputDirs() { return [this.dir]; }
  // lados de entrada (direção de onde vem): trás, esquerda, direita
  sidesIn() { return [(this.dir + 2) % 4, (this.dir + 3) % 4, (this.dir + 1) % 4]; }
  waitingFrom(side) {
    const n = this.entityIn(side);
    if (!n || n.removed) return false;
    if (n.items && n.items.length && n.dir === (side + 2) % 4 && n.items[0].p >= 0.95) return true;
    if (n.out && n.out.length && n.dir === (side + 2) % 4) return true;
    return false;
  }
  canAccept(type, travelDir) {
    if (this.held) return false;
    if (travelDir < 0) return true;
    const side = (travelDir + 2) % 4;
    if (side === this.dir) return false;
    const sides = this.sidesIn();
    const waiting = sides.filter((s) => this.waitingFrom(s));
    if (waiting.length <= 1) return true;
    // vez de quem? a próxima na ordem do rodízio
    for (let i = 0; i < 3; i++) {
      const s = sides[(this.rr + i) % 3];
      if (waiting.includes(s)) return s === side;
    }
    return true;
  }
  accept(type, travelDir, mesh) {
    const sides = this.sidesIn();
    const side = (travelDir + 2) % 4;
    const i = sides.indexOf(side);
    if (i >= 0) this.rr = (i + 1) % 3;
    this.hold(type, mesh);
  }
  update(dt) {
    this.cd -= dt;
    if (!this.held || this.cd > 0) return;
    const t = this.nextTarget();
    if (t && !t.removed && t.canAccept(this.held.type, this.dir)) {
      t.accept(this.held.type, this.dir, this.held.mesh);
      this.held = null;
    }
  }
  infoLines() { return ['Junta trás, esquerda e direita na frente, um de cada vez']; }
}

// ───────────────────────── 2º andar: esteira elevada e rampas ─────────────────────────
export class ElevatedBelt extends Belt {
  constructor(type, x, z, dir) {
    super(type, x, z, dir);
    this.obj.remove(this.model);
    this.addModel('beltHigh');
    this.chev.position.y = ELEV + BELT_Y + 0.006;
  }
  get layer() { return 1; }
  entityIn(d) { const [x, z] = this.cellIn(d); return gridUp.get(key(x, z)); }
  nextTarget() {
    const [x, z] = this.cellIn(this.dir);
    const up = gridUp.get(key(x, z));
    if (up && up.type !== 'rampa_sobe') return up;
    const g = grid.get(key(x, z));
    if (g && g.type === 'rampa_desce' && g.dir === this.dir) return g;
    return null;
  }
  itemY() { return ELEV + BELT_Y; }
  refreshShape() { }
}
class Ramp extends Belt {
  constructor(type, x, z, dir, up) {
    super(type, x, z, dir);
    this.up = up;
    this.obj.remove(this.model);
    this.addModel(up ? 'rampUp' : 'rampDown');
    this.obj.remove(this.chev);
  }
  get alsoUp() { return true; }
  refreshShape() { }
  canAccept(type, travelDir) {
    if (travelDir !== this.dir) return false; // só entra por trás
    if (this.items.length >= 4) return false;
    const last = this.items[this.items.length - 1];
    return !last || last.p >= 0.34;
  }
  itemY(it) {
    const h0 = this.up ? BELT_Y : ELEV + BELT_Y, h1 = this.up ? ELEV + BELT_Y : BELT_Y;
    return h0 + (h1 - h0) * it.p;
  }
}
export class RampUp extends Ramp {
  constructor(type, x, z, dir) { super(type, x, z, dir, true); }
  nextTarget() { const [x, z] = this.cellIn(this.dir); return gridUp.get(key(x, z)); }
}
export class RampDown extends Ramp {
  constructor(type, x, z, dir) { super(type, x, z, dir, false); }
}

// ───────────────────────── Lixeira ─────────────────────────
export class Trash extends Machine {
  constructor(...a) { super(...a); this.eaten = 0; this.lamp.visible = false; }
  get inputSides() { return [0, 1, 2, 3]; }
  canAccept() { return true; }
  accept(type, travelDir, mesh) {
    releaseItemMesh(mesh);
    this.eaten++;
    if (Math.random() < 0.4) puff(new THREE.Vector3(this.pos.x, this.pos.y + 0.9, this.pos.z), { color: 0x9a8a7a, count: 2, size: 0.2, up: 0.5, life: 0.8 });
  }
  update(dt) { this.anim += dt; this.status = `${this.eaten} itens destruídos`; }
  api() { return { destruidos: { fn: () => this.eaten, doc: 'Quantos itens já destruiu' } }; }
  infoLines() { return [`Status: ${this.status}`]; }
}

// ───────────────────────── Geradores a combustível (biomassa e carvão) ─────────────────────────
// Queimam o que estiver na tabela FUELS (segundos por item). Combustível entra por esteira ou pelo painel (E).
export class FuelGenerator extends Generator {
  constructor(...a) {
    super(...a);
    this.on = true;
    this.burn = 0;
    this.burning = null;
    this.inCap = 200;
  }
  get fuels() { return FUELS[this.type] || {}; }
  get hasOutput() { return false; }
  get inputSides() { return [1, 2, 3]; }
  canAccept(type, travelDir) { return !!this.fuels[type] && !this.fromFront(travelDir) && this.invCount() < this.inCap; }
  accept(type, travelDir, mesh) { releaseItemMesh(mesh); this.addInv(type); }
  insertFromPlayer(item, n) { if (!this.fuels[item]) return 0; return super.insertFromPlayer(item, n); }
  powerOutput() { return this.on && this.burn > 0 ? MACHINES[this.type].gera : 0; }
  get producing() { return this.powerOutput() > 0; }
  fuelCount() { return Object.entries(this.inv).reduce((a, [k, n]) => a + (this.fuels[k] ? n : 0), 0); }
  powerNote() { return `${this.fuelCount()} de combustível${this.on ? '' : ' · desligado'}`; }
  update(dt) {
    if (this.on) {
      // só queima quando alguém está usando a energia
      const using = !this.net || this.net.demand > 0;
      if (using) this.burn -= dt;
      if (this.burn <= 0) {
        const k = Object.keys(this.fuels).find((f) => (this.inv[f] || 0) > 0);
        if (k) { this.takeInv(k); this.burn += this.fuels[k]; this.burning = k; }
      }
      if (this.burn < 0) this.burn = 0;
    }
    const idle = this.on && this.burn > 0 && this.net && this.net.demand <= 0;
    this.status = !this.on ? 'Desligado' : idle ? 'Pronto · nada ligado no cabo ainda' : this.burn > 0 ? `Queimando ${itemName(this.burning)}` : 'Sem combustível! Coloque biomassa, madeira ou folhas (E)';
    this.animate(dt);
    this.animateFire(dt, this.on && this.burn > 0 && !idle);
    this.animateParts?.(dt, this.on && this.burn > 0 && !idle);
  }
  // 3.0: boca de fogo acesa, pilha de combustível no funil e fumaça na chaminé
  animateFire(dt, burning) {
    if (!this.fireMesh) {
      this.fireMesh = this.obj.getObjectByName('fire') || false;
      if (this.fireMesh) this.fireMesh.material = this.fireMesh.material.clone();
      this.pile = this.obj.getObjectByName('fuelpile') || false;
      this.chimney = this.obj.getObjectByName('chimneyTop') || null;
      this.smokeT = 0;
    }
    this.fireT = (this.fireT || 0) + dt;
    const t = this.fireT;
    if (this.fireMesh) {
      const target = burning ? 2.2 + Math.sin(t * 13) * 0.35 + Math.sin(t * 7.3) * 0.3 : (this.burn > 0 ? 0.6 : 0.03);
      this.fireMesh.material.emissiveIntensity += (target - this.fireMesh.material.emissiveIntensity) * Math.min(1, dt * 8);
    }
    if (this.pile) {
      const k = Math.min(1, this.fuelCount() / 60);
      if (this.pile.userData.y0 == null) this.pile.userData.y0 = this.pile.position.y;
      this.pile.visible = k > 0;
      this.pile.position.y = this.pile.userData.y0 - 0.12 + k * 0.2;
      this.pile.scale.set(0.55 + k * 0.45, 1, 0.55 + k * 0.45);
    }
    if (burning && this.chimney && this.obj.visible) {
      this.smokeT -= dt;
      if (this.smokeT <= 0) {
        this.smokeT = 0.35 + Math.random() * 0.25;
        const p = this.chimney.getWorldPosition(new THREE.Vector3());
        puff(p, { color: 0x8a8a90, count: 1, size: 0.35, up: 1.4, spread: 0.12, life: 2.2, opacity: 0.45, grow: 3 });
      }
    }
  }
  api() {
    return {
      producao: { fn: () => this.powerOutput(), doc: 'Quanto ⚡ está gerando agora' },
      consumo: { fn: () => (this.net ? this.net.demand : 0), doc: 'Quanto ⚡ a rede está usando' },
      combustivel: { fn: () => this.fuelCount(), doc: 'Quanto combustível tem guardado' },
      ligar: { fn: () => { this.on = true; return null; }, doc: 'Liga (volta a queimar)' },
      desligar: { fn: () => { this.on = false; return null; }, doc: 'Desliga (economiza combustível)' },
      ligado: { fn: () => this.on, doc: 'True se está ligado' },
    };
  }
  infoLines() { return [`Status: ${this.status}`, `Combustível: ${this.fuelCount()}/${this.inCap}`, powerText2(this)]; }
  serialize() { return { ...super.serialize(), on: this.on, burn: this.burn, burning: this.burning }; }
  load(d) { super.load(d); this.on = d.on !== false; this.burn = d.burn || 0; this.burning = d.burning || null; }
}
export const CoalGenerator = FuelGenerator;
const powerText2 = (e) => `⚡ Gerando ${Math.round(outputOf(e))}${e.net ? ` · rede usa ${e.net.demand}/${e.net.supply}` : ''}`;

// ───────────────────────── Painel Solar ─────────────────────────
export class SolarPanel extends Generator {
  powerOutput() {
    const sun = Math.max(game.sunLight ?? 1, (game.auroraK || 0) * 0.25);
    return Math.round(MACHINES[this.type].gera * sun * (game.weatherPower ?? 1) * 10) / 10;
  }
  get producing() { return this.powerOutput() > 0.5; }
  powerNote() { return `${Math.round((game.sunLight ?? 1) * 100)}% de sol`; }
  update(dt) {
    this.status = this.powerOutput() > 0.5 ? 'Recebendo sol ☀️' : 'Noite: sem sol 🌙';
    this.anim += dt;
    this.aimSun(dt);
    const on = this.producing;
    this.lamp.material.color.setHex(on ? 0xffc040 : 0x445566);
    this.lamp.material.emissive.setHex(on ? 0xffa020 : 0x000000);
  }
  infoLines() { return [`Status: ${this.status}`, powerText2(this)]; }
  // a placa vira devagar pro sol (de noite volta pra posição de descanso)
  aimSun(dt) {
    if (this.tilt === undefined) this.tilt = this.model.getObjectByName('tilt') || null;
    if (!this.tilt) return;
    const d = game.sunDir;
    let yaw = 0, pitch = 0.15;
    if (d && (game.sunLight ?? 1) > 0.05) {
      const loc = d.clone().applyQuaternion(this.obj.quaternion.clone().invert());
      yaw = Math.atan2(loc.x, loc.z);
      pitch = Math.min(1.3, Math.PI / 2 - Math.atan2(loc.y, Math.hypot(loc.x, loc.z)));
    }
    const k = Math.min(1, dt * 0.8);
    this.tYaw = (this.tYaw ?? yaw) + (yaw - (this.tYaw ?? yaw)) * k;
    this.tPitch = (this.tPitch ?? pitch) + (pitch - (this.tPitch ?? pitch)) * k;
    this.tilt.rotation.set(this.tPitch, this.tYaw, 0, 'YXZ');
  }
}

Object.assign(ENTITY_CLASSES, {
  laboratorio: Lab, doca_drones: DroneDock, lampada: Lamp, tela: Display, altofalante: Speaker,
  sensor: SensorBelt, divisor: Splitter, juntador: Merger, esteira_alta: ElevatedBelt,
  plataforma: Platform, rampa_sobe: RampUp, rampa_desce: RampDown, lixeira: Trash, gerador_carvao: FuelGenerator, gerador: FuelGenerator, painel_solar: SolarPanel,
});

// timers genéricos (alto-falante)
export function updateTimers() {
  const t = game.timers;
  if (!t) return;
  for (let i = t.length - 1; i >= 0; i--) if (game.time >= t[i].until) { t[i].b.resolve(null); t.splice(i, 1); }
}
export function updateDrones(dt) { for (const d of game.drones || []) d.update(dt); }
void TECHS; void PHASES; void DIRS; void floatText;
