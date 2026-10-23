# 資料調查筆記（data-notes）

> 由 Claude 維護。所有結論都來自實際抽樣 `raw/`（用小腳本統計，不整檔讀取）。
> 上游：`tjliqy/5etools-cn` 分支 `cn2.0`，版本見 `raw/VERSION`（調查時為 `5cc0bbe`，2026-09-30）。

## 1. 檔案配置

`npm run fetch-data` 用 git sparse checkout 只拿 `data/`，複製到 `raw/`（約 113 MB，70 個項目）。

| 類別         | 檔案                                                                    | 陣列鍵                                                              |
| ------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 書目         | `books.json`、`adventures.json`                                         | `book`(65)、`adventure`(100)                                        |
| 種族         | `races.json`                                                            | `race`(160)、`subrace`(98)                                          |
| 背景         | `backgrounds.json`                                                      | `background`(171)                                                   |
| 專長         | `feats.json`                                                            | `feat`(305)                                                         |
| 可選特性     | `optionalfeatures.json`                                                 | `optionalfeature`(221)                                              |
| 物品         | `items.json`、`items-base.json`                                         | `item`(2512)、`itemGroup`(119)、`baseitem`(230)、`itemProperty`、`itemMastery`、`itemType` |
| 法術         | `spells/index.json`（source → 檔名）、`spells/spells-*.json`            | `spell`(共 969)                                                     |
| 法術↔職業    | `generated/gendata-spell-source-lookup.json`                            | 見 §6                                                               |
| 職業         | `class/index.json`（職業 → 檔名）、`class/class-*.json`                 | `class`、`subclass`、`classFeature`、`subclassFeature`              |
| 其他         | `languages.json`、`skills.json`、`conditionsdiseases.json`、`variantrules.json`、`senses.json`、`actions.json` | — |

`fluff-*.json`（背景故事、圖片）與 `foundry-*.json` 目前不需要。

## 2. 共通欄位

- **`name` 是簡體中文，`ENG_name` 是英文原名**（所有類別都有，含 `entries` 內的小標題物件）。
- **所有交叉參照都用中文 `name`**：`_copy.name`、`reprintedAs`、`{@spell 次级幻象|XPHB}`、`classFeatures` 參照字串、`_mod.replace` 等。所以 id 用中文名。
- `source`（大寫代碼，參照時常被寫成小寫，如 `法术反制|xphb`，比對要不分大小寫）、`page`（極少數缺）。
- `edition`：`"classic"`（2014）或 `"one"`（2024）。只有部分條目有；沒有時依來源推斷（XPHB/XDMG/XMM 及 2024 之後的書視為 2024）。
- 其他旗標：`srd`、`srd52`、`basicRules`、`basicRules2024`、`otherSources`、`additionalSources`、`referenceSources`、`translator`（翻譯來源，例如「不全书」「机翻」）。
- 距離單位資料用「尺」（例如「60 尺」）。CLAUDE.md 要求「呎」→ 屬於術語覆寫，留給簡轉繁里程碑。

### 名稱唯一性（統計結果）

以下組合在各類內**沒有重複**，可當主鍵：

| kind              | 唯一鍵                                                        |
| ----------------- | ------------------------------------------------------------- |
| 大部分            | `name` + `source`                                             |
| `subrace`         | `name` + `source` + `raceName` + `raceSource`                 |
| `subclass`        | `name` + `source` + `className` + `classSource`（PHB 子職會被 `_copy` 成 XPHB 職業版，name/source 相同） |
| `classFeature`    | `name` + `className` + `classSource` + `level` + `source`     |
| `subclassFeature` | 再加 `subclassShortName` + `subclassSource`                   |

→ 統一 id 規格：`kind|name|source`，上面三類再附加額外欄位（見 `src/data/ids.ts`）。

## 3. `_copy` / `_mod`

- 出現在 race、subrace、background、item、subclass、subclassFeature。`_meta.internalCopies` 列出哪些陣列有檔內複製。
- `_copy` 用 `name`/`source`（加上 subrace 的 `raceName`/`raceSource`、subclass 的 `className`/`classSource`/`shortName`）指向母條目；**有 230 筆是「複製的複製」**，必須遞迴解析。全部目標都找得到（0 筆缺）。
- `_copy._preserve`：母條目中哪些欄位要保留（預設不繼承 `page`、`srd`、`reprintedAs` 等，見 `src/data/copy.ts`）。
- `_mod` 以欄位名為鍵，值是一個或多個操作；實際出現的 mode：`replaceArr`(29)、`appendArr`(34)、`insertArr`(45)、`appendIfNotExistsArr`(14)、`replaceTxt`(1)。`replace` 比對的是中文 `name`。
- 種族另有 `_versions`（17 筆，例如阿斯莫的三種天界啟示）；feat 有 2 筆。建置期展開成 `versions`，見 §12a。

## 4. 重印（reprint）

- 只有 `reprintedAs`，**沒有 `isReprinted`**。值有兩種格式：字串 `"人马|MPMM"`，或物件 `{ "uid": "警戒龙纹|EFA", "tag": "feat" }`（tag 指出目標類別，跨類別重印）。比對用中文 `name`，不是 `ENG_name`。
- 鏈狀：例如 EEPC 鳥羽人 → MPMM → （無 XPHB 版）；DMG 阿斯莫 → XPHB。建置期把間接目標也展開進 `reprintedAs`（直接目標在前），中間那本書沒開時最舊版仍會被隱藏。
- **隱藏規則（M4-2 通用規則，執行期判斷，`src/data/visibility.ts`）**：條目 E 預設隱藏，當且僅當 E 的重印目標中至少一個「來源在目前啟用的書目中」且「確實存在於打包資料中」（後者在建置期處理：`reprintedAs` 只保留解析得到的 id）。目標書沒啟用時舊版照常顯示。
- 規則引擎的選項清單用 `RulesData.selectable`（不看重印），被取代的舊版也放進選項，由畫面隱藏、提示「已隱藏 N 個重印舊版」並可暫時顯示；已選的舊版保留並警示，列入 `Build.legacyPicks`（M6 審卡報告會用）。

### 4a. 重印統計（M4-2，`raw/` = `5cc0bbe`，scratchpad 腳本 `reprints.cjs`）

| 類別 | 有 `reprintedAs` | 原來源→新來源：數量 |
| ---- | ---: | ---- |
| 法術 | 389 | PHB→XPHB 361、XGE→XPHB 10、TCE→XPHB 9、XGE→AU 6、FTD→XPHB 1、SCC→AU 1、TCE→FRHoF 1 |
| 種族 | 51 | VGM→MPMM 13、PHB→XPHB 7、ERLW→MPMM 4、ERLW→EFA 4、MPMM→XPHB 3、VGM→XPHB 3、MOT→MPMM 3、VRGR→RHW 3、EEPC→MPMM 2、DMG→XPHB 2、GGR→MPMM 2、MPMM→EFA 2、FTD→XPHB 2、WBtW→MPMM 2、MTF→MPMM 2、PHB→EFA 1、EGW→XPHB 1、ERLW→XPHB 1、TTP→MPMM 1 |
| 亞種 | 46 | ERLW→EFA 17、PHB→XPHB 13、MTF→MPMM 7、EEPC→MPMM 4、ERLW→MPMM 4、VGM→MPMM 3、VGM→XPHB 3、SCAG→MPMM 1、PHB→EFA 1（目標是種族） |
| 背景 | 13 | PHB→XPHB 9、VRGR→RHW 2、ToA→EFA 1、ERLW→EFA 1 |
| 專長 | 50 | PHB→XPHB 39、TCE→XPHB 10、ERLW→EFA 1 |
| 可選特性 | 84 | PHB→XPHB 52、TCE→XPHB 15、XGE→AU 8、TCE→EFA 7、XGE→XPHB 2 |
| 物品 | 834 | DMG→XDMG 526、PHB→XPHB 209、XGE→XDMG 40、PHB→XDMG 23、DMG→XPHB 12、BMT→XDMG 5、TCE→XDMG 4、SCAG→XPHB 2、MM→XDMG 1、VRGR→RHW 1、MM→XMM 1、SCAG→FRHoF 1，另有冒險模組來源（不在白名單） |
| 語言 | 46 | PHB→XPHB 18、MM→XMM 15、SCAG→FRHoF 11、SKT→FRHoF 1、HotDQ→FRHoF 1 |
| 職業 | 13 | PHB→XPHB 12、TCE→EFA 1（奇械師） |
| 子職 | 77 | 參照格式「短名\|職業\|職業來源\|來源」，PHB／XGE／TCE／SCAG／VRGR 子職 → XPHB 或 EFA 職業 |

**任務檔所說「同檔內找不到目標」的解析方式**：
- 種族：目標在 `subrace`↔`race` 之間（亞種的重印目標是種族），按類別找就都找得到。
- 物品 11 筆（易傷護甲、矮人板甲、月刃、以太化板甲 (*)…）：目標在 `magicvariants.json`（XDMG 泛用變體），已打包，可解析。
- 可選特性 19 筆：跨類別（`tag: feat` 的戰鬥風格 → XPHB 專長；`tag: item` 的奇械注法 → EFA 物品），可解析。

**建置後仍解析不到的 16 筆**（目標書在白名單、但條目不存在；`build-data` 會印出，M4-5 的稽核報告會列）：
- `元素裔` 的 EEPC 亞種 4 筆 → `元素裔 (气)|MPMM` 等：中文 MPMM 元素裔沒有拆成四種（英文版是四個種族）。EEPC 元素裔母種族本身已有重印到 MPMM，所以這些亞種實際上隨母種族隱藏。
- `法术卷轴|DMG` → `法术卷轴|XPHB`：上游沒有這個條目（XDMG 有分環位的法術卷軸）。
- 規則條目（variantrule）11 筆 → XDMG 或 `hazard`：只用於 tooltip，不是建角選項；`hazard`（陷阱與危害）不打包。

### 4b. 數量比對（M4-2 驗收）

`official`、預設篩選（隱藏重印舊版、TCE 可選規則關閉）。參考值是從 `raw/` 獨立計算（重印目標的書啟用且條目存在就算被取代）：

| 類別 | app | 參考值 |
| ---- | ---: | ---: |
| 法術 | 574 | 574 |
| 種族／背景／專長／可選特性／物品／職業 | 73／125／225／127／1686／13 | 同 §10b |

法術的來源分布：XPHB 391、XGE 79、AU 33、FRHoF 19、EGW 15、TCE 11、AI 7、FTD 6、SCC 4、BMT 3、AAG 2、SatO 2、EFA 1、GGR 1。單元測試 `src/rules/__tests__/reprint.spec.ts` 檢查每一類都沒有新舊兩版同時可見。
上游網站的數量無法在建置環境抓取（列表由 JS 動態產生）；使用者先前決定「與上游網站抽查：先不管」。

## 4c. 資料完整性稽核與語言（M4-5）

`npm run build-data` 結束時自動執行 `scripts/audit-data.ts`，輸出 `docs/data-audit.md`（進 git，資料更新時看 diff）。
管線的丟棄原因（`scripts/lib/pipeline.ts` 的 `DropReason`）：來源不在白名單、母條目不存在、同類別重複；另外協力者職業檔整檔排除。
`_copy` 解析失敗會讓建置中止，不會靜默丟棄。目前（`5cc0bbe`）**未說明原因的丟棄：0**。
回歸測試 `scripts/lib/__tests__/audit.spec.ts`：XPHB／XDMG／XMM／FRHoF／EFA／AU 每一類的輸出數量 = 從 raw 直接數的數量。

**稽核發現（其他類別）**：
- 子職特性「受祝击|TCE」4 筆：掛在 PSA（Plane Shift: Amonkhet，`setting-alt`，不在白名單）的牧師子職上 → 母條目不存在，正確丟棄。
- 物品「治疗药水|DMG」重複 1 筆：`items.json` 的物品「Potion of Healing」與物品組「Potions of Healing」中文同名同源；保留物品、丟掉物品組（物品組本身已被 XDMG 取代，不影響）。
- 其他類別 raw 與輸出的差距全部是白名單外來源（冒險模組、UA、Plane Shift 等），見 `docs/data-audit.md` §3a。

**語言「明顯不全」的根本原因**（逐一驗證）：
1. 建置**沒有**丟掉語言：raw 201 筆，白名單內 160 筆全部輸出（MM 21、XMM 15、SCAG 20、PHB 18、XPHB 19、FRHoF 17、GGR 16、ERLW 16、MOT 9、VGM 4、EGW 3、AI 1、MTF 1）；沒有 `type` 的 96 筆也都在。白名單外 41 筆（DSotDQ、Plane Shift 系列、SKT、HotDQ 等冒險或 `setting-alt`）。
2. **資料瀏覽器沒有語言分頁**（原因一）→ 新增「語言」分頁，依書目篩選，可依分類（標準／稀有／異國／秘密／其他）篩選；沒有 `type` 的歸為「其他」。
3. **建角的語言選擇只列 XPHB 的 9 種標準語言**（原因二，M2 的實作）：其他書的標準語言（FRHoF 17 種）與所有稀有、其他語言都選不到 → 改為列出目前書目的全部語言、依 `type` 分組顯示、每項有來源徽章；預設只列標準語言（XPHB 語言表在前），開關「顯示稀有與其他語言（需 DM 同意）」才列出其他組。
4. **職業特性給的語言沒有自動加入**（原因三）：德魯伊語、盜賊黑話沒有結構化欄位，但特性的英文名與語言的英文名相同（`Druidic`、`Thieves' Cant`）→ 以此自動學會，不佔選擇名額（不是人工對照表，是資料比對）。

