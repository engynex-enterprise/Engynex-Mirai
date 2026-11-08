// Detección de plataforma para la app instalada (navegador). Puro: recibe el userAgent para poder probarlo.

export type InstallPlatform = "ios-safari" | "ios-other" | "ios-inapp" | "android" | "desktop-chromium" | "mac-safari" | "firefox" | "otro"

/** ¿Es iPhone/iPad? (los iPad nuevos se presentan como Mac con pantalla táctil). */
export const isIOS = (ua: string, maxTouchPoints = 0, platform = "") => /iPad|iPhone|iPod/.test(ua) || (platform === "MacIntel" && maxTouchPoints > 1)

/** Cómo se instala Mirai en este navegador (para el botón y las instrucciones de "Instalar Mirai"). */
export function installPlatform(ua: string, maxTouchPoints = 0, platform = ""): InstallPlatform {
  if (isIOS(ua, maxTouchPoints, platform)) {
    // Facebook, Instagram, TikTok, Gmail… abren las páginas en su propio navegador, que no deja agregar a inicio.
    if (/FBAN|FBAV|FB_IAB|Instagram|Line\/|TikTok|musical_ly|GSA\/|Snapchat|Twitter/i.test(ua)) return "ios-inapp"
    return /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua) ? "ios-other" : "ios-safari"
  }
  if (/Android/i.test(ua)) return /Firefox/i.test(ua) ? "firefox" : "android"
  if (/Firefox/i.test(ua)) return "firefox"
  if (/Edg\/|Chrome\/|Chromium\//.test(ua)) return "desktop-chromium"
  if (/Safari\//.test(ua) && /Macintosh/.test(ua)) return "mac-safari"
  return "otro"
}

/** ¿Mirai está abierto como app instalada (no en una pestaña del navegador)? */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false
  try {
    return (navigator as Navigator & { standalone?: boolean }).standalone === true ||
      ["standalone", "fullscreen", "minimal-ui", "window-controls-overlay"].some((m) => matchMedia(`(display-mode: ${m})`).matches)
  } catch { return false }
}

/**
 * Script en línea del <head> (app/layout.tsx): marca <html> antes de pintar con `standalone` (app instalada), la
 * plataforma (`ios`, `android`, `mac`, `windows`) y `touch` (pantalla táctil), para que el CSS dé a cada una su
 * apariencia nativa sin parpadeo. Bloquea el zoom con los dedos (iOS ignora user-scalable=no: se frenan sus gestos; el
 * editor de automatizaciones, `.react-flow`, sí puede acercar) y, en la app instalada de escritorio, Ctrl + rueda. También
 * guarda el aviso de instalación de Chrome si llega antes de que cargue React (window.__miraiInstall; lo toma
 * features/pwa/pwa-root.tsx).
 */
export const PLATFORM_SCRIPT = `(function(){try{var d=document.documentElement,n=navigator,u=n.userAgent,c=d.classList,s=n.standalone===true||["standalone","fullscreen","minimal-ui","window-controls-overlay"].some(function(m){return matchMedia("(display-mode: "+m+")").matches});if(s)c.add("standalone");var ios=/iPad|iPhone|iPod/.test(u)||(n.platform==="MacIntel"&&n.maxTouchPoints>1);if(ios)c.add("ios");else if(/Android/i.test(u))c.add("android");else if(/Mac/.test(n.platform||u))c.add("mac");else if(/Win/.test(n.platform||u))c.add("windows");if(matchMedia("(pointer: coarse)").matches)c.add("touch");var free=function(e){var t=e.target;return t&&t.closest&&t.closest(".react-flow")};document.addEventListener("gesturestart",function(e){if(!free(e))e.preventDefault()},{passive:false});document.addEventListener("touchmove",function(e){if(e.touches&&e.touches.length>1&&!free(e))e.preventDefault()},{passive:false});if(s&&!c.contains("touch"))addEventListener("wheel",function(e){if(e.ctrlKey&&!free(e))e.preventDefault()},{passive:false});addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__miraiInstall=e})}catch(e){}})()`
