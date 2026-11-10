import Link from "next/link"
import { IsoIcon } from "@/components/mirai/iso-icon"
import { AuthAside } from "@/components/auth/auth-aside"

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      {/* Panel de la izquierda: cambia según sea entrar, registrarse, recuperar la clave, verificar o una invitación. */}
      <AuthAside />

      <main className="flex flex-col bg-[radial-gradient(ellipse_at_top,var(--color-brand-soft),transparent_60%)] px-4 py-10 sm:px-8">
        <div className="m-auto w-full max-w-[420px]">
          <Link href="/" className="mb-8 flex w-fit items-center gap-3 lg:hidden">
            <IsoIcon k="mirai" size={40} />
            <div>
              <p className="text-lg font-semibold">Mirai</p>
              <p className="text-xs text-muted-foreground">Tu futuro financiero</p>
            </div>
          </Link>
          <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">{children}</div>
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Al usar Mirai aceptas los <Link href="/legal/terminos" className="underline-offset-2 hover:underline">Términos</Link> y la{" "}
            <Link href="/legal/privacidad" className="underline-offset-2 hover:underline">Política de datos</Link>. Hecho en Colombia.
          </p>
        </div>
      </main>
    </div>
  )
}