**語言數量比對**（同樣書目 official、預設篩選）：app 116 筆＝從 raw 獨立計算 116 筆（160 − 被重印取代 44）。上游網站畫面無法在建置環境抓取（見 §10b）。

**已知缺口**：XPHB 盜賊黑話原文「習得盜賊黑話和語言表中的一項語言」的第二項語言只有原文，沒有自動產生選擇欄位（列入待決事項）。

## 5. 職業資料

- `class.classFeatures`：字串 `"名稱|職業|職業來源|等級[|特性來源]"`，職業來源空白代表 PHB，特性來源省略代表等於職業來源。例：`"戏法公式|法师||3|TCE"`。物件形式 `{ classFeature, gainSubclassFeature: true }` 表示該級取得子職特性。
- `subclass.subclassFeatures`：`"名稱|職業|職業來源|子職短名|子職來源|等級[|特性來源]"`。
- 每個職業同時有 PHB（`edition: classic`，`reprintedAs: ["法师|XPHB"]`）與 XPHB 版。舊書子職（XGE、TCE…）同時存在「掛在 PHB 職業」與「`_copy` 到 XPHB 職業」兩份。
- `UATheMysticClass`（神秘學家，UA）、`class-sidekick.json`（TCE 協力者）不在官方白名單。

## 6. 法術 ↔ 職業對照

`generated/gendata-spell-source-lookup.json`：`{ 小寫來源: { 法術中文名: { class, classVariant, subclass, feat, background, race, optionalfeature, reward } } }`

- `class`：`{ 職業來源: { 職業名: true } }` —— 原生職業清單。
- `classVariant`：`{ 職業來源: { 職業名: { definedInSources: ["TCE"] } } }` —— 由別本書擴充進職業清單。`definedInSources` 含 `TCE` 的就是 **TCE 擴充法術表（可選規則）**；其他書（XGE、FTD、BMT…）把自己的法術加到 XPHB 職業清單，跟著該書啟用即可。
- `spells/sources.json` 是另一種格式的同樣資訊，不使用。

## 7. `{@tag}` 統計（種族、背景、專長、可選特性、物品、法術、職業檔合計）

```
spell 3951  variantrule 3405  item 2475  condition 1818  dice 1538  damage 1449  skill 1168
creature 975  dc 831  action 813  filter 765  i 460  status 244  table 225  b 224  sense 200
book 198  feat 182  5etools 150  scaledamage 148  deity 145  quickref 129  card 118  hit 57
chance 55  italic 51  language 49  class 41  note 34  color 28  itemProperty 27  race 26
hazard 23  background 16  adventure 14  scaledice 14  classFeature 11  subclassFeature 11
object 7  itemMastery 7  optfeature 5  deck 5  subclass 5  tip 4  h 3  link 2  d20 2  atk 1
```

- 格式：`{@tag 名稱|來源|顯示文字|…}`。**可巢狀**（例如 `{@note 注：…{@book …}}`、`{@i …{@variantrule …}}`）。
- 省略來源時的預設：沿用 5etools 2014 慣例（spell/condition/skill/feat/race/background/class/action/sense → PHB；item/variantrule → DMG；creature → MM）。XPHB 的資料一律寫明來源。
- `{@filter 顯示|spells|level=0|class=法师}` 第二段是頁面名稱，之後是篩選條件。
- `{@dice 4d4 × 10|4d4 × 10|起始金币}`、`{@dc 8}`、`{@damage 1d10}`、`{@chance 10}`。

## 8. `entries` 的 `type` 統計

`entries`(4416)、`item`(1148)、`list`(727)、`table`(700)、`refSubclassFeature`(547)、`cell`(160)、`refOptionalfeature`(161)、`inset`(44)、`options`(39)、`refClassFeature`(32)、`quote`(9)、`section`(8)、`statblock`(2)、`refFeat`(2)、`bonus`/`bonusSpeed`/`abilityDc`/`abilityAttackMod`、`dice`。
（統計中 `point`、`feet`、`timed`、`G|XPHB`… 等是法術距離、物品類型等欄位，不是 entry。）

## 9. TCE 可選規則的辨識方式

| 規則                         | 辨識方式                                                                                     |
| ---------------------------- | -------------------------------------------------------------------------------------------- |
| 可選職業特性                 | `classFeature.isClassFeatureVariant === true`（全部 `source: TCE`、掛在 PHB 職業上），以及 `class.classFeatures` 中第 5 段為 `TCE` 的參照 |
| 可選特性（戰鬥風格、魔能祈喚、戰技、超魔…） | `optionalfeature.isClassFeatureVariant === true`（25 筆，全部 TCE）              |
| 擴充職業法術表               | spell lookup 的 `classVariant`，且 `definedInSources` 含 `TCE`                              |
| 自訂起源：定制血統           | `race.lineage === true`（只有 TCE「定制血统 Custom Lineage」）                              |
| 自訂起源：定制你的出身       | 無對應欄位，是 `variantrules.json` 的「定制你的出身 Customizing Your Origin」規則本身 → M2 建角時用同一個開關決定能否搬移種族屬性加值。2024 規則下屬性加值來自背景，影響有限。 |

`race.lineage === "VRGR"`（鴉閣魔域血系）是 VRGR 本身的規則，不算 TCE 可選規則。
背景沒有 TCE 相關的可選欄位（TCE 沒有背景）。

## 10. 建置輸出（`npm run build-data`）

管線在 `scripts/lib/pipeline.ts`（純函式，測試在 `scripts/lib/__tests__/`），`scripts/build-data.ts` 只負責讀檔與寫檔。

| 檔案 | 內容 | 大小（official） |
| ---- | ---- | ---- |
| `sources.js` | 白名單內的來源對照表（32 本） | 5 KB |
| `races.js` | race 126、subrace 74 | 369 KB |
| `backgrounds.js` | background 137 | 457 KB |
| `feats.js` | feat 275 | 286 KB |
| `optionalfeatures.js` | optionalfeature 221 | 136 KB |
| `items.js` | item 2559（含 `isBaseItem` 基礎物品、`isItemGroup` 物品組、`isGenericVariant` 泛用魔法變體） | 2.10 MB |
| `spells.js` | spell 963（含 `classes` 職業對照） | 1.37 MB |
| `classes.js` | class 26、subclass 310、classFeature 607、subclassFeature 1408 | 1.87 MB |
| `rules.js` | language、skill、condition、disease、status、variantrule、sense、action、itemProperty、itemMastery（給 tooltip 用） | 592 KB |

合計約 7.1 MB。每筆條目都有 `id`、`kind`、`name`、`engName`、`source`、`page`、`edition`，必要時有 `reprintedAs`（id 陣列）、`tceOptional`。

- 協力者（`class-sidekick.json`）不是玩家職業，不打包。
- 刪掉的欄位見 `DROP_FIELDS`（fluff、翻譯者、SRD 標記、載具數值、foundry 等）。
- `isClassFeatureVariant` 轉成 `tceOptional` 後刪除。
- `magicvariants.json`（泛用魔法物品變體，例如「+1 武器」「矮人板甲」）也打包成 item：把 `inherits` 攤平，內文的 `{=bonusAc}` 等模板代入數值；不展開到每一種基礎物品。許多 DMG 物品的重印目標（`{uid: "矮人板甲|XDMG", tag: "item"}`）就是 XDMG 的泛用變體。
- **頁碼補丁**：中文上游有 89 筆缺 `page`（全是 AU：8 子職、62 子職特性、11 物品、8 可選特性）。`npm run gen-page-patches` 從英文 5etools-src `v2.38.0` 以「kind＋英文名＋來源（＋等級）」對應，產生 `scripts/data/page-patches.json`（進 git）；build-data 只在缺頁碼時套用。89 筆全部對上。上游日後補齊頁碼時，補丁自然不再生效。
- `_mod` 另外會出現：`"remove"` 簡寫（刪欄位）、`setProp`、點路徑欄位（`"inherits.entries"`），都在 magicvariants。

## 10b. M1 數量比對（完成標準 1）

條件：套用 `official`（2026-10-23 定案版：不含冒險、含 EEPC）、隱藏被取代的舊版、TCE 可選規則關閉。
「參考值」是另寫的獨立腳本，**不經過 build-data 管線**，直接從 `raw/` 依同樣條件計算（重印目標的來源在白名單內就算被取代）。

| 分頁 | app 顯示 | 參考值 | 說明 |
| ---- | -------: | -----: | ---- |
| 種族 | 73 | 77 | 差 4：ERLW 地精、大地精，GGR 地精，MOT 梭螺鱼人。它們是 `_copy` 且 `_preserve.reprintedAs`，繼承了母條目的「已重印為 MPMM 版」。參考腳本沒解析 `_copy`，app 的結果才是對的（與 5etools 行為一致）。 |
| 背景 | 125 | 125 | 吻合 |
| 職業 | 13 | 13 | 吻合（XPHB 12 職業＋EFA 奇械師；子職另計，例如 XPHB 法師 13 個） |
| 專長 | 225 | 225 | 吻合 |
| 法術 | 574 | 574 | 吻合 |
| 物品 | 1686 | 1686 | 吻合（第一次比對時發現缺了 magicvariants，補上後吻合） |
| 可選特性 | 127 | 127 | 吻合 |

與上游網站（5e.kiwee.top）畫面數字的直接比對：網站列表由 JS 動態產生，建置環境抓不到；網站讀的就是同一份 JSON，上面的獨立計算已涵蓋同樣的資料。使用者可選擇性抽查（方法見待決事項 3）。

## 11. 來源對照表

由 `npm run source-table` 從 `books.json`／`adventures.json` 產生（下方區塊會被覆蓋，不要手改）。
`official` 群組定義在 `src/data/sourceGroups.ts`；建置期白名單 = 所有群組的聯集。

**`official` 選法（使用者 2026-10-23 定案）**：上游分類為 `core`／`supplement`／`setting` 的規則書，加上 EEPC。**冒險模組一律不收**（無論是否主線）。
排除：DM 帷幕（screen）、食譜（recipe）、編織（homecraft）、Sage Advice（other）、冒險者聯盟（organized-play）、`setting-alt`（Plane Shift 系列、LFL、NF）、`supplement-alt`（OGA、ABH、塔羅牌等）、所有冒險模組。

資料中出現、但兩份書目表都沒有的來源：`EEPC`（元素邪惡玩家手冊，6 個種族，均已被 MPMM 重印）→ **收**，書目資訊補在 `scripts/lib/sources.ts` 的 `EXTRA_SOURCES`（中文名「元素邪恶玩家手册」為本專案自訂）。`UATheMysticClass`（UA）、`EET`、`HAT-LMI`、`MCV2DC`、`RoTOS`、`TftYP`（只有零星物品）→ 不收。

<!-- source-table:begin -->

共 164 筆（書 66、冒險 98）。「官方」欄 ✅ 代表在 `official` 群組內。

