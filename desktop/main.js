// Electron main process — wraps the cookbook web app in a desktop window.
const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');

const isPackaged = app.isPackaged;

function resolveIndex() {
  // When packaged, electron-builder copies the parent directory into
  // resources/app/. The repo root is one level up from this file.
  const indexPath = isPackaged
    ? path.join(process.resourcesPath, 'app', 'index.html')
    : path.join(__dirname, '..', 'index.html');
  return indexPath;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 600,
    minHeight: 480,
    backgroundColor: '#fdf6ee',
    title: 'The Best of Brock',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  });

  // Open external URLs in default browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  win.loadFile(resolveIndex());

  // Simple menu
  const template = [
    { role: 'appMenu' },
    { role: 'fileMenu' },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    { role: 'windowMenu' }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
