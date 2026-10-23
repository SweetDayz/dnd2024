// 以 file:// 開啟 dist/index.html 做自動驗收（等同使用者雙擊 index.html）。
// 檢查：console error、未處理的例外／promise rejection、資源載入失敗、
// 任何非 file:// 的網路請求（執行期不得連網），以及畫面上的關鍵文字。
// 有任何問題就以非零結束碼退出。
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

const indexPath = resolve('dist/index.html')
if (!existsSync(indexPath)) {
  console.error('找不到 dist/index.html，請先執行 npm run build')
  process.exit(1)
}
const url = pathToFileURL(indexPath).href

/** 頁面上必須出現的文字（smoke check）。 */
const EXPECTED_TEXT = ['D&D 2024 角色建立器', '套用「官方」', '目前：官方']

const problems = []
const browser = await chromium.launch()
try {
  const page = await browser.newPage()

  page.on('console', (msg) => {
    if (msg.type() === 'error') problems.push(`console error: ${msg.text()}`)
  })
  // 未捕捉的例外與未處理的 promise rejection 都會走 pageerror。
  page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`))
  page.on('requestfailed', (req) =>
    problems.push(`request failed: ${req.url()} (${req.failure()?.errorText})`),
  )
  page.on('request', (req) => {
    const u = req.url()
    if (!u.startsWith('file://') && !u.startsWith('data:') && !u.startsWith('blob:')) {
      problems.push(`執行期網路請求: ${u}`)
    }
  })

  await page.goto(url, { waitUntil: 'load' })
  for (const text of EXPECTED_TEXT) {
    try {
      await page.getByText(text).first().waitFor({ timeout: 5000 })
    } catch {
      problems.push(`畫面上找不到「${text}」`)
    }
  }
  // 讓延遲載入的資料檔有機會報錯
  await page.waitForTimeout(300)
} finally {
  await browser.close()
}

if (problems.length) {
  console.error(`check:file 失敗（${url}）：`)
  for (const p of problems) console.error(`  - ${p}`)
  process.exit(1)
}
console.log(`check:file 通過：${url}，0 errors`)
