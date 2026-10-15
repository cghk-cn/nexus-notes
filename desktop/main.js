/*
 * main.js — NEXUS 桌面版 Electron 主程式
 * 負責建立應用視窗、載入 app/index.html（本機完全離線運作），
 * 並支援「以此打開／Open With」：可直接開啟本機檔案並在儲存時覆蓋原檔。
 */
const { app, BrowserWindow, Menu, shell, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');

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
      /* 背景（視窗被遮蔽）不節流：否則 html2canvas/pdf.js 的排程被凍，
         一次「儲存」會從 4 秒變 3 分鐘（實測），使用者會以為當掉 */
      backgroundThrottling: false,
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

ipcMain.handle('nexus:write-binary', async (_e, { path: p, base64 }) => {
  try {
    /* 寫入二進位（例如把註記燒回 PDF）。先寫同目錄的暫存檔再原子改名，
       避免中途失敗把原本可以開的 PDF 截斷。 */
    const buf = Buffer.from(base64 || '', 'base64');
    const tmp = p + '.nexus-tmp';
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, p);
    return { ok: true, name: path.basename(p), size: buf.length };
  } catch (e) {
    try { fs.unlinkSync(p + '.nexus-tmp'); } catch (_) {}
    return { ok: false, error: String((e && e.message) || e) };
  }
});

ipcMain.handle('nexus:delete', async (_e, { path: p }) => {
  try {
    /* 刪除本機檔（用於清掉 1.2.5 遺留的 .noteapp.json sidecar） */
    fs.unlinkSync(p);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
});

/* 下載檔案到「下載」資料夾（穩定檔名→重複更新即覆寫舊檔）。
   GitHub 資產URL會 302 導向 objects.githubusercontent.com，這裡手動跟隨。 */
ipcMain.handle('nexus:download', async (_e, { url, name }) => {
  const dest = path.join(app.getPath('downloads'), path.basename(name || 'download.bin'));
  const file = fs.createWriteStream(dest);
  try {
    await new Promise((resolve, reject) => {
      const get = (u, redirects) => {
        if (redirects > 6) return reject(new Error('too many redirects'));
        https.get(u, res => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume();
            return get(res.headers.location, redirects + 1);
          }
          if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode));
          res.on('error', reject);
          res.pipe(file);
          file.on('finish', () => file.close(() => resolve()));
        }).on('error', err => { try { file.close(); } catch (_) {} reject(err); });
      };
      get(url, 0);
    });
    return { ok: true, path: dest, size: fs.statSync(dest).size };
  } catch (e) {
    try { file.close(); } catch (_) {}
    return { ok: false, error: String((e && e.message) || e) };
  }
});

/* 在檔案總管/Finder 顯示指定檔 */
ipcMain.handle('nexus:reveal', async (_e, { path: p }) => {
  try { shell.showItemInFolder(p); return { ok: true }; }
  catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
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

