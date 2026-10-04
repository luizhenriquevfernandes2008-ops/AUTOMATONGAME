// Carrega modelos 3D e texturas (tudo baixado: Kenney, Quaternius, Kay Lousberg, Poly Haven).
// v2 · KX-7: cada modelo passa pela paleta do trailer (kxstyle.js) ao carregar.
import { buildBigModels } from './models3.js';
import { buildMoreModels } from './models4.js';
import { buildTete } from './tete.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CELL } from './data.js';
import { kxify } from './kxstyle.js';
import { makeEnvMap } from './kxsky.js';

const F = 'assets/models/factory/', S = 'assets/models/space/', N = 'assets/models/nature/', U = 'assets/models/furniture/';
const K = 'assets/models/kx7/', ST = 'assets/models/station/';

// key: [arquivo, opções de normalização]
// fit: tamanho alvo do maior lado horizontal (m) | h: altura alvo (m) | scale: escala fixa
export const MODEL_DEFS = {
  miner: [K + 'drill.glb', { h: 2.3, kx: 'amber' }],
  smelter: [F + 'machine-window.glb', { fit: CELL * 0.92 }],
  assembler: [F + 'machine-fortified.glb', { fit: CELL * 0.92 }],
  constructorM: [F + 'machine-window-bar.glb', { fit: CELL * 0.92 }],
  sorter: [F + 'scanner-high.glb', { fit: CELL * 0.95 }],
  seller: [F + 'hopper-high-square.glb', { fit: CELL * 0.9 }],
  chest: [F + 'box-large.glb', { fit: CELL * 0.8 }],
  computer: [F + 'screen-panel-wide.glb', { fit: CELL * 0.95 }],
  generator: [S + 'machine_generator.glb', { fit: CELL * 0.95 }],
  generatorBig: [S + 'machine_generatorLarge.glb', { fit: CELL * 0.98 }],
  pole: [K + 'antenna_tower.glb', { h: 2.8, kx: 'steel' }],
  // máquinas novas
  lab: [S + 'hangar_roundGlass.glb', { fit: CELL * 0.98 }],
  hangar: [S + 'hangar_smallA.glb', { fit: CELL * 0.98 }],
  coalGen: [S + 'machine_barrelLarge.glb', { fit: CELL * 0.85 }],
  trash: [U + 'trashcan.glb', { h: 0.95 }],
  speakerBox: [U + 'speaker.glb', { h: 1.05 }],
  lamp: [F + 'warning-orange.glb', { h: 1.25 }],
  splitter: [F + 'conveyor-stripe-junction-t.glb', { scale: CELL }],
  merger: [F + 'conveyor-stripe-cross.glb', { scale: CELL }],
  scanArch: [F + 'scanner-low.glb', { fit: CELL * 0.95 }],
  supportHigh: [S + 'supports_high.glb', { h: 1.8 }],
  // v2 · KX-7: modelos baixados novos (Quaternius / Kay Lousberg via Poly Pizza, Kenney Space Kit)
  solar: [K + 'solar.glb', { fit: CELL * 0.95 }],
  drone: [K + 'drone.glb', { fit: 0.95, kx: false }],
  turbine: [K + 'turbine.glb', { h: 4.5 }],
  baseDome: [K + 'base_dome.glb', { h: 4 }],
  mountains: [K + 'mountains.glb', { fit: 120, kx: 'mountain' }],
  chimney: [S + 'chimney_detailed.glb', { h: 3.2 }],
  hangarLarge: [S + 'hangar_largeA.glb', { fit: 7 }],
  structureA: [S + 'structure_detailed.glb', { h: 3 }],
  craftMiner: [S + 'craft_miner.glb', { fit: 3.5 }],
  // plataforma de lançamento e foguete
  launchPad: [S + 'platform_large.glb', { fit: CELL * 3 }],
  tower: [S + 'supports_high.glb', { h: 3.2 }],
  rocketBase: [S + 'rocket_baseA.glb', { scale: 1.7 }],
  rocketFuel: [S + 'rocket_fuelA.glb', { scale: 1.7 }],
  rocketSides: [S + 'rocket_sidesA.glb', { scale: 1.7 }],
  rocketFins: [S + 'rocket_finsA.glb', { scale: 1.7 }],
  rocketTop: [S + 'rocket_topA.glb', { scale: 1.7 }],
  cog: [F + 'cog-a.glb', { fit: 0.32, center: true }],
  oopi: [F + 'oopi.glb', { h: 0.36 }],
  robotArm: [F + 'robot-arm-a.glb', { h: 0.9 }],
  screenWide: [F + 'screen-hanging-wide.glb', { scale: 2.4 }],
  warning: [F + 'warning-orange.glb', { h: 1.2 }],
  traffic: [F + 'warning-traffic.glb', { h: 1.4 }],
  pipe: [F + 'pipe-large-long.glb', { scale: 1.5 }],
  crane: [F + 'crane.glb', { scale: 1.6 }],
  floorTile: [F + 'floor-large.glb', { scale: CELL }],
  floorTileB: [F + 'top-large-checkerboard.glb', { scale: CELL }],
  // minérios (cristais do Space Kit, recoloridos)
  crystalA: [S + 'rock_crystalsLargeA.glb', { fit: CELL * 0.95, kx: false }],
  crystalB: [K + 'mineral.glb', { fit: CELL * 0.9, kx: false }],
  crystalSmall: [S + 'rock_crystals.glb', { fit: 0.3, center: true, kx: false }],
  meteor: [S + 'meteor_detailed.glb', { fit: 0.3, center: true, kx: 'rock' }],
  // decoração comprável
  d_plant: [U + 'pottedPlant.glb', { h: 1.1 }],
  d_flowers: [N + 'flower_yellowA.glb', { h: 0.55 }],
  d_tree: [K + 'mineral.glb', { h: 2.6, kx: 'crystal' }],
  d_bench: [U + 'bench.glb', { fit: CELL * 0.95 }],
  d_lamp: [K + 'streetlight.glb', { h: 1.8 }],
  d_sofa: [U + 'loungeSofa.glb', { fit: CELL * 0.98, kx: 'steel' }],
  d_coffee: [U + 'kitchenCoffeeMachine.glb', { h: 0.55 }],
  d_barrels: [S + 'barrels.glb', { fit: CELL * 0.85 }],
  d_dish: [S + 'satelliteDish_large.glb', { h: 2.2 }],
  // cenário
  desk: [ST + 'table-large.glb', { scale3: [1.15, 1.9, 1.05] }], // mesa da estação na altura de escrivaninha
  chairDesk: [ST + 'chair-armrest-headrest.glb', { h: 1.05 }],
  pcScreen: [ST + 'computer-screen.glb', { fit: 0.8 }],
  keyboard: [U + 'computerKeyboard.glb', { fit: 0.45 }],
  radio: [U + 'radio.glb', { fit: 0.45 }],
  rug: [ST + 'structure-panel.glb', { scale3: [3.8, 0.15, 3.8] }],
  bar: [ST + 'table-display.glb', { fit: CELL }],
  barEnd: [U + 'kitchenBarEnd.glb', { fit: CELL }],
  bookcase: [ST + 'container-tall.glb', { fit: 1.4 }],
  tableCoffee: [ST + 'table-inset.glb', { fit: 1.1 }],
  plantSmall: [S + 'rock_crystals.glb', { h: 0.3, kx: 'crystal' }],
  speaker: [U + 'speaker.glb', { h: 1.0 }],
  wireless: [S + 'machine_wireless.glb', { fit: 1.3 }],
  tent: [K + 'lander.glb', { h: 3.2 }],
  campfire: [N + 'campfire_stones.glb', { fit: 1.2 }],
  logStack: [K + 'cargo.glb', { fit: 1.8 }],
  sign: [ST + 'display-wall-wide.glb', { h: 1.2 }],
  fence: [N + 'fence_simple.glb', { scale: 3.2 }],
  stump: [S + 'rocks_smallA.glb', { h: 0.5, kx: 'rock' }],
  // horta
  plot: [N + 'crops_dirtRow.glb', { fit: CELL * 0.98 }],
  c_leafsA: [N + 'crops_leafsStageA.glb', { scale: 1.5 }],
  c_leafsB: [N + 'crops_leafsStageB.glb', { scale: 1.5 }],
  c_bush: [N + 'plant_bushDetailed.glb', { h: 0.95 }],
  c_cornA: [N + 'crops_cornStageA.glb', { scale: 1.5 }],
  c_cornB: [N + 'crops_cornStageB.glb', { scale: 1.5 }],
  c_cornC: [N + 'crops_cornStageC.glb', { scale: 1.5 }],
  c_cornD: [N + 'crops_cornStageD.glb', { scale: 1.5 }],
  c_carrot: [N + 'crop_carrot.glb', { scale: 1.5 }],
  c_pumpkin: [N + 'crop_pumpkin.glb', { scale: 1.6 }],
  c_melon: [N + 'crop_melon.glb', { scale: 1.6 }],
  c_bambooA: [N + 'crops_bambooStageA.glb', { scale: 1.6 }],
  c_bambooB: [N + 'crops_bambooStageB.glb', { scale: 1.8 }],
  sprinkler: [F + 'pipe-large-valve.glb', { h: 0.85 }],
  depotBase: [S + 'machine_barrel.glb', { fit: CELL * 0.9 }],
  // construção (Furniture Kit, esticadas pro tamanho da célula)
  s_wall: [U + 'wall.glb', { scale3: [CELL, 2, 1.6] }],
  s_window: [U + 'wallWindow.glb', { scale3: [CELL, 2, 1.6] }],
  s_door: [U + 'wallDoorway.glb', { scale3: [CELL, 2, 1.6] }],
  s_floor: [U + 'floorFull.glb', { scale3: [CELL, 1, CELL] }],
  s_fence: [N + 'fence_planks.glb', { scale3: [CELL, 2.4, 1.6] }],
  // móveis do escritório
  o_bookcase: [U + 'bookcaseClosedWide.glb', { fit: CELL * 0.95 }],
  o_armchair: [U + 'loungeChairRelax.glb', { fit: CELL * 0.8 }],
  o_sofaLong: [U + 'loungeSofaLong.glb', { fit: CELL * 0.98 }],
  o_tvRack: [U + 'cabinetTelevision.glb', { fit: CELL * 0.9 }],
  o_tvSet: [U + 'televisionModern.glb', { fit: CELL * 0.8 }],
  o_rug: [U + 'rugRectangle.glb', { fit: CELL * 0.98 }],
  o_floorLamp: [U + 'lampSquareFloor.glb', { h: 1.7 }],
  o_tableRound: [U + 'tableRound.glb', { fit: CELL * 0.8 }],
  o_chair: [U + 'chairCushion.glb', { h: 1.0 }],
  o_sideTableBase: [U + 'sideTable.glb', { fit: CELL * 0.55 }],
  o_tableLamp: [U + 'lampRoundTable.glb', { h: 0.55 }],
  o_fridge: [U + 'kitchenFridgeSmall.glb', { h: 0.95 }],
  o_coatRack: [U + 'coatRackStanding.glb', { h: 1.8 }],
  o_bear: [U + 'bear.glb', { h: 0.55 }],
  o_plant: [U + 'plantSmall2.glb', { h: 0.5 }],
  o_fan: [U + 'ceilingFan.glb', { fit: 1.3 }],
  // eventos
  meteorRock: [S + 'meteor.glb', { fit: 0.9, kx: 'rock' }],
  meteorSmall: [S + 'meteor_half.glb', { fit: 0.4, center: true, kx: 'rock' }],
  crater: [S + 'craterLarge.glb', { fit: CELL * 1.5, kx: 'rock' }],
  // v1.3: contratos, desafios, discos, TÊTÊ e loja de fichas
  dockBase: [S + 'platform_center.glb', { fit: CELL * 0.98 }],
  boxCard: [U + 'cardboardBoxClosed.glb', { fit: 0.55 }],
  boxCardOpen: [U + 'cardboardBoxOpen.glb', { fit: 0.6 }],
  crateLost: [U + 'cardboardBoxClosed.glb', { fit: 0.9 }],
  books: [U + 'books.glb', { fit: 0.35 }],
  terminal: [S + 'desk_computer.glb', { fit: 1.6 }],
  terminalChair: [S + 'desk_chair.glb', { h: 1.0 }],
  cargoShip: [S + 'craft_speederA.glb', { fit: 2.6 }],
  d_astronaut: [S + 'astronautA.glb', { h: 1.6 }],
  d_alien: [S + 'alien.glb', { h: 1.0 }],
  d_rover: [S + 'rover.glb', { fit: CELL * 0.95 }],
  d_ship: [S + 'craft_speederA.glb', { fit: CELL * 0.98 }],
  hat_flower: [N + 'flower_yellowA.glb', { h: 0.22 }],
  hat_cone: [F + 'cone.glb', { h: 0.3 }],
  hat_mushroom: [N + 'mushroom_red.glb', { h: 0.26 }],
  hat_dish: [S + 'satelliteDish.glb', { h: 0.3 }],
  hat_crystal: [S + 'rock_crystals.glb', { h: 0.14, kx: 'crystal' }],
};

