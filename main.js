// main.js
const { app, BrowserWindow, shell, session, Menu, nativeTheme, Tray } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

// Target Gemini URL
const TARGET_URL = process.env.TARGET_URL || 'https://gemini.google.com/app';

// Allowlisted origins kept inside Electron
const ALLOWED_ORIGINS = new Set([
  'https://gemini.google.com',
  'https://accounts.google.com',
  'https://myaccount.google.com',
  'https://www.google.com',
  'https://content.google.com',
  'https://apis.google.com',
  'https://clients2.google.com'
]);

// Hosts allowed to open popups inside the app (auth/consent)
const POPUP_ALLOWLIST = new Set([
  'accounts.google.com',
  'myaccount.google.com',
  'apis.google.com',
  'clients2.google.com',
  'www.google.com'
]);

// ESM electron-store will be imported at runtime
let Store;   // ctor
let uiStore; // instance

function isAllowed(url) {
  try {
    const u = new URL(url);
    return ALLOWED_ORIGINS.has(u.origin);
  } catch {
    return false;
  }
}

function createChildWindow(parent, url) {
  const child = new BrowserWindow({
    parent,
    modal: true,
    width: 900,
    height: 700,
    titleBarStyle: 'default',
    backgroundColor: '#ECECEC',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      enableRemoteModule: false,
      navigateOnDragDrop: false
    }
  });

  child.webContents.setWindowOpenHandler(({ url: urlToOpen }) => {
    try {
      const host = new URL(urlToOpen).host;
      if (POPUP_ALLOWLIST.has(host)) return { action: 'allow' };
    } catch {}
    shell.openExternal(urlToOpen);
    return { action: 'deny' };
  });

  child.webContents.on('will-navigate', (event, navUrl) => {
    if (!isAllowed(navUrl)) {
      event.preventDefault();
      shell.openExternal(navUrl);
    }
  });

  if (url) child.loadURL(url);
  return child;
}

let tray;

function createTray(mainWindowRef) {
  const trayIcon = process.platform === 'win32'
    ? path.join(__dirname, 'assets', 'icon.ico')
    : path.join(__dirname, 'assets', 'icon-tray.png');

  tray = new Tray(trayIcon);
  tray.setToolTip('Gemini Wrapper');

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show', click: () => mainWindowRef?.show() },
    { label: 'Hide', click: () => mainWindowRef?.hide() },
    { type: 'separator' },
    { label: 'New Window (Default Profile)', click: () => createWindow({ profile: 'default' }) },
    { label: 'New Window (Work Profile)',    click: () => createWindow({ profile: 'work' }) },
    { type: 'separator' },
    { role: 'quit' }
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', () => (mainWindowRef?.isVisible() ? mainWindowRef.focus() : mainWindowRef?.show()));
}

function addCameraTestMenu(template) {
  template.push({
    label: 'Tools',
    submenu: [
      {
        label: 'Camera Test',
        click: () => {
          const w = new BrowserWindow({
            width: 1000,
            height: 740,
            titleBarStyle: 'default',
            backgroundColor: '#ECECEC',
            webPreferences: { contextIsolation: true, sandbox: true }
          });
          w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`
            <!doctype html>
            <html>
            <body style="margin:0;display:grid;place-items:center;height:100vh;background:#111;color:#fff;font-family:-apple-system,system-ui,Segoe UI,Roboto,Ubuntu">
              <div style="text-align:center">
                <h2 style="margin:0 0 12px">Camera Test</h2>
                <video id="v" playsinline autoplay style="width:80vw;max-width:900px;border-radius:12px;background:#000"></video>
                <p id="msg" style="opacity:.8"></p>
                <script>
                  (async () => {
                    const v = document.getElementById('v');
                    const msg = document.getElementById('msg');
                    try {
                      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
                      v.srcObject = stream;
                      msg.textContent = '✅ Camera stream started. If you see video, permissions work.';
                    } catch (e) {
                      msg.textContent = '❌ getUserMedia error: ' + (e && e.message);
                    }
                  })();
                </script>
              </div>
            </body>
            </html>
          `));
        }
      }
    ]
  });
}

