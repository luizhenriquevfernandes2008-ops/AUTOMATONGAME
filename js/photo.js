// Modo foto: esconde a interface, câmera livre voando e captura PNG.
import { renderFrame } from './post.js';
import { heightAt } from './terrain.js';
import * as THREE from 'three';
import { game } from './state.js';
import { audio } from './audio.js';

export const photo = { on: false, freeze: false, fov: 60, hint: true };
const $ = (s) => document.querySelector(s);

export function togglePhoto(force) {
  photo.on = force ?? !photo.on;
  document.body.classList.toggle('photo-mode', photo.on);
  $('#photo-hint').classList.toggle('hidden', !photo.on);
  if (photo.on) {
    game.player.stop();
    photo.saved = { p: game.camera.position.clone(), fov: game.camera.fov };
    photo.fov = game.camera.fov;
    game.builder.select(null);
    audio.play('open', { volume: 0.4 });
  } else {
    game.player.stop();
    if (photo.saved) { game.camera.position.copy(photo.saved.p); game.camera.fov = photo.saved.fov; game.camera.updateProjectionMatrix(); }
    photo.freeze = false;
    audio.play('close', { volume: 0.4 });
  }
}

export function photoKey(e) {
  if (!photo.on) return false;
  switch (e.code) {
    case 'KeyP': togglePhoto(false); return true;
    case 'KeyF': case 'Enter': capture(); return true;
    case 'KeyT': photo.freeze = !photo.freeze; game.ui.toast(photo.freeze ? '⏸ Tempo congelado' : '▶ Tempo andando'); return true;
    case 'KeyH': photo.hint = !photo.hint; $('#photo-hint').classList.toggle('hidden', !photo.hint); return true;
    case 'KeyN': game.sky.t = (game.sky.t + 0.05) % 1; return true; // avança o horário
  }
  return true; // engole as outras teclas
}

export function photoWheel(dy) {
  photo.fov = Math.max(15, Math.min(100, photo.fov + (dy > 0 ? 4 : -4)));
  game.camera.fov = photo.fov;
  game.camera.updateProjectionMatrix();
}

export function updatePhoto(dt) {
  const k = game.player.keys;
  const cam = game.camera;
  const fwd = new THREE.Vector3();
  cam.getWorldDirection(fwd);
  const right = new THREE.Vector3().crossVectors(fwd, cam.up).normalize();
  const v = new THREE.Vector3();
  if (k.KeyW) v.add(fwd);
  if (k.KeyS) v.sub(fwd);
  if (k.KeyD) v.add(right);
  if (k.KeyA) v.sub(right);
  if (k.Space) v.y += 1;
  if (k.KeyC || k.ControlLeft) v.y -= 1;
  if (v.lengthSq()) v.normalize().multiplyScalar((k.ShiftLeft ? 18 : 6) * dt);
  cam.position.add(v);
  cam.position.y = Math.max(heightAt(cam.position.x, cam.position.z) + 0.3, Math.min(420, cam.position.y));
}

function capture() {
  const r = game.renderer;
  renderFrame(game.scene, game.camera);
  const url = r.domElement.toDataURL('image/png');
  const a = document.createElement('a');
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  a.download = `automaton_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.png`;
  a.href = url;
  a.click();
  game.economy.stats.photos = (game.economy.stats.photos || 0) + 1;
  audio.play('photo', { volume: 0.6 });
  const f = $('#photo-flash');
  f.classList.remove('flash');
  void f.offsetWidth;
  f.classList.add('flash');
}
