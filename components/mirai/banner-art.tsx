import { isoMarkup } from "./iso-icon"
import type { BannerMotif, BannerTheme } from "@/lib/content/banners"
import { cn } from "@/lib/utils"

// Escena vectorial del banner de cada módulo (viewBox 400 × 240): mancha de color, tarjeta de vidrio con un motivo
// relacionado con la sección y el isotipo del módulo encima. Mismo lenguaje de los isotipos: formas suaves, degradados
// de una familia, sin sombras exteriores ni glow. Vidrio y líneas cambian con el tema (clases fill-*).

const GLASS = "fill-white/90 dark:fill-white/10"
const LINE = "fill-[#1C2B33]/10 dark:fill-white/15"
const STROKE = "stroke-[#1C2B33]/12 dark:stroke-white/15"

const star = (x: number, y: number, r: number) =>
  `M${x} ${y - r}Q${x + r * 0.18} ${y - r * 0.18} ${x + r} ${y}Q${x + r * 0.18} ${y + r * 0.18} ${x} ${y + r}Q${x - r * 0.18} ${y + r * 0.18} ${x - r} ${y}Q${x - r * 0.18} ${y - r * 0.18} ${x} ${y - r}Z`

function Motif({ m, t, id }: { m: BannerMotif; t: BannerTheme; id: string }) {
  const grad = `url(#bn-${id}-ab)`
  switch (m) {
    case "coins":
      return (
        <>
          <rect x="150" y="34" width="210" height="156" rx="20" className={GLASS} />
          <rect x="172" y="54" width="74" height="9" rx="4.5" className={LINE} />
          <rect x="172" y="70" width="44" height="7" rx="3.5" className={LINE} />
          {[[186, 44, t.c], [218, 64, t.b], [250, 54, t.b], [282, 86, grad]].map(([x, h, f], i) => (
            <rect key={i} x={x as number} y={170 - (h as number)} width="22" height={h as number} rx="7" fill={f as string} />
          ))}
          <path d="M197 118L229 98L261 108L293 76L330 62" fill="none" stroke={t.a} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="330" cy="62" r="8" fill="#fff" stroke={t.a} strokeWidth="4" />
          {[0, 1, 2].map((i) => <ellipse key={i} cx="350" cy={206 - i * 12} rx="30" ry="11" fill={i === 2 ? "#FFD15C" : "#E8A814"} />)}
          <ellipse cx="350" cy="182" rx="18" ry="5.5" fill="none" stroke="#FFF3C4" strokeWidth="3" />
        </>
      )
    case "receipt":
      return (
        <>
          <path d="M186 28H322Q334 28 334 40V196L320 186L306 196L292 186L278 196L264 186L250 196L236 186L222 196L208 186L194 196L186 190Z" className={GLASS} />
          {[56, 78, 100, 122].map((y, i) => (
            <g key={y}><rect x="204" y={y} width={[70, 54, 80, 46][i]} height="9" rx="4.5" className={LINE} /><rect x={292} y={y} width="26" height="9" rx="4.5" className={LINE} /></g>
          ))}
          <path d="M204 146H318" className={STROKE} strokeWidth="3" strokeDasharray="6 6" fill="none" />
          <rect x="204" y="158" width="40" height="11" rx="5.5" className={LINE} />
          <rect x="268" y="156" width="50" height="15" rx="7.5" fill={grad} />
          <circle cx="344" cy="58" r="22" fill="#FFC83D" /><circle cx="344" cy="58" r="13" fill="none" stroke="#FFF3C4" strokeWidth="4" />
        </>
      )
    case "card":
      return (
        <>
          <rect x="196" y="40" width="172" height="108" rx="16" fill={t.c} transform="rotate(-9 282 94)" />
          <rect x="166" y="72" width="184" height="114" rx="16" fill={grad} />
          <rect x="166" y="72" width="184" height="114" rx="16" fill="url(#iso-hl)" />
          <rect x="186" y="98" width="34" height="26" rx="6" fill="#FFE3A0" />
          <path d="M186 111H220M203 98V124" stroke="#E8A814" strokeWidth="2" />
          <rect x="186" y="144" width="96" height="9" rx="4.5" fill="#fff" opacity=".75" />
          <rect x="186" y="162" width="54" height="8" rx="4" fill="#fff" opacity=".5" />
          <circle cx="314" cy="160" r="13" fill="#fff" opacity=".7" /><circle cx="330" cy="160" r="13" fill="#fff" opacity=".4" />
        </>
      )
    case "people":
      return (
        <>
          <rect x="150" y="34" width="210" height="156" rx="20" className={GLASS} />
          <path d="M206 96Q256 54 312 96" fill="none" className={STROKE} strokeWidth="3" strokeDasharray="5 7" />
          {[[204, 98, t.c, t.b], [258, 82, t.b, t.a], [312, 98, t.c, t.b]].map(([x, y, f1, f2], i) => (
            <g key={i}>
              <circle cx={x as number} cy={y as number} r="17" fill={f2 as string} />
              <path d={`M${(x as number) - 26} ${(y as number) + 48}Q${x} ${(y as number) + 4} ${(x as number) + 26} ${(y as number) + 48}Z`} fill={f1 as string} />
            </g>
          ))}
          <rect x="172" y="156" width="166" height="10" rx="5" className={LINE} />
          <circle cx="352" cy="190" r="20" fill="#FFC83D" /><circle cx="352" cy="190" r="12" fill="none" stroke="#FFF3C4" strokeWidth="4" />
        </>
      )
    case "up":
    case "down": {
      const pts = m === "up" ? [[172, 160], [204, 138], [236, 146], [268, 110], [300, 118], [336, 76]] : [[172, 80], [204, 98], [236, 92], [268, 126], [300, 120], [336, 158]]
      const line = pts.map((p) => p.join(" ")).join("L")
      const last = pts[pts.length - 1]
      return (
        <>
          <rect x="150" y="34" width="210" height="156" rx="20" className={GLASS} />
          {[70, 110, 150].map((y) => <rect key={y} x="172" y={y} width="166" height="2" rx="1" className={LINE} />)}
          <path d={`M${line}L336 172L172 172Z`} fill={`url(#bn-${id}-area)`} />
          <path d={`M${line}`} fill="none" stroke={t.a} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={last[0]} cy={last[1]} r="9" fill="#fff" stroke={t.a} strokeWidth="4.5" />
          <rect x="172" y="48" width="60" height="9" rx="4.5" className={LINE} />
        </>
      )
    }
    case "pie": {
      const C = 2 * Math.PI * 38
      const seg = [[0.5, t.a], [0.3, t.b], [0.2, t.c]] as const
      let off = 0
      return (
        <>
          <rect x="150" y="34" width="210" height="156" rx="20" className={GLASS} />
          <g transform="rotate(-90 222 112)">
            {seg.map(([p, c], i) => {
              const el = <circle key={i} cx="222" cy="112" r="38" fill="none" stroke={c} strokeWidth="22" strokeDasharray={`${p * C - 3} ${C}`} strokeDashoffset={-off} />
              off += p * C
              return el
            })}
          </g>
          {seg.map(([, c], i) => (
            <g key={i}><circle cx="290" cy={84 + i * 28} r="7" fill={c} /><rect x="304" y={80 + i * 28} width={[40, 32, 26][i]} height="8" rx="4" className={LINE} /></g>
          ))}
        </>
      )
    }
    case "calendar":
      return (
        <>
          <rect x="150" y="34" width="210" height="156" rx="20" className={GLASS} />
          <path d="M150 54Q150 34 170 34H340Q360 34 360 54V70H150Z" fill={grad} />
          <rect x="190" y="24" width="10" height="24" rx="5" fill={t.a} /><rect x="310" y="24" width="10" height="24" rx="5" fill={t.a} />
          {Array.from({ length: 15 }).map((_, i) => {
            const x = 168 + (i % 5) * 37, y = 84 + Math.floor(i / 5) * 32
            const on = i === 7, soft = i === 3 || i === 11
            return <rect key={i} x={x} y={y} width="28" height="24" rx="7" fill={on ? t.b : soft ? t.c : undefined} className={on || soft ? undefined : LINE} />
          })}
          <path d="M248 128L254 134L265 122" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )
    case "doc":
      return (
        <>
          <path d="M184 30H296L334 68V188Q334 200 322 200H184Q172 200 172 188V42Q172 30 184 30Z" className={GLASS} />
          <path d="M296 30V58Q296 68 306 68H334Z" fill={t.c} />
          {[60, 82, 104, 126, 148].map((y, i) => <rect key={y} x="194" y={y} width={[80, 116, 100, 116, 64][i]} height="9" rx="4.5" className={LINE} />)}
          <circle cx="320" cy="176" r="28" fill={grad} />
          <circle cx="320" cy="176" r="28" fill="url(#iso-hl)" />
          <path d="M307 176L316 185L333 167" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )
    case "trophy":
      return (
        <>
          <circle cx="262" cy="110" r="74" className={GLASS} />
          <path d="M226 62H298V96Q298 132 262 140Q226 132 226 96Z" fill="url(#bn-gold)" />
          <path d="M226 72H208Q204 98 228 108M298 72H316Q320 98 296 108" fill="none" stroke="#E8A814" strokeWidth="7" strokeLinecap="round" />
          <rect x="254" y="138" width="16" height="20" fill="#E8A814" />
          <rect x="234" y="156" width="56" height="16" rx="6" fill={t.a} />
          <path d={star(262, 96, 15)} fill="#FFF7D6" />
          <path d={star(330, 52, 11)} fill={t.b} /><path d={star(190, 150, 8)} fill={t.b} /><path d={star(346, 150, 7)} fill="#FFC83D" />
        </>
      )
    case "chat":
      return (
        <>
          <path d="M184 40H306Q324 40 324 58V92Q324 110 306 110H214L194 126V110H184Q166 110 166 92V58Q166 40 184 40Z" className={GLASS} />
          <rect x="184" y="62" width="112" height="9" rx="4.5" className={LINE} /><rect x="184" y="80" width="74" height="9" rx="4.5" className={LINE} />
          <path d="M226 124H342Q360 124 360 142V172Q360 190 342 190H334V206L314 190H226Q208 190 208 172V142Q208 124 226 124Z" fill={grad} />
          <rect x="226" y="146" width="100" height="9" rx="4.5" fill="#fff" opacity=".8" /><rect x="226" y="164" width="62" height="9" rx="4.5" fill="#fff" opacity=".55" />
          <path d={star(350, 52, 13)} fill={t.b} /><path d={star(366, 86, 7)} fill={t.a} />
        </>
      )
    case "toggles":
      return (
        <>
          <rect x="150" y="34" width="210" height="156" rx="20" className={GLASS} />
          {[62, 106, 150].map((y, i) => {
            const on = i !== 1
            return (
              <g key={y}>
                <rect x="170" y={y - 12} width="24" height="24" rx="8" fill={i === 0 ? t.b : t.c} />
                <rect x="206" y={y - 9} width={[72, 60, 80][i]} height="8" rx="4" className={LINE} />
                <rect x="206" y={y + 3} width="40" height="6" rx="3" className={LINE} />
                <rect x="296" y={y - 12} width="46" height="24" rx="12" fill={on ? t.a : undefined} className={on ? undefined : LINE} />
                <circle cx={on ? 330 : 308} cy={y} r="9" fill="#fff" />
              </g>
            )
          })}
        </>
      )
    case "mail":
      return (
        <>
          <rect x="196" y="30" width="128" height="96" rx="12" className={GLASS} />
          <rect x="214" y="50" width="80" height="8" rx="4" className={LINE} /><rect x="214" y="66" width="56" height="8" rx="4" className={LINE} />
          <path d="M168 84Q168 70 182 70H338Q352 70 352 84V176Q352 190 338 190H182Q168 190 168 176Z" fill={grad} />
          <path d="M172 78L260 140L348 78" fill="none" stroke="#fff" strokeOpacity=".75" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="350" cy="72" r="17" fill="#FF6B6B" /><rect x="347" y="62" width="6" height="12" rx="3" fill="#fff" /><circle cx="350" cy="80" r="3" fill="#fff" />
        </>
      )
    case "checklist":
      return (
        <>
          <rect x="150" y="34" width="210" height="156" rx="20" className={GLASS} />
          {[66, 108, 150].map((y, i) => (
            <g key={y}>
              <circle cx="182" cy={y} r="14" fill={i === 0 ? t.a : i === 1 ? t.b : undefined} className={i === 2 ? LINE : undefined} />
              {i < 2 && <path d={`M175 ${y}L180 ${y + 5}L190 ${y - 5}`} fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />}
              <rect x="208" y={y - 9} width={[110, 90, 120][i]} height="8" rx="4" className={LINE} />
              <rect x="208" y={y + 3} width="56" height="6" rx="3" className={LINE} />
            </g>
          ))}
          <path d="M182 82V92M182 124V134" className={STROKE} strokeWidth="3" strokeLinecap="round" />
        </>
      )
    default: // dashboard
      return (
        <>
          <rect x="150" y="34" width="210" height="156" rx="20" className={GLASS} />
          <rect x="168" y="52" width="82" height="52" rx="12" fill={t.c} />
          <rect x="260" y="52" width="82" height="52" rx="12" fill={grad} />
          <rect x="180" y="66" width="40" height="7" rx="3.5" fill={t.a} opacity=".35" /><rect x="180" y="80" width="56" height="11" rx="5.5" fill={t.a} />
          <rect x="272" y="66" width="40" height="7" rx="3.5" fill="#fff" opacity=".6" /><rect x="272" y="80" width="56" height="11" rx="5.5" fill="#fff" />
          <path d="M170 168L200 150L226 158L256 132L286 140L338 118" fill="none" stroke={t.a} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="338" cy="118" r="7" fill="#fff" stroke={t.a} strokeWidth="4" />
        </>
      )
  }
}

