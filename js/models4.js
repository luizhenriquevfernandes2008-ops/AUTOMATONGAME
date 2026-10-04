// 3.0.4 · Segunda leva de modelos feitos por código, no mesmo estilo industrial sci-fi:
// minerador, construtora, montadora e laboratório (3×3), gerador a carvão, Central, cápsula de pouso,
// computador, painel solar, lâmpada, divisor, juntador, separador e as esteiras (reta e curva).
// Nomes nas peças (o jogo anima, ver Machine.animateParts): 'spin' (gira em y), 'spinx'/'spinz' (gira no eixo),
// 'bob' (sobe e desce trabalhando), 'glow', 'fire', 'screen'. Vários nomes separados por espaço.
// A frente (saída) é -z.
import * as THREE from 'three';
import { mat, kit, bake, burner, status } from './models3.js';

const CELL = 1.5;
const BELT_Y = 0.4 * CELL;
const rubber = new THREE.MeshStandardMaterial({ color: 0x24272d, roughness: 0.85, metalness: 0.05 });
// faixa lateral da esteira: a cor muda com o Mk (machines.js troca a cor desta peça)
export const beltStripe = new THREE.MeshStandardMaterial({ color: 0xc8ccd2, roughness: 0.45, metalness: 0.3, emissive: 0x111111 });
beltStripe.userData.tierStripe = true;
const tealGlass = new THREE.MeshStandardMaterial({ color: 0x9fe8ff, emissive: 0x2a8fa8, emissiveIntensity: 0.25, metalness: 0.1, roughness: 0.1, transparent: true, opacity: 0.35, depthWrite: false });
const liquid = (c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.8, roughness: 0.3 });

// ─── esteiras (feitas ao longo do eixo x, como o modelo antigo) ───
function beltStraight() {
  const g = new THREE.Group();
  const { box, cyl } = kit(g);
  const L = CELL, W = 0.95;
  box(L, 0.06, W, rubber, 0, BELT_Y - 0.03, 0);
  for (const s of [-1, 1]) {
    box(L, 0.17, 0.08, mat.steel, 0, BELT_Y + 0.02, s * (W / 2 + 0.04));
    box(L, 0.05, 0.025, beltStripe, 0, BELT_Y + 0.03, s * (W / 2 + 0.092));
  }
  for (let x = -0.6; x <= 0.61; x += 0.3) cyl(0.05, 0.05, W, mat.steelL, x, BELT_Y - 0.1, 0, { rx: Math.PI / 2, seg: 8 });
  box(L, 0.05, W * 0.85, mat.dark, 0, BELT_Y - 0.17, 0);
  // pés
  for (const s of [-1, 1]) {
    box(0.07, BELT_Y - 0.19, 0.07, mat.steel, 0, (BELT_Y - 0.19) / 2, s * 0.38);
    box(0.2, 0.03, 0.2, mat.dark, 0, 0.015, s * 0.38);
  }
  box(0.05, 0.05, 0.76, mat.steel, 0, 0.18, 0);
  return { g: bake(g), size: new THREE.Vector3(CELL, BELT_Y + 0.12, CELL) };
}
// curva: liga o lado oeste (-x) ao sul (+z), em volta do canto (-x, +z)
function beltCorner() {
  const g = new THREE.Group();
  const { add } = kit(g);
  const R = CELL / 2, W = 0.95, N = 8, cx = -CELL / 2, cz = CELL / 2;
  const seg = (r, h, d, m, y, th0, th1) => {
    const th = (th0 + th1) / 2, len = r * (th1 - th0) * 1.06;
    const mesh = add(new THREE.BoxGeometry(len, h, d), m, cx + Math.cos(th) * r, y, cz + Math.sin(th) * r);
    mesh.rotation.y = -Math.atan2(Math.cos(th), -Math.sin(th));
  };
  for (let i = 0; i < N; i++) {
    const a0 = -Math.PI / 2 + (i / N) * Math.PI / 2, a1 = -Math.PI / 2 + ((i + 1) / N) * Math.PI / 2;
    seg(R, 0.06, W, rubber, BELT_Y - 0.03, a0, a1);
    seg(R - W / 2 - 0.04, 0.17, 0.08, mat.steel, BELT_Y + 0.02, a0, a1);
    seg(R + W / 2 + 0.04, 0.17, 0.08, mat.steel, BELT_Y + 0.02, a0, a1);
    seg(R + W / 2 + 0.092, 0.05, 0.025, beltStripe, BELT_Y + 0.03, a0, a1);
    seg(R, 0.05, W * 0.85, mat.dark, BELT_Y - 0.17, a0, a1);
  }
  const th = -Math.PI / 4;
  const lx = cx + Math.cos(th) * R, lz = cz + Math.sin(th) * R;
  add(new THREE.BoxGeometry(0.07, BELT_Y - 0.19, 0.07), mat.steel, lx, (BELT_Y - 0.19) / 2, lz);
  add(new THREE.BoxGeometry(0.2, 0.03, 0.2), mat.dark, lx, 0.015, lz);
  return { g: bake(g), size: new THREE.Vector3(CELL, BELT_Y + 0.12, CELL) };
}