| 官方 | 代碼 | 中文名 | 英文名 | 出版日期 | 類型 | 上游分類 |
| :--: | ---- | ------ | ------ | -------- | ---- | -------- |
|  | LMoP | 凡戴尔的失落矿坑 | Lost Mine of Phandelver | 2014-07-15 | 冒險 | supplement |
|  | HotDQ | 龙后的宝山 | Hoard of the Dragon Queen | 2014-08-19 | 冒險 | supplement |
| ✅ | PHB | 玩家手册（2014） | Player's Handbook (2014) | 2014-08-19 | 規則書 | core |
| ✅ | MM | 怪物手册（2014） | Monster Manual (2014) | 2014-09-30 | 規則書 | core |
|  | RoT | 提亚马特崛起 | Rise of Tiamat | 2014-11-04 | 冒險 | supplement |
| ✅ | DMG | 城主指南（2014） | Dungeon Master's Guide (2014) | 2014-12-09 | 規則書 | core |
|  | Screen | 地下城主帷幕 | Dungeon Master's Screen | 2015-01-20 | 規則書 | screen |
| ✅ | EEPC | 元素邪恶玩家手册 | Elemental Evil Player's Companion | 2015-03-10 | 規則書 | supplement |
|  | PotA | 毁灭亲王 | Princes of the Apocalypse | 2015-04-07 | 冒險 | supplement |
|  | OotA | 逃离深渊 | Out of the Abyss | 2015-09-15 | 冒險 | supplement |
| ✅ | SCAG | 剑湾冒险者指南 | Sword Coast Adventurer's Guide | 2015-11-03 | 規則書 | setting |
|  | CoS | 施特拉德的诅咒 | Curse of Strahd | 2016-03-15 | 冒險 | supplement |
|  | PSZ | 异界传送: 赞迪卡 | Plane Shift: Zendikar | 2016-04-27 | 規則書 | setting-alt |
|  | PSI | 异界传送: 依尼翠 | Plane Shift: Innistrad | 2016-07-12 | 規則書 | setting-alt |
|  | AL | 冒险者联盟 | Adventurers League | 2016-08-26 | 規則書 | organized-play |
|  | SKT | 风暴君王之雷霆 | Storm King's Thunder | 2016-09-06 | 冒險 | supplement |
| ✅ | VGM | 瓦罗怪物指南 | Volo's Guide to Monsters | 2016-11-15 | 規則書 | supplement |
|  | PSK | 异界传送: 卡拉德许 | Plane Shift: Kaladesh | 2017-02-16 | 規則書 | setting-alt |
|  | TftYP-AtG | 哈欠传送门故事集：挑战巨人 | Tales from the Yawning Portal: Against the Giants | 2017-03-24 | 冒險 | supplement |
|  | TftYP-DiT | 哈欠传送门故事集：死于赛尔 | Tales from the Yawning Portal: Dead in Thay | 2017-03-24 | 冒險 | supplement |
|  | TftYP-TFoF | 哈欠传送门故事集：愤怒熔炉 | Tales from the Yawning Portal: The Forge of Fury | 2017-03-24 | 冒險 | supplement |
|  | TftYP-THSoT | 哈欠传送门故事集：隐秘圣坛 | Tales from the Yawning Portal: The Hidden Shrine of Tamoachan | 2017-03-24 | 冒險 | supplement |
|  | TftYP-ToH | 哈欠传送门故事集：恐怖墓穴 | Tales from the Yawning Portal: Tomb of Horrors | 2017-03-24 | 冒險 | supplement |
|  | TftYP-TSC | 哈欠传送门故事集：暗无天日 | Tales from the Yawning Portal: The Sunless Citadel | 2017-03-24 | 冒險 | supplement |
|  | TftYP-WPM | 哈欠传送门故事集：白羽山 | Tales from the Yawning Portal: White Plume Mountain | 2017-03-24 | 冒險 | supplement |
|  | PSA | 异界传送: 阿芒凯 | Plane Shift: Amonkhet | 2017-07-06 | 規則書 | setting-alt |
|  | ToA | 湮灭之墓 | Tomb of Annihilation | 2017-09-19 | 冒險 | supplement |
|  | OGA | 一蛙之下 | One Grung Above | 2017-10-11 | 規則書 | supplement-alt |
|  | TTP | 龟人扩充包 | The Tortle Package | 2017-11-03 | 冒險 | supplement-alt |
| ✅ | XGE | 珊娜萨的万事指南 | Xanathar's Guide to Everything | 2017-11-21 | 規則書 | supplement |
|  | TLK | 迷失的天狗 | The Lost Kenku | 2017-11-28 | 冒險 | supplement-alt |
|  | XMtS | X标记了位置 | X Marks the Spot | 2017-12-11 | 冒險 | supplement-alt |
|  | PSX | 异界传送: 依夏兰 | Plane Shift: Ixalan | 2018-01-09 | 規則書 | setting-alt |
| ✅ | MTF | 魔邓肯的众敌卷册 | Mordenkainen's Tome of Foes | 2018-05-29 | 規則書 | supplement |
|  | PSD | 异界传送: 多明尼亚 | Plane Shift: Dominaria | 2018-07-31 | 規則書 | setting-alt |
|  | WDH | 深水城: 龙金劫 | Waterdeep: Dragon Heist | 2018-09-18 | 冒險 | supplement |
|  | LLK | 夸力许的失落实验室 | Lost Laboratory of Kwalish | 2018-11-10 | 冒險 | supplement-alt |
|  | WDMM | 深水城: 疯法师的地城 | Waterdeep: Dungeon of the Mad Mage | 2018-11-13 | 冒險 | supplement |
| ✅ | GGR | 拉尼卡公会长指南 | Guildmasters' Guide to Ravnica | 2018-11-20 | 規則書 | setting |
|  | KKW | 追捕克仑可 | Krenko's Way | 2018-11-20 | 冒險 | supplement-alt |
|  | SAC | 贤者谏言合集（2014） | Sage Advice Compendium (2014) | 2019-01-31 | 規則書 | other |
|  | AZfyT | 一个齐布，换你的想法 | A Zib for Your Thoughts | 2019-03-05 | 冒險 | supplement-alt |
|  | GoS | 盐沼幽魂 | Ghosts of Saltmarsh | 2019-05-21 | 冒險 | supplement |
|  | HftT | 寻找特萨尔蛇蜥 | Hunt for the Thessalhydra | 2019-05-21 | 冒險 | supplement-alt |
| ✅ | AI | 艾奎兹玄有限责任公司 | Acquisitions Incorporated | 2019-06-18 | 規則書 | supplement |
|  | OoW | 位面游荡仪 | The Orrery of the Wanderer | 2019-06-18 | 冒險 | supplement |
|  | DIP | 基础包：冰塔峰之龙 | Essentials Kit: Dragon of Icespire Peak | 2019-06-24 | 冒險 | supplement |
|  | DC | 基础包：神圣的争夺 | Essentials Kit: Divine Contention | 2019-09-03 | 冒險 | supplement |
|  | SDW | 基础包：沉睡巨龙醒转 | Essentials Kit: Sleeping Dragon's Wake | 2019-09-03 | 冒險 | supplement |
|  | SLW | 基础包：风暴领主之怒 | Essentials Kit: Storm Lord's Wrath | 2019-09-03 | 冒險 | supplement |
|  | BGDIA | 博德之门: 坠入阿弗纳斯 | Baldur's Gate: Descent Into Avernus | 2019-09-18 | 冒險 | supplement |
|  | LR | 洛卡鱼人崛起 | Locathah Rising | 2019-09-19 | 冒險 | supplement-alt |
|  | AWM | 与穆克一起冒险 | Adventure with Muk | 2019-11-12 | 規則書 | supplement-alt |
|  | IMR | 重建炼狱机器 | Infernal Machine Rebuild | 2019-11-12 | 冒險 | supplement-alt |
|  | EFR | 艾伯伦：遗忘的遗物 | Eberron: Forgotten Relics | 2019-11-19 | 冒險 | supplement |
| ✅ | ERLW | 艾伯伦:从终末战争中崛起 | Eberron: Rising from the Last War | 2019-11-19 | 規則書 | setting |
|  | RMBRE | 最瑞克的失落地城: 大瑞克之力 | The Lost Dungeon of Rickedness: Big Rick Energy | 2019-11-19 | 冒險 | supplement-alt |
|  | RMR | 龙与地下城VS瑞克与莫迪:基本规则 | Dungeons & Dragons vs. Rick and Morty: Basic Rules | 2019-11-19 | 規則書 | supplement-alt |
|  | DD | 荒洲：危险计划 | Wildemount: Dangerous Designs | 2020-03-17 | 冒險 | supplement-alt |
| ✅ | EGW | 荒洲探险家指南 | Explorer's Guide to Wildemount | 2020-03-17 | 規則書 | setting |
|  | FS | 荒洲：封冻恶疾 | Wildemount: Frozen Sick | 2020-03-17 | 冒險 | supplement-alt |
|  | ToR | 荒洲：复仇之潮 | Wildemount: Tide of Retribution | 2020-03-17 | 冒險 | supplement-alt |
|  | US | 荒洲：恶客自来 | Wildemount: Unwelcome Spirits | 2020-03-17 | 冒險 | supplement-alt |
| ✅ | MOT | 塞洛斯之神话奥德赛 | Mythic Odysseys of Theros | 2020-06-02 | 規則書 | setting |
|  | IDRotF | 冰风谷: 冰霜少女的雾凇 | Icewind Dale: Rime of the Frostmaiden | 2020-09-15 | 冒險 | supplement |
|  | ScreenDungeonKit | 地下城主帷幕：地下城套组 | Dungeon Master's Screen: Dungeon Kit | 2020-09-21 | 規則書 | screen |
|  | HF | 英雄宴 | Heroes' Feast | 2020-10-27 | 規則書 | recipe |
|  | ScreenWildernessKit | 地下城主帷幕：荒野套组 | Dungeon Master's Screen: Wilderness Kit | 2020-11-17 | 規則書 | screen |
| ✅ | TCE | 塔莎的万事坩埚 | Tasha's Cauldron of Everything | 2020-11-17 | 規則書 | supplement |
|  | MGELFT | 穆克的塔莎所授万事指南 | Muk's Guide to Everything He Learned From Tasha | 2020-12-01 | 規則書 | supplement-alt |
|  | CM | 烛堡秘辛 | Candlekeep Mysteries | 2021-03-16 | 冒險 | supplement |
|  | HoL | 鸦阁：悲叹之屋 | Ravenloft: The House of Lament | 2021-05-18 | 冒險 | supplement |
| ✅ | VRGR | 范·里希腾的鸦阁魔域指南 | Van Richten's Guide to Ravenloft | 2021-05-18 | 規則書 | setting |
|  | RtG | 回归荣耀 | Return to the Glory | 2021-05-21 | 冒險 | supplement-alt |
|  | AitFR-ISF | 被遗忘国度的冒险：绯红烈焰 | Adventures in the Forgotten Realms: In Scarlet Flames | 2021-06-30 | 冒險 | supplement-alt |
|  | AitFR-THP | 被遗忘国度的冒险：隐秘书页 | Adventures in the Forgotten Realms: The Hidden Page | 2021-07-07 | 冒險 | supplement-alt |
|  | AitFR-AVT | 被遗忘国度的冒险：葱郁墓穴 | Adventures in the Forgotten Realms: A Verdant Tomb | 2021-07-14 | 冒險 | supplement-alt |
|  | AitFR-DN | 被遗忘国度的冒险：至暗之夜 | Adventures in the Forgotten Realms: Deepest Night | 2021-07-21 | 冒險 | supplement-alt |
|  | AitFR-FCD | 被遗忘国度的冒险：青渊来客 | Adventures in the Forgotten Realms: From Cyan Depths | 2021-07-28 | 冒險 | supplement-alt |
|  | NRH-ASS | NERDS 恢复和谐：棘手局面 | NERDS Restoring Harmony: A Sticky Situation | 2021-09-01 | 冒險 | supplement-alt |
|  | NRH-AT | NERDS 恢复和谐：共同冒险 | NERDS Restoring Harmony: Adventure Together | 2021-09-01 | 冒險 | supplement-alt |
|  | NRH-AVitW | NERDS 恢复和谐：荒野呼唤 | NERDS Restoring Harmony: A Voice in the Wilderness | 2021-09-01 | 冒險 | supplement-alt |
|  | NRH-AWoL | NERDS 恢复和谐：谎言之网 | NERDS Restoring Harmony: A Web of Lies | 2021-09-01 | 冒險 | supplement-alt |
|  | NRH-CoI | NERDS 恢复和谐：幻象马戏团 | NERDS Restoring Harmony: Circus of Illusion | 2021-09-01 | 冒險 | supplement-alt |
|  | NRH-TCMC | NERDS 恢复和谐：糖果山冒险 | NERDS Restoring Harmony: The Candy Mountain Caper | 2021-09-01 | 冒險 | supplement-alt |
|  | NRH-TLT | NERDS 恢复和谐：失落墓穴 | NERDS Restoring Harmony: The Lost Tomb | 2021-09-01 | 冒險 | supplement-alt |
|  | DoD | 欢欣领域 | Domains of Delight | 2021-09-21 | 規則書 | supplement-alt |
|  | WBtW | 巫光之外的荒野 | The Wild Beyond the Witchlight | 2021-09-21 | 冒險 | supplement |
|  | MaBJoV | 明斯克与布布恶棍志 | Minsc and Boo's Journal of Villainy | 2021-10-05 | 規則書 | supplement-alt |
| ✅ | FTD | 费资本的巨龙宝库 | Fizban's Treasury of Dragons | 2021-10-26 | 規則書 | supplement |
| ✅ | SCC | 斯翠海文：混沌研习 | Strixhaven: A Curriculum of Chaos | 2021-12-07 | 規則書 | setting |
|  | SCC-ARiR | 斯翠海文：废墟中的审判 | Strixhaven: A Reckoning in Ruins | 2021-12-07 | 冒險 | supplement |
|  | SCC-CK | 斯翠海文：校园风波 | Strixhaven: Campus Kerfuffle | 2021-12-07 | 冒險 | supplement |
|  | SCC-HfMT | 斯翠海文：追寻法师塔 | Strixhaven: Hunt for Mage Tower | 2021-12-07 | 冒險 | supplement |
|  | SCC-TMM | 斯翠海文：院长的化妆舞会 | Strixhaven: The Magister's Masquerade | 2021-12-07 | 冒險 | supplement |
| ✅ | MPMM | 魔邓肯巨献:多元宇宙的怪物 | Mordenkainen Presents: Monsters of the Multiverse | 2022-01-25 | 規則書 | supplement |
|  | CRCotN | Critical Role: 溟渊的呼唤 | Critical Role: Call of the Netherdeep | 2022-03-15 | 冒險 | supplement-alt |
|  | MCV1SC | 怪物合集第一期: 魔法船生物 | Monstrous Compendium Volume 1: Spelljammer Creatures | 2022-04-21 | 規則書 | supplement-alt |
|  | TD | 塔罗牌 | Tarot Deck | 2022-05-24 | 規則書 | supplement-alt |
|  | JttRC | 耀光城之旅 | Journeys through the Radiant Citadel | 2022-07-19 | 冒險 | supplement |
|  | DoSI | 风骸岛之龙 | Dragons of Stormwreck Isle | 2022-07-31 | 冒險 | supplement |
|  | SjA | 星航学院 | Spelljammer Academy | 2022-08-01 | 冒險 | supplement-alt |
| ✅ | AAG | 星界冒险者指南 | Astral Adventurer's Guide | 2022-08-16 | 規則書 | setting |
| ✅ | BAM | 布布的星界怪兽展 | Boo's Astral Menagerie | 2022-08-16 | 規則書 | setting |
|  | LoX | 萨利希斯之光 | Light of Xaryxis | 2022-08-16 | 冒險 | supplement |
|  | ScreenSpelljammer | 地下城主帷幕：魔法船 | Dungeon Master's Screen: Spelljammer | 2022-08-16 | 規則書 | screen |
|  | DSotDQ | 龙枪:龙后之影 | Dragonlance: Shadow of the Dragon Queen | 2022-11-22 | 冒險 | supplement |
|  | KftGV | 金色金库的钥匙 | Keys from the Golden Vault | 2023-02-21 | 冒險 | supplement |
|  | HAT-TG | 盗贼画廊 | Thieves' Gallery | 2023-03-06 | 規則書 | supplement-alt |
|  | GotSF | 坠星熔炉的巨人 | Giants of the Star Forge | 2023-08-01 | 冒險 | supplement-alt |
| ✅ | BGG | 毕格比巨献：巨人之荣耀 | Bigby Presents: Glory of the Giants | 2023-08-15 | 規則書 | supplement |
|  | PaBTSO | 凡戴尔之下:破碎方尖碑 | Phandelver and Below: The Shattered Obelisk | 2023-09-19 | 冒險 | supplement |
|  | MCV4EC | 怪物手册第四卷：艾尔德林生物 | Monstrous Compendium Volume 4: Eldraine Creatures | 2023-09-21 | 規則書 | supplement-alt |
|  | LK | 闪电堡垒 | Lightning Keep | 2023-09-26 | 冒險 | supplement-alt |
| ✅ | MPP | 莫提的位面游记 | Morte's Planar Parade | 2023-10-07 | 規則書 | setting |
| ✅ | SatO | 印记城与外域 | Sigil and the Outlands | 2023-10-07 | 規則書 | setting |
|  | ToFW | 命运之轮的轮转 | Turn of Fortune's Wheel | 2023-10-07 | 冒險 | supplement |
|  | AATM | 冒险地图匣：葬仪社 | Adventure Atlas: The Mortuary | 2023-10-17 | 規則書 | supplement-alt |
|  | CoA | 阿斯蒙蒂斯的锁链 | Chains of Asmodeus | 2023-10-30 | 冒險 | supplement-alt |
|  | HFFotM | 英雄盛宴：多元宇宙风味 | Heroes' Feast Flavors of the Multiverse | 2023-11-07 | 規則書 | recipe |
| ✅ | BMT | 万象无常书 | The Book of Many Things | 2023-11-14 | 規則書 | supplement |
|  | DMTCRG | 万象无常牌：参考卡 | The Deck of Many Things: Card Reference Guide | 2023-11-14 | 規則書 | supplement |
|  | PiP | 松溪险境 | Peril in Pinebrook | 2023-11-20 | 冒險 | supplement-alt |
|  | HFStCM | 英雄盛宴：救救孩子的食谱 | Heroes' Feast: Saving the Children's Menu | 2023-11-21 | 冒險 | supplement-alt |
|  | DitLCoT | 深入失落的索坎斯洞穴 | Descent into the Lost Caverns of Tsojcanth | 2024-03-26 | 冒險 | supplement |
|  | LRDT | 红龙传说：乐高冒险 | Red Dragon's Tale: A LEGO Adventure | 2024-04-01 | 冒險 | supplement-alt |
|  | VNotEE | 维克那：妖眼魔窟 | Vecna: Nest of the Eldritch Eye | 2024-04-16 | 冒險 | supplement |
|  | VEoR | 维克那：毁灭前夕 | Vecna: Eve of Ruin | 2024-05-21 | 冒險 | supplement |
|  | QftIS | 来自无尽阶梯的委托集 | Quests from the Infinite Staircase | 2024-07-16 | 冒險 | supplement |
|  | PaF | 骰子与酒杯 | Puncheons and Flagons | 2024-08-27 | 規則書 | recipe |
| ✅ | XPHB | 玩家手册（2024） | Player's Handbook (2024) | 2024-09-17 | 規則書 | core |
|  | UtHftLH | 小独与追寻失落之角 | Uni and the Hunt for the Lost Horn | 2024-09-24 | 冒險 | supplement-alt |
|  | ScoEE | 邪恶元素后裔 | Scions of Elemental Evil | 2024-10-24 | 冒險 | supplement-alt |
| ✅ | XDMG | 城主指南 (2024) | Dungeon Master's Guide (2024) | 2024-11-12 | 規則書 | core |
|  | XScreen | 地下城主屏幕（2024） | Dungeon Master's Screen (2024) | 2024-11-12 | 規則書 | screen |
|  | HBTD | 阻止亡者 | Hold Back The Dead | 2025-02-07 | 冒險 | supplement-alt |
| ✅ | XMM | 怪物图鉴（2025） | Monster Manual (2025) | 2025-02-18 | 規則書 | core |
|  | XSAC | 贤者谏言合集（2025） | Sage Advice Compendium (2025) | 2025-04-30 | 規則書 | other |
|  | BQGT | 边陲之地任务：地精之患 | Borderlands Quest: Goblin Trouble | 2025-06-04 | 冒險 | supplement-alt |
|  | DrDe-ACfaS | 巨龙迷城：一枚铜币换一首歌 | Dragon Delves: A Copper for a Song | 2025-07-08 | 冒險 | supplement |
|  | DrDe-BD | 巨龙迷城：面包师的捉襟见肘 | Dragon Delves: Baker's Doesn't | 2025-07-08 | 冒險 | supplement |
|  | DrDe-BtS | 巨龙迷城：风暴将临 | Dragon Delves: Before the Storm | 2025-07-08 | 冒險 | supplement |
|  | DrDe-DaS | 巨龙迷城：日落时分的死神 | Dragon Delves: Death at Sunset | 2025-07-08 | 冒險 | supplement |
|  | DrDe-DotSC | 巨龙迷城：砂岩城之龙 | Dragon Delves: Dragons of the Sandstone City | 2025-07-08 | 冒險 | supplement |
|  | DrDe-FWtVC | 巨龙迷城：虚空唤谁而鸣 | Dragon Delves: For Whom the Void Calls | 2025-07-08 | 冒險 | supplement |
|  | DrDe-SD | 巨龙迷城：夺命颤寒 | Dragon Delves: Shivering Death | 2025-07-08 | 冒險 | supplement |
|  | DrDe-TDoN | 巨龙迷城：纳基凯尔之龙 | Dragon Delves: The Dragon of Najkir | 2025-07-08 | 冒險 | supplement |
|  | DrDe-TFV | 巨龙迷城：禁忌谷 | Dragon Delves: The Forbidden Vale | 2025-07-08 | 冒險 | supplement |
|  | DrDe-TWoO | 巨龙迷城：奥喀斯之命 | Dragon Delves: The Will of Orcus | 2025-07-08 | 冒險 | supplement |
|  | HotB | 边陲之地的英雄们 | Heroes of the Borderlands | 2025-09-16 | 冒險 | supplement |
|  | WttHC | 怪奇物语：欢迎来到地狱火俱乐部 | Stranger Things: Welcome to the Hellfire Club | 2025-10-07 | 冒險 | supplement |
|  | ABH | 阿斯代伦的饥渴卷册 | Astarion's Book of Hungers | 2025-11-11 | 規則書 | supplement-alt |
| ✅ | FRAiF | 被遗忘的国度：费伦冒险 | Forgotten Realms: Adventures in Faerûn | 2025-11-11 | 規則書 | setting |
| ✅ | FRHoF | 被遗忘的国度：费伦英雄 | Forgotten Realms: Heroes of Faerûn | 2025-11-11 | 規則書 | setting |
|  | NF | 耐瑟瑞尔的陨落 | Netheril's Fall | 2025-11-11 | 規則書 | setting-alt |
|  | LFL | 洛温：第一道光 | Lorwyn: First Light | 2025-11-18 | 規則書 | setting-alt |
| ✅ | EFA | 艾伯伦：奇械锻炉 | Eberron: Forge of the Artificer | 2025-12-09 | 規則書 | setting |
|  | FFotR | 隐士的命定航旅 | Fated Flight of the Recluse | 2025-12-09 | 冒險 | supplement-alt |
|  | CaBoMP | 钩针编织：百变图案集 | Crochet: A Book of Many Patterns | 2026-03-31 | 規則書 | homecraft |
|  | BQDD | 边陲之地任务：匕首危机！ | Borderlands Quest: Dagger Danger! | 2026-05-28 | 冒險 | supplement-alt |
| ✅ | RHW | 鸦阁魔域：魔障深藏 | Ravenloft: The Horrors Within | 2026-06-16 | 規則書 | setting |
|  | XScreenRHW | 地下城主帷幕；鸦阁魔域：内在恐怖 | Dungeon Master's Screen; Ravenloft: The Horrors Within | 2026-06-16 | 規則書 | screen |
| ✅ | AU | 启封奥秘 | Arcana Unleashed | 2026-09-15 | 規則書 | supplement |
|  | AUD | 启封奥秘：死亡陷阱 | Arcana Unleashed: Deadfall | 2026-09-15 | 冒險 | supplement |

