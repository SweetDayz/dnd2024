// 從 raw/ 讀出建置管線要的全部陣列（build-data 與稽核測試共用）。
import type { EntryKind } from '../../src/data/ids.ts'
import type { RawInput } from './pipeline.ts'
import { readRaw, type Json } from './raw.ts'

/** 整個檔案不打包的職業檔：協力者（sidekick）不是玩家職業。 */
export const EXCLUDED_CLASS_FILE = (f: string) => f.includes('sidekick')

export interface RawRead {
  input: RawInput
  /** 整檔排除的條目（稽核報告列為「被類型篩掉」） */
  excluded: { kind: EntryKind; name: string; source: string; reason: string }[]
}

export function readRawInput(): RawRead {
  const races = readRaw('races.json')
  const itemsBase = readRaw('items-base.json')
  const items = readRaw('items.json')
  const conditions = readRaw('conditionsdiseases.json')

  const spellFiles: string[] = Object.values(readRaw('spells/index.json'))
  const allClassFiles: string[] = Object.values<string>(readRaw('class/index.json'))
  const classData: Json[] = allClassFiles
    .filter((f) => !EXCLUDED_CLASS_FILE(f))
    .map((f) => readRaw(`class/${f}`))
  const fromClasses = (k: string) => classData.flatMap((c) => c[k] ?? [])

  const excluded: RawRead['excluded'] = []
  for (const f of allClassFiles.filter(EXCLUDED_CLASS_FILE)) {
    const d = readRaw(`class/${f}`)
    for (const kind of ['class', 'subclass', 'classFeature', 'subclassFeature'] as const) {
      for (const e of d[kind] ?? []) {
        excluded.push({
          kind,
          name: e.name,
          source: e.source,
          reason: `協力者（${f}）不是玩家職業，整檔不打包`,
        })
      }
    }
  }

  const input: RawInput = {
    race: races.race,
    subrace: races.subrace,
    background: readRaw('backgrounds.json').background,
    feat: readRaw('feats.json').feat,
    optionalfeature: readRaw('optionalfeatures.json').optionalfeature,
    baseitem: itemsBase.baseitem,
    item: items.item,
    itemGroup: items.itemGroup,
    magicvariant: readRaw('magicvariants.json').magicvariant,
    spell: spellFiles.flatMap((f) => readRaw(`spells/${f}`).spell),
    spellLookup: readRaw('generated/gendata-spell-source-lookup.json'),
    class: fromClasses('class'),
    subclass: fromClasses('subclass'),
    classFeature: fromClasses('classFeature'),
    subclassFeature: fromClasses('subclassFeature'),
    language: readRaw('languages.json').language,
    skill: readRaw('skills.json').skill,
    condition: conditions.condition,
    disease: conditions.disease,
    status: conditions.status,
    variantrule: readRaw('variantrules.json').variantrule,
    sense: readRaw('senses.json').sense,
    action: readRaw('actions.json').action,
    itemProperty: itemsBase.itemProperty,
    itemMastery: itemsBase.itemMastery,
    // M7-7：物品類型代碼的中文名（近战武器、乐器…），物品表格的「類型」欄與篩選用
    itemType: itemsBase.itemType,
  }
  return { input, excluded }
}
