// Ponte mínima entre o jogo e a janela do desktop (sair, tela cheia). O jogo testa window.desktop.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  quit: () => ipcRenderer.send('desktop:quit'),
  setFullscreen: (on) => ipcRenderer.send('desktop:fullscreen', on),
  isFullscreen: () => ipcRenderer.invoke('desktop:isFullscreen'),
});
