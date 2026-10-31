"use client"

import { Info } from "lucide-react"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { fieldHelp } from "@/lib/content/help"
import { cn } from "@/lib/utils"

/** Ícono (i) con la ayuda del campo (FHELP de la v4). */
export function InfoTip({ text, label }: { text: string; label?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="inline-grid size-5 place-items-center rounded-full text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" aria-label={`Ayuda${label ? `: ${label}` : ""}`}>
          <Info className="size-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-72 bg-navy text-white">{text}</TooltipContent>
    </Tooltip>
  )
}

/**
 * Campo de formulario Mirai: etiqueta + (i) ayuda automática por etiqueta + control + pista + error.
 * Equivale a field(label, control, {tip, hint}) de la v4.
 */
export function FormField({
  label, htmlFor, tip, hint, error, required, className, children, orientation,
}: {
  label: string; htmlFor?: string; tip?: string | false; hint?: React.ReactNode; error?: string; required?: boolean
  className?: string; children: React.ReactNode; orientation?: "vertical" | "horizontal"
}) {
  const help = tip === false ? undefined : (tip ?? fieldHelp(label))
  return (
    <Field data-invalid={!!error} className={className} orientation={orientation}>
      <div className="flex items-center gap-1.5">
        <FieldLabel htmlFor={htmlFor}>{label}{required && <span className="text-danger" aria-hidden> *</span>}</FieldLabel>
        {help && <InfoTip text={help} label={label} />}
      </div>
      {children}
      {hint && <FieldDescription className={cn("text-[12.5px]")}>{hint}</FieldDescription>}
      {error && <FieldError>{error}</FieldError>}
    </Field>
  )
}
