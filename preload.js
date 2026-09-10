const { contextBridge, ipcRenderer } = require('electron');

// The main process passes the backend port via additionalArguments
// (main.js createWindow). Exposed synchronously so the frontend can derive
// its API base URL at module load.
function getBackendPort() {
  const flag = process.argv.find((a) => a.startsWith('--backendPort='));
  if (flag) {
    const p = parseInt(flag.split('=')[1], 10);
    if (Number.isInteger(p) && p > 0 && p < 65536) return p;
  }
  return 8000;
}

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: () => ipcRenderer.invoke('dialog:openDirectory'),
  getDefaultPath: () => ipcRenderer.invoke('system:getDefaultPath'),
  getBackendPort
});