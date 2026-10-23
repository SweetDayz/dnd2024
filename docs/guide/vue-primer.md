# Vue 3 + Vite 導讀（用本專案當例子）

> 寫給熟 IT、但沒碰過 Vue / Vite 的人。每次專案出現新概念，Claude 會補進這份文件。
> 想針對某個概念或檔案深入問，可以用 `/teach <主題>`。

---

## 1. 資料夾與檔案

```
index.html               入口 HTML。Vite 從這裡開始找 <script type="module" src="/src/main.ts">
vite.config.ts           Vite 設定：base './'、Vue 外掛、singlefile 外掛
vitest.config.ts         測試設定（沿用 vite.config.ts，再加上 jsdom 環境）
package.json             相依套件與 npm scripts
tsconfig*.json           TypeScript 設定（app、node 腳本、測試各一份，由 tsconfig.json 串起來）
eslint.config.ts         ESLint 規則；.oxlintrc.json 是另一個更快的 linter（oxlint）
.prettierrc.json         自動排版規則（不加分號、單引號、一行 100 字）

src/
  main.ts                程式進入點：建立 Vue app、掛上 Pinia、mount 到 #app
  App.vue                最外層元件；目前顯示 Hello DND 和 demo 資料
  assets/main.css        全站深色主題（CSS 變數）
  data/loader.ts         classic-script 資料載入器 loadData()
  data/__tests__/        loader 的單元測試
  stores/counter.ts      Pinia store 範例（之後會換成 sourceFilter、character）
  __tests__/App.spec.ts  元件測試範例

public/                  原封不動複製到 dist/ 的檔案（不經過打包）
  data/demo.js           示範資料檔（classic script）
  favicon.ico

scripts/                 建置期跑的 Node 腳本，不會進到瀏覽器
  fetch-data.ts          （M1）從上游抓資料到 raw/
  build-data.ts          （M1）把 raw/ 轉成 public/data/*.js
  check-file.mjs         用 Playwright 以 file:// 開 dist/index.html 自動驗收

dist/                    npm run build 的產物（不進 git）
raw/                     上游原始資料（不進 git）
```

### `npm run dev` 和 `npm run build` 的差別

| | `npm run dev` | `npm run build` |
|---|---|---|
| 做什麼 | 啟動 Vite dev server（http://localhost:5173） | 型別檢查（vue-tsc）＋打包到 `dist/` |
| 檔案 | 不打包，瀏覽器直接向 server 要每個 `.ts`/`.vue`，Vite 即時轉譯 | 全部打包、壓縮，並由 singlefile 外掛 inline 成一個 `index.html` |
| 改檔 | 存檔後畫面立刻更新（HMR，Hot Module Replacement），狀態通常保留 | 要重新 build |
| 用途 | 開發 | 交付：雙擊 `dist/index.html` 或部署到 GitHub Pages |

`public/` 裡的檔案在 dev 時以 `/data/demo.js` 提供，build 時被複製到 `dist/data/demo.js`。

其他常用 scripts：`npm test`（Vitest 監看模式，改檔自動重跑；加 `-- --run` 只跑一次）、`npm run lint`（oxlint＋ESLint，會自動修可修的問題）、`npm run check:file`（file:// 驗收）。

---

## 2. `.vue` 單檔元件（SFC）的三段

以 [src/App.vue](../../src/App.vue) 為例：

```vue
<script setup lang="ts">
// ① 邏輯：TypeScript。這裡宣告的變數、函式，template 都能直接用。
import { onMounted, ref } from 'vue'
import { loadData } from '@/data/loader'      // @ 是 src/ 的別名（vite.config.ts 設定）
const demoMessage = ref<string | null>(null)
onMounted(async () => { /* 元件出現在畫面上之後執行 */ })
</script>

<template>
  <!-- ② 畫面：類 HTML，用 {{ }} 插入值，用 v- 開頭的指令控制邏輯 -->
  <h1>Hello DND</h1>
  <p v-if="demoMessage">{{ demoMessage }}</p>
</template>

<style scoped>
/* ③ 樣式：scoped 代表只套用在這個元件，不會汙染其他元件 */
h1 { color: var(--color-accent); }
</style>
```

