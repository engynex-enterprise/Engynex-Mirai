"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { Sparkles } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { loadSampleBook } from "@/features/import/actions"

/** Carga los datos de ejemplo de la v4 en un libro aparte y cambia a él. */
export function SampleButton() {
  const [pending, start] = useTransition()
  const router = useRouter()
  const qc = useQueryClient()
  return (
    <Button variant="soft" disabled={pending} onClick={() => start(async () => {
      try {
        await loadSampleBook()
        qc.clear()
        toast.success("Datos de ejemplo cargados", { description: "Estás en el libro “Ejemplo · familia Navarro”. Cambia de libro desde el menú cuando quieras." })
        router.push("/inicio")
        router.refresh()
      } catch (e) { toast.error("No se pudo cargar el ejemplo", { description: (e as Error).message }) }
    })}>
      {pending ? <Spinner /> : <Sparkles />} Ver un ejemplo
    </Button>
  )
}
