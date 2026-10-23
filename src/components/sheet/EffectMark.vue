<script setup lang="ts">
// 數值旁的小圖示：這個欄位有相關的效果段落（例如侏儒狡黠 → 智力豁免），點擊跳到效果頁。
import { computed, inject } from 'vue'
import { effectsFor } from '@/rules/effects'
import { SHEET_CONTEXT } from './context'

const props = defineProps<{ field: string }>()
const ctx = inject(SHEET_CONTEXT)
const list = computed(() => (ctx ? effectsFor(ctx.effects.value, props.field) : []))
const title = computed(() =>
  [`有 ${list.value.length} 條效果可能影響此項，點擊查看`, ...list.value.map((e) => `・${e.title}：${e.text.slice(0, 60)}`)].join('\n'),
)
</script>

<template>
  <button
    v-if="list.length"
    type="button"
    class="mark"
    :title="title"
    :data-effect="field"
    @click.stop="ctx?.showEffects(field)"
  >
    ✦{{ list.length > 1 ? list.length : '' }}
  </button>
</template>

<style scoped>
.mark {
  padding: 0 2px;
  border: 0;
  background: none;
  color: var(--color-tce);
  font-size: 0.75rem;
  cursor: pointer;
  vertical-align: super;
}
</style>
