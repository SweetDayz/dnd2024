/** 觸發下載（Blob ＋ <a download>，不發網路請求，file:// 可用） */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  // 給瀏覽器一點時間開始下載再釋放
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
