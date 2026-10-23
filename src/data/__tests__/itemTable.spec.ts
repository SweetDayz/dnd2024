// M7-7：物品表格的篩選與排序純函式。
import { describe, expect, it } from 'vitest'
import { filterItems, itemLabels, itemRow, itemTags, sortItems, type ItemRow } from '@/data/itemTable'
import type { Entry } from '@/data/types'
import { hasRealData, realData } from '@/rules/__tests__/realData'

const e = (o: Record<string, unknown>) => ({ kind: 'item', page: 1, source: 'XPHB', rarity: 'none', ...o, id: `item|${o.name}|XPHB` }) as unknown as Entry
const ITEMS = [
  e({ name: '长剑', engName: 'Longsword', type: 'M|XPHB', value: 1500, weight: 3, property: ['V|XPHB'], mastery: ['削弱|XPHB'], isBaseItem: true }),
  e({ name: '匕首', engName: 'Dagger', type: 'M|XPHB', value: 200, weight: 1, property: ['F|XPHB', 'L|XPHB', 'T|XPHB'], mastery: ['擦掠|XPHB'], isBaseItem: true }),
  e({ name: '长矛', engName: 'Pike', type: 'M|XPHB', value: 500, weight: 18, property: ['H|XPHB', 'R|XPHB', { uid: '2H|XPHB', note: '' }], isBaseItem: true }),
  e({ name: '绳子', engName: 'Rope', type: 'G|XPHB', value: 100, weight: 5 }),
  e({ name: '奇怪物件', engName: 'Thing', type: 'G|XPHB' }),
  e({ name: '+1 武器', engName: '+1 Weapon', type: 'GV|XDMG', rarity: 'uncommon', isGenericVariant: true }),
  e({ name: '法师之杖', engName: 'Staff of the Magi', rarity: 'legendary', reqAttune: '由法师', wondrous: true }),
  e({ name: '隐形斗篷', engName: 'Cloak of Invisibility', rarity: 'legendary', reqAttune: true, wondrous: true }),
]
const rows = ITEMS.map(itemRow)
const names = (list: ItemRow[]) => list.map((r) => r.entry.engName)

describe('itemRow', () => {
  it('一般／魔法、同調三類、屬性代碼去掉來源（含物件寫法）、分類', () => {
    const by = (n: string) => rows.find((r) => r.entry.engName === n)!
    expect(by('Longsword')).toMatchObject({ magic: false, attune: 'none', properties: ['V'], mastery: ['削弱'], category: 'base', type: 'M' })
    expect(by('Pike').properties).toEqual(['H', 'R', '2H'])
    expect(by('Staff of the Magi')).toMatchObject({ magic: true, attune: 'conditional', attuneText: '由法师', type: 'W', category: 'other' })
    expect(by('Cloak of Invisibility').attune).toBe('required')
    expect(by('+1 Weapon').category).toBe('generic')
    expect(by('Thing')).toMatchObject({ value: undefined, weight: undefined })
  })
})

describe('filterItems', () => {
  it('物品屬性：OR 符合任一、AND 要全部符合、排除只要符合一個就淘汰', () => {
    expect(names(filterItems(rows, { property: { mode: 'or', tags: { L: 1, H: 1 } } }))).toEqual(['Dagger', 'Pike'])
    expect(names(filterItems(rows, { property: { mode: 'and', tags: { F: 1, T: 1 } } }))).toEqual(['Dagger'])
    expect(names(filterItems(rows, { property: { mode: 'and', tags: { F: 1, H: 1 } } }))).toEqual([])
    expect(names(filterItems(rows, { type: { mode: 'or', tags: { M: 1 } }, property: { mode: 'or', tags: { F: -1 } } }))).toEqual(['Longsword', 'Pike'])
  })

  it('同調：需要／需特定條件／不需要', () => {
    expect(names(filterItems(rows, { attune: { mode: 'or', tags: { required: 1 } } }))).toEqual(['Cloak of Invisibility'])
    expect(names(filterItems(rows, { attune: { mode: 'or', tags: { conditional: 1 } } }))).toEqual(['Staff of the Magi'])
    expect(filterItems(rows, { attune: { mode: 'or', tags: { none: -1 } } })).toHaveLength(2)
  })

  it('價值（GP）與重量範圍：含邊界、沒有值的排除、只填一邊也可以', () => {
    expect(names(filterItems(rows, {}, '', { value: [2, 15] }))).toEqual(['Longsword', 'Dagger', 'Pike'])
    expect(names(filterItems(rows, {}, '', { value: [null, 1] }))).toEqual(['Rope'])
    expect(names(filterItems(rows, {}, '', { weight: [5, null] }))).toEqual(['Pike', 'Rope'])
    expect(filterItems(rows, {}, '', { value: [null, null] })).toHaveLength(rows.length)
  })

  it('稀有度與文字搜尋', () => {
    expect(names(filterItems(rows, { rarity: { mode: 'or', tags: { legendary: 1 } } }))).toEqual(['Staff of the Magi', 'Cloak of Invisibility'])
    expect(names(filterItems(rows, {}, 'dagger'))).toEqual(['Dagger'])
  })
})

describe('sortItems', () => {
  const labels = { type: (c: string) => c, property: (c: string) => c }
  it('價值、重量依數值（不是字串），沒有值的永遠排最後', () => {
    const asc = names(sortItems(rows.filter((r) => !r.magic), { key: 'value', dir: 1 }, labels))
    expect(asc).toEqual(['Rope', 'Dagger', 'Pike', 'Longsword', 'Thing'])
    const desc = names(sortItems(rows.filter((r) => !r.magic), { key: 'value', dir: -1 }, labels))
    expect(desc).toEqual(['Longsword', 'Pike', 'Dagger', 'Rope', 'Thing'])
    expect(names(sortItems(rows.filter((r) => r.weight !== undefined), { key: 'weight', dir: 1 }, labels))).toEqual(['Dagger', 'Longsword', 'Rope', 'Pike'])
  })
})

describe.skipIf(!hasRealData)('實際資料', () => {
  const data = hasRealData ? realData() : (undefined as never)
  it('類型、屬性名稱來自資料；分類只出現資料裡有的（沒有特定變體）', () => {
    const labels = itemLabels(data)
    expect(labels.type('M')).toBe('近战武器')
    expect(labels.type('INS')).toBe('乐器')
    expect(labels.property('2H')).toBe('双手')
    expect(labels.property('F')).toBe('灵巧')
    const tags = itemTags(data.list('item').map(itemRow), labels)
    expect(tags.category).toEqual(['base', 'generic', 'other'])
    expect(tags.property).toEqual(expect.arrayContaining(['2H', 'V', 'F', 'L', 'H', 'R', 'T', 'LD', 'A']))
    expect(tags.mastery.length).toBe(8)
    // 簡體稀有度併入英文代碼；同名屬性附代碼
    expect(tags.rarity.every((r) => /^[a-z ()]+$/.test(r))).toBe(true)
    expect(labels.property('A')).toBe('弹药（A）')
    expect(labels.property('AF')).toBe('弹药（AF）')
  })
})
