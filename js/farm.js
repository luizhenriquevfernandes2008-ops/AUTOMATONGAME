// Horta: canteiro (planta, cresce com água e luz, colhe), irrigador e depósito de materiais.
import * as THREE from 'three';
import { Machine, ENTITY_CLASSES, itemName } from './machines.js';
import { JiboiaError, JDict, suggest } from './lang/jiboia.js';
import { CROPS, ITEMS, MATERIALS, CELL } from './data.js';
import { cloneModel } from './assets.js';
import { PAL } from './palette.js';
import { game } from './state.js';
import { audio } from './audio.js';
import { puff, floatText } from './fx.js';
import { ceilingAt } from './structures.js';

const DRY_TIME = 240; // segundos pra terra secar totalmente
const MATERIAL_ITEMS = new Set(Object.values(MATERIALS).map((m) => m.item));

// ───────────────────────── Canteiro ─────────────────────────
export class Plot extends Machine {
  constructor(...a) {
    super(...a);
    this.crop = null;
    this.growth = 0;
    this.water = 0.6;
    this.replant = true;
    this.plants = [];
    this.stageKey = null;
    this.sparkT = 0;
    // terra: materiais próprios pra escurecer quando está molhada
    this.dirtMats = [];
    this.model.traverse((o) => {
      if (o.isMesh) { o.material = o.material.clone(); this.dirtMats.push({ m: o.material, base: o.material.color.clone() }); }
    });
    this.label.position.y = 1.5;
    this.lamp.position.y = 0.25;
    this.lamp.position.x = CELL * 0.42;
  }
  get hasOutput() { return true; }
  canAccept() { return false; }
  get ready() { return !!this.crop && this.growth >= 1; }
  // estufa = teto de vidro em cima; outro teto = sombra
  get roof() { const c = ceilingAt(this.x, this.z); return c ? (MATERIALS[c.mat].vidro ? 'estufa' : 'sombra') : null; }
  get lightFactor() {
    const r = this.roof;
    if (r === 'estufa') return 1.5;
    if (r === 'sombra') return 0.3;
    return game.isNight ? 0.5 : 1;
  }
  growRate() {
    if (!this.crop) return 0;
    const wet = this.water > 0.02 ? 1 : 0.1;
    return wet * this.lightFactor * (1 + this.decorVel) * game.economy.farmMul;
  }
  secondsLeft() {
    const r = this.growRate();
    if (!this.crop || this.ready || r <= 0) return 0;
    return ((1 - this.growth) * CROPS[this.crop].tempo) / r;
  }

  plant(crop, silent) {
    const c = CROPS[crop];
    if (!c) return false;
    if (!game.economy.spend(c.semente)) { if (!silent) game.ui?.toast(`Semente de ${c.nome} custa $ ${c.semente}`, 'warn'); return false; }
    this.crop = crop;
    this.growth = 0;
    this.refreshPlants();
    audio.play('plant', { pos: this.pos, volume: 0.5 });
    puff(new THREE.Vector3(this.pos.x, this.pos.y + 0.3, this.pos.z), { color: 0x8a6a44, count: 6, size: 0.3, up: 0.5, spread: 1 });
    return true;
  }
  waterNow(source = 'regador') {
    this.water = 1;
    this.refreshDirt();
    if (source === 'regador') audio.play('water', { pos: this.pos, volume: 0.5 });
    puff(new THREE.Vector3(this.pos.x, this.pos.y + 0.5, this.pos.z), { color: 0x9fd8ff, count: 8, size: 0.16, up: 0.6, gravity: 3, spread: 1.1, life: 0.7 });
  }
  // colhe: itens vão pra saída (seta laranja). byWho = 'jogador' | 'oopi' | 'codigo'
  harvest() {
    if (!this.ready) return null;
    const c = CROPS[this.crop];
    if (this.out.length + c.qtd > this.outCap) return null;
    for (let i = 0; i < c.qtd; i++) this.out.push(c.item);
    game.economy.produced(c.item, c.qtd);
    const st = game.economy.stats;
    st.harvested = (st.harvested || 0) + c.qtd;
    if (this.roof === 'estufa') st.greenhouse = true;
    audio.play('harvest', { pos: this.pos, volume: 0.6 });
    floatText(new THREE.Vector3(this.pos.x, this.pos.y + 1.6, this.pos.z), `${c.icone} +${c.qtd}`, '#b8f5c8');
    puff(new THREE.Vector3(this.pos.x, this.pos.y + 0.8, this.pos.z), { color: 0xc8ff8a, count: 10, size: 0.14, up: 1.4, gravity: 3, additive: true, life: 0.8 });
    const crop = this.crop;
    this.crop = null;
    this.growth = 0;
    if (this.replant) this.plant(crop, true);
    this.refreshPlants();
    return c.item;
  }