// ─── base de esteira com caixa em cima (divisor, juntador, separador) ───
function router(kind) {
  const g = new THREE.Group();
  const { box, add } = kit(g);
  box(1.4, 0.06, 1.4, rubber, 0, BELT_Y - 0.03, 0);
  box(1.44, 0.05, 1.44, mat.dark, 0, BELT_Y - 0.17, 0);
  for (const [x, z] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) box(0.09, BELT_Y - 0.15, 0.09, mat.steel, x, (BELT_Y - 0.15) / 2, z);
  const H = kind === 'sorter' ? 1.25 : 0.85;
  // caixa com aberturas nos 4 lados (na altura da esteira)
  box(1.0, H - 0.45, 1.0, mat.steel, 0, BELT_Y + 0.45 + (H - 0.45) / 2, 0);
  for (const [x, z] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) box(0.1, H, 0.1, mat.amberDull, x, BELT_Y + H / 2, z);
  box(1.06, 0.08, 1.06, mat.plate, 0, BELT_Y + H + 0.04, 0);
  box(1.08, 0.04, 1.08, mat.amber, 0, BELT_Y + 0.46, 0);
  if (kind === 'sorter') {
    add(new THREE.PlaneGeometry(0.6, 0.32), mat.teal, 0, BELT_Y + 0.95, -0.51, { ry: Math.PI, name: 'screen', clone: true, shadow: false });
    add(new THREE.BoxGeometry(0.9, 0.03, 0.03), mat.amber, 0, BELT_Y + 0.42, -0.52, { name: 'glow', clone: true });
    status(g, 0.32, BELT_Y + 1.2, -0.52);
  }
  return { g: bake(g), size: new THREE.Vector3(CELL, BELT_Y + H + 0.1, CELL) };
}

