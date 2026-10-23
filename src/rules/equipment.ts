/**
 * 裝備：起始裝備組（A/B）、物品欄重量與負重、AC、攻擊列（純函式）。
 *
 * 起始裝備資料（見 docs/data-notes.md §12e）：
 *   class.startingEquipment.defaultData = [{ A: [...], B: [...] }, { _: [...] }]（每個物件是一組，鍵是選項）
 *   background.startingEquipment = 同上格式
 *   每一項：`"名|來源"`、`{item, quantity, displayName, containsValue}`、`{value}`（銅幣）、
 *          `{special: "法术书"}`、`{equipmentType: "toolArtisan"}`（任選一件某類物品）
 *   2014 職業另有 goldAlternative：`{@dice 4d4 × 10|...}`（改拿金幣時擲骰）
 */
import type { Entry } from '../data/types.ts'
import { parseTags } from '../data/tags.ts'
import { formatMod, type Ability } from './abilities.ts'
import type { Build } from './build.ts'
import type { Character, Currency, InventoryItem } from './character.ts'
import { lookupRef, type RulesData } from './data.ts'
import type { Sheet } from './derive.ts'
import type { SpellRow } from './spells.ts'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any

export interface StartItem {
  itemId?: string
  name: string
  qty: number
  /** 錢（銅幣） */
  value?: number
}

export interface StartOption {
  value: string
  label: string
  items: StartItem[]
}

export interface StartSet {
  /** 選擇欄位 key 的後半段 */
  index: number
  options: StartOption[]
}

const EQUIPMENT_TYPE: Record<string, string> = {
  toolArtisan: '工匠工具（自選一種）',
  instrumentMusical: '乐器（自選一種）',
  setGaming: '游戏套组（自選一種）',
  focusSpellcastingArcane: '奥术法器（自選一種）',
  focusSpellcastingHoly: '圣徽（自選一種）',
  focusSpellcastingDruidic: '德鲁伊法器（自選一種）',
  weaponSimple: '简易武器（自選一種）',
  weaponMartial: '军用武器（自選一種）',
  weaponSimpleMelee: '简易近战武器（自選一種）',
  weaponMartialMelee: '军用近战武器（自選一種）',
}

/** 以名稱找物品（`{special: "法术书"}`），2024 版優先。 */
function itemByName(data: RulesData, name: string): Entry | undefined {
  const all = data.list('item').filter((it) => it.name === name)
  return all.find((it) => it.edition === '2024') ?? all[0]
}

export const cpToText = (cp: number) => {
  const gp = Math.floor(cp / 100)
  const sp = Math.floor((cp % 100) / 10)
  const c = cp % 10
  return [gp && `${gp} GP`, sp && `${sp} SP`, c && `${c} CP`].filter(Boolean).join(' ') || '0 GP'
}

function resolveItem(data: RulesData, raw: Json): StartItem[] {
  if (typeof raw === 'string') {
    const it = lookupRef(data, 'item', raw)
    return [{ ...(it ? { itemId: it.id } : {}), name: it?.name ?? raw.split('|')[0]!, qty: 1 }]
  }
  if (typeof raw.value === 'number') return [{ name: cpToText(raw.value), qty: 1, value: raw.value }]
  const qty = Number(raw.quantity ?? 1)
  const out: StartItem[] = []
  if (raw.item) {
    const it = lookupRef(data, 'item', raw.item)
    out.push({ ...(it ? { itemId: it.id } : {}), name: raw.displayName ?? it?.name ?? raw.item.split('|')[0], qty })
  } else if (raw.special) {
    const it = itemByName(data, raw.special)
    out.push({ ...(it ? { itemId: it.id } : {}), name: raw.special, qty })
  } else if (raw.equipmentType) {
    out.push({ name: raw.displayName ?? EQUIPMENT_TYPE[raw.equipmentType] ?? raw.equipmentType, qty })
  }
  const money = raw.containsValue ?? raw.worthValue
  if (typeof money === 'number') out.push({ name: cpToText(money), qty: 1, value: money })
  return out
}

/** 條目的起始裝備組。 */
export function startingSets(data: RulesData, e: Entry): StartSet[] {
  const se = e.startingEquipment as Json
  const sets: Json[] = Array.isArray(se) ? se : (se?.defaultData ?? [])
  return sets.map((set, index) => ({
    index,
    options: Object.entries<Json>(set).map(([k, arr]) => {
      const items = [].concat(arr).flatMap((raw) => resolveItem(data, raw))
      return {
        value: k,
        label: `${k === '_' ? '固定' : `(${k.toUpperCase()})`} ${items.map((i) => (i.qty > 1 ? `${i.name} ×${i.qty}` : i.name)).join('、')}`,
        items,
      }
    }),
  }))
}

