/**
 * Ilustración del modal de bienvenida (propia de Mirai): mosaicos pastel inclinados, un celular con la quincena,
 * monedas, una alcancía y un escudo. Llena su contenedor (slice) para ocupar la mitad del modal.
 */
export function WelcomeArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 600 900" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden>
      <defs>
        <linearGradient id="wa-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#EAF7D9" /><stop offset=".55" stopColor="#E3EEFF" /><stop offset="1" stopColor="#F6E4F7" /></linearGradient>
        <linearGradient id="wa-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#B9EE7A" /><stop offset="1" stopColor="#5DBB3A" /></linearGradient>
        <linearGradient id="wa-b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#8FD0FF" /><stop offset="1" stopColor="#3D7BFF" /></linearGradient>
        <linearGradient id="wa-p" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FFC6E3" /><stop offset="1" stopColor="#C9A7FF" /></linearGradient>
        <linearGradient id="wa-screen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#D9C8FF" /><stop offset=".55" stopColor="#7FA8FF" /><stop offset="1" stopColor="#2E6BFF" /></linearGradient>
        <linearGradient id="wa-coin" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FFE38A" /><stop offset="1" stopColor="#F2A900" /></linearGradient>
        <filter id="wa-sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="18" stdDeviation="22" floodColor="#1F2B4B" floodOpacity=".18" /></filter>
      </defs>
      <rect width="600" height="900" fill="url(#wa-bg)" />
      {/* Mosaicos inclinados */}
      <g transform="rotate(-14 300 450)" opacity=".95">
        <rect x="-40" y="10" width="300" height="300" rx="44" fill="url(#wa-g)" />
        <rect x="360" y="-60" width="260" height="280" rx="44" fill="url(#wa-p)" />
        <rect x="430" y="610" width="260" height="320" rx="44" fill="url(#wa-b)" opacity=".85" />
        <rect x="-60" y="660" width="280" height="260" rx="44" fill="#FFD7EC" />
      </g>
      {/* Brote sobre el mosaico verde */}
      <g transform="translate(120 150)" fill="none" strokeLinecap="round">
        <path d="M0 70 C10 30 40 10 70 0" stroke="#2A7F14" strokeWidth="10" />
        <path d="M30 40 C0 20 -30 30 -40 10 C-10 -10 20 0 30 40Z" fill="#7BD24A" stroke="#2A7F14" strokeWidth="6" />
        <path d="M58 12 C70 -20 105 -28 120 -18 C110 10 85 22 58 12Z" fill="#A8E66E" stroke="#2A7F14" strokeWidth="6" />
      </g>
      {/* Escudo sobre el mosaico rosado */}
      <g transform="translate(470 80)" filter="url(#wa-sh)">
        <path d="M0 -50 L48 -32 V8 C48 40 26 62 0 74 C-26 62 -48 40 -48 8 V-32Z" fill="#fff" />
        <path d="M-20 10 L-4 26 L24 -6" fill="none" stroke="#5DBB3A" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      {/* Celular con la quincena */}
      <g transform="rotate(-11 330 480)" filter="url(#wa-sh)">
        <rect x="170" y="190" width="320" height="600" rx="40" fill="#fff" />
        <rect x="186" y="270" width="288" height="500" rx="26" fill="url(#wa-screen)" />
        <circle cx="222" cy="232" r="20" fill="#1F2B4B" />
        <rect x="254" y="222" width="120" height="12" rx="6" fill="#E4E6EB" />
        <rect x="254" y="240" width="76" height="9" rx="4.5" fill="#EEF0F3" />
        {/* tarjeta "te queda" */}
        <rect x="206" y="294" width="248" height="120" rx="20" fill="#fff" opacity=".95" />
        <rect x="226" y="314" width="110" height="10" rx="5" fill="#B0B3B8" />
        <rect x="226" y="336" width="150" height="24" rx="8" fill="#1F2B4B" />
        <rect x="226" y="376" width="208" height="14" rx="7" fill="#E4E6EB" />
        <rect x="226" y="376" width="140" height="14" rx="7" fill="#9EDB4E" />
        {/* barras */}
        <g fill="#fff" opacity=".9">
          <rect x="226" y="560" width="34" height="120" rx="10" /><rect x="276" y="520" width="34" height="160" rx="10" />
          <rect x="326" y="590" width="34" height="90" rx="10" /><rect x="376" y="480" width="34" height="200" rx="10" />
        </g>
        <path d="M222 520 C270 470 320 540 360 470 S430 430 450 420" fill="none" stroke="#9EDB4E" strokeWidth="8" strokeLinecap="round" />
      </g>
      {/* Monedas */}
      <g filter="url(#wa-sh)">
        <g transform="translate(120 560)">
          <ellipse cx="0" cy="48" rx="62" ry="20" fill="#E09A00" /><rect x="-62" y="10" width="124" height="38" fill="#E09A00" /><ellipse cx="0" cy="10" rx="62" ry="20" fill="url(#wa-coin)" />
          <ellipse cx="0" cy="-10" rx="62" ry="20" fill="#E09A00" /><rect x="-62" y="-48" width="124" height="38" fill="#E09A00" /><ellipse cx="0" cy="-48" rx="62" ry="20" fill="url(#wa-coin)" />
          <text x="0" y="-41" textAnchor="middle" fontSize="22" fontWeight="800" fill="#B36B00" fontFamily="system-ui">$</text>
        </g>
        {/* Alcancía */}
        <g transform="translate(470 700)">
          <ellipse cx="0" cy="0" rx="86" ry="66" fill="#FF9EC7" />
          <circle cx="58" cy="-10" r="26" fill="#FF8AB9" /><circle cx="64" cy="-12" r="5" fill="#7A2350" /><circle cx="52" cy="-12" r="5" fill="#7A2350" />
          <circle cx="30" cy="-34" r="6" fill="#7A2350" />
          <rect x="-30" y="-70" width="44" height="10" rx="5" fill="#7A2350" />
          <rect x="-58" y="50" width="22" height="34" rx="8" fill="#FF8AB9" /><rect x="22" y="50" width="22" height="34" rx="8" fill="#FF8AB9" />
          <circle cx="-8" cy="-96" r="22" fill="url(#wa-coin)" />
        </g>
      </g>
      {/* Destellos */}
      <g fill="#fff">
        <path d="M80 420 l8 22 22 8 -22 8 -8 22 -8 -22 -22 -8 22 -8z" />
        <path d="M540 470 l6 16 16 6 -16 6 -6 16 -6 -16 -16 -6 16 -6z" opacity=".9" />
      </g>
    </svg>
  )
}
