// Emblema de insignia (badgeSvg de la v4): marco por nivel, gema de color, ícono, cinta y estrellas.
import { Lock } from "lucide-react"
import { Icon } from "@/components/mirai/icon"
import type { Tier } from "@/lib/domain"
import { cn } from "@/lib/utils"

const GEMC: Record<string, number> = { perfil: 0, gasto1: 1, gasto50: 1, gasto200: 1, ingreso: 2, fijos: 3, presu: 4, meta: 5, metaok: 5, fondo: 2, puntual: 3, libre: 2, hormiga: 6, reto: 5, racha7: 7, racha30: 7, inversor: 2, consejo: 4 }
const GEMS = [["#8FB6FF", "#3B6FD8", "#1E3F8F"], ["#FFB3C1", "#F0506E", "#A51E43"], ["#A8F0C6", "#2FBF71", "#137447"], ["#FFE08A", "#F5A524", "#B4650A"], ["#D7C2FF", "#8B5CF6", "#5B2BB5"], ["#A8F0FF", "#2CC7EA", "#117FA8"], ["#C9F59A", "#7CC242", "#3F7A1E"], ["#FFC59E", "#FF7A2F", "#C2410C"]]
const GMET: Record<Tier, string[]> = { b: ["#F6C9A0", "#C98552", "#8A4B22", "#5E2F12"], s: ["#FFFFFF", "#D5DCE6", "#8A97A8", "#5B6676"], g: ["#FFF4C2", "#FFD24A", "#D99A06", "#8A5A00"] }

const poly = (n: number, r1: number, r2 = 0, cx = 60, cy = 56, rot = -90) => {
  const k = n * (r2 ? 2 : 1), p: string[] = []
  for (let i = 0; i < k; i++) { const r = r2 && i % 2 ? r2 : r1, a = ((rot + (i * 360) / k) * Math.PI) / 180; p.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`) }
  return p.join(" ")
}
const Star = ({ x, y, r }: { x: number; y: number; r: number }) => <polygon points={poly(5, r, r * 0.45, x, y)} fill="#FFF7D6" stroke="#8A5A00" strokeWidth={0.8} strokeLinejoin="round" />

export function BadgeArt({ id, tier, icon, locked, size = 84 }: { id: string; tier: Tier; icon: string; locked?: boolean; size?: number }) {
  const e = GEMC[id] ?? 0, M = GMET[tier], G = GEMS[e], u = `${id}-${tier}`
  const met = `url(#m-${u})`, rim = `url(#r-${u})`
  return (
    <span className={cn("relative inline-block", locked && "opacity-45 grayscale")} style={{ width: size, height: size * 1.1 }}>
      <svg viewBox="0 0 120 132" width={size} height={size * 1.1} aria-hidden>
        <defs>
          <linearGradient id={`m-${u}`} x1="0.15" y1="0" x2="0.85" y2="1"><stop offset="0" stopColor={M[0]} /><stop offset=".45" stopColor={M[1]} /><stop offset="1" stopColor={M[2]} /></linearGradient>
          <linearGradient id={`r-${u}`} x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor={M[3]} /><stop offset="1" stopColor={M[1]} /></linearGradient>
          <radialGradient id={`g-${u}`} cx=".35" cy=".3" r=".85"><stop offset="0" stopColor={G[0]} /><stop offset=".55" stopColor={G[1]} /><stop offset="1" stopColor={G[2]} /></radialGradient>
          <linearGradient id={`c-${u}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={G[1]} /><stop offset="1" stopColor={G[2]} /></linearGradient>
          <linearGradient id={`s-${u}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".75" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
          <filter id={`d-${u}`} x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#0F172A" floodOpacity=".28" /></filter>
        </defs>
        <g filter={`url(#d-${u})`}>
          <path d="M38 84L28 124L42 116L50 128L60 92Z" fill={`url(#c-${u})`} /><path d="M82 84L92 124L78 116L70 128L60 92Z" fill={`url(#c-${u})`} />
          {tier === "g" && Array.from({ length: 7 }).map((_, i) => {
            const a = ((200 + i * 20) * Math.PI) / 180, a2 = ((-20 - i * 20) * Math.PI) / 180
            const x1 = 60 + 52 * Math.cos(a), y1 = 58 + 52 * Math.sin(a), x2 = 60 + 52 * Math.cos(a2), y2 = 58 + 52 * Math.sin(a2)
            return <g key={i}><ellipse cx={x1} cy={y1} rx={7} ry={3.4} transform={`rotate(${290 + i * 20} ${x1} ${y1})`} fill="#7CC242" /><ellipse cx={x2} cy={y2} rx={7} ry={3.4} transform={`rotate(${70 - i * 20} ${x2} ${y2})`} fill="#3F7A1E" /></g>
          })}
          {tier === "g" ? <polygon points={poly(16, 49, 43)} fill={met} stroke={rim} strokeWidth={2} strokeLinejoin="round" />
            : tier === "s" ? <><polygon points={poly(6, 49)} fill={met} stroke={rim} strokeWidth={2.5} strokeLinejoin="round" /><polygon points={poly(6, 42)} fill="none" stroke="#fff" strokeOpacity={0.55} strokeWidth={1.5} /></>
            : <><circle cx={60} cy={56} r={47} fill={met} stroke={rim} strokeWidth={2.5} /><circle cx={60} cy={56} r={41} fill="none" stroke="#fff" strokeOpacity={0.45} strokeWidth={1.5} strokeDasharray="2 4" /></>}
          <circle cx={60} cy={56} r={33} fill={`url(#g-${u})`} /><circle cx={60} cy={56} r={33} fill="none" stroke={rim} strokeWidth={2.5} />
          <path d="M32 50A28 26 0 0 1 88 50Q60 40 32 50Z" fill={`url(#s-${u})`} opacity={0.7} />
          <path d="M42 94H78L74 104L78 112H42L46 104Z" fill={met} stroke={rim} strokeWidth={1.5} strokeLinejoin="round" />
          {tier === "g" ? <><Star x={46} y={100} r={5} /><Star x={60} y={103} r={6} /><Star x={74} y={100} r={5} /></> : tier === "s" ? <><Star x={53} y={101} r={5} /><Star x={67} y={101} r={5} /></> : <Star x={60} y={102} r={5.5} />}
        </g>
      </svg>
      <span className="absolute grid place-items-center text-white drop-shadow" style={{ left: size * 0.33, top: size * 0.33, width: size * 0.34, height: size * 0.34 }}><Icon name={icon} style={{ width: size * 0.3, height: size * 0.3 }} strokeWidth={2.2} /></span>
      {locked && <span className="absolute top-0 right-0 grid size-6 place-items-center rounded-full bg-card text-muted-foreground shadow"><Lock className="size-3.5" /></span>}
    </span>
  )
}
