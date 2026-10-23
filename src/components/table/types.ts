/** SortableTable 的欄位定義（M7-6）。 */
export interface Column<T, K extends string = string> {
  key: K
  label: string
  /** 欄位標題的 tooltip */
  title?: string
  /** 套在 th、td 上的 class：通用的有 nowrap、center、num（靠右，數字用） */
  cls?: string
  /** 沒有提供 `#cell-<key>` slot 時顯示的文字 */
  text?: (row: T) => string | number | undefined
  /** false＝這欄不能排序 */
  sortable?: boolean
}
