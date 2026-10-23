import { describe, expect, it } from 'vitest'
import { FVTT_SKILL_ORDER, sortSkills } from '../skillOrder'
import type { Ability } from '@/rules/abilities'

const S = (key: string, engName: string, ability: Ability) => ({ key, engName, ability })
const skills = [
  S('stealth', 'Stealth', 'dex'),
  S('arcana', 'Arcana', 'int'),
  S('sleight of hand', 'Sleight of Hand', 'dex'),
  S('athletics', 'Athletics', 'str'),
  S('perception', 'Perception', 'wis'),
]

describe('技能排序（M4-6）', () => {
  it('Roll20：英文字母', () => {
    expect(sortSkills(skills, 'roll20')[0]!.skills.map((s) => s.key)).toEqual(['arcana', 'athletics', 'perception', 'sleight of hand', 'stealth'])
  })
  it('FVTT：依固定順序（巧手在前）', () => {
    expect(sortSkills(skills, 'fvtt')[0]!.skills.map((s) => s.key)).toEqual(['sleight of hand', 'arcana', 'athletics', 'perception', 'stealth'])
    expect(FVTT_SKILL_ORDER).toHaveLength(18)
    expect(new Set(FVTT_SKILL_ORDER).size).toBe(18)
  })
  it('依屬性分組：屬性順序、組內英文字母、沒有技能的屬性不出現', () => {
    const g = sortSkills(skills, 'ability')
    expect(g.map((x) => x.ability)).toEqual(['str', 'dex', 'int', 'wis'])
    expect(g[1]!.skills.map((s) => s.key)).toEqual(['sleight of hand', 'stealth'])
  })
})
