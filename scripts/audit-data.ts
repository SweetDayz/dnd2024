// 資料完整性稽核（build-data 結束時自動執行）。
//
// 每個資料類別、每個來源：raw/ 的條目數 vs 輸出的條目數，以及在預設書目（official）下執行期的可見數。
// 所有沒有進到輸出的條目都要有原因（不在白名單、母條目不存在、重複、整檔排除），
// 「raw − 輸出 − 有原因的丟棄」不為 0 就是「未說明的丟棄」，會在報告與終端機標紅。
// 結果寫到 docs/data-audit.md（進 git，資料更新時可用 diff 看出變化），終端機只印摘要。
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { EntryKind } from '../src/data/ids.ts'
import { sourceAbbr } from '../src/data/sourceDisplay.ts'
import { DEFAULT_GROUP_ID, SOURCE_GROUPS } from '../src/data/sourceGroups.ts'
import type { Entry, SourceInfo } from '../src/data/types.ts'
import { isSuperseded } from '../src/data/visibility.ts'
import type { BuildReport, Dataset, DropReason, DropRecord } from './lib/pipeline.ts'
import type { RawRead } from './lib/rawInput.ts'

const OUT = resolve('docs/data-audit.md')

const KIND_LABEL: Record<EntryKind, string> = {
  race: '種族',
  subrace: '亞種',
  background: '背景',
  feat: '專長',
  optionalfeature: '可選特性',
  item: '物品（含基礎物品、物品組、泛用魔法變體）',
  spell: '法術',
  class: '職業',
  subclass: '子職',
  classFeature: '職業特性',
  subclassFeature: '子職特性',
  language: '語言',
  skill: '技能',
  condition: '狀態',
  disease: '疾病',
  status: '狀況（status）',
  variantrule: '規則條目',
  sense: '感官',
  action: '動作',
  itemProperty: '物品屬性',
  itemMastery: '武器精通',
}

const REASON_LABEL: Record<DropReason | 'excluded', string> = {
  'not-whitelisted': '來源不在白名單',
  'parent-missing': '母條目不存在（母條目的書不在白名單）',
  duplicate: '同類別重複（保留第一筆）',
  excluded: '整檔排除（被類型篩掉）',
}

export interface AuditInput {
  report: Required<BuildReport>
  dataset: Dataset
  sources: readonly SourceInfo[]
  excluded: RawRead['excluded']
  /** raw/VERSION 的內容 */
  version: string
}

export interface KindSummary {
  kind: EntryKind
  raw: number
  output: number
  dropped: Record<string, number>
  unexplained: number
  hiddenReprint: number
  hiddenTce: number
  visible: number
}

export function summarize({
  report,
  dataset,
  excluded,
}: Pick<AuditInput, 'report' | 'dataset' | 'excluded'>): KindSummary[] {
  const enabled = new Set(SOURCE_GROUPS[DEFAULT_GROUP_ID]!.sources)
  const kinds = Object.keys(report.rawCounts) as EntryKind[]
  return kinds.map((kind) => {
    const out = dataset[kind] ?? []
    const raw = Object.values(report.rawCounts[kind] ?? {}).reduce((a, b) => a + b, 0)
    const dropped: Record<string, number> = {}
    for (const d of report.dropped.filter((x) => x.kind === kind))
      dropped[d.reason] = (dropped[d.reason] ?? 0) + 1
    const shown = out.filter((e) => enabled.has(e.source))
    const hiddenReprint = shown.filter((e) => isSuperseded(e, enabled)).length
    const hiddenTce = shown.filter((e) => e.tceOptional && !isSuperseded(e, enabled)).length
    const droppedTotal = Object.values(dropped).reduce((a, b) => a + b, 0)
    const excl = excluded.filter((x) => x.kind === kind).length
    if (excl) dropped.excluded = excl
    return {
      kind,
      // 整檔排除的條目沒有進到管線，raw 數加回來才是 raw/ 的實際總數
      raw: raw + excl,
      output: out.length,
      dropped,
      unexplained: raw - out.length - droppedTotal,
      hiddenReprint,
      hiddenTce,
      visible: shown.length - hiddenReprint - hiddenTce,
    }
  })
}

