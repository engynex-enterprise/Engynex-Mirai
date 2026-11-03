"use client"

import { Check, Minus } from "lucide-react"
import { ChoiceCards } from "@/components/mirai/choice-cards"
import { Icon } from "@/components/mirai/icon"
import { StatusPill } from "@/components/mirai/status-pill"
import { Button } from "@/components/ui/button"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useCan } from "@/components/app/app-context"
import { ACCESS_ROLES, deniedMsg, ROLE_INFO, ROLE_MATRIX, type AccessRole, type Perm } from "@/lib/household/roles"
import { cn } from "@/lib/utils"

/** Selector de rol con la explicación en palabras de qué puede hacer cada uno. */
export function RolePicker({ value, onChange, roles, name = "rol" }: { value: AccessRole; onChange: (r: AccessRole) => void; roles: AccessRole[]; name?: string }) {
  return (
    <ChoiceCards name={name} value={value} onChange={(v) => onChange(v as AccessRole)} cols={2}
      items={roles.map((r) => ({ value: r, label: ROLE_INFO[r].label, desc: `${ROLE_INFO[r].desc} Ideal para: ${ROLE_INFO[r].ideal.toLowerCase()}.`, icon: ROLE_INFO[r].icon, recommended: r === "editor" }))} />
  )
}

export function RolePill({ role, className }: { role: AccessRole; className?: string }) {
  return (
    <StatusPill tone={role === "owner" ? "estimado" : role === "admin" ? "info" : "gray"} className={className} title={ROLE_INFO[role].desc}>
      <Icon name={ROLE_INFO[role].icon} className="size-3" /> {ROLE_INFO[role].label}
    </StatusPill>
  )
}

/** Tabla "¿Qué puede hacer cada rol?". En celular, una tarjeta por rol. */
export function RoleMatrix({ highlight }: { highlight?: AccessRole }) {
  return (
    <div className="grid gap-3">
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2 pr-3 font-medium text-muted-foreground">Puede…</th>
              {ACCESS_ROLES.map((r) => (
                <th key={r} scope="col" className={cn("px-2 py-2 text-center font-semibold", highlight === r && "rounded-t-lg bg-brand-soft")}>
                  <span className="grid justify-items-center gap-1"><Icon name={ROLE_INFO[r].icon} className="size-4 text-brand" />{ROLE_INFO[r].label}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROLE_MATRIX.map((row) => (
              <tr key={row.perm} className="border-b last:border-0">
                <th scope="row" className="py-2 pr-3 text-left font-normal">{row.label}</th>
                {ACCESS_ROLES.map((r) => (
                  <td key={r} className={cn("px-2 py-2 text-center", highlight === r && "bg-brand-soft")}>
                    {row.roles[r] ? <Check className="mx-auto size-4 text-success" aria-label="Sí" /> : <Minus className="mx-auto size-4 text-muted-foreground/60" aria-label="No" />}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-2 md:hidden">
        {ACCESS_ROLES.map((r) => (
          <div key={r} className={cn("rounded-lg bg-secondary/60 p-3", highlight === r && "ring-2 ring-brand")}>
            <p className="flex items-center gap-2 font-semibold"><Icon name={ROLE_INFO[r].icon} className="size-4 text-brand" />{ROLE_INFO[r].label}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{ROLE_INFO[r].desc}</p>
            <ul className="mt-2 grid gap-1 text-sm">
              {ROLE_MATRIX.filter((x) => x.roles[r]).map((x) => <li key={x.perm} className="flex gap-1.5"><Check className="mt-0.5 size-4 shrink-0 text-success" />{x.label}</li>)}
            </ul>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Pronto: <b>Ve solo lo suyo</b>, para que alguien vea y registre solo lo que le corresponde.</p>
    </div>
  )
}

/** Botón que se desactiva si el rol no tiene el permiso, con el motivo en un tooltip. */
export function PermButton({ perm, children, ...props }: { perm: Perm } & React.ComponentProps<typeof Button>) {
  const ok = useCan(perm)
  if (ok) return <Button {...props}>{children}</Button>
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" aria-label={deniedMsg(perm)}>
          <Button {...props} disabled aria-disabled>{children}</Button>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{deniedMsg(perm)}</TooltipContent>
    </Tooltip>
  )
}

/** Confirmación (cambiar un rol, sacar a alguien, cancelar o pasar el hogar). */
export function Confirm({ open, onOpenChange, title, desc, action, danger, onConfirm }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; desc: React.ReactNode; action: string; danger?: boolean; onConfirm: () => void
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>{title}</AlertDialogTitle><AlertDialogDescription>{desc}</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction className={danger ? "bg-danger text-white hover:bg-danger/90" : undefined} onClick={onConfirm}>{action}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
