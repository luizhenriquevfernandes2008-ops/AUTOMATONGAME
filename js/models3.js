// 3.0.2 · Prédios grandes (3×3, 4,5 m) no estilo industrial sci-fi de KX-7: aço escuro, faixas âmbar acesas,
// telinhas teal e partes que se mexem. Feitos por código (sem arquivo .glb) e "assados": as peças paradas
// de mesmo material viram uma malha só, pra cada prédio custar poucos desenhos.
// Partes com nome (o jogo anima): 'fire' (boca de fogo), 'glow' (luz que pulsa trabalhando),
// 'spin' (gira trabalhando), 'fuelpile' (pilha de combustível), 'chimneyTop' (de onde sai a fumaça), 'screen'.
// A frente (saída) é -z, como as setas do chão.
import * as THREE from 'three';
import { mergeGeometries } from '../lib/addons/utils/BufferGeometryUtils.js';

export const mat = {
  steel: new THREE.MeshStandardMaterial({ color: 0x8a94a3, metalness: 0.3, roughness: 0.42 }),
  steelL: new THREE.MeshStandardMaterial({ color: 0xb4bdc9, metalness: 0.3, roughness: 0.35 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x3a4049, metalness: 0.3, roughness: 0.6 }),
  plate: new THREE.MeshStandardMaterial({ color: 0x5c6573, metalness: 0.3, roughness: 0.5 }),
  amber: new THREE.MeshStandardMaterial({ color: 0xffb347, emissive: 0xff8a1a, emissiveIntensity: 0.55, metalness: 0.2, roughness: 0.4 }),
  amberDull: new THREE.MeshStandardMaterial({ color: 0xd98a2a, metalness: 0.3, roughness: 0.5 }),
  copper: new THREE.MeshStandardMaterial({ color: 0xc8743a, metalness: 0.75, roughness: 0.3 }),
  teal: new THREE.MeshStandardMaterial({ color: 0x0c2a2a, emissive: 0x3fe0cc, emissiveIntensity: 0.9, roughness: 0.3 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x9fe8ff, emissive: 0x2a8fa8, emissiveIntensity: 0.35, metalness: 0.1, roughness: 0.15, transparent: true, opacity: 0.85 }),
  concrete: new THREE.MeshStandardMaterial({ color: 0x8a8578, roughness: 0.9 }),
  rubber: new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.85 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x7a5236, roughness: 0.75 }),
};
// listras de perigo (âmbar e preto) desenhadas num canvas
const hazardTex = (() => {
  const c = document.createElement('canvas'); c.width = 128; c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = '#16181c'; g.fillRect(0, 0, 128, 32);
  g.fillStyle = '#ffae34';
  for (let x = -32; x < 160; x += 32) { g.beginPath(); g.moveTo(x, 32); g.lineTo(x + 16, 32); g.lineTo(x + 32, 0); g.lineTo(x + 16, 0); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping;
  return t;
})();
mat.funnel = new THREE.MeshStandardMaterial({ color: 0xb4bdc9, metalness: 0.55, roughness: 0.38, side: THREE.DoubleSide });
mat.hazard = new THREE.MeshStandardMaterial({ map: hazardTex, roughness: 0.6, metalness: 0.2 });
// ─── ajudantes ───
export function kit(g) {
  const add = (geo, m, x, y, z, o = {}) => {
    const mesh = new THREE.Mesh(geo, o.clone ? m.clone() : m);
    mesh.position.set(x, y, z);
    if (o.rx) mesh.rotation.x = o.rx; if (o.ry) mesh.rotation.y = o.ry; if (o.rz) mesh.rotation.z = o.rz;
    if (o.name) mesh.name = o.name;
    mesh.castShadow = o.shadow !== false; mesh.receiveShadow = true;
    (o.parent || g).add(mesh);
    return mesh;
  };
  const box = (w, h, d, m, x, y, z, o) => add(new THREE.BoxGeometry(w, h, d), m, x, y, z, o);
  const cyl = (rt, rb, h, m, x, y, z, o = {}) => add(new THREE.CylinderGeometry(rt, rb, h, o.seg || 16, 1, !!o.open), m, x, y, z, o);
  // placa de base com borda âmbar (todo prédio grande tem)
  const plinth = (s, h = 0.22) => {
    box(s, h, s, mat.dark, 0, h / 2, 0);
    box(s + 0.04, 0.05, s + 0.04, mat.amberDull, 0, h - 0.02, 0);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(0.22, h + 0.06, 0.22, mat.steelL, x * (s / 2 - 0.11), (h + 0.06) / 2, z * (s / 2 - 0.11));
  };
  return { add, box, cyl, plinth };
}
// lugar da luz de status (Machine põe a luzinha aqui, encostada na frente do prédio)
export function status(g, x, y, z) { const o = new THREE.Object3D(); o.name = 'status'; o.position.set(x, y, z); g.add(o); }
// junta as malhas paradas de mesmo material numa só
export function bake(g) {
  const groups = new Map(), keep = [];
  g.updateMatrixWorld(true);
  g.traverse((o) => {
    if (o === g) return;
    if (!o.isMesh) { if (o.name) keep.push(o); return; }
    if (o.name || o.material.transparent) { keep.push(o); return; }
    const geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    const list = groups.get(o.material) || [];
    list.push(geo.index ? geo.toNonIndexed() : geo);
    groups.set(o.material, list);
  });
  const out = new THREE.Group();
  for (const [m, geos] of groups) {
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, m);
    mesh.castShadow = true; mesh.receiveShadow = true;
    out.add(mesh);
  }
  for (const o of keep) {
    const w = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    o.matrixWorld.decompose(w, q, s);
    o.parent?.remove(o);
    o.position.copy(w); o.quaternion.copy(q); o.scale.copy(s);
    out.add(o);
  }
  return out;
}

