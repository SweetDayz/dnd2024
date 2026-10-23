import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import EntryBlock from '../entries/EntryBlock.vue'

function render(entry: unknown) {
  setActivePinia(createPinia())
  return mount(EntryBlock, { props: { entry }, global: { plugins: [createPinia()] } })
}

describe('EntryBlock', () => {
  it('渲染巢狀 entries 的標題（含英文名）與內文標籤', () => {
    const w = render({
      type: 'entries',
      name: '侏儒狡黠',
      ENG_name: 'Gnomish Cunning',
      entries: ['豁免检定均具有{@variantrule 优势|XPHB}。'],
    })
    expect(w.find('h4').text()).toBe('侏儒狡黠Gnomish Cunning')
    expect(w.find('.link').text()).toBe('优势')
  })

  it('渲染 list 與 item', () => {
    const w = render({
      type: 'list',
      items: ['一', { type: 'item', name: '属性值：', entry: '智力，感知' }],
    })
    expect(w.findAll('li')).toHaveLength(2)
    expect(w.find('.item-name').text()).toBe('属性值：')
    expect(w.text()).toContain('智力，感知')
  })

  it('渲染 table（含 roll 儲存格）', () => {
    const w = render({
      type: 'table',
      caption: '特点',
      colLabels: ['d6', '特点'],
      rows: [
        [{ type: 'cell', roll: { exact: 1 } }, '乐观'],
        [{ type: 'cell', roll: { min: 2, max: 3 } }, '{@b 谨慎}'],
      ],
    })
    expect(w.find('caption').text()).toBe('特点')
    expect(w.findAll('tbody tr')).toHaveLength(2)
    expect(w.findAll('td').map((t) => t.text())).toEqual(['1', '乐观', '2–3', '谨慎'])
  })

  it('渲染 inset 為方框', () => {
    const w = render({ type: 'inset', name: '提示', entries: ['内容'] })
    expect(w.find('.inset').exists()).toBe(true)
  })

  it('未知標籤顯示純文字並 warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const w = render('看{@zzz 这里|X}')
    expect(w.text()).toBe('看这里')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('{@zzz}'))
    warn.mockRestore()
  })
})
