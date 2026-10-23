// 以 file:// 開啟 dist/index.html 做自動驗收（等同使用者雙擊 index.html）。
// 檢查：console error、未處理的例外／promise rejection、資源載入失敗、
// 任何非 file:// 的網路請求（執行期不得連網），以及畫面上的關鍵文字。
// 有任何問題就以非零結束碼退出。
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import ExcelJS from 'exceljs'
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
    const mi = 'background|侍僧|XPHB:feat>feat|魔法学徒；牧师|XPHB:spells'
    await chip(`${mi}:ability`, 'wis')
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

    // 法術：魔法學徒（牧師）與法師的戲法、法術書、準備法術
    await page.click('[data-step="spells"]')
    const W = 'class|法师|XPHB'
    for (const n of ['光亮术', '法师之手', '冷冻射线']) await chip(`${W}:cantrips`, `spell|${n}|XPHB`)
    for (const n of ['侦测魔法', '法师护甲', '魔法飞弹', '睡眠术', '雷鸣波', '护盾术']) await chip(`${W}:spellbook`, `spell|${n}|XPHB`)
    for (const n of ['法师护甲', '魔法飞弹', '睡眠术', '雷鸣波']) await chip(`${W}:prepared`, `spell|${n}|XPHB`)
    await chip(`${mi}:0`, 'spell|神导术|XPHB')
    await chip(`${mi}:0`, 'spell|修复术|XPHB')
    await chip(`${mi}:1`, 'spell|光导箭|XPHB')
    const dc = await page.getByTestId('spell-dc').first().innerText()
    if (dc.trim() !== '13') problems.push(`法術：1 級法術 DC 應為 13，畫面為 ${dc}`)
    if (!(await page.locator('[data-spell="雷鸣波"] [data-col="hit"]').first().innerText()).includes('13'))
      problems.push('法術：雷鳴波應顯示體質 DC 13')
    // 裝備：法師 A、侍僧 A，套用後重量 49、AC 11、匕首 +5（1 級）
    await page.click('[data-step="equipment"]')
    await chip('class|法师|XPHB:equip:0', 'A')
    await chip('background|侍僧|XPHB:equip:0', 'A')
    await page.getByTestId('apply-equipment').click()
    const carried = await page.getByTestId('carried').innerText()
    if (carried.trim() !== '49') problems.push(`裝備：重量應為 49，畫面為 ${carried}`)
    const ac = await page.getByTestId('ac').innerText()
    if (ac.trim() !== '11') problems.push(`裝備：AC 應為 11，畫面為 ${ac}`)
    const dagger = await page.locator('[data-attack="匕首"] [data-col="hit"]').first().innerText()
    if (dagger.trim() !== '+3') problems.push(`攻擊：1 級匕首應為 +3，畫面為 ${dagger}`)

    await page.click('[data-step="confirm"]')
    await page.getByTestId('char-name').fill('基準侏儒法師')

    const hp = await page.getByTestId('hp-max').innerText()
    if (hp.trim() !== '8') problems.push(`建角：1 級 HP 應為 8，畫面為 ${hp}`)
    try {
      await page.getByText('所有選擇都已完成').waitFor({ timeout: 3000 })
    } catch {
      const left = await page.getByTestId('choice-slot').allInnerTexts()
      problems.push(`建角：還有未完成的選擇：${left.map((t) => t.split('\n')[0]).join('；')}`)
    }

    // 升到 20 級（基準角色，同 DDB 參考畫面）、選塑能師
    await page.click('[data-step="levels"]')
    await page.getByTestId('level-target').fill('20')
    await page.getByTestId('level-to').click()
    await page.locator('[data-level="3"] .lv-head').click()
    await chip('class|法师|XPHB:subclass', 'subclass|塑能师|XPHB|法师|XPHB')
    const slots = await page.getByTestId('spell-slots').innerText()
    if (!slots.includes('9環×1')) problems.push(`升級：20 級法師應有 9 環法術位，畫面為 ${slots}`)
    await page.click('[data-step="confirm"]')
    const hp20 = await page.getByTestId('hp-max').innerText()
    if (hp20.trim() !== '122') problems.push(`升級：20 級 HP 應為 122，畫面為 ${hp20}`)

    await sheetSmoke(page, problems)
  } catch (err) {
    problems.push(`建角流程失敗：${err instanceof Error ? err.message.split('\n')[0] : err}`)
  }
}

/**
 * 角卡 smoke test（M2 完成標準）：20 級基準角色的主要數值、手動覆寫標示、效果連結，
 * 以及 JSON 匯出再匯入後角卡完全相同。
 * @param {import('playwright').Page} page
 * @param {string[]} problems
 */
