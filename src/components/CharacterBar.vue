<script setup lang="ts">
// 角色工具列：切換角色、建立新角色、匯出／匯入 JSON、刪除。
// 匯出用 Blob 下載（file:// 下也能用）；匯入用 <input type="file"> 讀本機檔案，不經過網路。
import { ref } from 'vue'
import { ImportError } from '@/rules/character'
import { useCharacterStore } from '@/stores/character'

const store = useCharacterStore()
const fileInput = ref<HTMLInputElement | null>(null)
const message = ref('')

function label(c: { name: string; levels: unknown[] }) {
  return `${c.name || '（未命名）'}・${c.levels.length} 級`
}

function exportJson() {
  const json = store.exportCurrent()
  if (!json || !store.current) return
  const blob = new Blob([json], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${store.current.name || 'character'}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

function idOf(text: string): string | undefined {
  try {
    const raw = JSON.parse(text)
    return (raw?.character ?? raw)?.id
  } catch {
    return undefined
  }
}

async function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const text = await file.text()
  try {
    const id = idOf(text)
    const replace = !!id && store.hasId(id) && confirm('已有同一個角色，要覆蓋嗎？（取消則另存一份）')
    const c = store.importJson(text, replace)
    message.value = `已匯入「${c.name || '（未命名）'}」`
  } catch (err) {
    message.value = err instanceof ImportError ? err.message : '匯入失敗：檔案格式不正確'
  }
  input.value = ''
}

function remove() {
  const c = store.current
  if (c && confirm(`刪除「${c.name || '（未命名）'}」？此動作無法復原（建議先匯出）。`)) store.remove(c.id)
}
</script>

<template>
  <div class="bar" data-testid="character-bar">
    <select
      v-if="store.characters.length"
      :value="store.currentId ?? ''"
      data-testid="character-select"
      @change="store.select(($event.target as HTMLSelectElement).value)"
    >
      <option v-for="c in store.characters" :key="c.id" :value="c.id">{{ label(c) }}</option>
    </select>
    <button type="button" data-testid="new-character" @click="store.create()">＋ 新角色</button>
    <button type="button" :disabled="!store.current" data-testid="export" @click="exportJson">匯出 JSON</button>
    <button type="button" data-testid="import" @click="fileInput?.click()">匯入 JSON</button>
    <input ref="fileInput" type="file" accept=".json,application/json" hidden data-testid="import-file" @change="onFile" />
    <button type="button" class="danger" :disabled="!store.current" @click="remove">刪除</button>
    <span v-if="!store.storageOk" class="warn" title="瀏覽器不允許 localStorage，關閉頁面後資料會消失">⚠ 無法自動儲存，請記得匯出</span>
    <span v-if="message" class="msg" data-testid="bar-message">{{ message }}</span>
  </div>
</template>

<style scoped>
.bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}
select,
button {
  padding: 2px var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface-raised);
  color: inherit;
  font: inherit;
  font-size: 0.9rem;
  cursor: pointer;
}
button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.danger {
  color: var(--color-danger);
}
.warn {
  color: var(--color-dice);
  font-size: 0.85rem;
}
.msg {
  color: var(--color-text-muted);
  font-size: 0.85rem;
}
</style>