// v2 · KX-7: no lugar da floresta, paisagem alienígena (rochas, agulhas de pedra e cristais roxos)
const ALIEN = {
  a_spire: [K + 'rock_spire.glb', { h: 7, kx: 'rock' }],
  a_boulder: [K + 'rock_boulder.glb', { h: 2.6, kx: 'rock' }],
  a_rocks: [K + 'rocks_group.glb', { h: 2.2, kx: 'rock' }],
  a_rockA: [S + 'rock_largeA.glb', { h: 3.4, kx: 'rock' }],
  a_rockB: [S + 'rock_largeB.glb', { h: 3.0, kx: 'rock' }],
  a_rock: [S + 'rock.glb', { h: 1.6, kx: 'rock' }],
  a_crystal: [K + 'mineral.glb', { h: 2.8, kx: 'crystal' }],
  a_crystalK: [S + 'rock_crystalsLargeA.glb', { h: 2.2, kx: 'crystal' }],
  a_crystalK2: [S + 'rock_crystalsLargeB.glb', { h: 2.2, kx: 'crystal' }],
};
Object.assign(MODEL_DEFS, ALIEN);
// sorteio do anel de paisagem (repetido = aparece mais; a agulha é pesada, aparece pouco)
export const TREE_KEYS = ['a_boulder', 'a_boulder', 'a_rocks', 'a_rockA', 'a_rockA', 'a_rockB', 'a_rockB', 'a_rock', 'a_crystal', 'a_crystalK', 'a_crystalK2', 'a_spire'];
const PROPS = {
  n_rocks_smallA: [S + 'rocks_smallA.glb', { scale: 3.2, kx: 'rock' }],
  n_rocks_smallB: [S + 'rocks_smallB.glb', { scale: 3.2, kx: 'rock' }],
  n_rock_largeA: [S + 'rock_largeA.glb', { scale: 2.4, kx: 'rock' }],
  n_rock_largeB: [S + 'rock_largeB.glb', { scale: 2.4, kx: 'rock' }],
  n_meteor: [S + 'meteor_half.glb', { scale: 2.6, kx: 'rock' }],
  n_crater: [S + 'crater.glb', { scale: 2.6, kx: 'rock' }],
  n_bones: [S + 'bones.glb', { scale: 2.4 }],
  n_crystal: [S + 'rock_crystals.glb', { scale: 3.2, kx: 'crystal' }],
  n_station_rocks: [ST + 'rocks.glb', { scale: 2.2, kx: 'rock' }],
};
Object.assign(MODEL_DEFS, PROPS);
export const PROP_KEYS = Object.keys(PROPS);

