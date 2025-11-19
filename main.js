const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const { exec } = require("child_process");
let pty = null;
try {
  pty = require("node-pty");
} catch (e1) {
  try {
    pty = require("node-pty-prebuilt-multiarch");
  } catch (e2) {
    // Don't throw — we'll fall back to a child_process-based terminal later.
    pty = null;
    console.info("node-pty not available, terminal will use fallback child_process.");
  }
}
const ptyAvailable = !!pty;

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile("index.html");
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

ipcMain.handle("dialog:openFile", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ["openFile"],
  });
  if (canceled) return { canceled: true };
  const filePath = filePaths[0];
  const content = fs.readFileSync(filePath, "utf8");
  return { canceled: false, filePath, content };
});

ipcMain.handle("dialog:openFolder", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ["openDirectory"],
  });
  if (canceled) return { canceled: true };
  const folder = filePaths[0];

  function walk(dir, base) {
    const entries = [];
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const it of items) {
      const full = path.join(dir, it.name);
      const rel = path.relative(base, full);
      if (it.isDirectory()) {
        entries.push({ path: full, name: it.name, isDirectory: true });
        // non-recursive by default to avoid huge trees; include immediate children
        const children = fs.readdirSync(full, { withFileTypes: true });
        for (const c of children) {
          const cfull = path.join(full, c.name);
          entries.push({
            path: cfull,
            name: path.join(it.name, c.name),
            isDirectory: c.isDirectory(),
          });
        }
      } else {
        entries.push({ path: full, name: rel, isDirectory: false });
      }
    }
    return entries;
  }

  const entries = walk(folder, folder);
  return { canceled: false, folder, entries };
});

ipcMain.handle("file:read", async (event, filePath) => {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    return { ok: true, content };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle("file:write", async (event, { filePath, content }) => {
  try {
    fs.writeFileSync(filePath, content, "utf8");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle("dir:read", async (event, dirPath) => {
  try {
    const items = fs.readdirSync(dirPath, { withFileTypes: true });
    const entries = items.map((it) => ({
      name: it.name,
      path: path.join(dirPath, it.name),
      isDirectory: it.isDirectory(),
    }));
    // sort: directories first then files, alphabetically
    entries.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });
    return { ok: true, entries };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// Terminal (PTY) management
const terminals = new Map();

ipcMain.handle("terminal:create", async (event, { cols = 80, rows = 24, shell } = {}) => {
  const shellCmd =
    shell ||
    (process.platform === "win32" ? "powershell.exe" : process.env.SHELL || "bash");
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  if (pty) {
    const term = pty.spawn(shellCmd, [], {
      name: "xterm-color",
      cols,
      rows,
      cwd: process.cwd(),
      env: process.env,
    });
    terminals.set(id, term);

    term.on("data", (data) => {
      try {
        event.sender.send("terminal:data", { id, data });
      } catch (e) {}
    });
    term.on("exit", (exitCode, signal) => {
      try {
        event.sender.send("terminal:exit", { id, exitCode, signal });
      } catch (e) {}
      terminals.delete(id);
    });
    return { ok: true, id, pty: true };
  }

  // Fallback when pty is not available: spawn a child process and pipe stdio (less featureful)
  try {
    const cp = require("child_process");
    const child = cp.spawn(shellCmd, [], {
      cwd: process.cwd(),
      env: process.env,
      shell: true,
    });
    // provide a minimal terminal-like wrapper
    const wrapper = {
      write: (d) => {
        try {
          child.stdin.write(d);
        } catch (e) {}
      },
      resize: (c, r) => {
        /* noop - no PTY */
      },
      kill: () => {
        try {
          child.kill();
        } catch (e) {}
      },
    };
    terminals.set(id, wrapper);

    child.stdout.on("data", (chunk) => {
      try {
        event.sender.send("terminal:data", { id, data: String(chunk) });
      } catch (e) {}
    });
    child.stderr.on("data", (chunk) => {
      try {
        event.sender.send("terminal:data", { id, data: String(chunk) });
      } catch (e) {}
    });
    child.on("close", (code) => {
      try {
        event.sender.send("terminal:exit", { id, exitCode: code });
      } catch (e) {}
      terminals.delete(id);
    });

    return { ok: true, id, pty: false, fallback: true };
  } catch (err) {
    return { ok: false, error: "PTY not available and fallback failed: " + String(err) };
  }
});

ipcMain.handle("terminal:write", (event, { id, data }) => {
  const t = terminals.get(id);
  if (!t) return { ok: false, error: "no such terminal" };
  t.write(data);
  return { ok: true };
});

ipcMain.handle("terminal:resize", (event, { id, cols, rows }) => {
  const t = terminals.get(id);
  if (!t) return { ok: false, error: "no such terminal" };
  t.resize(cols, rows);
  return { ok: true };
});

ipcMain.handle("terminal:kill", (event, id) => {
  const t = terminals.get(id);
  if (!t) return { ok: false, error: "no such terminal" };
  try {
    t.kill();
  } catch (e) {}
  terminals.delete(id);
  return { ok: true };
});

ipcMain.handle("dialog:saveFile", async (event, { filePath, content }) => {
  let target = filePath;
  if (!target) {
    const { canceled, filePath: savePath } = await dialog.showSaveDialog({});
    if (canceled) return { canceled: true };
    target = savePath;
  }
  fs.writeFileSync(target, content, "utf8");
  return { canceled: false, filePath: target };
});

ipcMain.handle("dialog:saveAs", async (event, content) => {
  const { canceled, filePath } = await dialog.showSaveDialog({});
  if (canceled) return { canceled: true };
  fs.writeFileSync(filePath, content, "utf8");
  return { canceled: false, filePath };
});

ipcMain.handle("run-command", async (event, cmd) => {
  console.log("Received from renderer:", cmd);

  return new Promise((resolve) => {
    exec(cmd, { shell: "powershell.exe" }, (error, stdout, stderr) => {
      if (error) {
        resolve(stderr || error.message);
      } else {
        resolve(stdout || stderr);
      }
    });
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
