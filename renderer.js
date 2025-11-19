let editor = null;
const tabs = [];
let activeTabId = null;

function getLangFromPath(p) {
  const ext = (p || "").split(".").pop().toLowerCase();
  const map = {
    js: "javascript",
    ts: "typescript",
    json: "json",
    html: "html",
    css: "css",
    md: "markdown",
  };
  return map[ext] || "plaintext";
}

function renderTabs() {
  const container = document.getElementById("tabs");
  container.innerHTML = "";
  tabs.forEach((t) => {
    const el = document.createElement("div");
    el.className = "tab" + (t.id === activeTabId ? " active" : "");
    el.textContent = t.name + (t.isDirty ? "*" : "");
    el.addEventListener("click", () => setActiveTab(t.id));
    const close = document.createElement("span");
    close.className = "close";
    close.textContent = "✕";
    close.addEventListener("click", (e) => {
      e.stopPropagation();
      closeTab(t.id);
    });
    el.appendChild(close);
    container.appendChild(el);
  });
}

function setActiveTab(id) {
  const tab = tabs.find((t) => t.id === id);
  if (!tab) return;
  activeTabId = id;
  editor.setModel(tab.model);
  document.getElementById("filePath").textContent = tab.filePath || "(untitled)";
  renderTabs();
}

function closeTab(id) {
  const idx = tabs.findIndex((t) => t.id === id);
  if (idx === -1) return;
  const tab = tabs[idx];
  if (tab.isDirty && !confirm("Discard unsaved changes?")) return;
  // dispose model
  if (tab.model) tab.model.dispose();
  tabs.splice(idx, 1);
  if (activeTabId === id) {
    if (tabs.length) setActiveTab(tabs[0].id);
    else {
      activeTabId = null;
      editor.setModel(null);
      document.getElementById("filePath").textContent = "(untitled)";
    }
  }
  renderTabs();
}

function createTab({ filePath, name, content }) {
  const id = Date.now() + Math.random();
  const language = getLangFromPath(filePath || name);
  const uri = filePath
    ? monaco.Uri.file(filePath)
    : monaco.Uri.parse("inmemory:///" + name + id + "." + language);
  const model = monaco.editor.createModel(content || "", language, uri);
  const tab = {
    id,
    filePath,
    name: name || (filePath ? requireName(filePath) : "untitled"),
    content,
    model,
    isDirty: false,
  };
  model.onDidChangeContent(() => {
    tab.isDirty = true;
    renderTabs();
  });
  tabs.push(tab);
  renderTabs();
  setActiveTab(id);
}

function requireName(fp) {
  return fp.split(/[\\/]/).pop();
}

require.config({ paths: { vs: "https://unpkg.com/monaco-editor@0.34.1/min/vs" } });
require(["vs/editor/editor.main"], function () {
  editor = monaco.editor.create(document.getElementById("editor"), {
    value: ["// Welcome to your Electron editor", ""].join("\n"),
    language: "javascript",
    theme: "vs-dark",
    automaticLayout: true,
  });

  // create initial untitled tab
  createTab({ name: "untitled", content: "" });
});

async function openFileDialog() {
  const res = await window.electronAPI.openFile();
  if (res && !res.canceled) {
    createTab({
      filePath: res.filePath,
      name: res.filePath.split(/[\\/]/).pop(),
      content: res.content,
    });
  }
}

async function openFilePath(filePath) {
  const res = await window.electronAPI.readFile(filePath);
  if (res && res.ok) {
    createTab({ filePath, name: filePath.split(/[\\/]/).pop(), content: res.content });
  } else {
    alert("Failed to read file: " + (res && res.error));
  }
}

window.addEventListener("DOMContentLoaded", () => {
  document.getElementById("newBtn").addEventListener("click", () => {
    createTab({ name: "untitled", content: "" });
  });

  document.getElementById("openBtn").addEventListener("click", async () => {
    openFileDialog();
  });

  document.getElementById("openFolderBtn").addEventListener("click", async () => {
    const res = await window.electronAPI.openFolder();
    if (res && !res.canceled) {
      // set root folder and render root node
      const rootPath = res.folder;
      renderRootFolder(rootPath);
    }
  });

  document.getElementById("saveBtn").addEventListener("click", async () => {
    const tab = tabs.find((t) => t.id === activeTabId);
    if (!tab) return;
    const content = tab.model.getValue();
    if (tab.filePath) {
      const w = await window.electronAPI.writeFile({ filePath: tab.filePath, content });
      if (w && w.ok) {
        tab.isDirty = false;
        renderTabs();
      } else alert("Save failed: " + (w && w.error));
    } else {
      const saveRes = await window.electronAPI.saveFile({ filePath: null, content });
      if (saveRes && !saveRes.canceled) {
        tab.filePath = saveRes.filePath;
        tab.name = tab.filePath.split(/[\\/]/).pop();
        tab.isDirty = false;
        renderTabs();
        document.getElementById("filePath").textContent = tab.filePath;
      }
    }
  });

  document.getElementById("saveAsBtn").addEventListener("click", async () => {
    const tab = tabs.find((t) => t.id === activeTabId);
    if (!tab) return;
    const content = tab.model.getValue();
    const res = await window.electronAPI.saveAs(content);
    if (res && !res.canceled) {
      tab.filePath = res.filePath;
      tab.name = tab.filePath.split(/[\\/]/).pop();
      tab.isDirty = false;
      renderTabs();
      document.getElementById("filePath").textContent = tab.filePath;
    }
  });
});

