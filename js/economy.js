// Economia de KX-7 (3.0, igual ao Satisfactory): não tem dinheiro nem venda. Tudo é item:
// o inventário (com espaços e pilhas), os custos das máquinas, os Marcos da Central (tiers),
// as pesquisas do Laboratório e as fases do Projeto Foguete.
import {
  ITEMS, UPGRADES, OBJECTIVES, TECHS, TECH_ALIAS, ACHIEVEMENTS, MILESTONES, TIER_PHASE, MACHINES, PIECES, RECIPES, SMELT, CONSTRUCT,
  START_KIT, START_SLOTS, FRIEND_LEVELS,
} from './data.js';
import { game } from './state.js';

const DEFAULT_LIB = `# Biblioteca "util": use importar("util") em qualquer computador
# Tudo que for definido aqui vira disponível no programa.

def ligar_todas(nomes):
    # liga várias máquinas de uma vez
    for n in nomes:
        maquina(n).ligar()

def turbinar(nomes, k):
    # turbina várias máquinas (precisa repetir a cada poucos segundos)
    for n in nomes:
        maquina(n).turbo(k)
`;

const pilha = (k) => ITEMS[k]?.pilha || 100;

export class Economy {
  constructor() {
    this.items = {};                 // inventário: item -> quantidade
    this.slots = START_SLOTS;        // espaços do inventário
    this.milestones = [];            // marcos pagos
    this.techs = [];                 // pesquisas do Laboratório
    this.phase = 0;                  // fases do foguete entregues
    this.phaseProgress = {};
    this.launched = false;
    this.upgrades = { cpu: 0, esteira: 0, maquinas: 0 };
    this.hotbar = ['minerador', 'gerador', 'poste']; // construções fixadas na barra (já começa com o que dá pra fazer)
    this.collectorSpeed = 1;
    this.stats = { produced: {}, ranCode: false, biomes: {} };
    this.objective = 0;
    this.achievements = [];
    this.libs = { util: DEFAULT_LIB };
    this.netStore = {};
    this.series = [];
    this.sampleT = 10;
    this.lastProducedTotal = 0;
    this.tutorialStep = -1;
    this.records = { itemsMin: 0 };
    // sistemas antigos escondidos (mantidos pra não quebrar o código que ainda os lê)
    this.money = 0; this.xp = 0; this.tokens = 0; this.stars = 0; this.contracts = null; this.challenges = {};
    this.disks = 0; this.altRecipes = []; this.diskChoice = null; this.crates = []; this.inf = {}; this.sats = {};
    this.mission = { n: 0, sat: null, progress: {} }; this.daily = { last: null, streak: 0 };
    this.oopi = { hats: [], colors: ['padrao'], hat: null, color: 'padrao', friend: 0 };
    this.combo = { n: 0, t: 0 }; this.materials = {}; this.inventory = {}; this.regions = []; this.market = {}; this.fair = null;
  }
  // começo de jogo novo: o kit da cápsula de pouso
  giveStartKit() { for (const [k, n] of Object.entries(START_KIT)) this.items[k] = (this.items[k] || 0) + n; game.emit('items'); }

