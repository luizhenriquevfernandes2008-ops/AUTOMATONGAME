// Começo em KX-7: você já aparece no chão, do lado da nave que caiu, e lê a carta de boas-vindas.
// (A cena da cápsula descendo do céu foi tirada.)
import { game } from './state.js';
import { BIOMES, world } from './terrain.js';
import { START_KIT, ITEMS } from './data.js';

export function startLanding() {
  if (!game.pod) return;
  finish();
}
// mantido pra compatibilidade (testes antigos chamam isso): não há mais animação
export function updateLanding() { }

function finish() {
  game.landingActive = false;
  game.player.teleport(game.spawn, game.spawnYaw || 0);
  game.camera.rotation.set(-0.05, game.spawnYaw || 0, 0, 'YXZ');
  const B = BIOMES[world.start];
  const kit = Object.entries(START_KIT).map(([k, n]) => `${n}× ${ITEMS[k].nome}`).join(', ');
  game.ui.confirm(`${B.icone} Bem-vindo(a) a KX-7`, `<p>Sua nave caiu na <b>${B.nome}</b> · planeta <code>${world.seedText}</code>.</p>
    <p>Deu pra salvar um kit dos destroços: <span class="muted">${kit}</span>.</p>
    <p>Primeiro passo: monte a <b>🏠 Central</b> num lugar plano perto da nave (tecla <kbd>1</kbd> e clique). Depois pague o primeiro <b>Marco</b> nela.</p>
    <p class="muted">Segure <kbd>E</kbd> em veios e plantas pra coletar · <kbd>B</kbd> menu de construção · <kbd>Tab</kbd> mapa · <kbd>H</kbd> guia</p>`,
  null, { yes: 'Bora! 🚀', noButton: false });
}
export const landingActive = () => false;
