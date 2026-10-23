/**
 * 法術選擇池（M9.md §2.2，純函式）：把規則引擎的法術選擇欄位整理成「依來源分組、組內依步驟排序」的兩層導覽。
 *
 *   法師     戲法 4/4 · 法術書與準備（書 16/16・備 0/10） · 死灵师（免費抄寫） 0/3
 *   其他來源 魔法学徒・戲法 0/2 · 高等精靈・戲法 0/1
 *
 * 一個池子對應一個選擇欄位；法師的法術書與準備是兩個欄位合成的一個池子。
 * 同一特性、同一種取得方式的多次選擇在規則引擎就已合併成一個欄位（每一格各自的條件在 spell.slots）。
 */
import type { Entry } from '../../data/types.ts'
import { schoolName } from '../../data/summary.ts'
import type { Build, ChoiceSlot, SpellScope, SpellbookInfo } from '../build.ts'
import { matchSpellFilter, parseSpellFilter, type RulesData } from '../data.ts'
import type { GrantKind } from './grants.ts'
import type { SpellbookRules, SpellbookState } from './spellbook.ts'

export type SpellSlotChoice = ChoiceSlot & { spell: SpellScope }

export interface SpellPool {
  /** 主要欄位 key（法師為法術書欄位） */
  id: string
  /** 導覽分組：職業 id，或 'other'（種族、背景、專長、祈喚…） */
  group: string
  kind: GrantKind
  /** 導覽上的短名稱：「戲法」「法術書與準備」「準備法術」「死灵师（免費抄寫）」「魔法学徒・戲法」 */
  label: string
  /** 規則白話文（池子標題列） */
  rule: string
  /** 每格的限制摘要：「≤2 環 ×2、≤3 環 ×1，限死灵系」 */
  restriction?: string
  slot: SpellSlotChoice
  /** 法師：準備法術欄位 */
  prepSlot?: SpellSlotChoice
  book?: SpellbookInfo
  filled: number
  count: number
  done: boolean
}

export interface SpellPoolGroup {
  id: string
  label: string
  pools: SpellPool[]
}

const isSpellSlot = (s: ChoiceSlot): s is SpellSlotChoice => s.type === 'spell' && !!s.spell

/** 組內排序：戲法 → 已知／法術書與準備／準備 → 子職免費 → 秘法奧義 → 其他 */
function stepRank(p: Pick<SpellPool, 'kind' | 'slot'>): number {
  const role = p.slot.spell.role
  if (role === 'cantrips') return 0
  if (role === 'spellbook' || role === 'prepared' || (role === 'known' && p.kind !== 'arcanum')) return 1
  if (p.kind === 'arcanum') return 3
  return p.slot.origin.type === 'subclass' ? 2 : 4
}

/** 篩選字串的白話文：「法师清單的 ≤2 環死灵系法術」 */
export function filterText(filter: string | undefined): string {
  if (!filter) return '法術'
  const f = parseSpellFilter(filter)
  const lv = f.levels ?? []
  const level = !lv.length ? '' : lv.every((l) => l === 0) ? '戲法' : lv.length === 1 ? `${lv[0]} 環` : `≤${Math.max(...lv)} 環`
  const list = f.classes?.length ? `${f.classes.join('、')}清單的` : f.sources?.length ? `${f.sources.join('、')} 的` : ''
  const school = f.schools?.length ? `${f.schools.map(schoolName).join('、')}系` : ''
  const extra = [f.ritual && '儀式', f.spellAttack && '需攻擊檢定'].filter(Boolean).join('、')
  const what = level === '戲法' ? `${school}${extra}戲法` : `${level}${school}${extra}法術`
  return `${list}${what}`
}

