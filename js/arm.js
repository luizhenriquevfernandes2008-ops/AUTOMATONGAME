// 🦾 Braço robótico: pega um item do que estiver ATRÁS dele (esteira, baú, saída de máquina, caixa de venda,
// canteiro) e solta NA FRENTE. Como tudo no AUTOMATON, só se mexe quando um programa manda:
//   b = maquina("braco1")
//   while True:
//       b.mover("chip")      # pega um chip atrás e solta na frente
import * as THREE from 'three';
import { game } from './state.js';
import { ENTITY_CLASSES, Machine, DIRS, itemName, isItem } from './machines.js';
import { takeFrom } from './machines2.js';
import { takeItemMesh, releaseItemMesh } from './itemMeshes.js';
import { JiboiaError, suggest } from './lang/jiboia.js';
import { ITEMS } from './data.js';
import { audio } from './audio.js';

// tem item (do tipo pedido) pra pegar em e? (igual ao takeFrom, mas sem tirar)
export function peekFrom(e, want) {
  if (!e) return false;
  if (e.items && e.items.length) return e.items.some((it) => !want || it.type === want);
  if (e.out && e.out.length && e.out.some((t) => !want || t === want)) return true;
  if (e.held && (!want || e.held.type === want)) return true;
  if (e.inv && (e.type === 'bau' || e.type === 'venda')) return want ? !!e.inv[want] : Object.keys(e.inv).length > 0;
  return false;
}
const needItem = (w, fn) => {
  if (w == null) return null;
  if (typeof w !== 'string' || !isItem(w)) { const s = suggest(String(w), Object.keys(ITEMS)); throw new JiboiaError(`${fn}(): o item "${w}" não existe` + (s ? `. Você quis dizer "${s}"?` : '')); }
  return w;
};

