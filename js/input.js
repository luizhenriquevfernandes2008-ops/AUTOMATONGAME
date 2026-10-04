// Teclas configuráveis: cada ação tem uma tecla padrão, e o jogador pode trocar nas Configurações.
import { settings, saveSettings } from './settings.js';

export const ACTIONS = [
  { id: 'frente', nome: 'Andar pra frente', def: 'KeyW', grupo: 'mover' },
  { id: 'tras', nome: 'Andar pra trás', def: 'KeyS', grupo: 'mover' },
  { id: 'esquerda', nome: 'Andar pra esquerda', def: 'KeyA', grupo: 'mover' },
  { id: 'direita', nome: 'Andar pra direita', def: 'KeyD', grupo: 'mover' },
  { id: 'correr', nome: 'Correr', def: 'ShiftLeft', grupo: 'mover' },
  { id: 'pular', nome: 'Pular', def: 'Space', grupo: 'mover' },
  { id: 'deslizar', nome: 'Deslizar', def: 'ControlLeft', grupo: 'mover' },
  { id: 'usar', nome: 'Usar / programar', def: 'KeyE', grupo: 'fabrica' },
  { id: 'girar', nome: 'Girar peça', def: 'KeyR', grupo: 'fabrica' },
  { id: 'guardar', nome: 'Guardar / desmontar', def: 'KeyX', grupo: 'fabrica' },
  { id: 'soltar', nome: 'Soltar da mão', def: 'KeyQ', grupo: 'fabrica' },
  { id: 'peca', nome: 'Construção: trocar peça · Oopi: tarefas', def: 'KeyF', grupo: 'fabrica' },
  { id: 'material', nome: 'Construção: trocar material/cor', def: 'KeyT', grupo: 'fabrica' },
  { id: 'copiar', nome: 'Copiar grupo', def: 'KeyC', grupo: 'fabrica' },
  { id: 'colar', nome: 'Colar grupo', def: 'KeyV', grupo: 'fabrica' },
  { id: 'loja', nome: 'Menu de construção', def: 'KeyB', grupo: 'janelas' },
  { id: 'guia', nome: 'Guia', def: 'KeyH', grupo: 'janelas' },
  { id: 'stats', nome: 'Estatísticas', def: 'KeyK', grupo: 'janelas' },
  { id: 'mapa', nome: 'Mapa', def: 'Tab', grupo: 'janelas' },
  { id: 'foto', nome: 'Modo foto', def: 'KeyP', grupo: 'janelas' },
  { id: 'musica', nome: 'Música: próxima parte', def: 'KeyM', grupo: 'janelas' },
  { id: 'radio', nome: 'Trocar rádio', def: 'KeyG', grupo: 'janelas', oculto: true },
  { id: 'projetos', nome: 'Projetos (plantas salvas)', def: 'KeyJ', grupo: 'janelas' },
  { id: 'contratos', nome: 'Quadro de Contratos', def: 'KeyL', grupo: 'janelas', oculto: true },
  { id: 'amigos', nome: 'Amigos (desafio da semana, visitas, parcerias)', def: 'KeyN', grupo: 'janelas', oculto: true },
  { id: 'multiplayer', nome: 'Jogar junto (multiplayer)', def: 'KeyO', grupo: 'janelas' },
];
const DEF = Object.fromEntries(ACTIONS.map((a) => [a.id, a.def]));

export function keyOf(id) { return settings.keys?.[id] || DEF[id]; }
export function actionOf(code) {
  for (const a of ACTIONS) if (keyOf(a.id) === code) return a.id;
  return null;
}
// a ação está apertada? (Shift/Ctrl valem dos dois lados do teclado)
export function held(keys, id) {
  const c = keyOf(id);
  if (keys[c]) return true;
  if (c === 'ShiftLeft') return !!keys.ShiftRight;
  if (c === 'ControlLeft') return !!keys.ControlRight;
  if (c === 'AltLeft') return !!keys.AltRight;
  return false;
}
export function setKey(id, code) {
  settings.keys = settings.keys || {};
  // se outra ação usava essa tecla, as duas trocam
  const other = actionOf(code);
  if (other && other !== id) settings.keys[other] = keyOf(id);
  settings.keys[id] = code;
  saveSettings();
}
export function resetKeys() { settings.keys = {}; saveSettings(); }

const NAMES = {
  Space: 'Espaço', ShiftLeft: 'Shift', ShiftRight: 'Shift dir.', ControlLeft: 'Ctrl', ControlRight: 'Ctrl dir.', AltLeft: 'Alt', AltRight: 'AltGr',
  Tab: 'Tab', Enter: 'Enter', Backspace: '⌫', CapsLock: 'Caps', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Backquote: "'", Minus: '-', Equal: '=', BracketLeft: '´', BracketRight: '[', Backslash: ']', Semicolon: 'Ç', Quote: '~', Comma: ',', Period: '.', Slash: ';',
};
export function keyLabel(code) {
  if (!code) return '—';
  if (NAMES[code]) return NAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  return code;
}
export function kbd(id) { return `<kbd>${keyLabel(keyOf(id))}</kbd>`; }
// teclas que não podem ser usadas (o jogo já usa pra outra coisa fixa)
export const RESERVED = new Set(['Escape', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'F10', 'KeyZ']);

// ─── tela de trocar teclas (Configurações) ───
let listening = null;
export function bindKeyUI(onChange) {
  const box = document.getElementById('keys-list');
  if (!box) return;
  const grupos = { mover: 'Movimento', fabrica: 'Fábrica', janelas: 'Janelas e som' };
  const render = () => {
    box.innerHTML = Object.entries(grupos).map(([g, nome]) => `<div class="keys-g">${nome}</div>` + ACTIONS.filter((a) => a.grupo === g && !a.oculto)
      .map((a) => `<div class="keyrow"><span>${a.nome}</span><button class="keybtn ${listening === a.id ? 'listen' : ''}" data-a="${a.id}">${listening === a.id ? 'aperte…' : keyLabel(keyOf(a.id))}</button></div>`).join('')).join('');
    box.querySelectorAll('.keybtn').forEach((b) => { b.onclick = (e) => { e.preventDefault(); listening = b.dataset.a; render(); }; });
  };
  addEventListener('keydown', (e) => {
    if (!listening) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.code !== 'Escape') {
      if (RESERVED.has(e.code)) { listening = null; render(); onChange && onChange(`A tecla ${keyLabel(e.code)} já é usada pelo jogo`); return; }
      setKey(listening, e.code);
    }
    listening = null;
    render();
    onChange && onChange();
  }, true);
  const reset = document.getElementById('keys-reset');
  if (reset) reset.onclick = () => { resetKeys(); render(); onChange && onChange(); };
  render();
  return render;
}
