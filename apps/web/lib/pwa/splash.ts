// Pantallas de inicio (splash) de iPhone y iPad para Mirai instalado. iOS no las arma solo: necesita una imagen del
// tamaño exacto de cada pantalla con su media query (<link rel="apple-touch-startup-image">). Las genera
// scripts/pwa-assets.mjs en public/pwa/splash/ (claro y oscuro). Puro y sin alias "@/" (lo importa el script con Node).

export type AppleDevice = {
  /** Nombre para el archivo y los comentarios. */
  id: string
  /** Ancho y alto en puntos CSS (retrato). */
  w: number
  h: number
  /** Densidad de pixeles. */
  dpr: number
  /** iPad: también se genera en horizontal. */
  tablet?: boolean
}

/** Pantallas comunes de iPhone (SE a 17) y iPad (10,2" a Pro 13"). Si dos modelos comparten tamaño, va uno solo. */
export const APPLE_DEVICES: AppleDevice[] = [
  { id: "iphone-se", w: 375, h: 667, dpr: 2 },            // SE 2.ª/3.ª gen, 8, 7
  { id: "iphone-8-plus", w: 414, h: 736, dpr: 3 },        // 8 Plus, 7 Plus
  { id: "iphone-x", w: 375, h: 812, dpr: 3 },             // X, XS, 11 Pro, 12 mini, 13 mini
  { id: "iphone-xr", w: 414, h: 896, dpr: 2 },            // XR, 11
  { id: "iphone-xs-max", w: 414, h: 896, dpr: 3 },        // XS Max, 11 Pro Max
  { id: "iphone-12", w: 390, h: 844, dpr: 3 },            // 12, 12 Pro, 13, 13 Pro, 14, 16e
  { id: "iphone-12-pro-max", w: 428, h: 926, dpr: 3 },    // 12 Pro Max, 13 Pro Max, 14 Plus
  { id: "iphone-14-pro", w: 393, h: 852, dpr: 3 },        // 14 Pro, 15, 15 Pro, 16
  { id: "iphone-14-pro-max", w: 430, h: 932, dpr: 3 },    // 14 Pro Max, 15 Plus, 15 Pro Max, 16 Plus
  { id: "iphone-16-pro", w: 402, h: 874, dpr: 3 },        // 16 Pro, 17, 17 Pro
  { id: "iphone-air", w: 420, h: 912, dpr: 3 },           // Air
  { id: "iphone-16-pro-max", w: 440, h: 956, dpr: 3 },    // 16 Pro Max, 17 Pro Max
  { id: "ipad-10-2", w: 810, h: 1080, dpr: 2, tablet: true },
  { id: "ipad-mini", w: 744, h: 1133, dpr: 2, tablet: true },
  { id: "ipad-air", w: 820, h: 1180, dpr: 2, tablet: true },     // Air 10,9", iPad 10.ª/11.ª gen
  { id: "ipad-pro-11", w: 834, h: 1194, dpr: 2, tablet: true },  // Pro 11", Air 11"
  { id: "ipad-pro-11-m4", w: 834, h: 1210, dpr: 2, tablet: true },
  { id: "ipad-pro-12-9", w: 1024, h: 1366, dpr: 2, tablet: true }, // Pro 12,9", Air 13"
  { id: "ipad-pro-13-m4", w: 1032, h: 1376, dpr: 2, tablet: true },
]

export type SplashImage = { file: string; url: string; media: string; width: number; height: number; scheme: "light" | "dark"; landscape: boolean }

/** Todas las imágenes de inicio (primero las oscuras: iOS usa la primera cuyo media coincide). */
export function splashImages(dir = "/pwa/splash"): SplashImage[] {
  const out: SplashImage[] = []
  for (const scheme of ["dark", "light"] as const) {
    for (const d of APPLE_DEVICES) {
      for (const landscape of d.tablet ? [false, true] : [false]) {
        const width = (landscape ? d.h : d.w) * d.dpr
        const height = (landscape ? d.w : d.h) * d.dpr
        const file = `${d.id}-${landscape ? "h" : "v"}-${scheme === "dark" ? "oscuro" : "claro"}.png`
        out.push({
          file, url: `${dir}/${file}`, width, height, scheme, landscape,
          media: `(device-width: ${d.w}px) and (device-height: ${d.h}px) and (-webkit-device-pixel-ratio: ${d.dpr}) and (orientation: ${landscape ? "landscape" : "portrait"}) and (prefers-color-scheme: ${scheme})`,
        })
      }
    }
  }
  return out
}
