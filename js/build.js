// Construção: barra de itens, fantasma no grid, colocar/remover, cabos, 2º andar,
// copiar e colar grupos (C / V) e desfazer (Ctrl+Z).
import * as THREE from 'three';
import { game } from './state.js';
import { CELL, WORLD_MIN, WORLD_MAX, MACHINES, DECOR, TOOLS, REGIONS, PIECES, MATERIALS, PAINTS, PAINT_PRICE, PAINTINGS, isBeltTier } from './data.js';
import {
  grid, gridUp, ores, key, cellCenter, worldToCell, createEntity, addEntity, removeEntity, MODEL_YAW, DIRS, groundArrow, ELEV, footprint, itemName,
} from './machines.js';
import { cloneModel } from './assets.js';
import { colliders, interactables, minerOres, isBuildableCell, regionAt } from './world.js';
import { rayTerrain, terrainUniforms } from './terrain.js';
import { clearFloraCell } from './flora.js';
import { audio } from './audio.js';
import { canWire, checkConnect, connect, disconnect, disconnectAll, showPreview, wirePoint, wiresOf } from './power.js';
import {
  structures, structRoot, nearestEdge, edgeKey, edgeCells, edgeDistance, edgeSegment, buildPieceObject, addStructure, removeStructure,
  paintStructure, pieceCost, costText, addPainting, WALL_H, foundationLevel, cornerHeights, foundationMesh, structFromHit,
} from './structures.js';
import { heightAt, WATER } from './terrain.js';
import { foundations } from './machines.js';

export const ORDER = [...Object.keys(MACHINES), ...Object.keys(DECOR), ...Object.keys(PAINTINGS)];
export const PIECE_ORDER = [...Object.keys(PIECES), 'pintar']; // a fundação vem primeiro
export const MAT_ORDER = Object.keys(MATERIALS);
const REACH_BUILD = 14, REACH_USE = 6, REACH_CABLE = 12;
const UPPER = new Set(['esteira_alta']);
const TALL = new Set(['poste', 'tela', 'lampada', 'arvore', 'luminaria', 'antena', 'estatua', 'separador']); // não cabe esteira elevada por cima

export const defOf = (t) => MACHINES[t] || DECOR[t] || TOOLS[t] || PAINTINGS[t];
const layerOf = (t) => (UPPER.has(t) ? 1 : 0);

