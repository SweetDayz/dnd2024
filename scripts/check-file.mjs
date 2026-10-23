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
  await builderSmoke(page, problems)
  await interactionSmoke(page, problems)
  // 讓延遲載入的資料檔有機會報錯
  await page.waitForTimeout(300)
} finally {
  await browser.close()
}

/**
 * 互動 smoke test：各分頁有資料、hover tooltip 有內容、關掉一本書條目數會變。
 * @param {import('playwright').Page} page
 * @param {string[]} problems
 */
async function interactionSmoke(page, problems) {
  const count = async () => {
    const t = await page.getByTestId('count').innerText()
    return Number(/共\s*(\d+)\s*項/.exec(t)?.[1] ?? NaN)
  }
  const waitCount = () => page.getByTestId('count').getByText('目前書目下共').waitFor({ timeout: 10000 })
  try {
    await page.click('[data-view="browser"]')
    for (const tab of ['race', 'background', 'class', 'feat', 'spell', 'item', 'optionalfeature']) {
      await page.click(`[data-tab="${tab}"]`)
      await waitCount()
      const n = await count()
      if (!(n > 0)) problems.push(`分頁 ${tab} 沒有條目`)
      // 每列都要有來源徽章
      const rows = await page.getByTestId('entry-row').count()
      const badges = await page.locator('[data-testid="entry-row"] > .head [data-testid="source-badge"]').count()
      if (rows !== badges) problems.push(`分頁 ${tab}：${rows} 列只有 ${badges} 個來源徽章`)
    }

    // 展開法師，hover 第一個連結要出現 tooltip 摘要
    await page.click('[data-tab="class"]')
    await page.getByTestId('search').fill('Wizard')
    await page.getByTestId('entry-row').first().locator('.head').click()
    await page.locator('.detail .link').first().hover()
    const tip = page.getByRole('tooltip')
    await tip.waitFor({ timeout: 5000 })
    await page.waitForFunction(() => !document.querySelector('[role=tooltip]')?.textContent?.includes('載入中'), null, {
      timeout: 5000,
    })
    if (!(await tip.locator('[data-testid="source-badge"]').count())) problems.push('tooltip 沒有顯示條目與來源')
    await page.getByTestId('search').fill('')

    // 關掉 XPHB：種族數量要改變；舊版預設隱藏
    await page.click('[data-tab="race"]')
    await waitCount()
    const before = await count()
    if (await page.getByTestId('superseded').count()) problems.push('預設不應出現「已有 2024 版」的舊版條目')
    await page.locator('[data-testid="per-book"] summary').click()
    await page.locator('input[data-source="XPHB"]').uncheck()
    const after = await count()
    if (after === before) problems.push('關閉 XPHB 後種族數量沒有變化')
    await page.locator('input[data-source="XPHB"]').check()
  } catch (err) {
    problems.push(`互動測試失敗：${err instanceof Error ? err.message.split('\n')[0] : err}`)
  }
}

/**
 * 建角精靈 smoke test：用介面從零建立 1 級基準角色（岩地侏儒、侍僧、法師），檢查 HP 與「全部選完」。
 * @param {import('playwright').Page} page
 * @param {string[]} problems
 */
async function builderSmoke(page, problems) {
  const slot = (key) => page.locator(`[data-slot="${key}"]`)
  const pickEntry = async (step, search, id) => {
    await page.click(`[data-step="${step}"]`)
    await page.getByTestId('picker-search').fill(search)
    await page.click(`[data-id="${id}"]`)
  }
  const chip = (key, value) => slot(key).locator(`[data-value="${value}"]`).first().click()
  try {
    await pickEntry('class', 'Wizard', 'class|法师|XPHB')
    await chip('class|法师|XPHB:skill:0', 'arcana')
    await chip('class|法师|XPHB:skill:0', 'investigation')

    await pickEntry('background', 'Acolyte', 'background|侍僧|XPHB')
    await pickEntry('race', 'Gnome', 'race|侏儒|XPHB')
    await chip('race|侏儒|XPHB:version', 'race|侏儒；岩侏儒血系|XPHB')
    await chip('race|侏儒|XPHB:spells:ability', 'int')

    await page.click('[data-step="abilities"]')
    const scores = { str: '8', dex: '12', con: '14', int: '15', wis: '13', cha: '10' }
    for (const [a, v] of Object.entries(scores)) await page.locator(`tr[data-ability="${a}"] select`).selectOption(v)
    await chip('background|侍僧|XPHB:ability:alt', '0')
    const weighted = slot('background|侍僧|XPHB:ability:w').locator('select')
    await weighted.nth(0).selectOption('wis')
    await weighted.nth(1).selectOption('int')

    await page.click('[data-step="languages"]')
    await chip('base:languages', 'dwarvish')
    await chip('base:languages', 'gnomish')

    // 魔法學徒（牧師）的法術：在確認頁的「尚未完成」清單裡選
    await page.click('[data-step="confirm"]')
    const mi = 'background|侍僧|XPHB:feat>feat|魔法学徒；牧师|XPHB:spells'
    await chip(`${mi}:ability`, 'wis')
    await chip(`${mi}:0`, 'spell|神导术|XPHB')
    await chip(`${mi}:0`, 'spell|修复术|XPHB')
    await chip(`${mi}:1`, 'spell|光导箭|XPHB')
    await page.getByTestId('char-name').fill('基準侏儒法師')

    const hp = await page.getByTestId('hp-max').innerText()
    if (hp.trim() !== '8') problems.push(`建角：1 級 HP 應為 8，畫面為 ${hp}`)
    try {
      await page.getByText('所有選擇都已完成').waitFor({ timeout: 3000 })
    } catch {
      const left = await page.getByTestId('choice-slot').allInnerTexts()
      problems.push(`建角：還有未完成的選擇：${left.map((t) => t.split('\n')[0]).join('；')}`)
    }
  } catch (err) {
    problems.push(`建角流程失敗：${err instanceof Error ? err.message.split('\n')[0] : err}`)
  }
}

if (problems.length) {
  console.error(`check:file 失敗（${url}）：`)
  for (const p of problems) console.error(`  - ${p}`)
  process.exit(1)
}
console.log(`check:file 通過：${url}，0 errors`)
