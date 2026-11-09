import { expect, test } from "@playwright/test"
import { login, shot, watchErrors } from "./helpers"
import { QA, admin } from "./qa"

// "Salir de deudas" con deudas de verdad. El libro de QA llega vacío, así que se siembran las dos que rompían la
// pantalla antes:
//  · una tarjeta con compras a cuotas Y el pago del mes registrado: entraba con cuota $0 y el saldo sin descontar el
//    pago, la simulación llegaba al tope y se leía "600 meses" con un ahorro de billones de pesos;
//  · un crédito quincenal: cada quincena contaba como un mes, así que 20 quincenas salían como "20 meses".
const hoy = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date())
const haceMeses = (n: number) => { const [y, m, d] = hoy().split("-").map(Number); const f = new Date(y, m - 1 - n, d); return new Intl.DateTimeFormat("en-CA").format(f) }

test("salir de deudas: el plan cuadra con tarjeta pagada y crédito quincenal", async ({ page }, info) => {
  test.setTimeout(150_000)
  const errs = watchErrors(page)
  await login(page)
  const sb = admin()
  const { data } = await sb.auth.admin.listUsers({ perPage: 1000 })
  const uid = data.users.find((u) => u.email === QA.email)!.id
  const { data: hh } = await sb.from("household_members").select("household_id").eq("user_id", uid).limit(1).single()
  const { data: books } = await sb.from("books").select("id").eq("household_id", hh!.household_id).is("deleted_at", null).order("is_default", { ascending: false }).order("created_at")
  const { data: prof } = await sb.from("profiles").select("last_book_id").eq("id", uid).maybeSingle()
  const bookId = (books?.find((b) => b.id === prof?.last_book_id) ?? books?.[0])!.id

  const s = `${info.project.name} ${Date.now() % 100000}`
  const tarjeta = `Visa QA ${s}`
  const credito = `Moto QA ${s}`
  const { data: tc } = await sb.from("credit_cards").insert({ book_id: bookId, nombre: tarjeta, cupo: 8_000_000, corte: 25, pago: 10, tasa: 2.5, created_by: uid }).select("id").single()
  await sb.from("card_purchases").insert({ book_id: bookId, card_id: tc!.id, fecha: haceMeses(3), descripcion: `Nevera ${s}`, valor: 2_400_000, cuotas: 12, created_by: uid })
  // El pago de la factura de este mes: es lo que dejaba la tarjeta con cuota $0 en la simulación.
  await sb.from("card_payments").insert({ book_id: bookId, card_id: tc!.id, fecha: hoy(), valor: 230_000, tipo: "otro", created_by: uid })
  const { data: loan } = await sb.from("loans").insert({
    book_id: bookId, kind: "pagar", concepto: credito, monto: 2_000_000, sistema: "frances",
    tasa: 2, frec: "quincenal", plazo: 20, inicio: haceMeses(1), created_by: uid,
  }).select("id").single()

  try {
    await page.goto("/estrategia")
    const main = page.locator("#main")
    await expect(main.getByText("Así vas hoy")).toBeVisible({ timeout: 30_000 })

    // Nada del tope de la simulación ni cifras desbocadas (el bug daba "600 meses" y "$5.134.987.053.685").
    const texto = async () => (await main.innerText()).replace(/\s+/g, " ")
    const sinDisparates = async (donde: string) => {
      const t = await texto()
      expect(t, `${donde}: la pantalla no puede mostrar el tope de la simulación`).not.toMatch(/\b\d{3,} meses\b/)
      expect(t, `${donde}: monto fuera de rango`).not.toMatch(/\$\s?[\d.]{13,}/)
      expect(t, `${donde}: cifra inválida`).not.toMatch(/NaN|Infinity/)
    }
    // Un texto que no cabe en su tarjeta se corta con "…" y la cifra queda a medias ("$4.370.0…"): el valor del KPI
    // va en un <span class="truncate">. Aquí no se mira la foto, se mide lo que el navegador tuvo que esconder.
    // Solo los tres KPI de "Así vas hoy": en las listas de deudas el nombre SÍ se recorta a propósito.
    const KPIS = ["Debes hoy", "Pagas al mes", "Quedarías libre en"]
    const sinRecortes = async (donde: string) => {
      const sobra = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect(sobra, `${donde}: la pantalla se corre en horizontal`).toBeLessThanOrEqual(0)
      for (const label of KPIS) {
        const kpi = main.getByText(label, { exact: true }).first().locator("xpath=ancestor::div[@data-slot='card'][1]")
        const cortados = await kpi.evaluate((root: HTMLElement) =>
          [...root.querySelectorAll<HTMLElement>("*")]
            .filter((el) => el.clientWidth > 0 && el.scrollWidth - el.clientWidth > 1 && getComputedStyle(el).overflowX !== "visible")
            .map((el) => `"${(el.textContent ?? "").trim().slice(0, 40)}" (le faltan ${el.scrollWidth - el.clientWidth}px)`))
        expect(cortados, `${donde}: el KPI "${label}" muestra el texto cortado`).toEqual([])
      }
    }
    await sinDisparates("sin plata extra")
    await sinRecortes("sin plata extra")

    // Las dos deudas sembradas entran al plan (el nombre se repite en la lista y en los dos caminos: basta la primera).
    const detalle = main.locator("details", { hasText: "que estoy contando" })
    await detalle.locator("summary").click()
    await expect(detalle.getByText(tarjeta).first()).toBeVisible()
    await expect(detalle.getByText(credito).first()).toBeVisible()
    await shot(page, "estrategia", info.project.name)

    // El crédito a 20 QUINCENAS son ~10 meses: la v4 contaba cada quincena como un mes y lo mandaba a ~20.
    const fila = main.locator("li", { hasText: credito }).filter({ hasText: "la terminas en" }).first()
    const m = /la terminas en ([a-záéíóú]+) de (\d{4})/i.exec(await fila.innerText())
    expect(m, `no se pudo leer cuándo termina ${credito}`).toBeTruthy()
    const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
    const [y0, m0] = hoy().split("-").map(Number)
    const meses = (Number(m![2]) - y0) * 12 + (MESES.indexOf(m![1].toLowerCase()) - (m0 - 1))
    expect(meses, "20 quincenas son unos 10 meses, no 20").toBeLessThanOrEqual(13)
    expect(meses, "y tampoco se acaba de un mes para otro").toBeGreaterThanOrEqual(7)

    // Poner plata extra tiene que dar una fecha y un ahorro, no un tope.
    await main.getByRole("textbox", { name: "Plata extra al mes" }).fill("300000")
    await expect(main.getByText(/quedas libre de deudas en/).first()).toBeVisible({ timeout: 20_000 })
    await sinDisparates("con $300.000 extra")
    await sinRecortes("con $300.000 extra")
    // Con plata extra aparece el plan accionable, con la primera deuda por nombre propio.
    await expect(main.getByText("Tu plan, en 3 pasos")).toBeVisible()
    await shot(page, "estrategia-plan", info.project.name)
  } finally {
    if (tc?.id) {
      await sb.from("card_payments").delete().eq("card_id", tc.id)
      await sb.from("card_purchases").delete().eq("card_id", tc.id)
      await sb.from("credit_cards").delete().eq("id", tc.id)
    }
    if (loan?.id) await sb.from("loans").delete().eq("id", loan.id)
  }
  expect(errs, errs.join("\n")).toEqual([])
})
