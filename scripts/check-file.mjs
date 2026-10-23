// 以 file:// 開啟 dist/index.html 做自動驗收（等同使用者雙擊 index.html）。
// 檢查：console error、未處理的例外／promise rejection、資源載入失敗、
// 任何非 file:// 的網路請求（執行期不得連網），以及畫面上的關鍵文字。
// 有任何問題就以非零結束碼退出。
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
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
  await creditsSmoke(page, problems)
  await builderSmoke(page, problems)
  await interactionSmoke(page, problems)
  // 讓延遲載入的資料檔有機會報錯
  await page.waitForTimeout(300)
} finally {
  await browser.close()
}

/**
 * M7-1：首頁底部有授權頁尾；點「致謝」後有授權文字、使用者的話與上游 commit hash。
 * @param {import('playwright').Page} page
 * @param {string[]} problems
 */
async function creditsSmoke(page, problems) {
  try {
    const foot = await page.getByTestId('license-footer').innerText()
    if (!foot.includes('中文在地化資料 CC BY-NC-SA 4.0') || !foot.includes('致謝')) problems.push(`首頁底部沒有授權頁尾：${foot}`)
    const commit = readFileSync(resolve('raw/VERSION'), 'utf8').split(/\r?\n/)[2]
    await page.getByTestId('credits-link').click()
    await page.getByTestId('upstream-commit').getByText(commit).waitFor({ timeout: 5000 })
    const text = await page.getByTestId('credits').innerText()
    for (const t of ['CC BY-NC-SA 4.0', '人類魔寵', 'MIT License']) if (!text.includes(t)) problems.push(`致謝頁沒有「${t}」`)
    await page.click('[data-view="builder"]')
  } catch (err) {
    problems.push(`致謝頁檢查失敗：${err instanceof Error ? err.message.split('\n')[0] : err}`)
  }
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
    for (const tab of ['race', 'background', 'class', 'feat', 'spell', 'item', 'optionalfeature', 'language']) {
      await page.click(`[data-tab="${tab}"]`)
      await waitCount()
      const n = await count()
      if (!(n > 0)) problems.push(`分頁 ${tab} 沒有條目`)
      // 每列都要有來源徽章
      const rows = await page.getByTestId('entry-row').count()
      const badges = await page.locator('[data-testid="entry-row"] > .head [data-testid="source-badge"]').count()
      if (rows !== badges) problems.push(`分頁 ${tab}：${rows} 列只有 ${badges} 個來源徽章`)
    }

    // M4-1：徽章顯示縮寫（PHB24），搜尋縮寫或原始代碼結果相同
    await page.click('[data-tab="race"]')
    await waitCount()
    const texts = await page.locator('[data-testid="source-badge"]').allInnerTexts()
    if (texts.some((t) => /^(XPHB|XDMG|XMM) /.test(t))) problems.push('徽章仍顯示原始代碼 XPHB（應為 PHB24）')
    if (!texts.some((t) => t.startsWith('PHB24 p.'))) problems.push('徽章沒有出現 PHB24 縮寫')
    await page.getByTestId('search').fill('PHB24')
    const byAbbr = await page.getByTestId('count').innerText()
    await page.getByTestId('search').fill('xphb')
    const byCode = await page.getByTestId('count').innerText()
    if (byAbbr !== byCode || !/符合條件 [1-9]/.test(byAbbr)) problems.push(`搜尋 PHB24 與 XPHB 結果不同：${byAbbr}／${byCode}`)
    await page.getByTestId('search').fill('')

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
    if (await page.getByTestId('superseded').count()) problems.push('預設不應出現「已有新版」的舊版條目')
    // M4-2：「已隱藏 N 個重印舊版」可在這個選單暫時顯示
    const hint = page.getByTestId('legacy-hint')
    if (!(await hint.count())) problems.push('種族分頁沒有「已隱藏 N 個重印舊版」提示')
    else {
      const n = Number(/已隱藏 (\d+)/.exec(await hint.innerText())?.[1] ?? NaN)
      await hint.click()
      if ((await count()) !== before + n) problems.push(`暫時顯示舊版後數量應為 ${before}+${n}`)
      if (!(await page.getByTestId('superseded').first().innerText()).startsWith('已有新版：')) problems.push('舊版沒有「已有新版：…」徽章')
      await hint.click()
      if ((await count()) !== before) problems.push('再次點擊提示後應恢復隱藏')
    }
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
    // M4-4：屬性總覽顯示「尚有 +3 未分配」，選了之後顯示差值與明細
    const ov = page.getByTestId('ability-overview')
    if (!(await ov.getByTestId('ability-pending').first().innerText()).includes('+3')) problems.push('屬性總覽沒有顯示「尚有 +3 未分配」')
    const weighted = slot('background|侍僧|XPHB:ability:w').locator('select')
    if (!(await weighted.nth(0).locator('option[value="wis"]').innerText()).includes('13→15')) problems.push('背景 +2 的選項沒有預覽 13→15')
    await weighted.nth(0).selectOption('wis')
    if ((await ov.locator('[data-ability="wis"] [data-testid="ability-delta"]').innerText()).trim() !== '+2') problems.push('屬性總覽沒有顯示感知 +2 的變動')
    await weighted.nth(1).selectOption('int')
    const wisTip = await ov.locator('li[data-ability="wis"]').getAttribute('title')
    if (!wisTip?.startsWith('13（標準陣列）＋2 背景：侍僧 = 15')) problems.push(`屬性總覽明細不對：${wisTip}`)
    if (await ov.getByTestId('ability-pending').count()) problems.push('分配完後仍顯示未分配')

    await page.click('[data-step="languages"]')
    if ((await ov.locator('li[data-ability="int"] .score').innerText()).trim() !== '16') problems.push('其他步驟也要看得到屬性總覽（智力 16）')
    // M4-5：語言預設只列標準語言；打開「顯示稀有與其他語言」才出現德魯伊語等
    if (await slot('base:languages').locator('[data-value="draconic"]').count() === 0) problems.push('語言：標準語言（龍語）沒有列出')
    if (await slot('base:languages').locator('[data-value="abyssal"]').count()) problems.push('語言：稀有語言（深淵語）預設不應列出')
    await slot('base:languages').getByTestId('show-restricted').locator('input').check()
    if (!(await slot('base:languages').locator('[data-value="abyssal"]').count())) problems.push('語言：打開開關後應列出稀有語言')
    await slot('base:languages').getByTestId('show-restricted').locator('input').uncheck()
    await chip('base:languages', 'dwarvish')
    await chip('base:languages', 'gnomish')

    // 法術：魔法學徒（牧師）與法師的戲法、法術書、準備法術
    // M5：法術選擇是分頁＋表格（SpellPicker），每個選擇欄位一個分頁
    await page.click('[data-step="spells"]')
    const W = 'class|法师|XPHB'
    const spellPick = async (key, id) => {
      await page.click(`[data-tab="${key}"]`)
      await page.locator(`[data-testid="spell-pick-table"][data-slot="${key}"] input[data-value="${id}"]`).click()
    }
    for (const n of ['光亮术', '法师之手', '冷冻射线']) await spellPick(`${W}:cantrips`, `spell|${n}|XPHB`)
    if (!(await page.getByTestId('spell-full').count())) problems.push('法術：戲法選滿後應顯示「已選滿」')
    if (!(await page.locator(`[data-slot="${W}:cantrips"] input[data-value="spell|火焰箭|XPHB"]`).isDisabled()))
      problems.push('法術：選滿後其他列的勾選框應停用')
    // 篩選：法術書分頁打開篩選面板，只看儀式法術
    await page.click(`[data-tab="${W}:spellbook"]`)
    const total = Number((await page.getByTestId('spell-count').innerText()).replace(/\D/g, ''))
    await page.getByTestId('spell-filter-toggle').click()
    await page.locator('[data-group="misc"] [data-tag="ritual"]').click()
    const rituals = Number((await page.getByTestId('spell-count').innerText()).replace(/\D/g, ''))
    if (!(rituals > 0 && rituals < total)) problems.push(`法術：篩選儀式後數量應變少（${total} → ${rituals}）`)
    await page.getByTestId('spell-reset').click()
    // 顯示不符合的法術（反灰）：1 級法術書看得到 2 環以上但不能勾
    await page.getByTestId('spell-show-blocked').check()
    if (!(await page.locator(`[data-slot="${W}:spellbook"] input[data-value="spell|火球术|XPHB"]`).isDisabled()))
      problems.push('法術：環階太高的火球術應反灰且不能勾選')
    await page.getByTestId('spell-show-blocked').uncheck()
    for (const n of ['侦测魔法', '法师护甲', '魔法飞弹', '睡眠术', '雷鸣波', '护盾术']) await spellPick(`${W}:spellbook`, `spell|${n}|XPHB`)
    for (const n of ['法师护甲', '魔法飞弹', '睡眠术', '雷鸣波']) await spellPick(`${W}:prepared`, `spell|${n}|XPHB`)
    await spellPick(`${mi}:0`, 'spell|神导术|XPHB')
    await spellPick(`${mi}:0`, 'spell|修复术|XPHB')
    await spellPick(`${mi}:1`, 'spell|光导箭|XPHB')
    // 右側已學會的法術：依來源分組顯示 DC；點擊會在左側定位並顯示詳情
    const known = page.getByTestId('known-spells')
    if (!(await known.innerText()).includes('DC 13')) problems.push('法術：右側應顯示法師的 DC 13')
    await known.locator('[data-spell="光导箭"]').click()
    if ((await page.getByTestId('spell-detail').getAttribute('data-spell-id')) !== 'spell|光导箭|XPHB') problems.push('法術：點右側法術應顯示詳情')
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
    const kiwee = await page.getByTestId('kiwee-note').locator('a').getAttribute('href')
    if (kiwee !== 'https://5e.kiwee.top/index.html') problems.push(`確認步驟沒有 kiwee 網址連結：${kiwee}`)

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
    // M4-6：技能排序三種模式、熟練標籤與圖例、加值明細、效果圖示 tooltip
    const firstSkill = () => page.locator('[data-skill]').first().getAttribute('data-skill')
    if ((await firstSkill()) !== 'acrobatics') problems.push('技能預設（Roll20）應從特技 Acrobatics 開始')
    await page.getByTestId('skill-sort').selectOption('fvtt')
    if ((await firstSkill()) !== 'sleight of hand') problems.push('技能 FVTT 排序應從巧手開始')
    await page.getByTestId('skill-sort').selectOption('ability')
    if ((await page.locator('[data-skill-group]').count()) !== 5) problems.push('技能依屬性分組應有 5 組（體質沒有技能）')
    await page.getByTestId('skill-sort').selectOption('roll20')
    if (!(await page.locator('[data-skill="arcana"] [data-prof]').innerText()).includes('熟練')) problems.push('奧秘應標示「熟練」')
    if (!(await page.getByTestId('prof-legend').innerText()).includes('專精')) problems.push('技能區沒有常駐圖例')
    const arcanaTip = await page.locator('[data-skill="arcana"] [data-testid="skill-detail"]').getAttribute('title')
    if (!arcanaTip?.startsWith('智力 +3 ＋熟練 ×1（+6；熟練：職業：法师')) problems.push(`奧秘加值明細不對：${arcanaTip}`)
    const markTip = await page.locator('[data-save="int"] [data-effect="save:int"]').getAttribute('title')
    if (!markTip?.startsWith('有 ')) problems.push(`效果圖示 tooltip 不對：${markTip}`)

    // M4-6：1280／1440／1920 寬度不可出現水平捲軸，各截一張圖
    mkdirSync('test-results', { recursive: true })
    for (const width of [1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 })
      for (const t of ['actions', 'spells', 'inventory']) {
        await page.click(`[data-tab-sheet="${t}"]`)
        await page.waitForTimeout(100)
        const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth])
        if (sw > cw) problems.push(`角卡 ${width}px（${t}）出現水平捲軸：scrollWidth ${sw} > ${cw}`)
      }
      await page.click('[data-tab-sheet="actions"]')
      await page.screenshot({ path: `test-results/sheet-${width}.png`, fullPage: true })
    }
    await page.setViewportSize({ width: 1280, height: 720 })

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

    await reviewSmoke(page, problems, before, snapshot)
  } catch (err) {
    problems.push(`角卡流程失敗：${err instanceof Error ? err.message.split('\n')[0] : err}`)
  }
}

