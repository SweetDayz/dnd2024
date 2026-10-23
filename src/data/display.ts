/**
 * 列表上每筆條目的簡短說明（法術環位、物品稀有度、專長分類…）。純函式。
 * 用詞沿用上游簡體；不認得的代碼直接顯示原代碼，避免猜錯。
 */
import { sourceAbbr } from './sourceDisplay.ts'
import { schoolName, spellLevelText } from './summary.ts'
import type { Entry } from './types.ts'

const RARITY: Record<string, string> = {
  common: '普通',
  uncommon: '非普通',
  rare: '珍稀',
  'very rare': '非常珍稀',
  legendary: '传说',
  artifact: '神器',
  varies: '稀有度不定',
  unknown: '未知',
  'unknown (magic)': '未知（魔法）',
}

const FEAT_CATEGORY: Record<string, string> = {
  G: '通用专长',
  O: '起源专长',
  FS: '战斗风格专长',
  'FS:P': '战斗风格专长（圣武士）',
  'FS:R': '战斗风格专长（游侠）',
  EB: '史诗恩惠',
  D: '龙纹专长',
}

const FEATURE_TYPE: Record<string, string> = {
  EI: '魔能祈唤',
  'MV:B': '战技',
  AI: '奇械注法',
  'FS:F': '战斗风格（战士）',
  'FS:R': '战斗风格（游侠）',
  'FS:P': '战斗风格（圣武士）',
  'FS:B': '战斗风格（吟游诗人）',
  AS: '秘法射击',
  ED: '元素法门',
  MM: '超魔法',
  PB: '契约恩赐',
  RN: '符文',
}

export const featureTypeName = (code: string) => FEATURE_TYPE[code] ?? code

export function metaLine(e: Entry): string {
  switch (e.kind) {
    case 'spell':
      return `${spellLevelText(e.level)}・${schoolName(e.school)}`
    case 'item': {
      const parts: string[] = []
      if (e.isBaseItem) parts.push('基础物品')
      if (e.isItemGroup) parts.push('物品组')
      if (e.isGenericVariant) parts.push('泛用变体')
      const r = RARITY[String(e.rarity)]
      if (r) parts.push(r)
      if (e.reqAttune) parts.push('需同调')
      return parts.join('・')
    }
    case 'feat':
      return e.category ? (FEAT_CATEGORY[String(e.category)] ?? String(e.category)) : ''
    case 'optionalfeature':
      return ((e.featureType as string[] | undefined) ?? []).map(featureTypeName).join('、')
    case 'subclass':
      return `${e.className}（${sourceAbbr(String(e.classSource))}）`
    default:
      return ''
  }
}
