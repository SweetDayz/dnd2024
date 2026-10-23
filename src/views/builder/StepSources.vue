<script setup lang="ts">
// 第 1 步：確認 DM 允許的書目。之後每一步的選項都只列出這裡啟用的書。
import SourceFilterPanel from '@/components/SourceFilterPanel.vue'
</script>

<template>
  <div class="step">
    <p>
      先確認 DM 允許哪些書。之後所有選項（職業、背景、種族、專長、法術、物品）都只列出這裡啟用的書，
      每個選項旁的徽章標示來源書與頁碼。中途改書目也可以，已做的選擇若變得不可用會標示出來。
    </p>
    <div class="panel"><SourceFilterPanel /></div>
  </div>
</template>

<style scoped>
.panel {
  max-width: 420px;
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface);
}
</style>
