import { IsoIcon } from "@/components/mirai/iso-icon"

const FLOAT = ["ingresos", "metas", "renta", "me-deben", "calendario", "inversiones"]

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-[linear-gradient(150deg,#1F2B4B,#253A57_55%,#2E5B33)] p-12 text-white lg:flex lg:flex-col">
        <div className="flex items-center gap-3">
          <IsoIcon k="mirai" size={44} />
          <div>
            <p className="text-xl font-semibold tracking-tight">Mirai</p>
            <p className="text-sm text-white/70">未来 · Tu futuro financiero</p>
          </div>
        </div>
        <div className="mt-auto max-w-md">
          <h1 className="font-heading text-4xl leading-tight font-semibold text-balance">
            Tus finanzas en orden, explicadas en palabras simples.
          </h1>
          <p className="mt-4 text-base text-white/75">
            Ingresos, gastos, préstamos, metas y tu declaración de renta, en un solo lugar y para toda la familia.
          </p>
        </div>
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          {FLOAT.map((k, i) => (
            <div
              key={k}
              className="absolute animate-[float_6s_ease-in-out_infinite] opacity-90 drop-shadow-xl motion-reduce:animate-none"
              style={{ top: `${12 + ((i * 13) % 55)}%`, right: `${8 + ((i * 17) % 38)}%`, animationDelay: `${i * 0.7}s` }}
            >
              <IsoIcon k={k} size={56 + (i % 3) * 14} />
            </div>
          ))}
        </div>
      </aside>
      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-[420px]">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <IsoIcon k="mirai" size={40} />
            <div>
              <p className="text-lg font-semibold">Mirai</p>
              <p className="text-xs text-muted-foreground">Tu futuro financiero</p>
            </div>
          </div>
          {children}
        </div>
      </main>
    </div>
  )
}
