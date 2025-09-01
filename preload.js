const { contextBridge, ipcRenderer, shell } = require('electron');

contextBridge.exposeInMainWorld('native', {
  openExternal: (url) => shell.openExternal(url),
  onThemeChange: (cb) => {
    const listener = (_, isDark) => cb(!!isDark);
    ipcRenderer.on('native-theme-changed', listener);
    return () => ipcRenderer.removeListener('native-theme-changed', listener);
  }
});
