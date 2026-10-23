# 交接文件（給下一個 Claude Code session）

> 寫於 2026-10-23。先讀 `CLAUDE.md`，再讀這份，最後依需要讀 `docs/data-notes.md`（資料發現、待決事項）與 `docs/tasks/M3.md`。

## 1. 目前狀態

- M0、M1、M2（M2a–M2e）全部完成並已 push，最後一個 commit：`6dc45fc fix(M2): 依使用者決定調整…`。
- 驗收：lint 0、Vitest 108 passed、build 通過、`npm run check:file` 0 errors（file:// 下從零建立 20 級基準角色並對照 DDB 數值、匯出再匯入完全相同）。
- **M3（匯出 xlsx）已完成**（2026-10-23）：ExcelJS 以 `dist/vendor/exceljs.min.js` 按需載入；`src/export/`（sheetData.ts 排版、xlsx.ts 寫檔、vendor.ts 載入）；角卡頂部「匯出試算表」。M3 完成標準 2（上傳 Google 試算表檢查）由使用者手動做。
- **M3 暫緩**（輸出品質不足，審卡改由 M6）；匯出鈕保留為灰色「匯出試算表（TODO）」。
- **M4 完成**（2026-10-23，`/auto M4`）：來源顯示縮寫（`src/data/sourceDisplay.ts`）、通用重印規則（`src/data/visibility.ts`、`RulesData.selectable`／`supersededBy`、`Build.legacyPicks`）、共用選單搜尋修正、屬性總覽（`src/rules/abilityBreakdown.ts`、`AbilityOverview.vue`）、資料稽核（`scripts/audit-data.ts` → `docs/data-audit.md`）與語言修正、角卡版面與技能區（`src/data/skillOrder.ts`）。Vitest 161 passed、`check:file` 0 errors。
- **下一步：M5（法術選擇重新設計）或 M6（審卡報告）**，兩者都以 M4 為前置；之後實作 data-notes §13 的 (a)+(b) 混合方案。
- 使用者偏好（auto-memory 已有）：`/verify` 通過並 commit 後可直接 `git push`，不用問；force push／改歷史仍要問。

## 2. 新環境啟動

```
npm install
npm run fetch-data      # 抓上游 5etools-cn cn2.0 → raw/（不進 git）
npm run build-data      # raw/ → public/data/*.js（不進 git），會印 50 筆龍裔 _versions 警告，正常
npm run build
npm run check:file
```

## 3. 架構速查

```
scripts/lib/pipeline.ts, copy.ts   建置管線（_copy/_mod、_versions→versions、白名單、重印、TCE 旗標）
src/rules/                         純 TS 規則引擎（不 import Vue），全部有 Vitest
  character.ts   存檔格式（只存選擇；schemaVersion 1；匯出匯入）
  data.ts        RulesData 介面、技能／工具／語言鍵與標籤、法術篩選（有 WeakMap 快取）
  build.ts       核心：走職業（逐級）→背景→種族→基礎語言→職業法術→起始裝備→重複熟練→專精→先決條件，
                 產生 ChoiceSlot（選擇欄位，key 穩定，以條目 id 開頭）與 grants
  derive.ts      數值；手動覆寫分輸入層（ability:*、profBonus，會連動）與結果層（save:*、skill:*、ac、hpMax…）
  multiclass.ts  兼職條件、施法者等級、法術位、契約魔法
  spells.ts      職業法術數量、法術書、子職法術清單（從 {@filter class=} 讀）、法術列
  equipment.ts   起始裝備、重量負重、AC、攻擊列
  effects.ts     效果自動偵測（關鍵字＋標籤，推斷欄位）
  sheetExtras.ts 個性懶人表、身高體重擲骰
src/composables/useCharacterBuild.ts  全站共用一組 computed（WeakMap by store + effectScope）
src/stores/character.ts               角色清單、localStorage、匯出匯入
src/views/BuilderView.vue + builder/  建角精靈 11 步（steps.ts 定義）
src/views/SheetView.vue + components/sheet/  角卡（7 分頁）
src/rules/__tests__/benchmark.ts      用程式建立基準角色（choose() 每選一次就重 build）；realData.ts 讀 public/data
scripts/check-file.mjs                file:// 端對端驗收（builderSmoke → sheetSmoke）
```

