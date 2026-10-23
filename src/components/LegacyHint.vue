<script setup lang="ts">
// 選單標題列的小提示「已隱藏 N 個重印舊版」：點擊在這個選單暫時顯示（不改全域設定）。
// v-model 是該選單自己的 reveal 狀態；全域開關「顯示已被重印取代的版本」打開時不需要提示。
import { useSourceFilterStore } from '@/stores/sourceFilter'

defineProps<{ hidden: number }>()
const reveal = defineModel<boolean>({ default: false })
const filter = useSourceFilterStore()
</script>

<template>
  <button
    v-if="hidden > 0 && !filter.showLegacy"
    type="button"
    class="hint"
    :class="{ on: reveal }"
    data-testid="legacy-hint"
    :title="reveal ? '點擊再次隱藏' : '只在這個選單暫時顯示，不改全域設定'"
    @click="reveal = !reveal"
  >
    {{ reveal ? `正在顯示 ${hidden} 個重印舊版（點擊隱藏）` : `已隱藏 ${hidden} 個重印舊版` }}
  </button>
</template>

<style scoped>
.hint {
  padding: 0 var(--space-2);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius);
  background: transparent;
  color: var(--color-text-muted);
  font: inherit;
  font-size: 0.8rem;
  cursor: pointer;
}
.hint.on {
  border-color: var(--color-legacy);
  color: var(--color-legacy);
}
</style>
