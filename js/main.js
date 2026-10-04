// AUTOMATON — ponto de entrada.
import * as THREE from 'three';
import { game } from './state.js';
import { updatePost, renderFrame, resizePost, setupPost } from './post.js'; // antes de tudo: troca o pedaço de névoa dos shaders
import { initPause, openPause } from './pause.js';
import { loadAll } from './assets.js';
import { audio } from './audio.js';
import { buildWorld, updateMarketBoard, updatePod } from './world.js';
import { Economy } from './economy.js';
import { Player } from './player.js';
import { Builder } from './build.js';
import { UI } from './ui.js';
import { generateThumbs } from './thumbs.js';
import { saveGame, loadGame, hasSave, deleteSave, VISITING, peekWorld, takeNewGame, takePendingJoin } from './save.js';
import { loadSettings, applySettings, bindSettingInputs, syncStation, settings } from './settings.js';
import { initMenu, openMenu, updateMenuCamera } from './menu.js';
import { updateFx, puff } from './fx.js';
import './computer.js';
import './farm.js';
import './arm.js';
import './hub.js';
import { animateBelts, updateDecorBonus, setTechNamer, flushBelts, markBeltsDirty } from './machines.js';
import { flushItems } from './itemMeshes.js';
import { updateEvents, collectPickup } from './events.js';
import { countPaintings, flushFoundations } from './structures.js';
import { actionOf, bindKeyUI } from './input.js';
import { initGamepad, updateGamepad } from './gamepad.js';
import { updateDrones, updateTimers } from './machines2.js';
import { updatePower } from './power.js';
import { initSky, updateSky } from './sky.js';
import { Pet } from './pet.js';
import { photo, togglePhoto, photoKey, photoWheel, updatePhoto } from './photo.js';
import { startTutorial, updateTutorial, refreshTutorial, tutorialActive } from './tutorial.js';
import { NO_PANEL } from './ui.js';
import { PANEL3 } from './ui3.js';
import { clearRegion } from './world.js';
import { TECHS, PAINTINGS } from './data.js';
import { buildContractBoard, updateContracts, updateShips } from './contracts.js';
import { buildTerminal } from './challengeUI.js';
import { buildCrates, openCrate } from './disks.js';
import { updateOrbit } from './space.js';
import { updateLights } from './lights.js';
import { flushStatic } from './staticBatch.js';
import { generateFlora, updateFlora } from './flora.js';
import { Collector } from './collect.js';
import { startLanding, updateLanding } from './start.js';
import { BIOMES as BIOMES3 } from './terrain.js';
import { settings as userSettings } from './settings.js';
import { detectGpu, warnGpuOnStart, watchFps, shortGpu } from './gpu.js';
import { mp } from './mp.js';
import { checkDaily, openMail } from './mail.js';

const $ = (s) => document.querySelector(s);

// ─── renderer ───
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$('#app').appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.08, 3200);
camera.rotation.order = 'YXZ';
Object.assign(game, { scene, camera, renderer });
detectGpu(renderer);
console.info('AUTOMATON · placa de vídeo do WebGL:', shortGpu());
game.setupPost = setupPost;
window.automaton = game; // útil pra depurar no console (F12)
addEventListener('resize', () => {
  if (!innerWidth || !innerHeight) return; // janela minimizada/escondida
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  resizePost();
});

// ─── modos ───
game.setMode = (m) => {
  if (m !== 'play' && photo.on) togglePhoto(false);
  game.mode = m;
  if (m !== 'play') game.player?.stop();
  if (m === 'ui' || m === 'menu' || m === 'pause') {
    if (document.pointerLockElement) document.exitPointerLock();
  }
  $('#pause').classList.toggle('hidden', m !== 'pause');
  if (m === 'pause') openPause();
  $('#hud').classList.toggle('hidden', m === 'menu');
  $('#clickToPlay').classList.add('hidden');
  if (m === 'play') lockPointer(game.gesture);
  game.gesture = false;
};

