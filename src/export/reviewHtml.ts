/**
 * 審卡報告 → 單一自足的 HTML 字串（M6-1、M6-3）。
 *
 * - 純字串模板，不需要 DOM，Vitest 可以直接測。
 * - 所有文字都經過 esc()（HTML escape）；`{@tag}` 已在 review.ts 轉成純文字。
 * - CSS 全部 inline、沒有可執行的 JS、不連網；字型只用系統字型。
 * - 角色存檔以 `<script type="application/json">` 嵌入：瀏覽器不會執行這種 script，
 *   網站的「匯入」讀到 HTML 檔時會從這裡取出存檔（見 rules/character.ts importCharacter）。
 */
import { EMBED_ID } from '@/rules/character'
import type { Badge, Item, ReviewModel, RollLine } from './review'

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (ch) => ESC[ch]!)
}

const badge = (b?: Badge) => (b ? ` <span class="src" title="${esc(b.title)}">${esc(b.text)}</span>` : '')

const item = (i: Item) => `${esc(i.text)}${badge(i.src)}${i.note ? ` <span class="note">${esc(i.note)}</span>` : ''}`

const list = (items: Item[], empty = '無') =>
  items.length ? `<ul class="items">${items.map((i) => `<li>${item(i)}</li>`).join('')}</ul>` : `<span class="muted">${empty}</span>`

