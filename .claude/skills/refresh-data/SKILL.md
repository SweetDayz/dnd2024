---
name: refresh-data
description: 從上游 tjliqy/5etools-cn（cn2.0 分支）重新抓資料並重建 public/data，比對前後差異。使用者說「更新資料」「/refresh-data」時使用。M1-1 與 M1-3 完成後才能用。
argument-hint: "[可選：commit hash 或 tag，省略則用 cn2.0 最新]"
disable-model-invocation: true
---

# /refresh-data：更新上游資料

1. 確認 `scripts/fetch-data.ts` 與 `scripts/build-data.ts` 都已存在；不存在就告訴使用者要先完成 M1-1、M1-3，然後停止。
2. 記下目前 `raw/VERSION` 的 commit hash，以及 `public/data/` 各檔案的條目數量（從 build-data 的輸出或檔案內容統計）。
3. 執行 `npm run fetch-data`（若有給 `$ARGUMENTS`，就傳給腳本當作指定的 commit 或 tag）。
4. 執行 `npm run build-data`。
5. 比對前後：
   - 上游 commit 從哪一版到哪一版。
   - 每類資料的條目數增減。
   - 新出現或消失的 `source` 代碼。
   - 新出現的 `{@tag}` 種類（渲染器可能還不支援）。
   - build-data 的 warning。
6. 執行 `/verify`。
7. 把比對結果附加到 `docs/data-notes.md` 的「資料更新紀錄」區（加上日期），並用一個 commit 提交：`chore(data): update upstream to <short-hash>`。
8. 回報摘要；若有新 source 代碼，提醒使用者決定是否加入 `official` 群組。
