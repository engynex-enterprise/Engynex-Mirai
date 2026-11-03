import { Suspense } from "react"
import { AutomationEditor, EditorSkeleton } from "@/features/automations/editor/automation-editor"

export const metadata = { title: "Editor de automatización" }

/** Editor visual de una automatización (los params se leen dentro de Suspense, Next 16). */
export default function Page({ params }: PageProps<"/automatizaciones/[id]">) {
  return (
    <Suspense fallback={<EditorSkeleton />}>
      <Editor params={params} />
    </Suspense>
  )
}

async function Editor({ params }: { params: PageProps<"/automatizaciones/[id]">["params"] }) {
  const { id } = await params
  return <AutomationEditor id={id} />
}
