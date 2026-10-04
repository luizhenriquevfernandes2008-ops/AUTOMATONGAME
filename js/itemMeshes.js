// Visual dos itens que andam nas esteiras.
import * as THREE from 'three';
import { cloneModel } from './assets.js';
import { game } from './state.js';

const cache = {};
const pools = {};

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: opts.r ?? 0.6, metalness: opts.m ?? 0.1, flatShading: opts.flat ?? false, emissive: opts.e ?? 0x000000, emissiveIntensity: opts.ei ?? 0, transparent: !!opts.t, opacity: opts.t ?? 1 });
}

function build(type) {
  const g = new THREE.Group();
  const add = (geo, m, x = 0, y = 0, z = 0) => { const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); me.castShadow = true; g.add(me); return me; };
  switch (type) {
    case 'minerio_ferro':
      add(new THREE.DodecahedronGeometry(0.16, 0), mat(0x7f8fa8, { flat: true, r: 0.9 }), 0, 0.14, 0);
      add(new THREE.OctahedronGeometry(0.07, 0), mat(0xb8d4ff, { flat: true, e: 0x5577aa, ei: 0.4 }), 0.08, 0.24, 0.04);
      break;
    case 'minerio_cobre':
      add(new THREE.DodecahedronGeometry(0.16, 0), mat(0x8a5a3c, { flat: true, r: 0.9 }), 0, 0.14, 0);
      add(new THREE.OctahedronGeometry(0.07, 0), mat(0xff9a52, { flat: true, e: 0xaa5522, ei: 0.4 }), -0.07, 0.24, 0.03);
      break;
    case 'quartzo': {
      const m = mat(0xf6d2ff, { flat: true, r: 0.2, e: 0xb070d0, ei: 0.35, t: 0.9 });
      add(new THREE.OctahedronGeometry(0.15, 0), m, 0, 0.18, 0).scale.set(0.7, 1.4, 0.7);
      add(new THREE.OctahedronGeometry(0.09, 0), m, 0.09, 0.1, 0.05).scale.set(0.7, 1.3, 0.7);
      break;
    }
    case 'lingote_ferro':
    case 'lingote_cobre': {
      const m = type === 'lingote_ferro' ? mat(0xd5dce8, { m: 0.7, r: 0.3 }) : mat(0xe98a4c, { m: 0.7, r: 0.3 });
      const geo = new THREE.BoxGeometry(0.36, 0.13, 0.18);
      add(geo, m, 0, 0.08, 0);
      break;
    }
    case 'silicio':
      add(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 20), mat(0x34407a, { m: 0.6, r: 0.2, e: 0x2a3a90, ei: 0.3 }), 0, 0.04, 0);
      add(new THREE.CylinderGeometry(0.12, 0.12, 0.052, 4), mat(0x8fb0ff, { m: 0.5, r: 0.1, e: 0x6688ff, ei: 0.4 }), 0, 0.045, 0);
      break;
    case 'engrenagem': {
      const c = cloneModel('cog');
      c.position.y = 0.1;
      g.add(c);
      break;
    }
    case 'fio': {
      const m = mat(0xf0994f, { m: 0.7, r: 0.3 });
      const t = add(new THREE.TorusGeometry(0.13, 0.045, 8, 18), m, 0, 0.1, 0);
      t.rotation.x = Math.PI / 2;
      const t2 = add(new THREE.TorusGeometry(0.13, 0.045, 8, 18), m, 0, 0.18, 0);
      t2.rotation.x = Math.PI / 2;
      break;
    }
    case 'chip': {
      add(new THREE.BoxGeometry(0.34, 0.05, 0.34), mat(0x2e9e62, { r: 0.5 }), 0, 0.05, 0);
      add(new THREE.BoxGeometry(0.16, 0.05, 0.16), mat(0x1c2230, { r: 0.4 }), 0, 0.09, 0);
      const pin = mat(0xffd35a, { m: 0.9, r: 0.2 });
      const pg = new THREE.BoxGeometry(0.03, 0.02, 0.07);
      for (let i = -2; i <= 2; i++) { add(pg, pin, i * 0.06, 0.08, 0.13); add(pg, pin, i * 0.06, 0.08, -0.13); }
      break;
    }
    case 'motor': {
      const body = add(new THREE.CylinderGeometry(0.15, 0.15, 0.3, 16), mat(0x6f79ad, { m: 0.5, r: 0.4 }), 0, 0.16, 0);
      body.rotation.z = Math.PI / 2;
      const ring = add(new THREE.CylinderGeometry(0.16, 0.16, 0.05, 16), mat(0xf29a3a, { r: 0.5 }), 0, 0.16, 0);
      ring.rotation.z = Math.PI / 2;
      const shaft = add(new THREE.CylinderGeometry(0.03, 0.03, 0.14, 8), mat(0xdddddd, { m: 0.9, r: 0.2 }), 0.21, 0.16, 0);
      shaft.rotation.z = Math.PI / 2;
      break;
    }
    case 'robozinho': {
      const c = cloneModel('oopi');
      g.add(c);
      break;
    }
    case 'carvao':
      add(new THREE.DodecahedronGeometry(0.15, 0), mat(0x24242c, { flat: true, r: 0.4, m: 0.3 }), 0, 0.13, 0);
      add(new THREE.DodecahedronGeometry(0.09, 0), mat(0x34343f, { flat: true, r: 0.4, m: 0.3 }), 0.1, 0.1, 0.06);
      break;
    case 'escoria': {
      const m = add(new THREE.DodecahedronGeometry(0.15, 0), mat(0x6e5f52, { flat: true, r: 1 }), 0, 0.09, 0);
      m.scale.set(1.2, 0.6, 1);
      add(new THREE.OctahedronGeometry(0.05, 0), mat(0xff7a3a, { flat: true, e: 0xaa3300, ei: 0.5 }), 0.06, 0.15, 0.02);
      break;
    }
    case 'tijolo':
      add(new THREE.BoxGeometry(0.36, 0.15, 0.18), mat(0xc0643c, { r: 0.9 }), 0, 0.08, 0);
      break;
    case 'aco':
      add(new THREE.BoxGeometry(0.38, 0.14, 0.2), mat(0x8d9ab0, { m: 0.85, r: 0.25 }), 0, 0.08, 0);
      add(new THREE.BoxGeometry(0.39, 0.03, 0.21), mat(0x3a4a66, { m: 0.8, r: 0.3 }), 0, 0.12, 0);
      break;
    case 'viga': {
      const m = mat(0x6f7d96, { m: 0.8, r: 0.3 });
      add(new THREE.BoxGeometry(0.46, 0.035, 0.2), m, 0, 0.02, 0);
      add(new THREE.BoxGeometry(0.46, 0.035, 0.2), m, 0, 0.2, 0);
      add(new THREE.BoxGeometry(0.46, 0.18, 0.04), m, 0, 0.11, 0);
      break;
    }
    case 'processador':
      add(new THREE.BoxGeometry(0.34, 0.06, 0.34), mat(0x1a3f8a, { r: 0.4 }), 0, 0.05, 0);
      add(new THREE.BoxGeometry(0.2, 0.04, 0.2), mat(0xffd35a, { m: 0.9, r: 0.2 }), 0, 0.1, 0);
      add(new THREE.BoxGeometry(0.1, 0.02, 0.1), mat(0x6cf5ff, { e: 0x3ab8ff, ei: 0.8 }), 0, 0.125, 0);
      break;
    case 'modulo_foguete': {
      add(new THREE.CylinderGeometry(0.13, 0.13, 0.32, 16), mat(0xf0f0f5, { r: 0.4 }), 0, 0.17, 0);
      add(new THREE.CylinderGeometry(0.135, 0.135, 0.05, 16), mat(0xffa640, { r: 0.5 }), 0, 0.2, 0);
      add(new THREE.ConeGeometry(0.13, 0.16, 16), mat(0xff5a6e, { r: 0.5 }), 0, 0.41, 0);
      break;
    }
    case 'satelite': {
      add(new THREE.BoxGeometry(0.16, 0.16, 0.16), mat(0xffd35a, { m: 0.8, r: 0.3 }), 0, 0.12, 0);
      const p = mat(0x2a55c9, { m: 0.4, r: 0.3, e: 0x1a3399, ei: 0.3 });
      add(new THREE.BoxGeometry(0.2, 0.02, 0.12), p, 0.19, 0.12, 0);
      add(new THREE.BoxGeometry(0.2, 0.02, 0.12), p, -0.19, 0.12, 0);
      add(new THREE.CylinderGeometry(0.01, 0.01, 0.12, 6), mat(0xdddddd), 0, 0.25, 0);
      break;
    }
    // ── horta ──
    case 'grao_cafe': {
      const m = mat(0x5a3220, { r: 0.5 });
      const geo = new THREE.SphereGeometry(0.07, 10, 8);
      [[0, 0.07, 0], [0.09, 0.07, 0.04], [-0.08, 0.07, 0.05], [0.02, 0.07, -0.09], [0.01, 0.15, 0.01]].forEach(([x, y, z]) => add(geo, m, x, y, z).scale.set(1, 0.7, 1.35));
      break;
    }
    case 'melancia': {
      add(new THREE.SphereGeometry(0.17, 16, 12), mat(0x2f8a3c, { r: 0.45 }), 0, 0.16, 0).scale.set(1.25, 0.95, 1);
      add(new THREE.CylinderGeometry(0.012, 0.012, 0.06, 5), mat(0x6a8a3a), 0.2, 0.2, 0).rotation.z = 1;
      break;
    }
    case 'abobora': {
      add(new THREE.SphereGeometry(0.17, 14, 10), mat(0xf08a2a, { r: 0.6 }), 0, 0.14, 0).scale.set(1.15, 0.75, 1.15);
      add(new THREE.CylinderGeometry(0.025, 0.03, 0.08, 6), mat(0x5a7a2a), 0, 0.3, 0);
      break;
    }
    case 'milho': {
      add(new THREE.CapsuleGeometry(0.06, 0.2, 4, 10), mat(0xf2d04a, { r: 0.6 }), 0, 0.08, 0).rotation.z = Math.PI / 2;
      const l = add(new THREE.ConeGeometry(0.06, 0.26, 6), mat(0x6aa84a, { r: 0.8 }), -0.08, 0.1, 0.03);
      l.rotation.z = Math.PI / 2 + 0.2;
      break;
    }
    case 'cenoura': {
      add(new THREE.ConeGeometry(0.06, 0.3, 10), mat(0xf0782a, { r: 0.7 }), 0, 0.07, 0).rotation.z = -Math.PI / 2;
      add(new THREE.ConeGeometry(0.05, 0.12, 6), mat(0x5aa83a, { r: 0.8 }), -0.2, 0.07, 0).rotation.z = Math.PI / 2;
      break;
    }
    // ── materiais de construção ──
    case 'madeira': {
      const m = mat(0xb98352, { r: 0.85 });
      add(new THREE.BoxGeometry(0.42, 0.06, 0.12), m, 0, 0.04, -0.05);
      add(new THREE.BoxGeometry(0.42, 0.06, 0.12), m, 0.02, 0.1, 0.05).rotation.y = 0.12;
      break;
    }
    case 'concreto':
      add(new THREE.BoxGeometry(0.3, 0.18, 0.2), mat(0xa3a7ae, { r: 1 }), 0, 0.09, 0);
      break;
    case 'vidro':
      add(new THREE.BoxGeometry(0.36, 0.26, 0.03), mat(0xbfe6ff, { r: 0.05, m: 0.1, t: 0.45, e: 0x3a6a8a, ei: 0.2 }), 0, 0.14, 0);
      break;
    case 'fragmento_estelar':
      add(new THREE.OctahedronGeometry(0.14, 0), mat(0xb18cff, { flat: true, r: 0.2, e: 0x8a5aff, ei: 0.9 }), 0, 0.17, 0).scale.set(0.8, 1.3, 0.8);
      add(new THREE.OctahedronGeometry(0.07, 0), mat(0xffd6ff, { flat: true, e: 0xff9aff, ei: 1 }), 0.1, 0.08, 0.04);
      break;
    // ── itens de ponta ──
    case 'bateria': {
      add(new THREE.CylinderGeometry(0.1, 0.1, 0.3, 16), mat(0x2c8a5e, { r: 0.4, m: 0.3 }), 0, 0.15, 0);
      add(new THREE.CylinderGeometry(0.102, 0.102, 0.08, 16), mat(0xe9f0ff, { r: 0.4 }), 0, 0.24, 0);
      add(new THREE.CylinderGeometry(0.035, 0.035, 0.04, 10), mat(0xd8dce6, { m: 0.9, r: 0.2 }), 0, 0.32, 0);
      add(new THREE.BoxGeometry(0.03, 0.07, 0.01), mat(0x5dff9a, { e: 0x3ee67a, ei: 0.9 }), 0, 0.15, 0.1);
      break;
    }
    case 'painel_led': {
      add(new THREE.BoxGeometry(0.38, 0.04, 0.26), mat(0x1c2230, { r: 0.4 }), 0, 0.03, 0);
      const cols = [0xff6ec7, 0x3ee6b8, 0xffd35a, 0x6cb8ff];
      const g2 = new THREE.BoxGeometry(0.06, 0.02, 0.06);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) { const c = cols[(i + j) % 4]; add(g2, mat(c, { e: c, ei: 0.9 }), -0.13 + i * 0.087, 0.06, -0.08 + j * 0.08); }
      break;
    }
    case 'computador_quantico': {
      add(new THREE.BoxGeometry(0.3, 0.06, 0.3), mat(0x2a2f45, { m: 0.6, r: 0.3 }), 0, 0.03, 0);
      add(new THREE.CylinderGeometry(0.09, 0.12, 0.2, 12), mat(0xd8dce6, { m: 0.8, r: 0.2 }), 0, 0.16, 0);
      const core = add(new THREE.IcosahedronGeometry(0.08, 0), mat(0x6cf5ff, { flat: true, e: 0x3ab8ff, ei: 1.2, t: 0.9 }), 0, 0.34, 0);
      core.rotation.set(0.4, 0.3, 0);
      const ring = add(new THREE.TorusGeometry(0.12, 0.012, 6, 24), mat(0xb18cff, { e: 0x8a5aff, ei: 1 }), 0, 0.34, 0);
      ring.rotation.x = Math.PI / 2.4;
      break;
    }
    // ─── 3.0 ───
    case 'calcario':
      add(new THREE.DodecahedronGeometry(0.16, 0), mat(0xd8d2bc, { flat: true, r: 0.95 }), 0, 0.14, 0).scale.set(1.1, 0.8, 1);
      break;
    case 'cristal_kx': {
      const m = mat(0xb98aff, { flat: true, r: 0.15, e: 0x8a4dff, ei: 0.8, t: 0.92 });
      add(new THREE.OctahedronGeometry(0.15, 0), m, 0, 0.2, 0).scale.set(0.6, 1.6, 0.6);
      add(new THREE.OctahedronGeometry(0.09, 0), m, 0.08, 0.12, -0.04).scale.set(0.6, 1.5, 0.6);
      add(new THREE.OctahedronGeometry(0.08, 0), m, -0.08, 0.11, 0.05).scale.set(0.6, 1.4, 0.6);
      break;
    }
    case 'luminita': {
      add(new THREE.DodecahedronGeometry(0.15, 0), mat(0x2f4a3a, { flat: true, r: 0.8 }), 0, 0.13, 0);
      add(new THREE.SphereGeometry(0.07, 10, 8), mat(0x6dffb0, { e: 0x3dff90, ei: 1.4 }), 0.05, 0.22, 0.03);
      add(new THREE.SphereGeometry(0.045, 8, 6), mat(0x6dffb0, { e: 0x3dff90, ei: 1.4 }), -0.08, 0.18, -0.04);
      break;
    }
    case 'folhas': {
      const m = mat(0x5fae6a, { flat: true, r: 0.8 });
      for (let i = 0; i < 4; i++) { const l = add(new THREE.ConeGeometry(0.08, 0.26, 4), m, Math.cos(i * 1.6) * 0.07, 0.07 + i * 0.03, Math.sin(i * 1.6) * 0.07); l.rotation.set(Math.PI / 2.3, i * 1.6, 0); l.scale.set(1, 1, 0.25); }
      break;
    }
    case 'fibra': {
      const m = mat(0xc8b070, { r: 0.9 });
      for (let i = 0; i < 5; i++) { const f = add(new THREE.CylinderGeometry(0.012, 0.012, 0.34, 4), m, (i - 2) * 0.03, 0.06, 0); f.rotation.z = Math.PI / 2; f.rotation.y = (i - 2) * 0.12; }
      add(new THREE.TorusGeometry(0.05, 0.015, 6, 12), mat(0x8a6a3a), 0, 0.06, 0).rotation.y = Math.PI / 2;
      break;
    }
    case 'esporos': {
      const m = mat(0x7dffb0, { e: 0x3dff90, ei: 0.9, t: 0.85 });
      for (let i = 0; i < 6; i++) add(new THREE.SphereGeometry(0.045 + (i % 3) * 0.015, 8, 6), m, Math.cos(i) * 0.08, 0.08 + (i % 2) * 0.08, Math.sin(i * 1.7) * 0.08);
      break;
    }
    case 'biomassa':
      add(new THREE.BoxGeometry(0.26, 0.16, 0.2), mat(0x6a8a3a, { flat: true, r: 0.95 }), 0, 0.09, 0);
      add(new THREE.BoxGeometry(0.27, 0.03, 0.21), mat(0x4a6a2a), 0, 0.12, 0);
      break;
    case 'placa_ferro':
      add(new THREE.BoxGeometry(0.34, 0.04, 0.3), mat(0xb8c2d0, { m: 0.6, r: 0.35 }), 0, 0.03, 0);
      add(new THREE.BoxGeometry(0.34, 0.04, 0.3), mat(0xa8b2c0, { m: 0.6, r: 0.35 }), 0.01, 0.075, 0.01).rotation.y = 0.15;
      break;
    case 'haste_ferro': {
      const m = mat(0x9aa6b8, { m: 0.7, r: 0.3 });
      for (let i = 0; i < 2; i++) { const h = add(new THREE.CylinderGeometry(0.025, 0.025, 0.4, 8), m, 0, 0.04 + i * 0.05, (i - 0.5) * 0.06); h.rotation.z = Math.PI / 2; }
      break;
    }
    case 'parafuso': {
      const m = mat(0xc8ccd4, { m: 0.8, r: 0.25 });
      for (let i = 0; i < 3; i++) {
        const x = (i - 1) * 0.1;
        add(new THREE.CylinderGeometry(0.022, 0.022, 0.16, 6), m, x, 0.1, 0);
        add(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 6), m, x, 0.19, 0);
      }
      break;
    }
    case 'cabo': {
      const t = add(new THREE.TorusGeometry(0.12, 0.04, 8, 20), mat(0x2a2e36, { r: 0.6 }), 0, 0.06, 0);
      t.rotation.x = Math.PI / 2;
      const t2 = add(new THREE.TorusGeometry(0.12, 0.025, 8, 20), mat(0xf09a5a, { m: 0.7 }), 0, 0.1, 0);
      t2.rotation.x = Math.PI / 2;
      break;
    }
    case 'chapa_cobre':
      add(new THREE.BoxGeometry(0.34, 0.035, 0.3), mat(0xe07a40, { m: 0.75, r: 0.3 }), 0, 0.03, 0);
      break;
    case 'viga':
    case 'viga_aco': {
      const m = mat(0x6f7d96, { m: 0.8, r: 0.35 });
      add(new THREE.BoxGeometry(0.42, 0.03, 0.14), m, 0, 0.02, 0);
      add(new THREE.BoxGeometry(0.42, 0.12, 0.03), m, 0, 0.09, 0);
      add(new THREE.BoxGeometry(0.42, 0.03, 0.14), m, 0, 0.16, 0);
      break;
    }
    case 'tubo_aco': {
      const t = add(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 12, 1, true), mat(0x7f8ca4, { m: 0.8, r: 0.3 }), 0, 0.07, 0);
      t.rotation.z = Math.PI / 2;
      t.material.side = THREE.DoubleSide;
      break;
    }
    case 'placa_reforcada':
      add(new THREE.BoxGeometry(0.34, 0.07, 0.3), mat(0x7f8a9a, { m: 0.7, r: 0.35 }), 0, 0.05, 0);
      for (const [x, z] of [[-0.13, -0.11], [0.13, -0.11], [-0.13, 0.11], [0.13, 0.11]]) add(new THREE.CylinderGeometry(0.02, 0.02, 0.02, 6), mat(0xc8ccd4, { m: 0.9 }), x, 0.095, z);
      break;
    case 'rotor': {
      const m = mat(0xa9b4c4, { m: 0.7, r: 0.3 });
      const c = add(new THREE.CylinderGeometry(0.05, 0.05, 0.34, 10), m, 0, 0.12, 0); c.rotation.z = Math.PI / 2;
      for (let i = 0; i < 4; i++) { const b = add(new THREE.BoxGeometry(0.2, 0.02, 0.07), mat(0xffae34, { m: 0.4 }), 0, 0.12, 0); b.rotation.x = (i * Math.PI) / 4; }
      break;
    }
    case 'estrutura_modular': {
      const m = mat(0x8a94a6, { m: 0.7, r: 0.35 });
      for (const [x, z] of [[-0.12, -0.12], [0.12, -0.12], [-0.12, 0.12], [0.12, 0.12]]) add(new THREE.BoxGeometry(0.035, 0.3, 0.035), m, x, 0.15, z);
      add(new THREE.BoxGeometry(0.3, 0.03, 0.3), m, 0, 0.02, 0);
      add(new THREE.BoxGeometry(0.3, 0.03, 0.3), m, 0, 0.29, 0);
      break;
    }
    case 'estator': {
      const t = add(new THREE.TorusGeometry(0.11, 0.06, 8, 16), mat(0xc88a5a, { m: 0.6, r: 0.35 }), 0, 0.12, 0);
      t.rotation.y = Math.PI / 2;
      add(new THREE.CylinderGeometry(0.04, 0.04, 0.2, 8), mat(0x7f8ca4, { m: 0.8 }), 0, 0.12, 0).rotation.z = Math.PI / 2;
      break;
    }
    case 'oscilador': {
      add(new THREE.BoxGeometry(0.26, 0.05, 0.2), mat(0x2a2e46), 0, 0.03, 0);
      add(new THREE.OctahedronGeometry(0.08, 0), mat(0xc89aff, { e: 0x8a4dff, ei: 1.1, t: 0.9 }), 0, 0.14, 0).scale.set(0.7, 1.4, 0.7);
      break;
    }
    default:
      add(new THREE.BoxGeometry(0.25, 0.25, 0.25), mat(0xff00ff), 0, 0.13, 0);
  }
  return g;
}

