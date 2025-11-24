const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // File operations
  openFile: () => ipcRenderer.invoke("dialog:openFile"),
  saveFile: (args) => ipcRenderer.invoke("dialog:saveFile", args),
  saveAs: (content) => ipcRenderer.invoke("dialog:saveAs", content),
  openFolder: () => ipcRenderer.invoke("dialog:openFolder"),
  readFile: (filePath) => ipcRenderer.invoke("file:read", filePath),
  writeFile: (args) => ipcRenderer.invoke("file:write", args),
  readDir: (dirPath) => ipcRenderer.invoke("dir:read", dirPath),

  // Receive IPC from main
});

contextBridge.exposeInMainWorld("terminalAPI", {
  create: (opts) => ipcRenderer.invoke("terminal:create", opts),
  write: (id, data) => ipcRenderer.invoke("terminal:write", { id, data }),
  resize: (id, cols, rows) => ipcRenderer.invoke("terminal:resize", { id, cols, rows }),
  kill: (id) => ipcRenderer.invoke("terminal:kill", id),
  onData: (cb) => ipcRenderer.on("terminal:data", (event, arg) => cb(arg)),
  onExit: (cb) => ipcRenderer.on("terminal:exit", (event, arg) => cb(arg)),
  sendCommand: (cmd, dirPath) => ipcRenderer.invoke("run-command", cmd, dirPath),
});

contextBridge.exposeInMainWorld("browserAPI", {
  navigate: (url) => ipcRenderer.invoke("browser:navigate", url),
  goBack: () => ipcRenderer.invoke("browser:back"),
  goForward: () => ipcRenderer.invoke("browser:forward"),
  reload: () => ipcRenderer.invoke("browser:reload"),
  receive: (channel, func) => ipcRenderer.on(channel, (event, ...args) => func(...args)),
  openWindow: (url) => ipcRenderer.invoke("browser:open-window", url),
});
console.log("browserAPI loaded in preload");
