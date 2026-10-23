/**
 * 法術書制（法師）的兩階段狀態機（M9.md §2.3，純函式）。
 *
 * 一道法術只有三種狀態：未擁有 → 在法術書 → 已準備。「已準備」一定也「在法術書」。
 * 清單上同一列點一下就往下一個狀態走：
 *
 *   未擁有 ──點──▶ 在法術書 ──點──▶ 已準備 ──點──▶ 未擁有（移出法術書，同時取消準備）
 *
 * 例外：
 *   - 免費抄寫（子職學者、寻获魔宠…）：一開始就在書裡、不占書的名額，只能在「在法術書」與「已準備」之間切換。
 *   - 已由其他來源永遠準備：「準備」這一階段鎖住（避免浪費準備名額），點擊在「未擁有」與「在法術書」之間切換。
 *   - 書滿／備滿／環位太高：狀態不變，回傳原因。
 */

export type BookStatus = 'none' | 'book' | 'prepared'

/** 存檔裡的法術書狀態：book 只放「付費抄寫」的法術（免費抄寫由子職決定，不存）；prepared 可以包含免費抄寫的法術 */
export interface SpellbookState {
  book: string[]
  prepared: string[]
}

export interface SpellbookRules {
  /** 法術書名額（不含免費抄寫） */
  bookCap: number
  /** 準備名額 */
  prepCap: number
  /** 法師自身等級能抄寫、準備的最高環位 */
  maxLevel: number
  /** 免費加入法術書的法術 → 來源名稱 */
  free: ReadonlyMap<string, string>
  /** 已由其他來源永遠準備的法術 → 來源名稱 */
  always: ReadonlyMap<string, string>
  /** 法術環位 */
  levelOf: (id: string) => number
}

export function inBook(state: SpellbookState, rules: Pick<SpellbookRules, 'free'>, id: string): boolean {
  return rules.free.has(id) || state.book.includes(id)
}

export function bookStatus(state: SpellbookState, rules: Pick<SpellbookRules, 'free'>, id: string): BookStatus {
  if (!inBook(state, rules, id)) return 'none'
  return state.prepared.includes(id) ? 'prepared' : 'book'
}

/** 目前用掉的名額：書只算付費抄寫；準備只算不是永遠準備的 */
export function bookCounts(state: SpellbookState, rules: Pick<SpellbookRules, 'free' | 'always'>) {
  return {
    book: state.book.filter((id) => !rules.free.has(id)).length,
    prepared: state.prepared.filter((id) => !rules.always.has(id)).length,
  }
}

export interface CycleResult {
  state: SpellbookState
  /** 被擋下的原因（狀態不變） */
  blockedReason?: string
}

const without = (list: string[], id: string) => list.filter((x) => x !== id)

/** 設為準備前的檢查；可以準備回傳 undefined */
function prepareBlock(state: SpellbookState, id: string, rules: SpellbookRules): string | undefined {
  const by = rules.always.get(id)
  if (by) return `已由 ${by} 永遠準備`
  if (rules.levelOf(id) > rules.maxLevel) return `環位太高（目前最高 ${rules.maxLevel} 環）`
  const n = bookCounts(state, rules).prepared
  if (n >= rules.prepCap) return `準備已滿 ${n}/${rules.prepCap}`
  return undefined
}

/** 清單上點一下（M9.md §2.3 的切換表） */
export function cycleSpellbookState(state: SpellbookState, id: string, rules: SpellbookRules): CycleResult {
  const status = bookStatus(state, rules, id)
  const free = rules.free.has(id)
  if (status === 'none') {
    if (rules.levelOf(id) < 1) return { state, blockedReason: '戲法不抄進法術書' }
    if (rules.levelOf(id) > rules.maxLevel) return { state, blockedReason: `環位太高（目前最高 ${rules.maxLevel} 環）` }
    const n = bookCounts(state, rules).book
    if (n >= rules.bookCap) return { state, blockedReason: `法術書已滿 ${n}/${rules.bookCap}` }
    return { state: { ...state, book: [...state.book, id] } }
  }
  if (status === 'book') {
    // 永遠準備的法術：跳過「準備」，直接移出（免費抄寫的移不出去）
    if (rules.always.has(id)) {
      if (free) return { state, blockedReason: `已由 ${rules.always.get(id)} 永遠準備` }
      return { state: { ...state, book: without(state.book, id) } }
    }
    const block = prepareBlock(state, id, rules)
    if (block) return { state, blockedReason: block }
    return { state: { ...state, prepared: [...state.prepared, id] } }
  }
  // 已準備 → 未擁有；免費抄寫的只取消準備
  if (free) return { state: { ...state, prepared: without(state.prepared, id) } }
  return { state: { book: without(state.book, id), prepared: without(state.prepared, id) } }
}

/** 只取消準備，保留在法術書（「已學會」那一列的「取消準備」、清單右鍵選單） */
export function unprepare(state: SpellbookState, id: string): SpellbookState {
  return { ...state, prepared: without(state.prepared, id) }
}

/** 從法術書設為準備（「已學會」裡「僅在法術書」那一列的「準備」按鈕，等同點第二下） */
export function prepare(state: SpellbookState, id: string, rules: SpellbookRules): CycleResult {
  if (!inBook(state, rules, id)) return { state, blockedReason: '不在法術書中' }
  if (state.prepared.includes(id)) return { state }
  const block = prepareBlock(state, id, rules)
  return block ? { state, blockedReason: block } : { state: { ...state, prepared: [...state.prepared, id] } }
}

/**
 * 載入時驗證並修正：prepared ⊆ 法術書。已準備但不在書裡的法術自動補進書；補進去後若超出名額，
 * 多出來的保持未選擇（從 prepared 移除）並回傳提示。
 */
export function normalizeSpellbook(state: SpellbookState, rules: Pick<SpellbookRules, 'free' | 'bookCap'>): { state: SpellbookState; notes: string[] } {
  const book = [...new Set(state.book)].filter((id) => !rules.free.has(id))
  const prepared = [...new Set(state.prepared)]
  const notes: string[] = []
  const kept: string[] = []
  for (const id of prepared) {
    if (rules.free.has(id) || book.includes(id)) kept.push(id)
    else if (book.length < rules.bookCap) {
      book.push(id)
      kept.push(id)
      notes.push(`「${id}」已準備但不在法術書，已自動補進法術書`)
    } else notes.push(`「${id}」已準備但不在法術書，法術書已滿，改為未選擇`)
  }
  return { state: { book, prepared: kept }, notes }
}