export class RobotArm extends Machine {
  constructor(...a) {
    super(...a);
    this.held = null;
    this.swing = 0;      // 0 = virado pra trás, 1 = virado pra frente
    this.swingTo = 0;
    this.moved = 0;
    this.baseYaw = this.model.rotation.y;
  }
  get hasOutput() { return true; }        // seta laranja: solta na frente
  get inputSides() { return [2]; }         // seta azul: pega atrás
  canAccept() { return false; }            // esteira não empurra item pra dentro do braço
  tryEject() { }
  back() { return this.entityIn((this.dir + 2) % 4); }
  front() { return this.entityIn(this.dir); }
  // ponta do braço (onde o item fica)
  tip() {
    const a = -this.dir * Math.PI / 2 + Math.PI * (1 - this.swing); // 0 = trás
    return new THREE.Vector3(this.pos.x - Math.sin(a) * 0.55, this.pos.y + 1.05, this.pos.z - Math.cos(a) * 0.55);
  }
  grab(want) {
    const src = this.back();
    const got = src && takeFrom(src, want);
    if (!got) return null;
    const mesh = got.mesh || takeItemMesh(got.type);
    if (mesh.parent !== game.scene) game.scene.add(mesh);
    this.held = { type: got.type, mesh };
    audio.play('click', { pos: this.pos, volume: 0.35 });
    return got.type;
  }
  drop() {
    const t = this.front();
    const h = this.held;
    this.held = null;
    t.accept(h.type, this.dir, h.mesh);
    this.moved++;
    game.economy.stats.armMoves = (game.economy.stats.armMoves || 0) + 1;
    audio.play('drop', { pos: this.pos, volume: 0.3 });
    return h.type;
  }
  waitGrab(want) {
    const src = this.back();
    if (!src) return 'Nada atrás do braço (seta azul)';
    if (!peekFrom(src, want)) return want ? `Esperando ${itemName(want)} atrás` : 'Esperando item atrás';
    return null;
  }
  waitDrop() {
    const t = this.front();
    if (!t) return 'Nada na frente do braço (seta laranja)';
    if (!t.canAccept || !t.canAccept(this.held.type, this.dir)) return 'Esperando espaço na frente';
    return null;
  }
  autoRequest(kind, arg) { return this.api().mover.fn(arg ? [arg] : []); }
  api() {
    const dur = () => 0.55;
    return {
      ...super.api(),
      ...this.autoApi('Liga o modo contínuo: move itens sem parar (ou só um tipo: .ligar("chip"))', (a) => needItem(a[0] ?? null, 'ligar')),
      pegar: {
        max: 1, doc: 'Pega 1 item de trás (do tipo pedido, ou qualquer). Espera ter item. Retorna o nome',
        fn: (a) => {
          const want = needItem(a[0] ?? null, 'pegar');
          return this.request({
            label: 'Pegando', counts: 'item',
            check: () => { if (this.held) throw new JiboiaError(`O braço '${this.name}' já está segurando ${itemName(this.held.type)}. Use .soltar() antes`); return this.waitGrab(want); },
            start: () => { this.swingTo = 0; }, dur, finish: () => this.grab(want),
          });
        },
      },
      soltar: {
        doc: 'Solta o item segurado na frente (espera ter espaço)',
        fn: () => this.request({
          label: 'Soltando',
          check: () => { if (!this.held) throw new JiboiaError(`O braço '${this.name}' não está segurando nada`); return this.waitDrop(); },
          start: () => { this.swingTo = 1; }, dur, finish: () => this.drop(),
        }),
      },
      mover: {
        max: 1, doc: 'Pega atrás e solta na frente, tudo de uma vez. Retorna o nome do item',
        fn: (a) => {
          const want = needItem(a[0] ?? null, 'mover');
          let phase = 0;
          return this.request({
            label: 'Movendo', counts: 'item',
            check: () => {
              if (this.held) return this.waitDrop();
              return this.waitGrab(want);
            },
            start: () => { phase = this.held ? 1 : 0; if (!this.held) this.grab(want); this.swingTo = 1; },
            dur: () => (phase ? 0.55 : 1.1),
            finish: () => {
              // se a frente encheu no meio do caminho, segura e espera o próximo .soltar()/.mover()
              if (!this.held) return null;
              if (this.waitDrop()) return this.held.type;
              return this.drop();
            },
          });
        },
      },
      segurando: { fn: () => (this.held ? this.held.type : null), doc: 'O item que está segurando (ou None)' },
      atras: { fn: () => { const e = this.back(); return e ? (e.name || e.type) : null; }, doc: 'Nome do que está atrás do braço' },
      frente: { fn: () => { const e = this.front(); return e ? (e.name || e.type) : null; }, doc: 'Nome do que está na frente do braço' },
      movidos: { fn: () => this.moved, doc: 'Quantos itens já moveu' },
    };
  }
  animate(dt) {
    super.animate(dt);
    // gira devagar entre trás (0) e frente (1)
    const sp = dt * 3.2 * this.speedMul;
    this.swing += Math.max(-sp, Math.min(sp, this.swingTo - this.swing));
    this.model.rotation.y = this.baseYaw + Math.PI * (1 - this.swing);
    this.model.scale.set(1, 1, 1);
    if (this.held) {
      const p = this.tip();
      this.held.mesh.position.set(p.x, p.y, p.z);
    }
    if (!this.job && !this.queue.length && !this.held) this.swingTo = 0;
  }
  onRemove() { super.onRemove(); if (this.held) releaseItemMesh(this.held.mesh); }
  infoLines() {
    const b = this.back(), f = this.front();
    return [`Status: ${this.status}`, `Atrás: ${b ? b.name || b.type : 'nada'} · Frente: ${f ? f.name || f.type : 'nada'}`, `Segurando: ${this.held ? itemName(this.held.type) : 'nada'} · movidos: ${this.moved}`, ...super.infoLines().slice(1)];
  }
  serialize() { return { ...super.serialize(), held: this.held?.type || null, moved: this.moved }; }
  load(d) {
    super.load(d);
    this.moved = d.moved || 0;
    if (d.held && isItem(d.held)) { const m = takeItemMesh(d.held); this.held = { type: d.held, mesh: m }; this.swing = this.swingTo = 1; }
  }
}
ENTITY_CLASSES.braco = RobotArm;
void DIRS;