// Trava o mouse na tela. O navegador recusa travar de novo logo depois de você soltar com Esc (~1 s):
// aí tentamos de novo sozinhos e, se não der, mostramos "clique pra continuar". Só depois de várias
// recusas seguidas, mesmo com clique, é que vira o modo "arrastar pra olhar".
let lockFromGesture = false, lockFails = 0, lockRetry = null;
function lockPointer(fromGesture) {
  if (game.noLock || game.padActive) return;
  lockFromGesture = !!fromGesture;
  clearTimeout(lockRetry);
  try {
    // movimento "cru" do mouse (sem aceleração do Windows): evita os saltos de câmera; cai pro normal se não der
    const p = renderer.domElement.requestPointerLock({ unadjustedMovement: true });
    if (p && p.catch) p.catch((e) => {
      if (e?.name !== 'NotSupportedError') { lockFailed(); return; }
      const p2 = renderer.domElement.requestPointerLock();
      if (p2 && p2.catch) p2.catch(() => lockFailed());
    });
  } catch { lockFailed(); }
  setTimeout(() => { if (game.mode === 'play' && !document.pointerLockElement && !game.noLock) showClickToPlay(); }, 400);
}
function lockFailed() {
  if (game.mode !== 'play') return;
  lockFails++;
  if (lockFromGesture && lockFails >= 4 && !game.noLock) {
    game.noLock = true;
    $('#clickToPlay').classList.add('hidden');
    game.ui?.toast('Seu navegador não travou o mouse: <b>arraste com o botão esquerdo</b> pra olhar em volta.', 'warn');
    return;
  }
  // tenta de novo quando o navegador liberar
  clearTimeout(lockRetry);
  lockRetry = setTimeout(() => { if (game.mode === 'play' && !document.pointerLockElement) lockPointer(lockFromGesture); }, 1200);
  showClickToPlay();
}
document.addEventListener('pointerlockerror', () => lockFailed());
function showClickToPlay() { if (game.mode === 'play' && !game.noLock) $('#clickToPlay').classList.remove('hidden'); }
$('#clickToPlay').addEventListener('click', () => { $('#clickToPlay').classList.add('hidden'); lockPointer(true); });
const isActive = () => game.mode === 'play' && (!!document.pointerLockElement || game.noLock || game.padActive);
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === renderer.domElement;
  if (locked) { $('#clickToPlay').classList.add('hidden'); lockFails = 0; clearTimeout(lockRetry); }
  else if (game.mode === 'play') game.setMode('pause');
});

