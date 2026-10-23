<script setup lang="ts">
// 致謝頁（M7-1）：使用者提供的文字（照抄）、上游 commit、建置日期、LICENSE.md 全文。
// LICENSE.md 用 Vite 的 `?raw` 在建置期把檔案內容變成字串打包進來，執行期不讀檔、不連網。
import { onMounted, ref } from 'vue'
import licenseText from '../../LICENSE.md?raw'
import { KIWEE_URL, UPSTREAM_URL } from '@/data/credits'
import { loadData } from '@/data/loader'
import type { DataMeta } from '@/export/sheetData'

const meta = ref<DataMeta>()
onMounted(async () => {
  meta.value = await loadData<DataMeta>('meta').catch(() => undefined)
})
const buildDate = __BUILD_TIME__.slice(0, 10)
</script>

<template>
  <article class="credits" data-testid="credits">
    <h2>致謝</h2>
    <p>原始碼和英文來源資料— MIT 許可證<br />中文在地化資料— CC BY-NC-SA 4.0<br />主要資料來源：</p>
    <ul>
      <li><a :href="KIWEE_URL" target="_blank" rel="noopener">{{ KIWEE_URL }}</a></li>
      <li><a :href="UPSTREAM_URL" target="_blank" rel="noopener">{{ UPSTREAM_URL }}</a></li>
    </ul>
    <p>我只是個執行claude code的人類魔寵</p>

    <h3>版本</h3>
    <dl>
      <dt>上游資料 commit</dt>
      <dd data-testid="upstream-commit">
        <code>{{ meta?.commit ?? '（載入中）' }}</code>
        <template v-if="meta">（{{ meta.branch }}，{{ meta.committedAt.slice(0, 10) }}）</template>
      </dd>
      <dt>建置日期</dt>
      <dd>{{ buildDate }}</dd>
    </dl>

    <h3>LICENSE.md</h3>
    <pre class="license">{{ licenseText }}</pre>
  </article>
</template>

<style scoped>
.credits {
  max-width: 900px;
}
a {
  color: var(--color-accent);
  word-break: break-all;
}
dl {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: var(--space-1) var(--space-3);
}
dt {
  color: var(--color-text-muted);
}
dd {
  margin: 0;
}
.license {
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface);
  white-space: pre-wrap;
  font-size: 0.85rem;
}
</style>
