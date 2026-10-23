# 資料完整性稽核（data-audit）

> 由 `npm run build-data` 自動產生（`scripts/audit-data.ts`），不要手改。
> 上游：https://github.com/tjliqy/5etools-cn `cn2.0` `5cc0bbe`（2026-09-30T07:08:51Z）。
> 「可見」＝預設書目 `official`、隱藏被重印取代的版本、TCE 可選規則關閉時，資料瀏覽器與建角會列出的數量。

**未說明原因的丟棄：0**

## 1. 摘要

| 類別 | raw | 輸出 | 白名單外 | 母條目不存在 | 重複 | 整檔排除 | 未說明 | 重印隱藏 | TCE 隱藏 | 可見 |
| ---- | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: |
| 種族 `race` | 160 | 126 | 34 | 0 | 0 | 0 | 0 | 52 | 1 | 73 |
| 亞種 `subrace` | 98 | 74 | 24 | 0 | 0 | 0 | 0 | 42 | 0 | 32 |
| 職業 `class` | 30 | 26 | 1 | 0 | 0 | 3 | 0 | 13 | 0 | 13 |
| 子職 `subclass` | 330 | 310 | 20 | 0 | 0 | 0 | 0 | 126 | 0 | 184 |
| 職業特性 `classFeature` | 677 | 607 | 23 | 0 | 0 | 47 | 0 | 0 | 29 | 578 |
| 子職特性 `subclassFeature` | 1499 | 1408 | 87 | 4 | 0 | 0 | 0 | 0 | 16 | 1392 |
| 背景 `background` | 171 | 137 | 34 | 0 | 0 | 0 | 0 | 12 | 0 | 125 |
| 專長 `feat` | 305 | 275 | 30 | 0 | 0 | 0 | 0 | 50 | 0 | 225 |
| 可選特性 `optionalfeature` | 221 | 221 | 0 | 0 | 0 | 0 | 0 | 84 | 10 | 127 |
| 物品（含基礎物品、物品組、泛用魔法變體） `item` | 3091 | 2559 | 531 | 0 | 1 | 0 | 0 | 873 | 0 | 1686 |
| 法術 `spell` | 969 | 963 | 6 | 0 | 0 | 0 | 0 | 389 | 0 | 574 |
| 語言 `language` | 201 | 160 | 41 | 0 | 0 | 0 | 0 | 44 | 0 | 116 |
| 技能 `skill` | 36 | 36 | 0 | 0 | 0 | 0 | 0 | 18 | 0 | 18 |
| 狀態 `condition` | 30 | 30 | 0 | 0 | 0 | 0 | 0 | 15 | 0 | 15 |
| 疾病 `disease` | 29 | 18 | 11 | 0 | 0 | 0 | 0 | 3 | 0 | 15 |
| 狀況（status） `status` | 5 | 5 | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 3 |
| 規則條目 `variantrule` | 231 | 219 | 12 | 0 | 0 | 0 | 0 | 2 | 0 | 217 |
| 感官 `sense` | 8 | 8 | 0 | 0 | 0 | 0 | 0 | 4 | 0 | 4 |
| 動作 `action` | 48 | 48 | 0 | 0 | 0 | 0 | 0 | 19 | 0 | 29 |
| 物品屬性 `itemProperty` | 27 | 27 | 0 | 0 | 0 | 0 | 0 | 12 | 0 | 15 |
| 武器精通 `itemMastery` | 8 | 8 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 8 |
| 物品類型 `itemType` | 67 | 67 | 0 | 0 | 0 | 0 | 0 | 26 | 0 | 41 |

## 2. 各類別 × 來源（白名單內）

raw 與輸出不同的來源才有差異（例如同名重複），其餘應相等。

<details><summary>種族（19 個來源）</summary>

