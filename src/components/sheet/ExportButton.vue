<script setup lang="ts">
// 角卡頂部的「匯出試算表」按鈕（M3 暫緩：保留功能、改成次要的灰色樣式）。第一次按下先顯示使用說明（可勾「不再顯示」，記在 localStorage）。
import { ref } from 'vue'
import { useXlsxExport } from '@/composables/useXlsxExport'

const HIDE_KEY = 'dnd2024.exportHelpHidden'
const { exportXlsx, busy, error } = useXlsxExport()
const showHelp = ref(false)
const dontShow = ref(false)

function helpHidden(): boolean {
  try {
    return localStorage.getItem(HIDE_KEY) === '1'
  } catch {
    return false
  }
}

function onClick() {
  if (helpHidden()) void exportXlsx()
  else showHelp.value = true
}

function confirm() {
  if (dontShow.value) {
    try {
      localStorage.setItem(HIDE_KEY, '1')
    } catch {
      // 存不了就下次再顯示
    }
  }
  showHelp.value = false
  void exportXlsx()
}
</script>

<template>
  <button
    type="button"
    class="export"
    data-testid="export-xlsx"
    :disabled="busy"
    title="排版尚未完成，審卡請改用 M6 的審卡報告"
    @click="onClick"
  >
    {{ busy ? '匯出中…' : '匯出試算表（TODO）' }}
  </button>
  <span v-if="error" class="error" data-testid="export-error">{{ error }}</span>
  <div v-if="showHelp" class="backdrop" @click.self="showHelp = false">
    <div class="dialog" role="dialog" aria-label="匯出試算表說明" data-testid="export-help">
      <h3>匯出試算表（.xlsx）</h3>
      <p>
        下載後拖進 Google Drive → 用 Google 試算表開啟 → 在備註欄或註解中和 DM 討論。<br />
        匯出的是快照，之後修改角色需要重新匯出。
      </p>
      <label><input v-model="dontShow" type="checkbox" data-testid="export-help-hide" /> 不再顯示</label>
      <div class="buttons">
        <button type="button" @click="showHelp = false">取消</button>
        <button type="button" class="primary" data-testid="export-confirm" @click="confirm">下載</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
button {
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface);
  color: inherit;
  font: inherit;
  cursor: pointer;
}
button:disabled {
  opacity: 0.6;
  cursor: wait;
}
.export {
  color: var(--color-text-muted);
  font-size: 0.85rem;
}
.error {
  color: var(--color-danger);
  font-size: 0.85rem;
}
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgb(0 0 0 / 0.55);
}
.dialog {
  max-width: 460px;
  padding: var(--space-3) var(--space-4, 1.5rem);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface);
}
.dialog h3 {
  margin-top: 0;
  color: var(--color-accent);
}
.buttons {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  margin-top: var(--space-3);
}
.primary {
  border-color: var(--color-accent);
  background: var(--color-accent);
  color: var(--color-bg);
}
</style>
