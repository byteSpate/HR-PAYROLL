export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // Revoked on a later tick, never synchronously after `click()`. The click
  // only *schedules* the download; the browser still has to read the blob
  // behind the object URL. Revoking in the same task pulls that URL away
  // before it is read, which is why the download appeared to do nothing.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
