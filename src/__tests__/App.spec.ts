import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import App from '../App.vue'

describe('App', () => {
  beforeEach(() => localStorage.clear())

  it('預設顯示建角精靈，可切換到資料瀏覽（書目面板）', async () => {
    const wrapper = mount(App, { global: { plugins: [createPinia()] } })
    expect(wrapper.text()).toContain('D&D 2024 角色建立器')
    expect(wrapper.find('[data-step="sources"]').exists()).toBe(true)
    await wrapper.find('[data-view="browser"]').trigger('click')
    expect(wrapper.find('[data-testid="source-filter"]').exists()).toBe(true)
  })
})