  // ─── inventário ───
  count(k) { return this.items[k] || 0; }
  slotsUsed(items = this.items) { let s = 0; for (const [k, n] of Object.entries(items)) if (n > 0) s += Math.ceil(n / pilha(k)); return s; }
  // quanto desse item ainda cabe
  room(k) {
    const used = this.slotsUsed(), p = pilha(k), have = this.count(k);
    const partial = have % p ? p - (have % p) : 0;
    return partial + Math.max(0, this.slots - used) * p;
  }
  // põe itens no inventário; devolve quantos couberam (0 = cheio)
  give(k, n = 1) {
    if (!ITEMS[k] || n <= 0) return 0;
    const fit = Math.min(n, this.room(k));
    if (fit <= 0) return 0;
    this.items[k] = this.count(k) + fit;
    this.stats.gotItems = this.stats.gotItems || {};
    this.stats.gotItems[k] = true;
    game.emit('items');
    return fit;
  }
  take(k, n = 1) {
    if (this.count(k) < n) return false;
    this.items[k] -= n;
    if (this.items[k] <= 0) delete this.items[k];
    game.emit('items');
    return true;
  }
  has(cost) { return Object.entries(cost || {}).every(([k, n]) => this.count(k) >= n); }
  missing(cost) { return Object.fromEntries(Object.entries(cost || {}).filter(([k, n]) => this.count(k) < n).map(([k, n]) => [k, n - this.count(k)])); }
  pay(cost) {
    if (!this.has(cost)) return false;
    for (const [k, n] of Object.entries(cost || {})) this.take(k, n);
    return true;
  }
  // devolve (se não couber tudo, avisa e devolve o que der)
  refund(cost) {
    let lost = 0;
    for (const [k, n] of Object.entries(cost || {})) lost += n - this.give(k, n);
    if (lost > 0) game.ui?.toast(`🎒 Inventário cheio: ${lost} item(ns) não couberam`, 'warn');
  }

  // ─── construir ───
  buildCost(t) { return MACHINES[t]?.custo || PIECES[t]?.custoItens || {}; }
  canBuild(t) { return this.has(this.buildCost(t)); }
  payBuild(t) { return this.pay(this.buildCost(t)); }
  refundBuild(t) { this.refund(this.buildCost(t)); }
  // compatibilidade com o código antigo (que tinha um inventário de máquinas)
  takeItem(t) { if (MACHINES[t]) { if (!this.isUnlocked(t)) return false; return this.payBuild(t); } return this.take(t, 1); }
  addItem(t, n = 1) { if (MACHINES[t]) { for (let i = 0; i < n; i++) this.refundBuild(t); } else this.give(t, n); }

  // ─── marcos, pesquisas e desbloqueios ───
  done(id) { return this.milestones.includes(id) || this.techs.includes(id); }
  hasTech(id) { return this.techs.includes(id) || (TECH_ALIAS[id] ? this.done(TECH_ALIAS[id]) : false); }
  isUnlocked(t) {
    const d = MACHINES[t];
    if (!d || d.oculto) return false;
    if (t === 'central') return true;
    return !d.u || this.done(d.u);
  }
  pieceUnlocked() { return this.done('m0_3'); }
  recipeUnlocked(k, r) { return (!r.u || this.done(r.u)) && (!r.alt || this.hasAlt(k)); }
  hasAlt(k) { return this.altRecipes.includes(k); }
  tierDone(t) { return MILESTONES.filter((m) => m.tier === t).every((m) => this.milestones.includes(m.id)); }
  tierOpen(t) {
    if (t === 0) return true;
    if (!this.tierDone(t - 1)) return false;
    return this.phase >= (TIER_PHASE[t] || 0);
  }
  // o maior tier liberado
  get tier() { let t = 0; while (t < 5 && this.tierOpen(t + 1)) t++; return t; }
  get level() { return this.tier + 1; }
  milestoneState(id) {
    const m = MILESTONES.find((x) => x.id === id);
    if (!m) return 'locked';
    if (this.milestones.includes(id)) return 'done';
    if (!this.tierOpen(m.tier)) return 'locked';
    if (!this.hubPlaced()) return 'nohub';
    return 'open';
  }
  hubPlaced() { return game.entities.some((e) => e.type === 'central'); }
  payMilestone(id) {
    if (game.mp?.guestRpc?.('milestone', { id })) return null;
    const m = MILESTONES.find((x) => x.id === id);
    if (!m) return 'Marco desconhecido';
    const st = this.milestoneState(id);
    if (st === 'done') return 'Já concluído';
    if (st === 'nohub') return 'Monte a Central primeiro';
    if (st === 'locked') return m.fase && this.phase < m.fase ? `Precisa da Fase ${m.fase} do Projeto Foguete` : `Complete o Tier ${m.tier - 1} antes`;
    if (!this.pay(m.custo)) return 'Faltam itens no inventário';
    this.applyMilestone(m);
    return null;
  }
  applyMilestone(m) {
    if (this.milestones.includes(m.id)) return;
    this.milestones.push(m.id);
    if (m.slots) this.slots += m.slots;
    if (m.coletor) this.collectorSpeed = Math.max(this.collectorSpeed, m.coletor);
    if (m.cpu) this.upgrades.cpu = Math.max(this.upgrades.cpu, m.cpu);
    // novas construções vão pra barra (até encher)
    for (const t of m.libera || []) if (MACHINES[t] && !this.hotbar.includes(t) && this.hotbar.length < 7) this.hotbar.push(t);
    game.emit('milestone', m);
    if (this.tierDone(m.tier)) game.emit('tierdone', m.tier);
  }
  techBlocked(id) {
    const t = TECHS[id];
    if (!t) return 'Pesquisa desconhecida';
    if (this.techs.includes(id)) return 'Já pesquisado';
    if ((t.fase || 0) > this.phase) return `Precisa da Fase ${t.fase} do Projeto Foguete`;
    const miss = (t.requer || []).filter((r) => !this.techs.includes(r));
    if (miss.length) return 'Precisa antes: ' + miss.map((r) => TECHS[r].nome).join(', ');
    return null;
  }
  unlockTech(id) {
    if (this.techs.includes(id)) return;
    this.techs.push(id);
    if (id === 'mochila') this.slots += 12;
    if (id === 'mochila2') this.slots += 18;
    if (id === 'coletor') this.collectorSpeed = Math.max(this.collectorSpeed, 2);
    if (id === 'coletor3') this.collectorSpeed = Math.max(this.collectorSpeed, 4);
    game.emit('tech', id);
  }
  // limite do .turbo() por código
  get turboMax() { return this.techs.includes('turbo2') ? 2.5 : this.techs.includes('turbo') ? 2 : 1.5; }

