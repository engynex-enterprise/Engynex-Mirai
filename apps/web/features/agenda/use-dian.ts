"use client"

import { useMemo } from "react"
import { useQuery } from "@/lib/query"
import { useApp } from "@/components/app/app-context"
import { fetchProfile } from "@/features/profile/api"
import { fetchRentaCalendar, fetchRentaRegimenes } from "@/lib/ref-data"
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
    // Perfil por /v1/me/profile y calendario DIAN por /v1/refs/*.
    queryFn: async () => {
      const p = await fetchProfile(user.id).catch(() => null)
      if (!/^\d{2}$/.test(p?.digitos ?? "")) return null
      const [filas, regs] = await Promise.all([fetchRentaCalendar(p!.digitos), fetchRentaRegimenes()])
      return { digitos: p!.digitos, ciudad: p?.ciudad ?? null, filas, regimenes: regs.map(({ key, nombre, seccionales }) => ({ key, nombre, seccionales })) as RentaRegimen[] }
    },
  })
  return useMemo(() => (data && eventos ? fechasDian({ ...data, eventos }) : NONE), [data, eventos])
}
