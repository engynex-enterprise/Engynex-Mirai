// Borra todo lo que Mirai guardó en este dispositivo para usarse sin conexión (cerrar sesión o Ajustes › Mirai como
// app › Borrar datos de este dispositivo): la base local (datos y cambios pendientes) y las páginas guardadas.
import { deleteDb } from "./idb"

export const PAGES_CACHE = "mirai-pages"

export async function clearOfflineData() {
  await deleteDb()
  try { if (typeof caches !== "undefined") await caches.delete(PAGES_CACHE) } catch { /* sin cachés */ }
  try { navigator.serviceWorker?.controller?.postMessage({ type: "CLEAR_PRIVATE" }) } catch { /* sin service worker */ }
  try { localStorage.removeItem("mirai-preparado-at") } catch { /* sin almacenamiento */ }
}