function createWindow(opts = {}) {
  const profileName = (opts.profile || process.env.PROFILE || 'default').toLowerCase();
  const partition = `persist:${profileName}`;
  const savedBounds = uiStore.get('bounds') || { width: 1200, height: 800 };

  const win = new BrowserWindow({
    ...savedBounds,
    titleBarStyle: 'default',
    backgroundColor: '#ECECEC',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      partition, // persist cookies/storage per profile
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      enableRemoteModule: false,
      navigateOnDragDrop: false
    }
  });

  // Persist size/position
  const saveBounds = () => uiStore.set('bounds', win.getBounds());
  win.on('resize', saveBounds);
  win.on('move', saveBounds);
  win.on('close', saveBounds);

  // App menu
  const template = [
    ...(process.platform === 'darwin'
      ? [{ label: app.name, submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'quit' }] }]
      : []),
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'close' }] }
  ];
  addCameraTestMenu(template);
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));

  // Scrub Electron token from UA (keeps normal desktop UA)
  const baseUA = win.webContents.getUserAgent().replace(/Electron\/[\d.]+\s?/, '');
  win.webContents.setUserAgent(baseUA);

  // Load Gemini
  win.loadURL(TARGET_URL);

  // Handle popups (Google auth inside, others external)
  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const u = new URL(url);
      if (POPUP_ALLOWLIST.has(u.host)) {
        createChildWindow(win, url);
        return { action: 'deny' };
      }
    } catch {}
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Keep top-level navigations on allowlist
  win.webContents.on('will-navigate', (event, url) => {
    if (!isAllowed(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  if (!global.mainWindow) global.mainWindow = win;

  nativeTheme.on('updated', () => {
    win.webContents.send('native-theme-changed', nativeTheme.shouldUseDarkColors);
  });

  return win;
}

// Permissions, CSP, Downloads
function setupPermissions() {
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => {
    const reqUrl = details?.requestingUrl || '';
    let origin = '';
    try { origin = new URL(reqUrl).origin; } catch {}
    const okOrigin = ALLOWED_ORIGINS.has(origin) && reqUrl.startsWith('https://');

    const ALLOW = new Set(['notifications', 'media', 'display-capture']); // 'media' enables camera/mic prompts
    callback(okOrigin && ALLOW.has(permission));
  });

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders };
    if (!Object.keys(headers).some(h => h.toLowerCase() === 'content-security-policy')) {
      headers['Content-Security-Policy'] = [
        "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: https: blob:;"
      ];
    }
    callback({ responseHeaders: headers });
  });

  session.defaultSession.on('will-download', (event, item) => {
    const downloadsDir = path.join(app.getPath('downloads'), 'GeminiWrapper');
    fs.mkdir(downloadsDir, { recursive: true }, () => {
      const dest = path.join(downloadsDir, item.getFilename());
      item.setSavePath(dest);
    });
  });
}

app.on('before-quit', async () => {
  try { await session.defaultSession.cookies.flushStore(); } catch {}
});

app.whenReady().then(async () => {
  // Dynamically import ESM electron-store
  const mod = await import('electron-store');
  Store = mod.default;
  uiStore = new Store({ name: 'ui' });

  setupPermissions();

  const firstWindow = createWindow({ profile: 'default' });
  createTray(firstWindow);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const w = createWindow({ profile: 'default' });
      createTray(w);
    }
  });

  // Auto-updates
  autoUpdater.autoDownload = true;
  autoUpdater.checkForUpdatesAndNotify();
  autoUpdater.on('update-available', () => {
    global.mainWindow?.webContents.send('update-available');
  });
  autoUpdater.on('update-downloaded', () => {
    global.mainWindow?.webContents.send('update-ready');
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});