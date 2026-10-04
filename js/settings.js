// Configurações do jogador (salvas à parte do save da fábrica).
import { game } from './state.js';
import { setLightBudget } from './lights.js';
import { audio } from './audio.js';
import { setPalette, MODES } from './palette.js';
import { setupPost, resizePost } from './post.js';

const KEY = 'automaton_settings';
export const settings = {
  music: 0.45, sfx: 0.7, ambience: 0.35, sens: 0.8, fov: 72, quality: 'alta', musicOn: true, station: 0, pet: true, autocomplete: true, fps: false, nome: '',
  colorblind: 'normal', edFont: 14, padSens: 1, keys: {},
};

export function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s) Object.assign(settings, s);
  } catch { /* ignora */ }
  return settings;
}

export function saveSettings() {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* ignora */ }
}

export function applySettings() {
  audio.setVolume('music', settings.music);
  audio.setVolume('sfx', settings.sfx);
  audio.setVolume('ambience', settings.ambience);
  audio.musicOn = settings.musicOn;
  audio.music.on = settings.musicOn !== false;
  audio.music.setVolume(settings.music);
  if (game.pet) game.pet.setVisible(settings.pet !== false);
  if (game.player) game.player.controls.pointerSpeed = settings.sens;
  if (game.camera) { game.camera.fov = settings.fov; game.camera.updateProjectionMatrix(); }
  applyQuality();
  setPalette(settings.colorblind);
  game.ui?.editor?.setFont(settings.edFont);
}

export function applyQuality() {
  const r = game.renderer, sun = game.sun;
  if (!r) return;
  const q = settings.quality;
  r.setPixelRatio(q === 'alta' ? Math.min(devicePixelRatio, 1.75) : q === 'media' ? Math.min(devicePixelRatio, 1.25) : 1);
  r.setSize(innerWidth, innerHeight);
  setLightBudget(q === 'alta' ? 8 : q === 'media' ? 6 : 4);
  setupPost(q);
  resizePost();
  // flora até mais longe e nuvens detalhadas só na alta
  game.setFloraDistance?.(q === 'alta' ? 1 : q === 'media' ? 0.75 : 0.5);
  if (game.skyDome) game.skyDome.material.uniforms.uQuality.value = q === 'baixa' ? 0 : 1;
  if (sun) {
    sun.castShadow = q !== 'baixa';
    const size = q === 'alta' ? 2048 : 1024;
    if (sun.shadow.mapSize.x !== size) {
      sun.shadow.mapSize.set(size, size);
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    }
  }
}

const fmt = {
  music: (v) => Math.round(v * 100) + '%', sfx: (v) => Math.round(v * 100) + '%', ambience: (v) => Math.round(v * 100) + '%',
  sens: (v) => (+v).toFixed(2), fov: (v) => v + '°', edFont: (v) => v + 'px', padSens: (v) => (+v).toFixed(1) + '×',
};

function paint(input) {
  const k = input.dataset.setting;
  const min = +input.min, max = +input.max;
  input.value = settings[k];
  input.style.setProperty('--p', ((settings[k] - min) / (max - min)) * 100 + '%');
  const out = input.parentElement.querySelector('output');
  if (out) out.textContent = fmt[k](settings[k]);
}

export function bindSettingInputs() {
  const inputs = [...document.querySelectorAll('[data-setting]')];
  inputs.forEach((inp) => {
    paint(inp);
    inp.addEventListener('input', () => {
      settings[inp.dataset.setting] = +inp.value;
      inputs.filter((o) => o.dataset.setting === inp.dataset.setting).forEach(paint);
      applySettings();
      saveSettings();
    });
    if (inp.dataset.setting === 'sfx') inp.addEventListener('change', () => audio.play('click'));
  });
  const seg = document.getElementById('quality-seg');
  const paintQ = () => {
    seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.q === settings.quality));
    document.getElementById('quality-out').textContent = { alta: 'HQ', media: 'MQ', baixa: 'LQ' }[settings.quality];
  };
  seg.querySelectorAll('button').forEach((b) => {
    b.onclick = () => { settings.quality = b.dataset.q; paintQ(); applyQuality(); saveSettings(); audio.play('click', { volume: 0.5 }); };
    game.applyQualityUI = () => { paintQ(); applyQuality(); saveSettings(); };
  });
  paintQ();
  // liga/desliga
  const toggle = (id, keyName, after) => {
    const el = document.getElementById(id);
    const paint = () => el.querySelectorAll('button').forEach((b) => b.classList.toggle('on', (b.dataset.v === '1') === (settings[keyName] !== false)));
    el.querySelectorAll('button').forEach((b) => { b.onclick = (e) => { e.preventDefault(); settings[keyName] = b.dataset.v === '1'; paint(); after && after(); saveSettings(); audio.play('click', { volume: 0.5 }); }; });
    paint();
  };
  toggle('set-pet', 'pet', () => game.pet && game.pet.setVisible(settings.pet));
  // daltonismo
  const cb = document.getElementById('set-cb');
  cb.innerHTML = Object.entries(MODES).map(([k, n]) => `<option value="${k}">${n}</option>`).join('');
  cb.value = settings.colorblind || 'normal';
  cb.onchange = () => { settings.colorblind = cb.value; setPalette(cb.value); saveSettings(); };
  toggle('set-fps', 'fps', () => document.getElementById('fps')?.classList.toggle('hidden', !settings.fps));
  document.getElementById('fps')?.classList.toggle('hidden', !settings.fps);
  toggle('set-ac', 'autocomplete', () => { const cb = document.getElementById('ed-ac-toggle'); if (cb) cb.checked = settings.autocomplete; });
}

export function syncStation() { /* 3.0: sem rádio */ }
