/**
 * 物品的共用判斷（M7-3）。
 *
 * 「一般物品」以 `rarity === 'none'` 判斷（調查見 docs/data-notes.md §17b）：
 * 魔法物品的 rarity 一定是 common～artifact、varies、unknown (magic) 之類；
 * `baseItem`／`isBaseItem` 都不可靠（有魔法樂器沒有 baseItem，一般魯特琴也沒有 isBaseItem）。
 * 所有「從物品資料產生選項」的地方（工具熟練、武器篩選、起始裝備）都要經過這裡。
 */
import type { Entry } from './types.ts'

export const isMundaneItem = (it: Entry): boolean => it.rarity === 'none'