<!-- source-table:end -->

## 12. M2 建角引擎的資料發現

### 12a. `_versions`（版本）

- 2024 種族的血系／譜系（侏儒、精靈、歌利亞、提夫林、龍裔）與部分專長（XPHB 魔法學徒的牧師／德魯伊／法師版、BGG 巨人打擊）都用 `_versions` 表示。
- 兩種寫法：一般（`{name, source, _mod, ...覆蓋欄位}`）與模板（`{_abstract, _implementations: [{_variables}]}`，龍裔的十種顏色）。
- build-data 在建置期展開成 `versions`（完整條目，各自有 id，並記 `versionOf`）。catalog 也把版本加入索引，因為**背景直接參照版本名**：侍僧的 `feats: [{"魔法学徒；牧师|xphb": true}]`。
- 上游翻譯問題：PHB／EGW 龍裔的 `_mod` 要取代「吐息武器」「伤害抗性」，但中文母條目的小標題翻法不同 → 找不到。版本展開改為寬鬆模式（找不到就附加在最後），共 50 筆警告，全部是 PHB／EGW 龍裔，build-data 會印出。

### 12b. 結構化欄位的實際寫法（建角引擎依此實作，見 `src/rules/build.ts`）

- 陣列有多個元素 = **多種方案擇一**（例如侍僧 `ability` 的 +2/+1 與 +1/+1/+1、武僧工具的「工匠工具或樂器」）。
- 技能鍵有英文小寫（`"sleight of hand"`）也有中文名（`choose.from: ["驯兽","医药"]`）；工具鍵是英文小寫物品名；語言鍵是英文小寫。存檔一律轉成英文小寫鍵，顯示時查回中文。
- `ability`：`{str: 1}` 固定、`{choose: {from, count, amount}}`、`{choose: {weighted: {from, weights: [2,1]}}}`（背景）、`max: 30`（傳奇恩惠可超過 20）。
- `additionalSpells`：`known`／`prepared`／`innate`／`expanded`，等級鍵 `_`（一開始）、數字（角色或職業等級）、`s1`（環位）；`innate` 內再分 `daily`（`"1"`、`"1e"`、`"pb"`）、`rest`、`will`。法術為 `名|來源#c` 或 `{choose: "level=0|class=牧师", count}`。
- 2024 職業的屬性值提升不在 `featProgression`，而是職業特性「属性值提升」（engName `Ability Score Improvement`）；`featProgression` 只有戰鬥風格（FS）與傳奇恩惠（EB）。
- 2024 職業的 `multiclassing` 多半是空物件（沒有 `requirements`），兼職條件改依 `primaryAbility` 判斷（M2b）。
- 職業特性的「專精」（遊蕩者、吟遊詩人、遊俠、法師學者、知識領域）沒有結構化欄位。依 §6 原則不做對照表，改從原文推斷：內文有 `{@variantrule 专精` 且提到「技能」→ 產生專精選擇欄位，數量取第一個「兩項／一項」。知識領域的「選兩個技能獲得熟練」仍只有原文，需手動覆寫。
- 兼職施法者等級：資料的 `casterProgression` 有 `full`、`artificer`（半施法無條件進位，XPHB 聖武士／遊俠與奇械師都用這個）、`1/2`（2014 聖武士／遊俠，捨去）、`1/3`（子職：奧法騎士、詭術師、秘術武者）、`pact`（魔契師，另計）。單一施法職業用該職業自己的法術位表；兩個以上才用兼職表。
- 2024 規則的語言（通用語＋兩種標準語言）不在任何資料欄位，是引擎內建規則；「標準語言」只取 XPHB 的標準語言表（9 種）。

### 12d. 法術（M2c）

