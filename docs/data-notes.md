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
- 種族另有 `_versions`（17 筆，例如阿斯莫的三種天界啟示）；feat 有 2 筆。M1 不展開，M2 選種族時再處理。

## 4. 重印（reprint）

- 只有 `reprintedAs`，**沒有 `isReprinted`**。值有兩種格式：字串 `"人马|MPMM"`，或物件 `{ "uid": "警戒龙纹|EFA", "tag": "feat" }`（tag 指出目標類別，跨類別重印）。
- 鏈狀：例如 EEPC 鳥羽人 → MPMM → （無 XPHB 版）；DMG 阿斯莫 → XPHB。
- **隱藏規則（執行期判斷）**：條目若有任一 `reprintedAs` 目標的來源**目前已啟用**，就視為「已被取代」，預設隱藏；目標書沒啟用時舊版照常顯示。這樣關掉 XPHB 時 2014 條目會自動回來。

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

## 10. 待決事項

（之後一起問使用者；目前先用預設值繼續。）
