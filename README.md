# NEXUS — 筆記應用

> 📖 **要發佈新版（dmg / APK / GitHub Release）？先讀 [`必讀-發佈流程.md`](必讀-發佈流程.md)。**

單一 HTML 檔的離線記事 App（文字 / 表格 / 圖表 / 手繪），並提供 Android WebView APK。

## 功能

- **多筆記 / 多頁**：主頁卡片管理筆記，編輯頁可新增、刪除、調整頁面邊距。
- **元素工具**：文字框、表格（可拖曳格線調尺寸）、經濟圖表、自繪圖表、**圖片（PNG / JPG，可多選插入）**。
- **自繪圖表**：只給 XY 軸，自行加直線 / 曲線 / 扭曲點、拉箭頭、標交點；線條顏色與畫筆共用同一套 **HSV 調色盤**（色譜 + 色相 + 常用色票 + 吸色）。
- **畫筆 / 螢光筆 / 橡皮擦**，透明度與粗細可調。
- **匯出**：JSON（可再匯入）、獨立 HTML、純文字、每頁 PNG、列印 / 存 PDF。
- **介面**：繁體中文 / 简体中文 / English 三語切換；深色模式（主頁有流星背景動畫）；響應式（手機版隱藏側欄與屬性欄、頂列單行橫向捲動、雙指縮放）。
- **元素編輯列**：選取元素時顯示在工具列下方獨立一列（不遮擋原工具列、不浮在文件上），可水平捲動。
- **縮放**：Ctrl/⌘＋滾輪／觸控板捏合（已降低靈敏度）、右下浮動縮放列、適合頁寬。

## 直接使用

用瀏覽器開啟 `note-app.html` 即可，無需伺服器（資料存於 localStorage）。

## Android App

`NEXUS.apk` 為已簽署的 WebView 封裝（`com.nexus.notes`，minSdk 24 / targetSdk 35），
內嵌 `note-app.html` 離線執行。直接安裝即可。

### 自行建置 APK

需要 JDK 17 與 Android SDK（build-tools + platform 35）。純命令列建置，不使用 Gradle：

```bash
export ANDROID_HOME=/path/to/android-sdk
export JAVA_HOME=/path/to/jdk17
cp note-app.html android/assets/note-app.html   # 更新內嵌版本
cd android && ./build.sh                         # 產出 NEXUS.apk
```

建置流程：`aapt2 compile/link` → `javac` → `d8` → 打包 dex → `zipalign` → `apksigner`。

> **簽名金鑰務必保留**：金鑰庫放在 `android/debug.keystore`（已 gitignore，不進版控）。
> 若遺失後重新產生，憑證會與已發布版本不同，用戶手機將**無法覆蓋安裝**
> （`INSTALL_FAILED_UPDATE_INCOMPATIBLE`，症狀是安裝時顯示「無法安裝」）。
> `android/release-cert.sha256` 記錄正確的憑證 SHA-256，`build.sh` 比對不符會直接中止建置。
> 萬一必須換金鑰，需先請用戶解除安裝舊版（一次性動作）。

## 測試

以 Chrome DevTools Protocol 進行 end-to-end 冒煙測試（需已安裝 Google Chrome）：

```bash
node smoke-test.js          # 核心 / 表格
node smoke-test-extras.js   # 上載 / 匯入
node smoke-test-i18n.js     # 三語
node smoke-test-zoom.js     # 縮放列
node smoke-test-arrows.js   # 箭頭 / 品牌
node smoke-test-ui.js       # 編輯列 / 手機版 / pinch
node smoke-test-v2.js       # 線條調色盤 / 頂列排版 / 側欄磨砂 / 縮放下拉
```

## 開發歷程（近期）

- **元素編輯列改為獨立一列**：原本塞在頂部工具列同一列，會蓋住／擠掉原本的工具按鈕（螢光筆鍵被裁掉）、外框還帶著卡片陰影看起來像多一層圖層。現在改成選取元素時在工具列下方單獨一整條（滿寬、可水平捲動、無框無陰影），並且不會再浮在文件上遮擋內容。
- **修掉工具列上的「白邊」**：`.tbPane` 的 `overflow` 會把 hover 光效與 `data-tip` 提示平整裁掉；桌機版改為 `overflow:visible`（單一面板最寬 593px < 最小桌機可視寬 745px，不會溢位），窄螢幕才在 media query 內捲動。`.zoomgrp` 的 `overflow:hidden` 一併移除。
- **修掉按鈕提示看不到**：`#topbar` 原本有 `0 10px 26px` 向下投影，會畫到工具列上造成「工具列上半部一片同色色塊」。改成 `#tbPanel` z-index 回 55、`#topbar` 移除向下投影；工具列內的 `tip-u`（朝上）提示統一改為朝下，避免被 topbar 蓋住。
- **觸控板縮放靈敏度調低**：`wheel` 的 ctrl/meta 分支改成累積到門檻（25）才跳一級；滑鼠滾輪一格仍等於一級。
- **插入頁新增「插入圖片」**：PNG / JPG，可多選，沿用既有的 `importImage()`（等比縮放、置中、自動選取並登錄到「上載的檔案」）。
- **深色模式主頁流星動畫**：8 顆流星以不同週期／相位循環划過，僅 `html[data-theme=dark]` 顯示，`prefers-reduced-motion` 時自動靜止。
- 線條顏色改用與畫筆一致的自訂調色盤（HSV 色譜 + 色票 + 吸色），移除原生 color input。
- 編輯頁頂列文字放大（標籤 12.5px、按鈕 14px）並固定標籤寬度，切換語言不再位移。
- 左側「我的筆記」卡片改為圓角 + 灰白磨砂漸變質感（含深色模式）。
- 修正縮放比例下拉：非預設縮放值時動態選項會空白，現改為顯示百分比並自動去重。