/**
 * M6：審卡報告 → 預覽（首次說明、不再顯示）→ 下載 HTML → 另開分頁以 file:// 開啟（零錯誤、不連網）
 * → 輸出 PDF 供人工檢查 → 把報告 HTML 匯入回網站，角卡要完全相同。
 * @param {import('playwright').Page} page
 * @param {string[]} problems
 * @param {string} before 匯入前的角卡文字
 * @param {() => Promise<string>} snapshot
 */
async function reviewSmoke(page, problems, before, snapshot) {
  await page.getByTestId('review-open').click()
  await page.getByTestId('review-preview').waitFor({ timeout: 3000 })
  if (!(await page.getByTestId('review-help').count())) problems.push('審卡報告：第一次使用沒有顯示說明')
  const preview = await page.frameLocator('[data-testid="review-frame"]').locator('body').innerText()
  if (!preview.includes('警示區') || !preview.includes('17／+9')) problems.push('審卡報告預覽缺少警示區或法術 DC 17')
  const [rep] = await Promise.all([page.waitForEvent('download'), page.getByTestId('review-download').click()])
  const name = rep.suggestedFilename()
  if (!/^基準侏儒法師_Lv20_審卡_\d{4}-\d{2}-\d{2}\.html$/.test(name)) problems.push(`審卡報告檔名不符：${name}`)
  const out = resolve('test-results', 'review.html')
  await rep.saveAs(out)
  await page.getByTestId('review-help-hide').click()
  await page.getByTestId('review-close').click()
  await page.getByTestId('review-open').click()
  if (await page.getByTestId('review-help').count()) problems.push('審卡報告：按「不再顯示」後仍顯示說明')
  await page.getByTestId('review-close').click()
  if (await page.getByTestId('review-error').count()) problems.push(`審卡報告錯誤：${await page.getByTestId('review-error').innerText()}`)

  // 下載的檔案單獨開啟：主控台零錯誤、不發任何網路請求（連 file:// 子資源都不該有）
  const rp = await page.context().browser().newPage()
  const own = []
  rp.on('console', (m) => m.type() === 'error' && own.push(`console error: ${m.text()}`))
  rp.on('pageerror', (e) => own.push(`pageerror: ${e.message}`))
  rp.on('request', (r) => r.url() !== pathToFileURL(out).href && own.push(`請求：${r.url()}`))
  await rp.goto(pathToFileURL(out).href, { waitUntil: 'load' })
  const body = await rp.locator('body').innerText()
  for (const t of ['警示區', '逐級選擇表', '效果清單', '17／+9', 'PHB24 p.']) if (!body.includes(t)) own.push(`缺少「${t}」`)
  await rp.pdf({ path: resolve('test-results', 'review.pdf'), format: 'A4' })
  await rp.close()
  for (const p of own) problems.push(`下載的審卡報告：${p}`)

  // 報告內嵌存檔 → 網站「匯入」可以直接吃 HTML
  page.once('dialog', (d) => d.accept())
  await page.getByTestId('import-file').setInputFiles(out)
  await page.getByTestId('bar-message').getByText('已匯入').waitFor({ timeout: 3000 })
  if ((await snapshot()) !== before) problems.push('匯入審卡報告 HTML 後，角卡畫面不同')
}

if (problems.length) {
  console.error(`check:file 失敗（${url}）：`)
  for (const p of problems) console.error(`  - ${p}`)
  process.exit(1)
}
console.log(`check:file 通過：${url}，0 errors`)
