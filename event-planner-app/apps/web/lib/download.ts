/** Browser download helpers shared by the Markdown/HTML/JSON/CSV exports. */

export function triggerDownload(filename: string, content: string, mimeType: string): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke on the next tick so Safari has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Open a standalone HTML document in a new tab and invoke the print dialog. */
export function openPrintableWindow(html: string): boolean {
  if (typeof window === "undefined") return false;
  const win = window.open("", "_blank", "noopener,noreferrer,width=1024,height=768");
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  // Give the new document a beat to lay out before printing.
  setTimeout(() => {
    try {
      win.print();
    } catch {
      /* user can print manually */
    }
  }, 400);
  return true;
}
