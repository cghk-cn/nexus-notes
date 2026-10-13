# NEXUS 桌面版

把 `../note-app.html`（單一檔案、完全離線的筆記應用）包成可下載安裝的桌面應用程式。
以 **Electron** 打包，之前加入的「開啟本機檔案 → 編輯後覆蓋原檔（File System Access API）」在桌面版一樣可用。

## 目錄結構

```
desktop/
├─ build.js            以 ../note-app.html 產生 app/index.html（把 CDN 改寫成本機 ./vendor/*）
├─ main.js             Electron 主程式（建立視窗、載入 app/index.html）
├─ package.json        依賴與打包設定（electron / electron-builder）
├─ app/                產出的應用檔案（由 build.js 產生，請勿手動編輯）
│  ├─ index.html       由 note-app.html 產生
│  └─ vendor/          pdf.js / html2canvas 本機副本（離線用）
└─ release/            打包輸出（安裝檔）
```

`note-app.html` 是唯一來源：**只改它**，然後 `npm run sync` 重新產生桌面版。

## 安裝與執行（開發）

```bash
cd desktop
npm install          # 安裝 electron / electron-builder
npm start            # 產生 app/index.html 並以 Electron 開啟
```

## 打包成可下載的安裝檔

```bash
npm run dist         # 依目前平台打包（Mac 上預設產出 .dmg / .zip）
# 或指定平台：
npm run dist:mac     # → release/NEXUS-1.0.0.dmg / .zip
npm run dist:win     # → release/NEXUS Setup 1.0.0.exe
npm run dist:linux   # → release/NEXUS-1.0.0.AppImage
```

產出放在 `desktop/release/`。把對應的 `.dmg`（Mac）或 `.exe`（Windows）交給使用者即可下載安裝。

> 注意：跨平台打包建議在目標平台上執行（例如在 Mac 產出 .dmg）。Windows .exe 需在 Windows 機器上執行 `npm run dist:win`。
> 未簽署的 Mac App 首次開啟需在「系統設定 → 隱私與安全性」按「仍要打開」。

## 離線說明

`build.js` 會把 `note-app.html` 中的 CDN 路徑（pdf.js / html2canvas）改寫成 `./vendor/*`，
`app/vendor/` 已內含這些函式庫，因此桌面版**不需連網**即可使用 PDF 檢視/匯入與 PNG 匯出。
