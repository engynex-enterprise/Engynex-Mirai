"use client"

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Sparkles } from "lucide-react"
import { toast } from "sonner"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { Spinner } from "@/components/ui/spinner"
import { initials } from "@/components/app/app-sidebar"
import { useApp } from "@/components/app/app-context"
import { invalidateBook, useList } from "@/hooks/use-book-data"
import { createClient } from "@/utils/supabase/client"
import { localCat, localHormiga } from "@/lib/domain"
import { fmtMoney } from "@/lib/format"
import { parseEntry } from "./parse-entry"
import { useCategories, useKeywordRules, useSettings } from "@/features/catalogs/hooks"

/** Compositor de Inicio: escribe lo que pasó y queda registrado. */
export function QuickEntry() {
  const { user, book } = useApp()
  const qc = useQueryClient()
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)
  const { data: cats = [] } = useCategories()
  const { data: rules = [] } = useKeywordRules()
  const { data: cfg } = useSettings()
  const { data: history = [] } = useList("expenses", { order: { column: "created_at" } })
  const first = user.nombre.split(" ")[0]

  const submit = async () => {
    const p = parseEntry(text)
    if (!p) return toast.error("No entendí el valor", { description: "Escribe algo como “gasté 15 mil en almuerzo ayer”." })
    setBusy(true)
    const sb = createClient()
    if (p.tipo === "ingreso") {
      const { data, error } = await sb.from("extra_incomes").insert({ book_id: book.id, fecha: p.fecha, descripcion: p.descripcion, valor: p.valor }).select("id").single()
      setBusy(false)
      if (error) return toast.error("No se pudo registrar", { description: error.message })
      toast.success("Ingreso registrado", { description: `${p.descripcion}: ${fmtMoney(p.valor)}`, action: { label: "Deshacer", onClick: () => sb.from("extra_incomes").update({ deleted_at: new Date().toISOString() }).eq("id", data.id).then(() => invalidateBook(qc, book.id, "extra_incomes")) } })
      invalidateBook(qc, book.id, "extra_incomes")
    } else {
      const cat = localCat(p.descripcion, { rules, expenses: history, categories: cats })
      const category_id = cat?.category_id ?? cats.find((c) => c.nombre === "Otros")?.id ?? null
      const { data, error } = await sb.from("expenses").insert({ book_id: book.id, fecha: p.fecha, descripcion: p.descripcion, valor: p.valor, category_id, cat_src: cat?.src ?? null, origen: "voz", hormiga: false }).select("id").single()
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

  return (
    <div className="grid gap-2">
      <form data-tour="quick" className="flex items-center gap-3" onSubmit={(e) => { e.preventDefault(); if (text.trim()) submit() }}>
        <Avatar className="hidden size-10 sm:flex"><AvatarFallback className="bg-brand-gradient text-sm text-white">{initials(user.nombre)}</AvatarFallback></Avatar>
        <InputGroup className="h-12 rounded-full bg-card">
          <InputGroupInput aria-label="Escribe lo que pasó" value={text} onChange={(e) => setText(e.target.value)} placeholder={`Escribe lo que pasó, ${first}: “gasté 15 mil en almuerzo ayer”`} className="pl-4" />
          <InputGroupAddon align="inline-end">
            <InputGroupButton type="submit" className="bg-ai-gradient rounded-full px-4 text-white hover:text-white hover:opacity-90" disabled={busy || !text.trim()}>
              {busy ? <Spinner /> : <Sparkles />} Registrar
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </form>
      <p className="pl-1 text-xs text-muted-foreground sm:pl-14">Mirai entiende frases como “pagué 120 mil de la luz” o “me pagaron 300 mil por un trabajo”.</p>
    </div>
  )
}
