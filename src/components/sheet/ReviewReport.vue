<script setup lang="ts">
// 角卡頂部的「審卡報告」按鈕與預覽畫面（M6-4）。
//
// 預覽用 <iframe srcdoc> 直接顯示「要下載的那份 HTML」，所見即所得；
// 列印時呼叫 iframe 自己的 print()，只會印報告，不會印到網站介面。
// 第一次使用時在預覽頂部顯示說明，可按「不再顯示」（記在 localStorage）。
import { ref } from 'vue'
import { useExportInput } from '@/composables/useExportInput'
import { downloadBlob } from '@/export/download'
import { buildReviewModel } from '@/export/review'
import { renderReviewHtml } from '@/export/reviewHtml'

const HIDE_KEY = 'dnd2024.reviewHelpHidden'
const { collect } = useExportInput()
const open = ref(false)
const busy = ref(false)
const error = ref('')
const html = ref('')
const fileName = ref('')
const warnCount = ref(0)
const frame = ref<HTMLIFrameElement>()
const showHelp = ref(!helpHidden())

function helpHidden(): boolean {
  try {
    return localStorage.getItem(HIDE_KEY) === '1'
  } catch {
    return false
  }
}

function hideHelp() {
  showHelp.value = false
  try {
    localStorage.setItem(HIDE_KEY, '1')
  } catch {
    // 存不了就下次再顯示
  }
}

/** 每次打開都重新產生：報告是快照，要反映角色目前的狀態 */
async function openPreview() {
  busy.value = true
  error.value = ''
  try {
    const input = await collect()
    if (!input) return
    const model = buildReviewModel(input)
    html.value = renderReviewHtml(model)
    fileName.value = model.fileName
    warnCount.value = model.warnings.length
    open.value = true
  } catch (e) {
    error.value = `產生報告失敗：${e instanceof Error ? e.message : String(e)}`
  } finally {
    busy.value = false
  }
}

function download() {
  downloadBlob(new Blob([html.value], { type: 'text/html;charset=utf-8' }), fileName.value)
}

function print() {
  frame.value?.contentWindow?.print()
}
</script>

<template>
  <button type="button" class="open" data-testid="review-open" :disabled="busy" @click="openPreview">
    {{ busy ? '產生中…' : '審卡報告' }}
  </button>
  <span v-if="error" class="error" data-testid="review-error">{{ error }}</span>
  <div v-if="open" class="backdrop" @click.self="open = false">
    <div class="panel" role="dialog" aria-label="審卡報告預覽" data-testid="review-preview">
      <header>
        <h3>審卡報告預覽</h3>
        <span class="file">{{ fileName }}</span>
        <span class="warn" :class="{ none: !warnCount }">警示 {{ warnCount }} 項</span>
        <span class="spacer" />
        <button type="button" class="primary" data-testid="review-download" @click="download">下載 HTML</button>
        <button type="button" data-testid="review-print" @click="print">列印／存成 PDF</button>
        <button type="button" data-testid="review-close" @click="open = false">關閉</button>
      </header>
      <p v-if="showHelp" class="help" data-testid="review-help">
        下載的 HTML 可直接傳給 DM 用瀏覽器打開；要 PDF 請按列印，目的地選「另存為 PDF」。報告是快照，修改角色後要重新匯出。
        <button type="button" class="link" data-testid="review-help-hide" @click="hideHelp">不再顯示</button>
      </p>
      <iframe ref="frame" :srcdoc="html" title="審卡報告" data-testid="review-frame" />
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
.open,
.primary {
  border-color: var(--color-accent);
  background: var(--color-accent);
  color: var(--color-bg);
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
  align-items: stretch;
  justify-content: center;
  padding: var(--space-3);
  background: rgb(0 0 0 / 0.6);
}
.panel {
  display: flex;
  flex-direction: column;
  width: min(1200px, 100%);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface);
  overflow: hidden;
}
header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-border);
}
h3 {
  margin: 0;
  color: var(--color-accent);
}
.file {
  color: var(--color-text-muted);
  font-size: 0.85rem;
}
.warn {
  color: var(--color-danger);
  font-size: 0.85rem;
}
.warn.none {
  color: var(--color-text-muted);
}
.spacer {
  flex: 1;
}
.help {
  margin: 0;
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-border);
  font-size: 0.9rem;
}
.link {
  margin-left: var(--space-2);
  padding: 0;
  border: none;
  background: none;
  color: var(--color-accent);
  text-decoration: underline;
}
iframe {
  flex: 1;
  width: 100%;
  border: none;
  background: #16181d;
}
</style>
