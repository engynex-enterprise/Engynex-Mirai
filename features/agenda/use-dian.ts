"use client"

import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { useApp } from "@/components/app/app-context"
import { createClient } from "@/utils/supabase/client"
import { fechasDian, type CalendarEventIn, type RentaRegimen } from "@/lib/domain"

const NONE: CalendarEventIn[] = []

/**
 * Fechas DIAN de la persona según los dos últimos dígitos de su cédula (Perfil o Calendario fiscal), como eventos
 * virtuales del calendario (no se guardan). Vacío si no tiene dígitos o si ya agregó la renta a su calendario.
 */
export function useFechasDian(eventos: Pick<CalendarEventIn, "template_key">[] | undefined): CalendarEventIn[] {
  const { user } = useApp()
  const { data } = useQuery({
    queryKey: ["ref", "dian-auto", user.id],
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const sb = createClient()
      const { data: p } = await sb.from("profiles").select("digitos,ciudad").eq("id", user.id).maybeSingle()
      if (!/^\d{2}$/.test(p?.digitos ?? "")) return null
      const [{ data: filas }, { data: regs }] = await Promise.all([
        sb.from("ref_renta_calendar").select("year,digitos,regimen,fecha").eq("digitos", p!.digitos),
        sb.from("ref_renta_regimenes").select("key,nombre,seccionales"),
      ])
      return { digitos: p!.digitos, ciudad: p?.ciudad ?? null, filas: (filas ?? []).map((f) => ({ ...f, year: +f.year, fecha: String(f.fecha).slice(0, 10) })), regimenes: (regs ?? []) as RentaRegimen[] }
    },
  })
  return useMemo(() => (data && eventos ? fechasDian({ ...data, eventos }) : NONE), [data, eventos])
}