/** 2014 職業的「改拿金幣」擲骰算式，例如「4d4 × 10」。 */
export function goldAlternative(e: Entry): string | undefined {
  const g = (e.startingEquipment as Json)?.goldAlternative
  if (typeof g !== 'string') return undefined
  const tag = parseTags(g).find((n) => typeof n !== 'string')
  return tag && typeof tag !== 'string' ? (tag.args[0] ?? '').trim() : undefined
}

/** 背包類物品（套組）會展開成內容物放進背包。 */
function packContents(data: RulesData, it: Entry): StartItem[] | undefined {
  const pc = it.packContents as Json[] | undefined
  if (!pc) return undefined
  return pc.flatMap((x) => resolveItem(data, typeof x === 'string' ? x : { ...x }))
}

let uidCounter = 0
const newUid = () => `i${Date.now().toString(36)}${(uidCounter++).toString(36)}`

/**
 * 依起始裝備的選擇，產生物品欄與金錢。
 * @param picks 每個條目的每一組選了哪個選項（setKey → 選項值）；起始金幣擲骰的結果用 `gold` 傳入（GP）
 */
export function startingInventory(
  data: RulesData,
  sources: { entry: Entry; picks: Record<number, string | undefined>; gold?: number }[],
): { items: InventoryItem[]; currency: Currency; missing: string[] } {
  const items: InventoryItem[] = []
  const currency: Currency = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }
  const missing: string[] = []
  const addCp = (v: number) => {
    currency.gp += Math.floor(v / 100)
    currency.sp += Math.floor((v % 100) / 10)
    currency.cp += v % 10
  }
  for (const src of sources) {
    if (src.gold !== undefined) {
      currency.gp += src.gold
      continue
    }
    for (const set of startingSets(data, src.entry)) {
      const pick = set.options.length === 1 ? set.options[0] : set.options.find((o) => o.value === src.picks[set.index])
      if (!pick) {
        missing.push(src.entry.name)
        continue
      }
      for (const si of pick.items) {
        if (si.value !== undefined) {
          addCp(si.value)
          continue
        }
        const it = si.itemId ? data.get(si.itemId) : undefined
        const contents = it ? packContents(data, it) : undefined
        if (contents) {
          for (const ci of contents) {
            if (ci.value !== undefined) addCp(ci.value)
            else items.push({ uid: newUid(), itemId: ci.itemId ?? '', name: ci.name, qty: ci.qty, equipped: false, container: 'backpack', from: 'start' })
          }
        } else {
          const custom = it?.name !== si.name ? { name: si.name } : {}
          items.push({ uid: newUid(), itemId: si.itemId ?? '', ...custom, qty: si.qty, equipped: !!(it?.weapon || it?.armor || String(it?.type).startsWith('S|') || String(it?.type) === 'S'), container: 'equipment', from: 'start' })
        }
      }
    }
  }
  return { items, currency, missing }
}

// ---------------------------------------------------------------------------
// 重量、負重
// ---------------------------------------------------------------------------

export function itemWeight(data: RulesData, i: InventoryItem): number {
  const it = i.itemId ? data.get(i.itemId) : undefined
  return Number(it?.weight ?? 0) * i.qty
}

const SIZE_MULT: Record<string, number> = { T: 0.5, S: 1, M: 1, L: 2, H: 4, G: 8 }

export interface Encumbrance {
  carried: number
  /** 硬幣重量（每 50 枚 1 磅；另計，DDB 也不計入） */
  coins: number
  capacity: number
  /** 推、拉、舉起的上限 */
  dragLift: number
}

/** 2024 規則：負重上限 = 力量 × 15（依體型倍數），推拉舉 = 力量 × 30。 */
export function encumbrance(data: RulesData, c: Character, str: number, size: string): Encumbrance {
  const mult = SIZE_MULT[size] ?? 1
  const coins = (c.currency.cp + c.currency.sp + c.currency.ep + c.currency.gp + c.currency.pp) / 50
  return {
    carried: Math.round(c.inventory.reduce((s, i) => s + itemWeight(data, i), 0) * 100) / 100,
    coins: Math.round(coins * 100) / 100,
    capacity: str * 15 * mult,
    dragLift: str * 30 * mult,
  }
}

// ---------------------------------------------------------------------------
// AC
// ---------------------------------------------------------------------------

const typeCode = (it: Entry | undefined) => String(it?.type ?? '').split('|')[0]!

export interface ArmorClass {
  value: number
  parts: { label: string; value: number }[]
  armor?: Entry
  shield?: Entry
  warnings: string[]
}

const bonusOf = (v: unknown) => Number(String(v ?? '0').replace('+', '')) || 0