// ─── Minerador 3×3 (fica centralizado em cima do veio) ───
function miner() {
  const g = new THREE.Group();
  const { box, cyl, add } = kit(g);
  // pés nos cantos e moldura
  for (const [x, z] of [[-1.75, -1.75], [1.75, -1.75], [-1.75, 1.75], [1.75, 1.75]]) {
    box(0.55, 0.16, 0.55, mat.dark, x, 0.08, z);
    box(0.22, 0.75, 0.22, mat.steel, x, 0.5, z);
    const hz = add(new THREE.BoxGeometry(0.24, 0.3, 0.24), mat.hazard, x, 0.33, z);
    hz.material.map.repeat.set(1, 1);
  }
  for (const s of [-1, 1]) { box(3.72, 0.18, 0.2, mat.steel, 0, 0.92, s * 1.75); box(0.2, 0.18, 3.72, mat.steel, s * 1.75, 0.92, 0); }
  box(3.74, 0.05, 0.22, mat.amber, 0, 1.03, -1.75);
  // plataforma com furo no meio + braços diagonais até a torre
  box(1.6, 0.12, 1.6, mat.plate, 0, 1.0, 0);
  // braços: do canto da moldura até a torre
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const B = new THREE.Vector3(x * 1.68, 0.95, z * 1.68), T = new THREE.Vector3(x * 0.6, 3.0, z * 0.6);
    const d = T.clone().sub(B);
    const b = add(new THREE.BoxGeometry(0.12, d.length(), 0.12), mat.steelL, (B.x + T.x) / 2, (B.y + T.y) / 2, (B.z + T.z) / 2);
    b.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  }
  // torre
  for (const [x, z] of [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]]) box(0.16, 2.6, 0.16, mat.steel, x, 2.3, z);
  for (const y of [1.6, 2.4, 3.2]) { box(1.26, 0.1, 0.1, mat.steelL, 0, y, -0.55); box(1.26, 0.1, 0.1, mat.steelL, 0, y, 0.55); box(0.1, 0.1, 1.26, mat.steelL, -0.55, y, 0); box(0.1, 0.1, 1.26, mat.steelL, 0.55, y, 0); }
  // motor em cima
  box(1.5, 0.8, 1.5, mat.steel, 0, 3.95, 0);
  box(1.54, 0.12, 1.54, mat.amber, 0, 3.62, 0);
  box(1.3, 0.12, 1.3, mat.plate, 0, 4.41, 0);
  add(new THREE.CylinderGeometry(0.42, 0.42, 0.18, 12), mat.dark, 0, 4.55, 0, { name: 'spin' });
  add(new THREE.SphereGeometry(0.1, 10, 8), mat.amber, 0.6, 4.5, -0.6, { name: 'glow', clone: true });
  // broca: eixo + ponta (giram e sobem/descem)
  add(new THREE.CylinderGeometry(0.11, 0.11, 2.6, 10), mat.steelL, 0, 2.15, 0, { name: 'spin bob' });
  add(new THREE.ConeGeometry(0.34, 0.75, 10), mat.amberDull, 0, 0.62, 0, { rx: Math.PI, name: 'spin bob' });
  cyl(0.5, 0.55, 0.1, mat.dark, 0, 0.06, 0, { seg: 16 });
  // calha de saída até a frente com esteirinha
  const ch = add(new THREE.BoxGeometry(0.75, 0.08, 1.7), rubber, 0, 0.8, -1.35); ch.rotation.x = -0.12;
  for (const s of [-1, 1]) { const r = add(new THREE.BoxGeometry(0.06, 0.16, 1.7), mat.steel, s * 0.4, 0.86, -1.35); r.rotation.x = -0.12; }
  // cabine do operador
  box(0.9, 1.0, 0.9, mat.steel, 1.2, 1.55, 1.0);
  add(new THREE.PlaneGeometry(0.62, 0.4), mat.teal, 1.2, 1.7, 0.54, { ry: Math.PI, name: 'screen', clone: true, shadow: false });
  box(0.95, 0.08, 0.95, mat.amberDull, 1.2, 2.08, 1.0);
  status(g, -1.0, 1.06, -1.75); // luz de status da máquina (em cima da viga da frente)
  return { g: bake(g), size: new THREE.Vector3(4.5, 4.7, 4.5) };
}

// ─── Construtora 3×3: esteira atravessa, prensa em cima ───
function constructorM() {
  const g = new THREE.Group();
  const { box, cyl, plinth, add } = kit(g);
  plinth(4.2);
  box(3.0, 1.75, 2.9, mat.steel, 0, 1.1, 0);
  box(3.06, 0.14, 2.96, mat.amber, 0, 0.42, 0);
  box(3.08, 0.12, 2.98, mat.plate, 0, 2.03, 0);
  // bocas de entrada (trás) e saída (frente) com esteira
  for (const s of [-1, 1]) {
    box(1.1, 0.7, 0.14, mat.dark, 0, 0.85, s * 1.47);
    box(0.95, 0.06, 0.7, rubber, 0, BELT_Y + 0.02, s * 1.75);
    box(1.05, 0.12, 0.7, mat.steel, 0, BELT_Y - 0.06, s * 1.75);
  }
  // janela lateral com o brilho de dentro
  add(new THREE.PlaneGeometry(1.6, 0.6), new THREE.MeshStandardMaterial({ color: 0x1a0c00, emissive: 0xffa040, emissiveIntensity: 0.3 }), 1.51, 1.2, 0, { ry: Math.PI / 2, name: 'fire', shadow: false });
  for (let i = -3; i <= 3; i++) box(0.05, 0.62, 0.04, mat.dark, 1.53, 1.2, i * 0.22);
  // prensa: torre + pistão que bate
  box(1.3, 1.0, 1.3, mat.steel, 0, 2.6, 0);
  box(1.34, 0.1, 1.34, mat.amber, 0, 3.1, 0);
  add(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 14), mat.steelL, 0, 3.55, 0, { name: 'bob' });
  cyl(0.45, 0.45, 0.12, mat.dark, 0, 3.1, 0);
  // rolos/engrenagens laterais
  for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.35, 0.35, 0.18, 14), mat.copper, -1.55, 1.3 + s * 0.35, s * 0.6, { rz: Math.PI / 2, name: 'spinx' });
  // painel com tela e escapamento
  box(0.5, 0.8, 0.3, mat.steelL, -1.15, 2.45, -1.0);
  add(new THREE.PlaneGeometry(0.36, 0.26), mat.teal, -1.15, 2.55, -1.16, { ry: Math.PI, name: 'screen', clone: true, shadow: false });
  cyl(0.14, 0.16, 1.2, mat.dark, 1.1, 2.6, 1.1);
  add(new THREE.SphereGeometry(0.09, 10, 8), mat.amber, 1.4, 2.12, -1.4, { name: 'glow', clone: true });
  status(g, 0.9, 1.3, -1.46); // luz de status da máquina
  return { g: bake(g), size: new THREE.Vector3(4.5, 4.1, 4.5) };
}