| 來源 | raw | 輸出 | 重印隱藏 | TCE 隱藏 | 可見 |
| ---- | --: | --: | --: | --: | --: |
| AAG | 6 | 6 | 0 | 0 | 6 |
| AI | 1 | 1 | 0 | 0 | 1 |
| DMG14（DMG） | 17 | 17 | 2 | 0 | 15 |
| EEPC | 2 | 2 | 2 | 0 | 0 |
| EFA | 5 | 5 | 0 | 0 | 5 |
| EGW | 1 | 1 | 1 | 0 | 0 |
| ERLW | 8 | 8 | 8 | 0 | 0 |
| FTD | 3 | 3 | 2 | 0 | 1 |
| GGR | 6 | 6 | 3 | 0 | 3 |
| MOT | 5 | 5 | 4 | 0 | 1 |
| MPMM | 30 | 30 | 5 | 0 | 25 |
| MTF | 1 | 1 | 1 | 0 | 0 |
| PHB14（PHB） | 9 | 9 | 8 | 0 | 1 |
| RHW | 4 | 4 | 0 | 0 | 4 |
| SCC | 1 | 1 | 0 | 0 | 1 |
| TCE | 1 | 1 | 0 | 1 | 0 |
| VGM | 13 | 13 | 13 | 0 | 0 |
| VRGR | 3 | 3 | 3 | 0 | 0 |
| PHB24（XPHB） | 10 | 10 | 0 | 0 | 10 |

</details>

<details><summary>亞種（9 個來源）</summary>

| 來源 | raw | 輸出 | 重印隱藏 | TCE 隱藏 | 可見 |
| ---- | --: | --: | --: | --: | --: |
| DMG14（DMG） | 1 | 1 | 0 | 0 | 1 |
| EEPC | 4 | 4 | 0 | 0 | 4 |
| EGW | 4 | 4 | 0 | 0 | 4 |
| ERLW | 17 | 17 | 17 | 0 | 0 |
| MPMM | 4 | 4 | 0 | 0 | 4 |
| MTF | 16 | 16 | 7 | 0 | 9 |
| PHB14（PHB） | 15 | 15 | 14 | 0 | 1 |
| SCAG | 10 | 10 | 1 | 0 | 9 |
| VGM | 3 | 3 | 3 | 0 | 0 |

</details>

<details><summary>職業（4 個來源）</summary>

| 來源 | raw | 輸出 | 重印隱藏 | TCE 隱藏 | 可見 |
| ---- | --: | --: | --: | --: | --: |
| EFA | 1 | 1 | 0 | 0 | 1 |
| PHB14（PHB） | 12 | 12 | 12 | 0 | 0 |
| TCE | 1 | 1 | 1 | 0 | 0 |
| PHB24（XPHB） | 12 | 12 | 0 | 0 | 12 |

</details>

<details><summary>子職（14 個來源）</summary>

| 來源 | raw | 輸出 | 重印隱藏 | TCE 隱藏 | 可見 |
| ---- | --: | --: | --: | --: | --: |
| AU | 8 | 8 | 0 | 0 | 8 |
| BGG | 2 | 2 | 0 | 0 | 2 |
| DMG14（DMG） | 4 | 4 | 0 | 0 | 4 |
| EFA | 5 | 5 | 0 | 0 | 5 |
| EGW | 6 | 6 | 0 | 0 | 6 |
| FRHoF | 8 | 8 | 0 | 0 | 8 |
| FTD | 4 | 4 | 0 | 0 | 4 |
| PHB14（PHB） | 80 | 80 | 76 | 0 | 4 |
| RHW | 7 | 7 | 0 | 0 | 7 |
| SCAG | 12 | 12 | 4 | 0 | 8 |
| TCE | 60 | 60 | 28 | 0 | 32 |
| VRGR | 4 | 4 | 4 | 0 | 0 |
| XGE | 62 | 62 | 14 | 0 | 48 |
| PHB24（XPHB） | 48 | 48 | 0 | 0 | 48 |

</details>

<details><summary>職業特性（4 個來源）</summary>

| 來源 | raw | 輸出 | 重印隱藏 | TCE 隱藏 | 可見 |
| ---- | --: | --: | --: | --: | --: |
| EFA | 19 | 19 | 0 | 0 | 19 |
| PHB14（PHB） | 254 | 254 | 0 | 0 | 254 |
| TCE | 51 | 51 | 0 | 29 | 22 |
| PHB24（XPHB） | 283 | 283 | 0 | 0 | 283 |

</details>

<details><summary>子職特性（14 個來源）</summary>