- 職業：`cantripProgression`、`preparedSpellsProgression`（2024）、`preparedSpells` 公式字串（2014，例如 `"<$level$> / 2 + <$cha_mod$>"`）、`spellsKnownProgression`（2014 已知法術）、`spellsKnownProgressionFixed`（法師法術書每級新增數）。子職施法者（奧法騎士、詭術師、秘術武者）的這些欄位在子職上。
- 子職施法者用哪張法術清單沒有專用欄位，但子職特性內文有 `{@filter 术士法术列表|spells|class=术士}`。引擎取該子職所有特性中第一個指向法術的 filter（`subclassSpellList`）：奧法騎士、詭術師→法師，**AU 秘術武者→術士**（原本寫死法師是錯的，2026-10-23 修正）。「施法」常是標題特性內 `refSubclassFeature` 參照的小特性，所以要掃子職的全部特性。
- 法術欄位：`time`、`range`（`point`／`cone`／`cube`…＋`distance`）、`components`（`m` 為字串或物件）、`duration`（`concentration`）、`meta.ritual`、`spellAttack`、`savingThrow`（英文全名）、`scalingLevelDice`（戲法升階）、`entriesHigherLevel` 內的 `{@scaledamage 2d8|1-9|1d8}`（升環每環加骰）。基礎傷害取內文第一個 `{@damage}`。
- 塑能學者這類「免費加入法術書」的子職法術是 `additionalSpells.known`（每個等級一個 `{choose: "level=…|class=法师|school=V"}`）；引擎把它們視為法術書內容，可被準備。
- 魔法學徒的一環法術資料寫成 `innate.daily`（1/長休），原文說「始終準備」→ 角卡顯示為永遠準備＋1/長休，與 DDB 相同。

### 12e. 裝備（M2d）

- 起始裝備：2024 職業 `startingEquipment.defaultData = [{A: [...], B: [{value: 5500}]}]`，背景的 `startingEquipment` 直接是同格式陣列；2014 職業是多組 `{a, b}`／`{_}`，另有 `goldAlternative: "{@dice 4d4 × 10|…}"`（改拿金幣要擲骰）。
- 項目寫法：`"名|來源"`、`{item, quantity, displayName}`、`{value}`（銅幣）、`{special: "法术书"}`（以名稱找物品，只有 PHB 的「法术书」，DDB 也標 Legacy）、`{equipmentType: "toolArtisan"}`（任選一件，引擎產生自訂物品讓玩家改名）、`{item: "小包", containsValue: 1500}`。
- 套組（學者套組等）有 `packContents`，套用時展開成內容物放進背包（同 DDB）。基準角色套用法師 A＋侍僧 A 後重量 49 磅，與 DDB 相同（DDB 不計硬幣重量，本站也另計）。
- 物品屬性 `itemProperty` 沒有中文 `name`（name 是縮寫），中文名在 `entries[0].name`。武器精通 `mastery: ["迅击|XPHB"]` 參照 `itemMastery`。
- AC、負重是規則公式（無甲 10＋敏、輕甲＋敏、中甲＋敏最多 2、重甲、盾 +2、`bonusAc`；負重＝力量 ×15，依體型倍數）。無甲防禦等只有文字的特性列在效果頁並可手動覆寫。
- 武器精通需要職業特性「武器精通」（engName `Weapon Mastery`）才能使用；有哪些武器可精通是原文，攻擊列只標示武器的精通名稱與是否具備該特性。

### 12c. 效果自動偵測（M2a 測試結果）

用 XPHB 全部種族特質（含所有血系版本）與 XPHB 起源專長測試（`src/rules/effects.ts`）。

**偵測到且推斷出欄位**：侏儒狡黠→智力／感知／魅力豁免；黑暗視覺→感官；矮人剛毅、健壯→HP；警覺→先攻；大型形態→力量檢定＋速度；龍族飛翼、木精靈→速度；各種抗性→防禦；吐息武器、巨人先祖→攻擊。

**漏抓（沒有任何段落被列出）**，逐一確認後判定為合理（不影響數值或擲骰）：
- 阿斯莫／光輝掌者、精靈／出神、提夫林／異界存在、高等精靈血系、魔法學徒三版：只給戲法或法術（法術在法術頁處理）。
- 半身人／半身人靈巧、天生善匿：移動與躲藏的情境規則，不是擲骰加值。
- 人類／多用：給一個起源專長（結構化欄位已處理）。

**列出但推斷不出欄位**（只出現在效果頁）：精靈／妖精血統、半身人／勇氣（對特定狀態的豁免優勢）、矮人體魄（對中毒的豁免優勢，避免誤判成「所有豁免」）、半身人／幸運、人類／適應力（英雄激勵）、兽人／坚韧不屈、治愈之手。

**誤抓與修正**：
- 吐息武器原本推斷成角色的敏捷與體質豁免 → 改為「必须进行…豁免」視為目標的豁免，不推斷豁免欄位。
- 矮人體魄原本推斷成「所有豁免」→ 改為只有原文寫「所有豁免」才推斷。
- 侏儒血系（岩侏儒）的「AC 为 5」是發條裝置的 AC，仍會推斷到角色 AC 欄位（誤抓，保留：寧可多列）。
- 許多段落因「熟练加值」（使用次數 = 熟練加值）而命中，屬於多列，可接受。

### 12f. M2 驗收結果（2026-10-23）

`npm run check:file` 以 `file://` 開啟 `dist/index.html`，在 `official` 書目下用介面從零建立基準角色（岩侏儒、侍僧、法師），升到 **20 級**（2026-10-23 起；原本 12 級）選塑能師、套用起始裝備，檢查角卡、手動覆寫、效果連結，再匯出 JSON、匯入（覆蓋），比對再次匯出的 JSON 與角卡畫面完全相同。0 個主控台錯誤。

| 項目 | DDB（20 級） | 本站 20 級（單元測試＋UI 實測） | 本站 12 級（單元測試） |
| ---- | ---- | ---- | ---- |
| 熟練加值 | +6 | +6 | +4 |
| 法術 DC／攻擊 | 17／+9 | 17／+9 | 15／+7 |
| 雷鳴波 | con17、2d8* | 体质 17、2d8、升環 +1d8 | 体质 15 |
| 冷凍射線 | +9、4d8 | +9、4d8 | +7、3d8 |
| 光導箭（魔法學徒） | +8、4d6*、1/LR | +8、4d6、1/长休 | +6 |
| 匕首／長棍 | +7 1d4+1／+5 1d6-1 1d8-1 | 同 | +3／+1（1 級 smoke） |
| 攜帶重量 | 49 lb | 49 | 49 |
| 奧術回想 | 10 | （文字特性，列在特性頁） | — |
| HP | （畫面沒有） | 122（平均） | 74 |
| AC／先攻／被動感知 | （畫面沒有） | 11／+1／12 | 11／+1／12 |

DDB 的屬性值提升、傳奇恩惠、法術精通、招牌法術、學者都是「No Choice Made」，本站同樣標示為未選擇。

## 13. 待決事項

（之後一起問使用者；目前先用預設值繼續。第 1 項已決定並排為 M8；第 8～10 項是 M7 期間新增。M7-2 的工具清單決定見 §17f。）

1. **〔已決定，排為 M8，見下方「已決定」〕只有原文、沒有結構化欄位的數值效果**（例如野蠻人／武僧的無甲防禦、警覺專長的先攻、健壯專長的 HP、法師學者的專精範圍）：目前依 CLAUDE.md §6「不做人工對照表」，列在效果頁並可手動覆寫，不會自動計入。使用者 2026-10-23 要求「新人一來就什麼都算對」，這與 §6 有衝突：要達到完全自動，需要「從原文自動解析出數值效果」（例如偵測「AC 等於 10＋敏捷＋體質」這類句型）或允許少量人工規則。請決定方向。

2. **（M4-5）XPHB 遊蕩者「盜賊黑話」的第二項語言**：原文「習得盜賊黑話和語言表中的一項語言」，沒有結構化欄位。目前自動給盜賊黑話，第二項語言沒有選擇欄位。預設做法：維持現狀並在效果頁列出原文；若要自動化，可併入 §13 第 1 項的「原文數值句型解析」一起做。
3. **（M4-6）FVTT 技能排序後五項的位置**：歷史、醫藥、說服、調查、隱匿依筆畫推算，見 `src/data/skillOrder.ts`，請對照 Foundry VTT 繁中版確認。
4. **（M5-3）跨來源重複的法術**：目前規則——同一欄位不能重複；不同來源重複時**允許勾選但提示**「已由 種族：XXX 取得」。例外：法術書↔準備法術互相包含不算重複；準備法術欄位裡的法術書內容不算重複。2024 PHB 對「從兩個來源學到同一道法術」沒有禁止（例如可以把種族法術抄進法術書），但多數情況是浪費名額。預設做法：維持「提示不阻擋」。若希望某些情況直接禁止（例如職業戲法與專長戲法重複），請說明。
5. **（M5-4）子職免費法術的分頁**：塑能學者這類「每級免費加入法術書一道」的選擇，目前每個等級一個分頁（例如「塑能师 3 级・法術」），20 級時分頁很多。預設維持（與規則引擎的選擇欄位一一對應）；若想合併成一個分頁，需要調整規則引擎的欄位結構。
6. **（M6-5）審卡報告測試的基準角色等級**：M6.md 原寫「塑能師法師 12 級」並要求法術 DC 17，但 12 級（ASI 未選，同 DDB）的 DC 是 15；DC 17 是 20 級的值。依 §13「已決定：基準角色以 20 級為主」，測試改用 **20 級**，M6.md 已一併更正。若其實想測 12 級，需要在 4、8 級的 ASI 選智力（智力 20 → DC 17），請告知。
7. **（M6-2）逐級表中「每級都有」的選擇欄位**：塑能學者的免費法術、法師戲法／法術書／準備法術這幾個欄位，規則引擎把它們的取得等級記為目前等級（20），所以逐級表把它們放在第 20 級那一列。預設維持（與規則引擎一致，法術段落另有完整清單）；若希望拆回實際取得的等級，需要調整規則引擎的欄位結構。
8. **（M7-2）武器精通（Weapon Mastery）沒有選擇欄位**：目前只要有該特性，攻擊列就顯示所有武器的精通詞條，沒有「選 N 種武器」的欄位。M7 不做；要做的話需新增選擇欄位（存檔加 key，不必升 schemaVersion）。
9. **（M7-5）總重超過載重時的速度**：XPHB 原文只說「拖拽、抬起、推動超過載重的重量時速度至多 5 尺」，載重本身是「可以承載的最大重量」。預設解讀：總重超過載重＝只能用拖拽／推動的方式帶著走，所以步行速度顯示為至多 5 呎並附說明圖示；超過拖拽上限時只加警示（不把速度改成 0）。若希望超重時只標示、不改速度，請告知。
10. **（M7-7）是否納入魔法物品的特定變體**（+1 長劍、火焰舌短劍這類由「通用變體 × 基礎物品」組合出的條目）：目前管線只有通用變體（214 筆），沒有特定變體，物品表的「分類」篩選只有基礎／通用變體／其他。要納入需要在建置期組合（數量會多出數千筆），M7 不做。
11. **（M8-1）PHB（2014）元素掌控的可重複**：原文可重複，但資料沒有 `repeatable` 欄位，目前當成不可重複（2024 啟用時它是重印舊版、預設隱藏）。若要依原文放行，需要一筆人工例外（與 M8 數值效果自動化的「少量人工規則」同一套機制）。
12. **（M8-1）屬性值提升欄位改為可選所有專長**：依 XPHB 原文「或其他你满足条件的专长」，起源專長、戰鬥風格專長（需有戰鬥風格特性）也列出。若希望維持只列通用專長，請告知。

### 已決定（2026-10-23）

- 第 1 項（只有原文的數值效果）：採 **(a)+(b) 混合**——先從簡體原文自動解析數值句型（例如「AC 等於 10＋敏捷＋體質」），解析不到的常見項目再補**少量人工規則**（以條目 id 對應）。CLAUDE.md §6 需相應修改。排在 M3 之後實作。

- `setting-alt`／`supplement-alt` 的書：先不收，之後再說。
- 與上游網站抽查：先不管。
- 2014 種族／背景的語言：**照給**，來源與語言都標示「2014 版」。
- 2014 背景：依 2024 規則補「六項任選 +2/+1 或 +1/+1/+1」＋「任選一個起源專長」。
- 基準角色以 **20 級**為主（D&D 等級上限 20，DDB 參考畫面就是 20 級）；M2.md、M3.md、CLAUDE.md 已改。
- 手動覆寫要**連動**：`ability:*`、`profBonus` 是輸入層，所有下游（調整值、豁免、技能、被動值、HP、AC、先攻、法術 DC 與攻擊、武器攻擊、負重、專長先決條件、兼職條件、2014 準備法術數）都用覆寫後的值；`skill:*` 覆寫會連動被動值。另外補上重甲力量不足自動 −10 速度。
- 子職：官方書的子職全開（含最新的 AU）；子職施法者的法術清單改從資料讀取。

- `official`：不收冒險模組；EEPC 收。
- `public/data/*.js` 不進 git；新環境先 `npm run fetch-data && npm run build-data` 再 `npm run build`，日後 CI 也照做。
- 單本勾選：Claude 決定 → 維持收合在「單本勾選（預覽）」、可使用。
- 協力者（sidekick）與 UA 神秘學家：不打包。
- 舊書子職雙份（PHB 職業版與 XPHB 職業版）：預設只顯示 XPHB 職業底下那份，開「顯示舊版」才兩份都出現。
- 缺頁碼：從英文 5etools-src 補（見 §10），補不到時才顯示 `p.?`。

