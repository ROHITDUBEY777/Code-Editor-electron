const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  saveFile: (args) => ipcRenderer.invoke('dialog:saveFile', args),
  saveAs: (content) => ipcRenderer.invoke('dialog:saveAs', content),
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  readFile: (filePath) => ipcRenderer.invoke('file:read', filePath),
  writeFile: (args) => ipcRenderer.invoke('file:write', args),
  readDir: (dirPath) => ipcRenderer.invoke('dir:read', dirPath)
});

contextBridge.exposeInMainWorld('terminalAPI', {
  create: (opts) => ipcRenderer.invoke('terminal:create', opts),
  write: (id, data) => ipcRenderer.invoke('terminal:write', { id, data }),
  resize: (id, cols, rows) => ipcRenderer.invoke('terminal:resize', { id, cols, rows }),
  kill: (id) => ipcRenderer.invoke('terminal:kill', id),
  onData: (cb) => ipcRenderer.on('terminal:data', (event, arg) => cb(arg)),
  onExit: (cb) => ipcRenderer.on('terminal:exit', (event, arg) => cb(arg))
});