async function sheetSmoke(page, problems) {
  try {
    await page.click('[data-view="sheet"]')
    const text = async (id) => (await page.getByTestId(id).first().innerText()).replace(/\s+/g, ' ').trim()
    // DDB 參考畫面（20 級）：法術 DC 17
    const expect = { 'sheet-ac': '11', 'sheet-hp': '122', 'sheet-pb': '+6', 'sheet-init': '+1', 'sheet-pp': '12', 'sheet-dc': 'DC 17' }
    for (const [id, want] of Object.entries(expect)) {
      const got = await text(id)
      if (!got.startsWith(want)) problems.push(`角卡：${id} 應為 ${want}，畫面為 ${got}`)
    }
    // 動作分頁：DDB 的匕首 +7、長棍 +5、冷凍射線 +9、光導箭 +8
    for (const [name, want] of [['匕首', '+7'], ['长棍', '+5'], ['冷冻射线', '+9'], ['光导箭', '+8']]) {
      const got = (await page.locator(`[data-attack="${name}"] [data-col="hit"]`).first().innerText()).trim()
      if (got !== want) problems.push(`角卡動作：${name} 應為 ${want}，畫面為 ${got}`)
    }
    // 手動覆寫 AC → 顯示「已覆寫」，清空後恢復
    const ac = page.locator('[data-override="ac"]')
    await ac.locator('button.edit').click()
    await ac.locator('input').fill('15')
    await ac.locator('input').press('Enter')
    if (!(await ac.innerText()).includes('已覆寫')) problems.push('角卡：覆寫 AC 後沒有顯示「已覆寫」')
    await ac.locator('button.edit').click()
    await ac.locator('input').fill('')
    await ac.locator('input').press('Enter')
    // 智力豁免旁的效果圖示 → 效果頁出現侏儒狡黠
    await page.locator('[data-save="int"] [data-effect="save:int"]').click()
    await page.getByTestId('effects').getByText('侏儒狡黠').first().waitFor({ timeout: 3000 })

    // 匯出 → 匯入（覆蓋同一角色）→ 角卡與匯出檔都完全相同
    const snapshot = async () => (await page.getByTestId('sheet').innerText()).replace(/\s+/g, ' ')
    const before = await snapshot()
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export').click()])
    const path = await download.path()
    const exported = readFileSync(path, 'utf8')
    page.once('dialog', (d) => d.accept())
    await page.getByTestId('import-file').setInputFiles(path)
    await page.getByTestId('bar-message').getByText('已匯入').waitFor({ timeout: 3000 })
    const [download2] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export').click()])
    const exported2 = readFileSync(await download2.path(), 'utf8')
    if (exported2 !== exported) problems.push('匯出再匯入後，再次匯出的 JSON 不同')
    if ((await snapshot()) !== before) problems.push('匯出再匯入後，角卡畫面不同')

    // M3：匯出試算表 → 首次顯示說明（勾「不再顯示」）→ 下載 xlsx → 用 ExcelJS 讀回檢查
    await page.getByTestId('export-xlsx').click()
    await page.getByTestId('export-help').waitFor({ timeout: 3000 })
    await page.getByTestId('export-help-hide').check()
    const [xlsx] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-confirm').click()])
    const name = xlsx.suggestedFilename()
    if (!/^基準侏儒法師_Lv20_\d{4}-\d{2}-\d{2}\.xlsx$/.test(name)) problems.push(`xlsx 檔名不符：${name}`)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(readFileSync(await xlsx.path()))
    const sheets = wb.worksheets.map((w) => w.name).join(',')
    if (sheets !== '摘要,動作,法術,物品,特性與特質,效果,背景,關於') problems.push(`xlsx 工作表不符：${sheets}`)
    let dc = ''
    wb.getWorksheet('摘要')?.eachRow((r) => {
      if (String(r.getCell(2).value).includes('法術豁免 DC')) dc = String(r.getCell(3).value)
    })
    if (dc !== '17') problems.push(`xlsx 法術 DC 應為 17，實際 ${dc}`)
    // 第二次按：不再顯示說明，直接下載
    const [again] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-xlsx').click()])
    if (!again.suggestedFilename().endsWith('.xlsx')) problems.push('第二次匯出 xlsx 沒有直接下載')
    if (await page.getByTestId('export-error').count()) problems.push(`xlsx 匯出錯誤：${await page.getByTestId('export-error').innerText()}`)
  } catch (err) {
    problems.push(`角卡流程失敗：${err instanceof Error ? err.message.split('\n')[0] : err}`)
  }
}

if (problems.length) {
  console.error(`check:file 失敗（${url}）：`)
  for (const p of problems) console.error(`  - ${p}`)
  process.exit(1)
}
console.log(`check:file 通過：${url}，0 errors`)
