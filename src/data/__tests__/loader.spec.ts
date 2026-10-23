import { afterEach, describe, expect, it } from 'vitest'
import { dataUrl, loadData, resetLoaderForTests } from '../loader'

// jsdom 不會真的下載 <script src>，所以這裡手動模擬「資料檔執行」與 load / error 事件。
function findScript(kind: string): HTMLScriptElement {
  const el = document.head.querySelector<HTMLScriptElement>(`script[src="${dataUrl(kind)}"]`)
  if (!el) throw new Error(`找不到 ${kind} 的 <script>`)
  return el
}

/** 模擬資料檔被瀏覽器執行：先呼叫 register，再觸發 load。 */
function simulateDataFile(kind: string, data: unknown): void {
  window.__DND__!.register(kind, data)
  findScript(kind).dispatchEvent(new Event('load'))
}

afterEach(() => resetLoaderForTests())

describe('loadData', () => {
  it('插入 classic script，並在資料檔 register 後 resolve', async () => {
    const promise = loadData<{ message: string }>('demo')
    const script = findScript('demo')
    expect(script.type).not.toBe('module')

    simulateDataFile('demo', { message: 'hi' })
    await expect(promise).resolves.toEqual({ message: 'hi' })
  })

  it('同一類資料只插入一次 <script>', async () => {
    const a = loadData('spells')
    const b = loadData('spells')
    expect(a).toBe(b)
    expect(document.head.querySelectorAll('script[src="data/spells.js"]').length).toBe(1)

    simulateDataFile('spells', [])
    await a
    // 已載入過：直接回傳快取，不再插入 script
    await expect(loadData('spells')).resolves.toEqual([])
    expect(document.head.querySelectorAll('script[src="data/spells.js"]').length).toBe(1)
  })

  it('檔案不存在時 reject', async () => {
    const promise = loadData('missing')
    findScript('missing').dispatchEvent(new Event('error'))
    await expect(promise).rejects.toThrow('無法載入資料檔')
  })

  it('檔案載入了卻沒有 register 該類資料時 reject', async () => {
    const promise = loadData('wrong')
    findScript('wrong').dispatchEvent(new Event('load'))
    await expect(promise).rejects.toThrow('沒有註冊')
  })
})