// ─── Fornalha 3×3 ───
function smelter() {
  const g = new THREE.Group();
  const { box, cyl, plinth, add } = kit(g);
  plinth(4.2);
  // corpo do forno
  box(2.7, 2.2, 2.4, mat.steel, 0, 1.32, 0.25);
  box(2.78, 0.16, 2.48, mat.amber, 0, 0.6, 0.25);
  box(2.8, 0.12, 2.5, mat.plate, 0, 2.46, 0.25);
  for (const x of [-1.05, -0.35, 0.35, 1.05]) box(0.08, 1.7, 0.06, mat.plate, x, 1.35, -0.96); // nervuras da frente
  // cadinho em cima, com a borda incandescente
  cyl(0.95, 1.05, 0.55, mat.dark, 0, 2.8, 0.35, { seg: 20 });
  add(new THREE.TorusGeometry(0.9, 0.07, 8, 28), mat.amber, 0, 3.08, 0.35, { rx: Math.PI / 2, name: 'glow', clone: true });
  add(new THREE.CircleGeometry(0.85, 24), new THREE.MeshStandardMaterial({ color: 0x3a1000, emissive: 0xff5a10, emissiveIntensity: 1.2 }), 0, 3.06, 0.35, { rx: -Math.PI / 2, name: 'fire' });
  // boca da frente com grade + calha de metal derretido até a saída
  box(1.2, 0.8, 0.12, mat.dark, 0, 1.1, -0.96);
  add(new THREE.PlaneGeometry(1.0, 0.6), new THREE.MeshStandardMaterial({ color: 0x2a0800, emissive: 0xff6a1a, emissiveIntensity: 1 }), 0, 1.1, -1.03, { ry: Math.PI, name: 'fire', shadow: false });
  for (let i = -2; i <= 2; i++) box(0.05, 0.62, 0.05, mat.dark, i * 0.2, 1.1, -1.06);
  box(0.6, 0.14, 1.1, mat.dark, 0, 0.42, -1.55);
  add(new THREE.BoxGeometry(0.38, 0.04, 1.05), new THREE.MeshStandardMaterial({ color: 0x401000, emissive: 0xff7a20, emissiveIntensity: 1.3 }), 0, 0.5, -1.55, { name: 'glow' });
  // chaminés atrás
  for (const x of [-0.95, 0.95]) {
    cyl(0.2, 0.24, 2.3, mat.dark, x, 3.25, 1.45);
    cyl(0.28, 0.28, 0.14, mat.steelL, x, 4.4, 1.45);
    cyl(0.26, 0.26, 0.08, mat.amber, x, 2.6, 1.45);
  }
  const top = new THREE.Object3D(); top.name = 'chimneyTop'; top.position.set(-0.95, 4.5, 1.45); g.add(top);
  // funis de entrada nos lados e atrás
  for (const [x, z, ry] of [[-1.75, 0.25, Math.PI / 2], [1.75, 0.25, -Math.PI / 2], [0, 1.85, 0]]) {
    box(0.9, 0.5, 0.5, mat.plate, x, 0.7, z, { ry });
    box(0.92, 0.06, 0.52, mat.amberDull, x, 0.97, z, { ry });
  }
  // canos de cobre
  cyl(0.07, 0.07, 2.4, mat.copper, 1.45, 1.6, 0.25, { rx: Math.PI / 2, seg: 10 });
  cyl(0.07, 0.07, 1.4, mat.copper, 1.45, 0.95, -0.95, { seg: 10 });
  // painel de controle com tela
  box(0.6, 1.0, 0.35, mat.steelL, 1.55, 0.72, -1.45);
  add(new THREE.PlaneGeometry(0.44, 0.3), mat.teal, 1.55, 1.0, -1.63, { ry: Math.PI, name: 'screen', clone: true, shadow: false });
  status(g, -1.36, 1.7, -0.95); // luz de status da máquina
  const out = bake(g);
  return { g: out, size: new THREE.Vector3(4.5, 4.5, 4.5) };
}