function ruleText(slot: SpellSlotChoice, book?: SpellbookInfo): string {
  const sc = slot.spell
  const list = sc.classList ? `${sc.classList}清單` : ''
  if (book) {
    return `從${list}抄寫 1–${book.maxLevel} 環法術進法術書（${book.bookCap} 道），再從法術書中準備 ${book.prepCap} 道（${book.changeLabel}）。同一列點一下抄進法術書，再點一下設為準備。`
  }
  const cells = sc.slots?.map((x) => (x.filter ? filterText(x.filter) : x.label)) ?? []
  const from = cells.length ? [...new Set(cells)].join('或') : sc.filter ? filterText(sc.filter) : list ? `${list}的法術` : '法術'
  switch (sc.kind) {
    case 'cantrip':
      return sc.role === 'cantrips' ? `從${list}選戲法。戲法依角色總等級升階。` : `從${from}選，直接學會${sc.free ? '，不占職業戲法數' : ''}。`
    case 'spellbook':
      return `從${from}選，免費加入法術書，不占法術書名額。之後仍需要準備才能施放。`
    case 'known':
      return sc.free ? `從${from}選，成為額外的已知法術，不占已知法術數。` : `從${list}選 1–${sc.maxLevel} 環法術成為已知法術（升級時可替換一個）。`
    case 'prepared':
      return `從${list}選 1–${sc.maxLevel} 環法術準備。${slot.label.includes('升級時') ? '升級時可替換一個。' : '長休後可全部重選。'}`
    case 'always':
      return `從${from}選，永遠準備，不占準備數。`
    case 'innate':
      return `從${from}選，以天生施法施放（次數見已學會的法術）。`
    case 'arcanum':
      return '每個環位選一道魔契師法術作為秘法奧義：不用法術位，每道 1/長休。'
    default:
      return `從${from}選。`
  }
}

function restrictionText(sc: SpellScope): string | undefined {
  if (!sc.slots?.length || sc.slots.length < 2) return undefined
  const counts = new Map<string, number>()
  for (const s of sc.slots) counts.set(s.label, (counts.get(s.label) ?? 0) + 1)
  const schools = [...new Set(sc.slots.flatMap((s) => (s.filter ? (parseSpellFilter(s.filter).schools ?? []) : [])))]
  const text = [...counts].map(([l, c]) => (c > 1 ? `${l} ×${c}` : l)).join('、')
  return schools.length ? `${text}，限${schools.map(schoolName).join('、')}系` : text
}

/** 職業 id：職業欄位就是自己；子職欄位看子職條目的 className／classSource */
function classIdOf(b: Pick<Build, 'classes'>, slot: SpellSlotChoice): string | undefined {
  const e = slot.origin.entry
  if (!e) return undefined
  if (slot.origin.type === 'class') return e.id
  if (slot.origin.type === 'subclass') return b.classes.find((i) => i.subclass?.id === e.id || i.entry.id === e.id)?.entry.id
  return undefined
}

const shortOrigin = (s: SpellSlotChoice) => s.origin.name.replace(/ \d+ 级$/, '')

export function buildSpellPools(b: Pick<Build, 'slots' | 'classes'>): SpellPoolGroup[] {
  const spellSlots = b.slots.filter(isSpellSlot)
  const byKey = new Map(spellSlots.map((s) => [s.key, s]))
  const used = new Set<string>()
  const pools: SpellPool[] = []
  for (const s of spellSlots) {
    if (used.has(s.key)) continue
    used.add(s.key)
    const book = s.spell.book
    const prep = book ? byKey.get(book.prepKey) : undefined
    if (prep) used.add(prep.key)
    const cls = classIdOf(b, s)
    const kind = s.spell.kind
    const filled = s.selected.filter(Boolean).length + (prep ? prep.selected.filter(Boolean).length : 0)
    const count = s.count + (prep ? prep.count : 0)
    const label = book
      ? '法術書與準備'
      : s.spell.role === 'cantrips'
        ? '戲法'
        : s.spell.role === 'prepared'
          ? '準備法術'
          : s.spell.role === 'known' && kind === 'known'
            ? '已知法術'
            : kind === 'arcanum'
              ? '秘法奧義'
              : kind === 'spellbook' && s.spell.free
                ? `${shortOrigin(s)}（免費抄寫）`
                : `${shortOrigin(s)}・${s.spell.cantrip ? '戲法' : '法術'}`
    const restriction = restrictionText(s.spell)
    pools.push({
      id: s.key,
      group: cls ?? 'other',
      kind,
      label,
      rule: ruleText(s, book),
      ...(restriction ? { restriction } : {}),
      slot: s,
      ...(prep ? { prepSlot: prep } : {}),
      ...(book ? { book } : {}),
      filled,
      count,
      done: s.done && (!prep || prep.done) && !s.warnings.length,
    })
  }
  const groups: SpellPoolGroup[] = []
  for (const info of b.classes) {
    const ps = pools.filter((p) => p.group === info.entry.id)
    if (ps.length) groups.push({ id: info.entry.id, label: info.entry.name, pools: ps })
  }
  const other = pools.filter((p) => p.group === 'other' || !b.classes.some((i) => i.entry.id === p.group))
  if (other.length) groups.push({ id: 'other', label: '其他來源', pools: other })
  for (const g of groups) g.pools = g.pools.map((p, i) => ({ p, i })).sort((x, y) => stepRank(x.p) - stepRank(y.p) || x.i - y.i).map((x) => x.p)
  return groups
}

