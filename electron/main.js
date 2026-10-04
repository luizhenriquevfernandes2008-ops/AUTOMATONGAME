// AUTOMATON para desktop: abre o jogo numa janela própria (Electron), 100% offline.
// Os arquivos do jogo são servidos por um protocolo interno (app://automaton/), assim os
// módulos ES funcionam igual no navegador e o save (localStorage) fica guardado no PC do jogador.
const { app, BrowserWindow, protocol, net, ipcMain, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');
const HOST = 'automaton';

// gráficos: usa a placa de vídeo dedicada nos notebooks e não deixa o Chromium recusar a GPU
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
// a música e os efeitos tocam sem precisar de clique antes
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
// aberto pela Steam: o overlay (Shift+Tab) só aparece com a GPU no mesmo processo
if (process.env.SteamAppId || process.env.SteamGameId || process.argv.includes('--steam')) {
  app.commandLine.appendSwitch('in-process-gpu');
  app.commandLine.appendSwitch('disable-direct-composition');
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

// só uma janela do jogo aberta por vez (o save é um só)
if (!app.requestSingleInstanceLock()) app.quit();

// tamanho/posição da janela e tela cheia ficam guardados entre as sessões
const winFile = () => path.join(app.getPath('userData'), 'janela.json');
function loadWin() {
  try { return JSON.parse(fs.readFileSync(winFile(), 'utf8')); } catch { return { fullscreen: true }; }
}
function saveWin(win) {
  try {
    const b = win.getNormalBounds();
    fs.writeFileSync(winFile(), JSON.stringify({ fullscreen: win.isFullScreen(), maximized: win.isMaximized(), bounds: b }));
  } catch { /* sem problema: abre no padrão da próxima vez */ }
}

let win = null;
function createWindow() {
  const st = loadWin();
  win = new BrowserWindow({
    title: 'AUTOMATON',
    width: st.bounds?.width || 1600,
    height: st.bounds?.height || 900,
    x: st.bounds?.x,
    y: st.bounds?.y,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#07090d',
    fullscreen: !!st.fullscreen,
    show: false,
    autoHideMenuBar: true,
    icon: path.join(ROOT, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      spellcheck: false,
    },
  });
  if (st.maximized && !st.fullscreen) win.maximize();
  win.once('ready-to-show', () => win.show());
  win.on('close', () => saveWin(win));
  // F11 ou Alt+Enter: tela cheia · Ctrl+Shift+I só funciona rodando pelo código (npm start)
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11' || (input.alt && input.key === 'Enter')) { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    if (!app.isPackaged && input.control && input.shift && input.key.toLowerCase() === 'i') win.webContents.toggleDevTools();
  });
  // links pra fora (créditos, GitHub, itch…) abrem no navegador do jogador
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => {
    if (url.startsWith(`app://${HOST}/`)) return;
    e.preventDefault();
    if (/^https?:/.test(url)) shell.openExternal(url);
  });
  win.loadURL(`app://${HOST}/index.html`);
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  // app://automaton/<arquivo> -> arquivo do jogo dentro do pacote (nunca sai da pasta do jogo)
  protocol.handle('app', (req) => {
    const u = new URL(req.url);
    let rel = decodeURIComponent(u.pathname);
    if (rel === '/' || rel === '') rel = '/index.html';
    const file = path.normalize(path.join(ROOT, rel));
    if (u.host !== HOST || !file.startsWith(ROOT + path.sep)) return new Response('proibido', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
  ipcMain.on('desktop:quit', () => app.quit());
  ipcMain.on('desktop:fullscreen', (_e, on) => { if (win) win.setFullScreen(on == null ? !win.isFullScreen() : !!on); });
  ipcMain.handle('desktop:isFullscreen', () => !!win?.isFullScreen());
  createWindow();
});
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('window-all-closed', () => app.quit());