export class Builder {
  constructor() {
    this.selected = null;
    this.dir = 0;
    this.ghost = null;
    this.ray = new THREE.Raycaster();
    this.target = null;
    this.hover = null;
    this.cableFrom = null;
    this.codeStash = [];
    this.undoStack = [];
    // copiar/colar
    this.copyMode = false;
    this.copyA = null;
    this.clipboard = null;
    this.pasteMode = false;
    this.pasteRot = 0;
    this.pasteGhost = null;
    // caminho de esteiras (igual Satisfactory): 1º clique marca o início, 2º clique constrói tudo
    this.beltA = null;
    this.beltFlip = false;
    this.path = null;
    this.pathSig = '';
    this.pathGhosts = [];
    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(CELL * 0.98, 0.02, CELL * 0.98));
    this.box = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }));
    this.box.visible = false;
    game.scene.add(this.box);
    this.selBox = new THREE.Mesh(new THREE.BoxGeometry(1, 0.3, 1), new THREE.MeshBasicMaterial({ color: 0x3fe0cc, transparent: true, opacity: 0.18, depthWrite: false }));
    this.selBox.visible = false;
    game.scene.add(this.selBox);
    // holograma teal do trailer (vermelho quando não dá pra construir)
    // 3.0: mistura normal (o aditivo sumia no chão claro de dia)
    this.ghostMatOk = new THREE.MeshBasicMaterial({ color: 0x3fe0cc, transparent: true, opacity: 0.55, depthWrite: false, fog: false });
    this.ghostMatBad = new THREE.MeshBasicMaterial({ color: 0xff4455, transparent: true, opacity: 0.6, depthWrite: false, fog: false });
    this.ghostMatSkip = new THREE.MeshBasicMaterial({ color: 0x9fb4c8, transparent: true, opacity: 0.18, depthWrite: false, fog: false });
    // 3.0: a grade de construção agora é desenhada pelo shader do terreno (antes era uma malha)
    game.gridMesh = { get visible() { return terrainUniforms.uGrid.value > 0; }, set visible(v) { terrainUniforms.uGrid.value = v ? 1 : 0; } };
    // marca no chão com o tamanho da peça (aparece mesmo atrás de plantas)
    this.foot = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x3fe0cc, transparent: true, opacity: 0.28, depthWrite: false, depthTest: false, fog: false }));
    this.foot.renderOrder = 5;
    this.foot.visible = false;
    game.scene.add(this.foot);
    this.arrow = groundArrow(0xffc050, 2.2);
    this.arrow.children[0].position.y = 0.06;
    this.arrow.visible = false;
    game.scene.add(this.arrow);
    // construção
    this.piece = 'fundacao';
    this.foundOffset = 0;
    this.mat = 'madeira';
    this.paintIdx = 1;
    this.structGhost = null;
    this.structTarget = null;
    game.scene.add(structRoot);
  }

  hotbar() {
    const eco = game.economy;
    if (!eco.hubPlaced()) return ['central', 'minerador', 'gerador', 'cabo', 'construir'];
    return ['cabo', 'construir', ...eco.hotbar.filter((t) => eco.isUnlocked(t))];
  }

  select(type) {
    if (this.selected === type) type = null;
    this.cancelModes();
    this.cancelBeltPath();
    this.selected = type;
    this.cableFrom = null;
    showPreview(null);
    game.gridMesh.visible = !!type && type !== 'cabo' && !PAINTINGS[type];
    this.refreshGhost();
    if (type === 'construir' && !game.economy.stats.buildHint) {
      game.economy.stats.buildHint = true;
      game.ui?.toast('🧱 Construção: <kbd>F</kbd> troca a peça · <kbd>T</kbd> troca o material · <kbd>X</kbd> desmonta');
    }
    audio.play('select', { volume: 0.4 });
    game.emit('hotbar');
  }
  selectIndex(i) {
    const hb = this.hotbar();
    if (i < hb.length) this.select(hb[i]);
  }
  cycle(d) {
    const hb = this.hotbar();
    let i = hb.indexOf(this.selected);
    i = i < 0 ? 0 : (i + d + hb.length) % hb.length;
    this.selected = null;
    this.select(hb[i]);
  }
  rotate() {
    if (this.selected === 'construir' && this.piece === 'fundacao') {
      this.foundOffset = ((this.foundOffset || 0) + 0.5) % 4.5;
      game.ui?.toast(`🟫 Fundação: ${this.foundOffset ? '+' + this.foundOffset.toFixed(1) + ' m acima' : 'no nível do chão/vizinha'}`);
      audio.play('tick', { volume: 0.4 });
      return;
    }
    if (this.pasteMode) { this.pasteRot = (this.pasteRot + 1) % 4; this.buildPasteGhost(); }
    else if (this.beltA) this.beltFlip = !this.beltFlip; // troca se a curva vem antes ou depois
    else this.dir = (this.dir + 1) % 4;
    audio.play('tick', { volume: 0.4 });
  }

  refreshGhost() {
    if (this.ghost) { game.scene.remove(this.ghost); this.ghost = null; }
    this.refreshStructGhost();
    if (!this.selected || this.selected === 'cabo' || this.selected === 'construir' || PAINTINGS[this.selected]) return;
    const mk = defOf(this.selected).model;
    const g = new THREE.Group();
    const m = cloneModel(mk);
    m.rotation.y = MODEL_YAW[mk] || 0;
    m.traverse((o) => { if (o.isMesh) { o.material = this.ghostMatOk; o.castShadow = false; } });
    g.add(m);
    this.ghost = g;
    game.scene.add(g);
  }

  // motivo pra não poder construir (ou null se pode)
  cellValid(x, z, t = this.selected) {
    const def = MACHINES[t];
    if (def && (def.tamanho || 1) > 1) {
      if (def.unico && game.entities.some((e) => e.type === t)) return `Só pode ter uma ${def.nome}`;
      for (const [cx, cz] of footprint(t, x, z)) {
        const why = this.cellValid1(cx, cz, t, cx === x && cz === z);
        if (why) return why;
      }
      return null;
    }
    if (def?.unico && game.entities.some((e) => e.type === t)) return `Só pode ter uma ${def.nome}`;
    return this.cellValid1(x, z, t);
  }
  cellValid1(x, z, t = this.selected, center = true) {
    if (x < WORLD_MIN || x > WORLD_MAX || z < WORLD_MIN || z > WORLD_MAX) return 'Fora do mapa';
    if (!isBuildableCell(x, z)) {
      const r = regionAt(x, z);
      return r ? `Região "${REGIONS[r].nome}" ainda não é sua (compre na placa 🔒)` : 'Fora da área da fábrica';
    }
    const k = key(x, z);
    const c = cellCenter(x, z);
    for (const col of colliders) if (Math.hypot(col.x - c.x, col.z - c.z) < col.r + CELL * 0.55) return 'Tem algo no caminho';
    if (layerOf(t) === 1) {
      if (gridUp.has(k)) return 'Já tem algo no 2º andar aqui';
      const g = grid.get(k);
      if (g && (g.static || g.isPlatform || TALL.has(g.type) || (MACHINES[g.type]?.tamanho || 1) > 1)) return 'Tem algo alto demais embaixo';
      return null;
    }
    const g0 = grid.get(k);
    if (g0 && isBeltTier(t) && isBeltTier(g0.type) && g0.type !== t) return null; // troca a esteira (rápida/expressa por cima)
    if (grid.has(k)) return 'Lugar ocupado';
    if ((t === 'rampa_sobe' || t === 'rampa_desce') && gridUp.has(k)) return 'Tem uma esteira elevada em cima';
    const ore = ores.get(k);
    const miner = t === 'minerador';
    // minerador 3×3: o meio fica em cima do veio (os pés podem pegar outros veios)
    if (miner && center && !ore) return 'O minerador precisa ficar com o meio em cima de um veio';
    if (ore && !miner) return 'Veio de minério: só minerador aqui';
    // relevo: sem fundação, o chão precisa ser quase plano (esteira aceita um pouco de inclinação, o minerador tem pés)
    if (!foundations.has(k) && !ore) {
      const cs = cornerHeights(x, z);
      const span = Math.max(...cs) - Math.min(...cs);
      const belt = isBeltTier(t) || t === 'sensor';
      if (Math.min(...cs) < WATER - 0.15) return 'Dentro d\'água: coloque uma 🟫 Fundação antes (Construção, tecla 2)';
      if (span > (belt ? 1.1 : miner ? 0.9 : 0.5)) return 'Chão muito inclinado: coloque uma 🟫 Fundação antes (Construção, tecla 2)';
    }
    const def = defOf(t);
    const pc = worldToCell(game.camera.position.x, game.camera.position.z);
    if ((def.solido || DECOR[t]) && pc.x === x && pc.z === z) return 'Você está em cima!';
    if ((MACHINES[t]?.tamanho || 1) > 1 && ore && !miner) return 'Veio de minério no caminho';
    return null;
  }

  update() {
    const cam = game.camera;
    const cable = this.selected === 'cabo';
    this.ray.setFromCamera({ x: 0, y: 0 }, cam);
    this.ray.far = REACH_BUILD;
    const objs = game.entities.map((e) => e.obj).concat(interactables.map((i) => i.obj), (game.drones || []).map((d) => d.obj), game.pickups || []);
    if (game.pet) objs.push(game.pet.obj);
    objs.push(structRoot);
    const hits = this.ray.intersectObjects(objs, true);
    this.hover = null;
    const building = this.selected === 'construir' || !!PAINTINGS[this.selected];
    const reach = cable ? REACH_CABLE : building ? REACH_BUILD : REACH_USE;
    for (const h of hits) {
      if (h.distance > reach) break;
      const fs = structFromHit(h);
      if (fs) { if (!building) continue; this.hover = { struct: fs, point: h.point }; break; }
      let o = h.object;
      while (o && !o.userData.entity && !o.userData.pet && !o.userData.struct && !o.userData.pickup && !interactables.some((i) => i.obj === o)) o = o.parent;
      if (!o) continue;
      if (o.userData.struct) {
        // pisos e tetos não atrapalham mirar nas máquinas (só com a ferramenta de construção)
        const s = o.userData.struct;
        if (!building && s.kind === 'peca' && !PIECES[s.piece].borda) continue;
        this.hover = { struct: s, point: h.point };
        break;
      }
      if (o.userData.pickup) { this.hover = { pickup: o.userData.pickup }; break; }
      if (o.userData.pet) this.hover = { pet: true };
      else if (o.userData.entity) {
        const e = o.userData.entity;
        if (e.isPlatform) this.hover = { interact: interactables.find((i) => i.action === 'platform') };
        else this.hover = { entity: e };
      } else this.hover = { interact: interactables.find((i) => i.obj === o) };
      break;
    }
    // chão (ou 2º andar pra esteira elevada)
    const layer = layerOf(this.selected);
    let gh = rayTerrain(this.ray.ray.origin, this.ray.ray.direction, REACH_BUILD);
    const fm = foundationMesh();
    if (fm && fm.count) {
      const fh = this.ray.intersectObject(fm, false)[0];
      // no topo da fundação: empurra o ponto um tiquinho pra dentro (pra cair na célula certa)
      if (fh && (!gh || fh.distance < gh.distance)) gh = { point: fh.point.clone().addScaledVector(this.ray.ray.direction, fh.face && fh.face.normal.y < 0.5 ? 0.02 : 0), distance: fh.distance };
    }
    if (layer === 1 && gh) {
      // 2º andar: mira num plano acima do chão onde o raio bateu
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(gh.point.y + ELEV));
      const p = new THREE.Vector3();
      if (this.ray.ray.intersectPlane(plane, p) && p.distanceTo(cam.position) < REACH_BUILD) gh = { point: p };
    }
    if (gh) terrainUniforms.uGridPos.value.set(gh.point.x, gh.point.z);
    this.target = null;
    if (gh) {
      const c = worldToCell(gh.point.x, gh.point.z);
      this.target = { x: c.x, z: c.z, point: gh.point };
    }
    // copiar: retângulo de seleção
    if (this.copyMode) {
      this.selBox.visible = !!this.target;
      if (this.target) {
        const a = this.copyA || this.target, b = this.target;
        const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), z0 = Math.min(a.z, b.z), z1 = Math.max(a.z, b.z);
        this.selBox.scale.set((x1 - x0 + 1) * CELL, 1, (z1 - z0 + 1) * CELL);
        this.selBox.position.set((x0 + x1 + 1) / 2 * CELL, this.target.point.y + 0.15, (z0 + z1 + 1) / 2 * CELL);
      }
    } else this.selBox.visible = false;
    // colar: fantasma do grupo
    if (this.pasteMode && this.pasteGhost) {
      this.pasteGhost.visible = !!this.target;
      if (this.target) {
        this.pasteGhost.position.set(this.target.x * CELL, cellCenter(this.target.x, this.target.z).y, this.target.z * CELL);
        const bad = this.pasteProblem();
        this.pasteGhost.traverse((o) => { if (o.isMesh) o.material = bad ? this.ghostMatBad : this.ghostMatOk; });
      }
    }
    if (this.selected === 'construir') this.updateStructGhost();
    // fantasma + seta de direção
    if (this.ghost && this.target) {
      const reason = this.cellValid(this.target.x, this.target.z);
      this.target.reason = reason;
      const c = cellCenter(this.target.x, this.target.z);
      this.ghost.position.copy(c);
      this.ghost.rotation.y = -this.dir * Math.PI / 2;
      this.ghost.visible = true;
      const mat = reason ? this.ghostMatBad : this.ghostMatOk;
      this.ghost.traverse((o) => { if (o.isMesh) o.material = mat; });
      const t = this.selected;
      const fsz = (MACHINES[t]?.tamanho || 1) * CELL * 0.96;
      this.foot.visible = true;
      this.foot.scale.set(fsz, 1, fsz);
      this.foot.position.set(c.x, c.y + 0.04, c.z);
      this.foot.material.color.setHex(reason ? 0xff4455 : 0x3fe0cc);
      this.arrow.visible = !!MACHINES[t] && !['poste', 'gerador', 'gerador_grande', 'painel_solar', 'lampada', 'tela', 'altofalante', 'lixeira', 'laboratorio'].includes(t);
      this.arrow.position.set(c.x, c.y + (layer ? ELEV + 0.7 : 0.02), c.z);
      this.arrow.rotation.y = -this.dir * Math.PI / 2;
    } else {
      if (this.ghost) this.ghost.visible = false;
      this.arrow.visible = false;
      this.foot.visible = false;
    }
    this.updateBeltPath();
    // caixa de seleção
    const e = this.hover?.entity;
    if (cable) {
      const okTarget = e && canWire(e);
      if (okTarget) {
        this.box.visible = true;
        this.box.position.set(e.pos.x, e.pos.y + 0.04, e.pos.z);
        const bad = this.cableFrom ? checkConnect(this.cableFrom, e) : null;
        this.box.material.color.set(bad ? 0xff6a7a : 0x7dffb0);
      } else this.box.visible = false;
      if (this.cableFrom) {
        if (this.cableFrom.removed) { this.cableFrom = null; showPreview(null); }
        else if (okTarget) showPreview(this.cableFrom, wirePoint(e), !checkConnect(this.cableFrom, e));
        else if (this.target) showPreview(this.cableFrom, new THREE.Vector3(this.target.point.x, this.target.point.y + 0.2, this.target.point.z), false);
        else showPreview(null);
      }
    } else if (e && !this.selected && e.pos) {
      this.box.visible = true;
      this.box.position.set(e.pos.x, e.pos.y + (e.layer === 1 ? ELEV : 0) + 0.04, e.pos.z);
      this.box.material.color.set(0xffffff);
    } else this.box.visible = false;
  }

  // ─── construção: paredes, pisos, tetos, pintura ───
  cyclePiece(d = 1) {
    const i = PIECE_ORDER.indexOf(this.piece);
    this.piece = PIECE_ORDER[(i + d + PIECE_ORDER.length) % PIECE_ORDER.length];
    this.refreshStructGhost();
    audio.play('tick', { volume: 0.4 });
    game.emit('hotbar');
  }
  cycleMaterial(d = 1) {
    if (this.piece === 'pintar') this.paintIdx = (this.paintIdx + d + PAINTS.length) % PAINTS.length;
    else {
      const i = MAT_ORDER.indexOf(this.mat);
      this.mat = MAT_ORDER[(i + d + MAT_ORDER.length) % MAT_ORDER.length];
    }
    this.refreshStructGhost();
    audio.play('tick', { volume: 0.4 });
    game.emit('hotbar');
  }
  refreshStructGhost() {
    if (this.structGhost) { game.scene.remove(this.structGhost); this.structGhost = null; }
    if (this.selected !== 'construir' || this.piece === 'pintar') return;
    const g = buildPieceObject(this.piece, this.mat, null, { x: 0, z: 0, o: 'n' });
    g.traverse((o) => { if (o.isMesh) { o.material = this.ghostMatOk; o.castShadow = false; } });
    g.visible = false;
    this.structGhost = g;
    game.scene.add(g);
  }
  // onde a peça iria (chave + posição)
  structSpot() {
    if (!this.target) return null;
    const p = PIECES[this.piece];
    const pt = this.target.point;
    if (p.borda) {
      const e = nearestEdge(pt.x, pt.z);
      return { key: edgeKey(e.x, e.z, e.o), info: e };
    }
    const c = worldToCell(pt.x, pt.z);
    if (p.fundacao) return { key: `F:${c.x},${c.z}`, info: { x: c.x, z: c.z, h: foundationLevel(c.x, c.z, this.foundOffset || 0) } };
    return { key: `${p.alto ? 'c' : 'f'}:${c.x},${c.z}`, info: { x: c.x, z: c.z } };
  }
  structProblem(spot) {
    const p = PIECES[this.piece];
    if (!spot) return 'Mire no chão';
    if (structures.has(spot.key)) return 'Já tem uma peça aqui';
    if (p.fundacao) {
      const k = key(spot.info.x, spot.info.z);
      if (grid.has(k)) return 'Tem uma máquina aqui: a fundação vai antes';
      if (ores.has(k)) return 'Veio de minério: o minerador fica direto no chão';
      if (spot.info.h - Math.min(...cornerHeights(spot.info.x, spot.info.z)) > 8) return 'Fundo demais pra fundação';
      const cp = game.camera.position, c = worldToCell(cp.x, cp.z);
      if (c.x === spot.info.x && c.z === spot.info.z && spot.info.h > game.player.y + 0.4) return 'Você está em cima!';
    }
    const cells = p.borda ? edgeCells(spot.info) : [[spot.info.x, spot.info.z]];
    if (!cells.some(([x, z]) => isBuildableCell(x, z))) return 'Fora da área da fábrica';
    if (p.borda) {
      for (const col of colliders) if (edgeDistance(spot.info, col.x, col.z) < col.r + 0.1) return 'Tem algo no caminho';
      const cp = game.camera.position;
      if (!p.passa && edgeDistance(spot.info, cp.x, cp.z) < 0.5) return 'Você está no caminho!';
    }
    if (!game.economy.pieceUnlocked(this.piece)) return '🔒 Pague o marco 🏭 Construtora pra liberar fundações e paredes';
    const cost = pieceCost(this.piece, this.mat);
    const miss = game.economy.missing(cost);
    if (Object.keys(miss).length) return `Faltam itens: ${costText(miss)}`;
    return null;
  }
  updateStructGhost() {
    const g = this.structGhost;
    if (!g) return;
    const spot = this.structSpot();
    this.structTarget = spot;
    if (!spot) { g.visible = false; return; }
    const p = PIECES[this.piece];
    g.visible = true;
    if (p.borda) {
      const s = edgeSegment(spot.info);
      g.position.set((s.ax + s.bx) / 2, 0, (s.az + s.bz) / 2);
      g.rotation.y = spot.info.o === 'n' ? 0 : Math.PI / 2;
    } else if (p.fundacao) {
      const bottom = Math.min(...cornerHeights(spot.info.x, spot.info.z)) - 0.6;
      g.position.set((spot.info.x + 0.5) * CELL, spot.info.h + 0.01, (spot.info.z + 0.5) * CELL);
      g.scale.set(1.002, Math.max(0.3, spot.info.h - bottom), 1.002);
    } else {
      const base = foundations.get(key(spot.info.x, spot.info.z)) ?? heightAt((spot.info.x + 0.5) * CELL, (spot.info.z + 0.5) * CELL);
      g.position.set((spot.info.x + 0.5) * CELL, base + (p.alto ? WALL_H - 0.03 : 0.02), (spot.info.z + 0.5) * CELL);
    }
    spot.reason = this.structProblem(spot);
    const mat = spot.reason ? this.ghostMatBad : this.ghostMatOk;
    g.traverse((o) => { if (o.isMesh) o.material = mat; });
  }
  structClick() {
    if (this.piece === 'pintar') return this.paintClick();
    const spot = this.structTarget || this.structSpot();
    if (!spot) return;
    const why = this.structProblem(spot);
    if (why) { game.ui.toast(why, 'warn'); audio.play('deny', { volume: 0.5 }); return; }
    const cost = pieceCost(this.piece, this.mat);
    game.economy.pay(cost);
    if (PIECES[this.piece].fundacao) game.economy.stats.foundations = (game.economy.stats.foundations || 0) + 1;
    const s = addStructure({ key: spot.key, piece: this.piece, mat: this.mat, paint: null, x: spot.info.x, z: spot.info.z, ...(PIECES[this.piece].fundacao ? { h: spot.info.h } : {}) });
    this.pushUndo({ kind: 'struct', key: s.key, cost });
    game.economy.stats.built = (game.economy.stats.built || 0) + 1;
    audio.play(MATERIALS[s.mat].vidro ? 'glass' : s.mat === 'madeira' ? 'plank' : 'place', { pos: s.obj.position, volume: 0.7 });
    game.emit('materials');
  }
  paintClick() {
    const s = this.hover?.struct;
    if (!s || s.kind !== 'peca') { game.ui.toast('Mire numa parede, piso ou teto pra pintar 🖌️', 'warn'); return; }
    if (MATERIALS[s.mat].vidro) { game.ui.toast('Vidro não pega tinta 😅', 'warn'); return; }
    const paint = PAINTS[this.paintIdx].cor;
    if (s.paint === paint) return;
    if (paint != null && !game.economy.spend(PAINT_PRICE)) { game.ui.toast(`Tinta custa $ ${PAINT_PRICE}`, 'warn'); audio.play('deny'); return; }
    this.pushUndo({ kind: 'paint', key: s.key, prev: s.paint });
    paintStructure(s, paint);
    if (paint != null) game.economy.stats.painted = (game.economy.stats.painted || 0) + 1;
    audio.play('water', { pos: s.obj.position, volume: 0.35, rate: 1.4 });
  }
  paintingClick() {
    const t = this.selected;
    const s = this.hover?.struct;
    if (!s || s.kind !== 'peca' || s.piece !== 'parede') { game.ui.toast('Mire numa <b>parede</b> (sem janela) pra pendurar o quadro 🖼️', 'warn'); audio.play('deny', { volume: 0.4 }); return; }
    const seg = edgeSegment(s);
    const cp = game.camera.position;
    const side = s.o === 'n' ? Math.sign(cp.z - seg.az) || 1 : Math.sign(cp.x - seg.ax) || 1;
    const k = `p:${s.key}:${side}`;
    if (structures.has(k)) { game.ui.toast('Já tem um quadro desse lado da parede', 'warn'); return; }
    if (!game.economy.takeItem(t)) return;
    addPainting({ key: k, painting: t });
    this.pushUndo({ kind: 'painting', key: k, painting: t });
    audio.play('plank', { volume: 0.5 });
    game.ui.toast(`🖼️ ${PAINTINGS[t].nome} pendurado!`, 'good');
    if (!game.economy.count?.(t)) { this.selected = null; game.gridMesh.visible = false; }
    game.emit('hotbar');
  }
  removeStruct(s) {
    if (s.kind === 'quadro') {
      removeStructure(s.key);
      game.economy.addItem(s.painting);
      this.pushUndo({ kind: 'unpainting', key: s.key, painting: s.painting });
      audio.play('remove', { volume: 0.6 });
      game.ui.toast(`🖼️ ${PAINTINGS[s.painting].nome} guardado`);
      game.emit('hotbar');
      return;
    }
    if (s.piece === 'fundacao' && grid.has(key(s.x, s.z))) { game.ui.toast('Tire a máquina de cima da fundação primeiro', 'warn'); audio.play('deny', { volume: 0.5 }); return; }
    const cost = pieceCost(s.piece, s.mat);
    removeStructure(s.key);
    game.economy.refund(cost);
    this.pushUndo({ kind: 'unstruct', data: { key: s.key, piece: s.piece, mat: s.mat, paint: s.paint, x: s.x, z: s.z, h: s.h }, cost });
    audio.play('remove', { pos: s.obj.position, volume: 0.7 });
    game.ui.toast(`${PIECES[s.piece].nome} desmontada: +${costText(cost)} no estoque · <kbd>Ctrl+Z</kbd> desfaz`);
    game.emit('materials');
  }

  // ─── colocar / tirar (com histórico pro Ctrl+Z) ───
  spawn(t, x, z, dir, data) {
    // multiplayer: convidado pede pro anfitrião (e usa uma peça de mentirinha até a confirmação chegar)
    if (game.mp?.intercept('spawn', { t, x, z, dir, d: data || null })) return game.mp.fake(t, x, z, dir);
    const e = createEntity(t, x, z, dir);
    if (data) {
      const d = { ...data };
      if (d.name && game.entities.some((o) => o.name === d.name)) delete d.name; // nome já em uso
      e.load(d);
    }
    addEntity(e);
    clearFloraCell(x, z);
    if (t === 'minerador') minerOres(x, z, false);
    game.mp?.op('spawn', { t, x, z, dir, d: e.serialize() });
    return e;
  }
  despawn(e) {
    const a = `${e.x},${e.z},${e.layer || 0}`;
    if (game.mp?.intercept('despawn', { a })) return;
    if (e.type === 'computador') this.codeStash.push({ name: e.name, code: e.code });
    removeEntity(e);
    if (e.type === 'minerador') minerOres(e.x, e.z, true);
    game.mp?.op('despawn', { a });
  }
  pushUndo(entry) {
    this.undoStack.push(entry);
    if (this.undoStack.length > 60) this.undoStack.shift();
  }

  place() {
    if (this.copyMode) return this.copyClick();
    if (this.pasteMode) return this.pasteClick();
    if (this.selected === 'cabo') return this.cableClick();
    if (this.selected === 'construir') return this.structClick();
    if (PAINTINGS[this.selected]) return this.paintingClick();
    if (!this.selected || !this.target) return;
    if (isBeltTier(this.selected)) return this.beltClick();
    const { x, z, reason } = this.target;
    if (reason) { game.ui.toast(reason, 'warn'); audio.play('deny', { volume: 0.5 }); return; }
    const t = this.selected;
    const old = grid.get(key(x, z));
    if (old && isBeltTier(t) && isBeltTier(old.type) && old.type !== t) return this.replaceBelt(old, t);
    if (!this.payFor(t)) return;
    let data = null;
    if (t === 'computador' && this.codeStash.length) {
      const s = this.codeStash.pop();
      data = { code: s.code };
      game.ui.toast(`Código de '${s.name}' restaurado neste computador 💾`);
    }
    const e = this.spawn(t, x, z, this.dir, data);
    this.pushUndo({ kind: 'place', e });
    audio.play('place', { pos: e.pos, volume: 0.8 });
    if (MACHINES[t]?.energia && !game.economy.stats.cableHint) {
      game.economy.stats.cableHint = true;
      game.ui.toast('Essa máquina precisa de energia ⚡. Use o 🔌 Cabo (tecla 1) pra ligar ela num gerador.', 'warn');
    }
    if (MACHINES[t]?.unico) { this.selected = null; game.gridMesh.visible = false; this.refreshGhost(); }
    game.emit('hotbar');
    game.emit('built', e);
  }
  // paga a construção com itens do inventário (avisa o que falta)
  payFor(t) {
    const eco = game.economy;
    if (MACHINES[t] && !eco.isUnlocked(t)) { game.ui.toast(`🔒 ${MACHINES[t].nome} ainda está bloqueado: pague o marco na Central`, 'warn'); audio.play('deny', { volume: 0.5 }); return false; }
    const miss = eco.missing(eco.buildCost(t));
    if (Object.keys(miss).length) {
      game.ui.toast('Faltam itens: ' + Object.entries(miss).map(([k, n]) => `${n}× ${itemName(k)}`).join(', '), 'warn');
      audio.play('deny', { volume: 0.5 });
      return false;
    }
    return eco.payBuild(t);
  }

  // esteira por cima de esteira: troca o tipo, mantendo a direção e os itens (e devolve a antiga)
  replaceBelt(old, t) {
    if (!this.payFor(t)) return;
    const snap = this.snapshot(old);
    const items = old.items.map((i) => [i.type, i.p, i.entry]);
    this.despawn(old);
    game.economy.refundBuild(old.type);
    const e = this.spawn(t, old.x, old.z, old.dir, { items });
    this.pushUndo({ kind: 'replace', e, snap });
    audio.play('place', { pos: e.pos, volume: 0.7, rate: 1.2 });
    game.emit('hotbar');
  }

  cableClick() {
    const e = this.hover?.entity;
    if (!e || !canWire(e)) {
      game.ui.toast('Mire num gerador, poste ou máquina que usa energia ⚡', 'warn');
      audio.play('deny', { volume: 0.4 });
      return;
    }
    if (!this.cableFrom) {
      this.cableFrom = e;
      audio.play('click', { volume: 0.5 });
      game.ui.toast('Cabo preso! Agora clique na outra ponta (máquina, poste ou gerador).');
      return;
    }
    const a = this.cableFrom;
    const err = connect(a, e);
    if (err) { game.ui.toast(err, 'warn'); audio.play('deny', { volume: 0.5 }); return; }
    this.pushUndo({ kind: 'wire', a, b: e });
    audio.play('place', { pos: e.pos, volume: 0.6 });
    this.cableFrom = e;
    showPreview(null);
    game.emit('hotbar');
    game.emit('wired');
  }

  // clique direito / X
  removeHovered() {
    if (this.copyMode || this.pasteMode) { this.cancelModes(); return; }
    if (this.selected === 'cabo') {
      if (this.cableFrom) { this.cableFrom = null; showPreview(null); audio.play('close', { volume: 0.4 }); return; }
      const e = this.hover?.entity;
      if (e && wiresOf(e).length) {
        const pairs = wiresOf(e).map((w) => [w.a, w.b]);
        const n = disconnectAll(e);
        this.pushUndo({ kind: 'unwire', pairs });
        audio.play('remove', { pos: e.pos, volume: 0.6 });
        game.ui.toast(`${n} cabo(s) removido(s)`);
      }
      return;
    }
    if (this.hover?.struct) { this.removeStruct(this.hover.struct); return; }
    const e = this.hover?.entity;
    if (!e || !e.type) return;
    if (e.type === 'central' && game.entities.length > 1 && !confirm('Desmontar a Central? Os marcos pagos continuam valendo.')) return;
    const snap = this.snapshot(e);
    // itens guardados dentro da máquina voltam pro inventário
    this.salvage(e);
    this.despawn(e);
    game.economy.refundBuild(e.type);
    this.pushUndo({ kind: 'remove', snaps: [snap] });
    audio.play('remove', { pos: e.pos, volume: 0.8 });
    game.ui.toast(`${defOf(e.type).nome} desmontado: itens devolvidos · <kbd>Ctrl+Z</kbd> desfaz`);
    game.emit('hotbar');
  }

  // pega de volta o que estava dentro da máquina (entrada, saída, contêiner, esteira)
  salvage(e) {
    const eco = game.economy;
    for (const [k, n] of Object.entries(e.inv || {})) eco.give(k, n);
    for (const k of e.out || []) eco.give(k, 1);
    for (const it of e.items || []) eco.give(it.type, 1);
    if (e.held?.type) eco.give(e.held.type, 1);
    if (e.inv) e.inv = {};
    if (e.out) e.out = [];
  }
  // guarda tudo que precisa pra recriar a entidade (inclusive os cabos)
  snapshot(e) {
    return { type: e.type, x: e.x, z: e.z, dir: e.dir, layer: e.layer, data: e.serialize(), wires: wiresOf(e).map((w) => { const o = w.a === e ? w.b : w.a; return [o.x, o.z, o.layer || 0]; }) };
  }
  restore(s) {
    if (!this.payFor(s.type)) return null;
    const e = this.spawn(s.type, s.x, s.z, s.dir, s.data);
    for (const [x, z, l] of s.wires) {
      const o = (l ? gridUp : grid).get(key(x, z));
      if (o && !o.static && !o.isPlatform) connect(e, o);
    }
    return e;
  }

  rotateEntity(e) {
    if (game.mp?.intercept('rotate', { a: `${e.x},${e.z},${e.layer || 0}` })) return;
    this.pushUndo({ kind: 'rotate', e, dir: e.dir });
    e.dir = (e.dir + 1) % 4;
    e.obj.rotation.y = -e.dir * Math.PI / 2;
    game.emit('moved', e);
    game.mp?.op('rotate', { a: `${e.x},${e.z},${e.layer || 0}`, dir: e.dir });
  }

  undo() {
    const u = this.undoStack.pop();
    if (!u) { game.ui.toast('Nada pra desfazer'); return; }
    switch (u.kind) {
      case 'place':
        if (!u.e.removed) { this.salvage(u.e); this.despawn(u.e); game.economy.refundBuild(u.e.type); }
        break;
      case 'replace':
        if (!u.e.removed) { this.despawn(u.e); game.economy.refundBuild(u.e.type); this.restore(u.snap); }
        break;
      case 'beltPath':
        for (const e of u.ents) if (!e.removed) { this.salvage(e); this.despawn(e); game.economy.refundBuild(e.type); }
        for (const sn of u.snaps) this.restore(sn);
        break;
      case 'group':
        for (const e of u.ents) if (!e.removed) { this.salvage(e); this.despawn(e); game.economy.refundBuild(e.type); }
        break;
      case 'remove':
        for (const s of u.snaps) this.restore(s);
        break;
      case 'wire':
        disconnect(u.a, u.b);
        break;
      case 'unwire':
        for (const [a, b] of u.pairs) if (!a.removed && !b.removed) connect(a, b);
        break;
      case 'rotate':
        if (!u.e.removed) { u.e.dir = u.dir; u.e.obj.rotation.y = -u.dir * Math.PI / 2; game.emit('moved', u.e); }
        break;
      case 'struct': {
        if (!structures.has(u.key)) break;
        removeStructure(u.key);
        game.economy.refund(u.cost);
        game.emit('materials');
        break;
      }
      case 'unstruct': {
        if (structures.has(u.data.key)) break;
        if (!game.economy.pay(u.cost)) { game.ui.toast('Sem itens pra reconstruir', 'warn'); break; }
        addStructure(u.data);
        game.emit('materials');
        break;
      }
      case 'paint': { const s = structures.get(u.key); if (s) paintStructure(s, u.prev); break; }
      case 'painting':
        if (structures.has(u.key)) { removeStructure(u.key); game.economy.addItem(u.painting); }
        break;
      case 'unpainting':
        if (!structures.has(u.key) && game.economy.takeItem(u.painting)) addPainting({ key: u.key, painting: u.painting });
        break;
    }
    audio.play('back', { volume: 0.5 });
    game.ui.toast('↶ Desfeito');
    game.emit('hotbar');
  }

  // ─── caminho de esteiras ───
  // 1º clique: começo (mirando numa máquina ou esteira, começa na frente da saída dela)
  beltClick() {
    if (!this.target) return;
    if (!this.beltA) {
      let A = { x: this.target.x, z: this.target.z };
      const on = this.hover?.entity || grid.get(key(A.x, A.z));
      if (on && on.cellIn && on.layer !== 1) {
        if (!on.outputDirs?.length) { game.ui.toast('Comece no chão ou na saída (seta laranja) de uma máquina/esteira', 'warn'); audio.play('deny', { volume: 0.5 }); return; }
        const [x, z] = on.cellIn(on.outputDirs[0]);
        A = { x, z, from: on.outputDirs[0] };
      }
      this.beltA = A;
      this.beltFlip = false;
      this.pathSig = '';
      audio.play('tick', { volume: 0.5 });
      game.emit('hotbar');
      return;
    }
    const P = this.path;
    if (!P) return;
    if (P.reason) { game.ui.toast(P.reason, 'warn'); audio.play('deny', { volume: 0.5 }); return; }
    const t = this.selected, eco = game.economy;
    if (!eco.isUnlocked(t)) { game.ui.toast(`🔒 ${MACHINES[t].nome} ainda está bloqueado`, 'warn'); return; }
    if (!P.n) { this.cancelBeltPath(); return; }
    eco.pay(P.cost);
    const ents = [], snaps = [];
    for (const c of P.cells) {
      if (c.kind === 'skip') continue;
      let data = null;
      if (c.kind === 'replace') {
        const old = grid.get(key(c.x, c.z));
        snaps.push(this.snapshot(old));
        data = { items: old.items.map((i) => [i.type, i.p, i.entry]) };
        this.despawn(old);
        eco.refundBuild(old.type);
      }
      const e = this.spawn(t, c.x, c.z, c.dir, data);
      if (e) ents.push(e);
    }
    this.pushUndo({ kind: 'beltPath', ents, snaps });
    audio.play('place', { volume: 0.9 });
    if (ents.length > 1) game.ui.toast(`🛤️ ${ents.length} esteiras construídas · <kbd>Ctrl+Z</kbd> desfaz`, 'good');
    this.cancelBeltPath();
    game.emit('built', ents[0]);
  }
  cancelBeltPath() {
    const had = !!this.beltA;
    this.beltA = null;
    this.path = null;
    for (const g of this.pathGhosts) g.visible = false;
    if (had) game.emit('hotbar');
    return had;
  }
  // caminho em L do início até a célula mirada (R troca o lado da curva)
  computeBeltPath() {
    const A = this.beltA, T = this.target, t = this.selected, MAX = 80;
    const pts = [[A.x, A.z]];
    let x = A.x, z = A.z;
    const sx = Math.sign(T.x - A.x), sz = Math.sign(T.z - A.z);
    const goX = () => { while (x !== T.x && pts.length < MAX) { x += sx; pts.push([x, z]); } };
    const goZ = () => { while (z !== T.z && pts.length < MAX) { z += sz; pts.push([x, z]); } };
    if (this.beltFlip) { goZ(); goX(); } else { goX(); goZ(); }
    // mirando numa máquina: o caminho para na frente dela (a última esteira entra nela)
    while (pts.length > 1) { const g = grid.get(key(...pts[pts.length - 1])); if (g && !isBeltTier(g.type)) pts.pop(); else break; }
    const dirTo = (a, b) => DIRS.findIndex(([dx, dz]) => dx === b[0] - a[0] && dz === b[1] - a[1]);
    const cells = pts.map(([cx, cz], i) => {
      const dir = i < pts.length - 1 ? dirTo(pts[i], pts[i + 1]) : pts.length > 1 ? dirTo(pts[i - 1], pts[i]) : (A.from ?? this.dir);
      const inDir = i > 0 ? dirTo(pts[i - 1], pts[i]) : (A.from ?? dir);
      const c = { x: cx, z: cz, dir, inDir, kind: 'new', why: null };
      const why = this.cellValid(cx, cz, t);
      const old = grid.get(key(cx, cz));
      if (why) {
        if (old && old.type === t && old.dir === dir) c.kind = 'skip';
        else { c.kind = 'bad'; c.why = why; }
      } else if (old && isBeltTier(old.type)) c.kind = 'replace';
      return c;
    });
    const n = cells.filter((c) => c.kind === 'new' || c.kind === 'replace').length;
    const cost = {};
    for (const [k, v] of Object.entries(game.economy.buildCost(t))) cost[k] = v * n;
    const bad = cells.find((c) => c.kind === 'bad');
    const miss = game.economy.missing(cost);
    const reason = bad ? bad.why : Object.keys(miss).length ? 'Faltam itens: ' + Object.entries(miss).map(([k, v]) => `${v}× ${itemName(k)}`).join(', ') : null;
    return { cells, n, cost, reason };
  }
  updateBeltPath() {
    if (!this.beltA || !isBeltTier(this.selected)) { for (const g of this.pathGhosts) g.visible = false; return; }
    if (this.ghost) this.ghost.visible = false;
    this.arrow.visible = false;
    this.foot.visible = false;
    if (!this.target) return;
    const sig = `${this.target.x},${this.target.z},${this.beltFlip},${game.entities.length},${game.economy.count(Object.keys(game.economy.buildCost(this.selected))[0] || '')}`;
    if (sig !== this.pathSig || !this.path) {
      const prev = this.path ? `${this.path.n}|${this.path.reason}` : '';
      this.path = this.computeBeltPath();
      this.pathSig = sig;
      if (`${this.path.n}|${this.path.reason}` !== prev) game.emit('hotbar');
    }
    const cells = this.path.cells;
    while (this.pathGhosts.length < cells.length) {
      const h = new THREE.Group();
      const s = cloneModel('belt'); s.rotation.y = MODEL_YAW.belt || 0;
      const c = cloneModel('beltCorner');
      h.add(s, c);
      h.userData = { s, c };
      game.scene.add(h);
      this.pathGhosts.push(h);
    }
    this.pathGhosts.forEach((h, i) => {
      const c = cells[i];
      h.visible = !!c;
      if (!c) return;
      const p = cellCenter(c.x, c.z);
      h.position.set(p.x, p.y + 0.02, p.z);
      h.rotation.y = -c.dir * Math.PI / 2;
      const turn = c.inDir !== c.dir;
      h.userData.s.visible = !turn;
      h.userData.c.visible = turn;
      // mesma regra do Belt.refreshShape: alimentada pela esquerda ou pela direita
      if (turn) h.userData.c.rotation.y = (c.inDir + 2) % 4 === (c.dir + 3) % 4 ? -Math.PI / 2 : -Math.PI;
      const m = c.kind === 'bad' || this.path.reason ? (c.kind === 'skip' ? this.ghostMatSkip : this.ghostMatBad) : c.kind === 'skip' ? this.ghostMatSkip : this.ghostMatOk;
      h.traverse((o) => { if (o.isMesh) { o.material = m; o.castShadow = false; } });
    });
    // seta amarela no fim: pra onde os itens vão sair
    const end = cells[cells.length - 1];
    if (end) {
      const p = cellCenter(end.x, end.z);
      this.arrow.visible = true;
      this.arrow.position.set(p.x, p.y + 0.02, p.z);
      this.arrow.rotation.y = -end.dir * Math.PI / 2;
    }
  }

  // ─── copiar e colar grupos ───
  startCopy() {
    this.select(null);
    this.copyMode = true;
    this.copyA = null;
    game.gridMesh.visible = true;
    game.ui.toast('📋 Copiar: clique no primeiro canto da área, depois no segundo. Botão direito cancela.');
  }
  copyClick() {
    if (!this.target) return;
    if (!this.copyA) { this.copyA = { x: this.target.x, z: this.target.z }; audio.play('click', { volume: 0.5 }); return; }
    const a = this.copyA, b = this.target;
    const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), z0 = Math.min(a.z, b.z), z1 = Math.max(a.z, b.z);
    const ents = game.entities.filter((e) => e.x >= x0 && e.x <= x1 && e.z >= z0 && e.z <= z1 && e.type);
    this.copyMode = false;
    this.selBox.visible = false;
    if (!ents.length) { game.ui.toast('Nada pra copiar nessa área', 'warn'); game.gridMesh.visible = false; return; }
    const set = new Set(ents);
    const items = ents.map((e) => {
      const d = e.serialize();
      delete d.name; delete d.inv; delete d.out; delete d.items; delete d.held; delete d.progress;
      return { type: e.type, dx: e.x - x0, dz: e.z - z0, dir: e.dir, data: d };
    });
    const wires = [];
    for (const e of ents) for (const w of wiresOf(e)) if (w.a === e && set.has(w.b)) wires.push([ents.indexOf(w.a), ents.indexOf(w.b)]);
    this.clipboard = { items, wires, w: x1 - x0 + 1, h: z1 - z0 + 1 };
    audio.play('buy', { volume: 0.5 });
    game.ui.toast(`📋 Copiado: ${ents.length} peças. Clique pra colar, <kbd>R</kbd> gira, <kbd>V</kbd> cola de novo depois.`, 'good');
    this.startPaste();
  }
  startPaste() {
    if (!this.clipboard) { game.ui.toast('Copie algo antes com a tecla C', 'warn'); return; }
    this.selected = null;
    this.refreshGhost();
    this.pasteMode = true;
    this.pasteRot = 0;
    game.gridMesh.visible = true;
    this.buildPasteGhost();
    game.emit('hotbar');
  }
  // posição/direção de um item do grupo depois de girar
  rotated(it) {
    const { w, h } = this.clipboard;
    let dx = it.dx, dz = it.dz;
    for (let i = 0; i < this.pasteRot; i++) { const ndx = (i % 2 === 0 ? h : w) - 1 - dz; dz = dx; dx = ndx; }
    return { dx, dz, dir: (it.dir + this.pasteRot) % 4 };
  }
  buildPasteGhost() {
    if (this.pasteGhost) game.scene.remove(this.pasteGhost);
    const g = new THREE.Group();
    for (const it of this.clipboard.items) {
      const r = this.rotated(it);
      const mk = defOf(it.type).model;
      const m = cloneModel(mk);
      m.rotation.y = MODEL_YAW[mk] || 0;
      const holder = new THREE.Group();
      holder.add(m);
      holder.position.set((r.dx + 0.5) * CELL, layerOf(it.type) ? 0 : 0, (r.dz + 0.5) * CELL);
      holder.rotation.y = -r.dir * Math.PI / 2;
      g.add(holder);
    }
    g.traverse((o) => { if (o.isMesh) { o.material = this.ghostMatOk; o.castShadow = false; } });
    this.pasteGhost = g;
    game.scene.add(g);
  }
  pasteNeeds() {
    const cost = {};
    for (const it of this.clipboard.items) for (const [k, n] of Object.entries(game.economy.buildCost(it.type))) cost[k] = (cost[k] || 0) + n;
    return { cost, locked: this.clipboard.items.find((it) => MACHINES[it.type] && !game.economy.isUnlocked(it.type)) };
  }
  pasteProblem() {
    if (!this.target) return 'Mire no chão';
    for (const it of this.clipboard.items) {
      const r = this.rotated(it);
      const why = this.cellValid(this.target.x + r.dx, this.target.z + r.dz, it.type);
      if (why) return why;
    }
    const { cost, locked } = this.pasteNeeds();
    if (locked) return `🔒 ${MACHINES[locked.type].nome} ainda está bloqueado`;
    const miss = game.economy.missing(cost);
    if (Object.keys(miss).length) return 'Faltam itens: ' + Object.entries(miss).map(([k, n]) => `${n}× ${itemName(k)}`).join(', ');
    return null;
  }
  pasteClick() {
    const why = this.pasteProblem();
    if (why) { game.ui.toast(why, 'warn'); audio.play('deny', { volume: 0.5 }); return; }
    const { cost } = this.pasteNeeds();
    game.economy.pay(cost);
    const made = [];
    for (const it of this.clipboard.items) {
      const r = this.rotated(it);
      made.push(this.spawn(it.type, this.target.x + r.dx, this.target.z + r.dz, r.dir, it.data));
    }
    for (const [i, j] of this.clipboard.wires) if (made[i] && made[j]) connect(made[i], made[j]);
    this.pushUndo({ kind: 'group', ents: made });
    game.economy.stats.pasted = (game.economy.stats.pasted || 0) + 1;
    audio.play('place', { volume: 0.9 });
    game.ui.toast(`📋 Colou ${made.length} peças · <kbd>Ctrl+Z</kbd> desfaz`, 'good');
    game.emit('hotbar');
  }
  cancelModes() {
    const was = this.copyMode || this.pasteMode;
    this.copyMode = false;
    this.pasteMode = false;
    this.copyA = null;
    this.selBox.visible = false;
    if (this.pasteGhost) { game.scene.remove(this.pasteGhost); this.pasteGhost = null; }
    if (was) game.gridMesh.visible = false;
  }
}

export { DIRS };