/**
 * 依裝備中的護甲與盾牌計算 AC（2024 規則）：
 *   無甲 10＋敏捷；輕甲 基礎＋敏捷；中甲 基礎＋敏捷（最多 2）；重甲 基礎；盾牌 +2；魔法物品 bonusAc。
 * 無甲防禦等只有文字的特性不在這裡算（列在效果頁，可手動覆寫）。
 */
export function armorClass(data: RulesData, c: Character, sheet: Pick<Sheet, 'abilities' | 'profs'>): ArmorClass {
  const equipped = c.inventory.filter((i) => i.equipped).map((i) => ({ inv: i, it: i.itemId ? data.get(i.itemId) : undefined }))
  const armor = equipped.find((x) => ['LA', 'MA', 'HA'].includes(typeCode(x.it)))?.it
  const shield = equipped.find((x) => typeCode(x.it) === 'S')?.it
  const dex = sheet.abilities.dex.mod
  const parts: { label: string; value: number }[] = []
  const warnings: string[] = []
  if (!armor) parts.push({ label: '無甲', value: 10 }, { label: '敏捷', value: dex })
  else {
    const base = Number(armor.ac ?? 10)
    parts.push({ label: armor.name, value: base })
    const t = typeCode(armor)
    if (t === 'LA') parts.push({ label: '敏捷', value: dex })
    if (t === 'MA') parts.push({ label: '敏捷（最多 +2）', value: Math.min(dex, Number(armor.dexterityMax ?? 2)) })
    const trained = new Set(sheet.profs.armor.map((p) => p.value))
    const need = t === 'LA' ? 'light' : t === 'MA' ? 'medium' : 'heavy'
    if (!trained.has(need)) warnings.push(`沒有${armor.name}的護甲訓練：力量、敏捷的檢定、豁免與攻擊具有劣勢，且不能施法`)
    if (armor.strength && sheet.abilities.str.score < Number(armor.strength)) warnings.push(`力量低於 ${armor.strength}：速度 −10 呎`)
    if (armor.bonusAc) parts.push({ label: `${armor.name}加值`, value: bonusOf(armor.bonusAc) })
  }
  if (shield) {
    parts.push({ label: shield.name, value: Number(shield.ac ?? 2) + bonusOf(shield.bonusAc) })
    if (!sheet.profs.armor.some((p) => p.value === 'shield')) warnings.push('沒有盾牌訓練')
  }
  for (const x of equipped) {
    if (x.it && x.it !== armor && x.it !== shield && x.it.bonusAc) parts.push({ label: x.it.name, value: bonusOf(x.it.bonusAc) })
  }
  return { value: parts.reduce((s, p) => s + p.value, 0), parts, ...(armor ? { armor } : {}), ...(shield ? { shield } : {}), warnings }
}

// ---------------------------------------------------------------------------
// 攻擊列
// ---------------------------------------------------------------------------

export interface AttackRow {
  key: string
  name: string
  engName?: string
  entry?: Entry
  kind: 'weapon' | 'unarmed' | 'spell'
  /** 近戰武器／遠程武器／戲法… */
  typeLabel: string
  range: string
  hitDc: string
  damage: string
  /** 屬性、精通等備註 */
  notes: string[]
  mastery?: Entry
  proficient: boolean
}

const DMG_TYPE: Record<string, string> = {
  B: '钝击',
  P: '穿刺',
  S: '挥砍',
  A: '强酸',
  C: '寒冷',
  F: '火焰',
  O: '力场',
  L: '闪电',
  N: '暗蚀',
  I: '毒素',
  Y: '心灵',
  R: '光耀',
  T: '雷鸣',
}

/** 武器屬性代碼 → 中文名（取自資料 itemProperty 的 entries 標題）。 */
export function propertyName(data: RulesData, code: string): string {
  const [abbr, src = 'PHB'] = code.split('|')
  const p = data.get(`itemProperty|${abbr}|${src}`) ?? data.get(`itemProperty|${abbr}|PHB`)
  const first = (p?.entries as Json[] | undefined)?.[0]
  return (first && typeof first === 'object' && first.name) || abbr || code
}

function weaponProficient(data: RulesData, it: Entry, weaponProfs: string[]): boolean {
  const cat = String(it.weaponCategory ?? '')
  if (weaponProfs.includes(cat)) return true
  const key = `${it.name}|${it.source}`.toLowerCase()
  if (weaponProfs.some((w) => w === key || w.split('|')[0] === it.name)) return true
  // 「军用武器（轻型或灵巧）」這類篩選熟練（武僧、遊蕩者）：比對類別與屬性中文名
  const propNames = ((it.property as string[] | undefined) ?? []).map((p) => propertyName(data, String(p)))
  return weaponProfs.some((w) => {
    const m = /^filter:(.+?)(?:（(.+)）)?$/.exec(w)
    if (!m) return false
    const wantCat = m[1]!.includes('军用') ? 'martial' : m[1]!.includes('简易') ? 'simple' : ''
    if (wantCat && wantCat !== cat) return false
    return !m[2] || m[2].split('或').some((p) => propNames.includes(p))
  })
}

