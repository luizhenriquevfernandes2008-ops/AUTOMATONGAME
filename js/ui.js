// Interface: HUD, barra de itens, loja, painel de máquina, janelas, confirmações e avisos.
import { game } from './state.js';
import { MACHINES, DECOR, UPGRADES, ITEMS, OBJECTIVES, unlocksAt, RECIPES, SMELT, TECHS, PHASES, TIERS, TIERABLE, REGIONS, PIECES, MATERIALS, PAINTS, PAINT_PRICE, PAINTINGS, MATERIAL_SHOP, CROPS, recipeOut, OOPI_HATS, OOPI_COLORS, SATELLITES, missionNeeds, isBeltTier } from './data.js';
import { renderContracts, contractState } from './contracts.js';
import { renderChallenges } from './challengeUI.js';
import { renderBlueprints } from './blueprints.js';
import { renderMail } from './mail.js';
import { renderFriends } from './friends.js';
import { renderMultiplayer } from './mp.js';
import { confetti } from './fx.js';
import { thumbs } from './thumbs.js';
import { audio } from './audio.js';
import { Editor } from './editor.js';
import { itemName, refreshBeltsAround } from './machines.js';
import { defOf, PIECE_ORDER, MAT_ORDER } from './build.js';
import { pieceCost, costText, paintName } from './structures.js';
import { keyOf, kbd } from './input.js';
import { powerText, usesPower, totals } from './power.js';
import { guideHTML } from './guide.js';
import { renderResearch, renderPlatform, renderStats, renderPet } from './panels.js';
import { renderMap, updateExplore } from './map3.js';
import { clockText, skyInfo } from './sky.js';
import { natureBonuses } from './events.js';
import { renderHub, renderBuild, renderMachine, milestoneFx } from './ui3.js';
import { craft, craftStep } from './hub.js';
import { MILESTONES, TIER_NAMES } from './data.js';

const $ = (s) => document.querySelector(s);
const fmt = (n) => n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
// máquinas sem painel de detalhes
export const NO_PANEL = new Set(['esteira', 'poste', 'divisor', 'juntador', 'esteira_alta', 'rampa_sobe', 'rampa_desce']);
const XWIN = { hub: '🏠 Central', build: '🧰 Construir', machine: '⚙️ Máquina', research: '🔬 Laboratório · Pesquisas', platform: '🚀 Projeto Foguete', stats: '📊 Estatísticas', map: '🗺️ Mapa', pet: '🤖 Oopi', contracts: '📋 Quadro de Contratos', challenges: '🧩 Terminal de Desafios', projects: '📐 Projetos', mail: '📬 Correio da Manhã', friends: '🤝 Amigos', multiplayer: '🌐 Jogar junto', settings: '⚙️ Configurações' };
// janelas que não se redesenham sozinhas (têm campos de texto)
const NO_AUTO = new Set(['settings', 'pet', 'challenges', 'projects', 'mail', 'friends', 'multiplayer']);
const CONTRACT_SLOTS = [{ vagas: 3, fichas: 8 }, { vagas: 4, fichas: 15 }];

let settingsHome = null;
function restoreSettingsPanel() {
  if (!settingsHome) return;
  const el = document.querySelector('.mpanel[data-panel="settings"]');
  if (el) { settingsHome.parent.insertBefore(el, settingsHome.next); el.classList.toggle('show', settingsHome.show); }
  settingsHome = null;
}

