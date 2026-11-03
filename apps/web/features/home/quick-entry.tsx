"use client"

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Sparkles } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { Spinner } from "@/components/ui/spinner"
import { UserAvatar } from "@/components/mirai/user-avatar"
import { useApp, useCanRecord } from "@/components/app/app-context"
import { invalidateBook, useList } from "@/hooks/use-book-data"
import { createClient } from "@/utils/supabase/client"
import { localCat, localHormiga } from "@/lib/domain"
import { fmtMoney } from "@/lib/format"
import { parseEntry } from "./parse-entry"
import { classifyExpenses, parseNL } from "@/features/ai/api"
import { useCategories, useKeywordRules, usePaymentMethods, useSettings } from "@/features/catalogs/hooks"
import { medioEnTexto } from "@/lib/chat/acciones"

/** Compositor de Inicio: escribe lo que pasó y queda registrado. */
export function QuickEntry() {
  const { user, book } = useApp()
  // "Solo mira" no registra: la entrada rápida no se muestra (antes solo la frenaba la RLS con un error).
  const canRecord = useCanRecord()
  const qc = useQueryClient()
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)
  const { data: cats = [] } = useCategories()
  const { data: rules = [] } = useKeywordRules()
  const { data: cfg } = useSettings()
  const { data: methods = [] } = usePaymentMethods()
  const { data: history = [] } = useList("expenses", { order: { column: "created_at" } })
  const first = user.apodo || user.nombre.split(" ")[0]

  const submit = async () => {
    setBusy(true)
    let p: (NonNullable<ReturnType<typeof parseEntry>> & { category_id?: string | null }) | null = parseEntry(text)
    if (!p) {
      // Si las reglas no entienden la frase, la IA lo intenta (EXTRA_FORM.nl de la v4).
      const r = await parseNL(text)
      if (r.ok) p = { tipo: r.tipo!, valor: r.valor!, descripcion: r.descripcion!, fecha: r.fecha!, category_id: r.category_id }
    }
    if (!p) { setBusy(false); return toast.error("No entendí el valor", { description: "Escribe algo como “gasté 15 mil en almuerzo ayer”." }) }
    const sb = createClient()
    // "…por Nequi", "en efectivo": el medio del catálogo que nombra la frase (mueve la cuenta ligada a ese medio).
    const payment_method_id = medioEnTexto(text, methods)?.id ?? null
    if (p.tipo === "ingreso") {
      const { data, error } = await sb.from("extra_incomes").insert({ book_id: book.id, fecha: p.fecha, descripcion: p.descripcion, valor: p.valor, payment_method_id }).select("id").single()
      setBusy(false)
      if (error) return toast.error("No se pudo registrar", { description: error.message })
      toast.success("Ingreso registrado", { description: `${p.descripcion}: ${fmtMoney(p.valor)}`, action: { label: "Deshacer", onClick: () => sb.from("extra_incomes").update({ deleted_at: new Date().toISOString() }).eq("id", data.id).then(() => invalidateBook(qc, book.id, "extra_incomes")) } })
      invalidateBook(qc, book.id, "extra_incomes")
    } else {
      let cat: { category_id: string; src: string } | null = localCat(p.descripcion, { rules, expenses: history, categories: cats })
      // Si las reglas no están seguras (nada o solo palabras clave), la IA decide la categoría (como el formulario).
      if (!cat || cat.src === "palabras") {
        const t = p.descripcion.trim().toLowerCase()
        const ai = await classifyExpenses([{ i: 0, descripcion: p.descripcion, valor: p.valor, veces_mes: history.filter((g) => (g.descripcion ?? "").trim().toLowerCase() === t).length }]).catch(() => null)
        const hit = ai?.[0]
        if (hit?.category_id) cat = { category_id: hit.category_id, src: hit.src === "ia" ? "ia" : cat?.src ?? "regla" }
      }
      const category_id = cat?.category_id ?? p.category_id ?? cats.find((c) => c.nombre === "Otros")?.id ?? null
      const { data, error } = await sb.from("expenses").insert({ book_id: book.id, fecha: p.fecha, descripcion: p.descripcion, valor: p.valor, category_id, cat_src: cat?.src ?? (p.category_id ? "ia" : null), origen: "voz", hormiga: false, payment_method_id }).select("id").single()
      setBusy(false)
      if (error) return toast.error("No se pudo registrar", { description: error.message })
      const h = localHormiga({ descripcion: p.descripcion, valor: p.valor, category_id, fixed_expense_id: null } as never, cats, Number(cfg?.umbral ?? 25000))
      toast.success(h ? "Gasto hormiga registrado" : "Gasto registrado", {
        description: `${p.descripcion}: ${fmtMoney(p.valor)} · ${cats.find((c) => c.id === category_id)?.nombre ?? "Otros"}`,
        action: { label: "Deshacer", onClick: () => sb.from("expenses").update({ deleted_at: new Date().toISOString() }).eq("id", data.id).then(() => invalidateBook(qc, book.id, "expenses")) },
      })
      invalidateBook(qc, book.id, "expenses")
    }
    setText("")
  }

  if (!canRecord) return null
  return (
    <div className="grid gap-2">
      <form data-tour="quick" className="flex items-center gap-3" onSubmit={(e) => { e.preventDefault(); if (text.trim()) submit() }}>
        <UserAvatar src={user.avatar} name={user.nombre} className="size-10" fallbackClassName="text-sm" />
        <InputGroup className="h-11 rounded-full border-0 bg-secondary transition-colors hover:bg-secondary-hover has-[input:focus]:bg-card has-[input:focus]:ring-2 has-[input:focus]:ring-ring/30">
          <InputGroupInput aria-label="Escribe lo que pasó" value={text} onChange={(e) => setText(e.target.value)} placeholder={`¿Qué gastaste hoy, ${first}?`} className="pl-4 text-[16px] placeholder:text-muted-foreground" />
          <InputGroupAddon align="inline-end">
            <InputGroupButton type="submit" className="bg-brand-gradient rounded-full px-4 font-semibold text-white hover:text-white hover:brightness-105 disabled:opacity-60" disabled={busy || !text.trim()}>
              {busy ? <Spinner /> : <Sparkles />}<span className="max-sm:sr-only">Registrar</span>
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </form>
      <p className="pl-[3.25rem] text-xs text-muted-foreground">Escríbelo como lo dirías: “gasté 15 mil en almuerzo ayer”, “pagué 120 mil de la luz” o “me pagaron 300 mil”.</p>
    </div>
  )
}