function buildFileTree(folder, entries) {
  const tree = document.getElementById("fileTree");
  tree.innerHTML = "";
  // Deprecated: use recursive lazy-rendering functions below
}

function renderRootFolder(rootPath) {
  const tree = document.getElementById("fileTree");
  tree.innerHTML = "";
  const rootNode = createTreeNode(
    { name: rootPath, path: rootPath, isDirectory: true },
    0
  );
  tree.appendChild(rootNode);
}

function createTreeNode(entry, depth) {
  const wrapper = document.createElement("div");
  // wrapper.className = "tree-node";
  wrapper.style.paddingLeft = 6 + depth * 12 + "px";

  const label = document.createElement("span");
  label.className = "file";
  if (entry.isDirectory) label.classList.add("directory");
  label.textContent = entry.name;
  label.title = entry.path;

  wrapper.appendChild(label);

  if (entry.isDirectory) {
    if (entry.isDirectory) wrapper.classList.add("directory");
    const caret = document.createElement("span");
    caret.className = "caret";
    caret.innerHTML = `<img src="./assets/image.png" width="80%" alt="" />`;
    wrapper.insertBefore(caret, label);

    const childrenContainer = document.createElement("div");
    childrenContainer.className = "children";
    childrenContainer.style.display = "none";
    wrapper.appendChild(childrenContainer);

    let loaded = false;
    const toggle = async () => {
      if (!loaded) {
        const res = await window.electronAPI.readDir(entry.path);
        if (res && res.ok) {
          res.entries.forEach((child) => {
            const node = createTreeNode(child, depth + 1);
            childrenContainer.appendChild(node);
          });
        }
        loaded = true;
      }
      const opened = childrenContainer.style.display === "block";
      childrenContainer.style.display = opened ? "none" : "block";
      caret.innerHTML = opened ?`<img src="./assets/image.png" width="80%" alt="" />`: `<img src="./assets/image.png" width="80%" alt="" />`;
      // reflect open state for CSS (caret rotation, etc.)
      wrapper.classList.toggle("open", !opened);
    };

    // click on caret toggles, click on label toggles folder expansion
    caret.addEventListener("click", (e) => {
      e.stopPropagation();
      toggle();
    });
    label.addEventListener("click", (e) => {
      e.stopPropagation();
      toggle();
    });
  } else {
    label.addEventListener("click", () => openFilePath(entry.path));
  }

  return wrapper;
}

// Attach terminal control buttons (script is loaded at end of body, so DOM elements exist)
const termToggleBtn = document.getElementById("terminalToggle");
const newTermBtn = document.getElementById("newTerminalBtn");
if (termToggleBtn) termToggleBtn.addEventListener("click", () => toggleTerminal());
if (newTermBtn)
  newTermBtn.addEventListener("click", () => {
    const panel = document.getElementById("terminal-panel");
    if (panel) panel.classList.remove("hidden");
    createTerminal(true);
  });

// Terminal toolbar extra features
const termClearBtn = document.getElementById("terminalClearBtn");
const termCopyBtn = document.getElementById("terminalCopyBtn");
const termRunBtn = document.getElementById("terminalRunBtn");
const termInput = document.getElementById("terminalInput");
if (termClearBtn)
  termClearBtn.addEventListener("click", () => {
    if (term && typeof term.clear === "function") term.clear();
  });
if (termCopyBtn)
  termCopyBtn.addEventListener("click", async () => {
    if (term && typeof term.getSelection === "function") {
      const sel = term.getSelection();
      if (sel && sel.length) await navigator.clipboard.writeText(sel);
      else {
        // fallback: copy entire terminal container text
        const cont = document.getElementById("terminal-container");
        if (cont) await navigator.clipboard.writeText(cont.innerText || "");
      }
    }
  });