// 3.0 · flora de KX-7: modelos da natureza normalizados pra 1 m de altura (a flora.js estica e retinge por bioma)
const FLORA = {};
for (const f of ['tree_pineTallA', 'tree_pineTallB', 'tree_plateau', 'tree_oak', 'tree_pineRoundA', 'tree_pineRoundB', 'tree_pineRoundC', 'tree_detailed',
  'plant_bush', 'plant_bushLarge', 'plant_bushSmall', 'grass', 'grass_large', 'grass_leafs', 'flower_purpleA', 'flower_purpleB', 'flower_purpleC',
  'flower_redA', 'flower_yellowA', 'mushroom_redTall', 'mushroom_tanTall', 'mushroom_redGroup', 'mushroom_tanGroup', 'tree_simple_fall', 'tree_tall', 'stump_round', 'log']) {
  FLORA['f_' + f] = [N + f + '.glb', { h: 1, kx: false }];
}
FLORA.f_lily_large = [N + 'lily_large.glb', { fit: 1, kx: false }];
FLORA.f_lily_small = [N + 'lily_small.glb', { fit: 1, kx: false }];
Object.assign(MODEL_DEFS, FLORA);

export const assets = {
  models: {},
  textures: {},
  envMap: null,
  skyTexture: null,
};

function normalize(root, opt) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  let s = 1;
  if (opt.scale3) { // escala diferente em cada eixo (paredes e pisos esticados pra célula)
    const center3 = box.getCenter(new THREE.Vector3());
    const inner3 = new THREE.Group();
    inner3.add(root);
    root.position.set(-center3.x, -box.min.y, -center3.z);
    inner3.scale.set(...opt.scale3);
    const outer3 = new THREE.Group();
    outer3.add(inner3);
    outer3.userData.size = size.multiply(new THREE.Vector3(...opt.scale3));
    root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return outer3;
  }
  if (opt.scale) s = opt.scale;
  else if (opt.fit) s = opt.fit / Math.max(size.x, size.z);
  else if (opt.h) s = opt.h / size.y;
  const center = box.getCenter(new THREE.Vector3());
  const inner = new THREE.Group();
  inner.add(root);
  root.position.set(-center.x, opt.center ? -center.y : -box.min.y, -center.z);
  const outer = new THREE.Group();
  inner.scale.setScalar(s);
  outer.add(inner);
  outer.userData.size = size.multiplyScalar(s);
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => {
        if (m.map) m.map.anisotropy = 4;
        if (m.metalness > 0.5) m.metalness = 0.3;
      });
    }
  });
  return outer;
}