// ---------------------------------------------------------------------------
// 池子的格子：每一格各自的條件
// ---------------------------------------------------------------------------

/** 法術能不能放進第 i 格 */
export function cellAccepts(data: RulesData, scope: SpellScope, i: number, sp: Entry): boolean {
  const cell = scope.slots?.[i]
  if (!cell) return true
  if (cell.from) return cell.from.includes(sp.id)
  if (cell.filter) return matchSpellFilter(data, sp, parseSpellFilter(cell.filter))
  return true
}

/** 一格的「寬鬆程度」（能放的最高環位），用來把法術放進最嚴格、仍然符合的空格 */
function cellCap(scope: SpellScope, i: number): number {
  const f = scope.slots?.[i]?.filter
  const lv = f ? parseSpellFilter(f).levels : undefined
  return lv?.length ? Math.max(...lv) : 99
}

/**
 * 選一道法術時要放進哪一格：符合條件的空格中最嚴格的一格（例如 1 環法術放進 ≤2 環的格子，留下 ≤3 環的給更高環的法術）。
 * 回傳 -1 表示沒有可放的空格。
 */
export function assignCell(data: RulesData, scope: SpellScope, selected: string[], count: number, sp: Entry): number {
  let best = -1
  for (let i = 0; i < count; i++) {
    if (selected[i]) continue
    if (!cellAccepts(data, scope, i, sp)) continue
    if (best < 0 || cellCap(scope, i) < cellCap(scope, best)) best = i
  }
  return best
}

/** 在池子裡切換一道法術：已選就移除（留空格），沒選就放進最適合的空格。回傳新的選擇陣列，放不下回傳原因。 */
export function togglePoolSpell(
  data: RulesData,
  slot: Pick<ChoiceSlot, 'selected' | 'count'> & { spell: SpellScope },
  sp: Entry,
): { selected: string[]; blockedReason?: string } {
  const sel = Array.from({ length: slot.count }, (_, i) => slot.selected[i] ?? '')
  const at = sel.indexOf(sp.id)
  if (at >= 0) {
    sel[at] = ''
    return { selected: sel }
  }
  if (!slot.spell.slots) {
    // 一般欄位：不分格
    const cur = sel.filter(Boolean)
    if (slot.count === 1) return { selected: [sp.id] }
    if (cur.length >= slot.count) return { selected: slot.selected, blockedReason: `已選滿 ${cur.length}/${slot.count}` }
    return { selected: [...cur, sp.id] }
  }
  const i = assignCell(data, slot.spell, sel, slot.count, sp)
  if (i < 0) {
    const anyCell = sel.some((_, j) => cellAccepts(data, slot.spell, j, sp))
    return { selected: slot.selected, blockedReason: anyCell ? '符合條件的格子都已選了' : '不符合任何一格的條件' }
  }
  sel[i] = sp.id
  return { selected: sel }
}

// ---------------------------------------------------------------------------
// 法術書：從規則引擎的欄位組出狀態機的輸入
// ---------------------------------------------------------------------------

export function spellbookState(book: SpellbookInfo, slots: Pick<Build, 'slots'>['slots']): SpellbookState {
  const get = (k: string) => slots.find((s) => s.key === k)?.selected.filter(Boolean) ?? []
  return { book: get(book.bookKey), prepared: get(book.prepKey) }
}

export function spellbookRules(book: SpellbookInfo, data: RulesData): SpellbookRules {
  return {
    bookCap: book.bookCap,
    prepCap: book.prepCap,
    maxLevel: book.maxLevel,
    free: new Map(book.free),
    always: new Map(book.always),
    levelOf: (id) => Number(data.get(id)?.level ?? 99),
  }
}
