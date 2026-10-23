import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { DEFAULT_SORT } from '@/data/spellFilter'
import { SPELL_PREFS_KEY, useSpellPrefsStore } from '../spellPrefs'

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
})

describe('spellPrefs store', () => {
  it('沒存過的欄位回傳預設值，讀取不會寫入', () => {
    const p = useSpellPrefsStore()
    expect(p.get('x')).toEqual({ sort: DEFAULT_SORT, showBlocked: false, panelOpen: false })
    expect(p.bySlot).toEqual({})
  })

  it('每個欄位各自存篩選與排序，寫進 localStorage，重新載入會還原', async () => {
    const p = useSpellPrefsStore()
    p.update('a', { filter: { level: { mode: 'or', tags: { '1': 1 } } }, sort: { key: 'range', dir: -1 } })
    await nextTick()
    expect(p.get('b').filter).toBeUndefined()
    expect(JSON.parse(localStorage.getItem(SPELL_PREFS_KEY)!).a.sort).toEqual({ key: 'range', dir: -1 })
    setActivePinia(createPinia())
    expect(useSpellPrefsStore().get('a').filter).toEqual({ level: { mode: 'or', tags: { '1': 1 } } })
  })

  it('重設為預設：清掉篩選、排序、反灰開關，保留面板展開', () => {
    const p = useSpellPrefsStore()
    p.update('a', { filter: {}, sort: { key: 'name', dir: 1 }, showBlocked: true, panelOpen: true })
    p.reset('a')
    expect(p.get('a')).toEqual({ sort: DEFAULT_SORT, showBlocked: false, panelOpen: true })
  })
})