// chave estável da imagem de uma textura do glTF (pasta + arquivo), pra converter cada atlas uma vez só
function texKeyOf(g, url) {
  const json = g.parser.json, dir = url.slice(0, url.lastIndexOf('/') + 1);
  return (tex) => {
    const a = g.parser.associations.get(tex);
    if (!a || a.textures === undefined) return null;
    const src = json.textures?.[a.textures]?.source;
    const img = json.images?.[src];
    if (!img) return null;
    return img.uri ? dir + img.uri : url + '#img' + src;
  };
}

export async function loadAll(renderer, onProgress) {
  const manager = new THREE.LoadingManager();
  const gltf = new GLTFLoader(manager);
  const texLoader = new THREE.TextureLoader(manager);
  const entries = Object.entries(MODEL_DEFS);
  const total = entries.length + 3;
  let done = 0;
  const tick = (label) => { done++; onProgress && onProgress(done / total, label); };

  const modelPromises = entries.map(([key, [url, opt]]) =>
    gltf.loadAsync(url).then((g) => {
      if (opt.kx !== false) kxify(g.scene, opt.kx || 'auto', texKeyOf(g, url));
      assets.models[key] = normalize(g.scene, opt);
      tick(url);
    }).catch((e) => { console.warn('Falhou modelo', url, e); assets.models[key] = new THREE.Group(); tick(url); })
  );

  const tex = (name, file, srgb, rep) => texLoader.loadAsync('assets/textures/' + file).then((t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rep, rep);
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    assets.textures[name] = t;
    tick(file);
  });
  // chão de KX-7: terra vermelha rachada (Poly Haven)
  const texPromises = [
    tex('ground', 'cracked_red_ground_diff.jpg', true, 70), tex('groundN', 'cracked_red_ground_nor_gl.jpg', false, 70), tex('groundR', 'cracked_red_ground_rough.jpg', false, 70),
  ];
  await Promise.all([...modelPromises, ...texPromises]);
  buildProcedural();
  assets.envMap = makeEnvMap(renderer); // reflexos vêm do céu de KX-7
}

