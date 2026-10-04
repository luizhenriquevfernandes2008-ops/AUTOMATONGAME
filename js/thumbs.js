// Gera ícones (PNG) renderizando os modelos 3D de verdade.
import * as THREE from 'three';
import { assets, cloneModel } from './assets.js';
import { MACHINES, DECOR, ITEMS, PAINTINGS, OOPI_HATS } from './data.js';
import { MODEL_YAW } from './machines.js';
import { itemPreviewObject } from './itemMeshes.js';

export const thumbs = {};

export function generateThumbs() {
  const size = 128;
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setSize(size, size);
  r.setPixelRatio(1);
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  scene.environment = assets.envMap;
  scene.environmentIntensity = 0.8;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x554466, 1.4));
  const d = new THREE.DirectionalLight(0xffffff, 2);
  d.position.set(3, 5, 4);
  scene.add(d);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 100);

  const shot = (obj) => {
    scene.add(obj);
    const box = new THREE.Box3().setFromObject(obj);
    const c = box.getCenter(new THREE.Vector3());
    const s = box.getSize(new THREE.Vector3()).length();
    const dir = new THREE.Vector3(1, 0.8, 1.25).normalize();
    cam.position.copy(c).addScaledVector(dir, s * 1.9);
    cam.lookAt(c);
    r.render(scene, cam);
    const url = r.domElement.toDataURL('image/png');
    scene.remove(obj);
    return url;
  };

  for (const [k, def] of Object.entries({ ...MACHINES, ...DECOR })) {
    const m = cloneModel(def.model);
    m.rotation.y = (MODEL_YAW[def.model] || 0) + Math.PI;
    const g = new THREE.Group(); g.add(m);
    thumbs[k] = shot(g);
  }
  for (const k of Object.keys(ITEMS)) {
    const o = itemPreviewObject(k);
    thumbs['item:' + k] = shot(o);
  }
  for (const [k, h] of Object.entries(OOPI_HATS)) { const g = new THREE.Group(); g.add(cloneModel(h.model)); thumbs['hat:' + k] = shot(g); }
  r.dispose();
  r.forceContextLoss();
  // ícone do cabo
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.strokeStyle = '#2b2445'; g.lineWidth = 12; g.lineCap = 'round';
  g.beginPath(); g.moveTo(20, 100); g.bezierCurveTo(40, 40, 80, 120, 96, 50); g.stroke();
  g.strokeStyle = '#ffa640'; g.lineWidth = 5;
  g.beginPath(); g.moveTo(20, 100); g.bezierCurveTo(40, 40, 80, 120, 96, 50); g.stroke();
  g.fillStyle = '#ffd35a'; g.font = '56px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('⚡', 92, 36);
  thumbs.cabo = c.toDataURL('image/png');
  // ícone da construção
  g.clearRect(0, 0, 128, 128);
  g.font = '78px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('🧱', 58, 70);
  g.font = '44px sans-serif';
  g.fillText('🔨', 96, 36);
  thumbs.construir = c.toDataURL('image/png');
  // quadros: a própria imagem
  for (const [k, p] of Object.entries(PAINTINGS)) thumbs[k] = `assets/paintings/${p.img}.jpg`;
}