// ─── Gerador de Biomassa 3×3 ───
export function burner(coal = false) {
  const g = new THREE.Group();
  const { box, cyl, plinth, add } = kit(g);
  plinth(4.2);
  // caldeira
  cyl(1.05, 1.15, 2.2, coal ? mat.plate : mat.steel, -0.55, 1.32, 0.1, { seg: 22 });
  cyl(1.18, 1.18, 0.12, mat.amber, -0.55, 0.62, 0.1, { seg: 22 });
  cyl(1.1, 1.1, 0.1, mat.plate, -0.55, 2.47, 0.1, { seg: 22 });
  for (let i = 0; i < 3; i++) cyl(1.08, 1.08, 0.05, mat.plate, -0.55, 1.0 + i * 0.5, 0.1, { seg: 22 });
  // boca de fogo na frente (-z)
  box(0.95, 0.75, 0.3, mat.dark, -0.55, 1.05, -0.95);
  add(new THREE.PlaneGeometry(0.75, 0.55), new THREE.MeshStandardMaterial({ color: 0x220800, emissive: 0xff6a1a, emissiveIntensity: 0.05 }), -0.55, 1.05, -1.11, { ry: Math.PI, name: 'fire', shadow: false });
  for (let i = -2; i <= 2; i++) box(0.04, 0.58, 0.04, mat.dark, -0.55 + i * 0.15, 1.05, -1.13);
  // funil de combustível em cima, com a pilha de biomassa
  add(new THREE.CylinderGeometry(0.9, 0.38, 0.7, 18, 1, true), mat.funnel, -0.55, 2.85, 0.1);
  add(new THREE.CylinderGeometry(0.72, 0.72, 0.1, 18), new THREE.MeshStandardMaterial({ color: coal ? 0x1c1c22 : 0x6f8a3a, roughness: 0.9 }), -0.55, 2.7, 0.1, { name: 'fuelpile' });
  // duas chaminés
  for (const [x, z] of [[-1.5, 1.2], [0.35, 1.25]]) {
    cyl(0.17, 0.2, 2.6, mat.dark, x, 2.9, z);
    cyl(0.25, 0.25, 0.12, mat.steelL, x, 4.22, z);
  }
  const top = new THREE.Object3D(); top.name = 'chimneyTop'; top.position.set(-1.5, 4.35, 1.2); g.add(top);
  // gerador: carcaça com bobinas de cobre e o rotor que gira
  box(1.3, 1.4, 1.9, mat.steel, 1.25, 0.92, 0.0);
  box(1.34, 0.1, 1.94, mat.amber, 1.25, 1.67, 0.0);
  for (let i = -1; i <= 1; i++) add(new THREE.TorusGeometry(0.42, 0.1, 10, 22), mat.copper, 1.25, 1.0, i * 0.55, { ry: 0 });
  const rotor = add(new THREE.CylinderGeometry(0.16, 0.16, 2.3, 10), mat.steelL, 1.25, 1.0, 0, { rx: Math.PI / 2, name: 'spinz' });
  rotor.userData.axis = 'z';
  // cano de vapor da caldeira pro gerador
  cyl(0.1, 0.1, 1.2, mat.copper, 0.35, 1.9, 0.1, { rz: Math.PI / 2, seg: 10 });
  cyl(0.1, 0.1, 0.7, mat.copper, 0.95, 1.6, 0.1, { seg: 10 });
  // painel com raio
  box(0.5, 0.9, 0.3, mat.steelL, 1.55, 0.68, -1.45);
  add(new THREE.PlaneGeometry(0.36, 0.26), mat.teal, 1.55, 0.92, -1.61, { ry: Math.PI, name: 'screen', clone: true, shadow: false });
  status(g, 1.25, 1.1, -0.96); // luz de status da máquina
  return { g: bake(g), size: new THREE.Vector3(4.5, 4.4, 4.5) };
}

