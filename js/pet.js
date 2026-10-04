// TÊTÊ: o bichinho de KX-7 (cara de pug, mas de outro planeta). Anda por perto, mas na dele:
// fareja as coisas, senta, deita, brinca sozinho e olha em volta; não fica te encarando.
// Ganha carinho, comemora recordes e faz tarefinhas: colher a horta, buscar meteoritos e levar itens.
// (Por dentro ainda se chama "pet"/"oopi" nos saves e no código antigo: maquina("oopi") continua valendo.)
import * as THREE from 'three';
import { groundAt } from './player.js';
import { game } from './state.js';
import { cloneModel } from './assets.js';
import { buildTete } from './tete.js';
import { audio } from './audio.js';
import { puff } from './fx.js';
import { findByName, itemName } from './machines.js';
import { takeFrom } from './machines2.js';
import { takeItemMesh, releaseItemMesh } from './itemMeshes.js';
import { collectPickup } from './events.js';
import { OOPI_HATS, OOPI_COLORS, FRIEND_PERKS } from './data.js';
import { crateHint } from './disks.js';
import { Blocking, JiboiaError, suggest } from './lang/jiboia.js';
import { CELL, ITEMS } from './data.js';

const IDLE_LINES = [
  'Arf! 🐾', '*funga funga* 👃', 'Ronc… ronc… 💤', '*espirra* 🤧', '(olha pras estrelas) ✨', 'Arf arf! 💜',
  '*abana o rabinho*', '(cheirou uma flor e gostou) 🌸', 'Bufff 😤', '(ouviu um barulho lá longe) 👂',
  'Júpiter! Júpiter! 🪐', '*rola na grama*',
];
// segue de longe: só vem quando você passa de FAR e para a uns NEAR de você
const NEAR = 3.2, FAR = 7, SPEED = 4.2;

