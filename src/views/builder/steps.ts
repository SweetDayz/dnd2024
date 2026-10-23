/**
 * 建角精靈的步驟清單。`slotStep` 是規則引擎選擇欄位的 step（見 src/rules/build.ts），
 * 用來計算每一步還有幾項沒選。
 */
import type { Step } from '@/rules/build'

export interface WizardStep {
  id: string
  label: string
  slotStep?: Step
}

export const WIZARD_STEPS: WizardStep[] = [
  { id: 'sources', label: '書目確認' },
  { id: 'class', label: '職業', slotStep: 'class' },
  { id: 'background', label: '背景', slotStep: 'background' },
  { id: 'race', label: '種族', slotStep: 'race' },
  { id: 'abilities', label: '屬性值', slotStep: 'abilities' },
  { id: 'proficiencies', label: '技能與工具', slotStep: 'proficiencies' },
  { id: 'languages', label: '語言', slotStep: 'languages' },
  { id: 'levels', label: '升級', slotStep: 'levels' },
  { id: 'spells', label: '法術', slotStep: 'spells' },
  { id: 'equipment', label: '裝備', slotStep: 'equipment' },
  { id: 'confirm', label: '確認' },
]

/** 選擇欄位的 step → 精靈步驟 id（確認頁的「前往」連結用） */
export function wizardStepOf(step: Step): string {
  return WIZARD_STEPS.find((s) => s.slotStep === step)?.id ?? 'confirm'
}