// modelos montados por código (a partir das peças já carregadas)
const ELEV = 1.8;
function buildProcedural() {
  const M = assets.models;
  const wrap = (g, size) => { const o = new THREE.Group(); o.add(g); o.userData.size = size; o.traverse((x) => { if (x.isMesh) { x.castShadow = true; x.receiveShadow = true; } }); return o; };
  // 3.0.4: minerador, construtora, montadora, esteiras estilo Satisfactory etc. (models4.js)
  buildMoreModels(M, wrap);
  M.belt = M.beltS3; M.beltCorner = M.beltC3;
  // estátua do TÊTÊ (decoração): ele de pedra num pedestal
  {
    const g = new THREE.Group();
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.0, 0.5, 20), new THREE.MeshStandardMaterial({ color: 0x7c786f, roughness: 0.9 }));
    ped.position.y = 0.25; g.add(ped);
    const t = buildTete({ stone: true }).root; t.scale.setScalar(2.6); t.position.y = 0.5; t.rotation.y = 0; g.add(t);
    M.d_statue = wrap(g, new THREE.Vector3(2, 0.5 + 0.78 * 2.6, 2));
  }
  const beltClone = () => { const b = M.belt.clone(true); b.rotation.y = Math.PI / 2; return b; };
  // esteira elevada: esteira em cima de uma torre
  {
    const g = new THREE.Group();
    const b = beltClone(); b.position.y = ELEV; g.add(b);
    const s = M.supportHigh.clone(true); s.scale.multiplyScalar(0.55); g.add(s);
    M.beltHigh = wrap(g, new THREE.Vector3(CELL, ELEV + 0.6, CELL));
  }
  // rampas: esteira inclinada
  for (const up of [true, false]) {
    const g = new THREE.Group();
    const len = Math.hypot(CELL, ELEV);
    const ang = Math.atan2(ELEV, CELL);
    const holder = new THREE.Group();
    const b = beltClone(); b.scale.x = len / CELL; holder.add(b);
    holder.rotation.x = up ? ang : -ang;
    holder.position.y = ELEV / 2 - 0.2;
    g.add(holder);
    const s = M.supportHigh.clone(true); s.scale.multiplyScalar(0.45); s.position.z = up ? -CELL * 0.35 : CELL * 0.35; g.add(s);
    M[up ? 'rampUp' : 'rampDown'] = wrap(g, new THREE.Vector3(CELL, ELEV + 0.6, CELL));
  }
  // Central (HUB) 3×3: plataforma, cúpula, antena e o terminal dos marcos
  {
    const g = new THREE.Group();
    const base = M.launchPad.clone(true); g.add(base);
    const by = M.launchPad.userData.size?.y || 0.3;
    const dome = M.baseDome.clone(true);
    const ds = (CELL * 2.3) / Math.max(M.baseDome.userData.size.x, M.baseDome.userData.size.z);
    dome.scale.multiplyScalar(ds); dome.position.set(0, by, -CELL * 0.25); g.add(dome);
    const dish = M.d_dish.clone(true); dish.scale.multiplyScalar(0.7); dish.position.set(CELL * 1.05, by, -CELL * 1.0); g.add(dish);
    const term = M.terminal.clone(true); term.scale.multiplyScalar(0.8); term.position.set(0, by, CELL * 1.05); term.rotation.y = Math.PI; g.add(term);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), new THREE.MeshStandardMaterial({ color: 0x5ff5e0, emissive: 0x3fe0cc, emissiveIntensity: 2 }));
    beacon.position.set(0, by + (M.baseDome.userData.size.y * ds) + 0.25, -CELL * 0.25); g.add(beacon);
    M.hub = wrap(g, new THREE.Vector3(CELL * 3, by + M.baseDome.userData.size.y * ds + 0.4, CELL * 3));
  }
  // Bancada: mesa com uma engrenagem e ferramentas
  {
    const g = new THREE.Group();
    const t = M.bar.clone(true); g.add(t);
    const h = M.bar.userData.size?.y || 0.9;
    const c = M.cog.clone(true); c.position.set(0.25, h + 0.05, 0); c.rotation.x = Math.PI / 2; g.add(c);
    const box = M.boxCard.clone(true); box.scale.multiplyScalar(0.6); box.position.set(-0.3, h, 0.05); g.add(box);
    M.workbench = wrap(g, new THREE.Vector3(CELL, h + 0.3, CELL));
  }
  // 3.0 · Gerador de Biomassa: caldeira com boca de fogo, funil de combustível, chaminé e bobinas de cobre
  {
    const g = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: 0x5a6472, metalness: 0.55, roughness: 0.5 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a2e36, metalness: 0.4, roughness: 0.6 });
    const amber = new THREE.MeshStandardMaterial({ color: 0xffae34, emissive: 0xff8a1a, emissiveIntensity: 0.6, roughness: 0.4 });
    const copper = new THREE.MeshStandardMaterial({ color: 0xc8743a, metalness: 0.7, roughness: 0.35 });
    const add = (geo, mat, x, y, z, name) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); if (name) m.name = name; g.add(m); return m; };
    add(new THREE.BoxGeometry(1.42, 0.12, 1.42), dark, 0, 0.06, 0);
    add(new THREE.CylinderGeometry(0.46, 0.54, 1.05, 14), steel, -0.12, 0.64, 0);
    add(new THREE.CylinderGeometry(0.555, 0.555, 0.08, 14), amber, -0.12, 0.42, 0);
    add(new THREE.CylinderGeometry(0.49, 0.49, 0.06, 14), dark, -0.12, 1.15, 0);
    // boca de fogo (frente = +z)
    add(new THREE.BoxGeometry(0.46, 0.36, 0.1), dark, -0.12, 0.66, 0.47);
    const fire = add(new THREE.PlaneGeometry(0.34, 0.24), new THREE.MeshStandardMaterial({ color: 0x220800, emissive: 0xff6a1a, emissiveIntensity: 0.05 }), -0.12, 0.66, 0.525, 'fire');
    fire.castShadow = false;
    for (let i = -1; i <= 1; i++) add(new THREE.BoxGeometry(0.025, 0.24, 0.02), dark, -0.12 + i * 0.09, 0.66, 0.535);
    // funil de combustível em cima, com a pilha de biomassa
    add(new THREE.CylinderGeometry(0.4, 0.16, 0.34, 12, 1, true), steel, -0.12, 1.36, 0).material.side = THREE.DoubleSide;
    const pile = add(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 12), new THREE.MeshStandardMaterial({ color: 0x6f8a3a, roughness: 0.9 }), -0.12, 1.3, 0, 'fuelpile');
    pile.castShadow = false;
    // chaminé
    add(new THREE.CylinderGeometry(0.085, 0.1, 1.1, 10), dark, -0.42, 1.55, -0.3);
    add(new THREE.CylinderGeometry(0.14, 0.11, 0.08, 10), steel, -0.42, 2.12, -0.3);
    // gerador ao lado: caixa com bobinas de cobre
    add(new THREE.BoxGeometry(0.36, 0.5, 0.62), steel, 0.5, 0.37, 0);
    for (let i = -1; i <= 1; i++) { const t = add(new THREE.TorusGeometry(0.17, 0.045, 8, 16), copper, 0.5, 0.42, i * 0.18); t.rotation.y = Math.PI / 2; }
    add(new THREE.BoxGeometry(0.2, 0.12, 0.12), dark, 0.28, 0.5, 0);
    add(new THREE.BoxGeometry(0.38, 0.04, 0.64), amber, 0.5, 0.64, 0);
    const top = new THREE.Object3D(); top.name = 'chimneyTop'; top.position.set(-0.42, 2.2, -0.3); g.add(top);
    M.burner = wrap(g, new THREE.Vector3(CELL, 2.2, CELL));
  }
  // 3.0.2: prédios grandes e poste novo (models3.js)
  buildBigModels(M, wrap);
  // tela: painel com moldura em dois pés
  {
    const g = new THREE.Group();
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x28313b, roughness: 0.55 });
    const frame = new THREE.Mesh(new THREE.BoxGeometry(CELL * 0.95, 1.05, 0.12), frameMat);
    frame.position.y = 1.35;
    g.add(frame);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(CELL * 0.88, 0.95), new THREE.MeshBasicMaterial({ color: 0x0b1017 }));
    screen.name = 'screen';
    screen.position.set(0, 1.35, -0.065);
    screen.rotation.y = Math.PI;
    g.add(screen);
    for (const x of [-0.5, 0.5]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.85, 0.1), frameMat);
      leg.position.set(x, 0.42, 0);
      g.add(leg);
    }
    M.display = wrap(g, new THREE.Vector3(CELL, 1.9, 0.3));
  }
  // drone: hélices do modelo baixado re-centradas pra poderem girar no próprio eixo
  if (M.drone) {
    M.drone.traverse((o) => {
      if (!o.isMesh || !/^Rotor/.test(o.name)) return;
      o.geometry.computeBoundingBox();
      const c = o.geometry.boundingBox.getCenter(new THREE.Vector3());
      o.geometry.translate(-c.x, -c.y, -c.z);
      o.position.add(c);
    });
  }
  // TV em cima do rack
  {
    const g = new THREE.Group();
    const rack = M.o_tvRack.clone(true); g.add(rack);
    const tv = M.o_tvSet.clone(true); tv.position.y = M.o_tvRack.userData.size.y; g.add(tv);
    M.o_tv = wrap(g, new THREE.Vector3(CELL, M.o_tvRack.userData.size.y + M.o_tvSet.userData.size.y, CELL * 0.5));
  }
  // mesinha com abajur
  {
    const g = new THREE.Group();
    const t = M.o_sideTableBase.clone(true); g.add(t);
    const l = M.o_tableLamp.clone(true); l.position.y = M.o_sideTableBase.userData.size.y; g.add(l);
    M.o_sideTable = wrap(g, new THREE.Vector3(CELL * 0.55, M.o_sideTableBase.userData.size.y + 0.55, CELL * 0.55));
  }
  // doca de entrega: plataforma com caixas de papelão empilhadas
  {
    const g = new THREE.Group();
    g.add(M.dockBase.clone(true));
    const h0 = M.dockBase.userData.size.y;
    for (const [x, z, y, r] of [[-0.3, -0.25, 0, 0.2], [0.28, -0.2, 0, -0.3], [-0.2, 0.28, 0, 0.5], [0, 0, 1, 0.1]]) {
      const b = M.boxCard.clone(true);
      b.position.set(x, h0 + y * M.boxCard.userData.size.y, z);
      b.rotation.y = r;
      g.add(b);
    }
    M.deliveryDock = wrap(g, new THREE.Vector3(CELL, h0 + M.boxCard.userData.size.y * 2, CELL));
  }
  // depósito de materiais: barril grande com pilha de tábuas por cima
  {
    const g = new THREE.Group();
    g.add(M.depotBase.clone(true));
    const logs = M.logStack.clone(true); logs.scale.multiplyScalar(0.45); logs.position.y = M.depotBase.userData.size.y; g.add(logs);
    M.depot = wrap(g, new THREE.Vector3(CELL, M.depotBase.userData.size.y + 0.5, CELL));
  }
}

export function cloneModel(key) {
  const t = assets.models[key];
  if (!t) { console.warn('modelo não existe', key); return new THREE.Group(); }
  const c = t.clone(true);
  c.userData.size = t.userData.size;
  return c;
}

// recolore todos os materiais do objeto (clonando os materiais)
export function tint(obj, color, emissive = 0, emissiveIntensity = 0) {
  obj.traverse((o) => {
    if (o.isMesh) {
      o.material = o.material.clone();
      o.material.color = new THREE.Color(color);
      if (emissive) { o.material.emissive = new THREE.Color(emissive); o.material.emissiveIntensity = emissiveIntensity; }
    }
  });
  return obj;
}
