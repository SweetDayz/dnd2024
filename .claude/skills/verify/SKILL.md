---
name: verify
description: 驗收目前的專案狀態：build、測試、lint，並用無頭 Chrome 以 file:// 開啟 dist/index.html 檢查主控台錯誤。每個子任務完成後、或使用者說「驗收」「/verify」時使用。
---

# /verify：驗收

依序執行，任一步失敗就先嘗試修正，修好後從頭再跑一次。

## 1. 靜態檢查

```
npm run lint
npm test -- --run
```

## 2. 建置

```
npm run build
```

建置完檢查：
- `dist/index.html` 存在，而且 app 的 JS 與 CSS 已 inline（不應該有指向 `assets/*.js` 的 `<script type="module" src=...>`）。
- `dist/data/` 底下的資料檔都是 classic script（以 `window.__DND__.register(` 開頭）。
- 程式碼中**沒有**對資料使用 `fetch(` 或動態 `import(`：用 grep 檢查 `src/`。

## 3. file:// 實測

執行 `npm run check:file`（由 M0-4 建立的腳本，使用 Playwright 的 Chromium 以 `file://` 開啟 `dist/index.html`），確認：
- 主控台沒有 error，也沒有未處理的 promise rejection。
- 頁面上預期的元素有出現（腳本裡的 smoke check）。

如果 `check:file` 還不存在（M0-4 尚未完成），就跳過這步，並提醒使用者手動雙擊 `dist/index.html` 確認。

## 4. 回報

一行一項列出結果，例如：

```
lint ✅  test ✅ (42 passed)  build ✅ (index.html 812 KB, data 6.3 MB)  file:// ✅ 0 errors
```

有失敗就附上關鍵錯誤訊息（不要貼整段 log）和你的修正方式。