// ─── desenho instanciado ───
// Cada item é só uma "alça" (posição + giro). Todos os itens do mesmo tipo viram UM InstancedMesh
// por peça do modelo: fábricas enormes com milhares de itens nas esteiras continuam leves.
class ItemHandle {
  constructor(type) {
    this.type = type;
    this.position = new THREE.Vector3(0, -50, 0);
    this.rotation = { y: 0 };
    this.visible = true;
    this.userData = { itemType: type };
    this.active = false;
  }
  get parent() { return this.active ? game.scene : null; }
}
const batches = {}; // tipo -> { parts, meshes, cap, live:Set }
function batchOf(type) {
  let b = batches[type];
  if (b) return b;
  if (!cache[type]) cache[type] = build(type);
  const tpl = cache[type];
  tpl.updateMatrixWorld(true);
  const parts = [];
  tpl.traverse((o) => { if (o.isMesh) parts.push({ geo: o.geometry, mat: o.material, local: o.matrixWorld.clone(), cast: o.castShadow }); });
  b = batches[type] = { parts, meshes: [], cap: 0, live: new Set() };
  grow(b, 32);
  return b;
}
function grow(b, cap) {
  for (const m of b.meshes) { game.scene?.remove(m); m.dispose(); }
  b.meshes = b.parts.map((p) => {
    const m = new THREE.InstancedMesh(p.geo, p.mat, cap);
    m.castShadow = p.cast;
    m.receiveShadow = true;
    m.frustumCulled = false;
    m.count = 0;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    game.scene?.add(m);
    return m;
  });
  b.cap = cap;
}
export function takeItemMesh(type) {
  const pool = pools[type] || (pools[type] = []);
  const h = pool.pop() || new ItemHandle(type);
  h.active = true;
  h.visible = true;
  h.position.set(0, -50, 0);
  batchOf(type).live.add(h);
  return h;
}
export function releaseItemMesh(h) {
  if (!h || !h.active) return;
  h.active = false;
  batches[h.type]?.live.delete(h);
  (pools[h.type] || (pools[h.type] = [])).push(h);
}
const _m = new THREE.Matrix4(), _p = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1), _up = new THREE.Vector3(0, 1, 0);
// chamado uma vez por quadro, antes de desenhar
export function flushItems() {
  for (const b of Object.values(batches)) {
    let n = 0;
    for (const h of b.live) if (h.visible) n++;
    if (n > b.cap) grow(b, Math.max(n, b.cap * 2));
    let i = 0;
    for (const h of b.live) {
      if (!h.visible) continue;
      _q.setFromAxisAngle(_up, h.rotation.y);
      _m.compose(h.position, _q, _s);
      for (let k = 0; k < b.parts.length; k++) b.meshes[k].setMatrixAt(i, _p.multiplyMatrices(_m, b.parts[k].local));
      i++;
    }
    for (const m of b.meshes) { m.count = n; m.instanceMatrix.needsUpdate = true; }
  }
}
export function liveItemCount() { let n = 0; for (const b of Object.values(batches)) n += b.live.size; return n; }

export function itemPreviewObject(type) {
  if (!cache[type]) cache[type] = build(type);
  return cache[type].clone(true);
}
