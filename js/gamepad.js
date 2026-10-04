// Controle (gamepad, layout padrão Xbox/PlayStation):
// alavanca esquerda anda · direita olha · A pula · B desliza/cancela · X usa (E) · Y loja
// LB/RB trocam a peça · LT guarda (X) · RT coloca/clica · L3 corre · R3 gira (R)
// ↑ troca peça da construção / tarefas do Oopi · ↓ troca material · ← rádio · → guia · Select mapa · Start pausa
import { game } from './state.js';
import { settings } from './settings.js';
import { audio } from './audio.js';

const DEAD = 0.18;
let prev = [];
let sprintToggle = false;
let lastPad = null;
const dz = (v) => (Math.abs(v) < DEAD ? 0 : (v - Math.sign(v) * DEAD) / (1 - DEAD));

export function initGamepad() {
  addEventListener('gamepadconnected', (e) => {
    game.ui?.toast(`🎮 Controle conectado: ${e.gamepad.id.split('(')[0].trim()}`, 'good');
    audio.play('select', { volume: 0.5 });
  });
  addEventListener('gamepaddisconnected', () => { game.padActive = false; game.ui?.toast('🎮 Controle desconectado', 'warn'); });
  // mexeu no mouse/teclado: volta pro modo normal
  addEventListener('mousemove', (e) => { if (Math.abs(e.movementX) + Math.abs(e.movementY) > 2) game.padActive = false; });
  addEventListener('keydown', () => { game.padActive = false; });
}
export function padName() { return lastPad ? lastPad.id.split('(')[0].trim() : null; }

// actions = { interact, primary, remove, cancel, jumpTo... } vindas do main.js
export function updateGamepad(dt, act) {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const gp = [...pads].find((p) => p && p.connected);
  lastPad = gp || null;
  if (!gp) return;
  const btn = gp.buttons.map((b) => b.pressed || b.value > 0.5);
  const down = (i) => btn[i] && !prev[i];
  const ax = gp.axes.map(dz);
  const any = btn.some(Boolean) || ax.some((v) => v !== 0);
  if (any) game.padActive = true;
  const p = game.player;
  const mode = game.mode;
  const ui = game.ui;

  if (mode === 'menu') {
    if (down(0)) act.menuPlay();
  } else if (ui?.confirmCb) {
    if (down(0)) ui.confirmDone(true);
    if (down(1)) ui.confirmDone(false);
  } else if (mode === 'pause') {
    if (down(0) || down(9)) act.resume();
  } else if (mode === 'ui') {
    if (down(1) || down(9)) ui.closeOverlay();
  } else if (mode === 'play' && game.padActive) {
    // andar e olhar
    p.pad.x = ax[0] || 0;
    p.pad.y = ax[1] || 0;
    if (down(10)) sprintToggle = !sprintToggle;
    if (Math.hypot(p.pad.x, p.pad.y) < 0.2) sprintToggle = false;
    p.pad.sprint = sprintToggle || btn[10];
    p.pad.jump = btn[0];
    const b = game.builder;
    const busy = b.selected || b.copyMode || b.pasteMode;
    p.pad.slide = btn[1] && !busy;
    const s = 2.6 * (settings.padSens || 1) * dt;
    const cam = game.camera;
    cam.rotation.y -= (ax[2] || 0) * s;
    cam.rotation.x = Math.max(-1.5, Math.min(1.5, cam.rotation.x - (ax[3] || 0) * s * 0.8));
    // botões
    if (down(1) && busy) act.cancel();
    if (down(2)) act.interact();
    if (down(3)) act.shop();
    if (down(4)) b.cycle(-1);
    if (down(5)) b.cycle(1);
    if (down(6)) b.removeHovered();
    if (down(7)) act.primary();
    if (down(11)) act.rotate();
    if (down(12)) act.piece();
    if (down(13)) act.material();
    if (down(14)) act.radio();
    if (down(15)) ui.openOverlay('guide');
    if (down(8)) ui.openOverlay('map');
    if (down(9)) act.pause();
  }
  prev = btn;
}