const esc = (s: string) => s.replace(/\|/g, '\\|')
const srcLabel = (s: string) => (sourceAbbr(s) === s ? s : `${sourceAbbr(s)}（${s}）`)

export function renderAudit(input: AuditInput, summary: KindSummary[]): string {
  const { report, dataset, excluded, version } = input
  const [repo = '', branch = '', commit = '', committedAt = ''] = version.trim().split(/\r?\n/)
  const L: string[] = []
  L.push('# 資料完整性稽核（data-audit）')
  L.push('')
  L.push('> 由 `npm run build-data` 自動產生（`scripts/audit-data.ts`），不要手改。')
  L.push(`> 上游：${repo} \`${branch}\` \`${commit.slice(0, 7)}\`（${committedAt}）。`)
  L.push(
    '> 「可見」＝預設書目 `official`、隱藏被重印取代的版本、TCE 可選規則關閉時，資料瀏覽器與建角會列出的數量。',
  )
  L.push('')
  const bad = summary.filter((s) => s.unexplained !== 0)
  L.push(
    bad.length
      ? `**⚠ 有未說明原因的丟棄：${bad.map((s) => `${s.kind} ${s.unexplained}`).join('、')}**`
      : '**未說明原因的丟棄：0**',
  )
  L.push('')
  L.push('## 1. 摘要')
  L.push('')
  L.push(
    '| 類別 | raw | 輸出 | 白名單外 | 母條目不存在 | 重複 | 整檔排除 | 未說明 | 重印隱藏 | TCE 隱藏 | 可見 |',
  )
  L.push('| ---- | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: |')
  for (const s of summary) {
    const d = (r: string) => s.dropped[r] ?? 0
    L.push(
      `| ${KIND_LABEL[s.kind]} \`${s.kind}\` | ${s.raw} | ${s.output} | ${d('not-whitelisted')} | ${d('parent-missing')} | ${d('duplicate')} | ${d('excluded')} | ${s.unexplained ? `**${s.unexplained}**` : 0} | ${s.hiddenReprint} | ${s.hiddenTce} | ${s.visible} |`,
    )
  }
  L.push('')

  L.push('## 2. 各類別 × 來源（白名單內）')
  L.push('')
  L.push('raw 與輸出不同的來源才有差異（例如同名重複），其餘應相等。')
  L.push('')
  const enabled = new Set(SOURCE_GROUPS[DEFAULT_GROUP_ID]!.sources)
  for (const s of summary) {
    const raw = report.rawCounts[s.kind] ?? {}
    const out: Record<string, Entry[]> = {}
    for (const e of dataset[s.kind] ?? []) (out[e.source] ??= []).push(e)
    const srcs = Object.keys(raw)
      .filter((x) => enabled.has(x))
      .sort()
    if (!srcs.length) continue
    L.push(`<details><summary>${KIND_LABEL[s.kind]}（${srcs.length} 個來源）</summary>`)
    L.push('')
    L.push('| 來源 | raw | 輸出 | 重印隱藏 | TCE 隱藏 | 可見 |')
    L.push('| ---- | --: | --: | --: | --: | --: |')
    for (const src of srcs) {
      const list = out[src] ?? []
      const rp = list.filter((e) => isSuperseded(e, enabled)).length
      const tce = list.filter((e) => e.tceOptional && !isSuperseded(e, enabled)).length
      L.push(
        `| ${srcLabel(src)} | ${raw[src]} | ${list.length} | ${rp} | ${tce} | ${list.length - rp - tce} |`,
      )
    }
    L.push('')
    L.push('</details>')
    L.push('')
  }

  L.push('## 3. 丟棄明細')
  L.push('')
  L.push('### 3a. 來源不在白名單')
  L.push('')
  L.push(
    '白名單見 `src/data/sourceGroups.ts`（`official`：不收冒險模組、`setting-alt`、`supplement-alt`、UA 等，使用者 2026-10-23 定案）。依來源分組：',
  )
  L.push('')
  const nw = report.dropped.filter((d) => d.reason === 'not-whitelisted')
  const bySrc = new Map<string, DropRecord[]>()
  for (const d of nw) bySrc.set(d.source, [...(bySrc.get(d.source) ?? []), d])
  L.push('| 來源 | 筆數 | 類別 |')
  L.push('| ---- | --: | ---- |')
  for (const [src, list] of [...bySrc].sort((a, b) => b[1].length - a[1].length)) {
    const kinds = new Map<string, number>()
    for (const d of list) kinds.set(d.kind, (kinds.get(d.kind) ?? 0) + 1)
    L.push(`| ${src} | ${list.length} | ${[...kinds].map(([k, n]) => `${k} ${n}`).join('、')} |`)
  }
  L.push('')
  for (const reason of ['parent-missing', 'duplicate'] as const) {
    const list = report.dropped.filter((d) => d.reason === reason)
    L.push(
      `### 3${reason === 'parent-missing' ? 'b' : 'c'}. ${REASON_LABEL[reason]}（${list.length}）`,
    )
    L.push('')
    if (reason === 'duplicate')
      L.push('同名同源的條目只保留第一筆（例如 `items.json` 與 `items-base.json` 都有的物品）。')
    if (reason === 'parent-missing')
      L.push('子條目本身的書在白名單內，但所屬的種族／職業／子職來自白名單外的書。')
    L.push('')
    if (list.length) {
      L.push('<details><summary>明細</summary>')
      L.push('')
      L.push('| 類別 | 名稱 | 來源 | 說明 |')
      L.push('| ---- | ---- | ---- | ---- |')
      for (const d of list)
        L.push(`| ${d.kind} | ${esc(d.name)} | ${d.source} | ${esc(d.detail ?? '')} |`)
      L.push('')
      L.push('</details>')
      L.push('')
    }
  }
  L.push(`### 3d. ${REASON_LABEL.excluded}（${excluded.length}）`)
  L.push('')
  const exReasons = new Map<string, number>()
  for (const x of excluded) exReasons.set(x.reason, (exReasons.get(x.reason) ?? 0) + 1)
  for (const [r, n] of exReasons) L.push(`- ${r}：${n} 筆`)
  L.push('')

  L.push('## 4. 重印目標解析不到')
  L.push('')
  const missing = report.reprintUnresolved.filter((u) => u.reason === 'target-missing')
  L.push(
    `共 ${report.reprintUnresolved.length} 筆：目標書不在白名單 ${report.reprintUnresolved.length - missing.length}（正常，舊版照常顯示）、目標書在白名單但條目不存在 ${missing.length}（原因見 \`docs/data-notes.md\` §4a）。`,
  )
  L.push('')
  if (missing.length) {
    L.push('| 條目 | 重印參照 |')
    L.push('| ---- | ---- |')
    for (const u of missing) L.push(`| ${esc(u.id)} | ${esc(u.ref)} |`)
    L.push('')
  }
  return L.join('\n')
}

/** 寫報告並在終端機印摘要。回傳摘要（測試用）。 */
export function auditData(input: AuditInput): KindSummary[] {
  const summary = summarize(input)
  writeFileSync(OUT, renderAudit(input, summary) + '\n')
  const bad = summary.filter((s) => s.unexplained !== 0)
  const dropped = input.report.dropped.length + input.excluded.length
  console.log(
    `稽核：raw ${summary.reduce((a, s) => a + s.raw, 0)} 筆 → 輸出 ${summary.reduce((a, s) => a + s.output, 0)} 筆，` +
      `丟棄 ${dropped}（白名單外 ${input.report.dropped.filter((d) => d.reason === 'not-whitelisted').length}），` +
      `未說明 ${bad.length ? bad.map((s) => `${s.kind} ${s.unexplained}`).join('、') : 0}；詳見 docs/data-audit.md`,
  )
  return summary
}
