// Tutorial interativo: guia passo a passo nos primeiros minutos (opcional).
import * as THREE from 'three';
import { game } from './state.js';
import { audio } from './audio.js';
import { ores, cellCenter } from './machines.js';

const $ = (s) => document.querySelector(s);
const has = (t) => game.entities.some((e) => e.type === t);
const powered = (t) => game.entities.some((e) => e.type === t && e.net && e.net.supply > 0);

let start = null, doneT = 0;
const STEPS = [
  { text: 'Use <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> pra andar e o mouse pra olhar. Dê uma voltinha!', check: () => start && game.camera.position.distanceTo(start) > 4 },
  { text: 'Aperte a tecla do <b>Minerador</b> (olhe a barra embaixo, ela está piscando).', hl: 'minerador', check: () => game.builder.selected === 'minerador' || has('minerador') },
  { text: 'Mire no <b>veio de ferro</b> marcado (cristal azul) e clique. Antes, gire com <kbd>R</kbd>: a <b>seta amarela</b> mostra pra onde o minério vai sair.', target: 'ore', check: () => has('minerador') },
  { text: 'Agora pegue a <b>Esteira</b> e faça um caminho começando na <b>seta laranja</b> do minerador. As setinhas amarelas mostram a direção.', hl: 'esteira', check: () => game.entities.filter((e) => e.type === 'esteira').length >= 2 },
  { text: 'Coloque a <b>Caixa de Venda</b> no fim da esteira. Ela aceita itens por qualquer lado.', hl: 'venda', check: () => has('venda') },
  { text: 'Hora da energia ⚡! Coloque o <b>Gerador</b> perto das máquinas.', hl: 'gerador', check: () => has('gerador') },
  { text: 'Coloque o <b>Computador</b> perto também.', hl: 'computador', check: () => has('computador') },
  { text: 'Pegue o <b>🔌 Cabo</b> (tecla <kbd>1</kbd>). Clique no gerador e depois no <b>minerador</b>, na <b>caixa de venda</b> e no <b>computador</b>.', hl: 'cabo', check: () => powered('minerador') && powered('computador') && powered('venda') },
  { text: 'Mire no computador (marcado) e aperte <kbd>E</kbd> pra abrir o editor de código.', target: 'pc', check: () => game.ui.overlay === 'editor' },
  { text: 'Aperte <b>▶ Executar</b> (ou <kbd>Ctrl+Enter</kbd>). A setinha verde mostra a linha rodando. Pode fechar o editor com <kbd>Esc</kbd>: o programa continua.', check: () => game.entities.some((e) => e.type === 'computador' && e.running) },
  { text: 'Agora é só esperar a <b>primeira venda</b> 💰 (o programa vende a cada 5 minérios).', check: () => game.economy.stats.soldCount > 0 },
  { text: '🎉 Você já sabe o básico! <kbd>B</kbd> loja · <kbd>H</kbd> guia · <kbd>Tab</kbd> mapa · <kbd>K</kbd> estatísticas · <kbd>C</kbd>/<kbd>V</kbd> copiar e colar · <kbd>Ctrl+Z</kbd> desfazer. Siga os objetivos no canto direito!', final: true, check: () => doneT > 12 },
];

let beacon = null;
function makeBeacon() {
  const g = new THREE.Group();
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 30, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }));
  beam.position.y = 15;
  g.add(beam);
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.7, 12), new THREE.MeshBasicMaterial({ color: 0xffb020 }));
  arrow.rotation.x = Math.PI;
  arrow.position.y = 3;
  g.add(arrow);
  g.userData.arrow = arrow;
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.1, 32), new THREE.MeshBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  g.add(ring);
  g.userData.ring = ring;
  game.scene.add(g);
  return g;
}

export function tutorialActive() { return game.economy && game.economy.tutorialStep >= 0 && game.economy.tutorialStep < STEPS.length; }

export function startTutorial() {
  game.economy.tutorialStep = 0;
  start = game.camera.position.clone();
  doneT = 0;
  render();
}
export function stopTutorial() {
  game.economy.tutorialStep = -1;
  render();
}

function render() {
  const box = $('#tutorial');
  const on = tutorialActive();
  box.classList.toggle('hidden', !on);
  document.querySelectorAll('.slot.tut').forEach((s) => s.classList.remove('tut'));
  if (!on) { if (beacon) beacon.visible = false; return; }
  const i = game.economy.tutorialStep;
  const s = STEPS[i];
  box.innerHTML = `<div class="tut-h"><span>// tutorial · passo ${i + 1}/${STEPS.length}</span><button id="tut-skip" class="x">${s.final ? 'fechar' : 'pular tutorial'}</button></div>
    <div class="tut-text">${s.text}</div><div class="tut-bar"><i style="width:${(i / (STEPS.length - 1)) * 100}%"></i></div>`;
  $('#tut-skip').onclick = () => stopTutorial();
}

export function updateTutorial(dt) {
  if (!tutorialActive()) { if (beacon) beacon.visible = false; return; }
  if (!start) start = game.camera.position.clone();
  const i = game.economy.tutorialStep;
  const s = STEPS[i];
  if (s.final) doneT += dt;
  // realça a peça na barra
  if (s.hl) document.querySelectorAll('.slot').forEach((el) => el.classList.toggle('tut', el.dataset.t === s.hl));
  // marcador 3D
  let pos = null;
  if (s.target === 'ore') {
    let best = null, bd = 1e9;
    for (const [k, t] of ores) {
      if (t !== 'ferro') continue;
      const [x, z] = k.split(',').map(Number);
      const c = cellCenter(x, z);
      const d = c.distanceTo(game.spawn || game.camera.position);
      if (d < bd) { bd = d; best = c; }
    }
    pos = best;
  } else if (s.target === 'pc') {
    const pc = game.entities.find((e) => e.type === 'computador');
    if (pc) pos = pc.pos;
  }
  if (pos) {
    if (!beacon) beacon = makeBeacon();
    beacon.visible = true;
    beacon.position.set(pos.x, 0, pos.z);
    const t = performance.now() / 1000;
    beacon.userData.arrow.position.y = 3 + Math.sin(t * 4) * 0.3;
    beacon.userData.ring.scale.setScalar(1 + (t % 1) * 0.4);
  } else if (beacon) beacon.visible = false;
  if (s.check()) {
    game.economy.tutorialStep++;
    if (game.economy.tutorialStep >= STEPS.length) { stopTutorial(); return; }
    audio.play('quest', { volume: 0.5 });
    render();
  }
}

export function refreshTutorial() { render(); }
