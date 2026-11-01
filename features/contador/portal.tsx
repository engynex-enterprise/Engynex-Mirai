"use client"

import { useQuery } from "@tanstack/react-query"
import { Card } from "@/components/ui/card"
import { IsoIcon } from "@/components/mirai/iso-icon"
import { RentaView } from "@/features/renta/renta-view"
import type { RentaData } from "@/features/renta/data"
import { contadorFileUrl, contadorNote, contadorNotes, type Share } from "./actions"
import { NotesThread } from "./notes"

/** Portal del contador: la renta en solo lectura con datos en vivo y notas con el titular. */
export function ContadorPortal({ token, share, data }: { token: string; share: Share; data: RentaData }) {
  const notes = useQuery({ queryKey: ["contador-notes", token], queryFn: () => contadorNotes(token), refetchInterval: 15_000 })
  const first = share.owner.split(" ")[0]
  return (
    <div className="grid gap-6">
      <header className="flex items-center gap-3"><IsoIcon k="mirai" size={36} /><div><p className="font-semibold">Mirai · Portal del contador</p><p className="text-sm text-muted-foreground">Hola, {share.label}. Esta es la información de {share.owner}.</p></div></header>
      <RentaView data={data} actions={null} fileUrl={(p) => contadorFileUrl(token, p)} contador={{ label: share.label, owner: share.owner, exp: share.expires_at }} exportName={first.toLowerCase()} />
      <Card className="gap-3 p-5 shadow-card ring-0" id="notas">
        <h2 className="font-semibold">Notas con {first}</h2>
        <p className="text-sm text-muted-foreground">Pide documentos, aclara dudas o avisa cuando la declaración esté lista.</p>
        <NotesThread notes={notes.data ?? []} me="contador" other={first} onSend={async (t) => { await contadorNote(token, t); await notes.refetch() }} />
      </Card>
    </div>
  )
}
