/**
 * Abre una ventana que sale sola (anuncio, aviso de instalar) solo cuando no hay otra abierta: dos ventanas de Radix
 * cruzadas bloquean los clics. Reintenta unos segundos y se rinde; devuelve la función para cancelar.
 */
export function whenFree(open: () => void, delay: number) {
  let t: ReturnType<typeof setTimeout>
  let tries = 0
  const tick = () => {
    const busy = document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [data-vaul-drawer][data-state="open"]') || document.body.style.pointerEvents === "none"
    if (busy) { if (tries++ < 40) t = setTimeout(tick, 300); return }
    open()
  }
  t = setTimeout(tick, delay)
  return () => clearTimeout(t)
}
