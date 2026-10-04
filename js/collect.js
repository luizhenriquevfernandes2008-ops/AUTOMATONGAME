// Coletor portátil: a ferramentinha na sua mão. Segure E (ou o clique, com a mão vazia) mirando numa
// planta pra colher madeira, folhas, fibra e esporos, ou num veio pra minerar na mão (igual ao começo do Satisfactory).
import * as THREE from 'three';
import { game } from './state.js';
import { ORES, ITEMS, PURITY } from './data.js';
import { aimFlora, removeFlora, floraInfo } from './flora.js';
import { nodes } from './world.js';
import { grid, key, itemName } from './machines.js';
import { puff, floatText } from './fx.js';
import { audio } from './audio.js';

// tempo pra coletar cada tipo (s)
const TIME = { arvore: 2.4, cogumelo: 2, cristal: 3, cacto: 1.2, arbusto: 1, capim: 0.45, flor: 0.5, agua: 0.8 };
const ORE_TIME = 1.1;

function buildTool() {
  const g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x232a33, roughness: 0.6, metalness: 0.3 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x8b95a3, roughness: 0.35, metalness: 0.7 });
  const amber = new THREE.MeshStandardMaterial({ color: 0xffae34, emissive: 0xff8a20, emissiveIntensity: 0.6, roughness: 0.4 });
  const glow = new THREE.MeshBasicMaterial({ color: 0x5ff5e0 });
  const add = (geo, mat, x, y, z, rx = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.x = rx; g.add(m); return m; };
  add(new THREE.BoxGeometry(0.05, 0.13, 0.06), dark, 0, -0.07, 0.04, 0.25);           // cabo
  add(new THREE.BoxGeometry(0.075, 0.07, 0.2), steel, 0, 0, -0.04);                   // corpo
  add(new THREE.BoxGeometry(0.078, 0.018, 0.12), amber, 0, 0.03, -0.03);              // faixa âmbar
  add(new THREE.CylinderGeometry(0.022, 0.03, 0.09, 10), dark, 0, 0, -0.18, Math.PI / 2); // cano
  const tip = add(new THREE.SphereGeometry(0.02, 10, 8), glow, 0, 0, -0.23);         // emissor
  add(new THREE.BoxGeometry(0.03, 0.03, 0.06), dark, 0, 0.05, 0.02);                  // mira
  g.userData.tip = tip;
  return g;
}

