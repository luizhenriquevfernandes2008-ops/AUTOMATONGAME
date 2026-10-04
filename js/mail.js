// 📬 Correio da manhã: uma vez por dia (dia de verdade), um pacote com presente. Dias seguidos rendem mais.
// Junta também o relatório do que a fábrica fez enquanto você estava fora.
import { game } from './state.js';
import { DAILY } from './data.js';
import { audio } from './audio.js';
import { confetti } from './fx.js';
import { gainDisk } from './disks.js';

const fmt = (n) => Math.round(n).toLocaleString('pt-BR');
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function daysBetween(a, b) {
  const pa = a.split('-').map(Number), pb = b.split('-').map(Number);
  return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 86400000);
}
const HEADLINES = [
  (e) => `Fábrica local já vendeu ${fmt(e.stats.soldCount)} itens; vizinhos pedem autógrafo`,
  (e) => `Oopi é eleito "robô mais fofo do bairro" pelo ${Math.max(2, e.level)}º ano seguido`,
  (e) => (e.moneyPerMinute() > 1 ? `Economistas explicam: $ ${fmt(e.moneyPerMinute())} por minuto é "muito café"` : 'Fábrica acorda cedo e passa um cafezinho ☕'),
  (e) => `Cientistas confirmam: ${e.techs.length} pesquisas concluídas e nenhuma explosão`,
  () => 'Bossa nova volta às paradas; esteiras dançam no ritmo',
  (e) => `Clientes elogiam: ${e.stats.contracts || 0} contratos entregues "sempre com um sorriso"`,
  () => 'Meteorologia prevê céu estrelado e chance de meteoros ☄️',
  () => 'Jiboia é eleita a linguagem mais simpática do ano 🐍',
];

// chama ao entrar no jogo. Retorna o pacote do dia (ou null se já abriu hoje)
export function checkDaily(fresh) {
  const eco = game.economy;
  const today = dayKey();
  const d = eco.daily;
  if (d.last === today) return null;
  if (fresh) { d.last = today; d.streak = 1; return null; }
  d.streak = d.last && daysBetween(d.last, today) === 1 ? d.streak + 1 : 1;
  d.last = today;
  const r = DAILY[(d.streak - 1) % DAILY.length];
  const base = 120 + eco.level * 90;
  const gift = { streak: d.streak, dinheiro: r.dinheiro ? Math.round(base * r.dinheiro) : 0, fichas: r.fichas || 0, disco: r.disco || 0 };
  if (gift.dinheiro) { eco.addMoney(gift.dinheiro); eco.stats.earned += gift.dinheiro; }
  if (gift.fichas) eco.addTokens(gift.fichas);
  for (let i = 0; i < gift.disco; i++) gainDisk('correio');
  return gift;
}

export function openMail(gift, offline) {
  game.mailData = { gift, offline };
  game.ui.openOverlay('mail');
  audio.play('achievement', { volume: 0.6 });
  if (gift && gift.streak % 7 === 0) confetti(120);
}

export function renderMail(el) {
  const { gift, offline } = game.mailData || {};
  const eco = game.economy;
  const streak = gift?.streak || eco.daily.streak || 1;
  const week = DAILY.map((r, i) => {
    const pos = (streak - 1) % 7;
    const cls = i < pos ? 'done' : i === pos ? 'today' : '';
    const lbl = [r.dinheiro ? '💰' : '', r.fichas ? `🎟️×${r.fichas}` : '', r.disco ? '💾' : ''].filter(Boolean).join(' ');
    return `<div class="ml-day ${cls}"><small>dia ${i + 1}</small><b>${lbl}</b>${i < pos ? '<i>✔</i>' : ''}</div>`;
  }).join('');
  let off = '';
  if (offline) {
    const h = Math.floor(offline.secs / 3600), m = Math.floor((offline.secs % 3600) / 60);
    off = `<div class="card-x"><div class="card-h"><span>// enquanto você estava fora (${h ? h + 'h ' : ''}${m}min)</span><b>+$ ${fmt(offline.gain)}</b></div><p class="muted" style="margin:0">A fábrica continuou trabalhando na metade do ritmo (até 8 horas).</p></div>`;
  }
  const news = HEADLINES[Math.floor(Math.random() * HEADLINES.length)](eco);
  el.innerHTML = `
    <div class="ml">
      <div class="ml-head"><span class="ml-big">📬</span><div><h2>Correio da Manhã</h2><div class="muted">${streak} dia(s) seguido(s) · volte amanhã pra continuar a sequência</div></div></div>
      <div class="ml-week">${week}</div>
      ${gift ? `<div class="card-x ml-gift"><div class="card-h"><span>// pacote de hoje</span><b>dia ${streak}</b></div>
        <div class="ml-items">${gift.dinheiro ? `<span>💰 +$ ${fmt(gift.dinheiro)}</span>` : ''}${gift.fichas ? `<span>🎟️ +${gift.fichas} ficha(s)</span>` : ''}${gift.disco ? '<span>💾 +1 disco de dados</span>' : ''}</div></div>` : ''}
      ${off}
      <div class="card-x ml-news"><div class="card-h"><span>// 📰 jornal da fábrica</span></div><p style="margin:0"><i>${news}</i></p></div>
      <div class="row"><button class="primary big" id="ml-ok">Oba! Bora trabalhar ☕</button></div>
    </div>`;
  el.querySelector('#ml-ok').onclick = () => game.ui.closeOverlay();
}