  // ─── ritmo ───
  get cpuHz() { return UPGRADES.cpu.valores[this.upgrades.cpu] || 2; }
  get beltSpeed() { return UPGRADES.esteira.valores[0]; }
  get machineSpeed() { return 1; }
  get cpuMul() { return 1; }
  get logMul() { return 1; }
  get farmMul() { return 1; }
  get marketMul() { return 1; }
  typeSpeed() { return 1; }
  infLvl() { return 0; }
  satLvl() { return 0; }
  get friendLevel() { let l = 0; FRIEND_LEVELS.forEach((p, i) => { if (this.oopi.friend >= p) l = i; }); return l + 1; }
  discovered(k) { return (this.stats.produced[k] || 0) > 0 || !!(this.stats.gotItems && this.stats.gotItems[k]); }
  produced(item, n = 1) { this.stats.produced[item] = (this.stats.produced[item] || 0) + n; }

  // sistemas antigos (escondidos): não fazem nada
  price() { return 0; }
  trend() { return 0; }
  sell() { return 0; }
  addMoney() { }
  spend() { return false; }
  addXp() { }
  addTokens() { }
  spendTokens() { return false; }
  hasRegion() { return true; }
  onFair() { return false; }
  comboSale() { return { n: 0, bonus: 0, pct: 0 }; }
  moneyPerMinute() { return 0; }
  infBonus() { return 0; }

