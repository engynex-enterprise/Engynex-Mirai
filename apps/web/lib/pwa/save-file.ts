// Guardar un archivo que genera Mirai (PDF, Excel, CSV, .ics). En la app instalada de iPhone y Android se abre la hoja
// de Compartir (Guardar en Archivos, WhatsApp, correo…): una descarga en iOS instalado abre una vista sin botón de
// volver y la persona queda atrapada. En el navegador y en el escritorio, descarga normal.
import { isStandalone } from "./platform"

const preferShare = () => {
  try { return isStandalone() && matchMedia("(pointer: coarse)").matches } catch { return false }
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url; a.download = filename; a.rel = "noopener"
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/** Descarga o comparte el archivo. Devuelve cómo terminó (para no mostrar "Descargado" si la persona canceló). */
export async function saveFile(blob: Blob, filename: string, title?: string): Promise<"descargado" | "compartido" | "cancelado"> {
  if (preferShare() && typeof navigator.share === "function") {
    const file = new File([blob], filename, { type: blob.type || "application/octet-stream" })
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: title ?? filename })
        return "compartido"
      } catch (e) {
        if ((e as DOMException)?.name === "AbortError") return "cancelado"
      }
    }
  }
  download(blob, filename)
  return "descargado"
}
