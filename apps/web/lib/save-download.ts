import type { DownloadedFile } from './api-client';

/** Hands a downloaded file to the browser's save dialog. */
export function saveDownload({ blob, fileName }: DownloadedFile): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  // Revoked on the next tick so the click has started the download first.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