// ─── Contêiner 3×3: depósito industrial (porta-pallets com caixas à vista, cobertura e porta de rolo) ───
// As caixas têm nome 'crate' e aparecem conforme o depósito enche (Chest.animate).
function container() {
  const g = new THREE.Group();
  const { box, cyl, add } = kit(g);
  const H = 2.25;
  // laje de concreto com borda âmbar
  box(4.2, 0.14, 4.2, mat.concrete, 0, 0.07, 0);
  box(4.24, 0.04, 4.24, mat.amberDull, 0, 0.15, 0);
  // colunas (com pé listrado de perigo) e vigas de cima
  for (const [x, z] of [[-1.85, -1.4], [1.85, -1.4], [-1.85, 1.75], [1.85, 1.75], [0, 1.75]]) {
    box(0.16, H, 0.16, mat.steel, x, 0.15 + H / 2, z);
    const hz = add(new THREE.BoxGeometry(0.18, 0.35, 0.18), mat.hazard, x, 0.33, z);
    hz.material.map.repeat.set(1, 1);
  }
  box(3.86, 0.14, 0.14, mat.steel, 0, 0.15 + H, -1.4);
  box(3.86, 0.14, 0.14, mat.steel, 0, 0.15 + H, 1.75);
  for (const x of [-1.85, 1.85]) box(0.14, 0.14, 3.3, mat.steel, x, 0.15 + H, 0.18);
  // prateleiras do porta-pallets (2 níveis) com longarinas âmbar
  for (const y of [0.35, 1.2]) {
    for (const z of [-1.1, 1.45]) box(3.7, 0.08, 0.08, mat.amber, 0, y, z);
    box(3.7, 0.04, 2.55, mat.plate, 0, y + 0.02, 0.18);
  }
  // diagonais de travamento nas laterais
  for (const x of [-1.86, 1.86]) {
    const d = add(new THREE.BoxGeometry(0.05, 2.0, 0.05), mat.steelL, x, 1.2, 0.18);
    d.rotation.x = 0.95;
  }
  // pallets + caixas (aparecem conforme enche): 2 níveis × 3 colunas × 2 fundos
  const crateMats = [mat.amberDull, mat.wood, mat.steelL, mat.copper];
  let k = 0;
  for (const y of [0.4, 1.25]) for (const x of [-1.2, 0, 1.2]) for (const z of [-0.5, 0.85]) {
    box(1.0, 0.1, 1.0, mat.wood, x, y + 0.07, z); // pallet (sempre aparece)
    const h = 0.42 + ((k * 37) % 5) * 0.06;
    const c = add(new THREE.BoxGeometry(0.86, h, 0.86), crateMats[k % crateMats.length], x, y + 0.12 + h / 2, z, { name: 'crate' });
    c.userData.order = [0, 6, 2, 8, 4, 10, 1, 7, 3, 9, 5, 11][k];
    k++;
  }
  // cobertura de chapa ondulada, um pouco inclinada
  const roof = new THREE.Group(); roof.position.set(0, 0.15 + H + 0.18, 0.18); roof.rotation.x = -0.08; g.add(roof);
  add(new THREE.BoxGeometry(4.3, 0.06, 3.8), mat.plate, 0, 0, 0, { parent: roof });
  for (let i = -9; i <= 9; i++) add(new THREE.BoxGeometry(0.1, 0.06, 3.8), mat.steelL, i * 0.23, 0.05, 0, { parent: roof });
  add(new THREE.BoxGeometry(4.34, 0.1, 0.08), mat.amber, 0, 0.02, -1.92, { parent: roof });
  // porta de rolo na frente, meio aberta (o rolo em cima + lâminas)
  cyl(0.16, 0.16, 1.7, mat.steelL, 0, 0.15 + H - 0.1, -1.5, { rz: Math.PI / 2, seg: 12 });
  for (let i = 0; i < 6; i++) box(1.55, 0.12, 0.05, mat.steel, 0, 0.15 + H - 0.3 - i * 0.13, -1.5);
  box(0.1, H - 0.2, 0.12, mat.dark, -0.85, 0.15 + (H - 0.2) / 2, -1.5);
  box(0.1, H - 0.2, 0.12, mat.dark, 0.85, 0.15 + (H - 0.2) / 2, -1.5);
  // calha de saída
  box(0.85, 0.1, 0.6, mat.dark, 0, 0.24, -1.95);
  // terminal com tela (mostra o quanto está cheio)
  box(0.42, 1.0, 0.3, mat.steelL, 1.55, 0.65, -1.7);
  add(new THREE.PlaneGeometry(0.32, 0.4), mat.teal, 1.55, 0.92, -1.86, { ry: Math.PI, name: 'screen', clone: true, shadow: false });
  add(new THREE.SphereGeometry(0.09, 12, 8), mat.amber, 1.85, 0.15 + H + 0.12, -1.42, { name: 'glow', clone: true });
  status(g, -1.45, 1.75, -1.5); // luz de status da máquina
  return { g: bake(g), size: new THREE.Vector3(4.5, 2.7, 4.5) };
}