## 14. M3：xlsx 匯出函式庫比較（M3-1）

| 項目 | ExcelJS 4.4.0 | SheetJS CE（cdn.sheetjs.com tarball） |
|---|---|---|
| 授權 | MIT | Apache-2.0 |
| `file://` 下產生與下載 | 可：`workbook.xlsx.writeBuffer()` → Blob → `<a download>`；bundle 內沒有 `fetch` | 可：`XLSX.write` → Blob |
| 標題列粗體 | 可（`cell.font`） | **社群版不寫出儲存格樣式**（樣式是 Pro 功能） |
| 凍結標題列 | 可（`worksheet.views` 的 `state: 'frozen'`） | 社群版寫出有限，需另外處理 |
| 欄寬、自動換行 | 欄寬可、`wrapText` 可 | 欄寬可（`!cols`），換行屬樣式→不可 |
| 讀回驗證（Vitest） | 可（`workbook.xlsx.load`） | 可 |
| 體積 | `exceljs.bare.min.js` 862KB（未壓縮） | 約 400–500KB |

**選擇 ExcelJS**：M3-2 要求的粗體、凍結、換行，SheetJS 社群版做不到。

**打包方式**：不 inline 進 `index.html`（目前 263KB，inline 會變約 1.1MB，且每次開頁都要解析）。
`vite.config.ts` 的 `vendorScripts` 外掛把 `node_modules/exceljs/dist/exceljs.bare.min.js`
輸出為 `dist/vendor/exceljs.min.js`（dev server 也直接提供），
`src/export/vendor.ts` 在第一次匯出時以 classic `<script>` 載入，取 `window.ExcelJS`。
`index.html` 大小不變（262.65KB），`dist/` 多 862KB。用 `bare` 版（不含 ES5 polyfill），因為只支援現代瀏覽器。

**M3-2 實作備註**
- `build-data` 新增輸出 `data/meta.js`（`register('meta', {repo, branch, commit, committedAt, builtAt})`），來源是 `raw/VERSION`；只在匯出時載入。
- `InventoryItem.attuned?: boolean`（選填，舊存檔視為 false，不升 schemaVersion）。物品欄只有 `reqAttune` 為真的物品顯示同調勾選。
- 匯出只排版規則引擎的結果（`src/export/sheetData.ts`），entries 以 `src/data/text.ts` 的 `entriesToText` 轉純文字（所有 `{@tag}` 經 `stripTags`）。
- 摘要表沒有「來源」欄（不是可選項目的清單）；種族、背景的來源在「特性與特質」「背景」表。

## 15. M5：法術欄位與篩選索引（M5-1）

抽樣：`raw/spells/spells-*.json` 全部 969 道（上游 `5cc0bbe`），scratchpad 腳本 `spells1.cjs`、`lookup.cjs`。
代碼的英文名稱對照英文 5etools-src `v2.38.0` 的 `js/parser.js`（`SP_MISC_TAG_TO_FULL`、`SPELL_AREA_TYPE_TO_FULL`）與 `js/filter-spells.js`（分類方式）。

| 資訊 | 欄位與值域（實測） |
| ---- | ---- |
| 環階 | `level` 0–9（戲法 80 道） |
| 學派 | `school`：A C D E I N T V（8 種） |
| 子學派 | `subschools`：**0 道有**（中文資料沒有這個欄位）→ 篩選群組略過 |
| 組別 | `groups`：**0 道有**，lookup 也沒有 → 篩選群組略過 |
| 成分 | `components.v`(919)／`s`(838)／`m`(523)／`r`(3)。`m` 為字串（342）或物件 `{text, cost?, consume?}`；`cost` 單位銅幣（172 道），`consume` 為 `true`(82) 或 `"optional"`(3) |
| 儀式 | `meta.ritual`（68；`meta` 只有這個鍵） |
| 專注 | `duration[].concentration`（423） |
| 施法時間 | `time[]`：`{number, unit, condition?}`，unit 為 action、bonus、reaction、minute、hour；`condition`（27，反應的觸發條件） |
| 持續時間 | `duration[]`：`instant`、`timed`（`duration.type` 為 round、minute、hour、day）、`permanent`（`ends: ["解除","触发"]`）、`special` |
| 射程 | `range.type`：point（`distance.type` feet、touch、self、miles、sight、unlimited）、emanation、cone、radius、line、sphere、cube、hemisphere、special |
| 範圍形狀 | `areaTags`：ST 單一目標、MT 多目標、C 立方、N 錐形、Y 圓柱、S 球形、R 圓形、Q 正方形、L 直線、H 半球、W 牆、E 散發 |
| 傷害類型 | `damageInflict`：**英文小寫**（fire、force…13 種）。`damageResist`／`damageImmune`／`damageVulnerable` 則是**簡體中文**（建角篩選不用） |
| 造成的狀態 | `conditionInflict`：簡體中文（15 種） |
| 法術攻擊 | `spellAttack`：M、R |
| 豁免 | `savingThrow`：英文全名，**但有 3 道寫成中文**（体质、感知、智力）→ 索引統一轉成 str…cha |
| 屬性檢定 | `abilityCheck`：**簡體中文**（智力、力量、感知、敏捷）→ 轉成屬性鍵 |
| 影響的生物類型 | `affectsCreatureType`：簡體中文（77 道）；沒有此欄＝不限（上游視為全部類型） |
| 雜項 | `miscTags`：HL 治療、THP 臨時生命、SGT 需要視線、PRM 永久效果、SCL 升環效果、SCT 升環增加目標、SMN 召喚生物、MAC 改變 AC、TP 傳送、FMV 強制移動、RO 可擲骰效果、LGTS 日光、LGT 光亮、UA 使用動作、UBA 使用附贈動作、PS 位面轉移、OBS 遮蔽視線、DFT 困難地形、AAD 額外攻擊傷害、OBJ 影響物件、ADV 給予優勢、PIR 重複施放則永久、BO 燒毀物件。上游另外補：有 `permanent` 持續時間→PRM、有 `entriesHigherLevel`→SCL |
| 戲法升階 | `scalingLevelDice`（41） |

**spell lookup**（`generated/gendata-spell-source-lookup.json`，§6）的其他鍵：
- `subclass`：`{職業來源: {職業名: {子職來源: {子職短名: {name, subSubclasses?}}}}}`。同一子職常同時列在 PHB 職業與 XPHB 職業底下。
- `race`：`{來源: {種族名: {baseName?, baseSource?}}}`（名稱可能是「半身人 (医疗龙纹)」這種亞種合併名）。
- `background`、`feat`：`{來源: {名稱: true}}`；`optionalfeature`：`{來源: {名稱: {featureType}}}`。
- `reward`（祝福、魔力恩賜）：不屬於建角，**不打包**。
- `classVariant`：已確認是「其他書擴充進職業清單」，`definedInSources` 有 TCE（158）、XGE（478）、FTD（39）、BMT（22）。只有 TCE 的屬於「TCE 可選規則」（擴充法術表），其餘跟著該書啟用即可（M1 已實作，見 §9）。

**建置索引**（`scripts/lib/spellIndex.ts`）：每道法術加 `idx`（`SpellIndex`，扁平字串陣列＋排序鍵，空陣列與 false 不寫出）與 `origins`（`SpellOrigins`；子職存 `職業|職業來源|子職短名|子職來源`，其他存 `名稱|來源`，只留白名單來源）。分類照上游：施法時間取所有 `time[].unit`；持續時間只看第一個，分 9 類（立即、1 輪、1 分鐘、10 分鐘、1 小時、8 小時、24 小時以上、永久、特殊）；射程分 5 類（自身、觸碰、指定距離、自身（範圍）、特殊）；排序鍵照上游 `getNormalisedTime`／`getNormalisedRange`。

`spells.js`：1.37 MB → **1.83 MB**（`idx` 約 0.16M 字元、`origins` 約 0.19M 字元）。子職第一版存完整物件時是 2.40 MB，改成緊湊字串、顯示名稱執行期查 classes 資料。

## 16. M6：審卡報告的格式決定

- **主要格式：單一自足的 `.html` 檔**（CSS 全部 inline、沒有可執行的 JS、不連網、只用系統字型）。任何瀏覽器都能開，也能用 LINE、Discord、Email 傳給 DM。
- **不採用 MHTML**：MHTML 主要只有 Chromium 系列瀏覽器能直接開啟，手機和其他瀏覽器支援不穩，而它能做到的事單一 HTML 檔都做得到。若之後仍需要，再另開任務。
- **PDF：用瀏覽器內建的「列印 → 另存為 PDF」**（預覽畫面的按鈕呼叫 iframe 的 `print()`，配合 `@media print` 白底黑字、`@page` A4 直式）。不在瀏覽器內產生 PDF，因為要打包數 MB 的中文字型，違反 `file://` 單檔產物的精簡原則。
- **內嵌存檔（M6-2 可選項，已實作）**：報告以 `<script type="application/json" id="dnd2024-character">` 嵌入角色存檔（`<` 轉成 `<`），網站「匯入」可以直接選審卡報告的 `.html`（`importCharacter` 會先取出這段 JSON）。Vitest 與 `check:file` 都測了「匯入報告 → 角色完全相同」。
- 程式位置：`src/export/review.ts`（資料模型，只整理規則引擎的結果）、`src/export/reviewHtml.ts`（HTML 與 CSS）、`src/components/sheet/ReviewReport.vue`（按鈕與預覽）。

## 17. M7-2：物品選項清單盤點（魔法物品混入工具熟練）

> 統計日期 2026-10-23，`raw/` = `5cc0bbe`，書目 = 預設「官方」群組，以 `realData()` 實測。

### 17a. 根本原因

工具熟練的選項來自 `src/rules/data.ts` 的 `toolList()`：掃過**全部物品**，只要 `type` 前段是 `AT`／`INS`／`GS`／`T` 就收（再依英文名去重、2024 版優先）。**沒有任何「是否為一般物品」的判斷**，而魔法樂器在資料裡的 `type` 也是 `INS`（例如 `+1 调律者之鼓` 的 `type: "INS"`、`baseItem: "鼓|phb"`），所以全部混進來。`build.ts` 的 `profOptions()`（任一樂器／工匠工具／遊戲套組／任一工具）和 `profLabel()` 都吃這份清單。

### 17b. 判斷「一般物品」該用哪個欄位

| 欄位 | 結果 | 可用？ |
| --- | --- | --- |
| `rarity` | 2559 筆全都有。`none` 907 筆＝一般物品；其餘為 `common`～`artifact`、`varies`、`unknown (magic)`、`unknown`（15 筆，多為 SCC／VGM 的特殊一般物品，例如投石機彈藥）、另有 5 筆中文值（`珍稀`、`极珍稀`、`传说`） | ✅ **以 `rarity === 'none'` 判斷**。`rarity: none` 的物品沒有任何一筆帶 `wondrous`／`reqAttune`／`bonusWeapon`，交叉檢查一致 |
| `baseItem` | 只有 198 筆有；魔法樂器裡有 4 筆沒有（金穗琴、佛克路坎三弦琴、麥克-弗瑞米西特琴、狂宴手風琴） | ❌ 會漏 |
| `isBaseItem` | 226 筆，只標在武器、護甲等「可做變體的基礎物品」上，一般樂器（XPHB 魯特琴）**沒有**這個旗標 | ❌ 會把一般樂器也濾掉 |

`unknown` 歸為「非一般」：這 15 筆都不是工具，影響為零；歸「非一般」較保守（不會讓不明物品進熟練清單）。

### 17c. 盤點表

| # | 選項來源 | 程式位置 | 目前列出 | 不該出現 | 例子 |
| --- | --- | --- | --- | --- | --- |
| 1 | 任一樂器（`anyMusicalInstrument`、`musical instrument`）：吟遊詩人 PHB／XPHB、武僧 PHB／XPHB、自由鬥士（笑面人）EGW、房產代理 ERLW、城市獵人 SCAG、兼職吟遊詩人 | `toolList()` → `profOptions()` | **41** | **18**（全是魔法物品） | +1/+2/+3 调律者之鼓（TCE）、吟游诗人乐器×4（XDMG）、瓦尔哈拉号角×4（XDMG）、音爆号角、静报号角（XDMG）、塞壬之歌里拉琴（MOT）、建筑里拉琴、狂宴手风琴（TCE）、金穗琴、勇气战争号角（BGG） |
| 2 | 任一工匠工具（`anyArtisansTool`）：奇械師、武僧、公會工匠等 | 同上 | 17 | 0 | — |
| 3 | 任一遊戲套組（`anyGamingSet`、`gaming set`）：罪犯、間諜等 | 同上 | 4 | 0 | — |
| 4 | 任一工具（`any`）：吟遊詩人「任選 3 種樂器或工具」這類 | 同上 | 68 | **18**（同 #1） | 同 #1 |
| 5 | 指名工具（`thieves' tools` 等）的中文名↔英文鍵、`profLabel` | 同上（`normalizeProf`、`profLabel`） | — | 0（只查找，不列選項） | — |
| 6 | 武器篩選型熟練（武僧、遊蕩者的「軍用武器（輕型／靈巧）」） | `build.ts` `weaponFilter()`：`isBaseItem && weapon && edition 2024` | 46 | 0（`isBaseItem` 已排除魔法變體） | — |
| 7 | 起始裝備 `equipmentType`（toolArtisan 15、setGaming 17、instrumentMusical 11、weaponSimple 9、weaponMartial 4、weaponSimpleMelee 3、focusSpellcasting* 6、weaponMartialMelee 1 處） | `equipment.ts` `resolveItem()` | 0（不列清單，只產生「乐器（自選一種）」這類佔位名稱） | 0 | 佔位物品要玩家自己改名（handoff §6 已知限制）；M7 不擴充 |
| 8 | 起始裝備 `special`（法术书、墨水、纸张…） | `equipment.ts` `itemByName()` | 以名稱精確比對，有對到的 3 項都是 `rarity: none` | 0 | — |
| 9 | 武器精通（Weapon Mastery）的可選武器 | **沒有選擇欄位**：`equipment.ts` 只在攻擊列依武器的 `mastery` 欄位顯示「精通：XX」 | — | — | 選精通武器的欄位目前不存在，不在 M7 範圍（記入待決 §13 第 8 項） |
| 10 | 物品欄「新增物品」搜尋 | `InventoryPanel.vue`：全部物品 | 2559 | 0（故意可加魔法物品） | M7-7 會拆成一般／魔法兩個表 |