export class UI {
  constructor() {
    this.overlay = null;
    this.editor = new Editor();
    this.shopTab = 'maquinas';
    this.panelEntity = null;
    this.xT = 0;
    game.on('money', () => this.updateStats());
    game.on('xp', () => this.updateStats());
    game.on('inventory', () => this.renderHotbar());
    game.on('hotbar', () => this.renderHotbar());
    game.on('levelup', (l) => this.levelUp(l));
    game.on('power', () => this.updateStats());
    game.on('phase', () => this.renderObjective());
    game.on('objective', () => {
      audio.play('quest', { volume: 0.6 });
      this.toast('✔ Objetivo concluído!', 'good');
      this.renderObjective();
    });
    game.on('items', () => { this.itemsDirty = true; });
    game.on('milestone', (m) => {
      milestoneFx(m);
      this.renderObjective(); this.updateStats(); this.renderHotbar();
      if (this.overlay === 'hub' || this.overlay === 'build') this.renderX();
    });
    game.on('tierdone', (t) => {
      game.music?.sting('tier');
      const nx = t + 1;
      if (nx <= 5) setTimeout(() => this.banner(`🏆 Tier ${t} completo!`, nx <= 5 ? `Tier ${nx} · ${TIER_NAMES[nx]}${game.economy.tierOpen(nx) ? ' liberado na Central' : ' precisa de uma fase do Projeto Foguete'}` : '', []), 2500);
    });
    game.on('achievement', (a) => {
      audio.play('achievement', { volume: 0.7 });
      this.toast(`<span class="ach-toast"><span>${a.icone}</span><span><small>conquista desbloqueada</small><b>${a.nome}</b></span></span>`, 'ach');
    });
    game.on('tech', (id) => {
      const t = TECHS[id];
      const machines = Object.values(MACHINES).filter((m) => m.tech === id).map((m) => m.nome);
      const recs = Object.entries(RECIPES).filter(([, r]) => r.tech === id && !r.alt).map(([k, r]) => ITEMS[recipeOut(k, r)].nome);
      this.banner(`${t.icone} ${t.nome}`, 'Pesquisa concluída!', [...machines.map((m) => 'Máquina: ' + m), ...recs.map((r) => 'Receita: ' + r), t.desc]);
      this.renderObjective();
    });
    game.on('phaseDone', (n) => {
      const p = PHASES[n - 1];
      this.banner(`🚀 Fase ${n}: ${p.nome}`, 'Concluída!', [p.libera ? `Liberado: ${p.libera} (na Central)` : '', PHASES[n] ? `Próxima: ${PHASES[n].nome}` : '']);
      game.music?.sting?.('fase');
      this.renderObjective(); this.updateStats();
    });
    game.on('launched', () => {
      game.music?.sting('foguete');
      this.banner('🚀 FOGUETE LANÇADO!', 'Você conquistou KX-7 🎉', ['O foguete subiu e o planeta inteiro viu', 'Continue construindo: o mundo é todo seu', 'Obrigado por jogar AUTOMATON! 💜']);
      game.music?.sting?.('fase');
      this.renderObjective();
    });
    game.on('missionDone', ({ sat, prize, n }) => {
      const S = SATELLITES[sat];
      this.banner(`${S.icone} Missão ${n + 1} concluída!`, `${S.nome} em órbita (${game.economy.satLvl(sat)}/5)`, [S.desc, `+$ ${fmt(prize.dinheiro)} · +${prize.estrelas} ⭐`]);
      this.renderObjective();
      this.updateStats();
    });
    game.on('tokens', () => this.updateStats());
    game.on('combo', (n) => this.showCombo(n));
    game.on('contracts', () => { if (this.overlay === 'contracts') this.renderX(); this.renderObjective(); });
    game.on('contractProgress', () => { this.objDirty = true; });
    game.on('achievement', () => { if (Math.random() < 0.5) confetti(40); });
    game.on('research', () => { if (this.overlay === 'research') this.renderX(); });
    game.on('materials', () => { if (game.builder?.selected === 'construir') this.renderHotbar(); if (this.overlay === 'shop') this.renderShop(); });
    game.on('mp', () => { if (this.overlay === 'multiplayer') this.renderX(); this.updateStats(); });
    game.on('mpChat', () => { if (this.overlay === 'multiplayer') this.renderX(); });
    game.on('record', (r) => this.toast(`🏆 <b>Recorde da fábrica!</b> ${r.texto}`, 'ach'));
    audio.onTrackChange = (t) => { $('#track').textContent = t.nome; };

    $('#shop-close').onclick = () => this.closeOverlay();
    document.querySelectorAll('#shop .shop-tab').forEach((b) => { b.onclick = () => { this.shopTab = b.dataset.tab; audio.play('click', { volume: 0.4 }); this.renderShop(); }; });
    $('#panel-close').onclick = () => this.closeOverlay();
    $('#guide-close').onclick = () => this.closeOverlay();
    $('#xwin-close').onclick = () => this.closeOverlay();
    $('#music-next').onclick = () => audio.nextTrack();
    $('#music-toggle').onclick = () => { const on = audio.toggleMusic(); $('#music-toggle').textContent = on ? '⏸' : '▶'; };
    $('#confirm-yes').onclick = () => this.confirmDone(true);
    $('#confirm-no').onclick = () => this.confirmDone(false);
    addEventListener('keydown', (e) => {
      if (this.confirmCb && e.key === 'Escape') { e.preventDefault(); this.confirmDone(false); return; }
      if (this.confirmCb && e.key === 'Enter') { e.preventDefault(); this.confirmDone(true); return; }
      if (performance.now() - this.openTime < 200 || e.repeat) return; // a mesma tecla que abriu não fecha
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) return;
      const o = this.overlay;
      if (e.key === 'Escape' && ['shop', 'panel', 'guide', 'research', 'platform', 'stats', 'map', 'pet', 'contracts', 'challenges', 'projects', 'mail', 'friends', 'multiplayer', 'hub', 'build', 'machine', 'settings'].includes(o)) { e.preventDefault(); this.closeOverlay(); }
      if (e.code === keyOf('loja') && o === 'build') this.closeOverlay();
      if (e.code === keyOf('multiplayer') && o === 'multiplayer') this.closeOverlay();
      if (e.code === keyOf('amigos') && o === 'friends') this.closeOverlay();
      if (e.code === keyOf('projetos') && o === 'projects') this.closeOverlay();
      if (e.code === keyOf('contratos') && o === 'contracts') this.closeOverlay();
      if (e.code === keyOf('loja') && o === 'shop') this.closeOverlay();
      if (e.code === keyOf('guia') && o === 'guide') this.closeOverlay();
      if (e.code === keyOf('stats') && o === 'stats') this.closeOverlay();
      if (e.code === keyOf('mapa') && o === 'map') { e.preventDefault(); this.closeOverlay(); }
      if (o === 'map' && e.code === 'KeyC') game.mapKey?.(e.code);
      if (e.code === keyOf('usar') && ['shop', 'panel', 'research', 'platform', 'pet', 'contracts', 'hub', 'machine'].includes(o)) this.closeOverlay();
      if (e.code === keyOf('peca') && o === 'pet') this.closeOverlay();
    });
  }

  // ─── HUD ───
  updateStats() {
    const eco = game.economy;
    const tier = eco.tier;
    const ms = MILESTONES.filter((m) => m.tier === tier);
    const done = ms.filter((m) => eco.milestones.includes(m.id)).length;
    $('#money').textContent = TIER_NAMES[tier];
    $('#level').textContent = tier;
    $('#xpbar').style.width = (ms.length ? (done / ms.length) * 100 : 100) + '%';
    $('#xptext').textContent = `${done}/${ms.length} marcos`;
    const t = totals();
    $('#cpu').innerHTML = `<span class="${t.demand > t.supply ? 'bad' : ''}">⚡ ${fmt(t.demand)}/${fmt(t.supply)}</span> · 🖥️ ${eco.cpuHz} instr/s`;
    const used = eco.slotsUsed();
    $('#tokens').innerHTML = `<span class="${used >= eco.slots ? 'bad' : ''}">🎒 ${used}/${eco.slots}</span>${eco.disks ? ` · 💾 ${eco.disks}` : ''}${eco.phase ? ` · 🚀 fase ${eco.phase}` : ''}`;
  }

  showCombo(n) {
    const el = $('#combo');
    if (n < 2) { el.classList.add('hidden'); return; }
    el.innerHTML = `🔥 Combo ×${n} <small>+${Math.min(n - 1, 10) * 2}%</small>`;
    el.classList.remove('hidden', 'pop'); void el.offsetWidth; el.classList.add('pop');
    el.style.setProperty('--hot', Math.min(1, n / 10));
    if (n === 5 || n === 10) confetti(n * 4);
  }
  renderObjective() {
    const eco = game.economy;
    const o = OBJECTIVES[eco.objective];
    let html = o ? `<div class="obj-title">🎯 Objetivo ${eco.objective + 1}/${OBJECTIVES.length}</div><div>${o.texto}</div>` : '';
    // próximo marco disponível (o caminho principal)
    const next = MILESTONES.find((m) => eco.milestoneState(m.id) === 'open');
    if (next && eco.hubPlaced()) {
      const rows = Object.entries(next.custo).map(([k, n]) => { const h = Math.min(n, eco.count(k)); return `<div class="obj-need"><img src="${thumbs['item:' + k] || ''}"><span>${ITEMS[k].nome}</span><i><b style="width:${(h / n) * 100}%"></b></i><em>${h}/${n}</em></div>`; }).join('');
      html += `<div class="obj-rocket"><div class="obj-title">${next.icone} Próximo marco · ${next.nome} <small class="muted">(Tier ${next.tier})</small></div>${rows}</div>`;
    }
    // Projeto Foguete (com a plataforma construída)
    const p = PHASES[eco.phase];
    if (!eco.launched && p && game.platform) {
      const rows = Object.entries(p.itens).map(([k, n]) => {
        const h = Math.min(n, eco.phaseProgress[k] || 0);
        return `<div class="obj-need"><img src="${thumbs['item:' + k] || ''}"><span>${ITEMS[k].nome}</span><i><b style="width:${(h / n) * 100}%"></b></i><em>${h}/${n}</em></div>`;
      }).join('');
      html += `<div class="obj-rocket"><div class="obj-title">🚀 Projeto Foguete · fase ${eco.phase + 1}/${PHASES.length}</div><div class="muted" style="font-size:12.5px">${p.nome}: leve os itens por esteira até a plataforma${p.libera ? ` · libera ${p.libera}` : ''}</div>${rows}</div>`;
    }
    if (!html) html = '<div class="obj-title">🌟 Todos os objetivos completos!</div><div>KX-7 é todo seu. Continue construindo com calma.</div>';
    $('#objective').innerHTML = html;
  }

  renderHotbar() {
    const b = game.builder;
    const hb = b.hotbar();
    const eco = game.economy;
    const afford = (t) => { const c = eco.buildCost(t); const e = Object.entries(c); return e.length ? Math.min(...e.map(([k, n]) => Math.floor(eco.count(k) / n))) : '∞'; };
    $('#hotbar').innerHTML = hb.map((t, i) => {
      const def = defOf(t);
      const tool = t === 'cabo' || t === 'construir';
      const n = tool ? 0 : afford(t);
      const cnt = tool ? (t === 'cabo' ? '∞' : PIECES[b.piece]?.icone || '🖌️') : `<span class="${n ? '' : 'bad'}">×${n}</span>`;
      return `<div class="slot ${b.selected === t ? 'sel' : ''} ${tool ? 'tool' : ''}" data-t="${t}"><span class="key">${i < 9 ? i + 1 : ''}</span><img src="${thumbs[t] || ''}"><span class="cnt">${cnt}</span><span class="nm">${def.nome}</span></div>`;
    }).join('');
    const sel = b.selected ? defOf(b.selected) : null;
    let text = '';
    if (b.copyMode) text = '<b>📋 Copiar</b>: clique no 1º canto e depois no 2º · <kbd>Botão direito</kbd> cancela';
    else if (b.pasteMode) text = `<b>📋 Colar</b>: <kbd>Clique</kbd> cola · ${kbd('girar')} gira o grupo · <kbd>Botão direito</kbd> cancela · o custo sai do inventário`;
    else if (b.selected === 'construir') text = this.buildPalette();
    else if (PAINTINGS[b.selected]) text = `<b>🖼️ ${sel.nome}</b> · ${sel.autor}<br><kbd>Clique</kbd> numa parede pra pendurar (do lado em que você está) · ${kbd('guardar')} tira o quadro`;
    else if (b.beltA && b.path) {
      const P = b.path;
      const cost = Object.entries(P.cost).map(([k, n]) => `<span class="${eco.count(k) >= n ? '' : 'bad'}">${n}× ${ITEMS[k].nome}</span>`).join(' · ');
      text = `<b>🛤️ ${sel.nome}: caminho de ${P.cells.length} célula(s)</b>${P.n ? ` · ${P.n} nova(s) · custa ${cost}` : ''}${P.reason ? `<br><span class="bad">${P.reason}</span>` : ''}<br><kbd>Clique</kbd> constrói tudo · ${kbd('girar')} troca o lado da curva · <kbd>Botão direito</kbd> ou ${kbd('soltar')} cancela`;
    } else if (sel) {
      const keys = b.selected === 'cabo'
        ? `<kbd>Clique</kbd> prender/ligar · <kbd>Botão direito</kbd> soltar o cabo · ${kbd('guardar')} tirar cabos da peça`
        : isBeltTier(b.selected) ? `<kbd>Clique</kbd> marca o começo do caminho (mire numa saída pra encaixar) · <kbd>Clique</kbd> de novo no fim constrói tudo · ${kbd('soltar')} guardar na mão`
        : `<kbd>Clique</kbd> colocar · ${kbd('girar')} girar (a seta amarela mostra pra onde os itens vão) · ${kbd('soltar')} guardar na mão`;
      const cost = MACHINES[b.selected] ? Object.entries(eco.buildCost(b.selected)).map(([k, n]) => `<span class="${eco.count(k) >= n ? '' : 'bad'}">${n}× ${ITEMS[k].nome}</span>`).join(' · ') : '';
      text = `<b>${sel.nome}</b>: ${sel.desc || sel.bonus || 'Decoração'}${cost ? `<br><span class="muted">Custa:</span> ${cost}` : ''}<br>${keys}`;
    }
    $('#buildhint').innerHTML = text;
    $('#buildhint').style.display = text ? 'block' : 'none';
  }

  // barra da construção: peças, materiais (com estoque) e custo
  buildPalette() {
    const b = game.builder;
    const st = game.economy.items;
    const pieces = PIECE_ORDER.map((k) => `<span class="bp ${b.piece === k ? 'on' : ''}">${k === 'pintar' ? '🖌️ Pintar' : `${PIECES[k].icone} ${PIECES[k].nome}`}</span>`).join('');
    let second, info;
    if (b.piece === 'pintar') {
      second = PAINTS.map((p, i) => `<span class="bp sw ${b.paintIdx === i ? 'on' : ''}" title="${p.nome}"><i style="background:${p.cor == null ? 'transparent' : '#' + p.cor.toString(16).padStart(6, '0')}"></i>${b.paintIdx === i ? p.nome : ''}</span>`).join('');
      info = `<kbd>Clique</kbd> numa parede/piso/teto pinta (${PAINTS[b.paintIdx].cor == null ? 'tira a tinta, grátis' : `$ ${PAINT_PRICE}`})`;
    } else {
      const fixo = PIECES[b.piece].fixo;
      second = MAT_ORDER.map((m) => `<span class="bp ${(fixo || b.mat) === m ? 'on' : ''} ${fixo && fixo !== m ? 'off' : ''}">${MATERIALS[m].nome} <b>${st[MATERIALS[m].item] || 0}</b></span>`).join('');
      info = `Custa ${costText(pieceCost(b.piece, b.mat))} · <kbd>Clique</kbd> constrói · ${kbd('guardar')} desmonta (devolve o material)${b.piece === 'fundacao' ? ` · ${kbd('girar')} sobe 0,5 m (${b.foundOffset ? '+' + b.foundOffset : 'nível do chão'})` : ''}`;
    }
    return `<div class="bp-row"><em>${kbd('peca')}</em>${pieces}</div><div class="bp-row"><em>${kbd('material')}</em>${second}</div><div class="bp-info">${info}${b.structTarget?.reason && b.piece !== 'pintar' ? ` · <span class="bad">${b.structTarget.reason}</span>` : ''}</div>`;
  }

  updatePrompt() {
    const b = game.builder;
    const p = $('#prompt');
    let html = '';
    if (game.mode === 'play' && b.hover && !b.copyMode && !b.pasteMode) {
      if (b.hover.pet) html = `<b>Oopi</b> 💜 ${game.pet.moodText}<br>${kbd('usar')} carinho · ${kbd('peca')} tarefas`;
      else if (b.hover.pickup) html = `<b>☄️ Fragmento estelar</b><br>${kbd('usar')} pegar`;
      else if (b.hover.struct) {
        const s = b.hover.struct;
        if (s.kind === 'quadro') html = `<b>🖼️ ${PAINTINGS[s.painting].nome}</b><br>${PAINTINGS[s.painting].autor} · ${kbd('guardar')} tirar da parede`;
        else html = `<b>${PIECES[s.piece].nome}</b> de ${MATERIALS[s.mat].nome.toLowerCase()}${s.paint != null ? ` · ${paintName(s.paint)}` : ''}<br>${kbd('guardar')} desmontar${b.selected === 'construir' && b.piece === 'pintar' ? ' · <kbd>Clique</kbd> pintar' : ''}`;
      }
      else if (b.hover.entity) {
        const e = b.hover.entity;
        const def = defOf(e.type);
        const nm = e.name ? `<b>${e.name}</b> · ${def.nome}${e.tier ? ' ' + TIERS[e.tier].nome : ''}` : `<b>${def.nome}</b>`;
        const E = kbd('usar');
        const act = e.type === 'computador' ? `${E} programar` : e.type === 'laboratorio' ? `${E} pesquisas` : e.type === 'canteiro' ? `${E} plantar / regar / colher` : e.isMachine && !NO_PANEL.has(e.type) ? `${E} detalhes` : '';
        html = b.selected === 'cabo' ? `${nm}<br><kbd>Clique</kbd> ligar cabo` : `${nm}<br>${act} ${act ? '·' : ''} ${kbd('guardar')} guardar`;
        if (e.isMachine && !NO_PANEL.has(e.type) && e.status) html += `<div class="pstatus">${e.type === 'computador' ? e.statusText : e.status}</div>`;
        const pt = powerText(e);
        if (pt) html += `<div class="ppower ${e.noPower && usesPower(e) ? 'bad' : ''}">${pt}</div>`;
      } else if (b.hover.interact) html = `${kbd('usar')} ${b.hover.interact.label}`;
    }
    if (!html && game.mode === 'play' && game.collector?.target) html = game.collector.promptHtml(kbd);
    const cr = $('#crosshair');
    const prog = game.collector?.held && game.collector.target ? Math.min(1, game.collector.progress) : 0;
    cr.classList.toggle('collect', prog > 0);
    if (prog > 0) cr.style.setProperty('--p', (prog * 100).toFixed(0) + '%');
    if (p.innerHTML !== html) p.innerHTML = html;
    p.style.display = html ? 'block' : 'none';
  }

  toast(text, kind = '') {
    const d = document.createElement('div');
    d.className = 'toast ' + kind;
    d.innerHTML = text;
    $('#toasts').appendChild(d);
    const life = kind === 'ach' ? 5500 : 3800;
    setTimeout(() => d.classList.add('out'), life);
    setTimeout(() => d.remove(), life + 600);
    while ($('#toasts').children.length > 5) $('#toasts').firstChild.remove();
  }

  banner(title, sub, lines) {
    const el = $('#levelup');
    el.innerHTML = `<div class="lv-title">${title}</div><div class="lv-sub">${sub}</div>${lines.filter(Boolean).length ? '<ul>' + lines.filter(Boolean).map((u) => `<li>${u}</li>`).join('') + '</ul>' : ''}`;
    el.classList.remove('hidden', 'show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(this.lvT);
    this.lvT = setTimeout(() => el.classList.add('hidden'), 7000);
  }

  levelUp(l) {
    audio.play('levelup', { volume: 0.8 });
    confetti(60);
    const un = unlocksAt(l);
    if (l === 2) un.push('📋 Quadro de Contratos (escritório) e Doca de Entrega');
    this.banner(`✨ Nível ${l}! ✨`, un.length ? 'Liberado:' : 'Continue assim!', un);
    this.updateStats();
  }

  // ─── confirmação ───
  confirm(title, html, onYes, opts = {}) {
    this.confirmCb = onYes;
    this.confirmNo = opts.onNo || null;
    $('#confirm-title').textContent = title;
    $('#confirm-body').innerHTML = html;
    $('#confirm-yes').textContent = opts.yes || 'Sim';
    $('#confirm-no').textContent = opts.no || 'Não';
    $('#confirm-no').style.display = opts.noButton === false ? 'none' : '';
    $('#confirm').classList.remove('hidden');
    this.confirmPrev = game.mode;
    if (game.mode === 'play') game.setMode('ui');
    audio.play('question', { volume: 0.5 });
  }
  confirmDone(yes) {
    const cb = this.confirmCb, no = this.confirmNo;
    this.confirmCb = null;
    $('#confirm').classList.add('hidden');
    if (this.confirmPrev === 'play' && !this.overlay) game.setMode('play');
    if (yes && cb) cb();
    if (!yes && no) no();
  }

  // ─── janelas ───
  openOverlay(name, arg) {
    if (['friends', 'mail', 'challenges'].includes(name) && game.mp?.blocked({ friends: 'Amigos', mail: 'Correio', challenges: 'Desafios' }[name])) return;
    if (this.overlay) this.closeOverlay(true);
    this.overlay = name;
    this.openTime = performance.now();
    this.prevMode = game.mode === 'ui' ? 'play' : game.mode;
    if (game.mode !== 'menu') game.setMode('ui'); // no menu, a janela abre por cima dele
    audio.play('open', { volume: 0.5 });
    if (name === 'editor') { $('#editor').classList.remove('hidden'); this.editor.open(arg); }
    if (name === 'shop') { $('#shop').classList.remove('hidden'); if (arg) this.shopTab = arg; this.renderShop(); }
    if (name === 'panel') { this.panelEntity = arg; this.panelActsHtml = ''; $('#panel').classList.remove('hidden'); this.renderPanel(true); }
    if (name === 'guide') {
      $('#guide').classList.remove('hidden');
      $('#guide-body').innerHTML = guideHTML();
      if (arg) setTimeout(() => { const h = [...document.querySelectorAll('#guide-body h3')].find((x) => x.textContent.includes(arg)); h?.scrollIntoView(); }, 30);
    }
    if (XWIN[name]) {
      this.xArg = arg;
      $('#xwin').classList.remove('hidden');
      $('#xwin').dataset.kind = name;
      $('#xwin-title').textContent = name === 'platform' && game.economy.launched ? '🛰️ Programa Espacial' : XWIN[name];
      $('#xwin-hint').textContent = name === 'map' ? 'Tab ou Esc fecha' : name === 'stats' ? 'K ou Esc fecha' : name === 'pet' ? 'E ou Esc fecha' : name === 'projects' ? 'J ou Esc fecha' : name === 'contracts' ? 'L ou Esc fecha' : name === 'friends' ? 'N ou Esc fecha' : name === 'multiplayer' ? 'O ou Esc fecha' : 'Esc fecha';
      restoreSettingsPanel();
      $('#xwin-body').innerHTML = '';
      this.renderX(arg);
    }
  }
  renderX(arg) {
    const body = $('#xwin-body');
    if (this.overlay === 'hub') renderHub(body, arg);
    if (this.overlay === 'build') renderBuild(body);
    if (this.overlay === 'machine') { renderMachine(body, this.xArg); $('#xwin-title').textContent = `⚙️ ${this.xArg?.name || 'Máquina'}`; }
    if (this.overlay === 'research') renderResearch(body, this.xArg);
    if (this.overlay === 'platform') renderPlatform(body);
    if (this.overlay === 'stats') renderStats(body, arg);
    if (this.overlay === 'map') renderMap(body);
    if (this.overlay === 'pet') renderPet(body);
    if (this.overlay === 'contracts') renderContracts(body);
    if (this.overlay === 'challenges') renderChallenges(body);
    if (this.overlay === 'projects') renderBlueprints(body);
    if (this.overlay === 'mail') renderMail(body);
    if (this.overlay === 'friends') renderFriends(body, arg);
    if (this.overlay === 'multiplayer') renderMultiplayer(body);
    if (this.overlay === 'settings') {
      // as configurações completas moram no menu de título: pegamos o painel emprestado
      const el = document.querySelector('.mpanel[data-panel="settings"]');
      if (el) { settingsHome = { parent: el.parentNode, next: el.nextSibling, show: el.classList.contains('show') }; el.classList.add('show'); body.appendChild(el); }
    }
  }

  closeOverlay(silent) {
    if (!this.overlay) return;
    if (this.overlay === 'editor') { this.editor.close(); $('#editor').classList.add('hidden'); }
    if (this.overlay === 'shop') $('#shop').classList.add('hidden');
    if (this.overlay === 'panel') { $('#panel').classList.add('hidden'); this.panelEntity = null; }
    if (this.overlay === 'guide') $('#guide').classList.add('hidden');
    if (XWIN[this.overlay]) { $('#xwin').classList.add('hidden'); restoreSettingsPanel(); }
    this.overlay = null;
    if (!silent) {
      audio.play('close', { volume: 0.5 });
      if (this.prevMode === 'menu') return;
      game.setMode(this.prevMode === 'pause' ? 'pause' : 'play');
    }
  }

  // ─── loja ───
  lockReason(d) {
    const eco = game.economy;
    if (d.nivel > eco.level) return `🔒 Nível ${d.nivel}`;
    if (d.tech && !eco.hasTech(d.tech)) return `🔬 Pesquise “${TECHS[d.tech].nome}”`;
    return null;
  }
  renderShop() {
    const eco = game.economy;
    $('#shop-money').textContent = '$ ' + fmt(eco.money);
    $('#shop-level').textContent = 'Nível ' + eco.level;
    document.querySelectorAll('#shop .shop-tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === this.shopTab));
    const body = $('#shop-body');
    const card = (o) => `<div class="card ${o.locked ? 'locked' : ''}">
      <img src="${o.img || ''}" class="${o.img ? '' : 'noimg'}">
      <div class="c-name">${o.name}</div>
      <div class="c-desc">${o.desc || ''}</div>
      <div class="c-foot">${o.locked ? `<span class="lock">${o.locked}</span>` : o.foot}</div></div>`;
    if (this.shopTab === 'maquinas' || this.shopTab === 'decoracao' || this.shopTab === 'escritorio') {
      const src = this.shopTab === 'maquinas' ? MACHINES : Object.fromEntries(Object.entries(DECOR).filter(([, d]) => !d.fichas && !!d.casa === (this.shopTab === 'escritorio')));
      const entries = Object.entries(src).sort((a, b) => (!!this.lockReason(a[1]) - !!this.lockReason(b[1])));
      if (this.shopTab === 'escritorio') body.innerHTML = '<p class="muted">Móveis podem ficar <b>dentro do escritório</b>. Pra paredes, pisos e tetos use a ferramenta 🧱 Construção (tecla 2). Os quadros ficam na aba Quadros.</p>';
      else body.innerHTML = '';
      body.innerHTML += `<div class="cards">${entries.map(([k, d]) => card({
        img: thumbs[k], name: d.nome, desc: (d.desc || '') + (d.bonus ? `<br><span class="bonus">✦ ${d.bonus}</span>` : ''), locked: this.lockReason(d),
        foot: `<span class="price">$ ${d.preco}</span><span class="own">tem ${eco.inventory[k] || 0}</span>
               <button class="buy" data-k="${k}" data-n="1" ${eco.money < d.preco ? 'disabled' : ''}>Comprar</button>
               ${['esteira', 'esteira_alta', 'poste'].includes(k) ? `<button class="buy" data-k="${k}" data-n="10" ${eco.money < d.preco * 10 ? 'disabled' : ''}>×10</button>` : ''}`,
      })).join('')}</div>`;
      body.querySelectorAll('.buy').forEach((b) => { b.onclick = () => this.buy(b.dataset.k, +b.dataset.n); });
    } else if (this.shopTab === 'materiais') {
      const st = eco.materials;
      body.innerHTML = `<p class="muted">Materiais de construção ficam no seu <b>estoque 🧱</b> (não ocupam a barra). Dá pra comprar aqui, mas sai bem mais barato fabricar e mandar por esteira pro <b>Depósito de Materiais</b>:
        madeira vem do <b>bambu</b> na horta, tijolo da escória, vidro da fornalha (<code>fundir("vidro")</code>), concreto da montadora e aço da metalurgia.</p>
      <div class="cards">${Object.entries(MATERIALS).map(([k, m]) => {
        const price = MATERIAL_SHOP[k];
        return card({
          img: thumbs['item:' + m.item], name: m.nome, desc: `No estoque: <b>${st[m.item] || 0}</b><br>Uma parede gasta ${PIECES.parede.custo}, um piso ${PIECES.piso.custo}.`,
          foot: `<span class="price">$ ${price}</span><button class="buy-m" data-k="${m.item}" data-n="1" ${eco.money < price ? 'disabled' : ''}>+1</button><button class="buy-m" data-k="${m.item}" data-n="10" ${eco.money < price * 10 ? 'disabled' : ''}>+10</button><button class="buy-m" data-k="${m.item}" data-n="50" ${eco.money < price * 50 ? 'disabled' : ''}>+50</button>`,
        });
      }).join('')}</div>`;
      body.querySelectorAll('.buy-m').forEach((b) => {
        b.onclick = () => {
          const it = b.dataset.k, n = +b.dataset.n;
          if (game.mp?.guestRpc('buyMat', { item: it, n })) { audio.play('buy', { volume: 0.5 }); return; }
          const mk = Object.keys(MATERIALS).find((m) => MATERIALS[m].item === it);
          if (!eco.spend(MATERIAL_SHOP[mk] * n)) { audio.play('deny'); return; }
          eco.materials[it] = (eco.materials[it] || 0) + n;
          audio.play('buy', { volume: 0.5 });
          game.emit('materials');
        };
      });
    } else if (this.shopTab === 'fichas') {
      this.renderTokenShop(body, card);
    } else if (this.shopTab === 'quadros') {
      body.innerHTML = `<p class="muted">Obras em <b>domínio público</b> (Wikimedia Commons). Compre, escolha na barra e clique numa parede pra pendurar.</p>
      <div class="cards">${Object.entries(PAINTINGS).map(([k, p]) => card({
        img: `assets/paintings/${p.img}.jpg`, name: p.nome, desc: p.autor,
        foot: `<span class="price">$ ${p.preco}</span><span class="own">tem ${eco.inventory[k] || 0}</span><button class="buy" data-k="${k}" data-n="1" ${eco.money < p.preco ? 'disabled' : ''}>Comprar</button>`,
      })).join('')}</div>`;
      body.querySelectorAll('.buy').forEach((b) => { b.onclick = () => this.buy(b.dataset.k, +b.dataset.n); });
    } else if (this.shopTab === 'melhorias') {
      body.innerHTML = `<div class="cards">${Object.entries(UPGRADES).map(([k, u]) => {
        const lvl = eco.upgrades[k];
        const maxed = lvl >= u.precos.length;
        const locked = !maxed && u.niveis[lvl] > eco.level ? `🔒 Nível ${u.niveis[lvl]}` : null;
        const pips = u.valores.map((_, i) => `<i class="${i <= lvl ? 'on' : ''}"></i>`).join('');
        return card({
          name: u.nome, desc: `${u.desc}<br><b>${u.valores[lvl]}${u.unidade}</b>${maxed ? '' : ` → ${u.valores[lvl + 1]}${u.unidade}`}<div class="pips">${pips}</div>`,
          locked,
          foot: maxed ? '<span class="own">Máximo! ✨</span>' : `<span class="price">$ ${u.precos[lvl]}</span><button class="up" data-k="${k}" ${eco.money < u.precos[lvl] ? 'disabled' : ''}>Melhorar</button>`,
        });
      }).join('')}</div>
      <p class="muted" style="margin-top:14px">Dica: depois das pesquisas <b>Máquinas Mk2/Mk3</b>, cada máquina pode ser melhorada sozinha no painel dela (aperte <kbd>E</kbd> nela).</p>`;
      body.querySelectorAll('.up').forEach((b) => { b.onclick = () => this.upgrade(b.dataset.k); });
    } else if (this.shopTab === 'mercado') {
      body.innerHTML = `<p class="muted">Preços por unidade agora. Eles sobem e descem com o tempo: programe suas vendas pra aproveitar os picos! Vender muito de uma vez também abaixa o preço um pouco.</p>
      <table class="market">${Object.keys(ITEMS).map((k) => {
        const p = eco.price(k), tr = eco.trend(k);
        return `<tr><td><img src="${thumbs['item:' + k]}"></td><td><b>${ITEMS[k].nome}</b><br><code>"${k}"</code></td><td><canvas data-k="${k}" width="200" height="40"></canvas></td><td class="${tr > 0.05 ? 'up' : tr < -0.05 ? 'down' : ''}">${tr > 0.05 ? '▲' : tr < -0.05 ? '▼' : '•'} $ ${p.toFixed(1)}</td><td class="muted">vendidos: ${eco.stats.sold[k] || 0}</td></tr>`;
      }).join('')}</table>`;
      body.querySelectorAll('canvas').forEach((c) => this.sparkline(c, eco.history[c.dataset.k]));
    } else if (this.shopTab === 'receitas') {
      const st = (r, k) => (r.alt && !eco.hasAlt(k) ? '💾 disco' : r.nivel > eco.level ? '🔒 nível ' + r.nivel : r.tech && !eco.hasTech(r.tech) ? '🔬 ' + TECHS[r.tech].nome : '✔');
      body.innerHTML = `<h3 class="rec-h">Fornalha · <code>fundir("...")</code></h3><table class="market">${Object.entries(SMELT).filter(([k, r]) => !r.alt || eco.hasAlt(k)).map(([k, r]) => `<tr class="${st(r, k) !== '✔' ? 'locked' : ''}"><td><img src="${thumbs['item:' + r.out]}"></td><td><b>${ITEMS[r.out].nome}${r.qtd > 1 ? ` ×${r.qtd}` : ''}</b>${r.alt ? ' 💾' : ''}<br><code>fundir("${k}")</code></td><td>${Object.entries(r.in).map(([i, n]) => `${n}× ${ITEMS[i].nome}`).join(' + ')}${r.escoria ? ' <span class="muted">(+ escória)</span>' : ''}</td><td>${r.tempo}s</td><td>${st(r, k)}</td></tr>`).join('')}</table>
      <h3 class="rec-h">Montadora · <code>fabricar("...")</code></h3><table class="market">${Object.entries(RECIPES).filter(([k, r]) => !r.alt || eco.hasAlt(k)).map(([k, r]) => `<tr class="${st(r, k) !== '✔' ? 'locked' : ''}"><td><img src="${thumbs['item:' + recipeOut(k, r)]}"></td><td><b>${ITEMS[recipeOut(k, r)].nome}</b>${r.alt ? ' 💾' : ''}<br><code>fabricar("${k}")</code></td><td>${Object.entries(r.in).map(([i, n]) => `${n}× ${ITEMS[i].nome}`).join(' + ')}${r.qtd > 1 ? ` → ${r.qtd}×` : ''}</td><td>${r.tempo}s</td><td>${st(r, k)}</td></tr>`).join('')}</table>
      <p class="muted">💾 Receitas alternativas aparecem aqui quando você analisa um disco de dados no Laboratório.</p>`;
    }
  }

  // loja de fichas 🎟️: chapéus e cores do Oopi, decoração exclusiva e vagas de contrato
  renderTokenShop(body, card) {
    const eco = game.economy;
    if (game.mp?.isGuest) { body.innerHTML = '<p class="muted">No multiplayer, a loja de fichas fica com o anfitrião 🙂</p>'; return; }
    const o = eco.oopi;
    const tk = (n) => `<span class="price">🎟️ ${n}</span>`;
    const hats = Object.entries(OOPI_HATS).map(([k, h]) => {
      const own = o.hats.includes(k);
      return card({ img: thumbs['hat:' + k], name: h.nome, desc: 'Chapéu pro Oopi', foot: own ? `<button class="tk-hat" data-k="${k}">${o.hat === k ? '✔ usando (tirar)' : 'Usar'}</button>` : `${tk(h.fichas)}<button class="tk-buyhat" data-k="${k}" ${eco.tokens < h.fichas ? 'disabled' : ''}>Comprar</button>` });
    }).join('');
    const colors = Object.entries(OOPI_COLORS).map(([k, c]) => {
      const own = o.colors.includes(k);
      const sw = `<i class="tk-sw" style="background:${c.cor == null ? 'linear-gradient(135deg,#e9f0ff,#9fb4d6)' : '#' + c.cor.toString(16).padStart(6, '0')}"></i>`;
      return `<div class="tk-color">${sw}<b>${c.nome}</b>${own ? `<button class="tk-col" data-k="${k}" ${o.color === k ? 'disabled' : ''}>${o.color === k ? '✔' : 'Usar'}</button>` : `${tk(c.fichas)}<button class="tk-buycol" data-k="${k}" ${eco.tokens < c.fichas ? 'disabled' : ''}>Comprar</button>`}</div>`;
    }).join('');
    const decos = Object.entries(DECOR).filter(([, d]) => d.fichas).map(([k, d]) => card({
      img: thumbs[k], name: d.nome, desc: `<span class="bonus">✦ ${d.bonus}</span>`,
      foot: `${tk(d.fichas)}<span class="own">tem ${eco.inventory[k] || 0}</span><button class="buy" data-k="${k}" data-n="1" ${eco.tokens < d.fichas ? 'disabled' : ''}>Comprar</button>`,
    })).join('');
    const cs = contractState();
    const nextSlot = CONTRACT_SLOTS.find((x) => x.vagas > cs.slots);
    body.innerHTML = `<p class="muted">Você tem <b class="amber">🎟️ ${eco.tokens} fichas</b>. Ganhe fichas cumprindo <b>contratos</b> (📋 quadro no escritório), resolvendo <b>desafios</b> (🧩 terminal) e abrindo o <b>correio da manhã</b>.</p>
      <h3 class="rec-h">🎩 Chapéus do Oopi <small class="muted">amizade nível ${eco.friendLevel}/5</small></h3><div class="cards">${hats}</div>
      <h3 class="rec-h">🎨 Cor do Oopi</h3><div class="tk-colors">${colors}</div>
      <h3 class="rec-h">✨ Decoração exclusiva</h3><div class="cards">${decos}</div>
      <h3 class="rec-h">📋 Vagas de contrato</h3><div class="cards">${card({ name: `Mais uma vaga (${cs.slots} → ${nextSlot ? nextSlot.vagas : cs.slots})`, desc: 'Aceite mais contratos ao mesmo tempo.', foot: nextSlot ? `${tk(nextSlot.fichas)}<button id="tk-slot" ${eco.tokens < nextSlot.fichas ? 'disabled' : ''}>Comprar</button>` : '<span class="own">Máximo! ✨</span>' })}</div>`;
    const done = () => { audio.play('buy', { volume: 0.6 }); game.pet?.applyLook(); this.renderShop(); };
    body.querySelectorAll('.tk-buyhat').forEach((b) => { b.onclick = () => { const h = OOPI_HATS[b.dataset.k]; if (!eco.spendTokens(h.fichas)) return; o.hats.push(b.dataset.k); o.hat = b.dataset.k; game.pet?.say('Ficou lindo em mim? 🥹', 4); done(); }; });
    body.querySelectorAll('.tk-hat').forEach((b) => { b.onclick = () => { o.hat = o.hat === b.dataset.k ? null : b.dataset.k; done(); }; });
    body.querySelectorAll('.tk-buycol').forEach((b) => { b.onclick = () => { const c = OOPI_COLORS[b.dataset.k]; if (!eco.spendTokens(c.fichas)) return; o.colors.push(b.dataset.k); o.color = b.dataset.k; done(); }; });
    body.querySelectorAll('.tk-col').forEach((b) => { b.onclick = () => { o.color = b.dataset.k; done(); }; });
    body.querySelectorAll('.buy').forEach((b) => { b.onclick = () => this.buy(b.dataset.k, +b.dataset.n); });
    const sb = body.querySelector('#tk-slot');
    if (sb) sb.onclick = () => { if (!eco.spendTokens(nextSlot.fichas)) return; cs.slots = nextSlot.vagas; done(); };
  }

  sparkline(c, h) {
    const g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    if (!h || h.length < 2) return;
    const mn = Math.min(...h), mx = Math.max(...h);
    g.strokeStyle = '#ffc050';
    g.lineWidth = 2;
    g.beginPath();
    h.forEach((v, i) => {
      const x = (i / (h.length - 1)) * (c.width - 4) + 2;
      const y = c.height - 4 - ((v - mn) / (mx - mn || 1)) * (c.height - 8);
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    });
    g.stroke();
  }

  buy(k, n) {
    if (game.mp?.guestRpc('buy', { k, n })) { audio.play('buy', { volume: 0.5 }); return; }
    const d = MACHINES[k] || DECOR[k] || PAINTINGS[k];
    if (d.nivel && this.lockReason(d)) return;
    if (d.fichas) { if (!game.economy.spendTokens(d.fichas * n)) { audio.play('deny'); return; } }
    else if (!game.economy.spend(d.preco * n)) { audio.play('deny'); return; }
    game.economy.addItem(k, n);
    audio.play('buy', { volume: 0.6 });
    this.toast(`Comprou ${n > 1 ? n + '× ' : ''}${d.nome}! Está na sua barra (teclas 1-9).`, 'good');
    this.renderShop();
  }

  upgrade(k) {
    if (game.mp?.guestRpc('upgrade', { k })) { audio.play('buy', { volume: 0.5 }); return; }
    const u = UPGRADES[k];
    const lvl = game.economy.upgrades[k];
    if (!game.economy.spend(u.precos[lvl])) { audio.play('deny'); return; }
    game.economy.upgrades[k]++;
    audio.play('levelup', { volume: 0.5 });
    this.toast(`${u.nome}: agora ${u.valores[lvl + 1]}${u.unidade}!`, 'good');
    this.updateStats();
    this.renderShop();
  }

  buyRegion(id) {
    const r = REGIONS[id];
    const eco = game.economy;
    if (eco.hasRegion(id)) return;
    if (eco.level < r.nivel) { this.toast(`${r.nome} precisa do nível ${r.nivel}`, 'warn'); audio.play('deny'); return; }
    this.confirm(`Comprar ${r.nome}?`, `<p>${r.desc}</p><p>Preço: <b class="amber">$ ${fmt(r.preco)}</b> · você tem $ ${fmt(eco.money)}</p><p class="muted">As árvores da região somem e você pode construir lá.</p>`, () => {
      if (game.mp?.guestRpc('region', { id })) return;
      if (!eco.spend(r.preco)) { this.toast('Dinheiro insuficiente', 'warn'); audio.play('deny'); return; }
      eco.regions.push(id);
      game.emit('region', id);
      audio.play('levelup', { volume: 0.7 });
      this.banner(`🗺️ ${r.nome}`, 'Região comprada!', [r.desc]);
    }, { yes: `Comprar ($ ${fmt(r.preco)})`, no: 'Agora não' });
  }

  // ─── painel de máquina ───
  tierCost(e) {
    const next = TIERS[(e.tier || 0) + 1];
    if (!next) return null;
    return Math.round((MACHINES[e.type].preco || 100) * next.preco * 5);
  }
  renderPanel(full) {
    const e = this.panelEntity;
    if (!e) return;
    if (e.removed) { this.closeOverlay(); return; }
    const def = MACHINES[e.type];
    const eco = game.economy;
    if (full) {
      const api = e.api ? e.api() : {};
      $('#panel-img').src = thumbs[e.type] || '';
      $('#panel-type').textContent = def.nome;
      $('#panel-desc').textContent = def.desc;
      const guideTopic = { fornalha: 'Fornalha', montadora: 'Montadora', separador: 'Separador', gerador: 'Energia', gerador_grande: 'Energia', computador: 'computador', minerador: 'Primeira', venda: 'Primeira' }[e.type];
      $('#panel-guide').style.display = guideTopic ? '' : 'none';
      $('#panel-guide').onclick = () => this.openOverlay('guide', guideTopic);
      $('#panel-research').style.display = e.type === 'laboratorio' ? '' : 'none';
      $('#panel-research').onclick = () => this.openOverlay('research', e);
      const inp = $('#panel-name');
      inp.value = e.name;
      inp.onchange = () => {
        const v = inp.value.trim();
        if (!/^[\wÀ-ɏ-]+$/.test(v)) { this.toast('Use só letras, números e _ no nome', 'warn'); inp.value = e.name; return; }
        if (game.entities.some((o) => o !== e && o.name === v) || (game.drones || []).some((o) => o.name === v)) { this.toast('Já existe uma máquina com esse nome', 'warn'); inp.value = e.name; return; }
        if (game.mp?.guestRpc('rename', { a: `${e.x},${e.z},${e.layer || 0}`, name: v })) return;
        e.rename(v);
        this.toast(`Renomeado para "${v}". Lembre de usar maquina("${v}") no código!`);
      };
      inp.onkeydown = (ev) => { ev.stopPropagation(); if (ev.key === 'Enter') inp.blur(); if (ev.key === 'Escape') this.closeOverlay(); };
      const methods = Object.entries(api).map(([k, m]) => `<div class="meth"><code>.${k}(${m.min ? '"..."' : m.max ? '[...]' : ''})</code> <span>${m.doc || ''}</span></div>`).join('');
      $('#panel-api').innerHTML = `<div class="api-ex"><code>m = maquina("${e.name}")</code></div>${methods}`;
      $('#panel-rotate').onclick = () => { game.builder.rotateEntity(e); audio.play('tick'); refreshBeltsAround(e.x, e.z); };
      $('#panel-extra').onclick = (ev) => {
        const b = ev.target.closest('button[data-i]');
        if (!b || b.disabled || !this.panelActs) return;
        const a = this.panelActs[+b.dataset.i];
        if (a && game.mp?.guestRpc('panelAct', { a: `${e.x},${e.z},${e.layer || 0}`, i: +b.dataset.i })) { audio.play('click', { volume: 0.5 }); return; }
        if (a) { a.fn(); audio.play('click', { volume: 0.5 }); this.panelActsHtml = ''; this.renderPanel(false); }
      };
      $('#panel-pick').onclick = () => { game.builder.hover = { entity: e }; game.builder.removeHovered(); this.closeOverlay(); };
    }
    // melhoria Mk2/Mk3
    const up = $('#panel-upgrade');
    const next = TIERS[(e.tier || 0) + 1];
    if (TIERABLE.includes(e.type) && next) {
      const cost = this.tierCost(e);
      const ok = eco.hasTech(next.tech);
      up.style.display = '';
      up.disabled = !ok || eco.money < cost;
      up.textContent = ok ? `⬆ ${next.nome} ($ ${fmt(cost)}): ${next.vel}× mais rápida` : `🔬 ${next.nome}: pesquise “${TECHS[next.tech].nome}”`;
      up.onclick = () => {
        if (game.mp?.guestRpc('tier', { a: `${e.x},${e.z},${e.layer || 0}` })) return;
        if (!eco.spend(cost)) return;
        e.setTier((e.tier || 0) + 1);
        audio.play('levelup', { volume: 0.6 });
        this.toast(`${e.name} agora é ${TIERS[e.tier].nome}! ⚡ Gasta um pouco mais de energia.`, 'good');
        game.emit('power');
      };
    } else up.style.display = 'none';
    $('#panel-info').innerHTML = e.infoLines().filter(Boolean).map((l) => `<div>${l}</div>`).join('');
    // botões próprios da máquina (plantar, regar, colher...)
    const acts = e.panelActions ? e.panelActions() : [];
    this.panelActs = acts;
    const html = acts.map((a, i) => `<button data-i="${i}" class="${a.primary ? 'primary' : ''}" ${a.disabled ? 'disabled' : ''}>${a.label}</button>`).join('');
    const ex = $('#panel-extra');
    ex.style.display = acts.length ? '' : 'none';
    if (html !== this.panelActsHtml) { this.panelActsHtml = html; ex.innerHTML = html; }
  }

  // 🪐 Júpiter, próxima oposição/eclipse e os bônus da natureza ativos
  renderSkyline() {
    const el = $('#skyline');
    if (!el || !game.sky?.astro) return;
    const i = skyInfo();
    const bon = natureBonuses();
    const jup = i.grand ? '<b>🪐 GRANDE APROXIMAÇÃO</b>' : i.near > 0.75 ? '<b>🪐 Júpiter perto</b>' : `🪐 ${i.jupiter.split(' · ')[0]}`;
    const html = `${jup}${bon.length ? ' · <span class="bonus">' + bon[0] + (bon.length > 1 ? ` +${bon.length - 1}` : '') + '</span>' : ` · oposição ${i.oposicao}`}`;
    if (html !== this._skyHtml) { el.innerHTML = html; this._skyHtml = html; }
    el.title = `Dia ${i.dia} em KX-7\nJúpiter: ${i.jupiter}\nPróxima oposição: ${i.oposicao}\nGrande Aproximação: ${i.grande}\nEclipse de Mira: ${i.eclipse}\nMira: ${i.mira}${bon.length ? '\n\n' + bon.join('\n') : ''}`;
  }

  update(dt) {
    updateExplore(dt);
    if (this.overlay === 'panel') this.renderPanel(false);
    // bancada: segurando o botão de uma receita
    if (this.overlay === 'hub' && craft.active) {
      const t = craftStep(dt);
      const c = document.querySelector('.c3-rec.on .c3-ring');
      if (c) c.style.setProperty('--p', Math.round(t * 100) + '%');
    }
    if ((this.overlay === 'hub' || this.overlay === 'machine' || this.overlay === 'build') && this.itemsDirty) {
      const busy = document.activeElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName);
      this.xT -= dt;
      if (!busy && this.xT <= 0) { this.xT = 0.25; this.itemsDirty = false; this.renderX(); }
    }
    if (this.itemsDirty && !this.overlay) { this.hbT = (this.hbT || 0) - dt; if (this.hbT <= 0) { this.hbT = 0.3; this.itemsDirty = false; this.renderHotbar(); this.updateStats(); } }
    if (this.overlay === 'editor') this.editor.update();
    if (XWIN[this.overlay] && !NO_AUTO.has(this.overlay) && !['hub', 'build'].includes(this.overlay)) {
      if (this.overlay === 'machine' && document.activeElement && ['INPUT', 'SELECT'].includes(document.activeElement.tagName)) { /* editando o nome/filtro */ } else
      this.xT -= dt;
      if (this.xT <= 0) {
        this.xT = this.overlay === 'map' ? 0.2 : this.overlay === 'stats' ? 3 : this.overlay === 'contracts' ? 1 : 0.6;
        if ((this.overlay !== 'research' && this.overlay !== 'contracts' && this.overlay !== 'platform') || !document.querySelector('.rs-node:hover, .ct-card:hover, .sp-sat:hover, .dk-card:hover')) this.renderX();
      }
    }
    // barra da construção acompanha a mira (motivo de não poder construir)
    if (game.builder?.selected === 'construir') {
      this.bhT = (this.bhT || 0) - dt;
      if (this.bhT <= 0) { this.bhT = 0.2; const h = this.buildPalette(); if (h !== this.lastBh) { this.lastBh = h; $('#buildhint').innerHTML = h; } }
    }
    this.clockT = (this.clockT || 0) - dt;
    if (this.clockT <= 0) {
      this.clockT = 1;
      $('#clock').textContent = clockText();
      this.renderSkyline();
      if (this.objDirty || game.economy.contracts?.active?.length) { this.objDirty = false; this.renderObjective(); }
      const c = game.economy.combo;
      if (c.n >= 2 && game.time - c.t > 10) { c.n = 0; $('#combo').classList.add('hidden'); }
    }
    this.updatePrompt();
    const p = game.player;
    $('#move-speed').textContent = p.speed.toFixed(1).replace('.', ',');
    $('#move-state').textContent = p.sliding ? 'DESLIZANDO' : !p.onGround ? 'NO AR' : p.momentum > 0.85 ? 'EMBALO MÁXIMO' : p.speed > 5 ? 'CORRENDO' : 'PASSO';
    $('#momentum-bar').style.width = `${Math.round(p.momentum * 100)}%`;
    $('#movement').classList.toggle('hidden', game.mode !== 'play');
    $('#movement').classList.toggle('boosted', p.coffee > 0);
    $('#coffee-status').classList.toggle('hidden', !(p.coffee > 0));
    if (p.coffee > 0) $('#coffee-status').textContent = `☕ cafezinho: +30% por ${Math.ceil(p.coffee)}s`;
  }
}

export { itemName };
