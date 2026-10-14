/*
 * main.js — NEXUS 桌面版 Electron 主程式
 * 負責建立應用視窗、載入 app/index.html（本機完全離線運作），
 * 並支援「以此打開／Open With」：可直接開啟本機檔案並在儲存時覆蓋原檔。
 */
const { app, BrowserWindow, Menu, shell, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

/* 允許作為開啟方式的副檔名（與桌面版 app 支援的匯入類型一致） */
const OPEN_EXT = /\.(json|noteapp|txt|md|markdown|pdf|png|jpe?g|webp)$/i;

let mainWindow = null;
/* app 尚未就緒、或 renderer 尚未 notifyReady 時，先把路徑排隊，
   否則 webContents.send 會在監聽器掛上之前就把訊息丟掉 → 檔案開不出來。
   （macOS 的 open-file 可能在視窗已建立但 renderer 還沒 ready 時就抵達） */
let pendingOpenFiles = [];
let rendererReady = false;

function focusAndRoute(filePath) {
  if (!filePath) return;
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    if (rendererReady) {
      mainWindow.webContents.send('nexus:open-file', { path: filePath });
    } else {
      pendingOpenFiles.push(filePath);
    }
  } else {
    pendingOpenFiles.push(filePath);
  }
}

function flushPending(win) {
  if (!rendererReady || !win || win.isDestroyed()) return;
  const queue = pendingOpenFiles;
  pendingOpenFiles = [];
  for (const p of queue) win.webContents.send('nexus:open-file', { path: p });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: 'NEXUS',
    backgroundColor: '#f8f9fa',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow = win;
  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, 'app', 'index.html'));

  /* 渲染進程就緒後，把排隊中的開啟檔案全部送過去 */
  ipcMain.on('nexus:renderer-ready', () => {
    rendererReady = true;
    flushPending(win);
  });

  /* 重新載入頁面（Cmd+R）時 renderer 的監聽器會消失，退回未就緒，
     等它再次 notifyReady 才繼續送，避免訊息落在半路上遺失 */
  win.webContents.on('did-start-loading', () => { rendererReady = false; });

  /* 外部連結改用系統瀏覽器開啟，不在 App 內開新視窗 */
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

/* macOS：以「以此打開」啟動時，在 app 啟動前就會觸發 open-file */
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (OPEN_EXT.test(filePath)) focusAndRoute(filePath);
});

/* 單一實例：避免開多個視窗；第二次啟動時把檔案路徑轉交給已開啟的視窗 */
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    /* Windows / Linux 透過命令列參數傳入檔案 */
    const file = argv.find((a) => OPEN_EXT.test(a));
    focusAndRoute(file);
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null); /* App 已有自己的 UI，隱藏預設選單 */

    /* Windows / Linux：以命令列參數啟動時直接開啟第一個檔案 */
    const argFile = process.argv.find((a) => OPEN_EXT.test(a));
    createWindow();
    if (argFile) focusAndRoute(argFile);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

/* ===== IPC：以真實路徑讀寫本機檔（儲存即覆蓋原檔） ===== */
ipcMain.handle('nexus:read', async (_e, p) => {
  try {
    const buf = fs.readFileSync(p);
    const name = path.basename(p);
    const ext = (path.extname(p).toLowerCase() || '').replace('.', '');
    const textExt = /^(json|noteapp|txt|md|markdown)$/.test(ext);
    if (textExt) return { ok: true, name, ext, text: buf.toString('utf8') };
    /* 二進位（pdf / 圖片）以 base64 傳回，前端自行組成 Blob */
    return { ok: true, name, ext, base64: buf.toString('base64') };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
});

ipcMain.handle('nexus:write', async (_e, { path: p, content }) => {
  try {
    fs.writeFileSync(p, content, 'utf8');
    return { ok: true, name: path.basename(p) };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
});

ipcMain.handle('nexus:pick-open', async () => {
  const r = await dialog.showOpenDialog(mainWindow, {
    title: '選擇要開啟的檔案',
    properties: ['openFile'],
    filters: [
      { name: 'NEXUS 筆記檔 (.json / .noteapp)', extensions: ['json', 'noteapp'] },
      { name: 'PDF / 文字 / 圖片', extensions: ['pdf', 'txt', 'md', 'markdown', 'png', 'jpg', 'jpeg', 'webp'] },
      { name: '所有檔案', extensions: ['*'] },
    ],
  });
  if (r.canceled || !r.filePaths.length) return null;
  return r.filePaths[0];
});

ipcMain.handle('nexus:pick-save', async (_e, defaultName) => {
  const r = await dialog.showSaveDialog(mainWindow, {
    title: '儲存到本機檔案',
    defaultPath: defaultName || 'note.json',
    filters: [
      { name: 'NEXUS 筆記檔 (.json)', extensions: ['json'] },
      { name: 'NEXUS 筆記檔 (.noteapp)', extensions: ['noteapp'] },
    ],
  });
  if (r.canceled || !r.filePath) return null;
  return r.filePath;
});