// ─── carregamento ───
function bootLog(text, state = 'ok') {
  const el = document.createElement('div');
  el.innerHTML = `<span class="${state}">[${state === 'ok' ? ' ok ' : ' .. '}]</span> ${text}`;
  $('#boot-log').appendChild(el);
  return el;
}
async function boot() {
  const bar = $('#load-bar'), txt = $('#load-text');
  bootLog('AUTOMATON v2.0 · planeta KX-7 · kernel jiboia 🐍');
  const l1 = bootLog('carregando modelos 3D, texturas e céu…', 'run');
  await loadAll(renderer, (p) => { bar.style.width = Math.round(p * 80) + '%'; txt.textContent = `modelos ${Math.round(p * 100)}%`; });
  l1.innerHTML = '<span class="ok">[ ok ]</span> modelos 3D, texturas e céu';
  const l2 = bootLog('carregando efeitos sonoros…', 'run');
  await audio.load();
  l2.innerHTML = '<span class="ok">[ ok ]</span> efeitos sonoros e música';
  bar.style.width = '90%';
  // o planeta: jogo novo pedido no menu, o do save, ou um de demonstração pro fundo do menu
  const pj = takePendingJoin();
  const fresh = pj ? null : takeNewGame();
  if (fresh) deleteSave();
  const params = pj ? { seed: pj.seed, start: pj.start, demo: true } : fresh || peekWorld() || { seed: 'KX-0000', start: 'floresta', demo: true };
  if (pj) game.skipSave = true;
  game.newGame = !!fresh;
  game.demoWorld = !!params.demo;
  const l3 = bootLog(`gerando o planeta · semente ${params.seed}…`, 'run');
  txt.textContent = 'gerando o planeta';
  await document.fonts.ready;
  await new Promise((r) => setTimeout(r, 30));

  game.economy = new Economy();
  setTechNamer((id) => TECHS[id]?.nome || id);
  buildWorld({ seed: params.seed, start: params.start });
  const nPlants = generateFlora();
  bootLog(`flora de KX-7: ${nPlants.toLocaleString('pt-BR')} plantas`);
  initSky();
  game.player = new Player(camera, renderer.domElement);
  game.builder = new Builder();
  game.collector = new Collector();
  game.landing = startLanding;
  generateThumbs();
  game.ui = new UI();
  game.pet = new Pet();
  loadSettings();
  applySettings();
  bindSettingInputs();
  bindKeyUI((msg) => { if (msg) game.ui.toast(msg, 'warn'); game.emit('hotbar'); });
  initGamepad();

  game.player.teleport(game.spawn, game.spawnYaw || 0);
  const had = !fresh && !params.demo && hasSave() && loadGame();
  if (VISITING) {
    document.body.classList.add('visiting');
    $('#visit-name').textContent = game.visitDe || 'um amigo';
    $('#btn-menu').textContent = '⌂ Voltar pra minha fábrica';
    $('#btn-reset').textContent = 'Sair da visita';
    $('#play-label').textContent = 'Visitar';
  }
  if (!had) {
    game.player.teleport(game.spawn, game.spawnYaw || 0);
    if (!params.demo) game.economy.giveStartKit();
    if (game.sky) game.sky.t = 0.36; // pouso de manhãzinha
  }
  game.hadSave = had;
  game.pet.applyLook();
  rememberView();
  l3.innerHTML = `<span class="ok">[ ok ]</span> planeta ${params.seed} gerado` + (had ? ' · save carregado' : '');
  bootLog('rede de energia ⚡ online');
  bar.style.width = '100%';
  game.ui.updateStats();
  game.ui.renderHotbar();
  game.ui.renderObjective();
  $('#track').textContent = audio.currentTrack().nome;
  $('#music-toggle').textContent = audio.musicOn ? '⏸' : '▶';

  renderer.compile(scene, camera);
  initMenu(startPlay);
  game.mode = 'menu';
  requestAnimationFrame(loop);
  setTimeout(() => {
    $('#loading').classList.add('hidden');
    if (pj) {
      // voltando pra sala do amigo, agora no planeta dele
      $('#lr-planet').textContent = pj.seed;
      $('#lr-area').textContent = `🌐 sala ${pj.code}`;
      $('#land-ready').classList.remove('hidden');
      $('#land-go').onclick = () => {
        $('#land-ready').classList.add('hidden');
        game.welcomed = true;
        startPlay();
        if (pj.url) settings.mpUrl = pj.url;
        mp.join(pj.code).catch((e) => game.ui.toast('🌐 ' + e.message, 'warn'));
      };
    } else if (game.newGame) {
      // jogo novo: tela de "pronto pra pousar" (o clique libera áudio e mouse)
      const B = BIOMES3[params.start] || BIOMES3.floresta;
      $('#lr-planet').textContent = params.seed;
      $('#lr-area').textContent = `${B.icone} ${B.nome}`;
      $('#land-ready').classList.remove('hidden');
      $('#land-go').onclick = () => { $('#land-ready').classList.add('hidden'); startPlay(); };
    } else $('#menu').classList.remove('hidden');
  }, 350);
}

// guarda/restaura a visão do jogador (o menu usa a câmera pra passear)
function rememberView() {
  const p = camera.position;
  game.playerView = { x: p.x, z: p.z, yaw: camera.rotation.y, pitch: camera.rotation.x };
}
function restoreView() {
  const v = game.playerView;
  if (!v) return;
  game.player.teleport({ x: v.x, z: v.z }, v.yaw);
  camera.rotation.set(v.pitch, v.yaw, 0, 'YXZ');
}

