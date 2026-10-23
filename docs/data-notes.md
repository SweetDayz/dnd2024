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

## 10. 建置輸出（`npm run build-data`）

管線在 `scripts/lib/pipeline.ts`（純函式，測試在 `scripts/lib/__tests__/`），`scripts/build-data.ts` 只負責讀檔與寫檔。

| 檔案 | 內容 | 大小（official） |
| ---- | ---- | ---- |
| `sources.js` | 白名單內的來源對照表 | 6 KB |
| `races.js` | race 127、subrace 70 | 367 KB |
| `backgrounds.js` | background 161 | 600 KB |
| `feats.js` | feat 284 | 301 KB |
| `optionalfeatures.js` | optionalfeature 221 | 136 KB |
| `items.js` | item 2449（含 `isBaseItem` 基礎物品、`isItemGroup` 物品組） | 2.06 MB |
| `spells.js` | spell 965（含 `classes` 職業對照） | 1.38 MB |
| `classes.js` | class 26、subclass 312、classFeature 654、subclassFeature 1416 | 1.88 MB |
| `rules.js` | language、skill、condition、disease、status、variantrule、sense、action、itemProperty、itemMastery（給 tooltip 用） | 693 KB |

合計約 7.4 MB。每筆條目都有 `id`、`kind`、`name`、`engName`、`source`、`page`、`edition`，必要時有 `reprintedAs`（id 陣列）、`tceOptional`。

- 協力者（`class-sidekick.json`）不是玩家職業，不打包。
- 刪掉的欄位見 `DROP_FIELDS`（fluff、翻譯者、SRD 標記、載具數值、foundry 等）。
- `isClassFeatureVariant` 轉成 `tceOptional` 後刪除。

## 11. 來源對照表

由 `npm run source-table` 從 `books.json`／`adventures.json` 產生（下方區塊會被覆蓋，不要手改）。
`official` 群組定義在 `src/data/sourceGroups.ts`；建置期白名單 = 所有群組的聯集。

**暫定的 `official` 選法**：上游分類為 `core`／`supplement`／`setting` 的規則書，加上含種族、背景、專長、法術或子職的 `supplement` 冒險（BGDIA、DSotDQ、GoS、IDRotF、ToA、WBtW）。
排除：DM 帷幕（screen）、食譜（recipe）、編織（homecraft）、Sage Advice（other）、冒險者聯盟（organized-play）、`setting-alt`（Plane Shift 系列、LFL、NF）、`supplement-alt`（OGA、ABH、塔羅牌等）、只有魔法物品的冒險。

資料中出現、但兩份書目表都沒有的來源：`EEPC`（元素邪惡玩家手冊，6 個種族，均已被 MPMM 重印）、`UATheMysticClass`（UA）、`EET`、`HAT-LMI`、`MCV2DC`、`RoTOS`、`TftYP`（只有零星物品）→ 目前一律不納入。

<!-- source-table:begin -->

共 163 筆（書 65、冒險 98）。「官方」欄 ✅ 代表目前在暫定的 `official` 群組內。

| 官方 | 代碼 | 中文名 | 英文名 | 出版日期 | 類型 | 上游分類 |
| :--: | ---- | ------ | ------ | -------- | ---- | -------- |
|  | LMoP | 凡戴尔的失落矿坑 | Lost Mine of Phandelver | 2014-07-15 | 冒險 | supplement |
|  | HotDQ | 龙后的宝山 | Hoard of the Dragon Queen | 2014-08-19 | 冒險 | supplement |
| ✅ | PHB | 玩家手册（2014） | Player's Handbook (2014) | 2014-08-19 | 規則書 | core |
| ✅ | MM | 怪物手册（2014） | Monster Manual (2014) | 2014-09-30 | 規則書 | core |
|  | RoT | 提亚马特崛起 | Rise of Tiamat | 2014-11-04 | 冒險 | supplement |
| ✅ | DMG | 城主指南（2014） | Dungeon Master's Guide (2014) | 2014-12-09 | 規則書 | core |
|  | Screen | 地下城主帷幕 | Dungeon Master's Screen | 2015-01-20 | 規則書 | screen |
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
| ✅ | ToA | 湮灭之墓 | Tomb of Annihilation | 2017-09-19 | 冒險 | supplement |
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
| ✅ | GoS | 盐沼幽魂 | Ghosts of Saltmarsh | 2019-05-21 | 冒險 | supplement |
|  | HftT | 寻找特萨尔蛇蜥 | Hunt for the Thessalhydra | 2019-05-21 | 冒險 | supplement-alt |
| ✅ | AI | 艾奎兹玄有限责任公司 | Acquisitions Incorporated | 2019-06-18 | 規則書 | supplement |
|  | OoW | 位面游荡仪 | The Orrery of the Wanderer | 2019-06-18 | 冒險 | supplement |
|  | DIP | 基础包：冰塔峰之龙 | Essentials Kit: Dragon of Icespire Peak | 2019-06-24 | 冒險 | supplement |
|  | DC | 基础包：神圣的争夺 | Essentials Kit: Divine Contention | 2019-09-03 | 冒險 | supplement |
|  | SDW | 基础包：沉睡巨龙醒转 | Essentials Kit: Sleeping Dragon's Wake | 2019-09-03 | 冒險 | supplement |
|  | SLW | 基础包：风暴领主之怒 | Essentials Kit: Storm Lord's Wrath | 2019-09-03 | 冒險 | supplement |
| ✅ | BGDIA | 博德之门: 坠入阿弗纳斯 | Baldur's Gate: Descent Into Avernus | 2019-09-18 | 冒險 | supplement |
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
| ✅ | IDRotF | 冰风谷: 冰霜少女的雾凇 | Icewind Dale: Rime of the Frostmaiden | 2020-09-15 | 冒險 | supplement |
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
| ✅ | WBtW | 巫光之外的荒野 | The Wild Beyond the Witchlight | 2021-09-21 | 冒險 | supplement |
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
| ✅ | DSotDQ | 龙枪:龙后之影 | Dragonlance: Shadow of the Dragon Queen | 2022-11-22 | 冒險 | supplement |
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

## 12. 待決事項

（之後一起問使用者；目前先用預設值繼續。）

1. **`official` 群組的確切範圍**：見 §11 的暫定選法與對照表「官方」欄。特別是：(a) 冒險模組要不要收？(b) `setting-alt`（Plane Shift 系列、Lorwyn: First Light）與 `supplement-alt`（Astarion's Book of Hungers 等）要不要收？(c) EEPC 不在上游書目表，要不要補？
2. **`public/data/*.js` 不進 git**：它們是從 `raw/` 產生的建置產物（數 MB），已加入 `.gitignore`；新環境要先跑 `npm run fetch-data && npm run build-data` 再 `npm run build`。日後做 GitHub Pages 自動部署時，CI 也要跑這兩步。
