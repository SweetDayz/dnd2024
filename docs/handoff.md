# 交接文件（給下一個 Claude Code session）

> 寫於 2026-10-23。先讀 `CLAUDE.md`，再讀這份，最後依需要讀 `docs/data-notes.md`（資料發現、待決事項）與 `docs/tasks/M3.md`。

## 1. 目前狀態

- M0、M1、M2（M2a–M2e）、M4、M5、M6、M7 完成並已 push。
- **M3 暫緩**（xlsx 輸出品質不足，審卡改由 M6；匯出鈕保留為灰色「匯出試算表（TODO）」）。
- M4：來源顯示縮寫（`src/data/sourceDisplay.ts`）、通用重印規則（`src/data/visibility.ts`）、屬性總覽、資料稽核（`docs/data-audit.md`）、技能排序。
- M5：法術選擇畫面（`src/components/spells/`）、建置期法術索引、spellPrefs。
- M6：審卡報告（`src/export/review.ts`、`reviewHtml.ts`），報告內嵌存檔可直接匯入。
- **M7**（2026-10-23，`/auto M7`）：
  - 致謝頁（`src/views/CreditsView.vue`）、全站授權頁尾、審卡報告頁尾，授權文字集中在 `src/data/credits.ts`。
  - 一般物品判斷 `src/data/items.ts` `isMundaneItem`（`rarity === 'none'`），工具熟練等選項不再混入魔法物品；`ChoiceSlot.stale` 記錄失效的舊選擇並列入審卡警示。
  - 兼職入口改為「升級」步驟的職業清單（反灰顯示原因）；第二驗收角色法師 3／牧師 2（`src/rules/__tests__/multiclass.spec.ts`、`check:file` 的 `multiclassSmoke`）。
  - 錢幣計入總重、XPHB 載重門檻與負重條、超重速度至多 5 呎（`Sheet.speedNotes`）。
  - 通用表格與篩選：`src/data/facetFilter.ts`、`components/filter/FacetFilterPanel.vue`、`components/table/SortableTable.vue`、`stores/tablePrefs.ts`；語言表（`src/data/languageTable.ts`、`components/languages/`）與物品表（`src/data/itemTable.ts`、`components/items/ItemTables.vue`）。
  - 驗收：Vitest 235 passed、lint 0、build 通過、`check:file` 0 errors。
- **M8-1**（2026-10-23）：不可重複的專長（`build.ts` `resolveFeatDuplicates`、`ChoiceSlot.conflicts`、審卡警示「重複專長」），屬性值提升欄位改列全部專長（XPHB 原文）、「特性」先決條件實際檢查。Vitest 240 passed、`check:file` 0 errors（`featRepeatSmoke`）。
- **下一步：M8-2 起（數值效果自動化）等規畫者補任務檔**，現況與建議見 `docs/handoff-planner.md`。
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
scripts/check-file.mjs                file:// 端對端驗收（creditsSmoke → builderSmoke → sheetSmoke（→ reviewSmoke → overloadSmoke）
                                      → interactionSmoke → bardToolSmoke → multiclassSmoke）
src/data/facetFilter.ts               通用三態篩選、排序（法術、語言、物品共用）
src/components/table/SortableTable.vue、filter/FacetFilterPanel.vue  通用表格、篩選面板
```

## 4. 踩過的坑（照做可省時間）

- **Bash heredoc**：內容含某些字元組合時 bash 會報 `unexpected EOF while looking for matching '`。寫 .vue／多行檔案一律用 Write 工具。
- **反斜線會被吃掉**：透過 Bash 工具傳的 heredoc／`node -e`／python 字串裡，`\n`、`\r` 有時會變成真的換行，寫進 .mjs／.ts 後語法錯誤。含反斜線的程式碼一律用 Edit／Write 工具改。
- **用 Python 改檔**：`str.replace` 前先 `assert old in s`。正規式字串用 raw string。Windows 上 Python 會寫出 CRLF，repo 是 `core.autocrlf=true`，commit 時自動轉 LF，可忽略警告。
- **TS lib 沒有 `Array.prototype.at`**：用 `arr[arr.length - 1]!`。
- **`noUncheckedIndexedAccess` 開啟**：索引存取要 `!` 或預設值。
- **Vue scoped style 會套到子元件根元素**：例如 `.stat span` 會縮小子元件根 `<span>`，要寫 `.stat > span`。
- **prop 不能叫 `computed`、`slot`**（oxlint no-dupe-keys／Vue 保留字）。
- **`src/rules/__tests__/` 裡不能留沒有 expect 的 spec**（oxlint expect-expect）。臨時匯出角色 JSON 的輔助 spec 範本在 `.cache/zz-export.spec.ts.txt`，用完就刪。
- 截圖檢查：`.cache/shot.mjs`（從空角色）、`.cache/shot2.mjs <view> <step> <name> [clicks...]`（從 `.cache/bench.json` 注入 localStorage）。`.cache/` 不進 git。
- raw/ 的 JSON 很大，禁止整檔 Read；用 scratchpad 下的 node 小腳本抽樣（`load.cjs` 模式：假 `window.__DND__.register` 再 eval public/data/*.js）。

## 5. 待決事項

已過時，改見 `docs/handoff-planner.md` §2 與 `docs/data-notes.md` §13（M7 新增第 8～10 項）。

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

已過時，改見 `docs/handoff-planner.md`（建議的下一批里程碑）。
