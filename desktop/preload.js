/*
 * preload.js — 以 contextBridge 安全地暴露「有限的檔案操作」給渲染進程（note-app.html）。
 * 所有實際的 fs 讀寫都在主進程（main.js）以 ipcMain.handle 完成，
 * 因此即使啟用 sandbox + contextIsolation 也能正常運作。
 * 渲染進程只需偵測 window.nexus 是否存在即可知道自己在桌面版中。
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nexus', {
  /* 平台（'darwin' | 'win32' | 'linux'），供 renderer 判斷是否需 macOS 標題列留白 */
  platform: process.platform,
  isDesktop: true,
  platform: process.platform,

  /* 訂閱「以此打開／Open With」或開機參數送進來的檔案路徑 */
  onOpenFile(cb) {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on('nexus:open-file', handler);
    return () => ipcRenderer.removeListener('nexus:open-file', handler);
  },

  /* 渲染進緒就緒：通知主進程可送出待處理的「開啟檔案」請求 */
  notifyReady() { ipcRenderer.send('nexus:renderer-ready'); },

  /* 依絕對路徑讀檔：文字類回傳 { text }，二進位類回傳 { base64 } */
  readFile(p) { return ipcRenderer.invoke('nexus:read', p); },

  /* 以文字內容覆寫（overwrite）指定路徑的檔案 */
  writeFile(p, content) { return ipcRenderer.invoke('nexus:write', { path: p, content }); },

  /* 以 base64 內容寫入二進位檔（原子覆寫，用於把註記燒回 PDF） */
  writeBinary(p, base64) { return ipcRenderer.invoke('nexus:write-binary', { path: p, base64 }); },

  /* 刪除本機檔（清掉 1.2.5 遺留的 sidecar；不存在時回報 ok:false） */
  deleteFile(p) { return ipcRenderer.invoke('nexus:delete', { path: p }); },

  /* 下載 URL 到「下載」資料夾（穩定檔名→重複更新覆寫舊檔） */
  download(url, name) { return ipcRenderer.invoke('nexus:download', { url, name }); },

  /* 在 Finder/檔案總管顯示指定檔 */
  reveal(p) { return ipcRenderer.invoke('nexus:reveal', { path: p }); },

  /* 原生「開啟舊檔」對話框 → 回傳絕對路徑或 null */
  pickOpen() { return ipcRenderer.invoke('nexus:pick-open'); },

  /* 原生「儲存」對話框 → 回傳絕對路徑或 null */
  pickSave(defaultName) { return ipcRenderer.invoke('nexus:pick-save', defaultName); },
});
