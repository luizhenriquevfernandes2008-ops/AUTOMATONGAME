// TÊTÊ: o bichinho de estimação de KX-7. Cara de pug (focinho achatado, máscara escura, olhão,
// orelhinha dobrada, rabinho enrolado), mas é de outro planeta: pelo lavanda, duas anteninhas que
// brilham, sardas em forma de estrela nas costas e uma coleira âmbar de astronauta.
// A frente do modelo é +z. As peças que mexem ficam em `parts` (pet.js anima).
import * as THREE from 'three';

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: o.r ?? 0.75, metalness: o.m ?? 0, emissive: o.e ?? 0x000000, emissiveIntensity: o.ei ?? 1 });

// stone = true: versão estátua (tudo cinza-pedra, sem brilho)
export function buildTete({ stone = false } = {}) {
  const S = stone ? std(0x9a968c, { r: 0.95 }) : null;
  const fur = S || std(0xc9b6ff, { r: 0.8 });
  const cream = S || std(0xfff0dc, { r: 0.85 });
  const mask = S || std(0x3b2b4d, { r: 0.7 });
  const eye = S || std(0x0c0a14, { r: 0.12, m: 0.2 });
  const shine = S || new THREE.MeshBasicMaterial({ color: 0xffffff });
  const pink = S || std(0xff8fb8, { r: 0.6 });
  const blush = S || new THREE.MeshBasicMaterial({ color: 0xff9ec4, transparent: true, opacity: 0.55, depthWrite: false });
  const glow = S || std(0x3fe0cc, { e: 0x3fe0cc, ei: 1.4, r: 0.3 });
  const amber = S || std(0xffb347, { e: 0xff8a1a, ei: 0.5, r: 0.4, m: 0.3 });
  fur.userData.tint = true; // a cor da loja de fichas pinta só o pelo

  const root = new THREE.Group();
  const add = (geo, m, x, y, z, parent = root) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
  const parts = { legs: [] };

  // corpo gordinho (fica num grupo pra poder sentar e deitar)
  const body = new THREE.Group(); body.position.y = 0.3; root.add(body);
  parts.body = body;
  add(new THREE.SphereGeometry(0.25, 20, 14), fur, 0, 0, 0, body).scale.set(1, 0.86, 1.28);
  add(new THREE.SphereGeometry(0.19, 16, 12), cream, 0, -0.07, 0.1, body).scale.set(0.9, 0.75, 1.05);
  // sardas-estrela nas costas
  for (const [x, z, s] of [[0.07, -0.05, 1], [-0.09, 0.06, 0.8], [0.02, 0.15, 0.7], [-0.04, -0.18, 0.75]]) {
    const st = add(new THREE.OctahedronGeometry(0.028 * s, 0), glow, x, 0.205 - Math.abs(z) * 0.18, z, body);
    st.scale.y = 0.35;
  }
  // coleira âmbar com plaquinha
  const collar = add(new THREE.TorusGeometry(0.15, 0.024, 8, 22), amber, 0, 0.1, 0.24, body);
  collar.rotation.x = Math.PI / 2 - 0.5;
  add(new THREE.CylinderGeometry(0.035, 0.035, 0.012, 12), glow, 0, 0.0, 0.36, body).rotation.x = Math.PI / 2 - 0.3;

  // perninhas curtas (pivô no quadril)
  for (const [x, z] of [[0.13, 0.17], [-0.13, 0.17], [0.13, -0.17], [-0.13, -0.17]]) {
    const hip = new THREE.Group(); hip.position.set(x, -0.1, z); body.add(hip);
    add(new THREE.CylinderGeometry(0.055, 0.05, 0.17, 10), fur, 0, -0.085, 0, hip);
    add(new THREE.SphereGeometry(0.058, 10, 8), cream, 0, -0.17, 0.012, hip).scale.set(1, 0.6, 1.2);
    hip.userData.front = z > 0; hip.userData.side = Math.sign(x);
    parts.legs.push(hip);
  }

  // rabinho enrolado
  const tail = new THREE.Group(); tail.position.set(0, 0.13, -0.3); body.add(tail);
  const curl = add(new THREE.TorusGeometry(0.06, 0.026, 8, 16, Math.PI * 1.6), fur, 0, 0.05, 0, tail);
  curl.rotation.y = Math.PI / 2;
  parts.tail = tail;

  // cabeça (grupo pra farejar, olhar em volta e balançar)
  const head = new THREE.Group(); head.position.set(0, 0.14, 0.27); body.add(head);
  parts.head = head;
  add(new THREE.SphereGeometry(0.2, 22, 16), fur, 0, 0.05, 0, head).scale.set(1.12, 0.95, 0.92);
  // máscara escura e focinho achatado
  add(new THREE.SphereGeometry(0.13, 18, 12), mask, 0, 0.0, 0.11, head).scale.set(1.05, 0.78, 0.55);
  add(new THREE.SphereGeometry(0.05, 12, 8), mask, 0, 0.02, 0.18, head).scale.set(1.3, 0.7, 0.7);
  add(new THREE.SphereGeometry(0.022, 10, 8), eye, 0, 0.035, 0.205, head); // narizinho
  // ruguinhas na testa
  for (const y of [0.15, 0.185]) { const w = add(new THREE.TorusGeometry(0.06, 0.009, 6, 14, Math.PI * 0.8), mask, 0, y, 0.135, head); w.rotation.z = Math.PI * 0.1; w.rotation.x = -0.35; }
  // olhões brilhantes
  for (const s of [-1, 1]) {
    add(new THREE.SphereGeometry(0.058, 14, 12), eye, s * 0.095, 0.075, 0.14, head);
    add(new THREE.SphereGeometry(0.017, 8, 6), shine, s * 0.095 + 0.018, 0.098, 0.192, head);
    add(new THREE.SphereGeometry(0.008, 6, 4), shine, s * 0.095 - 0.016, 0.06, 0.196, head);
    const b = add(new THREE.CircleGeometry(0.03, 12), blush, s * 0.15, -0.0, 0.135, head);
    b.rotation.y = s * 0.7;
    // orelhinha dobrada pra frente
    const ear = new THREE.Group(); ear.position.set(s * 0.14, 0.2, 0.0); head.add(ear);
    const e = add(new THREE.ConeGeometry(0.07, 0.11, 3), mask, 0, 0.0, 0.03, ear);
    e.rotation.set(1.9, 0, s * 0.5); e.scale.z = 0.45;
    parts['ear' + (s > 0 ? 'R' : 'L')] = ear;
  }
  // linguinha pra fora
  add(new THREE.BoxGeometry(0.04, 0.012, 0.05), pink, 0.012, -0.05, 0.18, head).rotation.x = 0.5;
  // anteninhas espaciais
  parts.antennae = new THREE.Group(); head.add(parts.antennae);
  for (const s of [-1, 1]) {
    const a = new THREE.Group(); a.position.set(s * 0.06, 0.22, -0.02); a.rotation.z = -s * 0.35; parts.antennae.add(a);
    add(new THREE.CylinderGeometry(0.008, 0.01, 0.13, 6), mask, 0, 0.065, 0, a);
    add(new THREE.SphereGeometry(0.026, 10, 8), glow, 0, 0.14, 0, a);
  }
  parts.hatSpot = new THREE.Object3D(); parts.hatSpot.position.set(0, 0.235, -0.01); head.add(parts.hatSpot);
  root.userData.size = new THREE.Vector3(0.5, 0.78, 0.8);
  return { root, parts };
}