export class Collector {
  constructor() {
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.01, 10);
    this.scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x403a36, 1.6));
    this.key = new THREE.DirectionalLight(0xffe0c0, 1.4);
    this.key.position.set(1, 2, 1);
    this.scene.add(this.cam);
    this.cam.add(this.key);
    this.tool = buildTool();
    this.tool.position.set(0.3, -0.24, -0.62);
    this.tool.rotation.set(0.06, 0.16, 0);
    this.tool.scale.setScalar(0.8);
    this.cam.add(this.tool);
    this.base = this.tool.position.clone();
    // feixe do emissor até o alvo (no mundo)
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.03, 1, 6, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5),
      new THREE.MeshBasicMaterial({ color: 0x5ff5e0, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.beam.visible = false;
    this.beam.frustumCulled = false;
    game.scene.add(this.beam);
    this.target = null;
    this.progress = 0;
    this.held = false;
    this.t = 0;
    this.spark = 0;
    this.speed = 1; // melhora com os marcos (Coletor Mk2...)
    addEventListener('resize', () => { this.cam.aspect = innerWidth / innerHeight; this.cam.updateProjectionMatrix(); });
  }

  // o que está na mira: planta ou veio livre (sem minerador em cima)
  findTarget(ray) {
    let best = null;
    const f = aimFlora(ray, 4.5);
    if (f) best = { kind: 'flora', id: f.id, sp: f.sp, dist: f.dist, point: f.point, name: f.sp.nome, time: TIME[f.sp.kind] || 1 };
    const o = ray.origin, d = ray.direction;
    for (const n of nodes) {
      const dx = n.x - o.x, dz = n.z - o.z;
      if (dx * dx + dz * dz > 49) continue;
      if (grid.has(key(n.cx, n.cz))) continue;
      const L = d.x * d.x + d.z * d.z;
      const t = L > 1e-6 ? Math.max(0, (dx * d.x + dz * d.z) / L) : 0;
      if (t > 5) continue;
      const px = o.x + d.x * t, py = o.y + d.y * t, pz = o.z + d.z * t;
      if ((px - n.x) ** 2 + (pz - n.z) ** 2 > 0.95 * 0.95 || py < n.y - 0.4 || py > n.y + 1.6) continue;
      if (best && best.dist < t) continue;
      const ore = ORES[n.type];
      best = { kind: 'node', node: n, dist: t, point: new THREE.Vector3(n.x, n.y + 0.5, n.z), name: `Veio de ${ore.nome} (${PURITY[n.purity].nome})`, time: ORE_TIME / Math.sqrt(PURITY[n.purity].mult) };
    }
    return best;
  }

  get busy() { return this.held && !!this.target; }

  update(dt, active) {
    this.t += dt;
    const b = game.builder;
    const free = active && !b.selected && !b.copyMode && !b.pasteMode && game.mode === 'play';
    // segue a câmera principal
    this.cam.position.copy(game.camera.position);
    this.cam.quaternion.copy(game.camera.quaternion);
    this.cam.updateMatrixWorld();
    if (!free) { this.target = null; this.progress = 0; this.beam.visible = false; this.tool.visible = active && !b.selected; return; }
    this.tool.visible = true;
    const ray = new THREE.Ray(game.camera.position.clone(), new THREE.Vector3(0, 0, -1).applyQuaternion(game.camera.quaternion));
    const tgt = this.findTarget(ray);
    const same = tgt && this.target && tgt.kind === this.target.kind && (tgt.id === this.target.id) && (tgt.node === this.target.node);
    if (!same) this.progress = 0;
    this.target = tgt;
    const working = this.held && tgt;
    // animação: balança andando, treme trabalhando
    const sp = game.player.speed || 0;
    const bob = Math.sin(this.t * 7) * 0.006 * Math.min(1, sp / 4);
    const shake = working ? (Math.random() - 0.5) * 0.006 : 0;
    this.tool.position.set(this.base.x + shake, this.base.y + bob + shake + (working ? 0.02 : 0), this.base.z + (working ? 0.03 : 0));
    this.tool.userData.tip.material.color.setHSL(0.47, 0.9, working ? 0.55 + Math.sin(this.t * 30) * 0.15 : 0.6);
    if (working) {
      this.progress += (dt * this.speed) / tgt.time;
      // feixe: do emissor (no mundo) até o alvo
      const tipWorld = this.tool.userData.tip.getWorldPosition(new THREE.Vector3());
      const to = tgt.point;
      this.beam.position.copy(tipWorld);
      this.beam.lookAt(to);
      this.beam.scale.set(1, 1, tipWorld.distanceTo(to));
      this.beam.material.opacity = 0.5 + Math.random() * 0.4;
      this.beam.visible = true;
      this.spark -= dt;
      if (this.spark <= 0) {
        this.spark = 0.12;
        const col = tgt.kind === 'node' ? ORES[tgt.node.type].cor : 0x9dffb0;
        puff(to.clone(), { color: col, count: 3, size: 0.12, up: 1.2, gravity: 4, additive: true, spread: 0.4, life: 0.6 });
        audio.play('tick', { pos: to, volume: 0.18, rate: 1.4 + Math.random() * 0.4 });
      }
      if (this.progress >= 1) this.finish(tgt);
    } else {
      this.beam.visible = false;
      this.progress = Math.max(0, this.progress - dt * 2);
    }
  }

  finish(t) {
    const eco = game.economy;
    if (t.kind === 'node') {
      const item = ORES[t.node.type].item;
      if (!this.give(item, 1, t.point)) { this.progress = 0; return; }
      this.progress = 0; // continua minerando enquanto segurar
      audio.play('drop', { pos: t.point, volume: 0.35, rate: 1.2 });
      eco.produced?.(item, 1);
      eco.stats.handMined = (eco.stats.handMined || 0) + 1;
      return;
    }
    // planta: rende os itens e some (com um puf de folhas)
    const info = floraInfo(t.id);
    const drop = t.sp.drop || {};
    const got = [];
    for (const [item, [a, b]] of Object.entries(drop)) {
      const n = Math.round((a + Math.floor(Math.random() * (b - a + 1))) * (game.plantBonus || 1));
      if (n > 0 && this.give(item, n, null)) got.push(`+${n} ${itemName(item)}`);
    }
    if (!got.length) { this.progress = 0; return; }
    if (game.mp?.guestRpc?.('collect', { id: t.id })) { /* o anfitrião tira a planta */ } else removeFlora(t.id);
    const top = new THREE.Vector3(info.x, info.y + info.sc * 0.6, info.z);
    puff(top, { color: t.sp.kind === 'cristal' ? 0xb98aff : t.sp.kind === 'cogumelo' ? 0x7dffb0 : 0x6fbf6a, count: 14, size: 0.3, up: 1.5, gravity: 3, spread: Math.min(2.5, info.sc * 0.4), life: 1.3 });
    floatText(top, got.join('  '), '#9dffb0');
    audio.play(t.sp.kind === 'cristal' ? 'glass' : t.sp.kind === 'arvore' ? 'plank' : 'click', { pos: top, volume: 0.6 });
    eco.stats.collected = (eco.stats.collected || 0) + 1;
    this.progress = 0;
    this.target = null;
  }

  give(item, n, at) {
    const eco = game.economy;
    // multiplayer: o inventário é o do anfitrião
    if (game.mp?.isGuest) {
      game.mp.guestRpc('give', { item, n });
      if (at) floatText(at.clone().add(new THREE.Vector3(0, 0.6, 0)), `+${n} ${ITEMS[item]?.nome || item}`, '#ffd28a');
      return true;
    }
    const ok = eco.give ? eco.give(item, n) : (eco.addItem(item, n), true);
    if (!ok) { game.ui.toast('🎒 Inventário cheio! Guarde itens num baú ou construa algo.', 'warn'); audio.play('deny', { volume: 0.4 }); return false; }
    if (at) floatText(at.clone().add(new THREE.Vector3(0, 0.6, 0)), `+${n} ${ITEMS[item]?.nome || item}`, '#ffd28a');
    return true;
  }

  // desenha a ferramenta por cima de tudo (sem atravessar paredes)
  render(renderer) {
    if (!this.tool.visible) return;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.scene, this.cam);
    renderer.autoClear = true;
  }

  promptHtml(kbd) {
    const t = this.target;
    if (!t) return '';
    const what = t.kind === 'node' ? ITEMS[ORES[t.node.type].item].nome : Object.keys(t.sp.drop || {}).map((k) => ITEMS[k]?.nome || k).join(', ');
    const pct = Math.round(Math.min(1, this.progress) * 100);
    return `<b>${t.name}</b><br>Segure ${kbd('usar')} ou <kbd>Clique</kbd> pra coletar · ${what}${this.held ? ` <span class="good">${pct}%</span>` : ''}`;
  }
}