// ─── menu / pausa ───
function startPlay() {
  audio.start();
  restoreView();
  warnGpuOnStart();
  $('#menu').classList.add('hidden');
  game.gesture = true;
  game.setMode('play');
  if (!game.welcomed && VISITING) {
    game.welcomed = true;
    game.ui.toast(`👀 Você está visitando a fábrica de <b>${(game.visitDe || 'um amigo').replace(/[<>&]/g, '')}</b>. Ande à vontade, leia os programas e copie grupos com <kbd>C</kbd> pra salvar em 📐 Projetos. Nada aqui é salvo.`, 'ach');
  }
  if (!game.welcomed) {
    game.welcomed = true;
    const fresh = !game.hadSave && !game.entities.length;
    if (fresh) {
      game.landing?.();
    } else {
      game.ui.toast('Bem-vindo(a) de volta a KX-7! 🎯');
      setTimeout(() => game.ui.toast('Dica: <kbd>B</kbd> construir · <kbd>Tab</kbd> mapa · segure <kbd>E</kbd> pra coletar · <kbd>H</kbd> guia'), 2500);
    }
  }
}
$('#btn-stats').onclick = () => game.ui.openOverlay('stats');
$('#btn-map').onclick = () => game.ui.openOverlay('map');
$('#btn-projects').onclick = () => game.ui.openOverlay('projects');
$('#menu-tutorial').onclick = () => game.ui.openOverlay('guide');
initPause();
$('#btn-resume').onclick = () => { game.gesture = true; game.setMode('play'); };
$('#btn-guide').onclick = () => game.ui.openOverlay('guide');
$('#btn-save').onclick = () => { if (saveGame()) game.ui.toast('Jogo salvo 💾', 'good'); };
$('#btn-reset').onclick = () => {
  if (VISITING) { goHome(); return; }
  if (!confirm('Apagar TUDO e começar do zero?')) return;
  deleteSave();
  game.skipSave = true;
  location.replace(location.pathname);
};
// modo visita: voltar pra sua própria fábrica (a visita não é salva)
function goHome() { game.skipSave = true; location.replace(location.pathname); }
$('#visit-home').onclick = goHome;
$('#btn-friends').onclick = () => game.ui.openOverlay('friends');
$('#btn-mp').onclick = () => game.ui.openOverlay('multiplayer');
// versão desktop (.exe): botões de sair e tela cheia (window.desktop vem do preload do Electron)
if (window.desktop) {
  $('#btn-quit').style.display = '';
  $('#btn-quit-game').classList.remove('hidden');
  const no = $('#btn-reset').querySelector('.no'); if (no) no.textContent = '12';
  $('#btn-fullscreen').classList.remove('hidden');
  $('#btn-quit-game').onclick = () => { if (!game.skipSave && game.economy && !VISITING) saveGame(); game.skipSave = true; window.desktop.quit(); };
  $('#btn-fullscreen').onclick = () => window.desktop.setFullscreen();
}
$('#mp-hud').onclick = () => game.ui.openOverlay('multiplayer');
$('#btn-menu').onclick = () => {
  if (VISITING) { goHome(); return; }
  saveGame();
  rememberView();
  game.setMode('menu');
  openMenu();
  $('#menu').classList.remove('hidden');
};
// ─── entrada ───
addEventListener('keyup', (e) => { if (actionOf(e.code) === 'usar' && game.collector) game.collector.keyHeld = false; });
addEventListener('mouseup', (e) => { if (e.button === 0 && game.collector) game.collector.mouseHeld = false; });
addEventListener('blur', () => { if (game.collector) game.collector.keyHeld = game.collector.mouseHeld = false; });
addEventListener('keydown', (e) => {
  if (game.noLock && game.mode === 'play' && e.code === 'Escape') { if (photo.on) togglePhoto(false); game.setMode('pause'); return; }
  if (actionOf(e.code) === 'usar' && game.collector && isActive()) game.collector.keyHeld = true;
  if (!isActive()) return;
  if (photo.on) { e.preventDefault(); photoKey(e); return; }
  const b = game.builder;
  if (e.ctrlKey && e.code === 'KeyZ') { e.preventDefault(); game.player.sliding = false; b.undo(); return; }
  if (e.code.startsWith('Digit')) {
    const n = +e.code.slice(5);
    if (n >= 1 && n <= 9) b.selectIndex(n - 1);
    if (n === 0) b.select(null);
  }
  if (e.code === 'Tab') e.preventDefault();
  switch (actionOf(e.code)) {
    case 'girar': b.rotate(); break;
    case 'soltar': actions.cancel(); break;
    case 'guardar': b.removeHovered(); break;
    case 'usar': interact(); break;
    case 'loja': game.ui.openOverlay('build'); break;
    case 'musica': audio.nextTrack(); break;
    case 'guia': game.ui.openOverlay('guide'); break;
    case 'stats': game.ui.openOverlay('stats'); break;
    case 'mapa': e.preventDefault(); game.ui.openOverlay('map'); break;
    case 'copiar': b.startCopy(); game.emit('hotbar'); break;
    case 'colar': b.startPaste(); game.emit('hotbar'); break;
    case 'foto': togglePhoto(true); break;
    case 'projetos': game.ui.openOverlay('projects'); break;
    case 'multiplayer': game.ui.openOverlay('multiplayer'); break;
    case 'peca': actions.piece(e.shiftKey ? -1 : 1); break;
    case 'material': actions.material(e.shiftKey ? -1 : 1); break;
  }
});
// ações usadas pelo teclado e pelo controle
const actions = {
  cancel() { const b = game.builder; if (b.copyMode || b.pasteMode) b.cancelModes(); else if (b.cancelBeltPath()) { /* só larga o caminho */ } else if (b.selected) b.select(b.selected); game.emit('hotbar'); },
  interact: () => interact(),
  primary: () => primaryClick(),
  rotate: () => game.builder.rotate(),
  shop: () => game.ui.openOverlay('build'),
  radio() { audio.nextTrack(); game.ui.toast(`🎵 ${audio.currentTrack().nome}`); },
  piece(d = 1) {
    const b = game.builder;
    if (b.selected === 'construir') b.cyclePiece(d);
    else if (b.hover?.pet) game.ui.openOverlay('pet');
    else if (!b.selected) { b.select('construir'); }
  },
  material(d = 1) { const b = game.builder; if (b.selected === 'construir') b.cycleMaterial(d); },
  pause() { if (photo.on) togglePhoto(false); if (document.pointerLockElement) document.exitPointerLock(); game.setMode('pause'); },
  resume() { game.gesture = true; game.setMode('play'); },
  menuPlay() { if (!$('#menu').classList.contains('hidden') && startPlay) startPlay(); },
};
function primaryClick() {
  const b = game.builder;
  if (b.selected || b.copyMode || b.pasteMode) b.place();
  else interact();
}
let drag = null;
renderer.domElement.addEventListener('mousedown', (e) => {
  if (!isActive() || photo.on) return;
  if (e.button === 0) {
    if (game.noLock) drag = { moved: 0 };
    else { primaryClick(); if (game.collector && !game.builder.selected) game.collector.mouseHeld = true; }
  }
  if (e.button === 2 && !game.builder.cancelBeltPath()) game.builder.removeHovered();
});
// modo sem trava do mouse: arrastar pra olhar, clique curto = ação
addEventListener('mousedown', (e) => { if (photo.on && game.noLock && e.button === 0 && game.mode === 'play') drag = { moved: 0 }; });
addEventListener('mousemove', (e) => {
  if (!drag || !game.noLock || game.mode !== 'play') return;
  drag.moved += Math.abs(e.movementX) + Math.abs(e.movementY);
  const s = 0.0035 * game.player.controls.pointerSpeed;
  camera.rotation.y -= e.movementX * s;
  camera.rotation.x = Math.max(-1.5, Math.min(1.5, camera.rotation.x - e.movementY * s));
});
addEventListener('mouseup', (e) => {
  if (e.button !== 0 || !drag) return;
  const d = drag;
  drag = null;
  if (d.moved < 6 && isActive() && !photo.on) primaryClick();
});
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('wheel', (e) => {
  if (!isActive()) return;
  if (photo.on) { photoWheel(e.deltaY); return; }
  game.builder.cycle(e.deltaY > 0 ? 1 : -1);
}, { passive: true });