結論：**問題只出在 `toolList()` 一處**，但它被 #1、#4、#5 共用，影響所有工具熟練來源（職業、背景、種族、專長、兼職）。其他從物品資料產生選項的地方目前沒有混入魔法物品。

### 17d. 既有存檔

存檔裡的工具熟練是英文小寫鍵（例如 `"+1 rhythm-maker's drum"`）。`build.ts` 的 `addSlot()` 本來就會把「不在選項裡的舊值」從 `selected` 排除（畫面顯示未選擇），並在欄位上加警示「先前的選擇目前不可用…」。缺的是**審卡報告沒有把這種欄位警示列入警示區**。

### 17e. 修正方案（預設）

1. 新增共用函式 `isMundaneItem(it) = it.rarity === 'none'`（放 `src/rules/data.ts` 旁的 `src/data/items.ts`，M7-7 物品分表也用它）。
2. `toolList()` 加上 `isMundaneItem` 條件；`weaponFilter()`、`itemByName()` 也改用它（目前沒出錯，但統一入口防止日後資料變動）。
3. 已啟用書目中的一般異域樂器（SCAG 的鸟箫、格劳尔号、手鼓…，FRHoF 的班多里琴、西特琴、雅廷琴）都是 `rarity: none`，保留。
4. 存檔：不升 `schemaVersion`；沿用 `addSlot()` 的「失效選擇 → 未選擇＋欄位警示」，另外在審卡報告警示區新增「失效的選擇」一類，列出欄位名稱與失效的值。
5. 回歸測試：#1～#6、#8 每一處斷言選項裡沒有 `rarity !== 'none'` 的物品；吟遊詩人任一樂器不含上表例子、含魯特琴；舊存檔回歸測試。

### 17f. 與 2024 PHB 工具清單對照（使用者 2026-10-23 提供原文）

排除魔法物品後，XPHB 的一般工具與 PHB24「Tools」一節逐項一致：工匠工具 17、其他工具 6、遊戲套組 4（資料英文名 `Playing Cards` = Playing Card Set）、樂器 10。`Artisan's Tools`／`Gaming Set`／`Musical Instrument` 是 `isItemGroup` 總稱，本來就不列入。另外多出的是其他書的一般異域樂器 13 種（SCAG：Birdpipes、Glaur、Hand Drum、Longhorn、Songhorn、Tantan、Thelarr、Tocken、Wargong、Yarting、Zulkoon；FRHoF：Bandore、Cittern、Yarting）。

**已決定（2026-10-23）**：修正方案照 17e 執行；異域樂器**保留並標示來源**（書目沒啟用就不出現）。

### 17g. M7-3 實作結果

- `src/data/items.ts` `isMundaneItem()`；`toolList()`、`weaponFilter()`（改為 export、吃 `RulesData`）、`itemByName()` 都改用它。
- 工具熟練的選項現在附上條目，每項都有來源徽章（異域樂器顯示 SCAG／FRHoF）。
- `ChoiceSlot.stale`：存檔中不在選項裡的值；審卡報告警示區新增「失效的選擇」。
- 測試時順便抓到既有 BUG：TCE 奇械師的 `weapons` 有物件寫法 `{"proficiency":"firearms","optional":true}`，選奇械師會讓建角崩潰（`v.toLowerCase is not a function`）。已修正：字串照給；`optional` 的只加附註「可選熟練（由 DM 決定）」；其他物件取 `proficiency`。PHB 德魯伊的 `armor` 也有物件寫法，但那條路徑走 `armorProficiencies`，不受影響。

## 18. M7-4：兼職「加不了第二職業」

### 18a. 重現（Playwright，file://，2026-10-23）

腳本在 `.cache/mc.mjs`、`.cache/mc2.mjs`（不進 git）。主控台**零錯誤**，規則引擎也正確（`multiclass.spec.ts` 直接用程式建法師 3／牧師 2，數值全對）。問題全在 UI：

| 情境 | 操作 | 結果 |
| --- | --- | --- |
| 1 | 法師、標準陣列（智 15、感 13）、升到 2 級 → 「升級」步驟的「新增一級」下拉選牧師 → 按「＋1 級」 | **可以加入**。但下拉選了之後畫面沒有任何變化，要另外按「＋1 級」；而緊鄰等級輸入框的「套用」只會升起始職業。很容易以為「選了沒反應」 |
| 2 | 同上，但屬性值還沒分配 | 14 個職業只有 2 個（法師自己與起始職業）可選，其他全部反灰；原因塞在原生 `<option>` 文字裡（例如「牧师需要 感知 13+（目前 10 ✗）；法师需要 智力 13+（目前 10 ✗）」），常被截斷、看不到 |
| 3 | 在「職業」步驟點牧師（直覺上的「加職業」） | 起始職業被**整個換掉**：法師 2 → 牧師 2，沒有任何提示 |

### 18b. 根本原因

不是前置條件判斷或狀態寫入錯誤，而是**入口難找、回饋不足**：唯一入口是「升級」步驟的原生下拉選單＋另一顆按鈕；職業步驟沒有說明，點別的職業會直接取代起始職業。

### 18c. 修正

- 「升級」步驟：下拉選單改成「新增一級／兼職」清單（`data-testid="multiclass"`），每個職業一顆「＋1 級」；已有的職業顯示目前等級；可兼職的顯示條件 ✓；不能兼職的反灰並直接顯示原因（`mc-reason`）。屬性值沒分配完時加紅字提醒。「套用」旁註明「只升起始職業」。
- 「職業」步驟：已選起始職業時顯示提示「這裡選的是起始職業…要兼職請到『升級』步驟」，可直接跳過去。
- 驗收：`multiclass.spec.ts`（法師 3／牧師 2 全部數值、兼職熟練依 `multiclassing`、前置條件、魔契師 2／術士 3 契約魔法）；`check:file` 的 `multiclassSmoke` 從零經 UI 建立第二驗收角色，檢查反灰原因、法術位 4/3/2、HP 34、熟練 +3、兩組 DC（13／+5 智力、12／+4 感知）、匯出再匯入相同、審卡報告可產生。

## 19. M7-5：錢幣重量與載重（只用 2024 規則）

### 19a. 原文（`raw/` = `5cc0bbe`）

- **錢幣**（`book-xphb.json` 第六章「钱币 / Coins」，XPHB p.213）：「一枚钱币的重量大约有三分之一盎司，50 枚钱币则大约有一磅沉。」不分幣別。這段只在 book 檔，沒有打包，所以程式以常數 `COIN_RULE` 引用原文與頁碼。
- **載重 Carrying Capacity**（`variantrules.json` → `variantrule|载重|XPHB`，XPHB p.362，已打包在 `data/rules.js`）：
  - 「你的体型与力量属性值共同决定了你可以承载的最大重量（单位为磅），如载重表所示。该表同样展示了你可以拖拽、抬起、推动的最大重量。」
  - 「若你拖拽、抬起、推动的重量超出了你可以承载的最大重量，则你的速度将被限制为至多 5 尺。」
  - 載重表：微型 力量 ×7.5／×15；小型／中型 ×15／×30；大型 ×30／×60；巨型 ×60／×120；超巨型 ×120／×240（載重／拖拽・抬起・推動）。
- XPHB p.20「携带物件」：平常不必在意重量，攜帶異常沉重或過多物件時，DM 可要求套用「载重」規則。
- 2014 的變體負重（PHB p.176「负重 Encumbrance」，5 倍／10 倍力量、速度 −10／−20）**不採用**（使用者決定）。

### 19b. 實作

- `encumbrance()`：物品重量＋錢幣重量（每 50 枚 1 磅）＝總重；`over`（總重 ＞ 載重）、`overDragLift`（總重 ＞ 拖拽／抬起／推動上限）。剛好等於不算超過。
- 物品頁：重量明細（物品／錢幣／總重）、負重條（以拖拽上限為滿格，載重處有刻度）、超重時紅框加上原文兩段與來源徽章。
- 角卡速度：超重時步行速度至多 5 呎，旁邊 ⚠ 圖示（tooltip 寫原因）；`Sheet.speedNotes` 也收重甲力量不足 −10 的原因。飛行、游泳等其他速度原文沒規定，不改。
- 審卡報告警示區：新增「超過載重」。

## 20. M7-6：語言資料、分類與合併

### 20a. 欄位（`data/rules.js` 的 `language`，160 筆）

| 欄位 | 筆數 | 說明 |
| --- | --- | --- |
| `type` | 86 | `standard` 57、`exotic` 16（2014）、`rare` 9（2024）、`secret` 4；74 筆沒有（多半是 MM／XMM 的怪物語言） |
| `script` | 77 | 文字（中文，例如「矮人语」）；有 `none`。**XPHB 的語言都沒有這欄**（2024 PHB 拿掉了文字欄） |
| `typicalSpeakers` | 121 | 陣列，內含 `{@creature}`、`{@filter}` 標籤 |
| `origin` | 36 | XPHB 用這欄代替典型使用者（例如矮人语 → 「矮人」） |
| `entries` | 37 | 說明文字 |
| `dialects`、`fonts` | 3、1 | 不用 |

### 20b. 重複條目（同一個英文名）

46 個英文名有多筆，差異如下：

- **類型不一致**：天界语 ERLW `exotic`、GGR `standard`、XPHB `rare`；龙语 PHB `exotic`、XPHB `standard`；兽人语 ERLW `exotic`、XPHB `standard`。
- **秘密語言**：德鲁伊语、盗贼黑话在 PHB／GGR 標 `secret`，**XPHB 標 `rare`**（2024 PHB 把它們列在稀有語言表，但只能由職業特性給予）。
- **文字不一致**：巨人语 ERLW「巨人语」、GGR／MOT「牛头人语」、PHB「矮人语」；地精语 ERLW「地精语」、GGR「通用语」、PHB「矮人语」。
- 其餘多為 MM→XMM、SCAG→FRHoF 的重印，內容相同。
- 任務檔提到的 DSotDQ 矮人語：目前打包的資料（官方群組白名單）沒有 DSotDQ 的語言條目。

### 20c. 決定（預設）

- **合併**：以存檔 key（英文名小寫，`languageKey`）分組，一列＝一種語言；代表條目沿用 `languageList` 的規則（XPHB 優先）。**存檔 key 不變**，所以不必升級存檔、也不用停下來問。
- 來源欄列出目前書目下所有可見版本的徽章；詳情展開各版本的類型、文字與說明。
- 類型：代表條目的 type（沒有就取第一個有 type 的版本）；`exotic` 與 `rare` 同一組「稀有」；**任一版本標 `secret` 就是「秘密」**（不限目前書目），所以 XPHB 的德魯伊語、盜賊黑話也算秘密語言。
- 文字：代表條目沒有時取其他版本的第一個（因此 XPHB 矮人语顯示 ERLW／PHB 的「矮人语」）。
- 建角的「標準語言（選 2）」：秘密語言不列出；稀有與其他預設隱藏，打開開關才列，名稱旁標「稀有語言（需 DM 同意）」，選了會在審卡報告警示區出現「稀有語言」。種族、背景、特性明確給予或允許任選的語言（`anyStandard`、`any`…）照原有邏輯。

### 20d. 通用模組（M7-6 抽出）

- `src/data/facetFilter.ts`：三態標籤、AND／OR、全選／清除、`collectTags`、`sortRows`／`compareValues`（數字依大小、undefined 排最後）。`spellFilter.ts` 改為建立在它之上（re-export，舊的 import 不變）。
- `src/components/filter/FacetFilterPanel.vue`（原 `SpellFilterPanel.vue`，改為 generic 元件，預設 slot 可放範圍篩選）。
- `src/components/table/SortableTable.vue`（`SpellPickTable` 改用它）。
- `src/stores/prefsStorage.ts`（localStorage 讀寫）＋ `src/stores/tablePrefs.ts`（語言、物品表格的偏好；spellPrefs 也改用 prefsStorage）。

## 21. M7-7：物品表格的欄位與分類

### 21a. 欄位調查（`data/items.js`，2559 筆）