## 4. 踩過的坑（照做可省時間）

- **Bash heredoc**：內容含某些字元組合時 bash 會報 `unexpected EOF while looking for matching '`。寫 .vue／多行檔案一律用 Write 工具。
- **用 Python 改檔**：`str.replace` 前先 `assert old in s`。正規式字串用 raw string。Windows 上 Python 會寫出 CRLF，repo 是 `core.autocrlf=true`，commit 時自動轉 LF，可忽略警告。
- **TS lib 沒有 `Array.prototype.at`**：用 `arr[arr.length - 1]!`。
- **`noUncheckedIndexedAccess` 開啟**：索引存取要 `!` 或預設值。
- **Vue scoped style 會套到子元件根元素**：例如 `.stat span` 會縮小子元件根 `<span>`，要寫 `.stat > span`。
- **prop 不能叫 `computed`、`slot`**（oxlint no-dupe-keys／Vue 保留字）。
- **`src/rules/__tests__/` 裡不能留沒有 expect 的 spec**（oxlint expect-expect）。臨時匯出角色 JSON 的輔助 spec 範本在 `.cache/zz-export.spec.ts.txt`，用完就刪。
- 截圖檢查：`.cache/shot.mjs`（從空角色）、`.cache/shot2.mjs <view> <step> <name> [clicks...]`（從 `.cache/bench.json` 注入 localStorage）。`.cache/` 不進 git。
- raw/ 的 JSON 很大，禁止整檔 Read；用 scratchpad 下的 node 小腳本抽樣（`load.cjs` 模式：假 `window.__DND__.register` 再 eval public/data/*.js）。

## 5. 待決事項（等使用者回答）

見 `docs/data-notes.md` §13：**只有原文、沒有結構化欄位的數值效果**（無甲防禦、警覺先攻、健壯 HP…）。使用者要「新人一來就什麼都算對」，但 CLAUDE.md §6 禁止人工對照表。選項：(a) 從原文自動解析數值句型；(b) 允許少量人工規則。**不要自行決定**。

## 6. 已知限制／技術債（M2 範圍內未做或簡化）

- TCE 可選職業特性只做成「採用」開關（新增），沒有處理「取代原特性」。
- 魔契師祕法奧秘（Mystic Arcanum）、法術精通、招牌法術、傳奇恩惠的實際效果：只列特性與選擇欄位，不計算。
- 專精推斷是啟發式（`inferExpertiseCount`）；知識領域「選兩個技能獲得熟練」沒有自動化。
- 武器篩選型熟練（武僧、遊蕩者的「軍用武器（輕型／靈巧）」）以屬性中文名比對，可能有漏。
- `additionalSpells.expanded`（擴充法術表）只記錄，不加入可選清單。
- 起始裝備的 `equipmentType`（任選一件工匠工具等）產生自訂名稱物品，需玩家自行改成具體物品。
- 戰役限定（龍紋等）先決條件只顯示文字，不擋選。
- 效果偵測有已知誤抓（岩侏儒發條裝置的 AC 5 會推斷到 AC 欄位），見 data-notes §12c。
- 物品欄沒有「同調」欄位（M3 的物品表需要，M3.md 已註記）。

## 7. 下一步

使用者下指令後才開始 M3（`docs/tasks/M3.md`）：
- M3-1 要安裝新套件（ExcelJS 或 SheetJS；SheetJS 要從 cdn.sheetjs.com tarball 安裝），任務檔已授權，但仍要在 data-notes 寫比較。
- 「關於」工作表要上游 commit hash：在 `raw/VERSION`，需要讓 build-data 把它寫進 `sources.js` 之類的輸出。
- 物品表的「同調」需先擴充 `InventoryItem`（加欄位不必升 schemaVersion，`migrate()` 會補預設值）。
- 基準角色一律 20 級（法術 DC 17）。