`<script setup>` 是 Vue 3 的簡寫語法：不用寫 `export default { setup() { return {...} } }`，頂層宣告的東西自動暴露給 template。

---

## 3. 最小範例

### `ref`：會觸發畫面更新的變數

```ts
const count = ref(0)
count.value++          // 在 <script> 裡要用 .value
```
```vue
<button @click="count++">{{ count }}</button>   <!-- 在 template 裡不用 .value -->
```

為什麼要包一層？Vue 需要「攔截」讀寫才知道誰用了這個值、改了之後要重畫哪裡。一般的 `let` 變數改了，畫面不會變。本專案例子：`App.vue` 的 `demoMessage`、`loadError`。

### `computed`：由其他值推導、自動快取的值

```ts
const str = ref(15)
const strMod = computed(() => Math.floor((str.value - 10) / 2))  // 屬性調整值
```
`str` 改變時 `strMod` 自動重算；沒變就用快取。角卡上大部分數字（AC、技能加值…）都會是 computed。

### `v-for`：重複渲染清單

```vue
<li v-for="spell in spells" :key="spell.name">{{ spell.name }}</li>
```
`:key` 要給唯一值，Vue 靠它判斷哪一列是哪一列。`:` 是 `v-bind:` 的簡寫，表示「後面是 JS 運算式，不是字串」。

### `v-if` / `v-else-if` / `v-else`：條件渲染

`App.vue` 用它切換三種狀態：錯誤、成功、載入中。

```vue
<p v-if="loadError">{{ loadError }}</p>
<p v-else-if="demoMessage">{{ demoMessage }}</p>
<p v-else>資料載入中…</p>
```

### `v-model`：表單雙向綁定

```vue
<script setup lang="ts">
const name = ref('')
</script>
<template>
  <input v-model="name" />   <!-- 打字 → name 更新；程式改 name → 輸入框更新 -->
  <p>角色名：{{ name }}</p>
</template>
```

### props 與 emit：父子元件溝通

資料**往下**用 props，事件**往上**用 emit。例如之後的來源書徽章與選項卡：

```vue
<!-- SourceBadge.vue（子） -->
<script setup lang="ts">
const props = defineProps<{ source: string; page?: number }>()
const emit = defineEmits<{ select: [source: string] }>()
</script>
<template>
  <span class="badge" @click="emit('select', props.source)">
    {{ source }}<template v-if="page"> p.{{ page }}</template>
  </span>
</template>
```
```vue
<!-- 父元件 -->
<SourceBadge source="XPHB" :page="165" @select="(s) => console.log(s)" />
```

子元件不能直接改 props；要改就 emit 事件，讓擁有資料的父元件去改。這讓「資料是誰的」永遠很清楚。

---

## 4. Pinia store 是什麼

Store 是**跨元件共用的狀態**。若「啟用哪些書」只存在某個元件裡，其他元件拿不到；放進 store，任何元件都能讀寫，而且一樣是響應式的。

範例 [src/stores/counter.ts](../../src/stores/counter.ts)：

```ts
export const useCounterStore = defineStore('counter', () => {
  const count = ref(0)                              // state
  const doubleCount = computed(() => count.value * 2) // getter
  function increment() { count.value++ }           // action
  return { count, doubleCount, increment }
})
```

元件裡使用：`const counter = useCounterStore()`，之後 `counter.count`、`counter.increment()`。
本專案之後會有 `sourceFilter`（啟用的書目、開關）和 `character`（正在建立的角色）兩個 store。`main.ts` 裡的 `app.use(createPinia())` 就是讓 store 能運作的那一行。

### 為什麼規則引擎要寫成純 TS、不放進元件

`src/rules/` 會放「給定角色資料 → 算出 AC、技能加值…」這類函式。刻意寫成**純函式**（同樣輸入永遠同樣輸出、不讀寫外部狀態、不 import Vue）：

1. **好測**：Vitest 直接呼叫函式比對結果，不用掛載元件、不用瀏覽器。
2. **好找錯**：數字錯了，先看規則測試；畫面錯了，才看元件。兩者分開。
3. **不綁框架**：之後換 UI 或加列印版，規則照用。