  refreshPlants() {
    let key = null;
    if (this.crop) {
      const st = CROPS[this.crop].estagios;
      const i = this.growth >= 1 ? st.length - 1 : Math.min(st.length - 2, Math.floor(this.growth * (st.length - 1)));
      key = st[Math.max(0, i)];
    }
    if (key === this.stageKey) return;
    this.stageKey = key;
    for (const p of this.plants) this.obj.remove(p);
    this.plants = [];
    if (!key) return;
    for (const x of [-0.36, 0.36]) {
      const m = cloneModel(key);
      m.position.set(x * CELL, 0.05, 0.02);
      m.rotation.y = Math.random() * Math.PI * 2;
      m.traverse((o) => { if (o.isMesh) o.userData.entity = this; });
      this.obj.add(m);
      this.plants.push(m);
    }
  }
  refreshDirt() {
    const k = 1 - this.water * 0.45;
    for (const d of this.dirtMats) d.m.color.copy(d.base).multiplyScalar(k);
  }

  update(dt) {
    // chuva molha (se não tiver teto em cima)
    if ((game.sky?.rainK || 0) > 0.5 && !this.roof) this.water = 1;
    const was = this.water;
    this.water = Math.max(0, this.water - dt / DRY_TIME);
    if (Math.abs(was - this.water) > 0 || !this.dirtT) { this.dirtT = (this.dirtT || 0) - dt; if (this.dirtT <= 0) { this.dirtT = 1; this.refreshDirt(); } }
    if (this.crop && this.growth < 1) {
      this.growth = Math.min(1, this.growth + (dt / CROPS[this.crop].tempo) * this.growRate());
      this.refreshPlants();
    }
    super.update(dt);
    this.status = !this.crop ? 'Vazio: escolha o que plantar (E)' : this.ready ? `${CROPS[this.crop].nome} pronto pra colher!` : this.water <= 0.02 ? 'Seco! Precisa de água 💧' : `Crescendo ${Math.floor(this.growth * 100)}%`;
    if (this.ready) {
      this.sparkT -= dt;
      if (this.sparkT <= 0) { this.sparkT = 1.2; puff(new THREE.Vector3(this.pos.x, this.pos.y + 1.0, this.pos.z), { color: 0xfff08a, count: 2, size: 0.12, up: 0.6, additive: true, spread: 1, life: 1 }); }
    }
  }
  animate(dt) {
    this.anim += dt;
    const col = this.ready ? PAL.work : this.crop && this.water <= 0.02 ? PAL.bad : this.crop ? PAL.out : PAL.idle;
    this.lamp.material.color.setHex(col);
    this.lamp.material.emissive.setHex(col);
    this.lamp.material.emissiveIntensity = this.ready ? 1 + Math.sin(this.anim * 5) * 0.4 : 0.5;
    for (const p of this.plants) p.rotation.z = Math.sin(this.anim * 1.3 + p.position.x) * 0.03;
  }

