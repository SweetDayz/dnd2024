<script setup lang="ts">
// 職業展開後的內容：職業特性（依等級）＋可選的子職清單（每個子職可再展開看特性）。
import { computed } from 'vue'
import { classFeatureRef, subclassFeatureRef } from '@/data/classRefs'
import type { Entry } from '@/data/types'
import { useCatalogStore } from '@/stores/catalog'
import { useSourceFilterStore } from '@/stores/sourceFilter'
import EntryRow from './EntryRow.vue'
import FeatureList from './FeatureList.vue'

const props = defineProps<{ cls: Entry }>()
const catalog = useCatalogStore()
const filter = useSourceFilterStore()

type Ref = Parameters<typeof classFeatureRef>[0]
const featureRefs = computed(() => ((props.cls.classFeatures as Ref[] | undefined) ?? []).map(classFeatureRef))

const subclasses = computed(() =>
  catalog
    .list('subclass')
    .filter((s) => s.className === props.cls.name && s.classSource === props.cls.source && filter.visible(s))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')),
)

function subRefs(s: Entry) {
  return ((s.subclassFeatures as string[] | undefined) ?? []).map(subclassFeatureRef)
}
</script>

<template>
  <h4>職業特性</h4>
  <FeatureList :refs="featureRefs" />
  <h4>{{ cls.subclassTitle ?? '子職' }}（目前書目下 {{ subclasses.length }} 個）</h4>
  <ul class="subs" data-testid="subclass-list">
    <EntryRow v-for="s in subclasses" :key="s.id" :entry="s">
      <FeatureList :refs="subRefs(s)" />
    </EntryRow>
  </ul>
</template>

<style scoped>
h4 {
  margin: var(--space-3) 0 var(--space-1);
}
.subs {
  margin: 0;
  padding: 0;
}
</style>