// ─── Montadora 3×3: duas entradas laterais, cúpula de vidro com braço robótico ───
function assembler() {
  const g = new THREE.Group();
  const { box, cyl, plinth, add } = kit(g);
  plinth(4.2);
  box(3.3, 1.5, 2.6, mat.steel, 0, 0.97, 0.1);
  box(3.36, 0.14, 2.66, mat.amber, 0, 0.42, 0.1);
  // entradas dos lados (funis) e saída na frente
  for (const s of [-1, 1]) {
    box(0.55, 0.9, 1.2, mat.plate, s * 1.85, 0.8, 0.1);
    box(0.57, 0.06, 1.22, mat.amberDull, s * 1.85, 1.27, 0.1);
    box(0.5, 0.5, 0.9, mat.dark, s * 1.72, 0.75, 0.1);
  }
  box(1.1, 0.6, 0.14, mat.dark, 0, 0.8, -1.2);
  box(0.95, 0.06, 0.7, rubber, 0, BELT_Y + 0.02, -1.65);
  // cabine de vidro em cima com o braço girando
  box(1.9, 0.12, 1.7, mat.plate, 0, 1.78, 0.1);
  add(new THREE.BoxGeometry(1.8, 1.05, 1.6), tealGlass, 0, 2.36, 0.1);
  box(1.92, 0.1, 1.72, mat.steelL, 0, 2.93, 0.1);
  for (const [x, z] of [[-0.9, -0.7], [0.9, -0.7], [-0.9, 0.9], [0.9, 0.9]]) box(0.08, 1.05, 0.08, mat.steel, x, 2.36, z);
  cyl(0.18, 0.22, 0.4, mat.dark, 0, 2.04, 0.1);
  add(new THREE.BoxGeometry(1.2, 0.12, 0.14), mat.amberDull, 0, 2.35, 0.1, { name: 'spin' });
  add(new THREE.BoxGeometry(0.14, 0.4, 0.14), mat.steelL, 0, 2.5, 0.1, { name: 'spin' });
  add(new THREE.SphereGeometry(0.12, 10, 8), mat.amber, 0, 2.7, 0.1, { name: 'glow', clone: true });
  // ventiladores em cima
  for (const x of [-1.2, 1.2]) {
    cyl(0.42, 0.42, 0.14, mat.dark, x, 1.8, 0.95);
    add(new THREE.BoxGeometry(0.75, 0.03, 0.14), mat.steelL, x, 1.89, 0.95, { name: 'spin' });
    add(new THREE.BoxGeometry(0.14, 0.03, 0.75), mat.steelL, x, 1.9, 0.95, { name: 'spin' });
  }
  box(0.5, 0.7, 0.3, mat.steelL, 1.3, 1.25, -1.25);
  add(new THREE.PlaneGeometry(0.36, 0.3), mat.teal, 1.3, 1.35, -1.41, { ry: Math.PI, name: 'screen', clone: true, shadow: false });
  status(g, -1.1, 1.15, -1.21); // luz de status da máquina
  return { g: bake(g), size: new THREE.Vector3(4.5, 3.4, 4.5) };
}