元件和 store 只負責「把使用者的選擇交給規則函式、把結果顯示出來」，通常就是一個 `computed(() => calcAC(character))`。

---

## 5. 寫和執行 Vitest 測試

測試檔放在被測檔案旁的 `__tests__/`，檔名 `*.spec.ts`。例子 [src/data/__tests__/loader.spec.ts](../../src/data/__tests__/loader.spec.ts)：

```ts
import { describe, expect, it } from 'vitest'
import { loadData } from '../loader'

describe('loadData', () => {
  it('檔案不存在時 reject', async () => {
    const promise = loadData('missing')
    findScript('missing').dispatchEvent(new Event('error'))   // 模擬瀏覽器載入失敗
    await expect(promise).rejects.toThrow('無法載入資料檔')
  })
})
```

- `describe` 分組、`it` 是一個測試案例、`expect(...).toBe/toEqual/...` 是斷言。
- 測試跑在 **jsdom**（Node 裡模擬的 DOM），所以能用 `document`，但不會真的下載檔案——所以這裡手動觸發 `load`/`error` 事件。
- 執行：`npm test`（監看模式）或 `npm test -- --run`（跑一次，CI／驗收用）。只跑某個檔：`npm test -- loader`。

元件測試範例在 [src/__tests__/App.spec.ts](../../src/__tests__/App.spec.ts)：用 `@vue/test-utils` 的 `mount(App)` 掛載，再檢查 `wrapper.text()`。

---

## 6. 本專案特有：為什麼資料用 classic script 載入

使用者雙擊 `dist/index.html` 時網址是 `file:///...`。Chrome 在 `file://` 下：

- 擋 `fetch()` 與 `XMLHttpRequest` 讀本機檔（CORS）。
- 擋 `<script type="module" src="...">` 與 `import()`（module 也受 CORS 規則管）。
- **不擋**一般的 `<script src="...">`。

所以：

1. App 的程式碼由 `vite-plugin-singlefile` 直接 inline 在 `index.html`，不需要額外載入。
2. 資料檔寫成一般 script：`window.__DND__.register('demo', {...})`。
3. [src/data/loader.ts](../../src/data/loader.ts) 的 `loadData('demo')` 先建立 `window.__DND__`，再插入 `<script src="data/demo.js">`，資料檔執行時呼叫 `register`，Promise 就 resolve。

---

## 7. 常見問題：雙擊 `index.html` 白畫面

依序排查：

1. **開 F12 → Console 看紅字**，這是最快的線索。
2. `Access to script at 'file:///.../assets/index-xxx.js' ... blocked by CORS policy`
   → JS 沒被 inline。確認 `vite.config.ts` 有 `viteSingleFile()`，重新 `npm run build`。
3. `Failed to load resource: net::ERR_FILE_NOT_FOUND`，路徑是 `file:///C:/assets/...` 或 `file:///C:/data/...`
   → 路徑是絕對的 `/xxx`。確認 `base: './'`，程式裡也不要寫開頭是 `/` 的路徑。
4. `Cannot read properties of undefined (reading 'register')`
   → 資料檔比載入器早執行。資料檔只能透過 `loadData()` 載入，不要自己寫進 `index.html`。
5. `Failed to fetch` / `fetch` 相關錯誤 → 程式某處用了 `fetch` 讀資料，違反本專案規則，改用 `loadData()`。
6. 沒有紅字但畫面空白 → 你開的可能是根目錄的 `index.html`（開發用，要經過 Vite），要開的是 **`dist/index.html`**。
7. 懶得手動查：`npm run build && npm run check:file`，它會把上述錯誤都列出來。

---

## 8. M1 新出現的概念

### 遞迴元件：元件裡用自己

5etools 的內文是樹狀的（entries 裡有 list，list 裡有 item，item 裡又有 entries…），深度不固定。
[EntryBlock.vue](../../src/components/entries/EntryBlock.vue) 的 template 裡直接寫 `<EntryBlock :entry="c" :depth="depth + 1" />`：
`<script setup>` 的 SFC 可以用**自己的檔名**當標籤名稱來遞迴，不用 import。
[RichText.vue](../../src/components/entries/RichText.vue) 也一樣：`{@b 粗體裡有{@spell 法術}}` 會一層一層渲染下去。

