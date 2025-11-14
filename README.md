# Electron Code Editor

Minimal Electron-based code editor using the Monaco editor (via CDN).

Quick start (Windows PowerShell):

```powershell
cd "d:/Editor-code/electron-code-editor"
npm install
npm start
```

Features in this scaffold:
- Monaco editor loaded from CDN
- New / Open / Save / Save As via native dialogs
- Preload + contextBridge for safe IPC

Next steps you may want:
- Add a file explorer and tabs
- Add syntax-specific settings and themes
- Bundle Monaco locally for offline builds
- Add packaging (electron-builder / electron-forge)

