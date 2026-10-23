import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import App from '../App.vue'

describe('App', () => {
  it('顯示標題與書目面板', () => {
    const wrapper = mount(App, { global: { plugins: [createPinia()] } })
    expect(wrapper.text()).toContain('D&D 2024 角色建立器')
    expect(wrapper.find('[data-testid="source-filter"]').exists()).toBe(true)
  })
})