| 來源 | raw | 輸出 | 重印隱藏 | TCE 隱藏 | 可見 |
| ---- | --: | --: | --: | --: | --: |
| AU | 58 | 58 | 0 | 0 | 58 |
| BGG | 6 | 6 | 0 | 0 | 6 |
| DMG14（DMG） | 17 | 17 | 0 | 0 | 17 |
| EFA | 41 | 41 | 0 | 0 | 41 |
| EGW | 20 | 20 | 0 | 0 | 20 |
| FRHoF | 56 | 56 | 0 | 0 | 56 |
| FTD | 12 | 12 | 0 | 0 | 12 |
| PHB14（PHB） | 302 | 302 | 0 | 0 | 302 |
| RHW | 44 | 44 | 0 | 0 | 44 |
| SCAG | 47 | 47 | 0 | 0 | 47 |
| TCE | 260 | 256 | 0 | 16 | 240 |
| VRGR | 12 | 12 | 0 | 0 | 12 |
| XGE | 228 | 228 | 0 | 0 | 228 |
| PHB24（XPHB） | 309 | 309 | 0 | 0 | 309 |

</details>

<details><summary>背景（18 個來源）</summary>

| 來源 | raw | 輸出 | 重印隱藏 | TCE 隱藏 | 可見 |
| ---- | --: | --: | --: | --: | --: |
| AAG | 2 | 2 | 0 | 0 | 2 |
| AI | 5 | 5 | 0 | 0 | 5 |
| AU | 10 | 10 | 0 | 0 | 10 |
| BGG | 2 | 2 | 0 | 0 | 2 |
| BMT | 2 | 2 | 0 | 0 | 2 |
| EFA | 17 | 17 | 0 | 0 | 17 |
| EGW | 7 | 7 | 0 | 0 | 7 |
| ERLW | 1 | 1 | 1 | 0 | 0 |
| FRHoF | 18 | 18 | 0 | 0 | 18 |
| GGR | 10 | 10 | 0 | 0 | 10 |
| MOT | 1 | 1 | 0 | 0 | 1 |
| PHB14（PHB） | 20 | 20 | 9 | 0 | 11 |
| RHW | 4 | 4 | 0 | 0 | 4 |
| SCAG | 13 | 13 | 0 | 0 | 13 |
| SCC | 5 | 5 | 0 | 0 | 5 |
| SatO | 2 | 2 | 0 | 0 | 2 |
| VRGR | 2 | 2 | 2 | 0 | 0 |
| PHB24（XPHB） | 16 | 16 | 0 | 0 | 16 |

</details>

<details><summary>專長（15 個來源）</summary>

| 來源 | raw | 輸出 | 重印隱藏 | TCE 隱藏 | 可見 |
| ---- | --: | --: | --: | --: | --: |
| AU | 29 | 29 | 0 | 0 | 29 |
| BGG | 8 | 8 | 0 | 0 | 8 |
| BMT | 1 | 1 | 0 | 0 | 1 |
| EFA | 28 | 28 | 0 | 0 | 28 |
| ERLW | 2 | 2 | 1 | 0 | 1 |
| FRHoF | 34 | 34 | 0 | 0 | 34 |
| FTD | 3 | 3 | 0 | 0 | 3 |
| MTF | 1 | 1 | 0 | 0 | 1 |
| PHB14（PHB） | 42 | 42 | 39 | 0 | 3 |
| RHW | 11 | 11 | 0 | 0 | 11 |
| SCC | 2 | 2 | 0 | 0 | 2 |
| SatO | 7 | 7 | 0 | 0 | 7 |
| TCE | 15 | 15 | 10 | 0 | 5 |
| XGE | 15 | 15 | 0 | 0 | 15 |
| PHB24（XPHB） | 77 | 77 | 0 | 0 | 77 |

</details>

<details><summary>可選特性（6 個來源）</summary>

| 來源 | raw | 輸出 | 重印隱藏 | TCE 隱藏 | 可見 |
| ---- | --: | --: | --: | --: | --: |
| AU | 8 | 8 | 0 | 0 | 8 |
| EFA | 4 | 4 | 0 | 0 | 4 |
| PHB14（PHB） | 82 | 82 | 52 | 0 | 30 |
| TCE | 47 | 47 | 22 | 10 | 15 |
| XGE | 22 | 22 | 10 | 0 | 12 |
| PHB24（XPHB） | 58 | 58 | 0 | 0 | 58 |