// ─── Laboratório 3×3: cúpula de vidro com núcleo que pulsa e anéis girando ───
function lab() {
  const g = new THREE.Group();
  const { box, cyl, plinth, add } = kit(g);
  plinth(4.2);
  cyl(1.45, 1.55, 0.4, mat.steel, 0, 0.42, 0, { seg: 24 });
  cyl(1.47, 1.47, 0.08, mat.amber, 0, 0.66, 0, { seg: 24 });
  add(new THREE.SphereGeometry(1.4, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), tealGlass, 0, 0.68, 0);
  cyl(0.12, 0.2, 0.8, mat.dark, 0, 1.0, 0);
  add(new THREE.SphereGeometry(0.34, 18, 12), new THREE.MeshStandardMaterial({ color: 0x3a1066, emissive: 0xb07cff, emissiveIntensity: 1.4 }), 0, 1.55, 0, { name: 'glow' });
  const r1 = add(new THREE.TorusGeometry(0.62, 0.04, 8, 32), mat.amber, 0, 1.55, 0, { name: 'spin', clone: true }); r1.rotation.x = 1.2;
  const r2 = add(new THREE.TorusGeometry(0.78, 0.035, 8, 32), mat.copper, 0, 1.55, 0, { name: 'spinz' }); r2.rotation.x = 0.4;
  // tanques com líquido
  for (const [x, z, c] of [[-1.6, 1.2, 0x5dffa8], [1.6, 1.2, 0xb07cff]]) {
    cyl(0.36, 0.36, 1.6, mat.dark, x, 0.95, z, { seg: 14 });
    add(new THREE.CylinderGeometry(0.3, 0.3, 1.1, 14), liquid(c), x, 0.95, z - 0.08, { name: 'glow' });
    cyl(0.4, 0.4, 0.1, mat.steelL, x, 1.8, z, { seg: 14 });
    cyl(0.06, 0.06, 1.3, mat.copper, x * 0.62, 1.2, z * 0.55, { rz: Math.PI / 2 * Math.sign(x), seg: 8 });
  }
  // console com tela e antena
  box(0.7, 0.9, 0.35, mat.steelL, 1.3, 0.75, -1.5);
  add(new THREE.PlaneGeometry(0.52, 0.36), mat.teal, 1.3, 0.92, -1.68, { ry: Math.PI, name: 'screen', clone: true, shadow: false });
  cyl(0.05, 0.05, 1.6, mat.steelL, -1.55, 1.1, -1.4, { seg: 8 });
  add(new THREE.SphereGeometry(0.09, 10, 8), mat.amber, -1.55, 1.95, -1.4, { name: 'glow', clone: true });
  status(g, 0, 0.45, -1.55); // luz de status da máquina
  return { g: bake(g), size: new THREE.Vector3(4.5, 2.4, 4.5) };
}

