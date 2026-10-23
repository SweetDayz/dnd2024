import { describe, expect, it } from 'vitest'
import { entryMatches, formatSource, sourceAbbr, sourceMatches, sourceTooltip } from '../sourceDisplay'

describe('來源顯示縮寫（M4-1）', () => {
  it('對照表內的代碼換成縮寫，其他照舊', () => {
    expect(sourceAbbr('XPHB')).toBe('PHB24')
    expect(sourceAbbr('XDMG')).toBe('DMG24')
    expect(sourceAbbr('XMM')).toBe('MM25')
    expect(sourceAbbr('PHB')).toBe('PHB14')
    expect(sourceAbbr('DMG')).toBe('DMG14')
    expect(sourceAbbr('MM')).toBe('MM14')
    expect(sourceAbbr('TCE')).toBe('TCE')
    expect(sourceAbbr('xphb')).toBe('PHB24')
  })

  it('formatSource 輸出徽章文字，缺頁碼顯示 p.?', () => {
    expect(formatSource('XPHB', 165)).toBe('PHB24 p.165')
    expect(formatSource('AU')).toBe('AU p.?')
  })

  it('tooltip 含中英文書名、原始代碼、出版日期', () => {
    const t = sourceTooltip('XPHB', {
      source: 'XPHB',
      name: '玩家手册（2024）',
      engName: "Player's Handbook (2024)",
      published: '2024-09-17',
      type: 'book',
      group: 'core',
      edition: '2024',
    })
    expect(t).toContain('玩家手册（2024）')
    expect(t).toContain("Player's Handbook (2024)")
    expect(t).toContain('XPHB')
    expect(t).toContain('2024-09-17')
  })

  it('輸入縮寫或原始代碼都能找到，不分大小寫、只做完整比對', () => {
    expect(sourceMatches('XPHB', 'PHB24')).toBe(true)
    expect(sourceMatches('XPHB', 'xphb')).toBe(true)
    expect(sourceMatches('PHB', 'phb14')).toBe(true)
    expect(sourceMatches('XPHB', 'PHB')).toBe(false)
    expect(sourceMatches('XMM', 'm')).toBe(false)
  })

  it('條目搜尋比對中文名、英文名、來源', () => {
    const e = { name: '火球术', engName: 'Fireball', source: 'XPHB' }
    expect(entryMatches(e, '火球')).toBe(true)
    expect(entryMatches(e, 'FIRE')).toBe(true)
    expect(entryMatches(e, 'phb24')).toBe(true)
    expect(entryMatches(e, 'XPHB')).toBe(true)
    expect(entryMatches(e, 'PHB14')).toBe(false)
  })
})