  // ─── conquistas ───
  achieve(id) {
    if (this.achievements.includes(id)) return;
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    if (!a || a.oculto) return;
    this.achievements.push(id);
    game.emit('achievement', a);
  }
  checkAchievements() {
    const s = this.stats, p = s.produced;
    const has = (id, ok) => { if (ok) this.achieve(id); };
    has('central', this.hubPlaced());
    has('marco', this.milestones.length > 0);
    has('tier1', this.tierDone(0));
    has('tier3', this.tierDone(2));
    has('tier5', this.tierDone(5));
    has('primeiro_minerio', (s.handMined || 0) > 0 || Object.keys(p).some((k) => k.startsWith('minerio')));
    has('mao_100', (s.handMined || 0) >= 100);
    has('coleta_100', (s.collected || 0) >= 100);
    has('primeiro_programa', s.ranCode);
    has('lingote', (p.lingote_ferro || 0) + (p.lingote_cobre || 0) > 0);
    has('engrenagem', (p.placa_reforcada || 0) > 0);
    has('chip', (p.chip || 0) > 0);
    has('robozinho', (p.robozinho || 0) > 0);
    has('cinco_pcs', game.entities.filter((e) => e.type === 'computador' && e.running).length >= 5);
    has('erros_10', (s.errors || 0) >= 10);
    has('pesquisa', this.techs.length > 0);
    has('todas_pesquisas', this.techs.length >= Object.keys(TECHS).length);
    has('fase1', this.phase >= 1);
    has('foguete', this.launched);
    has('drone', (s.droneFlights || 0) > 0);
    has('rede', (s.netMsgs || 0) > 0);
    has('biblioteca', (s.libsImported || 0) > 0);
    has('depurador', (s.breakpoints || 0) > 0);
    has('musico', (s.notes || 0) >= 8);
    has('esteiras_100', game.entities.filter((e) => e.type.startsWith('esteira') && e.items).length >= 100);
    has('mk5', game.entities.some((e) => e.type === 'esteira_mk5'));
    has('noite', !!s.nightSeen);
    has('chuva', !!s.rainSeen);
    has('foto', (s.photos || 0) > 0);
    has('pet', (s.pets || 0) > 0);
    has('mk3', game.entities.some((e) => e.tier >= 2));
    has('copiar', (s.pasted || 0) > 0);
    has('arquiteto', (s.built || 0) >= 30);
    has('fundacoes', (s.foundations || 0) >= 50);
    has('meteoro', (s.fragments || 0) > 0);
    has('aurora', !!s.auroraSeen);
    has('jupiter', !!s.jupiterSeen);
    has('eclipse', !!s.eclipseSeen);
    has('turbo', (s.turbos || 0) > 0);
    has('explorador', Object.keys(s.biomes || {}).length >= 5);
    has('recorde', (s.records || 0) > 0);
    has('oopi_tarefa', (s.oopiTasks || 0) > 0);
    has('disco', (s.disksFound || 0) > 0);
    has('receita_alt', this.altRecipes.length > 0);
    has('quantico', (p.computador_quantico || 0) > 0);
    has('projeto', (s.blueprints || 0) > 0);
    has('braco', (s.armMoves || 0) >= 50);
    has('oopi_prog', (s.oopiCmds || 0) > 0);
  }
  checkRecords() {
    if (game.time < 90) return;
    const s = this.series.slice(-6);
    const v = s.length >= 3 ? Math.round((s.reduce((a, b) => a + b.items, 0) / (s.length * 10)) * 60) : 0;
    if (v >= 30 && v > (this.records.itemsMin || 0) * 1.1 + 1) {
      this.records.itemsMin = v;
      this.stats.records = (this.stats.records || 0) + 1;
      game.emit('record', { k: 'itemsMin', v, texto: `${v} itens por minuto` });
    }
  }

  // ─── gráficos ───
  sample() {
    const producedTotal = Object.values(this.stats.produced).reduce((a, b) => a + b, 0);
    let sup = 0, dem = 0;
    for (const n of game.powerNets || []) { sup += n.supply; dem += n.demand; }
    this.series.push({ t: Math.round(game.time), items: producedTotal - this.lastProducedTotal, supply: Math.round(sup), demand: Math.round(dem), money: 0, cash: 0 });
    if (this.series.length > 360) this.series.shift();
    this.lastProducedTotal = producedTotal;
  }
  update(dt) {
    this.sampleT -= dt;
    if (this.sampleT <= 0) { this.sampleT = 10; this.sample(); }
  }