// ─── Bancada 3×3 ───
function workbench() {
  const g = new THREE.Group();
  const { box, cyl, add } = kit(g);
  box(4.2, 0.1, 3.2, mat.plate, 0, 0.05, 0.3);
  box(4.24, 0.03, 3.24, mat.amberDull, 0, 0.11, 0.3);
  // mesa grande: tampo de madeira com borda de aço
  box(3.6, 0.12, 1.5, mat.wood, 0, 1.02, 0.2);
  box(3.66, 0.06, 1.56, mat.steelL, 0, 0.94, 0.2);
  for (const [x, z] of [[-1.7, -0.45], [1.7, -0.45], [-1.7, 0.85], [1.7, 0.85]]) box(0.1, 0.92, 0.1, mat.steel, x, 0.48, z);
  box(3.4, 0.06, 1.3, mat.plate, 0, 0.35, 0.2); // prateleira de baixo
  for (let i = 0; i < 3; i++) box(0.5, 0.35, 0.45, i === 1 ? mat.amberDull : mat.steel, -1.1 + i * 0.75, 0.56, 0.4);
  // painel de ferramentas atrás (pegboard) com ferramentas
  box(3.6, 1.6, 0.1, mat.dark, 0, 1.95, 0.98);
  box(3.66, 0.08, 0.14, mat.amber, 0, 2.78, 0.98);
  for (const [x, h] of [[-1.4, 0.55], [-1.1, 0.45], [-0.8, 0.6], [1.0, 0.5], [1.3, 0.4]]) { box(0.06, h, 0.04, mat.steelL, x, 1.95, 0.9); box(0.18, 0.08, 0.05, mat.steelL, x, 1.95 + h / 2, 0.9); }
  add(new THREE.TorusGeometry(0.2, 0.06, 8, 16), mat.amberDull, 0.4, 2.1, 0.9);
  // tela holográfica num braço
  cyl(0.04, 0.04, 0.9, mat.steelL, -0.2, 1.5, 0.75, { seg: 8 });
  box(1.1, 0.65, 0.05, mat.dark, -0.2, 2.0, 0.62);
  add(new THREE.PlaneGeometry(1.0, 0.56), mat.teal, -0.2, 2.0, 0.59, { ry: Math.PI, name: 'screen', clone: true, shadow: false });
  // morsa, engrenagem e peças em cima da mesa
  box(0.35, 0.25, 0.3, mat.steel, 1.35, 1.2, 0.0);
  box(0.12, 0.12, 0.5, mat.steelL, 1.35, 1.36, -0.15);
  const cog = add(new THREE.CylinderGeometry(0.28, 0.28, 0.08, 12), mat.copper, -1.15, 1.13, -0.05, { name: 'spin' });
  cog.userData.axis = 'y';
  box(0.3, 0.06, 0.2, mat.steelL, 0.55, 1.11, -0.2);
  box(0.12, 0.18, 0.12, mat.amberDull, 0.85, 1.17, 0.1);
  // luminária
  cyl(0.03, 0.03, 1.0, mat.steelL, 1.6, 1.55, 0.7, { seg: 8 });
  cyl(0.18, 0.08, 0.16, mat.dark, 1.45, 2.05, 0.55, { rz: 0.5 });
  add(new THREE.SphereGeometry(0.08, 10, 8), mat.amber, 1.42, 1.98, 0.52, { name: 'glow', clone: true });
  status(g, 1.2, 0.94, -0.6);
  return { g: bake(g), size: new THREE.Vector3(4.5, 3.0, 4.5) };
}