</details>

<details><summary>物品（含基礎物品、物品組、泛用魔法變體）（29 個來源）</summary>

| 來源 | raw | 輸出 | 重印隱藏 | TCE 隱藏 | 可見 |
| ---- | --: | --: | --: | --: | --: |
| AAG | 20 | 20 | 0 | 0 | 20 |
| AI | 25 | 25 | 0 | 0 | 25 |
| AU | 96 | 96 | 0 | 0 | 96 |
| BAM | 1 | 1 | 0 | 0 | 1 |
| BGG | 35 | 35 | 0 | 0 | 35 |
| BMT | 93 | 93 | 5 | 0 | 88 |
| DMG14（DMG） | 587 | 586 | 579 | 0 | 7 |
| EFA | 9 | 9 | 0 | 0 | 9 |
| EGW | 104 | 104 | 0 | 0 | 104 |
| ERLW | 52 | 52 | 0 | 0 | 52 |
| FRAiF | 19 | 19 | 0 | 0 | 19 |
| FRHoF | 28 | 28 | 0 | 0 | 28 |
| FTD | 35 | 35 | 0 | 0 | 35 |
| GGR | 44 | 44 | 0 | 0 | 44 |
| MM14（MM） | 10 | 10 | 2 | 0 | 8 |
| MOT | 13 | 13 | 0 | 0 | 13 |
| MTF | 4 | 4 | 0 | 0 | 4 |
| PHB14（PHB） | 268 | 268 | 233 | 0 | 35 |
| RHW | 2 | 2 | 0 | 0 | 2 |
| SCAG | 14 | 14 | 3 | 0 | 11 |
| SCC | 18 | 18 | 0 | 0 | 18 |
| SatO | 5 | 5 | 0 | 0 | 5 |
| TCE | 86 | 86 | 4 | 0 | 82 |
| VGM | 10 | 10 | 0 | 0 | 10 |
| VRGR | 5 | 5 | 1 | 0 | 4 |
| DMG24（XDMG） | 703 | 703 | 0 | 0 | 703 |
| XGE | 50 | 50 | 46 | 0 | 4 |
| MM25（XMM） | 1 | 1 | 0 | 0 | 1 |
| PHB24（XPHB） | 223 | 223 | 0 | 0 | 223 |

</details>

<details><summary>法術（15 個來源）</summary>

| 來源 | raw | 輸出 | 重印隱藏 | TCE 隱藏 | 可見 |
| ---- | --: | --: | --: | --: | --: |
| AAG | 2 | 2 | 0 | 0 | 2 |
| AI | 7 | 7 | 0 | 0 | 7 |
| AU | 33 | 33 | 0 | 0 | 33 |
| BMT | 3 | 3 | 0 | 0 | 3 |
| EFA | 1 | 1 | 0 | 0 | 1 |
| EGW | 15 | 15 | 0 | 0 | 15 |
| FRHoF | 19 | 19 | 0 | 0 | 19 |
| FTD | 7 | 7 | 1 | 0 | 6 |
| GGR | 1 | 1 | 0 | 0 | 1 |
| PHB14（PHB） | 361 | 361 | 361 | 0 | 0 |
| SCC | 5 | 5 | 1 | 0 | 4 |
| SatO | 2 | 2 | 0 | 0 | 2 |
| TCE | 21 | 21 | 10 | 0 | 11 |
| XGE | 95 | 95 | 16 | 0 | 79 |
| PHB24（XPHB） | 391 | 391 | 0 | 0 | 391 |

</details>

<details><summary>語言（13 個來源）</summary>

| 來源 | raw | 輸出 | 重印隱藏 | TCE 隱藏 | 可見 |
| ---- | --: | --: | --: | --: | --: |
| AI | 1 | 1 | 0 | 0 | 1 |
| EGW | 3 | 3 | 0 | 0 | 3 |
| ERLW | 16 | 16 | 0 | 0 | 16 |
| FRHoF | 17 | 17 | 0 | 0 | 17 |
| GGR | 16 | 16 | 0 | 0 | 16 |
| MM14（MM） | 21 | 21 | 15 | 0 | 6 |
| MOT | 9 | 9 | 0 | 0 | 9 |
| MTF | 1 | 1 | 0 | 0 | 1 |
| PHB14（PHB） | 18 | 18 | 18 | 0 | 0 |
| SCAG | 20 | 20 | 11 | 0 | 9 |
| VGM | 4 | 4 | 0 | 0 | 4 |
| MM25（XMM） | 15 | 15 | 0 | 0 | 15 |
| PHB24（XPHB） | 19 | 19 | 0 | 0 | 19 |

