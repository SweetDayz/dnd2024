// M4-3：共用選擇清單的搜尋行為
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import type { Entry } from '@/data/types'
import type { ChoiceSlot } from '@/rules/build'
import ChoiceSlotView from '../builder/ChoiceSlotView.vue'

const NAMES: [string, string][] = [
  ['漩涡跃迁', 'Vortex Warp'],
  ['扭曲感知', 'Warp Sense'],
  ['恐惧术', 'Fear'],
  ['惊恐之触', 'Fearful Touch'],
  ['火球术', 'Fireball'],
  ['护盾术', 'Shield'],
  ['睡眠术', 'Sleep'],
  ['魔法飞弹', 'Magic Missile'],
  ['雷鸣波', 'Thunderwave'],
  ['法师护甲', 'Mage Armor'],
]

function slot(selected: string[], withEntries = true): ChoiceSlot {
  return {
    key: 'k',
    type: withEntries ? 'spell' : 'language',
    label: '測試',
    origin: { type: 'class', name: '法师', level: 1 },
    step: 'spells',
    count: 4,
    options: NAMES.map(([zh, en]) => {
      const entry: Entry = { id: `spell|${zh}|XPHB`, kind: 'spell', name: zh, engName: en, source: 'XPHB', edition: '2024' }
      return withEntries ? { value: entry.id, label: `${zh} ${en}`, entry } : { value: en.toLowerCase(), label: zh }
    }),
    selected,
    done: false,
    warnings: [],
  } as ChoiceSlot
}

function render(choice: ChoiceSlot) {
  const pinia = createPinia()
  setActivePinia(pinia)
  return mount(ChoiceSlotView, { props: { choice, showOrigin: false }, global: { plugins: [pinia] } })
}

const visibleNames = (w: ReturnType<typeof render>) => w.findAll('.entries .name').map((b) => b.text())

describe('ChoiceSlotView 搜尋（M4-3）', () => {
  it('搜尋只顯示符合的項目，已勾選但不符合的不出現在清單', async () => {
    const w = render(slot(['spell|漩涡跃迁|XPHB', 'spell|扭曲感知|XPHB']))
    await w.find('[data-testid="slot-search"]').setValue('fear')
    expect(visibleNames(w)).toEqual(['恐惧术 Fear', '惊恐之触 Fearful Touch'])
    expect(w.find('[data-testid="hidden-selected"]').text()).toBe('另有 2 個已選項目不符合搜尋')
  })

  it('已選標籤列一直顯示全部已選項目（搜尋時也是）', async () => {
    const w = render(slot(['spell|漩涡跃迁|XPHB', 'spell|扭曲感知|XPHB']))
    await w.find('[data-testid="slot-search"]').setValue('fear')
    const tags = w.find('[data-testid="picked-row"]').findAll('.picked').map((t) => t.text().replace('×', '').trim())
    expect(tags).toEqual(['漩涡跃迁 Vortex Warp', '扭曲感知 Warp Sense'])
  })

  it('比對中文名與英文名，不分大小寫', async () => {
    const w = render(slot([]))
    const input = w.find('[data-testid="slot-search"]')
    await input.setValue('火球')
    expect(visibleNames(w)).toEqual(['火球术 Fireball'])
    await input.setValue('MAGIC')
    expect(visibleNames(w)).toEqual(['魔法飞弹 Magic Missile'])
    expect(w.find('[data-testid="hidden-selected"]').exists()).toBe(false)
  })

  it('按鈕型（語言、工具等）同樣適用', async () => {
    const w = render(slot(['vortex warp'], false))
    await w.find('[data-testid="slot-search"]').setValue('恐惧')
    expect(w.findAll('.chips .chip').map((c) => c.text())).toEqual(['恐惧术'])
    expect(w.find('[data-testid="hidden-selected"]').text()).toBe('另有 1 個已選項目不符合搜尋')
  })
})
