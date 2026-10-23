---
name: teach
description: 用這個專案的實際程式碼教使用者 Vue 3、Vite、TypeScript、Pinia、Vitest 的概念，或解釋某個檔案在做什麼。使用者說「教我」「這是什麼」「/teach」時使用。
argument-hint: "<主題或檔案路徑，例如 computed、src/stores/sourceFilter.ts>"
---

# /teach：用本專案教 Vue

使用者是 IT 人員，懂程式但不熟 Vue 生態。主題是 `$ARGUMENTS`。

1. 若主題是檔案路徑：讀該檔案，說明它在整個專案中的角色、資料從哪來往哪去、裡面用到的 Vue 或 TS 概念。
2. 若主題是概念：在專案裡找出實際用到該概念的程式片段（用 Grep），拿它當例子解釋。專案裡還沒用到的話，就寫一個與本專案相關的最小例子（例如用法術或屬性值當資料），不寫抽象的 foo/bar。
3. 說明方式：
   - 先一句話講「它解決什麼問題」。
   - 再對照使用者可能熟悉的東西類比（例如 `computed` 像資料庫的 view，Pinia store 像 Spring 的 singleton service）。
   - 附上程式片段，並標出關鍵行。
   - 最後一個「常見地雷」。
4. 篇幅控制在一個螢幕內。
5. 如果這個主題在 `docs/guide/vue-primer.md` 還沒有，或寫得不夠，就補進去。不要重複已有的內容。