</details>

<details><summary>技能（2 個來源）</summary>

| 來源 | raw | 輸出 | 重印隱藏 | TCE 隱藏 | 可見 |
| ---- | --: | --: | --: | --: | --: |
| PHB14（PHB） | 18 | 18 | 18 | 0 | 0 |
| PHB24（XPHB） | 18 | 18 | 0 | 0 | 18 |

</details>

<details><summary>狀態（2 個來源）</summary>

| 來源 | raw | 輸出 | 重印隱藏 | TCE 隱藏 | 可見 |
| ---- | --: | --: | --: | --: | --: |
| PHB14（PHB） | 15 | 15 | 15 | 0 | 0 |
| PHB24（XPHB） | 15 | 15 | 0 | 0 | 15 |

</details>

<details><summary>疾病（6 個來源）</summary>

| 來源 | raw | 輸出 | 重印隱藏 | TCE 隱藏 | 可見 |
| ---- | --: | --: | --: | --: | --: |
| DMG14（DMG） | 3 | 3 | 3 | 0 | 0 |
| EGW | 1 | 1 | 0 | 0 | 1 |
| FRAiF | 4 | 4 | 0 | 0 | 4 |
| PHB14（PHB） | 6 | 6 | 0 | 0 | 6 |
| VRGR | 1 | 1 | 0 | 0 | 1 |
| DMG24（XDMG） | 3 | 3 | 0 | 0 | 3 |

</details>

<details><summary>狀況（status）（2 個來源）</summary>

| 來源 | raw | 輸出 | 重印隱藏 | TCE 隱藏 | 可見 |
| ---- | --: | --: | --: | --: | --: |
| PHB14（PHB） | 2 | 2 | 2 | 0 | 0 |
| PHB24（XPHB） | 3 | 3 | 0 | 0 | 3 |

</details>

<details><summary>規則條目（11 個來源）</summary>

| 來源 | raw | 輸出 | 重印隱藏 | TCE 隱藏 | 可見 |
| ---- | --: | --: | --: | --: | --: |
| AAG | 4 | 4 | 0 | 0 | 4 |
| AI | 10 | 10 | 0 | 0 | 10 |
| DMG14（DMG） | 44 | 44 | 1 | 0 | 43 |
| MM14（MM） | 3 | 3 | 0 | 0 | 3 |
| PHB14（PHB） | 13 | 13 | 0 | 0 | 13 |
| SCAG | 1 | 1 | 0 | 0 | 1 |
| TCE | 3 | 3 | 0 | 0 | 3 |
| VGM | 1 | 1 | 0 | 0 | 1 |
| VRGR | 3 | 3 | 0 | 0 | 3 |
| XGE | 22 | 22 | 1 | 0 | 21 |
| PHB24（XPHB） | 115 | 115 | 0 | 0 | 115 |

</details>

<details><summary>感官（3 個來源）</summary>

| 來源 | raw | 輸出 | 重印隱藏 | TCE 隱藏 | 可見 |
| ---- | --: | --: | --: | --: | --: |
| MM14（MM） | 1 | 1 | 1 | 0 | 0 |
| PHB14（PHB） | 3 | 3 | 3 | 0 | 0 |
| PHB24（XPHB） | 4 | 4 | 0 | 0 | 4 |

</details>

<details><summary>動作（4 個來源）</summary>

| 來源 | raw | 輸出 | 重印隱藏 | TCE 隱藏 | 可見 |
| ---- | --: | --: | --: | --: | --: |
| DMG14（DMG） | 8 | 8 | 0 | 0 | 8 |
| PHB14（PHB） | 20 | 20 | 19 | 0 | 1 |
| XGE | 2 | 2 | 0 | 0 | 2 |
| PHB24（XPHB） | 18 | 18 | 0 | 0 | 18 |

