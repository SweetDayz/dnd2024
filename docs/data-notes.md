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

（之後一起問使用者；目前先用預設值繼續。）

1. **只有原文、沒有結構化欄位的數值效果**（例如野蠻人／武僧的無甲防禦、警覺專長的先攻、健壯專長的 HP、法師學者的專精範圍）：目前依 CLAUDE.md §6「不做人工對照表」，列在效果頁並可手動覆寫，不會自動計入。使用者 2026-10-23 要求「新人一來就什麼都算對」，這與 §6 有衝突：要達到完全自動，需要「從原文自動解析出數值效果」（例如偵測「AC 等於 10＋敏捷＋體質」這類句型）或允許少量人工規則。請決定方向。

2. **（M4-5）XPHB 遊蕩者「盜賊黑話」的第二項語言**：原文「習得盜賊黑話和語言表中的一項語言」，沒有結構化欄位。目前自動給盜賊黑話，第二項語言沒有選擇欄位。預設做法：維持現狀並在效果頁列出原文；若要自動化，可併入 §13 第 1 項的「原文數值句型解析」一起做。
3. **（M4-6）FVTT 技能排序後五項的位置**：歷史、醫藥、說服、調查、隱匿依筆畫推算，見 `src/data/skillOrder.ts`，請對照 Foundry VTT 繁中版確認。

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