const signed = (n: number) => (n === 0 ? '' : n > 0 ? `+${n}` : `${n}`)

export function attackRows(
  data: RulesData,
  c: Character,
  b: Pick<Build, 'features'>,
  sheet: Pick<Sheet, 'abilities' | 'profs' | 'profBonus'>,
  spells: SpellRow[],
): AttackRow[] {
  const rows: AttackRow[] = []
  const pb = sheet.profBonus
  const str = sheet.abilities.str.mod
  const dex = sheet.abilities.dex.mod
  const weaponProfs = sheet.profs.weapon.map((w) => w.value)
  const hasMastery = b.features.some((f) => f.entry.engName === 'Weapon Mastery')

  for (const inv of c.inventory) {
    const it = inv.itemId ? data.get(inv.itemId) : undefined
    if (!it?.weapon || !inv.equipped) continue
    const props = ((it.property as string[] | undefined) ?? []).map((p) => (typeof p === 'string' ? p : String((p as Json).uid ?? '')))
    const abbr = props.map((p) => p.split('|')[0])
    const ranged = typeCode(it) === 'R'
    const finesse = abbr.includes('F')
    const ability: Ability = ranged ? 'dex' : finesse && dex > str ? 'dex' : 'str'
    const mod = ability === 'dex' ? dex : str
    const proficient = weaponProficient(data, it, weaponProfs)
    const bonus = bonusOf(it.bonusWeapon)
    const hit = mod + (proficient ? pb : 0) + bonus
    const dt = DMG_TYPE[String(it.dmgType)] ?? ''
    const dmg = (d: unknown) => `${d}${signed(mod + bonus)}`
    const damage = [it.dmg1 && dmg(it.dmg1), abbr.includes('V') && it.dmg2 && `${dmg(it.dmg2)}（双手）`].filter(Boolean).join(' / ')
    const notes = props.map((p) => propertyName(data, p))
    if (it.range) notes.push(`射程 ${String(it.range).replace('/', '/')} 呎`)
    const masteryRef = (it.mastery as string[] | undefined)?.[0]
    const mastery = masteryRef ? lookupRef(data, 'itemMastery', masteryRef) : undefined
    if (mastery) notes.push(`精通：${mastery.name}${hasMastery ? '' : '（需要武器精通特性）'}`)
    if (!proficient) notes.push('未熟練（不加熟練加值）')
    rows.push({
      key: inv.uid,
      name: inv.name ?? it.name,
      ...(it.engName ? { engName: it.engName } : {}),
      entry: it,
      kind: 'weapon',
      typeLabel: ranged ? '远程武器' : '近战武器',
      range: ranged ? `${it.range} 呎` : abbr.includes('R') ? '10 呎' : it.range ? `5 呎（投掷 ${it.range}）` : '5 呎',
      hitDc: formatMod(hit),
      damage: `${damage}${dt ? ` ${dt}` : ''}`,
      notes,
      ...(mastery ? { mastery } : {}),
      proficient,
    })
  }

  // 徒手打擊：1＋力量，所有人都熟練
  rows.push({
    key: 'unarmed',
    name: '徒手打击',
    engName: 'Unarmed Strike',
    kind: 'unarmed',
    typeLabel: '近战攻击',
    range: '5 呎',
    hitDc: formatMod(str + pb),
    damage: `${Math.max(0, 1 + str)} 钝击`,
    notes: [],
    proficient: true,
  })

  // 攻擊型法術（有攻擊檢定，或有傷害的戲法）
  for (const r of spells) {
    if (r.bookOnly) continue
    if (r.attackBonus === undefined && !(r.level === 0 && r.damage)) continue
    rows.push({
      key: `spell:${r.key}`,
      name: r.spell.name,
      ...(r.spell.engName ? { engName: r.spell.engName } : {}),
      entry: r.spell,
      kind: 'spell',
      typeLabel: r.level === 0 ? `戏法｜${r.sourceLabel}` : `${r.level}环｜${r.sourceLabel}`,
      range: r.range,
      hitDc: r.hitDc,
      damage: r.damage ?? '',
      notes: [r.usesText, r.concentration ? '专注' : '', r.components].filter((x): x is string => !!x),
      proficient: true,
    })
  }
  return rows
}
