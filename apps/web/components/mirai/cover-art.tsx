import { BANNER_THEMES, type BannerTheme, type BannerThemeKey } from "@/lib/content/banners"
import { coverArt, coverColor, coverFoto, type CoverMotif } from "@/lib/content/covers"
import { cn } from "@/lib/utils"

// Portada del perfil (viewBox 800 × 200): escenas con el mismo lenguaje de los banners de sección (formas suaves,
// colores de una familia, sin sombras ni brillos). El avatar va sobre la esquina de abajo a la izquierda: esa zona se
// deja tranquila en todas las escenas.

const SOL = "#FFC83D"
const SOL_CLARO = "#FFF1BF"

/** Nube suave en (x, y) con tamaño k. */
function Nube({ x, y, k = 1, fill, op = 0.85 }: { x: number; y: number; k?: number; fill: string; op?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${k})`} opacity={op}>
      <ellipse cx="0" cy="0" rx="34" ry="18" fill={fill} />
      <ellipse cx="-26" cy="6" rx="22" ry="13" fill={fill} />
      <ellipse cx="26" cy="5" rx="24" ry="14" fill={fill} />
    </g>
  )
}

/** Pino de altura h con la copa en tres capas. */
function Pino({ x, y, h, a, b }: { x: number; y: number; h: number; a: string; b: string }) {
  const w = h * 0.52
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={-h * 0.045} y={-h * 0.1} width={h * 0.09} height={h * 0.16} rx={h * 0.03} fill={a} opacity=".5" />
      <path d={`M0 ${-h} L${w / 2} ${-h * 0.52} L${-w / 2} ${-h * 0.52} Z`} fill={b} />
      <path d={`M0 ${-h * 0.78} L${w * 0.62} ${-h * 0.26} L${-w * 0.62} ${-h * 0.26} Z`} fill={a} opacity=".82" />
      <path d={`M0 ${-h * 0.52} L${w * 0.72} ${-h * 0.06} L${-w * 0.72} ${-h * 0.06} Z`} fill={b} />
    </g>
  )
}

/** Casa sencilla con techo, puerta y ventana. */
function Casa({ x, y, w, h, a, b, c }: { x: number; y: number; w: number; h: number; a: string; b: string; c: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={-w / 2} y={-h} width={w} height={h} rx={w * 0.08} fill={c} />
      <path d={`M${-w * 0.62} ${-h} L0 ${-h - w * 0.42} L${w * 0.62} ${-h} Z`} fill={a} />
      <rect x={-w * 0.13} y={-h * 0.52} width={w * 0.26} height={h * 0.52} rx={w * 0.05} fill={b} />
      <rect x={w * 0.16} y={-h * 0.74} width={w * 0.22} height={w * 0.22} rx={w * 0.05} fill={b} opacity=".75" />
    </g>
  )
}

function Moneda({ x, y, r = 26 }: { x: number; y: number; r?: number }) {
  return (
    <g>
      <ellipse cx={x} cy={y} rx={r} ry={r * 0.36} fill={SOL} />
      <ellipse cx={x} cy={y - r * 0.12} rx={r * 0.58} ry={r * 0.2} fill="none" stroke={SOL_CLARO} strokeWidth="3" />
    </g>
  )
}

function Corazon({ x, y, k, fill, op = 1 }: { x: number; y: number; k: number; fill: string; op?: number }) {
  return <path transform={`translate(${x} ${y}) scale(${k})`} opacity={op} fill={fill}
    d="M0 14C-10 6-18 0-18-8c0-5 4-9 9-9 4 0 7 2 9 5 2-3 5-5 9-5 5 0 9 4 9 9 0 8-8 14-18 22z" />
}

/** Una persona vista de frente (cabeza y cuerpo redondeado). */
function Persona({ x, y, h, fill }: { x: number; y: number; h: number; fill: string }) {
  return (
    <g transform={`translate(${x} ${y})`} fill={fill}>
      <circle cx="0" cy={-h} r={h * 0.26} />
      <path d={`M${-h * 0.34} 0 Q${-h * 0.34} ${-h * 0.66} 0 ${-h * 0.66} Q${h * 0.34} ${-h * 0.66} ${h * 0.34} 0 Z`} />
    </g>
  )
}

/** La escena de cada portada. Todas terminan en la línea y = 200. */
function Motif({ m, t }: { m: CoverMotif; t: BannerTheme }) {
  switch (m) {
    case "montanas":
      return (
        <>
          <circle cx="640" cy="58" r="30" fill={SOL} />
          <circle cx="640" cy="58" r="44" fill="none" stroke={SOL_CLARO} strokeWidth="3" strokeDasharray="4 10" opacity=".8" />
          <Nube x={200} y={46} k={0.9} fill="#fff" op={0.75} />
          <path d="M-20 200 L170 74 L330 200 Z" fill={t.b} />
          <path d="M170 74 L214 110 L186 124 L158 110 Z" fill="#fff" opacity=".9" />
          <path d="M150 200 L380 56 L620 200 Z" fill={t.a} />
          <path d="M380 56 L432 98 L398 114 L362 96 Z" fill="#fff" opacity=".92" />
          <path d="M440 200 L640 106 L830 200 Z" fill={t.c} />
        </>
      )
    case "playa":
      return (
        <>
          <circle cx="618" cy="56" r="28" fill={SOL} />
          <Nube x={180} y={44} k={0.8} fill="#fff" op={0.7} />
          <path d="M-20 120 H820 V200 H-20 Z" fill={t.b} />
          {[134, 158, 182].map((y, i) => (
            <path key={y} d={`M-20 ${y} q60 -12 120 0 t120 0 t120 0 t120 0 t120 0 t120 0 t120 0`} fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity={0.5 - i * 0.12} />
          ))}
          <path d="M-20 186 q220 -22 420 -4 t420 10 V200 H-20 Z" fill="#FBE7C2" />
          <g transform="translate(694 186)">
            <path d="M0 0 q-6 -40 4 -66" fill="none" stroke={t.a} strokeWidth="7" strokeLinecap="round" />
            <path d="M4 -66 q-34 -14 -52 6 q30 -6 52 -6z M4 -66 q34 -16 54 4 q-32 -8 -54 -4z M4 -66 q-14 -34 10 -46 q4 26 -10 46z" fill={t.a} />
          </g>
        </>
      )
    case "bosque":
      return (
        <>
          <Nube x={640} y={44} k={0.9} fill="#fff" op={0.65} />
          <circle cx="150" cy="52" r="26" fill={SOL} opacity=".9" />
          <path d="M-20 200 q200 -40 420 -16 t420 -8 V200 Z" fill={t.c} opacity=".8" />
          {[[70, 118], [150, 150], [250, 128], [350, 164], [455, 132], [560, 158], [660, 126], [760, 150]].map(([x, h], i) => (
            <Pino key={x} x={x} y={200} h={h} a={i % 2 ? t.a : t.b} b={i % 2 ? t.b : t.a} />
          ))}
        </>
      )
    case "nubes":
      return (
        <>
          <circle cx="672" cy="60" r="32" fill={SOL} />
          <Nube x={150} y={64} k={1.15} fill="#fff" />
          <Nube x={380} y={40} k={0.8} fill="#fff" op={0.8} />
          <Nube x={560} y={120} k={1.3} fill="#fff" op={0.9} />
          <Nube x={760} y={62} k={0.9} fill="#fff" op={0.7} />
          {[[250, 112], [288, 100], [322, 118]].map(([x, y]) => (
            <path key={x} d={`M${x} ${y} q10 -9 20 0 q10 -9 20 0`} fill="none" stroke={t.a} strokeWidth="3.5" strokeLinecap="round" opacity=".6" />
          ))}
        </>
      )
    case "campo":
      return (
        <>
          <circle cx="664" cy="54" r="27" fill={SOL} />
          <Nube x={240} y={44} k={0.85} fill="#fff" op={0.75} />
          <path d="M-20 200 q180 -92 420 -48 t420 -26 V200 Z" fill={t.c} />
          <path d="M-20 200 q220 -54 460 -18 t380 -6 V200 Z" fill={t.b} />
          <g transform="translate(600 150)">
            <rect x="-5" y="-6" width="10" height="56" rx="5" fill={t.a} opacity=".55" />
            <circle cx="0" cy="-26" r="34" fill={t.a} />
            <circle cx="-26" cy="-6" r="24" fill={t.a} opacity=".85" />
            <circle cx="26" cy="-8" r="22" fill={t.a} opacity=".9" />
          </g>
          {[120, 210, 300].map((x, i) => (
            <path key={x} d={`M${x} 196 q4 -26 0 -40 M${x} 170 q-12 -4 -14 -16 q14 2 14 16 M${x} 178 q12 -6 14 -18 q-14 4 -14 18`} fill="none" stroke={t.a} strokeWidth="4" strokeLinecap="round" opacity={0.7 - i * 0.1} />
          ))}
        </>
      )
    case "ciudad":
      return (
        <>
          <circle cx="690" cy="52" r="26" fill={SOL} />
          <path d="M-20 200 V128 H40 V200 Z" fill={t.c} />
          {[[60, 96, 54], [124, 142, 46], [180, 70, 60], [250, 170, 50], [310, 110, 44], [364, 150, 58], [432, 86, 46], [488, 132, 62], [560, 104, 44], [614, 160, 56], [690, 118, 48], [754, 86, 66]].map(([x, h, w], i) => (
            <g key={x}>
              <rect x={x} y={200 - h} width={w} height={h} rx="6" fill={i % 3 === 0 ? t.a : i % 3 === 1 ? t.b : t.c} />
              {Array.from({ length: Math.min(8, Math.floor(h / 24)) }).map((_, j) => (
                <g key={j}>
                  <rect x={x + 9} y={200 - h + 14 + j * 22} width="10" height="11" rx="2.5" fill={SOL_CLARO} opacity={(j + i) % 3 ? 0.85 : 0.3} />
                  <rect x={x + w - 19} y={200 - h + 14 + j * 22} width="10" height="11" rx="2.5" fill={SOL_CLARO} opacity={(j + i) % 2 ? 0.5 : 0.85} />
                </g>
              ))}
            </g>
          ))}
        </>
      )
    case "barrio":
      return (
        <>
          <circle cx="112" cy="50" r="24" fill={SOL} />
          <Nube x={520} y={44} k={0.85} fill="#fff" op={0.7} />
          <path d="M-20 200 q200 -26 420 -14 t420 -10 V200 Z" fill={t.c} opacity=".85" />
          <Casa x={250} y={200} w={120} h={78} a={t.a} b={t.c} c={t.b} />
          <Casa x={420} y={200} w={96} h={62} a={t.b} b={t.a} c="#fff" />
          <Casa x={580} y={200} w={132} h={88} a={t.a} b={t.c} c={t.b} />
          <Casa x={740} y={200} w={104} h={66} a={t.b} b={t.a} c="#fff" />
          <Pino x={170} y={200} h={92} a={t.a} b={t.b} />
          <Pino x={340} y={200} h={70} a={t.b} b={t.a} />
        </>
      )
    case "puente":
      return (
        <>
          <circle cx="150" cy="54" r="26" fill={SOL} />
          <path d="M-20 158 H820 V200 H-20 Z" fill={t.b} opacity=".55" />
          <path d="M-20 150 H820" stroke={t.a} strokeWidth="8" />
          {[180, 560].map((x) => <rect key={x} x={x - 9} y="48" width="18" height="102" rx="6" fill={t.a} />)}
          <path d="M-20 92 Q180 48 370 118 Q560 48 820 92" fill="none" stroke={t.a} strokeWidth="6" strokeLinecap="round" />
          {Array.from({ length: 22 }).map((_, i) => {
            const x = 20 + i * 36
            const y = x < 370 ? 92 + (1 - Math.abs((x - 180) / 190)) * -0 + ((x - 180) / 190) ** 2 * 26 + 2 : 118 - ((x - 370) / 190) * 0 + ((x - 560) / 190) ** 2 * 26 - 24
            return <line key={i} x1={x} y1={Math.max(52, Math.min(140, y))} x2={x} y2="150" stroke={t.a} strokeWidth="3" opacity=".6" />
          })}
        </>
      )
    case "avion":
      return (
        <>
          <circle cx="110" cy="56" r="26" fill={SOL} />
          <Nube x={260} y={132} k={1.1} fill="#fff" op={0.8} />
          <Nube x={700} y={150} k={1.25} fill="#fff" op={0.85} />
          <Nube x={520} y={46} k={0.75} fill="#fff" op={0.6} />
          <path d="M120 150 Q300 128 470 86" fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" strokeDasharray="2 22" opacity=".9" />
          <g transform="translate(560 72) rotate(-14)">
            <path d="M-78 10 q10 -16 34 -16 h70 l44 -28 h26 l-22 28 h32 q16 0 16 10 t-16 10 h-32 l22 28 h-26 l-44 -28 h-70 q-24 0 -34 -16z" fill={t.a} />
            <path d="M-30 -6 h44 l-18 -26 h-18 z" fill={t.b} />
          </g>
        </>
      )
    case "carretera":
      return (
        <>
          <circle cx="640" cy="56" r="28" fill={SOL} />
          <path d="M-20 120 L190 60 L400 120 Z" fill={t.c} opacity=".9" />
          <path d="M260 120 L470 48 L700 120 Z" fill={t.b} opacity=".9" />
          <path d="M-20 200 H820 V116 H-20 Z" fill={t.c} opacity=".45" />
          <path d="M330 116 L470 116 L740 200 L10 200 Z" fill={t.a} opacity=".88" />
          {[[400, 124, 5], [396, 144, 7], [390, 170, 10], [382, 196, 13]].map(([x, y, w], i) => (
            <rect key={i} x={x} y={y} width={w * 2.4} height={w} rx={w / 2} fill="#fff" opacity=".9" />
          ))}
          <Pino x={190} y={132} h={54} a={t.a} b={t.b} />
          <Pino x={690} y={140} h={66} a={t.b} b={t.a} />
        </>
      )
    case "mapa":
      return (
        <>
          <path d="M-20 200 V40 h840 v160 Z" fill="none" />
          {[64, 112, 160].map((y, i) => (
            <path key={y} d={`M-20 ${y} q120 -26 240 0 t240 0 t240 0 t240 0`} fill="none" stroke={t.c} strokeWidth="10" strokeLinecap="round" opacity={0.55 - i * 0.1} />
          ))}
          <path d="M60 176 Q220 150 300 104 T560 74 Q660 64 760 96" fill="none" stroke={t.a} strokeWidth="6" strokeLinecap="round" strokeDasharray="14 14" />
          <g transform="translate(560 44)">
            <path d="M0 40 C-22 16-30 6-30 -6 a30 30 0 0 1 60 0 c0 12-8 22-30 46z" fill={t.a} />
            <circle cx="0" cy="-6" r="11" fill="#fff" />
          </g>
          <circle cx="60" cy="176" r="9" fill={t.a} /><circle cx="60" cy="176" r="17" fill="none" stroke={t.a} strokeWidth="3" opacity=".5" />
        </>
      )
    case "monedas":
      return (
        <>
          <path d="M-20 200 q220 -20 440 -12 t400 -10 V200 Z" fill={t.c} opacity=".6" />
          {[[180, 60], [300, 96], [420, 78], [540, 126], [660, 150]].map(([x, h]) => (
            <rect key={x} x={x} y={190 - h} width="48" height={h} rx="12" fill={t.b} opacity=".9" />
          ))}
          <path d="M150 150 L300 112 L430 128 L560 72 L700 44" fill="none" stroke={t.a} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="700" cy="44" r="13" fill="#fff" stroke={t.a} strokeWidth="6" />
          {[0, 1, 2, 3].map((i) => <Moneda key={i} x={96} y={186 - i * 16} r={30} />)}
        </>
      )
    case "alcancia":
      return (
        <>
          <Nube x={200} y={52} k={0.8} fill="#fff" op={0.6} />
          <path d="M-20 200 q240 -24 440 -14 t400 -8 V200 Z" fill={t.c} opacity=".6" />
          <g transform="translate(560 112)">
            <ellipse cx="0" cy="18" rx="96" ry="70" fill={t.a} />
            <ellipse cx="74" cy="6" rx="30" ry="26" fill={t.a} />
            <circle cx="92" cy="2" r="6" fill={t.b} /><circle cx="78" cy="2" r="6" fill={t.b} />
            <circle cx="46" cy="-14" r="7" fill="#fff" />
            <path d="M-46 -48 q22 -22 46 -8 q-26 4 -46 8z" fill={t.b} />
            <rect x="-26" y="-48" width="54" height="10" rx="5" fill={t.b} />
            {[[-62, 78], [-20, 84], [26, 82], [66, 76]].map(([x, y], i) => <rect key={i} x={x} y={y} width="22" height="22" rx="8" fill={t.b} />)}
          </g>
          <Moneda x={470} y={44} r={24} /><Moneda x={414} y={78} r={20} /><Moneda x={520} y={30} r={16} />
        </>
      )
    case "casa":
      return (
        <>
          <circle cx="120" cy="52" r="25" fill={SOL} />
          <Nube x={300} y={46} k={0.8} fill="#fff" op={0.65} />
          <path d="M-20 200 q220 -22 440 -12 t400 -8 V200 Z" fill={t.c} opacity=".7" />
          <g transform="translate(560 0)">
            <Casa x={0} y={196} w={210} h={122} a={t.a} b={t.c} c={t.b} />
            <rect x="-14" y="112" width="28" height="30" rx="8" fill={SOL} />
          </g>
          <Pino x={400} y={196} h={96} a={t.a} b={t.b} />
          <Pino x={330} y={196} h={66} a={t.b} b={t.a} />
          <g transform="translate(180 120)">
            <circle cx="0" cy="0" r="26" fill="none" stroke={SOL} strokeWidth="12" />
            <rect x="22" y="-7" width="62" height="14" rx="7" fill={SOL} />
            <rect x="62" y="4" width="12" height="18" rx="6" fill={SOL} />
          </g>
        </>
      )
    case "cosecha":
      return (
        <>
          <circle cx="672" cy="52" r="26" fill={SOL} />
          <path d="M-20 200 q240 -28 440 -16 t400 -10 V200 Z" fill={t.c} opacity=".7" />
          {[[220, 1], [360, 1.25], [500, 0.95]].map(([x, k], i) => (
            <g key={i} transform={`translate(${x} 196) scale(${k})`}>
              <path d="M0 0 q-4 -52 0 -78" fill="none" stroke={t.a} strokeWidth="7" strokeLinecap="round" />
              <path d="M0 -42 q-34 -10 -42 -40 q36 4 42 40z" fill={t.b} />
              <path d="M0 -58 q32 -12 42 -42 q-36 6 -42 42z" fill={t.a} />
              <Moneda x={0} y={-86} r={22} />
            </g>
          ))}
          <g transform="translate(648 196)">
            <path d="M-56 -58 h112 l-14 58 h-84 z" fill={t.a} />
            <rect x="-64" y="-70" width="128" height="18" rx="9" fill={t.b} />
          </g>
        </>
      )
    case "familia":
      return (
        <>
          <circle cx="130" cy="54" r="26" fill={SOL} />
          <Nube x={620} y={44} k={0.9} fill="#fff" op={0.65} />
          <path d="M-20 200 q230 -26 450 -14 t390 -10 V200 Z" fill={t.c} opacity=".7" />
          <Persona x={420} y={196} h={104} fill={t.a} />
          <Persona x={520} y={196} h={92} fill={t.b} />
          <Persona x={600} y={196} h={62} fill={t.a} />
          <Persona x={664} y={196} h={54} fill={t.b} />
          <Corazon x={560} y={48} k={1.5} fill={t.a} op={0.9} />
          <Corazon x={632} y={80} k={0.9} fill={t.b} op={0.8} />
        </>
      )
    case "mascotas":
      return (
        <>
          <path d="M-20 200 q230 -24 450 -14 t390 -8 V200 Z" fill={t.c} opacity=".7" />
          {[[160, 70, 1], [250, 120, 0.85], [350, 70, 1], [450, 118, 0.85]].map(([x, y, k], i) => (
            <g key={i} transform={`translate(${x} ${y}) scale(${k})`} fill={t.b} opacity={0.75}>
              <ellipse cx="0" cy="10" rx="17" ry="14" />
              <ellipse cx="-16" cy="-10" rx="7" ry="9" /><ellipse cx="-4" cy="-17" rx="7" ry="9" />
              <ellipse cx="9" cy="-16" rx="7" ry="9" /><ellipse cx="19" cy="-6" rx="7" ry="9" />
            </g>
          ))}
          <g transform="translate(620 196)">
            <ellipse cx="0" cy="-42" rx="66" ry="42" fill={t.a} />
            <circle cx="62" cy="-74" r="34" fill={t.a} />
            <path d="M44 -104 q-10 -30 10 -34 q6 18 2 34z M80 -104 q10 -30 -8 -34 q-8 18 -4 34z" fill={t.a} />
            <circle cx="76" cy="-78" r="5.5" fill="#fff" /><circle cx="54" cy="-78" r="5.5" fill="#fff" />
            <ellipse cx="66" cy="-62" rx="9" ry="6" fill={t.b} />
            <path d="M-62 -54 q-34 -16 -26 -44 q22 12 26 44z" fill={t.a} />
            <rect x="-44" y="-12" width="18" height="14" rx="7" fill={t.a} /><rect x="22" y="-12" width="18" height="14" rx="7" fill={t.a} />
          </g>
        </>
      )
    case "corazones":
      return (
        <>
          {[[140, 140, 1.6], [250, 70, 1], [360, 150, 1.2], [470, 64, 1.5], [580, 128, 1], [670, 62, 1.3], [760, 140, 1.7]].map(([x, y, k], i) => (
            <Corazon key={i} x={x} y={y} k={k} fill={i % 2 ? t.a : t.b} op={i % 3 === 0 ? 0.55 : 0.9} />
          ))}
          {[[200, 44], [420, 170], [700, 150]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="7" fill={t.c} />
          ))}
        </>
      )
    case "olas":
      return (
        <>
          {[0, 1, 2, 3].map((i) => (
            <path key={i} d={`M-20 ${86 + i * 30} q110 -34 220 0 t220 0 t220 0 t220 0 V220 H-20 Z`} fill={[t.c, t.b, t.a, t.a][i]} opacity={[0.5, 0.5, 0.35, 0.75][i]} />
          ))}
          <circle cx="664" cy="48" r="24" fill={SOL} opacity=".9" />
        </>
      )
    case "burbujas":
      return (
        <>
          {[[90, 150, 46], [190, 66, 30], [290, 140, 22], [380, 54, 40], [470, 132, 52], [580, 60, 26], [650, 148, 34], [736, 70, 44], [790, 152, 24]].map(([x, y, r], i) => (
            <circle key={i} cx={x} cy={y} r={r} fill={i % 3 === 0 ? t.a : i % 3 === 1 ? t.b : t.c} opacity={i % 2 ? 0.55 : 0.85} />
          ))}
          {[[240, 110], [520, 96], [700, 118]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="16" fill="none" stroke={t.a} strokeWidth="3" opacity=".45" />
          ))}
        </>
      )
    case "confeti":
      return (
        <>
          {Array.from({ length: 26 }).map((_, i) => {
            const x = 40 + ((i * 97) % 760), y = 28 + ((i * 53) % 150), r = (i * 37) % 180
            const f = i % 4 === 0 ? SOL : i % 4 === 1 ? t.a : i % 4 === 2 ? t.b : t.c
            return i % 3 === 0
              ? <circle key={i} cx={x} cy={y} r="7" fill={f} opacity=".9" />
              : <rect key={i} x={x} y={y} width="18" height="8" rx="4" fill={f} transform={`rotate(${r} ${x} ${y})`} opacity=".9" />
          })}
          <path d="M700 60l6 14 14 6-14 6-6 14-6-14-14-6 14-6z" fill={SOL} />
          <path d="M140 120l5 11 11 5-11 5-5 11-5-11-11-5 11-5z" fill={t.a} opacity=".8" />
        </>
      )
    case "geo":
    default:
      return (
        <>
          <circle cx="690" cy="44" r="130" fill={t.c} className="opacity-70 dark:opacity-20" />
          <circle cx="690" cy="44" r="162" fill="none" stroke={t.b} strokeWidth="2" strokeDasharray="3 10" className="opacity-60 dark:opacity-30" />
          <circle cx="120" cy="210" r="96" fill={t.c} className="opacity-50 dark:opacity-15" />
          {Array.from({ length: 15 }).map((_, i) => <circle key={i} cx={470 + (i % 5) * 18} cy={44 + Math.floor(i / 5) * 18} r="3" fill={t.a} className="opacity-25 dark:opacity-40" />)}
          <circle cx="600" cy="132" r="16" fill={SOL} /><circle cx="600" cy="132" r="9" fill="none" stroke={SOL_CLARO} strokeWidth="3.5" />
          <path d="M760 142l4 9 9 4-9 4-4 9-4-9-9-4 9-4z" fill={t.b} />
        </>
      )
  }
}

/** Solo la escena (sin fondo): la usa la vista previa del selector. */
export function CoverScene({ motif, theme, className }: { motif: CoverMotif; theme: BannerThemeKey; className?: string }) {
  const t = BANNER_THEMES[theme] ?? BANNER_THEMES.verde
  return (
    <div className={cn("banner-bg relative overflow-hidden", className)} style={{ "--bn-bg": t.bg, "--bn-dark": t.dark } as React.CSSProperties}>
      <svg viewBox="0 0 800 200" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 size-full" aria-hidden><Motif m={motif} t={t} /></svg>
    </div>
  )
}

/**
 * Portada del perfil tal como quedó guardada: una escena ("art:<clave>"), la foto subida (URL) o un color liso.
 * `children` va encima (el botón de cambiarla).
 */
export function CoverArt({ value, className, children }: { value: string | null | undefined; className?: string; children?: React.ReactNode }) {
  const foto = coverFoto(value)
  if (foto) return (
    <div className={cn("relative overflow-hidden bg-secondary", className)}>
      <img src={foto} alt="" className="absolute inset-0 size-full object-cover" decoding="async" />
      {children}
    </div>
  )
  const art = coverArt(value)
  return (
    <div className="relative">
      <CoverScene motif={art?.m ?? "geo"} theme={art?.t ?? coverColor(value)} className={className} />
      {children}
    </div>
  )
}