export class Pet {
  constructor() {
    this.obj = new THREE.Group();
    const { root, parts } = buildTete();
    this.body = root;
    this.parts = parts;
    this.obj.add(root);
    this.idle = { kind: 'parado', t: 2, goal: null, headYaw: 0 };
    this.pose = 0;            // 0 em pé · 1 sentado · 2 deitado (vai suavizando)
    this.poseK = 0;
    this.wag = 0;
    this.obj.traverse((o) => { o.userData.pet = true; });
    this.obj.userData.pet = true;
    this.p = new THREE.Vector3();
    this.hop = 0;
    this.spin = 0;
    this.t = 0;
    this.talkT = 25;
    this.bubble = null;
    this.bubbleT = 0;
    this.hearts = 0;
    this.mode = 'seguir';     // seguir | ficar
    this.task = null;         // tarefa atual
    this.cargo = null;        // item carregado
    this.mood = 0.6;          // 0..1 (carinho sobe, o tempo baixa devagar)
    this.home = new THREE.Vector3();
    this.hatObj = null;
    this.origMats = new Map();
    this.body.traverse((o) => { if (o.isMesh && o.material.userData.tint) this.origMats.set(o, o.material); });
    this.lastPetT = -99;
    // programável: maquina("oopi")
    this.name = 'tete';
    this.type = 'oopi';
    this.removed = false;
    this.cmd = null;      // ordem de um programa: { pos, b }
    this.acts = [];       // ações curtas esperando terminar: { until, b, v }
    this.autoT = 5;
    game.scene.add(this.obj);
    const cam = game.camera.position;
    this.p.set(cam.x + 1.5, 0, cam.z + 1);
    game.on('sold', (v) => { if (v >= 20 && Math.random() < 0.3) this.say(`Uhul! +$ ${v} 💰`); });
    game.on('levelup', (l) => { this.say(`Nível ${l}!!! Você é demais ✨`, 5); this.celebrate(); });
    game.on('tech', () => this.say('Pesquisa nova! Vamos testar? 🔬', 5));
    game.on('phaseDone', (n) => { this.say(`Fase ${n} do foguete pronta! 🚀`, 5); this.celebrate(); });
    game.on('weather', (w) => { if (w === 'chuva') this.say('Olha a chuva! 🌧️ Rega a horta de graça.'); });
    game.on('computerError', (pc) => { if (Math.random() < 0.6) this.say(`Ih, o ${pc.name} deu erro na linha ${pc.errorLine} 😬`); });
    game.on('record', (r) => { this.say(`🏆 Recorde! ${r.texto}`, 6); this.celebrate(); });
    game.on('contractDone', (o) => { this.say(`${o.icone} Contrato entregue! Bora pro próximo? 📋`, 5); this.celebrate(); });
    game.on('missionDone', () => { this.say('Mais um satélite lá em cima! 🛰️✨', 6); this.celebrate(); });
    game.on('challenge', () => { if (Math.random() < 0.7) this.say('Que código lindo! 🧩', 4); });
    game.on('disk', (from) => { if (from !== 'correio') this.say('Um disco de dados! Vamos analisar no laboratório? 💾', 5); });
    game.on('evento_mundo', (t) => {
      if (t === 'feira') this.say('Dia de feira! 🎪 Bora vender caro!', 5);
      if (t === 'aurora') this.say('Que lindo… 🌌', 5);
      if (t === 'arcoiris') this.say('Arco-íris! 🌈', 4);
    });
  }
  setVisible(v) { this.obj.visible = v; if (!v && this.bubble) this.bubble.visible = false; if (!v) { this.cancelTask(); if (this.cmd) this.cmd.b.fail('O TÊTÊ foi desligado'); this.cmd = null; } }
  get pos() { return this.p; }
  say(text, secs = 4) {
    if (!this.obj.visible) return;
    if (!this.bubble) {
      const c = document.createElement('canvas');
      c.width = 512; c.height = 96;
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      this.bubble = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false }));
      this.bubble.renderOrder = 998;
      this.bubble.scale.set(2.6, 0.49, 1);
      game.scene.add(this.bubble);
    }
    const c = this.bubble.material.map.image;
    const g = c.getContext('2d');
    g.clearRect(0, 0, 512, 96);
    g.font = '800 28px "Big Shoulders Display", sans-serif';
    const w = Math.min(500, g.measureText(text).width + 40);
    g.fillStyle = 'rgba(12,17,25,0.9)';
    g.beginPath(); g.roundRect(256 - w / 2, 8, w, 64, 14); g.fill();
    g.strokeStyle = '#ffb020'; g.lineWidth = 3; g.stroke();
    g.beginPath(); g.moveTo(246, 72); g.lineTo(256, 90); g.lineTo(266, 72); g.fillStyle = 'rgba(12,17,25,0.9)'; g.fill();
    g.fillStyle = '#ece5d5'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 256, 41);
    this.bubble.material.map.needsUpdate = true;
    this.bubble.visible = true;
    this.bubbleT = secs;
    audio.play('beep', { pos: this.p, volume: 0.25, rate: 1.6 });
  }
  pet() {
    this.hearts = 1.5;
    this.hop = 0.35;
    this.mood = Math.min(1, this.mood + 0.15);
    game.economy.stats.pets = (game.economy.stats.pets || 0) + 1;
    if (game.time - this.lastPetT > 20) { this.lastPetT = game.time; this.addFriend(1); }
    puff(new THREE.Vector3(this.p.x, this.obj.position.y + 0.7, this.p.z), { color: 0xff6ec7, count: 8, size: 0.2, up: 1.4, additive: true, spread: 0.6, life: 1.2 });
    this.wag = 3;
    this.idle = { kind: 'parado', t: 2.5, goal: null, headYaw: 0 };
    const lines = this.mood > 0.9 ? ['Arf arf arf!!! 💜💜', '*deita de barriga pra cima* 🥰', '*lambeijo* ❤️'] : ['*fecha os olhinhos* 💜', 'Arf! ❤️', '*abana o rabinho todo*', '*funga feliz* 💜'];
    this.say(lines[Math.floor(Math.random() * lines.length)]);
  }
  // ─── amizade (carinho +1 a cada 20 s, tarefa +3) ───
  addFriend(n) {
    const eco = game.economy;
    const before = eco.friendLevel;
    eco.oopi.friend += n;
    const after = eco.friendLevel;
    if (after > before) {
      if (after === 2) this.giveHat('flor');
      if (after === 4) this.giveHat('coroa');
      this.say(`Amizade nível ${after}! 💞`, 6);
      this.celebrate();
      game.ui?.banner(`💞 Amizade com o TÊTÊ: nível ${after}`, 'Vocês estão cada vez mais amigos!', [FRIEND_PERKS[after - 1]]);
    }
  }
  giveHat(k) {
    const o = game.economy.oopi;
    if (!o.hats.includes(k)) o.hats.push(k);
    o.hat = k;
    this.applyLook();
  }
  // chapéu e cor (loja de fichas)
  applyLook() {
    const o = game.economy?.oopi;
    if (!o) return;
    if (this.hatObj) { this.hatObj.parent?.remove(this.hatObj); this.hatObj = null; }
    const H = o.hat && OOPI_HATS[o.hat];
    if (H) {
      const h = cloneModel(H.model);
      h.scale.multiplyScalar(H.model === 'cog' ? 0.5 : 0.65);
      h.position.y = (H.y || 0) * 0.65;
      this.parts.hatSpot.add(h);
      this.hatObj = h;
    }
    this.parts.antennae.visible = !H; // de chapéu, as anteninhas ficam escondidas
    const C = OOPI_COLORS[o.color] || OOPI_COLORS.padrao;
    for (const [mesh, mat] of this.origMats) {
      if (C.cor == null) mesh.material = mat;
      else { const m = mat.clone(); m.color = new THREE.Color(mat.color).lerp(new THREE.Color(C.cor), 0.65); mesh.material = m; }
    }
  }
  // pulinho + giro + confete
  celebrate() {
    this.hop = 0.35;
    this.spin = 1;
    this.wag = 3;
    this.mood = Math.min(1, this.mood + 0.05);
    audio.play('record', { pos: this.p, volume: 0.5 });
    const cols = [0xffd35a, 0xff6ec7, 0x5dff8a, 0x7fb2ff];
    for (const c of cols) puff(new THREE.Vector3(this.p.x, this.obj.position.y + 0.7, this.p.z), { color: c, count: 5, size: 0.14, up: 2.2, gravity: 4, additive: true, spread: 0.8, life: 1.1 });
  }
  get moodText() {
    return this.mood > 0.85 ? 'radiante 🤩' : this.mood > 0.6 ? 'feliz 😊' : this.mood > 0.35 ? 'de boa 🙂' : 'carente 🥺 (faça carinho!)';
  }

  // ─── tarefas ───
  setMode(m) {
    this.mode = m;
    if (m === 'ficar') this.home.copy(this.p);
    this.say(m === 'ficar' ? '*senta e espera* 🐾' : 'Arf! *vem trotando* 🐾');
  }
  cancelTask() {
    if (this.cargo) { releaseItemMesh(this.cargo.mesh); this.cargo = null; }
    this.task = null;
  }
  startTask(t) {
    this.cancelTask();
    this.task = { ...t, step: 0, wait: 0, done: 0 };
    game.economy.stats.oopiTasks = (game.economy.stats.oopiTasks || 0) + 1;
    const msg = { colher: 'Arf! *corre pra horta* 🧺', meteoritos: '*fareja as pedrinhas brilhantes* ☄️', buscar: `Arf! Vou buscar ${t.item ? itemName(t.item) : 'itens'} no ${t.from} 📦` }[t.tipo];
    this.say(msg, 4);
  }
  // próximo alvo da tarefa (ou null quando acabou)
  taskTarget() {
    const t = this.task;
    if (t.tipo === 'colher') {
      const ripe = game.entities.filter((e) => e.type === 'canteiro' && e.ready && e.out.length + 3 <= e.outCap);
      if (!ripe.length) return null;
      ripe.sort((a, b) => a.pos.distanceToSquared(this.p) - b.pos.distanceToSquared(this.p));
      return { pos: ripe[0].pos, act: () => { if (ripe[0].harvest()) t.done++; } };
    }
    if (t.tipo === 'meteoritos') {
      const ps = game.events?.pickups || [];
      if (!ps.length) return null;
      const p = [...ps].sort((a, b) => Math.hypot(a.x - this.p.x, a.z - this.p.z) - Math.hypot(b.x - this.p.x, b.z - this.p.z))[0];
      return { pos: new THREE.Vector3(p.x, 0, p.z), act: () => { collectPickup(p, 'oopi'); t.done++; } };
    }
    if (t.tipo === 'buscar') {
      const from = findByName(t.from), to = findByName(t.to);
      if (!from || !to) { this.say('Não achei essas máquinas 🤔'); return null; }
      if (!this.cargo) {
        if (t.done >= t.n) return null;
        return {
          pos: from.pos, act: () => {
            const got = takeFrom(from, t.item || null);
            if (!got) { this.say(`O ${t.from} não tem ${t.item ? itemName(t.item) : 'nada'} 😕`); t.done = t.n; return; }
            const mesh = got.mesh || takeItemMesh(got.type);
            if (mesh.parent !== game.scene) game.scene.add(mesh);
            this.cargo = { type: got.type, mesh };
          },
        };
      }
      return {
        pos: to.pos, act: () => {
          if (to.canAccept && to.canAccept(this.cargo.type, -1)) {
            to.accept(this.cargo.type, -1, this.cargo.mesh);
            this.cargo = null;
            t.done++;
            audio.play('drop', { pos: this.p, volume: 0.4 });
          } else { this.say(`O ${t.to} não quis ${itemName(this.cargo.type)} agora 😕`); t.wait = 3; }
        },
      };
    }
    return null;
  }
  finishTask() {
    const t = this.task;
    const msg = t.tipo === 'colher' ? (t.done ? `Colhi ${t.done} canteiro(s)! 🌽` : 'Nada pronto pra colher ainda 🌱')
      : t.tipo === 'meteoritos' ? (t.done ? `Peguei ${t.done} fragmento(s)! ✨` : 'Não tem pedrinha nenhuma por aí')
        : t.done ? `Entreguei ${t.done} item(ns) 📦` : 'Não consegui buscar 😕';
    this.say(msg, 4);
    if (t.done) { this.mood = Math.min(1, this.mood + 0.05); if (!t.auto) this.addFriend(3); }
    this.cancelTask();
  }

  update(dt) {
    if (!this.obj.visible) return;
    this.t += dt;
    this.mood = Math.max(0.1, this.mood - dt / 1800);
    const cam = game.camera.position;
    let goal = null;
    // ações curtas de programas terminando
    for (let i = this.acts.length - 1; i >= 0; i--) if (game.time >= this.acts[i].until) { this.acts[i].b.resolve(this.acts[i].v); this.acts.splice(i, 1); }
    // ordem de um programa (maquina("tete").ir_para(...)) tem prioridade
    if (this.cmd) {
      if (this.cmd.b.cancelled || this.cmd.b.done) this.cmd = null;
      else {
        goal = this.cmd.pos;
        if (Math.hypot(goal.x - this.p.x, goal.z - this.p.z) < 0.35) { this.cmd.b.resolve(true); this.cmd = null; this.hop = 0.2; }
      }
    }
    // tarefa?
    if (this.task && !goal) {
      if (this.task.wait > 0) this.task.wait -= dt;
      else {
        const tg = this.taskTarget();
        if (!tg) this.finishTask();
        else {
          goal = tg.pos;
          if (Math.hypot(tg.pos.x - this.p.x, tg.pos.z - this.p.z) < 1.1) { tg.act(); this.task && (this.task.wait = 0.7); this.hop = 0.35; }
        }
      }
    }
    // seguir de longe: só vem quando você se afasta e para a uns 3 m (do lado em que já está)
    let moving = false;
    const stayHome = this.mode === 'ficar' && !this.task;
    const busy = !!goal;
    if (!goal) {
      const anchor = stayHome ? this.home : cam;
      const dx = this.p.x - anchor.x, dz = this.p.z - anchor.z;
      const dist = Math.hypot(dx, dz);
      if (!stayHome && dist > 30) this.p.set(cam.x + 2, 0, cam.z + 2); // ficou muito pra trás: aparece do lado
      else if (dist > (stayHome ? 3 : FAR) || this.chasing) {
        this.chasing = dist > (stayHome ? 1.5 : NEAR);
        const k = (stayHome ? 1 : NEAR) / Math.max(dist, 0.001);
        goal = new THREE.Vector3(anchor.x + dx * k, 0, anchor.z + dz * k);
        this.idle = { kind: 'parado', t: 1 + Math.random() * 2, goal: null, headYaw: 0 };
      }
    }
    // na dele: escolhe sozinho o que fazer (farejar um canto, sentar, deitar, brincar, olhar em volta)
    if (!goal) {
      const I = this.idle;
      I.t -= dt;
      if (I.kind === 'farejar' && I.goal) {
        if (Math.hypot(I.goal.x - this.p.x, I.goal.z - this.p.z) > 0.15) goal = I.goal;
        else I.goal = null;
      }
      if (I.t <= 0) {
        const r = Math.random();
        const sleepy = this.mood < 0.4 || this.idleFor > 40;
        let kind = r < 0.35 ? 'farejar' : r < 0.55 ? 'sentar' : r < 0.7 ? 'olhar' : r < 0.82 ? 'brincar' : 'deitar';
        if (sleepy && Math.random() < 0.5) kind = 'deitar';
        this.idle = { kind, t: kind === 'deitar' ? 10 + Math.random() * 12 : kind === 'brincar' ? 2.2 : 3 + Math.random() * 4, goal: null, headYaw: 0 };
        if (kind === 'farejar') {
          // um ponto aqui perto, sem se afastar demais de você
          const a = Math.random() * Math.PI * 2, d = 1 + Math.random() * 2.2;
          const gx = this.p.x + Math.cos(a) * d, gz = this.p.z + Math.sin(a) * d;
          const anchor = stayHome ? this.home : cam;
          if (Math.hypot(gx - anchor.x, gz - anchor.z) < (stayHome ? 3 : FAR - 0.5)) this.idle.goal = new THREE.Vector3(gx, 0, gz);
        }
        if (kind === 'brincar') { this.spin = 1; this.hop = 0.3; this.wag = 2; }
      }
    }
    this.idleFor = busy || moving || this.chasing ? 0 : (this.idleFor || 0) + dt;
    if (goal) {
      const d = new THREE.Vector3(goal.x - this.p.x, 0, goal.z - this.p.z);
      const dist = d.length();
      if (dist > 0.05) {
        moving = true;
        const calm = this.idle.kind === 'farejar' && !this.task && !this.chasing && !this.cmd;
        const sp = Math.min(this.task || this.chasing ? SPEED * 1.35 : calm ? SPEED * 0.35 : SPEED, dist * 3 + 0.4);
        d.normalize();
        this.p.addScaledVector(d, Math.min(dist, sp * dt));
        this.turnTo(Math.atan2(d.x, d.z), dt * 7);
      }
    }
    this.animateBody(dt, moving);
    if (this.hop > 0) this.hop -= dt;
    if (this.spin > 0) { this.spin -= dt * 0.9; this.body.rotation.y = (1 - Math.max(0, this.spin)) * Math.PI * 2; } else this.body.rotation.y = 0;
    const hopY = this.hop > 0 ? Math.sin((0.35 - this.hop) / 0.35 * Math.PI) * 0.32 : 0;
    this.obj.position.set(this.p.x, groundAt(this.p.x, this.p.z) + hopY, this.p.z);
    if (this.cargo) this.cargo.mesh.position.set(this.p.x, this.obj.position.y + 0.62, this.p.z);
    if (this.hearts > 0) this.hearts -= dt;
    // amizade nível 3: pega sozinho as pedrinhas de meteoro perto
    this.autoT -= dt;
    if (this.autoT <= 0) {
      this.autoT = 8;
      if (!this.task && this.mode === 'seguir' && game.economy.friendLevel >= 3) {
        const near = (game.events?.pickups || []).some((pk) => Math.hypot(pk.x - cam.x, pk.z - cam.z) < 14);
        if (near) { this.task = { tipo: 'meteoritos', step: 0, wait: 0, done: 0, auto: true }; this.say('Deixa que eu pego as pedrinhas! ☄️'); }
      }
    }
    // falas aleatórias
    this.talkT -= dt;
    if (this.talkT <= 0) {
      this.talkT = 45 + Math.random() * 60;
      if (game.mode === 'play' && !this.task) this.say(this.mood < 0.35 ? 'Tô com saudade de um carinho… 🥺' : this.tip());
    }
    if (this.bubble && this.bubble.visible) {
      this.bubbleT -= dt;
      this.bubble.position.set(this.p.x, 1.15 + hopY, this.p.z);
      this.bubble.material.opacity = Math.min(1, this.bubbleT * 2);
      if (this.bubbleT <= 0) this.bubble.visible = false;
    }
  }
  // ─── API da Jiboia: t = maquina("tete") (ou "oopi", dos programas antigos) ───
  obey() {
    if (!this.obj.visible) throw new JiboiaError('O TÊTÊ está desligado nas Configurações');
    if (game.economy.friendLevel < 2) throw new JiboiaError('O TÊTÊ só obedece programas de quem é amigo dele: chegue à amizade nível 2 (carinho e tarefas) 💜');
    game.economy.stats.oopiCmds = (game.economy.stats.oopiCmds || 0) + 1;
    if (this.task) this.cancelTask();
  }
  goTo(pos, label) {
    this.obey();
    if (this.cmd) this.cmd.b.cancelled = true;
    const b = new Blocking();
    b.label = label;
    this.cmd = { pos: new THREE.Vector3(pos.x, 0, pos.z), b };
    return b;
  }
  after(v, secs = 0.45, label = 'TÊTÊ') { const b = new Blocking(); b.label = label; this.acts.push({ until: game.time + secs, b, v }); this.hop = 0.25; return b; }
  // máquina/esteira mais perto do TÊTÊ (até ~2 m)
  nearest(filter) {
    let best = null, bd = 2.1;
    for (const e of game.entities) {
      if (!filter(e)) continue;
      const d = Math.hypot(e.pos.x - this.p.x, e.pos.z - this.p.z);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  api() {
    const target = (nome) => {
      const e = game.entities.find((m) => m.name === nome);
      if (!e) { const s = suggest(String(nome), game.entities.filter((m) => m.name).map((m) => m.name)); throw new JiboiaError(`Não achei a máquina "${nome}"` + (s ? `. Você quis dizer "${s}"?` : '')); }
      // para do lado da máquina que está virado pro TÊTÊ
      const dx = this.p.x - e.pos.x, dz = this.p.z - e.pos.z, d = Math.hypot(dx, dz) || 1;
      return { x: e.pos.x + (dx / d) * CELL * 0.85, z: e.pos.z + (dz / d) * CELL * 0.85 };
    };
    const item = (w, fn) => { if (w != null && !ITEMS[w]) throw new JiboiaError(`${fn}(): o item "${w}" não existe`); return w ?? null; };
    return {
      ir_para: { min: 1, max: 1, doc: 'Anda até ficar do lado de uma máquina: .ir_para("bau1")', fn: ([n]) => this.goTo(target(n), 'TÊTÊ andando') },
      ir: { min: 2, max: 2, doc: 'Anda até a célula (x, z) do mapa', fn: ([x, z]) => { if (typeof x !== 'number' || typeof z !== 'number') throw new JiboiaError('ir(x, z) precisa de dois números'); return this.goTo({ x: (Math.round(x) + 0.5) * CELL, z: (Math.round(z) + 0.5) * CELL }, 'TÊTÊ andando'); } },
      voltar: { doc: 'Volta pra perto de você', fn: () => { const c = game.camera.position; return this.goTo({ x: c.x + 1.2, z: c.z + 1.2 }, 'TÊTÊ voltando'); } },
      pegar: {
        max: 1, doc: 'Pega 1 item da máquina/esteira mais perto dele (do tipo pedido, ou qualquer)',
        fn: (a) => {
          this.obey();
          const want = item(a[0], 'pegar');
          if (this.cargo) throw new JiboiaError('O TÊTÊ já está carregando algo. Use .soltar() antes');
          const e = this.nearest((m) => !!(m.items?.length || m.out?.length || m.held || (m.inv && (m.type === 'bau' || m.type === 'venda'))));
          const got = e && takeFrom(e, want);
          if (!got) return this.after(null);
          const mesh = got.mesh || takeItemMesh(got.type);
          if (mesh.parent !== game.scene) game.scene.add(mesh);
          this.cargo = { type: got.type, mesh };
          return this.after(got.type, 0.45, 'TÊTÊ pegando');
        },
      },
      soltar: {
        doc: 'Entrega o item na máquina mais perto que aceitar. Retorna True/False',
        fn: () => {
          this.obey();
          if (!this.cargo) throw new JiboiaError('O TÊTÊ não está carregando nada');
          const c = this.cargo;
          const e = this.nearest((m) => m.canAccept && m.canAccept(c.type, -1));
          if (!e) return this.after(false);
          this.cargo = null;
          e.accept(c.type, -1, c.mesh);
          audio.play('drop', { pos: this.p, volume: 0.4 });
          return this.after(true, 0.45, 'TÊTÊ soltando');
        },
      },
      colher: {
        doc: 'Colhe o canteiro pronto mais perto dele. Retorna True/False',
        fn: () => { this.obey(); const e = this.nearest((m) => m.type === 'canteiro' && m.ready); return this.after(!!(e && e.harvest()), 0.6, 'TÊTÊ colhendo'); },
      },
      dizer: { min: 1, max: 1, doc: 'Mostra um balãozinho de fala', fn: ([t]) => { this.obey(); this.say(String(t).slice(0, 60), 4); return null; } },
      pular: { doc: 'Comemora (pulinho e confete)', fn: () => { this.obey(); this.celebrate(); return this.after(null, 0.5); } },
      seguir: { doc: 'Volta a te seguir', fn: () => { this.obey(); this.mode = 'seguir'; return null; } },
      ficar: { doc: 'Fica parado onde está', fn: () => { this.obey(); this.mode = 'ficar'; this.home.copy(this.p); return null; } },
      carga: { fn: () => (this.cargo ? this.cargo.type : null), doc: 'O item que ele está carregando (ou None)' },
      humor: { fn: () => Math.round(this.mood * 100), doc: 'Humor de 0 a 100' },
      amizade: { fn: () => game.economy.friendLevel, doc: 'Nível de amizade (1 a 5)' },
      posicao: { fn: () => [Math.floor(this.p.x / CELL), Math.floor(this.p.z / CELL)], doc: 'Célula [x, z] onde ele está' },
      ocupado: { fn: () => !!this.cmd || this.acts.length > 0, doc: 'True se estiver andando ou fazendo algo' },
    };
  }
  infoLines() { return [`Humor: ${this.moodText}`, `Amizade nível ${game.economy.friendLevel}`]; }

  // dicas de coisas pra fazer (misturadas com as falas normais)
  tip() {
    const eco = game.economy;
    const r = Math.random();
    if (r < 0.2) { const h = crateHint(); if (h) return `Ouvi dizer que tem uma caixa perdida ${h} 📦`; }
    if (r < 0.35 && eco.level >= 2 && !(eco.contracts?.active?.length)) return 'Tem pedido novo no 📋 Quadro de Contratos!';
    if (r < 0.45 && eco.disks > 0) return `Você tem ${eco.disks} 💾 disco(s) pra analisar no Laboratório!`;
    if (r < 0.55 && eco.tokens >= 3) return `*olha pras suas ${eco.tokens} 🎟️ fichas e pro chapéu da loja* 🎩`;
    if (r < 0.62) return 'Já tentou os quebra-cabeças do 🧩 Terminal de Desafios?';
    return IDLE_LINES[Math.floor(Math.random() * IDLE_LINES.length)];
  }
  // perninhas, rabinho, orelhas, anteninhas e as poses (sentado/deitado), sempre suave
  animateBody(dt, moving) {
    const P = this.parts, t = this.t, I = this.idle;
    const want = moving ? 0 : I.kind === 'sentar' ? 1 : I.kind === 'deitar' ? 2 : 0;
    this.poseK += (want - this.poseK) * Math.min(1, dt * 4);
    const sit = Math.max(0, 1 - Math.abs(this.poseK - 1)), lie = Math.max(0, this.poseK - 1);
    const breathe = Math.sin(t * (lie > 0.5 ? 1.6 : 2.6)) * 0.012;
    // corpo: sentado inclina pra trás, deitado encosta a barriga no chão
    P.body.position.y = 0.3 - sit * 0.07 - lie * 0.13 + breathe + (moving ? Math.abs(Math.sin(t * 12)) * 0.025 : 0);
    P.body.rotation.x = -sit * 0.42;
    // pernas: trote andando; sentado as de trás dobram; deitado esticam pros lados
    for (const L of P.legs) {
      const ph = (L.userData.front ? 0 : Math.PI) + (L.userData.side > 0 ? Math.PI : 0);
      const walk = moving ? Math.sin(t * 13 + ph) * 0.65 : 0;
      const sitBend = !L.userData.front ? sit * 1.2 : sit * 0.42;
      L.rotation.x = walk + sitBend + (L.userData.front ? -lie * 1.25 : lie * 1.25);
      L.rotation.z = lie * 0.35 * L.userData.side;
    }
    // rabinho: abana mais quando está feliz ou ganhou carinho
    if (this.wag > 0) this.wag -= dt;
    const wagSp = this.wag > 0 ? 22 : moving ? 14 : this.mood > 0.6 ? 7 : 3;
    P.tail.rotation.z = Math.sin(t * wagSp) * (this.wag > 0 ? 0.6 : 0.3) * (1 - lie * 0.7);
    // cabeça: fareja o chão, olha em volta sozinho (nunca vira pra te encarar)
    if (I.kind === 'olhar' && Math.random() < dt * 0.8) I.headYaw = (Math.random() - 0.5) * 1.6;
    const sniff = I.kind === 'farejar' && !moving;
    const yaw = I.kind === 'olhar' ? I.headYaw : moving ? 0 : Math.sin(t * 0.7) * 0.25;
    P.head.rotation.y += (yaw - P.head.rotation.y) * Math.min(1, dt * 3);
    const pitch = sniff ? 0.55 + Math.sin(t * 18) * 0.05 : lie > 0.5 ? 0.3 : sit * 0.3 - (moving ? 0.05 : 0);
    P.head.rotation.x += (pitch - P.head.rotation.x) * Math.min(1, dt * 5);
    P.head.rotation.z = lie > 0.5 ? 0.25 * lie : Math.sin(t * 1.3) * 0.05;
    // orelhas balançam no trote; anteninhas balançam sempre
    const flop = moving ? Math.sin(t * 13) * 0.25 : Math.sin(t * 2.1) * 0.05;
    P.earL.rotation.z = flop; P.earR.rotation.z = -flop;
    P.antennae.children.forEach((a, k) => { a.rotation.x = Math.sin(t * 3 + k) * 0.18 + (moving ? 0.25 : 0); });
  }
  turnTo(target, k) {
    let d = target - this.obj.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d)); // menor caminho
    this.obj.rotation.y += d * Math.min(1, k);
  }
  serialize() { return { mood: this.mood, mode: this.mode, home: this.mode === 'ficar' ? [this.home.x, this.home.z] : null }; }
  load(d) {
    if (!d) return;
    this.mood = d.mood ?? this.mood;
    this.mode = d.mode === 'ficar' ? 'ficar' : 'seguir';
    if (d.home) { this.home.set(d.home[0], 0, d.home[1]); this.p.copy(this.home); }
  }
}