if (termRunBtn)
  termRunBtn.addEventListener("click", async () => {
    if (!term) await createTerminal();
    const val = termInput ? termInput.value : "";
    if (val && terminalId) {
      window.terminalAPI.write(terminalId, val + "\r");
      if (termInput) termInput.value = "";
    }
  });

// Keyboard shortcut: Ctrl+` toggles terminal (and Cmd+` on mac)
window.addEventListener("keydown", (e) => {
  const isBacktick = e.key === "`" || e.code === "Backquote";
  if (isBacktick && (e.ctrlKey || e.metaKey)) {
    toggleTerminal();
    e.preventDefault();
  }
});

// --- Terminal integration (xterm + PTY) ---
let term = null;
let fitAddon = null;
let terminalId = null;
let resizeTimer = null;

function toggleTerminal() {
  const panel = document.getElementById("terminal-panel");
  if (!panel) return;
  panel.classList.toggle("hidden");
  if (!panel.classList.contains("hidden")) {
    if (!term) createTerminal();
    setTimeout(() => {
      if (fitAddon) fitAddon.fit();
    }, 120);
  }
}

async function createTerminal(killExisting = false) {
  const container = document.getElementById("terminal-container");
  if (!container) return;
  if (killExisting && terminalId) {
    try {
      await window.terminalAPI.kill(terminalId);
    } catch (e) {}
    if (term) {
      try {
        term.dispose();
      } catch (e) {}
    }
    term = null;
    terminalId = null;
  }
  if (term) return; // already created

  container.innerHTML = "";

  // estimate cols/rows roughly (will be fit precisely by fitAddon)
  const cols = Math.max(40, Math.floor(container.clientWidth / 9));
  const rows = Math.max(10, Math.floor(container.clientHeight / 18));

  const res = await window.terminalAPI.create({ cols, rows });
  if (!res || !res.ok) {
    const status = document.getElementById("terminalStatus");
    if (status) status.textContent = "Terminal error: " + (res && res.error);
    return;
  }
  terminalId = res.id;
  // show whether we have real PTY support or fallback
  const statusEl = document.getElementById("terminalStatus");
  if (statusEl) {
    if (res.pty === true) statusEl.textContent = "PTY: native";
    else if (res.fallback) statusEl.textContent = "PTY: fallback";
    else statusEl.textContent = "PTY: unknown";
  }

  // detect xterm.js and fit addon (loaded from CDN in index.html)
  const TerminalCtor = window.Terminal || window.XTerm || window.TerminalJs;
  const FitCtor =
    window.FitAddon || (window.FitAddon && window.FitAddon.FitAddon) || window.FitAddon;
  if (!TerminalCtor) {
    const status = document.getElementById("terminalStatus");
    if (status) status.textContent = "xterm.js not loaded (check CDN/network)";
    const panel = document.getElementById("terminal-panel");
    if (panel) panel.classList.remove("hidden");
    return;
  }

  term = new TerminalCtor({ cursorBlink: true, fontFamily: "monospace" });
  if (typeof FitCtor === "function") {
    try {
      fitAddon = new FitCtor();
      if (typeof term.loadAddon === "function") term.loadAddon(fitAddon);
    } catch (e) {
      fitAddon = null;
    }
  }
  term.open(container);
  if (fitAddon) fitAddon.fit();

  term.onData((data) => {
    if (terminalId) window.terminalAPI.write(terminalId, data);
  });

  window.terminalAPI.onData(({ id, data }) => {
    if (id === terminalId && term) term.write(data);
  });

  window.terminalAPI.onExit(({ id, exitCode }) => {
    if (id === terminalId && term)
      term.write("\r\n[process exited " + exitCode + "]\r\n");
  });

  const status = document.getElementById("terminalStatus");
  if (status) status.textContent = terminalId;

  // after opening, fit and notify backend of the terminal size
  setTimeout(() => {
    try {
      if (fitAddon && term) {
        fitAddon.fit();
        if (terminalId) window.terminalAPI.resize(terminalId, term.cols, term.rows);
      }
    } catch (e) {}
  }, 120);

  window.addEventListener("resize", () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      try {
        if (fitAddon && term) {
          fitAddon.fit();
          window.terminalAPI.resize(terminalId, term.cols, term.rows);
        }
      } catch (e) {}
    }, 150);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("terminalForm");
  const input = document.getElementById("terminalInput");

  if (!form) {
    console.error("terminalForm not found — check your HTML ID");
    return;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const cmd = input.value.trim();
    if (!cmd) return;

    console.log("Sending command to backend:", cmd);

    const output = await window.terminalAPI.sendCommand(cmd);
    console.log(output);

    document.getElementById("terminal-container").innerText = output.trim();

    input.value = "";
  });
});
