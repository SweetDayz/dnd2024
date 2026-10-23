// M7-3：所有「從物品資料產生選項」的地方都不能混入魔法物品（盤點見 docs/data-notes.md §17）。
import { describe, expect, it } from 'vitest'
import { isMundaneItem } from '@/data/items'
import type { Entry } from '@/data/types'
import { buildReviewModel } from '@/export/review'
import { buildCharacter, weaponFilter, type ChoiceSlot } from '@/rules/build'
import { newCharacter, type Character } from '@/rules/character'
import { lookupRef, toolList, toolType, type RulesData } from '@/rules/data'
import { deriveSheet } from '@/rules/derive'
import { startingSets } from '@/rules/equipment'
import { hasRealData, realData } from './realData'

const BARD = 'class|吟游诗人|XPHB'
const ACOLYTE = 'background|侍僧|XPHB'
const HUMAN = 'race|人类|XPHB'
/** M7-2 盤點舉出的魔法樂器（英文小寫鍵＝存檔值） */
const MAGIC_INSTRUMENTS = [
  "+1 rhythm-maker's drum",
  'instrument of the bards, doss lute',
  'horn of valhalla, brass',
  'horn of blasting',
  'siren song lyre',
]

function bard(): Character {
  const c = newCharacter('2026-01-01T00:00:00.000Z')
  c.levels = [{ classId: BARD, hp: { mode: 'average' } }]
  c.backgroundId = ACOLYTE
  c.raceId = HUMAN
  return c
}

const isBardTool = (s: ChoiceSlot) => s.type === 'tool' && s.key.startsWith(`${BARD}:`)
const magicIn = (slot: ChoiceSlot, data: RulesData) =>
  slot.options.filter((o) => {
    const it = o.entry ?? toolList(data).find((t) => t.engName?.toLowerCase() === o.value)
    return !it || !isMundaneItem(it)
  })

