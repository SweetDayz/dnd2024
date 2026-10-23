/**
 * 角卡內共用的狀態：效果清單與「跳到效果頁並篩選某欄位」。
 * 用 provide／inject 傳給深層元件（數值旁的效果小圖示），避免一層層傳 props。
 */
import type { InjectionKey, Ref } from 'vue'
import type { Effect } from '@/rules/effects'

export interface SheetContext {
  effects: Ref<Effect[]>
  showEffects: (field: string) => void
}

export const SHEET_CONTEXT: InjectionKey<SheetContext> = Symbol('sheet')