// ─── Poste: torre de treliça com isoladores e farol ───
function pylon() {
  const g = new THREE.Group();
  const { box, cyl, add } = kit(g);
  const H = 4.6, b = 0.62, t = 0.2;
  box(1.45, 0.3, 1.45, mat.concrete, 0, 0.15, 0);
  box(1.5, 0.05, 1.5, mat.amberDull, 0, 0.31, 0);
  const legs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const P = (k, f) => new THREE.Vector3(k[0] * (b + (t - b) * f), 0.3 + f * (H - 0.3), k[1] * (b + (t - b) * f));
  const beam = (a, c, r, m) => {
    const len = a.distanceTo(c);
    const m2 = add(new THREE.BoxGeometry(r * 2, len, r * 2), m, (a.x + c.x) / 2, (a.y + c.y) / 2, (a.z + c.z) / 2);
    m2.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), c.clone().sub(a).normalize());
  };
  for (const k of legs) beam(P(k, 0), P(k, 1), 0.075, mat.steel);
  const levels = [0, 0.22, 0.44, 0.66, 0.85, 1];
  for (let i = 0; i < levels.length - 1; i++) {
    for (let s2 = 0; s2 < 4; s2++) {
      const k1 = legs[s2], k2 = legs[(s2 + 1) % 4];
      beam(P(k1, levels[i]), P(k2, levels[i + 1]), 0.04, mat.steelL);
      beam(P(k1, levels[i + 1]), P(k2, levels[i + 1]), 0.05, i === 1 ? mat.amberDull : mat.steel);
    }
  }
  // braço de cima com isoladores de vidro
  box(2.0, 0.16, 0.18, mat.steel, 0, H + 0.05, 0);
  box(2.04, 0.05, 0.2, mat.amber, 0, H + 0.15, 0);
  for (const x of [-0.85, 0.85]) {
    for (let i = 0; i < 4; i++) cyl(0.12 - i * 0.012, 0.12 - i * 0.012, 0.06, mat.glass, x, H - 0.06 - i * 0.1, 0, { seg: 12 });
    cyl(0.03, 0.03, 0.45, mat.steelL, x, H - 0.22, 0, { seg: 6 });
  }
  // placa de raio e farol âmbar no topo
  cyl(0.06, 0.06, 0.4, mat.steelL, 0, H + 0.4, 0, { seg: 8 });
  add(new THREE.SphereGeometry(0.15, 14, 10), mat.amber, 0, H + 0.65, 0, { name: 'glow', clone: true });
  return { g: bake(g), size: new THREE.Vector3(2.0, H + 0.8, 2.0) };
}

// registra no catálogo de modelos (chamado pelo assets.js depois de carregar os .glb)
export function buildBigModels(M, wrap) {
  for (const [k, fn] of Object.entries({ smelter3: smelter, burner3: burner, container3: container, workbench3: workbench, pylon3: pylon })) {
    const { g, size } = fn();
    M[k] = wrap(g, size);
  }
}
