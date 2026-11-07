"use client"

import { useQuery } from "@/lib/query"
import { Panel } from "@/components/mirai/panel"
import { IsoIcon } from "@/components/mirai/iso-icon"
import { RentaView } from "@/features/renta/renta-view"
import type { RentaData } from "@/features/renta/data"
import type { Share } from "./actions"
import { contadorFileUrl, contadorNote, contadorNotes } from "./portal-actions"
import { NotesThread } from "./notes"

/** Portal del contador: la renta en solo lectura con datos en vivo y notas con el titular. */
export function ContadorPortal({ token, share, data }: { token: string; share: Share; data: RentaData }) {
  const notes = useQuery({ queryKey: ["contador-notes", token], queryFn: () => contadorNotes(token), refetchInterval: 15_000 })
  const first = share.owner.split(" ")[0]
  return (
    <div className="grid gap-6">
      <header className="flex items-center gap-3"><IsoIcon k="mirai" size={36} /><div className="min-w-0"><p className="font-semibold">Mirai · Portal del contador</p><p className="text-sm text-muted-foreground">Hola, {share.label}. Esta es la información de {share.owner}.</p></div></header>
      <RentaView data={data} actions={null} fileUrl={(p) => contadorFileUrl(token, p)} contador={{ label: share.label, owner: share.owner, exp: share.expires_at }} exportName={first.toLowerCase()} />
      <Panel id="notas" title={`Notas con ${first}`} icon="message-circle" description="Pide documentos, aclara dudas o avisa cuando la declaración esté lista.">
        <NotesThread notes={notes.data ?? []} me="contador" other={first} onSend={async (t) => { await contadorNote(token, t); await notes.refetch() }} />
      </Panel>
    </div>
  )
}
