import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { SOURCE_GROUPS } from '@/data/sourceGroups'
import { STORAGE_KEY, useSourceFilterStore } from '../sourceFilter'

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
})

describe('sourceFilter store', () => {
  it('預設套用 official、兩個開關關閉', () => {
    const f = useSourceFilterStore()
    expect(f.groupId).toBe('official')
    expect(f.enabled).toEqual([...SOURCE_GROUPS.official!.sources])
    expect(f.showLegacy).toBe(false)
    expect(f.tceOptional).toBe(false)
  })

  it('關掉單本書後變成自訂，再套用群組會還原', () => {
    const f = useSourceFilterStore()
    f.toggleSource('PHB', false)
    expect(f.enabledSet.has('PHB')).toBe(false)
    expect(f.groupId).toBeNull()
    f.toggleSource('PHB', true)
    expect(f.groupId).toBe('official')
    f.toggleSource('TCE', false)
    f.applyGroup('official')
    expect(f.enabledSet.has('TCE')).toBe(true)
  })

  it('狀態存進 localStorage，新的 store 會還原', async () => {
    const f = useSourceFilterStore()
    f.showLegacy = true
    f.toggleSource('XGE', false)
    await nextTick()
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).showLegacy).toBe(true)

    setActivePinia(createPinia())
    const g = useSourceFilterStore()
    expect(g.showLegacy).toBe(true)
    expect(g.enabledSet.has('XGE')).toBe(false)
  })
})
