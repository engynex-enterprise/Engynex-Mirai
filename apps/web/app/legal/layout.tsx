import Link from "next/link"
import { IsoIcon } from "@/components/mirai/iso-icon"

export default function LegalLayout({ children }: LayoutProps<"/legal">) {
  return (
    <div className="min-h-dvh">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4">
          <IsoIcon k="mirai" size={32} />
          <Link href="/" className="font-semibold">Mirai</Link>
          <nav className="ml-auto flex gap-4 text-sm">
            <Link href="/legal/terminos" className="hover:underline">Términos</Link>
            <Link href="/legal/privacidad" className="hover:underline">Privacidad</Link>
          </nav>
        </div>
      </header>
      <article className="mx-auto grid max-w-3xl gap-4 px-4 py-10 leading-relaxed [&_h1]:font-heading [&_h1]:text-3xl [&_h1]:font-semibold [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_p]:text-muted-foreground [&_li]:text-muted-foreground">
        {children}
      </article>
    </div>
  )
}