describe.skipIf(!hasRealData)('一般物品判斷（M7-3）', () => {
  const data = hasRealData ? realData() : (undefined as unknown as RulesData)

  it('isMundaneItem：一般魯特琴是、魔法樂器不是', () => {
    const items = data.list('item')
    const byEng = (n: string) => items.filter((it) => it.engName?.toLowerCase() === n)
    expect(byEng('lute').some(isMundaneItem)).toBe(true)
    for (const n of MAGIC_INSTRUMENTS) {
      expect(byEng(n).length).toBeGreaterThan(0)
      expect(byEng(n).some(isMundaneItem)).toBe(false)
    }
  })

  it('toolList：四類工具都沒有魔法物品；XPHB 的 37 種一般工具都在', () => {
    const tools = toolList(data)
    expect(tools.filter((t) => !isMundaneItem(t))).toEqual([])
    const xphb = (cat: string) => tools.filter((t) => toolType(t) === cat && t.source === 'XPHB').length
    expect([xphb('AT'), xphb('T'), xphb('GS'), xphb('INS')]).toEqual([17, 6, 4, 10])
    // 已啟用書目中的一般異域樂器保留
    expect(tools.some((t) => t.engName === 'Birdpipes' && t.source === 'SCAG')).toBe(true)
  })

  it('吟遊詩人「任一樂器」：沒有魔法樂器、有魯特琴，每個選項都有條目（來源徽章）', () => {
    const slot = buildCharacter(bard(), data).slots.find(isBardTool)!
    expect(slot).toBeDefined()
    const values = slot.options.map((o) => o.value)
    for (const n of MAGIC_INSTRUMENTS) expect(values).not.toContain(n)
    expect(values).toContain('lute')
    expect(slot.options.find((o) => o.value === 'lute')!.label).toContain('鲁特琴')
    expect(slot.options.map((o) => o.label).join()).not.toMatch(/吟游诗人乐器|\+1/)
    expect(slot.options.every((o) => o.entry)).toBe(true)
    expect(magicIn(slot, data)).toEqual([])
  })

  it('所有職業、背景、種族、專長、兼職的工具熟練欄位都沒有魔法物品', () => {
    const slots: ChoiceSlot[] = []
    const base = (patch: (c: Character) => void) => {
      const c = bard()
      patch(c)
      slots.push(...buildCharacter(c, data).slots.filter((s) => s.type === 'tool'))
    }
    for (const cls of data.list('class')) {
      base((c) => (c.levels = [{ classId: cls.id, hp: { mode: 'average' } }]))
      // 兼職：吟遊詩人 1 → 該職業 1
      base((c) => c.levels.push({ classId: cls.id, hp: { mode: 'average' } }))
    }
    for (const bg of data.list('background')) base((c) => (c.backgroundId = bg.id))
    for (const r of data.list('race')) base((c) => (c.raceId = r.id))
    expect(slots.length).toBeGreaterThan(10)
    // 專長（例如藝人背景給的音樂家專長）與兼職的工具欄位都有涵蓋到
    expect(slots.some((s) => s.origin.type === 'feat')).toBe(true)
    expect(slots.some((s) => s.key.includes(':mc:'))).toBe(true)
    for (const s of slots) expect({ key: s.key, magic: magicIn(s, data) }).toEqual({ key: s.key, magic: [] })
  })

  it('武器篩選型熟練（武僧、遊蕩者）：符合的武器都是一般物品', () => {
    const filters = new Set<string>()
    const walk = (v: unknown) => {
      if (Array.isArray(v)) v.forEach(walk)
      else if (v && typeof v === 'object')
        for (const [k, x] of Object.entries(v)) {
          if (k === 'fromFilter') filters.add(String(x))
          else walk(x)
        }
    }
    for (const cls of data.list('class')) walk([cls.startingProficiencies, cls.multiclassing])
    expect(filters.size).toBeGreaterThan(0)
    for (const f of filters) {
      const { items } = weaponFilter(data, f)
      expect(items.length).toBeGreaterThan(0)
      expect(items.filter((it) => !isMundaneItem(it))).toEqual([])
    }
  })

  it('起始裝備：以名稱找到的物品（法术书等）都是一般物品', () => {
    const named: Entry[] = []
    for (const e of [...data.list('class'), ...data.list('background')])
      for (const set of startingSets(data, e))
        for (const o of set.options) for (const i of o.items) if (i.itemId) named.push(data.get(i.itemId)!)
    const spellbook = named.filter((it) => it.name === '法术书')
    expect(spellbook.length).toBeGreaterThan(0)
    expect(spellbook.every(isMundaneItem)).toBe(true)
    // 明確引用的物品（item 參照）也都不是魔法物品
    expect(named.filter((it) => !isMundaneItem(it)).map((it) => it.id)).toEqual([])
    expect(lookupRef(data, 'item', '法术书|PHB')).toBeDefined()
  })

  it('舊存檔選了魔法樂器：該值視為未選擇並出現警示，其他選擇不變', () => {
    const c = bard()
    const slot = buildCharacter(c, data).slots.find(isBardTool)!
    c.choices[slot.key] = ['lute', "+1 rhythm-maker's drum", 'flute']
    const skill = buildCharacter(c, data).slots.find((s) => s.type === 'skill' && s.key.startsWith(`${BARD}:`))!
    c.choices[skill.key] = ['arcana', 'history', 'insight']
    const before = JSON.stringify(c)

    const b = buildCharacter(c, data)
    const after = b.slots.find((s) => s.key === slot.key)!
    expect(after.selected).toEqual(['lute', 'flute'])
    expect(after.done).toBe(false)
    expect(after.stale).toEqual(["+1 rhythm-maker's drum"])
    expect(after.warnings.join()).toContain('目前不可用')
    expect(b.slots.find((s) => s.key === skill.key)!.selected).toEqual(['arcana', 'history', 'insight'])
    expect(b.profs.filter((p) => p.type === 'tool').map((p) => p.value)).toEqual(expect.arrayContaining(['lute', 'flute']))
    // 存檔本身不被改寫（不自動移除）
    expect(JSON.stringify(c)).toBe(before)

    const s = deriveSheet(c, b, data)
    const model = buildReviewModel({
      character: c,
      build: b,
      sheet: s,
      data,
      spells: [],
      casting: [],
      attacks: [],
      effects: [],
      sources: [],
      filter: { enabled: ['XPHB'], showLegacy: false, tceOptional: false },
      appVersion: '0.0.0',
      exportedAt: new Date(2026, 9, 23),
    })
    const w = model.warnings.filter((x) => x.kind === '失效的選擇')
    expect(w).toHaveLength(1)
    expect(w[0]!.text).toContain("+1 rhythm-maker's drum")
  })
})
