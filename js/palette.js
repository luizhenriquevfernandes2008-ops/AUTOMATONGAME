// Cores de sinal (luz das máquinas, cabos) com modos pra daltonismo.
// normal: verde/amarelo/vermelho · protanopia/deuteranopia: azul/amarelo/laranja · tritanopia: verde-água/rosa/vermelho
import { game } from './state.js';

const PALETTES = {
  normal: { work: 0x5dff8a, wait: 0xffc44d, out: 0x7fb2ff, bad: 0xff4455, badGlow: 0xff2233, idle: 0x666677, css: {} },
  deut: { work: 0x3aa0ff, wait: 0xffd35a, out: 0xd6c8ff, bad: 0xff8a00, badGlow: 0xff6a00, idle: 0x77778a, css: { '--good': '#4aa8ff', '--bad': '#ff9a1a' } },
  prot: { work: 0x3aa0ff, wait: 0xffe45a, out: 0xd6c8ff, bad: 0xff9a2a, badGlow: 0xff7a00, idle: 0x77778a, css: { '--good': '#4aa8ff', '--bad': '#ffae3a' } },
  trit: { work: 0x00c8a8, wait: 0xff8fc8, out: 0xffffff, bad: 0xff3040, badGlow: 0xff2030, idle: 0x777788, css: { '--good': '#1ad2b0', '--bad': '#ff3a5a', '--blue': '#ff8fc8' } },
};
export const MODES = { normal: 'Normal', deut: 'Deuteranopia', prot: 'Protanopia', trit: 'Tritanopia' };
export const PAL = { ...PALETTES.normal };

export function setPalette(mode) {
  const p = PALETTES[mode] || PALETTES.normal;
  Object.assign(PAL, p);
  const root = document.documentElement;
  for (const v of ['--good', '--bad', '--blue']) root.style.removeProperty(v);
  for (const [k, v] of Object.entries(p.css)) root.style.setProperty(k, v);
  document.body.dataset.cb = mode || 'normal';
  game.emit('palette');
}