  checkCrop(c) {
    if (typeof c !== 'string' || !CROPS[c]) {
      const s = suggest(String(c), Object.keys(CROPS));
      throw new JiboiaError(`Não sei plantar "${c}"` + (s ? `. Você quis dizer "${s}"?` : `. Dá pra plantar: ${Object.keys(CROPS).join(', ')}`));
    }
  }
  api() {
    return {
      ...super.api(),
      plantar: {
        min: 1, max: 1, doc: 'Planta uma semente: "cafe", "milho", "cenoura", "abobora", "melancia" ou "bambu"',
        fn: ([c]) => {
          this.checkCrop(c);
          return this.request({
            label: 'Plantando', dur: 1,
            check: () => {
              if (this.crop) return 'Já tem planta: colha antes';
              if (game.economy.money < CROPS[c].semente) throw new JiboiaError(`Sem dinheiro pra semente de ${CROPS[c].nome} ($ ${CROPS[c].semente})`);
              return null;
            },
            finish: () => this.plant(c, true),
          });
        },
      },
      colher: {
        doc: 'Espera ficar pronta e colhe. A colheita sai pela seta laranja. Retorna o item.',
        fn: () => this.request({
          label: 'Esperando crescer', counts: 'item',
          check: () => {
            if (!this.crop) throw new JiboiaError(`O canteiro '${this.name}' está vazio. Use .plantar("cafe") antes`);
            if (!this.ready) return `Crescendo ${Math.floor(this.growth * 100)}%`;
            if (this.out.length + CROPS[this.crop].qtd > this.outCap) return 'Saída cheia';
            return null;
          },
          dur: 0.6,
          finish: () => this.harvest(),
        }),
      },
      pronta: { fn: () => this.ready, doc: 'True se já dá pra colher' },
      crescimento: { fn: () => Math.round(this.growth * 100) / 100, doc: 'De 0 (plantou agora) até 1 (pronta)' },
      umidade: { fn: () => Math.round(this.water * 100) / 100, doc: 'Água na terra: 0 seco, 1 encharcado' },
      planta: { fn: () => this.crop, doc: 'O que está plantado (ou None)' },
      replantar: { min: 1, max: 1, fn: ([v]) => { this.replant = !!v; return null; }, doc: 'True = planta de novo sozinho depois de colher' },
    };
  }
  panelActions() {
    const acts = [];
    if (!this.crop) {
      for (const [k, c] of Object.entries(CROPS)) acts.push({ label: `${c.icone} ${c.nome} ($ ${c.semente})`, fn: () => this.plant(k), disabled: game.economy.money < c.semente });
    } else {
      acts.push({ label: '💧 Regar', fn: () => this.waterNow(), disabled: this.water > 0.95 });
      acts.push({ label: this.ready ? '🧺 Colher' : `🧺 Colher (${Math.floor(this.growth * 100)}%)`, fn: () => { if (!this.harvest()) game.ui.toast('Saída cheia! Ligue uma esteira na seta laranja', 'warn'); }, disabled: !this.ready, primary: this.ready });
      acts.push({ label: this.replant ? '🔁 Replantar: sim' : '🔁 Replantar: não', fn: () => { this.replant = !this.replant; } });
      acts.push({ label: '🗑️ Arrancar', fn: () => { this.crop = null; this.growth = 0; this.refreshPlants(); } });
    }
    return acts;
  }
  infoLines() {
    const l = [`Status: ${this.status}`];
    if (this.crop) {
      const c = CROPS[this.crop];
      l.push(`Planta: ${c.icone} ${c.nome} · colheita: ${c.qtd}× ${itemName(c.item)}`);
      if (!this.ready) { const s = this.secondsLeft(); l.push(`Pronta em ~${s > 0 ? Math.ceil(s / 60) + ' min' : '—'}`); }
    }
    l.push(`Água: ${Math.round(this.water * 100)}% ${this.water <= 0.02 ? '(seco! quase não cresce)' : ''}`);
    const r = this.roof;
    l.push(r === 'estufa' ? 'Luz: 🪴 estufa (teto de vidro): +50% e cresce à noite, mas a chuva não molha' : r === 'sombra' ? 'Luz: ☁️ teto fechado em cima: cresce bem devagar' : game.isNight ? 'Luz: 🌙 noite (metade da velocidade)' : 'Luz: ☀️ sol');
    if (this.out.length) l.push(`Saída: ${this.out.length}× ${itemName(this.out[0])}`);
    return l;
  }
  serialize() { return { ...super.serialize(), crop: this.crop, growth: this.growth, water: this.water, replant: this.replant }; }
  load(d) {
    super.load(d);
    this.crop = CROPS[d.crop] ? d.crop : null;
    this.growth = d.growth || 0;
    this.water = d.water ?? 0.6;
    this.replant = d.replant !== false;
    this.refreshPlants();
    this.refreshDirt();
  }
}

