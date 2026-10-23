import { describe, it, expect } from 'vitest'

import { mount } from '@vue/test-utils'
import App from '../App.vue'

describe('App', () => {
  it('顯示 Hello DND', () => {
    const wrapper = mount(App)
    expect(wrapper.text()).toContain('Hello DND')
  })
})