// ─── Central (HUB) 3×3: módulo de comando com mastro, janela-tela e mesa holográfica ───
function hub() {
  const g = new THREE.Group();
  const { box, cyl, plinth, add } = kit(g);
  plinth(4.3, 0.26);
  cyl(1.55, 1.7, 2.1, mat.steelL, 0.2, 1.33, 0.4, { seg: 8 });
  cyl(1.62, 1.62, 0.12, mat.amber, 0.2, 0.42, 0.4, { seg: 8 });
  add(new THREE.CylinderGeometry(1.575, 1.6, 0.36, 8, 1, true), new THREE.MeshStandardMaterial({ color: 0x0c2a2a, emissive: 0x3fe0cc, emissiveIntensity: 0.9, side: THREE.DoubleSide }), 0.2, 1.75, 0.4, { name: 'screen' });
  add(new THREE.ConeGeometry(1.62, 0.7, 8), mat.plate, 0.2, 2.73, 0.4);
  // porta e escadinha na frente
  box(0.9, 1.4, 0.2, mat.dark, 0.2, 0.98, -1.15);
  box(0.95, 0.06, 0.22, mat.amber, 0.2, 1.7, -1.15);
  for (let i = 0; i < 2; i++) box(1.0, 0.1, 0.3, mat.steel, 0.2, 0.31 + i * 0.12, -1.45 + i * 0.12);
  // mastro com antena e farol
  cyl(0.08, 0.1, 2.6, mat.steel, 0.2, 4.2, 0.4, { seg: 8 });
  add(new THREE.SphereGeometry(0.5, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat.steelL, 0.2, 4.0, 0.4, { rx: -2.3, name: 'spin' });
  add(new THREE.SphereGeometry(0.16, 12, 8), mat.amber, 0.2, 5.55, 0.4, { name: 'glow', clone: true });
  // mesa holográfica
  cyl(0.45, 0.55, 0.75, mat.steel, -1.35, 0.62, -1.3, { seg: 12 });
  cyl(0.5, 0.5, 0.06, mat.teal, -1.35, 1.02, -1.3, { seg: 16 });
  add(new THREE.IcosahedronGeometry(0.32, 0), new THREE.MeshStandardMaterial({ color: 0x3fe0cc, emissive: 0x3fe0cc, emissiveIntensity: 1.6, transparent: true, opacity: 0.55, wireframe: true }), -1.35, 1.5, -1.3, { name: 'spin' });
  // caixas de carga e tanque
  box(0.8, 0.8, 0.8, mat.amberDull, 1.55, 0.66, -1.35);
  box(0.6, 0.6, 0.6, mat.steel, 1.6, 1.36, -1.4);
  cyl(0.4, 0.4, 1.3, mat.steel, -1.55, 0.91, 1.45, { seg: 14 });
  status(g, 0.2, 1.85, -1.27); // luz de status da máquina
  return { g: bake(g), size: new THREE.Vector3(4.5, 5.6, 4.5) };
}

// ─── Nave caída (onde você começa): pousou de bico no chão, torta, com a asa quebrada ───
// O casco vai ao longo de x (bico em +x); a escotilha aberta fica no lado -z (virado pro jogador).
// 'smoke' marca de onde sai a fumaça do motor; 'glow' é a luz de emergência piscando.
function crashedShip() {
  const g = new THREE.Group();
  const { box, cyl, add } = kit(g);
  const dirt = new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 1 });
  const scorch = new THREE.MeshBasicMaterial({ color: 0x0c0b0a, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  // marca de queimado e o rastro que a nave abriu no chão
  add(new THREE.CircleGeometry(3.6, 28), scorch, 0.4, 0.04, 0, { rx: -Math.PI / 2, shadow: false });
  add(new THREE.PlaneGeometry(5, 1.8), scorch, -4.8, 0.045, 0.1, { rx: -Math.PI / 2, shadow: false }); // rastro de onde ela veio arrastando
  for (const [x, z, s] of [[3.1, 0.9, 0.55], [3.4, -0.85, 0.5], [2.6, 1.2, 0.35], [2.7, -1.15, 0.4], [3.9, 0.2, 0.35]]) {
    const m = add(new THREE.SphereGeometry(s, 9, 6), dirt, x, s * 0.25, z); m.scale.y = 0.45;
  }
  // a nave em si, inclinada (bico enterrado, um pouco de lado)
  const ship = new THREE.Group();
  ship.position.set(0, 0.75, 0);
  ship.rotation.set(0.12, 0, -0.17);
  g.add(ship);
  const sAdd = (geo, m, x, y, z, o = {}) => add(geo, m, x, y, z, { ...o, parent: ship });
  // casco: cilindro facetado deitado, com faixas âmbar
  sAdd(new THREE.CylinderGeometry(0.95, 1.05, 4.4, 10), mat.steelL, 0, 0, 0, { rz: Math.PI / 2 });
  sAdd(new THREE.CylinderGeometry(1.07, 1.07, 0.16, 10), mat.amber, 0.9, 0, 0, { rz: Math.PI / 2 });
  sAdd(new THREE.CylinderGeometry(1.07, 1.07, 0.16, 10), mat.amberDull, -1.3, 0, 0, { rz: Math.PI / 2 });
  // bico (amassado e meio enterrado)
  const nose = sAdd(new THREE.ConeGeometry(0.95, 1.6, 10), mat.steel, 3.0, -0.05, 0, { rz: -Math.PI / 2 });
  nose.scale.set(1, 1, 0.92);
  // cabine de vidro rachado em cima
  sAdd(new THREE.SphereGeometry(0.62, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat.glass, 1.4, 0.72, 0, { clone: true }).scale.set(1.5, 0.75, 1);
  for (const [a, b] of [[0.3, 0.2], [-0.4, 0.5]]) sAdd(new THREE.BoxGeometry(0.5, 0.02, 0.02), mat.dark, 1.3 + a * 0.4, 1.1, b * 0.5, { ry: a + b });
  // asa boa (+z) e o toco da asa quebrada (-z)
  const wing = sAdd(new THREE.BoxGeometry(2.2, 0.14, 2.3), mat.plate, -0.6, -0.35, 1.9);
  wing.rotation.set(0.12, -0.35, 0);
  sAdd(new THREE.BoxGeometry(1.9, 0.06, 0.18), mat.amber, -0.5, -0.27, 2.85, { ry: -0.35 });
  const stub = sAdd(new THREE.BoxGeometry(1.2, 0.14, 0.9), mat.plate, -0.5, -0.4, -1.25);
  stub.rotation.set(-0.3, 0.2, 0.1);
  // cauda e motores
  const fin = sAdd(new THREE.BoxGeometry(1.3, 1.3, 0.12), mat.plate, -1.9, 1.05, 0);
  fin.rotation.z = -0.5;
  sAdd(new THREE.SphereGeometry(0.11, 10, 8), mat.amber, -2.3, 1.65, 0, { name: 'glow', clone: true });
  for (const z of [-0.5, 0.5]) {
    sAdd(new THREE.CylinderGeometry(0.42, 0.52, 0.8, 12), mat.dark, -2.5, -0.15, z, { rz: Math.PI / 2 });
    sAdd(new THREE.CylinderGeometry(0.32, 0.32, 0.05, 12), new THREE.MeshStandardMaterial({ color: 0x1a0c00, emissive: 0xff6a1a, emissiveIntensity: 0.6 }), -2.92, -0.15, z, { rz: Math.PI / 2 });
  }
  const smoke = new THREE.Object3D(); smoke.name = 'smoke'; smoke.position.set(-2.9, 0.3, 0.5); ship.add(smoke);
  // escotilha aberta virando rampa (lado -z) e a antena entortada
  sAdd(new THREE.BoxGeometry(1.0, 1.1, 0.08), mat.dark, -0.4, 0.05, -1.02);
  const ramp = sAdd(new THREE.BoxGeometry(1.0, 0.07, 1.3), mat.steel, -0.4, -0.75, -1.55);
  ramp.rotation.x = 0.55;
  sAdd(new THREE.BoxGeometry(1.0, 0.03, 0.08), mat.amber, -0.4, -0.45, -1.05);
  sAdd(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 6), mat.steelL, 0.4, 1.3, 0.3, { rz: 0.9, rx: 0.4 });
  // destroços espalhados (no chão, fora da nave)
  const deb = [[-3.6, 1.8, 0.7, 0.5, 0.06, 0.4], [2.2, -2.6, 0.5, 0.35, 0.05, -0.6], [-1.4, -3.3, 0.9, 0.6, 0.07, 1.1], [4.6, 1.6, 0.4, 0.3, 0.05, 0.2]];
  for (const [x, z, w, d, h, r] of deb) { const p = add(new THREE.BoxGeometry(w, h, d), mat.plate, x, h / 2 + 0.02, z); p.rotation.set(0.1, r, 0.08); }
  // a asa que caiu
  const fallen = add(new THREE.BoxGeometry(1.6, 0.12, 1.1), mat.plate, -2.6, 0.2, -2.6); fallen.rotation.set(0.25, 0.7, -0.15);
  add(new THREE.BoxGeometry(1.4, 0.05, 0.14), mat.amberDull, -2.6, 0.29, -2.15, { ry: 0.7 });
  // caixas de carga que sobraram (o kit)
  box(0.6, 0.6, 0.6, mat.amberDull, 1.6, 0.3, -2.4);
  box(0.45, 0.45, 0.45, mat.steel, 2.2, 0.23, -2.0);
  box(0.4, 0.04, 0.4, mat.amber, 1.6, 0.62, -2.4);
  cyl(0.25, 0.25, 0.7, mat.steelL, 0.9, 0.35, -2.9, { seg: 12 });
  return { g: bake(g), size: new THREE.Vector3(7, 2.6, 5) };
}

// ─── Computador (1 célula): mesa com monitor (a tela de verdade é desenhada pelo jogo em cima) ───
function computer() {
  const g = new THREE.Group();
  const { box, cyl, add } = kit(g);
  box(1.3, 0.48, 0.8, mat.steel, 0, 0.24, 0.05);
  box(1.34, 0.05, 0.84, mat.amber, 0, 0.5, 0.05);
  const kb = add(new THREE.BoxGeometry(0.9, 0.06, 0.3), mat.dark, 0, 0.56, -0.2); kb.rotation.x = 0.2;
  cyl(0.06, 0.08, 0.32, mat.dark, 0, 0.66, 0.12, { seg: 8 });
  const fr = add(new THREE.BoxGeometry(1.29, 0.63, 0.07), mat.dark, 0, 0.775, 0.055); fr.rotation.x = -0.2014;
  for (const s of [-1, 1]) {
    box(0.22, 1.2, 0.5, mat.plate, s * 0.62, 0.6, 0.45);
    for (let i = 0; i < 4; i++) add(new THREE.BoxGeometry(0.03, 0.03, 0.02), i % 2 ? mat.teal : mat.amber, s * 0.62 + (i % 2) * 0.06 - 0.03, 0.4 + i * 0.2, 0.19, { name: 'glow', clone: true });
  }
  status(g, 0.45, 0.3, -0.37);
  return { g: bake(g), size: new THREE.Vector3(CELL, 1.25, CELL) };
}

// ─── Painel solar (1 célula): placa que vira pro sol ───
function solarTex() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 96;
  const x = c.getContext('2d');
  x.fillStyle = '#c8ccd2'; x.fillRect(0, 0, 128, 96);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
    const gr = x.createLinearGradient(0, 0, 32, 32); gr.addColorStop(0, '#2a4f9a'); gr.addColorStop(1, '#13234a');
    x.fillStyle = gr; x.fillRect(2 + i * 31.5, 2 + j * 31, 29, 28);
    x.strokeStyle = 'rgba(160,200,255,.25)'; x.strokeRect(2 + i * 31.5, 2 + j * 31 + 14, 29, 0.5);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, metalness: 0.4, roughness: 0.25 });
}
function solar() {
  const g = new THREE.Group();
  const { box, cyl, add } = kit(g);
  box(0.7, 0.12, 0.7, mat.concrete, 0, 0.06, 0);
  cyl(0.08, 0.1, 1.15, mat.steel, 0, 0.65, 0, { seg: 10 });
  const tilt = new THREE.Group(); tilt.name = 'tilt'; tilt.position.y = 1.25; g.add(tilt);
  add(new THREE.BoxGeometry(1.42, 0.05, 1.05), solarTex(), 0, 0, 0, { parent: tilt });
  add(new THREE.BoxGeometry(1.46, 0.06, 0.05), mat.amberDull, 0, -0.01, 0.54, { parent: tilt });
  add(new THREE.BoxGeometry(0.12, 0.12, 0.12), mat.dark, 0, -0.08, 0, { parent: tilt });
  status(g, 0, 0.35, -0.11);
  return { g, size: new THREE.Vector3(CELL, 1.45, CELL) };
}