### `<component :is="...">`：動態決定標籤

`<component :is="depth === 0 ? 'h4' : 'h5'">` 依條件產生 `<h4>` 或 `<h5>`，免得寫兩份幾乎一樣的 template。

### `markRaw` 與 `shallowRef`：大資料不要做深層響應式

Vue 的 `ref({...})` 會把物件裡每一層都包成 Proxy，任何一層改變都能觸發畫面更新。
資料檔有幾千筆、巢狀很深，而且載入後**永遠不會改**，深層追蹤只是浪費。
[stores/catalog.ts](../../src/stores/catalog.ts) 的做法：

- `markRaw(data)`：告訴 Vue「這個物件不要追蹤」。
- `shallowRef(...)`：只追蹤 `.value` 本身被換掉，不追蹤裡面。
- 一個 `version` 計數器：每載入一個檔案就 `+1`。查詢函式裡讀一下 `version.value`，用到它的 `computed` 就會在新資料進來時重算。

### `<Teleport to="body">`：把元素搬到別處渲染

tooltip 寫在 [EntryLink.vue](../../src/components/entries/EntryLink.vue) 裡，邏輯上屬於那個連結；
但如果外層有 `overflow: hidden`，tooltip 會被裁掉。`<Teleport to="body">` 讓它實際被放到 `<body>` 底下，
再用 `position: fixed` 加上連結的座標（`getBoundingClientRect()`）定位。

### `defineProps` 的 TypeScript 寫法與 `withDefaults`

```ts
const props = withDefaults(defineProps<{ entry: unknown; depth?: number }>(), { depth: 0 })
```

用型別宣告 props（`?` 代表可省略），`withDefaults` 給預設值。父元件傳錯型別時，`vue-tsc` 型別檢查會報錯。

### `watch`：狀態改變時做副作用

[stores/sourceFilter.ts](../../src/stores/sourceFilter.ts) 用 `watch([groupId, enabled, showLegacy, tceOptional], save)`：
任何一個值改變就把整份篩選狀態寫進 `localStorage`。`computed` 用來「算出新值」，`watch` 用來「值變了就去做某件事」（存檔、記 log…）。
store 建立時先 `load()` 一次，所以重開頁面會還原上次的設定。

### `v-model` 綁 checkbox

`<input v-model="filter.showLegacy" type="checkbox">`：勾選狀態與 store 的布林值雙向同步，不用自己寫 `@change`。
單本勾選那裡則用 `:checked` + `@change` 手動呼叫 `toggleSource()`，因為勾選一本書還要順便判斷「是否仍等於某個群組」。

### M1 之後的檔案地圖

```
scripts/fetch-data.ts          git sparse checkout 上游 data/ → raw/
scripts/build-data.ts          raw/ → public/data/*.js（讀寫檔）
scripts/lib/pipeline.ts        建置管線的純函式（_copy、白名單、重印、TCE 旗標），有 Vitest 測試
scripts/lib/copy.ts            _copy / _mod 解析
scripts/source-table.ts        把來源對照表寫進 docs/data-notes.md
src/data/sourceGroups.ts       白名單與 official 群組（建置腳本與 app 共用）
src/data/ids.ts、types.ts      條目 id 與型別（共用）
src/data/tags.ts               {@tag} 解析；summary.ts、display.ts 是顯示用的小工具
src/data/visibility.ts         「這筆條目在目前書目下要不要顯示」
src/stores/catalog.ts          載入資料檔、建索引（markRaw）
src/stores/sourceFilter.ts     啟用書目與開關（localStorage）
src/components/entries/        EntryBlock（entries 結構）、RichText（標籤）、EntryLink（tooltip）
src/components/browser/        OptionBrowser（分頁、搜尋、篩選）、EntryRow、ClassDetail、FeatureList
```

注意：被建置腳本（Node 直接執行 .ts）用到的 `src/data/*.ts`，彼此 import 要寫副檔名 `./ids.ts`，
而且只能用「型別可直接擦掉」的 TS 語法（不能用 `enum`、`namespace`），因為 Node 只做 type stripping、不做轉譯。