function interact() {
  const h = game.builder.hover;
  if (!h) return;
  if (h.pet) { game.pet.pet(); return; }
  if (h.pickup) { collectPickup(h.pickup); return; }
  if (h.struct) {
    if (h.struct.kind === 'quadro') { const P = PAINTINGS[h.struct.painting]; game.ui.toast(`🖼️ <b>${P.nome}</b><br>${P.autor} · domínio público`); }
    return;
  }
  if (h.entity) {
    const e = h.entity;
    if (e.type === 'computador') game.ui.openOverlay('editor', e);
    else if (e.type === 'central') game.ui.openOverlay('hub', 'marcos');
    else if (e.type === 'bancada') game.ui.openOverlay('hub', 'bancada');
    else if (e.type === 'plataforma') game.ui.openOverlay('platform');
    else if (e.type === 'laboratorio') game.ui.openOverlay('research', e);
    else if (PANEL3.has(e.type)) game.ui.openOverlay('machine', e);
    else if (e.isMachine && !NO_PANEL.has(e.type)) game.ui.openOverlay('panel', e);
    return;
  }
  const a = h.interact?.action;
  if (!a) return;
  if (a === 'shop') game.ui.openOverlay('shop', 'maquinas');
  if (a === 'market') game.ui.openOverlay('shop', 'mercado');
  if (a === 'platform') game.ui.openOverlay('platform');
  if (a === 'contracts') game.ui.openOverlay('contracts');
  if (a === 'challenges') game.ui.openOverlay('challenges');
  if (a.startsWith('crate:')) openCrate(a.slice(6));
  if (a.startsWith('region:')) game.ui.buyRegion(a.slice(7));
  if (a === 'radio') { audio.nextTrack(); game.ui.toast(`🎵 ${audio.currentTrack().nome}`); }
  if (a === 'coffee') {
    game.player.drinkCoffee();
    const p = h.interact.obj.getWorldPosition(new THREE.Vector3());
    puff(new THREE.Vector3(p.x, p.y + 0.5, p.z), { color: 0xffffff, count: 6, size: 0.25, up: 0.5, life: 2, opacity: 0.5 });
    game.ui.toast('☕ Cafezinho! +30% de velocidade por 90 segundos.', 'good');
  }
}