/** 表格：thead 在列印時每頁重複 */
function table(headers: string[], rows: string[][], cls = ''): string {
  if (!rows.length) return '<p class="muted">無</p>'
  return `<table${cls ? ` class="${cls}"` : ''}><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`)
    .join('')}</tbody></table>`
}

function rolls(lines: RollLine[], title: string): string {
  if (!lines.length) return ''
  const rerolls = lines.length - lines.filter((l) => l.used).length
  return `<h3>${esc(title)}（共 ${lines.length} 次，重骰 ${rerolls} 次）</h3>${table(
    ['項目', '骰面', '結果', '時間', '採用'],
    lines.map((l) => [esc(l.label), esc(l.dice), esc(l.total), esc(l.at.replace('T', ' ').slice(0, 19)), l.used ? '✔ 採用' : '<span class="muted">重骰前</span>']),
    'rolls',
  )}`
}

const section = (id: string, n: number, title: string, body: string) =>
  `<section id="${id}"><h2><span class="num">${n}</span>${esc(title)}</h2>${body}</section>`

/** 段落標題（測試與目錄共用） */
export const SECTION_TITLES = [
  '警示區',
  '摘要',
  '書目與設定',
  '屬性值明細',
  '逐級選擇表',
  '熟練、專精與語言',
  '法術',
  '裝備與起始金額',
  '效果清單',
] as const

export function renderReviewHtml(m: ReviewModel): string {
  const T = SECTION_TITLES
  const kinds = [...new Set(m.warnings.map((w) => w.kind))]
  const warnBody = m.warnings.length
    ? kinds
        .map((k) => {
          const ws = m.warnings.filter((w) => w.kind === k)
          return `<h3>${esc(k)}（${ws.length}）</h3><ul class="items warn">${ws.map((w) => `<li>${esc(w.text)}${badge(w.src)}</li>`).join('')}</ul>`
        })
        .join('')
    : '<p class="ok">無</p>'

  const kv = (rows: [string, string][]) => `<table class="kv"><tbody>${rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</tbody></table>`

  const books = table(
    ['縮寫', '代碼', '書名', '英文書名'],
    m.books.map((b) => [`<span class="src">${esc(b.abbr)}</span>`, esc(b.code), esc(b.name), esc(b.engName)]),
  )

  const ab = m.abilities
  const abilityBody = `<p>產生方式：<strong>${esc(ab.method)}</strong>${ab.pool ? `　擲出的六個值：${esc(ab.pool)}` : ''}</p>${rolls(ab.rolls, '屬性擲骰紀錄')}${table(
    ['屬性', '基礎值', '加值與來源', '最終值', '調整值', '備註'],
    ab.rows.map((r) => [esc(r.name), esc(r.base), list(r.bonuses, '—'), `<strong>${esc(r.score)}</strong>`, esc(r.mod), esc(r.note)]),
  )}${ab.notes.length ? `<ul class="items warn">${ab.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}`

  const levelBody = table(
    ['等級', '職業', '獲得的特性', '做的選擇', 'HP'],
    m.levels.map((l) => [
      `<strong>${l.level}</strong>`,
      esc(l.className),
      list(l.features, '—'),
      l.choices.length
        ? `<ul class="items">${l.choices
            .map((c) => `<li${c.done ? '' : ' class="pending"'}><span class="label">${esc(c.label)}</span>：${c.values.length ? c.values.map(item).join('、') : '<strong class="bad">未選擇</strong>'}</li>`)
            .join('')}</ul>`
        : '<span class="muted">—</span>',
      `${esc(l.hp)}${l.hpRolls.length ? `<div class="note">擲骰 ${l.hpRolls.length} 次：${l.hpRolls.map((r) => `${esc(r.total)}${r.used ? '（採用）' : ''}`).join('、')}</div>` : ''}`,
    ]),
    'levels',
  )

  const profBody = table(
    ['類別', '項目（來源）'],
    m.profs.map((p) => [esc(p.category), list(p.items)]),
  )

  const spellBody = m.spells.length
    ? m.spells
        .map(
          (g) =>
            `<h3>${esc(g.label)}<span class="stat">施法屬性 ${esc(g.ability)}・DC ${esc(g.dc)}・攻擊 ${esc(g.attack)}</span></h3>${table(
              ['環位', '法術', '來源', '備註'],
              g.rows.map((r) => [esc(r.level), esc(r.name), badge(r.src), esc(r.note)]),
            )}`,
        )
        .join('')
    : '<p class="muted">無</p>'

  const eq = m.equipment
  const equipBody = `<h3>起始裝備的選擇</h3>${list(eq.picks)}${rolls(eq.goldRolls, '起始金額擲骰紀錄')}<h3>物品</h3>${list(eq.items)}<p>貨幣：${esc(eq.currency)}</p>`

  const effectBody = table(
    ['效果', '段落', '取自', '可能影響'],
    m.effects.map((e) => [`<strong>${esc(e.title)}</strong>${badge(e.src)}`, esc(e.text), esc(e.origin), esc(e.fields)]),
    'effects',
  )

  const toc = T.map((t, i) => `<a href="#s${i + 1}">${i + 1}. ${esc(t)}${i === 0 && m.warnings.length ? `（${m.warnings.length}）` : ''}</a>`).join('')

  const body = [
    section('s1', 1, T[0], warnBody),
    section('s2', 2, T[1], kv(m.summary)),
    section('s3', 3, T[2], `<h3>啟用的書目（${m.books.length}）</h3>${books}<h3>設定與版本</h3>${kv(m.settings)}`),
    section('s4', 4, T[3], abilityBody),
    section('s5', 5, T[4], levelBody),
    section('s6', 6, T[5], profBody),
    section('s7', 7, T[6], spellBody),
    section('s8', 8, T[7], equipBody),
    section('s9', 9, T[8], effectBody),
  ].join('\n')

  return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="D&amp;D 2024 中文角色建立器">
<title>${esc(m.title)}</title>
<style>${CSS}</style>
</head>
<body>
<header>
<h1>${esc(m.name)}<small>審卡報告</small></h1>
<p class="meta">匯出時間 ${esc(m.exportedAt)}・本報告是匯出當下的快照，修改角色後要重新匯出。</p>
<nav>${toc}</nav>
</header>
<main>
${body}
</main>
<script type="application/json" id="${EMBED_ID}">${m.characterJson.replace(/</g, '\\u003c')}</script>
</body>
</html>
`
}

/** 螢幕：深色（與網站一致）；列印：白底黑字、A4 直式 */
const CSS = `
:root{--bg:#16181d;--panel:#1f232b;--line:#343a46;--text:#e6e8ec;--muted:#9aa3b2;--accent:#d9a441;--warn:#f0b45a;--bad:#ff7b72;--ok:#7ee0a1;--src-bg:#2b3240;--src:#b8c7e0}
*{box-sizing:border-box}
html{background:var(--bg)}
body{margin:0 auto;max-width:1100px;padding:24px 16px 48px;background:var(--bg);color:var(--text);font:14px/1.6 "Microsoft JhengHei","PingFang TC","Noto Sans TC","Noto Sans CJK TC","Heiti TC",system-ui,sans-serif}
h1{margin:0 0 4px;font-size:26px}
h1 small{margin-left:12px;font-size:15px;color:var(--muted);font-weight:normal}
h2{margin:32px 0 12px;padding-bottom:6px;border-bottom:2px solid var(--accent);font-size:19px;break-after:avoid}
h2 .num{display:inline-block;min-width:1.6em;color:var(--accent)}
h3{margin:18px 0 8px;font-size:15px;color:var(--accent);break-after:avoid}
h3 .stat{margin-left:12px;color:var(--text);font-weight:normal;font-size:13px}
.meta{margin:0 0 12px;color:var(--muted)}
nav{display:flex;flex-wrap:wrap;gap:6px 14px;padding:10px 12px;background:var(--panel);border:1px solid var(--line);border-radius:8px}
nav a{color:var(--src);text-decoration:none}
table{width:100%;border-collapse:collapse;margin:6px 0 10px;background:var(--panel)}
th,td{padding:6px 8px;border:1px solid var(--line);text-align:left;vertical-align:top}
thead th{background:#262b35;white-space:nowrap}
thead{display:table-header-group}
tr{break-inside:avoid}
table.kv th{width:200px;background:#262b35;font-weight:normal;color:var(--muted)}
td:first-child{white-space:nowrap}
table.effects td:nth-child(2){white-space:pre-line}
table.levels td:nth-child(2),table.levels td:last-child{white-space:nowrap}
ul.items{margin:0;padding-left:18px}
ul.items li{margin:2px 0}
ul.warn li{color:var(--warn)}
li.pending .label{color:var(--warn)}
.src{display:inline-block;padding:0 6px;border-radius:4px;background:var(--src-bg);color:var(--src);font-size:12px;white-space:nowrap}
.note{color:var(--muted);font-size:12px}
.muted{color:var(--muted)}
.bad{color:var(--bad)}
.ok{color:var(--ok);font-weight:bold}
section#s1{padding:4px 16px 12px;border:2px solid var(--warn);border-radius:8px}
section#s1 h2{border-bottom-color:var(--warn)}
@page{size:A4 portrait;margin:12mm}
@media print{
:root{--bg:#fff;--panel:#fff;--line:#999;--text:#000;--muted:#444;--accent:#000;--warn:#000;--bad:#000;--ok:#000;--src-bg:#fff;--src:#000}
html,body{background:#fff;color:#000}
body{max-width:none;padding:0;font-size:10.5pt}
nav{display:none}
thead th,table.kv th{background:#eee;color:#000}
.src{border:1px solid #777;padding:0 3px}
section{break-before:auto}
section#s1{border:2px solid #000}
a{color:#000}
}
`