- **一般／魔法**：沿用 M7-3 的 `isMundaneItem`（`rarity === 'none'`）。官方群組下一般 531、魔法 1155（另 873 筆重印舊版預設隱藏）。
- **類型**：`type` 是「代碼|來源」（`M|XPHB`）；763 筆沒有 type（多半是奇物，`wondrous: true`）。類型中文名原本沒打包，M7-7 把 `items-base.json` 的 `itemType`（67 筆）加進 `data/rules.js`（`itemType` 以縮寫互相 `_copy`，管線加了 `itemType` 專用查找鍵）。沒有 type 的奇物顯示「奇物」，其他顯示「其他」。
- **物品屬性**：`property` 陣列，「代碼|來源」字串，另有 1 筆物件寫法 `{uid: "2H|XPHB", note}`。名稱取 `itemProperty` 的 `entries[0].name`（双手、灵巧…）；不同代碼同名時附代碼（`弹药（A）`、`弹药（AF）` 火器彈藥）。註：資料把 Light 譯成「光线」，保留原文。
- **武器精通**：`mastery` 陣列（8 種，XPHB）。
- **同調**：`reqAttune` 為 `true`（673 筆）＝需要同調；字串（263 筆，例如「由法师」「需已丧失一只手…」）＝需特定條件才能同調，原文在詳情顯示；沒有＝不需要。
- **稀有度**：有 5 筆是簡體中文值（珍稀、极珍稀、传说），併回英文代碼。
- **價值**：`value` 以銅幣計（817 筆有）；**重量** `weight`（1001 筆有）。沒有值的在排序時一律排最後、範圍篩選有設值時排除。

### 21b. 分類（基礎／通用變體／特定變體／其他）

- 基礎：`isBaseItem`（226 筆，items-base 的 baseitem）。
- 通用變體：`isGenericVariant`（214 筆，管線已把 `magicvariants.json` 展開成「+1 武器」這類通用條目，type `GV`）。
- **特定變體：管線沒有產生**（5etools 網站在執行期把 magicvariant × baseitem 組合成「+1 長劍」等，我們沒有做）。所以分類篩選只會出現基礎、通用變體、其他（`collectTags` 只列資料裡有的）。是否納入特定變體記在待決 §13 第 10 項，M7 不擴充資料。
- 有 `baseItem` 欄位的（198 筆，例如 +1 调律者之鼓）是獨立的具名物品，歸「其他」。

### 21c. 實作

- `src/data/itemTable.ts`（`itemRow`、`itemLabels`、`filterItems`（含價值 GP／重量範圍）、`sortItems`）、`src/components/items/ItemTables.vue`。資料瀏覽器的物品分頁與物品欄「＋ 從物品表新增」共用；篩選偏好存 `tablePrefs`（`browser:item`、`inventory:add`；兩個表各自記排序）。

## 22. M8-1：不可重複的專長

### 22a. 資料怎麼標可重複

- 結構化欄位 **`repeatable: true`**（另有同值的 `repeatableHidden`），打包資料中 5 筆：XPHB 属性值提升、魔法学徒、熟习、元素掌控，以及 AU 学派宗师之恩惠。原文都有「复选 Repeatable：你可以多次选择这个专长」段落。
- 版本條目（例如 `feat|魔法学徒；牧师|XPHB`，`versionOf: feat|魔法学徒|XPHB`）也帶 `repeatable`；判斷重複時一律換算成基礎專長（`versionOf`）。
- 例外：**PHB（2014）元素掌控**原文寫「你可以重复多次选择该专长」，但資料沒有 `repeatable`。依欄位判斷，所以 2014 版會被當成不可重複（2024 啟用時它是重印舊版，預設隱藏）。記在待決 §13 第 11 項。

### 22b. 實作（`src/rules/build.ts` `resolveFeatDuplicates`）

- 在建角最後一步，統計每個基礎專長的所有取得途徑（背景、職業等級的屬性值提升、戰鬥風格、史詩恩惠、種族或其他專長給的）。
- 專長欄位的選項：已擁有、不可重複 → `disabled`「已在战士 4 级選過，此專長不可重複」；可重複 → `note`「可重複」。
- 已經重複（改掉較早的選擇、或舊存檔）：較晚取得的欄位加 `ChoiceSlot.conflicts` 與警示，審卡報告警示區「重複專長」；不清除選擇、不升 `schemaVersion`。
- 順帶修正：XPHB 屬性值提升特性原文是「你获得属性值提升专长**或其他你满足条件的专长**」，原本欄位只列通用專長（`G`），改成列出全部專長，由先決條件把關；因此先決條件「特性：战斗风格」改為實際檢查角色有沒有同名特性（原本只顯示文字）。史詩恩惠由「19 級以上」擋住。

## 23. M9：法術系統重整

### 23a. M9-0 現況量測（2026-10-24，`raw/` = `5cc0bbe`）

**版面**（Playwright 以 `file://` 開截圖角色＝法師 6 死灵师／奇械師 4，法術書分頁）：

| 視窗 | 元素 | overflow | max-height | 實際高度 | 內容高度 |
| ---- | ---- | ---- | ---- | ---- | ---- |
| 1366×768 | `SpellPicker .table-wrap`（法術表格） | auto | `60vh`＝461px | 461 | 5869（內捲） |
| 1366×768 | `KnownSpells aside.side`（已學會） | auto | `calc(100vh - 16px)`＝752px | 620 | 618 |
| 1366×768 | `BuilderView aside.side`（左側步驟欄） | auto | 744px | 703 | 703 |
| 1920×1080 | `.table-wrap` | auto | 648px | 648 | 5032（內捲） |
| 1920×1080 | 已學會／步驟欄 | auto | 1064／1056px | 620／703 | 不捲 |

結論：表格被 `60vh` 包住內捲，頁面本身也會捲（1366 時文件高 971px）→ 雙捲軸。沒有水平捲軸、console 零錯誤。分頁列在 1366 寬時折成兩排（三個 `死灵师・法術 0/1`）。

**資料統計**（打包後的 `public/data/spells.js`，共 963 道；「官方＋隱藏重印」＝ `official` 群組且不顯示重印舊版，不含 TCE 擴充法術表）：

| 職業清單 | 打包資料 | 官方＋隱藏重印 |
| ---- | ---- | ---- |
| 法師 XPHB | 385 | 378 |
| 法師 PHB | 321 | 89 |
| 術士 XPHB | 247 | 243 |
| 吟遊詩人 XPHB | 179 | 178 |
| 牧師 XPHB | 136 | 136 |
| 德魯伊 XPHB | 186 | 185 |
| 奇械師 EFA | 112 | 109 |
| 魔契師 XPHB | 161 | 158 |
| 聖武士 XPHB | 56 | 56 |
| 遊俠 XPHB | 74 | 74 |

任務檔的參考值（法師 XPHB 403、術士 257、吟遊詩人 182）是上游全部書目的數字；打包只收白名單來源，所以較少。

說明長度（`entries`＋`entriesHigherLevel`，去標籤後的簡體字元數）：中位數 259、P90 537、P99 1070、最長 1609（`spell|祈愿术|XPHB`）。內含表格的法術 21 道（例如卜筮术、转生术、操控天气、困惑术、传送术、虹光喷射，XPHB 與 PHB 各一份）。與參考值的差異來自計算方式（這裡含升環段落）。

**渲染**：法術書分頁打開「顯示不符合的法術（反灰）」後 525 列，從點擊到畫面更新約 **195–203 ms**（含規則引擎重算與反灰原因計算）。超過 100ms → M9-5 改寫清單時對列加 `v-memo`（只在該列狀態改變時重繪）。不做虛擬捲動：M9-6 要求整頁捲動＋表頭 sticky，虛擬捲動與整頁捲動搭配複雜，且 600 列以內 `v-memo` 已足夠。

### 23b. `additionalSpells` 的實際形狀（打包資料抽樣）

- 除了任務檔 1.5 節列的形式，還有：
  - **等級鍵兩層**：`known: {"1": {"_": [{choose: "level=0|class=法师"}]}}`（XPHB 高等精靈血系等 28 處）。外層是角色等級，內層 `_` 照常。
  - **`prepared` 內含次數**：`prepared: {"_": {daily: {"1": [...]}}}`（51 處，例如 AU 魔宠密友的寻获魔宠）＝永遠準備，另外可免費施放 1/長休。
  - `innate` 直接是陣列（不分 daily／will）：2 處，視為隨意施放以外的天生施法（不註明次數）。
  - `daily` 的鍵除了 `"1"`、`"1e"`、`"pb"`，還有 `"int"`、`"cha"`（各 1 處：次數＝該屬性調整值）。
- AU 死灵师（`subclass|死灵师|AU|法师|XPHB`）：`known` 3 級＝寻获魔宠（固定）＋2 個 `level=0;1;2|class=法师|school=N`，5、7…17 級各 1 個（上限每次 +1 環）。篩選字串**包含 0 環**，依資料允許選戲法（選了戲法就是免費戲法，不進法術書）。6 級另有 `prepared` 與 `innate.daily` 的活化死尸。
- 截圖角色的「魔宠密友」是 AU 起源專長 `feat|魔宠密友|AU`：`ability.choose` int/wis/cha，`prepared._.daily.1 = [寻获魔宠]`。

### 23c. M9-2 規則引擎實作（`src/rules/spells/`、`src/rules/build.ts`）

- `SpellGrant.mode`／`uses` 改成 `kind`（M9.md §1.1）＋`free`＋`castModes`。`bonus` kind 沒有用到：§1.2 的對照表已把每種宿主的 `known` 對應到 cantrip／spellbook／known／always，不需要獨立的 bonus。
- 選擇欄位的 key 改變（M9-3 要寫遷移）：
  - `additionalSpells` 的選擇：原本每個 `{choose}` 一個欄位 `<前綴>:spells:<序號>`，改為同一特性、同一 kind 合併成一個欄位 `<前綴>:spells:<kind>`（例如 `subclass|死灵师|AU|法师|XPHB:spells:spellbook`、魔法學徒的 `…:spells:cantrip` 與 `…:spells:innate`）。選擇值**位置有意義**（第 i 格的條件在 `spell.slots[i]`，空格為 `''`），放錯格視為未選。
  - 新增魔契師 `class|魔契师|XPHB:arcanum`（秘法奧義，每格一個環位）。
  - 法師仍是 `:spellbook`（付費抄寫）＋`:prepared` 兩個欄位，`spell.book` 掛狀態機需要的名額、免費抄寫、永遠準備清單；M9-3 改存檔格式。
- 「已由其他來源取得」：戲法池子對已有的戲法、已知／準備池子對永遠準備（含 2024 種族專長「也可用法術位」的天生法術、額外已知法術）的選項加 `disabled`；法術書照常可抄。
- 擴充清單（`expanded`）：職業／子職給的只擴充該職業；種族、專長給的擴充所有施法職業。`{all: "…"}` 篩選字串也支援（XPHB 吟遊詩人魔法奧秘 10 級起 1–5 環、`s6`～`s9` 依可施展環位）。
- 篩選字串新增支援 `source=EGW`、`components & miscellaneous=仪式`（大小寫不拘）、`spell attack=m;r;o`。原本這三種會被忽略（等於不限）。
- `inherit` 施法屬性：取同一個專長所選的屬性加值（原本誤用職業的施法屬性）。
- 法術列（`spellRows`）同一道法術合併成一列，`grants` 依「準備＞永遠準備＞已知＞秘法奧義＞戲法＞天生＞法術書」排序，`variants` 列出各來源的 DC／攻擊加值／次數。豁免型法術的顯示改為「体质豁免 DC 17」。
- 資料發現：XPHB 法術的 `classes` 沒有 EFA 奇械師（例如 XPHB 修复术），奇械師清單裡出現的是 PHB 版（`classSource: TCE`）。既有行為，M9 不處理。

### 23d. M9-3 存檔格式（`schemaVersion` 2）

- `Character.spellbooks[職業 id] = { spellbook: { 法術 id: {} }, prepared: 法術 id[] }`，載入時驗證 `prepared ⊆ spellbook`（不在書裡的補進去）。
- **與任務檔的差異**：任務檔寫 `spellbook: { spellId → { free?: poolId } }`。實作上子職的免費抄寫（學派學者、寻获魔宠）**不寫進** `spellbook`，由子職的選擇池（`<子職>:spells:spellbook`，`poolId → slotIndex → spellId`）決定，避免兩處存同一份資料。`free` 欄位保留在型別上，有標記的條目同樣不算名額。
- 付費抄寫的法術後來又由子職免費加入（例如基準角色的魔法飞弹：DDB 上抄進書，塑能學者又免費給一次）：免費的優先，不再占書的名額，法術書欄位顯示提示「可以另抄一道」；玩家下次修改法術書時從存檔移除。
- v1 遷移（`migrateSpellsV1`）：法師兩個欄位 → `spellbooks`；`<前綴>:spells:<序號>` 依序號串成 `<前綴>:spells:legacy`。因為遷移時不看資料、不知道每個序號是哪一種取得方式，所以由規則引擎建立池子時把 legacy 裡符合條件的法術放進空格（池子已有新格式的選擇就不讀 legacy）。`legacy` 欄位留在存檔裡不影響結果，匯出再匯入完全相同。
- 補進法術書後超出名額：規則引擎截掉多出來的（`addSlot` 的 `slice`），準備欄位對被截掉的法術顯示「已準備但不在法術書（法術書已滿），改為未選擇」。
