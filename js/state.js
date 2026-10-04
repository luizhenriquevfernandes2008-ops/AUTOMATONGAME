// Estado global compartilhado + eventos simples.
export const game = {
  scene: null, camera: null, renderer: null,
  time: 0,            // tempo de jogo em segundos
  entities: [],       // máquinas e decorações colocadas
  economy: null,
  player: null,
  ui: null,
  mode: 'menu',       // menu | play | ui
  listeners: {},
  on(ev, fn) { (this.listeners[ev] || (this.listeners[ev] = [])).push(fn); },
  emit(ev, ...a) { (this.listeners[ev] || []).forEach((f) => f(...a)); },
};
