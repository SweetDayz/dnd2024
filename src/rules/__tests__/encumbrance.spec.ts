// M7-5：錢幣重量與 2024 載重（XPHB p.362「载重」、p.213「钱币」）。不含 2014 變體負重。
import { describe, expect, it } from 'vitest'
import type { Entry } from '@/data/types'
import { buildCharacter } from '@/rules/build'
import { newCharacter, type Character } from '@/rules/character'
import type { RulesData } from '@/rules/data'
import { deriveSheet } from '@/rules/derive'
import { coinWeight, encumbrance, OVERLOAD_SPEED_CAP } from '@/rules/equipment'
import { benchmarkLevel1 } from './benchmark'
import { hasRealData, realData } from './realData'

/** 只有一件 10 磅物品的假資料 */
const ROCK = { id: 'item|石头|X', name: '石头', source: 'X', kind: 'item', weight: 10 } as unknown as Entry
const fake = { get: (id: string) => (id === ROCK.id ? ROCK : undefined) } as unknown as RulesData

function withLoad(rocks: number, gp = 0): Character {
  const c = newCharacter('2026-01-01T00:00:00.000Z')
  if (rocks) c.inventory = [{ uid: 'r', itemId: ROCK.id, qty: rocks, equipped: false, attuned: false, container: 'backpack' }] as Character['inventory']
  c.currency = { cp: 0, sp: 0, ep: 0, gp, pp: 0 }
  return c
}

describe('錢幣重量', () => {
  it('每 50 枚 1 磅，不分幣別', () => {
    expect(coinWeight({ cp: 0, sp: 0, ep: 0, gp: 50, pp: 0 })).toBe(1)
    expect(coinWeight({ cp: 10, sp: 10, ep: 10, gp: 10, pp: 10 })).toBe(1)
    expect(coinWeight({ cp: 0, sp: 0, ep: 0, gp: 1, pp: 0 })).toBe(0.02)
    expect(coinWeight({ cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 })).toBe(0)
  })

  it('錢幣計入總重', () => {
    const e = encumbrance(fake, withLoad(2, 100), 10, 'M')
    expect(e).toMatchObject({ carried: 20, coins: 2, total: 22 })
  })
})

describe('載重門檻（力量 10）', () => {
  it('中型與小型：載重 ×15、拖拽／抬起／推動 ×30', () => {
    for (const size of ['M', 'S']) expect(encumbrance(fake, withLoad(0), 10, size)).toMatchObject({ capacity: 150, dragLift: 300 })
    expect(encumbrance(fake, withLoad(0), 10, 'T')).toMatchObject({ capacity: 75, dragLift: 150 })
    expect(encumbrance(fake, withLoad(0), 10, 'L')).toMatchObject({ capacity: 300, dragLift: 600 })
  })

  it('剛好等於載重不算超重；多 1 枚金幣（0.02 磅）就超重', () => {
    expect(encumbrance(fake, withLoad(15), 10, 'M')).toMatchObject({ total: 150, over: false })
    expect(encumbrance(fake, withLoad(15, 1), 10, 'M')).toMatchObject({ total: 150.02, over: true, overDragLift: false })
    expect(encumbrance(fake, withLoad(14, 50), 10, 'S')).toMatchObject({ total: 141, over: false })
  })

  it('拖拽／抬起／推動上限：剛好等於不算超過，超過一點才算', () => {
    expect(encumbrance(fake, withLoad(30), 10, 'M')).toMatchObject({ over: true, overDragLift: false })
    expect(encumbrance(fake, withLoad(30, 1), 10, 'M')).toMatchObject({ over: true, overDragLift: true })
  })
})

describe.skipIf(!hasRealData)('超過載重的速度（基準角色 1 級：力量 8、岩地侏儒步行 30 呎）', () => {
  const data = hasRealData ? realData() : (undefined as unknown as RulesData)

  it('未超重：速度 30，沒有說明；超重：速度至多 5 呎並附原因', () => {
    const c = benchmarkLevel1(data)
    const sheet = () => deriveSheet(c, buildCharacter(c, data), data)
    const walk = () => sheet().speeds.find((s) => s.mode === 'walk')!.value
    expect(sheet().encumbrance.capacity).toBe(8 * 15)
    expect(walk()).toBe(30)
    expect(sheet().speedNotes).toEqual([])

    // 補金幣讓總重剛好等於載重 → 不扣
    const room = sheet().encumbrance.capacity - sheet().encumbrance.total
    c.currency.gp += Math.round(room * 50)
    expect(sheet().encumbrance.total).toBe(120)
    expect(walk()).toBe(30)
    // 再多 1 枚 → 超重
    c.currency.gp += 1
    expect(sheet().encumbrance.over).toBe(true)
    expect(walk()).toBe(OVERLOAD_SPEED_CAP)
    expect(sheet().speedNotes.join()).toContain('超過載重 120 磅')
  })
})