/** Ilustración del banner: escena del módulo + su isotipo. Decorativa (aria-hidden). */
export function BannerArt({ id, iso, theme, motif, className }: { id: string; iso: string; theme: BannerTheme; motif: BannerMotif; className?: string }) {
  return (
    <svg viewBox="0 0 400 240" className={cn("bn-art", className)} aria-hidden focusable="false">
      <defs>
        <linearGradient id={`bn-${id}-ab`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={theme.b} /><stop offset="1" stopColor={theme.a} /></linearGradient>
        <linearGradient id={`bn-${id}-area`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={theme.b} stopOpacity=".45" /><stop offset="1" stopColor={theme.b} stopOpacity="0" /></linearGradient>
        <linearGradient id="bn-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFE38A" /><stop offset=".6" stopColor="#FFC83D" /><stop offset="1" stopColor="#E8A814" /></linearGradient>
      </defs>
      {/* Mancha de color, anillo punteado y puntos */}
      <circle cx="262" cy="116" r="116" fill={theme.c} className="opacity-60 dark:opacity-15" />
      <circle cx="262" cy="116" r="134" fill="none" stroke={theme.b} strokeWidth="2" strokeDasharray="3 9" className="opacity-50 dark:opacity-30" />
      {Array.from({ length: 12 }).map((_, i) => <circle key={i} cx={52 + (i % 4) * 16} cy={36 + Math.floor(i / 4) * 16} r="3" fill={theme.a} className="opacity-25 dark:opacity-40" />)}
      <g className="bn-float"><Motif m={motif} t={theme} id={id} /></g>
      {/* Isotipo del módulo sobre una placa de vidrio */}
      <g className="bn-float-2">
        <circle cx="140" cy="168" r="54" className="fill-white/95 dark:fill-white/12" />
        <svg x="98" y="126" width="84" height="84" viewBox="0 0 256 256" dangerouslySetInnerHTML={{ __html: isoMarkup(iso) }} />
      </g>
      <path d={star(84, 196, 10)} fill={theme.b} className="opacity-80" />
      <path d={star(376, 30, 8)} fill={theme.a} className="opacity-60" />
    </svg>
  )
}