</details>

<details><summary>物品屬性（6 個來源）</summary>

| 來源 | raw | 輸出 | 重印隱藏 | TCE 隱藏 | 可見 |
| ---- | --: | --: | --: | --: | --: |
| AU | 1 | 1 | 0 | 0 | 1 |
| DMG14（DMG） | 3 | 3 | 3 | 0 | 0 |
| EGW | 1 | 1 | 0 | 0 | 1 |
| PHB14（PHB） | 10 | 10 | 9 | 0 | 1 |
| DMG24（XDMG） | 3 | 3 | 0 | 0 | 3 |
| PHB24（XPHB） | 9 | 9 | 0 | 0 | 9 |

</details>

<details><summary>武器精通（1 個來源）</summary>

| 來源 | raw | 輸出 | 重印隱藏 | TCE 隱藏 | 可見 |
| ---- | --: | --: | --: | --: | --: |
| PHB24（XPHB） | 8 | 8 | 0 | 0 | 8 |

</details>

<details><summary>物品類型（5 個來源）</summary>

| 來源 | raw | 輸出 | 重印隱藏 | TCE 隱藏 | 可見 |
| ---- | --: | --: | --: | --: | --: |
| AAG | 1 | 1 | 0 | 0 | 1 |
| DMG14（DMG） | 12 | 12 | 6 | 0 | 6 |
| PHB14（PHB） | 21 | 21 | 20 | 0 | 1 |
| DMG24（XDMG） | 10 | 10 | 0 | 0 | 10 |
| PHB24（XPHB） | 23 | 23 | 0 | 0 | 23 |

</details>

## 3. 丟棄明細

### 3a. 來源不在白名單

白名單見 `src/data/sourceGroups.ts`（`official`：不收冒險模組、`setting-alt`、`supplement-alt`、UA 等，使用者 2026-10-23 定案）。依來源分組：

| 來源 | 筆數 | 類別 |
| ---- | --: | ---- |
| UATheMysticClass | 66 | class 1、subclass 6、classFeature 23、subclassFeature 36 |
| PSX | 64 | race 3、subrace 4、feat 1、item 50、language 6 |
| PSA | 60 | race 4、subrace 3、subclass 10、subclassFeature 37、background 4、language 2 |
| DSotDQ | 47 | race 1、subclass 2、subclassFeature 8、background 2、feat 9、item 6、language 19 |
| IDRotF | 36 | item 32、spell 2、language 1、disease 1 |
| ToA | 32 | background 2、item 27、disease 3 |
| CoA | 29 | item 29 |
| BGDIA | 28 | background 14、item 14 |
| WDH | 28 | item 28 |
| WDMM | 27 | item 26、disease 1 |
| TftYP | 26 | item 24、language 1、disease 1 |
| WBtW | 24 | race 2、background 2、item 20 |
| PaBTSO | 24 | item 24 |
| SKT | 22 | item 20、language 2 |
| GoS | 21 | background 4、item 6、disease 2、variantrule 9 |
| OotA | 21 | item 19、language 1、disease 1 |
| PotA | 21 | item 21 |
| LLK | 20 | item 17、spell 3 |
| ABH | 19 | background 3、feat 16 |
| PSK | 17 | race 5、subrace 2、subclass 2、subclassFeature 6、feat 2 |
| CRCotN | 17 | item 17 |
| PSZ | 16 | race 6、subrace 10 |
| CoS | 15 | item 14、variantrule 1 |
| AUD | 14 | item 14 |
| LFL | 13 | race 7、background 2、feat 2、item 2 |
| CM | 13 | item 12、disease 1 |
| PSI | 11 | race 1、subrace 4、background 1、language 4、variantrule 1 |
| QftIS | 11 | item 11 |
| IMR | 11 | item 11 |
| KftGV | 9 | item 9 |
| NF | 8 | item 8 |
| WttHC | 8 | item 8 |
| HotDQ | 7 | item 6、language 1 |
| XMtS | 6 | item 6 |
| PSD | 5 | race 1、subrace 1、language 3 |
| JttRC | 5 | item 5 |
| LMoP | 5 | item 5 |
| HAT-LMI | 5 | item 5 |
| RoTOS | 4 | item 4 |
| AitFR-AVT | 4 | item 3、spell 1 |
| RoT | 4 | item 3、language 1 |
| DitLCoT | 4 | item 4 |
| VEoR | 3 | item 3 |
| OGA | 2 | race 1、item 1 |
| TTP | 2 | race 1、item 1 |
| NRH-AT | 2 | item 2 |
| HotB | 2 | item 2 |
| DC | 2 | item 2 |
| AWM | 1 | race 1 |
| LR | 1 | race 1 |
| NRH-TLT | 1 | item 1 |
| SDW | 1 | item 1 |
| RMBRE | 1 | item 1 |
| LoX | 1 | item 1 |
| MCV2DC | 1 | item 1 |
| UtHftLH | 1 | item 1 |
| AitFR-THP | 1 | item 1 |
| EET | 1 | item 1 |
| AZfyT | 1 | item 1 |
| HftT | 1 | item 1 |
| OoW | 1 | disease 1 |
| ESK | 1 | variantrule 1 |

