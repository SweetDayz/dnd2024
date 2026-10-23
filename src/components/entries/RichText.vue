<script setup lang="ts">
// 顯示一段含 {@tag} 的文字。標籤裡可能再有標籤，所以這個元件會遞迴使用自己（<RichText>）。
import { computed } from 'vue'
import { describeTag, parseTags, type TagView } from '@/data/tags'
import EntryLink from './EntryLink.vue'

const props = defineProps<{ text: string }>()

/** 每種未知標籤只警告一次，避免洗版主控台。 */
const warned = new Set<string>()

const nodes = computed(() =>
  parseTags(props.text).map((n) => {
    if (typeof n === 'string') return { text: n } as const
    const view: TagView = describeTag(n)
    if (view.type === 'unknown' && !warned.has(view.tag)) {
      warned.add(view.tag)
      console.warn(`[RichText] 未支援的標籤 {@${view.tag}}：${n.raw}`)
    }
    return { view }
  }),
)
</script>

<template>
  <template v-for="(n, i) in nodes" :key="i">
    <template v-if="'text' in n">{{ n.text }}</template>
    <EntryLink v-else-if="n.view.type === 'link'" :view="n.view" />
    <span v-else-if="n.view.type === 'style'" :class="['tag-' + n.view.style]" :style="n.view.color ? { color: n.view.color } : undefined"
      ><RichText :text="n.view.text"
    /></span>
    <span v-else-if="n.view.type === 'ref'" class="tag-ref"><RichText :text="n.view.text" /></span>
    <template v-else>{{ n.view.text }}</template>
  </template>
</template>

<style scoped>
.tag-b {
  font-weight: 700;
}
.tag-i,
.tag-note {
  font-style: italic;
}
.tag-note {
  color: var(--color-text-muted);
}
.tag-u {
  text-decoration: underline;
}
.tag-s {
  text-decoration: line-through;
}
.tag-sup {
  vertical-align: super;
  font-size: 0.75em;
}
.tag-sub {
  vertical-align: sub;
  font-size: 0.75em;
}
.tag-dice {
  font-weight: 600;
  color: var(--color-dice);
}
.tag-code {
  font-family: monospace;
}
.tag-ref {
  color: var(--color-text-ref);
}
</style>