// ───────────────────────── Irrigador ─────────────────────────
export class Sprinkler extends Machine {
  constructor(...a) { super(...a); this.on = true; this.t = 2; this.spray = 0; }
  plotsAround() {
    return game.entities.filter((e) => e.type === 'canteiro' && Math.abs(e.x - this.x) <= 2 && Math.abs(e.z - this.z) <= 2);
  }
  sprayNow() {
    const ps = this.plotsAround();
    for (const p of ps) p.waterNow('irrigador');
    this.spray = 1.2;
    audio.play('water', { pos: this.pos, volume: 0.3, rate: 0.9 });
    return ps.length;
  }
  update(dt) {
    super.update(dt);
    if (this.on && !this.noPower) {
      this.t -= dt;
      if (this.t <= 0) {
        this.t = 6;
        if (this.plotsAround().some((p) => p.water < 0.6)) this.sprayNow();
      }
    }
    if (this.spray > 0) {
      this.spray -= dt;
      if (Math.random() < dt * 30) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * 2.6;
        puff(new THREE.Vector3(this.pos.x + Math.cos(a) * r, this.pos.y + 0.9, this.pos.z + Math.sin(a) * r), { color: 0xaee0ff, count: 1, size: 0.12, up: 0.4, gravity: 4, spread: 0.2, life: 0.6, opacity: 0.8 });
      }
    }
    if (!this.job && !this.queue.length) this.status = this.noPower ? 'Sem energia ⚡' : this.on ? `Ligado · ${this.plotsAround().length} canteiro(s) perto` : 'Desligado';
  }
  api() {
    return {
      ...super.api(),
      regar: { doc: 'Rega agora todos os canteiros em volta (2 células). Retorna quantos regou.', fn: () => this.request({ label: 'Regando', dur: 1.5, finish: () => this.sprayNow() }) },
      ligar: { fn: () => { this.on = true; return null; }, doc: 'Rega sozinho quando a terra secar' },
      desligar: { fn: () => { this.on = false; return null; }, doc: 'Para de regar sozinho' },
      ligado: { fn: () => this.on, doc: 'True se está regando sozinho' },
    };
  }
  panelActions() {
    return [
      { label: '💧 Regar agora', fn: () => this.sprayNow(), disabled: this.noPower },
      { label: this.on ? '⏸ Desligar automático' : '▶ Ligar automático', fn: () => { this.on = !this.on; } },
    ];
  }
  serialize() { return { ...super.serialize(), on: this.on }; }
  load(d) { super.load(d); this.on = d.on !== false; }
}

// ───────────────────────── Depósito de Materiais ─────────────────────────
export class MaterialDepot extends Machine {
  get inputSides() { return [0, 1, 2, 3]; }
  canAccept(type) { return MATERIAL_ITEMS.has(type); }
  accept(type, travelDir, mesh) {
    super.accept(type, travelDir, mesh);
    delete this.inv[type];
    const st = game.economy.materials;
    st[type] = (st[type] || 0) + 1;
    game.economy.stats.depot = (game.economy.stats.depot || 0) + 1;
    this.bump = 0.2;
    game.emit('materials');
  }
  update(dt) {
    super.update(dt);
    this.status = 'Guardando materiais pra construção 🧱';
    if (this.bump > 0) { this.bump -= dt; const k = 1 + Math.sin(this.bump * 30) * this.bump * 0.2; this.model.scale.set(k, 1 / k, k); }
  }
  api() {
    return {
      estoque: { fn: () => new JDict(Object.entries(game.economy.materials)), doc: 'Quanto material de construção você tem' },
    };
  }
  infoLines() {
    const st = game.economy.materials;
    return ['Aceita: ' + [...MATERIAL_ITEMS].map((k) => ITEMS[k].nome).join(', '),
      'Estoque 🧱: ' + Object.values(MATERIALS).map((m) => `${m.nome} ${st[m.item] || 0}`).join(' · ')];
  }
}

Object.assign(ENTITY_CLASSES, { canteiro: Plot, irrigador: Sprinkler, deposito: MaterialDepot });