### 3b. 母條目不存在（母條目的書不在白名單）（4）

子條目本身的書在白名單內，但所屬的種族／職業／子職來自白名單外的書。

<details><summary>明細</summary>

| 類別 | 名稱 | 來源 | 說明 |
| ---- | ---- | ---- | ---- |
| subclassFeature | 受祝击 | TCE | 子職 野心(PSA)\|PSA（牧师） |
| subclassFeature | 受祝击 | TCE | 子職 团结(PSA)\|PSA（牧师） |
| subclassFeature | 受祝击 | TCE | 子職 力量(PSA)\|PSA（牧师） |
| subclassFeature | 受祝击 | TCE | 子職 热忱(PSA)\|PSA（牧师） |

</details>

### 3c. 同類別重複（保留第一筆）（1）

同名同源的條目只保留第一筆（例如 `items.json` 與 `items-base.json` 都有的物品）。

<details><summary>明細</summary>

| 類別 | 名稱 | 來源 | 說明 |
| ---- | ---- | ---- | ---- |
| item | 治疗药水 | DMG | 治疗药水\|dmg |

</details>

### 3d. 整檔排除（被類型篩掉）（50）

- 協力者（class-sidekick.json）不是玩家職業，整檔不打包：50 筆

## 4. 重印目標解析不到

共 20 筆：目標書不在白名單 0（正常，舊版照常顯示）、目標書在白名單但條目不存在 20（原因見 `docs/data-notes.md` §4a）。

| 條目 | 重印參照 |
| ---- | ---- |
| subrace\|气\|EEPC\|元素裔\|EEPC | 元素裔 (气)\|MPMM |
| subrace\|土\|EEPC\|元素裔\|EEPC | 元素裔 (土)\|MPMM |
| subrace\|火\|EEPC\|元素裔\|EEPC | 元素裔 (火)\|MPMM |
| subrace\|水\|EEPC\|元素裔\|EEPC | 元素裔 (水)\|MPMM |
| item\|法术卷轴\|DMG | 法术卷轴\|XPHB |
| variantrule\|异域科技\|DMG | 异域科技\|XDMG |
| variantrule\|对角线\|DMG | 对角线移动\|XDMG |
| variantrule\|休整期活动：受训升级\|DMG | 受训升级\|XDMG |
| variantrule\|爆炸物\|DMG | 爆炸物\|XDMG |
| variantrule\|坠落\|XGE | hazard:坠落\|XPHB |
| variantrule\|枪械\|DMG | 枪械\|XDMG |
| variantrule\|无关经验的等级提升\|DMG | 里程碑\|XDMG |
| variantrule\|忠诚\|DMG | 忠诚\|XDMG |
| variantrule\|混合药水\|DMG | 混合药水\|XDMG |
| variantrule\|位面效应\|DMG | hazard:位面效应\|XDMG |
| variantrule\|声望\|DMG | 声望\|XDMG |
| itemType\|载具(飞行)\|DMG | 风\|XPHB |
| itemType\|权杖\|DMG | RD\|XPHB |
| itemType\|戒指\|DMG | RG\|XPHB |
| itemType\|魔杖\|DMG | WD\|XPHB |