// regiões compradas: tira as árvores
game.on('region', (id) => clearRegion(id));

// ─── loop ───
let last = performance.now(), fpsT = performance.now(), fpsN = 0;
let objTimer = 0, saveTimer = 30, powerTimer = 0, decorTimer = 0, achTimer = 3, recordTimer = 30;
game.on('moved', (e) => { if (e.instanced) markBeltsDirty(); });
function simStep(dt) {
  // multiplayer: o convidado não simula (quem manda é o anfitrião), só anima o que chega
  if (mp.isGuest) { if (mp.ready) mp.guestStep(dt); return; }
  game.time += dt;
  game.economy.update(dt);
  const ents = game.entities;
  powerTimer -= dt;
  if (powerTimer <= 0) { powerTimer = 0.25; updatePower(); }
  for (let i = 0; i < ents.length; i++) if (ents[i].items) ents[i].update(dt);
  for (let i = 0; i < ents.length; i++) if (!ents[i].items) ents[i].update(dt);
  updateDrones(dt);
  updateTimers();
  decorTimer -= dt;
  if (decorTimer <= 0) { decorTimer = 2; updateDecorBonus(); }
  objTimer -= dt;
  if (objTimer <= 0) { objTimer = 1; game.economy.checkObjective(); }
  updateEvents(dt);
  achTimer -= dt;
  if (achTimer <= 0) { achTimer = 2; game.economy.stats.paintingsHung = countPaintings(); game.economy.checkAchievements(); }
  recordTimer -= dt;
  if (recordTimer <= 0) { recordTimer = 30; game.economy.checkRecords(); }
  saveTimer -= dt;
  if (saveTimer <= 0) { saveTimer = 30; saveGame(); }
}
game.simStep = simStep;
function loop(now) {
  requestAnimationFrame(loop);
  const rawDt = (now - last) / 1000;
  const dt = Math.min(0.05, rawDt);
  if (rawDt < 1) watchFps(rawDt);
  last = now;
  // multiplayer: com gente na sala, a fábrica do anfitrião não pausa (nem no menu de pausa)
  const hostingLive = mp.role === 'host' && mp.peers.size > 0;
  const simulate = (game.mode === 'play' || game.mode === 'ui' || (hostingLive && game.mode !== 'menu')) && !(photo.on && photo.freeze && !hostingLive);
  if (simulate) simStep(dt);
  updateSky(dt, simulate || game.mode === 'menu');
  updateFx(dt);
  updateOrbit(dt);
  animateBelts(dt);
  updateMarketBoard(dt);
  if (game.landingActive) updateLanding(dt);
  if (game.mode === 'menu') updateMenuCamera(dt);
  else if (photo.on) updatePhoto(dt);
  else if (!game.debugCam) game.player.update(dt, isActive());
  if (game.mode === 'play' && !photo.on && !game.landingActive) game.builder.update();
  else { game.builder.hover = null; }
  if (game.collector) {
    const c = game.collector;
    c.held = !!(c.keyHeld || c.mouseHeld) && !game.builder.hover?.entity;
    c.update(dt, isActive() && !photo.on && !game.landingActive);
  }
  if (game.pet) game.pet.update(dt);
  updatePod(dt);
  game.ui.update(dt);
  // sol/lua acompanham o jogador (sombras)
  const p = camera.position;
  const d = game.sunDir || new THREE.Vector3(0.6, 0.7, 0.4);
  const gy = Math.round(p.y);
  game.sun.position.set(Math.round(p.x) + d.x * 120, gy + d.y * 120, Math.round(p.z) + d.z * 120);
  game.sun.target.position.set(Math.round(p.x), gy, Math.round(p.z));
  if (game.campfire) game.campfire.intensity = 7 + Math.sin(now * 0.013) * 1.2 + Math.sin(now * 0.031) * 0.8;
  updateGamepad(dt, actions);
  mp.update(dt);
  flushBelts();
  flushItems();
  flushStatic();
  flushFoundations();
  updateFlora(dt);
  updateLights(dt);
  updatePost();
  game.music?.update();
  renderFrame(scene, camera);
  if (game.mode === 'play' && !photo.on && !game.landingActive) game.collector?.render(renderer);
  // contador de FPS (Configurações → Mostrar FPS)
  fpsN++;
  if (now - fpsT >= 1000) {
    if (userSettings.fps) { const i = renderer.info.render; $('#fps').textContent = `${Math.round((fpsN * 1000) / (now - fpsT))} fps · ${i.calls} draws · ${shortGpu()}`; }
    game.fps = Math.round((fpsN * 1000) / (now - fpsT));
    fpsN = 0; fpsT = now;
  }
}
addEventListener('beforeunload', () => { if (!game.skipSave && game.economy) saveGame(); });

boot().catch((e) => {
  console.error(e);
  $('#load-text').textContent = 'Erro ao carregar: ' + e.message + (window.desktop ? ' — tente reinstalar o jogo.' : ' — abra pelo Jogar.bat (precisa do servidor local).');
});