  // ─── objetivos guiados ───
  checkObjective() {
    const o = OBJECTIVES[this.objective];
    if (!o) return;
    const s = this.stats, p = s.produced;
    const has = (t) => game.entities.some((e) => e.type === t);
    let ok = false;
    switch (o.id) {
      case 'hub': ok = this.hubPlaced(); break;
      case 'm0_1': case 'm0_2': case 'm0_3': case 'm0_4': ok = this.milestones.includes(o.id); break;
      case 'hand': ok = (s.handMined || 0) >= 10; break;
      case 'power': ok = game.entities.some((e) => e.type === 'fornalha' && e.net && e.net.supply > 0); break;
      case 'smelt': ok = (p.lingote_ferro || 0) >= 10; break;
      case 'craft': ok = (s.handCrafted || 0) >= 5; break;
      case 'miner': ok = game.entities.some((e) => e.type === 'minerador' && e.auto && e.net && e.net.supply > 0); break;
      case 'tier0': ok = this.tierDone(0); break;
      case 'tier1': ok = this.tierDone(1); break;
      case 'tier2': ok = this.tierDone(2) && has('plataforma'); break;
      case 'fase1': ok = this.phase >= 1; break;
      case 'explore': ok = !!(s.gotItems?.cristal_kx || p.cristal_kx) && !!(s.gotItems?.luminita || p.luminita); break;
      case 'fase3': ok = this.phase >= 3; break;
      case 'launch': ok = this.launched; break;
    }
    if (ok) { this.objective++; game.emit('objective', o); }
  }

  // ─── salvar ───
  serialize() {
    return {
      v: 3, items: this.items, slots: this.slots, milestones: this.milestones, techs: this.techs, phase: this.phase, phaseProgress: this.phaseProgress,
      launched: this.launched, upgrades: this.upgrades, hotbar: this.hotbar, collectorSpeed: this.collectorSpeed, stats: this.stats,
      objective: this.objective, achievements: this.achievements, libs: this.libs, netStore: this.netStore, series: this.series.slice(-120),
      tutorialStep: this.tutorialStep, records: this.records, altRecipes: this.altRecipes, disks: this.disks, diskChoice: this.diskChoice,
      crates: this.crates, oopi: this.oopi, challenges: this.challenges,
    };
  }
  load(d) {
    if (!d || d.v !== 3) return;
    this.items = Object.fromEntries(Object.entries(d.items || {}).filter(([k, n]) => ITEMS[k] && n > 0));
    this.slots = d.slots || START_SLOTS;
    this.milestones = (d.milestones || []).filter((id) => MILESTONES.some((m) => m.id === id));
    this.techs = (d.techs || []).filter((t) => TECHS[t]);
    this.phase = d.phase || 0;
    this.phaseProgress = d.phaseProgress || {};
    this.launched = !!d.launched;
    this.upgrades = { ...this.upgrades, ...(d.upgrades || {}) };
    this.hotbar = (d.hotbar || []).filter((t) => MACHINES[t]);
    this.collectorSpeed = d.collectorSpeed || 1;
    this.stats = { ...this.stats, ...(d.stats || {}) };
    this.objective = d.objective || 0;
    this.achievements = d.achievements || [];
    this.libs = d.libs || { util: DEFAULT_LIB };
    this.netStore = d.netStore || {};
    this.series = d.series || [];
    this.tutorialStep = d.tutorialStep ?? -1;
    this.records = { ...this.records, ...(d.records || {}) };
    this.altRecipes = (d.altRecipes || []).filter((k) => RECIPES[k]?.alt || SMELT[k]?.alt || CONSTRUCT[k]?.alt);
    this.disks = d.disks || 0;
    this.diskChoice = d.diskChoice || null;
    this.crates = d.crates || [];
    this.oopi = { ...this.oopi, ...(d.oopi || {}) };
    this.challenges = d.challenges || {};
    this.lastProducedTotal = Object.values(this.stats.produced || {}).reduce((a, b) => a + b, 0);
  }
}