// ─── Lâmpada: poste com cúpula (a lâmpada acesa fica por conta do jogo) ───
function lamp() {
  const g = new THREE.Group();
  const { box, cyl } = kit(g);
  box(0.45, 0.1, 0.45, mat.concrete, 0, 0.05, 0);
  cyl(0.06, 0.08, 1.9, mat.steel, 0, 1.0, 0, { seg: 10 });
  box(0.16, 0.06, 0.16, mat.amber, 0, 0.5, 0);
  cyl(0.3, 0.12, 0.14, mat.dark, 0, 2.02, 0, { seg: 12 });
  return { g: bake(g), size: new THREE.Vector3(CELL, 1.98, CELL) };
}

export function buildMoreModels(M, wrap) {
  const list = {
    beltS3: beltStraight, beltC3: beltCorner, splitter3: () => router('splitter'), merger3: () => router('merger'), sorter3: () => router('sorter'),
    miner3: miner, constructor3: constructorM, assembler3: assembler, lab3: lab, hub3: hub, pod3: crashedShip,
    computer3: computer, solar3: solar, lamp3: lamp, coalgen3: () => burner(true),
  };
  for (const [k, fn] of Object.entries(list)) {
    const r = fn();
    M[k] = wrap(r.g, r.size);
  }
}
