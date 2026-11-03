import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { miraiAvatar } from "@/lib/content/avatars"
import { cn } from "@/lib/utils"

export const initials = (s: string) => s.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?"

/**
 * Avatar de una persona: avatar ilustrado de Mirai ("mirai:<clave>"), foto (Google o subida) o sus iniciales.
 * `square` = esquinas redondeadas como los perfiles de Netflix (selector de avatar, integrantes).
 */
export function UserAvatar({ src, name, className, square, fallbackClassName }: {
  src?: string | null; name: string; className?: string; square?: boolean; fallbackClassName?: string
}) {
  const shape = square ? "rounded-[22%]" : "rounded-full"
  const m = miraiAvatar(src)
  if (m)
    return (
      <span role="img" aria-label={`Avatar ${m.n}`} className={cn("relative inline-block size-8 shrink-0 overflow-hidden", shape, className)}>
        <svg viewBox="0 0 120 120" className="block size-full" aria-hidden dangerouslySetInnerHTML={{ __html: m.svg }} />
      </span>
    )
  return (
    <Avatar className={cn(shape, className)}>
      {src && <AvatarImage src={src} alt="" referrerPolicy="no-referrer" className={shape} />}
      <AvatarFallback className={cn("bg-brand-gradient font-bold text-white", shape, fallbackClassName)}>{initials(name)}</AvatarFallback>
    </Avatar>
  )
}
