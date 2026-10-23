<script setup lang="ts">
// 可手動覆寫的數值：點 ✎ 輸入覆寫值，清空就恢復自動計算。覆寫中的數值會標示「已覆寫」並顯示原本的計算值。
import { computed, ref } from 'vue'
import { useCharacterBuild } from '@/composables/useCharacterBuild'
import { formatMod } from '@/rules/abilities'

// value 是規則引擎套用覆寫（並連動其他數值）之後的最終值；計算值從 sheet.overridden 查
const props = defineProps<{ k: string; value: number; signed?: boolean; suffix?: string }>()
const { store, sheet } = useCharacterBuild()
const editing = ref(false)
const shown = computed(() => {
  const o = sheet.value?.overridden[props.k]
  return { value: props.value, computed: o?.computed ?? props.value, overridden: !!o }
})
const fmt = (n: number) => (props.signed ? formatMod(n) : String(n)) + (props.suffix ?? '')

function save(e: Event) {
  const raw = (e.target as HTMLInputElement).value.trim()
  store.update((c) => {
    if (raw === '' || Number.isNaN(Number(raw))) delete c.overrides[props.k]
    else c.overrides[props.k] = Number(raw)
  })
  editing.value = false
}
</script>

<template>
  <span class="ov" :class="{ overridden: shown.overridden }" :data-override="k">
    <input
      v-if="editing"
      type="number"
      :value="shown.overridden ? shown.value : ''"
      :placeholder="String(shown.computed)"
      autofocus
      @change="save"
      @blur="editing = false"
      @keydown.esc="editing = false"
    />
    <template v-else>
      <span class="val" :title="shown.overridden ? `已手動覆寫；自動計算為 ${fmt(shown.computed)}` : ''" data-testid="value">{{ fmt(shown.value) }}</span>
      <span v-if="shown.overridden" class="flag" title="此值已手動覆寫">已覆寫</span>
      <button type="button" class="edit" title="手動覆寫（清空恢復自動計算）" @click.stop="editing = true">✎</button>
    </template>
  </span>
</template>

<style scoped>
.ov {
  display: inline-flex;
  align-items: baseline;
  gap: 2px;
}
.overridden .val {
  color: var(--color-dice);
  text-decoration: underline dotted;
}
.flag {
  font-size: 0.6rem;
  color: var(--color-dice);
  border: 1px solid var(--color-dice);
  border-radius: var(--radius);
  padding: 0 2px;
}
.edit {
  border: 0;
  background: none;
  color: var(--color-text-muted);
  font-size: 0.7rem;
  cursor: pointer;
  opacity: 0;
  padding: 0;
}
.ov:hover .edit,
.overridden .edit {
  opacity: 1;
}
input {
  width: 4em;
  padding: 0 var(--space-1);
  border: 1px solid var(--color-accent);
  border-radius: var(--radius);
  background: var(--color-bg);
  color: inherit;
  font: inherit;
}
</style>
