import math, json
F={'green':['#7EEBC0','#14B88A','#0E7C74'],'mint':['#B6F5DA','#5FDDB0','#1FA88A'],'blue':['#86D4FF','#3D8BFF','#2349C9'],'cyan':['#A8F0FF','#2CC7EA','#117FA8'],'purple':['#DCC4FF','#9361F5','#5A2BC2'],'lav':['#F1E6FF','#C9A8FF','#8F63E8'],'orange':['#FFC09A','#FF8547','#E5571F'],'coral':['#FFC4B3','#FF7F66','#E04A3A'],'yellow':['#FFF0A3','#FFCC33','#E09A0A'],'amber':['#FFE3A0','#FFB547','#E98A12'],'red':['#FFB3C0','#F5486A','#C21E4A'],'pink':['#FFD0E6','#F563A8','#C42A7A'],'teal':['#A6F2E8','#22BFAE','#0F7F78'],'indigo':['#CDD5FF','#6E7BFA','#3F3CC9'],'navy':['#8FA2D6','#3A4E8C','#1F2B4B'],'paper':['#FFFFFF','#F4F1FF','#E3DCF7']}
DEFS=[];ICONS={}
def g(icon,fam,n,x1=0,y1=0,x2=1,y2=1,soft=False):
    gid=f'iso-{icon}-{n}';c=F[fam]
    stops=[(0,c[0]),(1,c[1])] if soft=='light' else [(0,c[1]),(1,c[2])] if soft=='dark' else [(0,c[0]),(.55,c[1]),(1,c[2])]
    DEFS.append(f'<linearGradient id="{gid}" x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}">'+''.join(f'<stop offset="{o}" stop-color="{s}"/>' for o,s in stops)+'</linearGradient>')
    return f'url(#{gid})'
HL='url(#iso-hl)';SH='url(#iso-sh)'
def P(d,fill,extra=''):return f'<path d="{d}" fill="{fill}" {extra}/>'
def deco(d):  # luz interior suave arriba + sombra interna suave abajo, dentro de la forma
    return P(d,HL)+P(d,SH)
def rr(x,y,w,h,r):return f'M{x+r} {y}H{x+w-r}Q{x+w} {y} {x+w} {y+r}V{y+h-r}Q{x+w} {y+h} {x+w-r} {y+h}H{x+r}Q{x} {y+h} {x} {y+h-r}V{y+r}Q{x} {y} {x+r} {y}Z'
def circ(cx,cy,r):return f'M{cx-r} {cy}a{r} {r} 0 1 0 {2*r} 0a{r} {r} 0 1 0 {-2*r} 0Z'
def ell(cx,cy,rx,ry):return f'M{cx-rx} {cy}a{rx} {ry} 0 1 0 {2*rx} 0a{rx} {ry} 0 1 0 {-2*rx} 0Z'
def reg(name,els):ICONS[name]=''.join(els)

# ---------- marca: Mirai (sol naciente sobre un horizonte que sube = futuro) ----------
sun=circ(150,88,58)
wave1='M28 164C72 164 110 146 146 124C178 105 202 98 226 98C246 98 246 142 226 142C204 142 182 152 154 170C116 194 78 208 28 208C10 208 10 164 28 164Z'
wave2='M28 208C78 208 116 194 154 170C182 152 204 142 226 142C246 142 246 182 226 182C206 182 186 192 160 208C130 226 94 234 56 234H28C12 234 12 208 28 208Z'
reg('mirai',[P(sun,g('mirai','amber',1,.2,0,.8,1)),deco(sun),P(wave1,g('mirai','cyan',2,0,1,1,0)),P(wave1,HL),P(wave2,g('mirai','green',3,0,1,1,0)),deco(wave2)])
# ---------- inicio: casa ----------
body=rr(54,110,148,110,26);door=rr(106,152,44,68,16)
reg('inicio',[P(body,g('inicio','blue',1,0,0,1,1)),deco(body),f'<path d="M128 46L216 122H40Z" fill="{g("inicio","cyan",2,0,0,1,1,"light")}" stroke="url(#iso-inicio-2)" stroke-width="26" stroke-linejoin="round"/>',P('M128 46L216 122H40Z',HL,'stroke="url(#iso-hl)" stroke-width="26" stroke-linejoin="round" opacity=".6"'),P(door,g('inicio','navy',3,0,0,0,1,'dark'))])
# ---------- consejero: burbuja + chispa ----------
bub=rr(30,36,196,148,52)+'M88 168L64 224L140 178Z'
star='M128 62C133 98 142 107 178 112C142 117 133 126 128 162C123 126 114 117 78 112C114 107 123 98 128 62Z'
s2='M184 54C186 66 190 70 202 72C190 74 186 78 184 90C182 78 178 74 166 72C178 70 182 66 184 54Z'
reg('consejero',[P(bub,g('consejero','purple',1,0,0,1,1)),deco(bub),P(star,g('consejero','paper',2,0,0,1,1)),P(s2,g('consejero','lav',3,0,0,1,1,'light'))])
# ---------- balance: balanza ----------
reg('balance',[P(rr(120,56,16,144,8),g('balance','teal',1,0,0,0,1,'dark')),P(rr(42,68,172,18,9),g('balance','teal',2,0,0,1,0)),
 '<path d="M64 84L36 146M64 84L92 146M192 84L164 146M192 84L220 146" stroke="#0F7F78" stroke-width="7" stroke-linecap="round" fill="none"/>',
 P('M26 144Q26 180 64 180Q102 180 102 144Z',g('balance','mint',3,0,0,1,1)),deco('M26 144Q26 180 64 180Q102 180 102 144Z'),P('M154 144Q154 180 192 180Q230 180 230 144Z',g('balance','mint',4,0,0,1,1)),deco('M154 144Q154 180 192 180Q230 180 230 144Z'),
 P(rr(70,196,116,28,14),g('balance','teal',5,0,0,1,1)),P(circ(128,56,16),g('balance','yellow',6,0,0,1,1))])
# ---------- ingresos: billetera ----------
bill='M58 58L176 40Q190 38 192 52L204 128L72 148Z'
wal=rr(32,84,192,138,34);flap=rr(146,124,88,58,22)
reg('ingresos',[P(bill,g('ingresos','mint',1,0,0,1,1,'light')),P(wal,g('ingresos','green',2,0,0,1,1)),deco(wal),P(flap,g('ingresos','teal',3,0,0,1,1,'dark')),P(circ(178,153,11),'#C8F7E4')])
# ---------- gastos: recibo + moneda ----------
rec='M60 32H196Q216 32 216 52V222L194 208L172 222L150 208L128 222L106 208L84 222L62 208L40 222V52Q40 32 60 32Z'
reg('gastos',[P(rec,g('gastos','red',1,0,0,1,1)),deco(rec)]+[P(rr(64,y,w,14,7),'#FFE3E8',f'opacity="{o}"') for y,w,o in [(66,128,.95),(96,96,.85),(126,112,.75)]]+[P(circ(186,172,42),g('gastos','coral',2,0,0,1,1,'light')),P(circ(186,172,26),g('gastos','coral',3,0,0,1,1)),deco(circ(186,172,42))])
# ---------- fijos: bombillo ----------
bulb='M128 30C171 30 204 62 204 104C204 132 190 150 176 164C168 172 164 180 164 190H92C92 180 88 172 80 164C66 150 52 132 52 104C52 62 85 30 128 30Z'
reg('fijos',[P(bulb,g('fijos','yellow',1,.2,0,.8,1)),deco(bulb),'<path d="M106 128Q128 92 150 128" stroke="#FFFBEA" stroke-width="10" stroke-linecap="round" fill="none" opacity=".9"/>',P(rr(90,186,76,24,10),g('fijos','navy',2,0,0,1,0)),P(rr(98,208,60,20,10),g('fijos','navy',3,0,0,1,0,'dark'))])
# ---------- tarjetas ----------
back=rr(58,46,164,112,22);front=rr(22,90,200,134,26)
reg('tarjetas',[f'<g transform="rotate(10 140 102)">{P(back,g("tarjetas","purple",1,0,0,1,1,"light"))}</g>',P(front,g('tarjetas','blue',2,0,0,1,1)),deco(front),P('M22 120H222V146H22Z',g('tarjetas','navy',3,0,0,1,0),'opacity=".55"'),P(rr(46,168,44,32,9),g('tarjetas','yellow',4,0,0,1,1))])
# ---------- suscripciones: ciclo ----------
reg('suscripciones',['<path d="M52 128A76 76 0 0 1 190 84" stroke="url(#iso-suscripciones-1)" stroke-width="32" stroke-linecap="round" fill="none"/>',P('M206 112L218 64L168 98Z',g('suscripciones','purple',1,0,0,1,1)),
 '<path d="M204 128A76 76 0 0 1 66 172" stroke="url(#iso-suscripciones-2)" stroke-width="32" stroke-linecap="round" fill="none"/>',P('M50 144L38 192L88 158Z',g('suscripciones','pink',2,1,1,0,0,'light').replace('url(#iso-suscripciones-2)','url(#iso-suscripciones-2)'))])
# ---------- correo: sobre ----------
env=rr(26,58,204,144,30)
reg('correo',[P(env,g('correo','cyan',1,0,0,1,1)),deco(env),P('M40 196L112 132Q128 120 144 132L216 196Z',g('correo','blue',2,0,0,1,1,'light'),'opacity=".55"'),P('M38 66Q128 154 218 66Q212 60 200 58H56Q44 60 38 66Z',g('correo','cyan',3,0,0,1,1,'light'))])
# ---------- importar: documento + flecha ----------
doc='M66 26H156L206 76V210Q206 228 188 228H66Q48 228 48 210V44Q48 26 66 26Z'
reg('importar',[P(doc,g('importar','teal',1,0,0,1,1)),deco(doc),P('M156 26V62Q156 76 170 76H206Z',g('importar','mint',2,0,0,1,1,'light')),P(circ(180,186,46),g('importar','green',3,0,0,1,1,'dark')),P('M180 158L206 186H190V214H170V186H154Z','#D6FBEC')])
# ---------- me deben: mano + moneda ----------
hand='M24 178Q24 152 50 148H118Q140 148 140 166Q140 184 118 184H98H150L204 152Q224 140 232 160Q236 174 222 184L162 222Q150 230 134 230H56Q24 230 24 200Z'
reg('me-deben',[P(circ(146,82,50),g('me-deben','yellow',1,0,0,1,1)),deco(circ(146,82,50)),P(circ(146,82,32),g('me-deben','amber',2,0,0,1,1,'light'),'opacity=".8"'),P(hand,g('me-deben','green',3,0,0,1,1)),deco(hand)])
# ---------- le debo: banco ----------
cols=''.join(P(rr(x,104,28,84,10),g('le-debo','orange',2,0,0,0,1)) for x in (56,94,134,172))
reg('le-debo',[f'<path d="M128 40L218 92H38Z" fill="{g("le-debo","coral",1,0,0,1,1,"light")}" stroke="url(#iso-le-debo-1)" stroke-width="22" stroke-linejoin="round"/>',cols,P(rr(34,192,188,30,14),g('le-debo','orange',3,0,0,1,1,'dark')),P(circ(128,76,12),'#FFF1E6')])
# ---------- contactos: libreta ----------
book=rr(50,26,166,204,28)
reg('contactos',[P(book,g('contactos','amber',1,0,0,1,1)),deco(book),P('M50 54Q50 26 78 26H92V230H78Q50 230 50 202Z',g('contactos','orange',2,0,0,1,1,'dark'),'opacity=".85"')]+[P(rr(38,y,34,14,7),'#FFE7C2') for y in (66,122,178)]+[P(circ(154,102,30),'#FFF3DE'),P('M106 180Q106 142 154 142Q202 142 202 180Z','#FFF3DE')])
# ---------- salir de deudas: eslabón roto ----------
reg('estrategia',['<rect x="30" y="92" width="122" height="66" rx="33" transform="rotate(-40 91 125)" stroke="url(#iso-estrategia-1)" stroke-width="26" fill="none"/>','<rect x="114" y="110" width="122" height="66" rx="33" transform="rotate(-40 175 143)" stroke="url(#iso-estrategia-2)" stroke-width="26" fill="none"/>',
 '<path d="M118 196L104 222M146 202L150 230M96 176L70 186" stroke="#FFB3C0" stroke-width="9" stroke-linecap="round"/>'])
g('estrategia','red',1,0,0,1,1);g('estrategia','coral',2,0,0,1,1)
# ---------- presupuesto: torta ----------
main='M120 136L192.7 94A84 84 0 1 1 120 52Z';sl='M130 120L130 36A84 84 0 0 1 202.7 78Z';inner='M120 136L47.3 178A84 84 0 0 1 47.3 94Z'
reg('presupuesto',[P(main,g('presupuesto','blue',1,0,0,1,1)),P(inner,g('presupuesto','cyan',2,0,0,1,1,'light'),'opacity=".9"'),deco(main),P(sl,g('presupuesto','yellow',3,0,0,1,1)),deco(sl)])
# ---------- flujo: gráfica ascendente ----------
area='M36 178L92 130L136 158L208 78V214Q208 224 198 224H46Q36 224 36 214Z'
reg('flujo',[P(area,g('flujo','cyan',1,0,0,0,1,'light'),'opacity=".55"'),'<path d="M36 178L92 130L136 158L208 78" stroke="url(#iso-flujo-2)" stroke-width="28" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',P(circ(208,78,24),g('flujo','blue',3,0,0,1,1,'light'))])
g('flujo','cyan',2,0,1,1,0,'dark')
# ---------- metas: diana + dardo ----------
reg('metas',[P(circ(120,136,94),g('metas','red',1,0,0,1,1)),deco(circ(120,136,94)),P(circ(120,136,64),g('metas','coral',2,0,0,1,1,'light')),P(circ(120,136,36),g('metas','red',3,0,0,1,1)),P(circ(120,136,12),'#FFE3E8'),
 '<path d="M124 132L206 50" stroke="#2C3A66" stroke-width="12" stroke-linecap="round"/>',P('M200 40L232 36L228 68L210 62L206 46Z',g('metas','amber',4,0,0,1,1))])
# ---------- retos: trofeo ----------
cup='M70 36H186V96Q186 158 128 162Q70 158 70 96Z'
reg('retos',['<path d="M72 58H52Q34 58 36 80Q40 110 76 118M184 58H204Q222 58 220 80Q216 110 180 118" stroke="#E09A0A" stroke-width="16" fill="none" stroke-linecap="round"/>',P(cup,g('retos','yellow',1,.2,0,.8,1)),deco(cup),P(rr(114,158,28,30,8),g('retos','amber',2,0,0,1,1)),P(rr(76,186,104,36,14),g('retos','orange',3,0,0,1,1,'dark')),P('M128 70C131 88 136 93 154 96C136 99 131 104 128 122C125 104 120 99 102 96C120 93 125 88 128 70Z','#FFFBEA','opacity=".9"')])
# ---------- primas: regalo ----------
box=rr(42,114,172,108,22);lid=rr(30,84,196,44,18)
reg('primas',[P(box,g('primas','orange',1,0,0,1,1)),deco(box),P(lid,g('primas','coral',2,0,0,1,1,'light')),P('M114 84H142V222H114Z',g('primas','red',3,0,0,0,1),'opacity=".9"'),
 f'<ellipse cx="98" cy="66" rx="32" ry="18" transform="rotate(-25 98 66)" fill="{g("primas","red",4,0,0,1,1,"light")}"/>','<ellipse cx="158" cy="66" rx="32" ry="18" transform="rotate(25 158 66)" fill="url(#iso-primas-4)"/>',P(circ(128,80,14),g('primas','red',5,0,0,1,1))])
# ---------- familia: corazón ----------
heart='M128 218C60 170 26 138 26 96C26 62 52 38 84 38C104 38 119 48 128 64C137 48 152 38 172 38C204 38 230 62 230 96C230 138 196 170 128 218Z'
small='M176 70C162 70 152 80 152 94C152 112 166 124 190 140C214 124 228 112 228 94C228 80 218 70 204 70C196 70 192 74 190 78C188 74 184 70 176 70Z'
reg('familia',[P(heart,g('familia','purple',1,0,0,1,1)),deco(heart),P(small,g('familia','pink',2,0,0,1,1,'light'),'opacity=".95"')])
# ---------- mesadas: alcancía ----------
pig=ell(124,142,94,72)
reg('mesadas',[P(circ(126,48,26),g('mesadas','yellow',1,0,0,1,1)),P(rr(72,186,28,38,12),g('mesadas','pink',2,0,0,0,1,'dark')),P(rr(146,186,28,38,12),'url(#iso-mesadas-2)'),P('M74 96L70 56Q70 48 78 52L112 76Z',g('mesadas','pink',3,0,0,1,1)),P(pig,g('mesadas','pink',4,0,0,1,1)),deco(pig),P(rr(196,120,40,44,16),g('mesadas','red',5,0,0,1,1,'light')),P(rr(102,82,48,11,5),'#9E1E5E','opacity=".7"'),P(circ(176,120,7),'#5B1035')])
# ---------- compartidos: moneda partida ----------
L='M116 40A88 88 0 0 0 116 216Z';R='M140 52A88 88 0 0 1 140 228Z'
reg('compartidos',[P(L,g('compartidos','yellow',1,0,0,1,1)),deco(L),P(R,g('compartidos','amber',2,0,0,1,1)),deco(R),'<path d="M100 72A60 60 0 0 0 100 184" stroke="#FFF6CC" stroke-width="10" fill="none" opacity=".8" stroke-linecap="round"/>','<path d="M156 84A60 60 0 0 1 156 196" stroke="#FFE8B0" stroke-width="10" fill="none" opacity=".8" stroke-linecap="round"/>'])
# ---------- inversiones: planta ----------
pot='M78 160H178L166 216Q164 228 152 228H104Q92 228 90 216Z'
reg('inversiones',['<path d="M128 156V96" stroke="#0E7C74" stroke-width="12" stroke-linecap="round"/>',P('M126 116C94 118 64 98 58 64C94 62 120 82 126 116Z',g('inversiones','mint',1,0,0,1,1)),P('M130 104C140 64 172 40 212 44C210 84 176 108 130 104Z',g('inversiones','green',2,0,0,1,1)),deco('M130 104C140 64 172 40 212 44C210 84 176 108 130 104Z'),P(pot,g('inversiones','teal',3,0,0,1,1,'dark')),P(rr(66,146,124,24,12),g('inversiones','teal',4,0,0,1,1))])
# ---------- recordatorios: campana ----------
bell='M128 36C84 36 64 72 64 112V154L44 182Q38 194 52 194H204Q218 194 212 182L192 154V112C192 72 172 36 128 36Z'
reg('recordatorios',[P(circ(128,206,22),g('recordatorios','orange',1,0,0,1,1)),P(bell,g('recordatorios','amber',2,.2,0,.8,1)),deco(bell),P(circ(128,32,13),g('recordatorios','orange',3,0,0,1,1))])
# ---------- calendario ----------
cal=rr(30,50,196,176,34)
reg('calendario',[P(cal,g('calendario','cyan',1,0,0,1,1,'light')),P('M30 84Q30 50 64 50H192Q226 50 226 84V108H30Z',g('calendario','blue',2,0,0,1,1)),deco(cal)]+[P(rr(x,y,30,26,8),('url(#iso-calendario-3)' if (x,y)==(152,168) else '#FFFFFF'),'opacity=".9"') for x in (60,112,152) for y in (128,168)]+[P(rr(74,30,22,46,11),g('calendario','navy',4,0,0,0,1)),P(rr(160,30,22,46,11),'url(#iso-calendario-4)')])
g('calendario','blue',3,0,0,1,1)
# ---------- indicadores: velocímetro ----------
reg('indicadores',['<path d="M40 166A88 88 0 0 1 216 166" stroke="url(#iso-indicadores-1)" stroke-width="32" stroke-linecap="round" fill="none"/>',P('M122 172L186 94L134 180Z',g('indicadores','navy',2,0,0,1,1)),P(circ(128,172,22),g('indicadores','teal',3,0,0,1,1)),P(rr(70,200,116,22,11),g('indicadores','mint',4,0,0,1,0,'light'))])
g('indicadores','teal',1,0,0,1,0)
# ---------- reportes: documento + barras ----------
doc2='M66 26H156L206 76V210Q206 228 188 228H66Q48 228 48 210V44Q48 26 66 26Z'
reg('reportes',[P(doc2,g('reportes','blue',1,0,0,1,1)),deco(doc2),P('M156 26V62Q156 76 170 76H206Z',g('reportes','cyan',2,0,0,1,1,'light')),P(rr(74,160,26,44,9),'#C9ECFF'),P(rr(114,134,26,70,9),'#9EDCFF'),P(rr(154,108,26,96,9),g('reportes','yellow',3,0,0,0,1))])
# ---------- renta: portapapeles + chulo ----------
board=rr(46,42,164,188,28)
reg('renta',[P(board,g('renta','purple',1,0,0,1,1)),deco(board),P(rr(66,72,124,140,16),g('renta','paper',2,0,0,1,1)),P(rr(90,26,76,40,16),g('renta','lav',3,0,0,1,1,'light')),'<path d="M96 144L120 168L164 118" stroke="url(#iso-renta-4)" stroke-width="18" stroke-linecap="round" stroke-linejoin="round" fill="none"/>'])
g('renta','purple',4,0,0,1,1,'dark')
# ---------- perfil: carné ----------
idc=rr(22,54,212,148,28)
reg('perfil',[P(idc,g('perfil','cyan',1,0,0,1,1)),deco(idc),P(circ(84,114,26),'#E3FAFF'),P('M48 176Q48 146 84 146Q120 146 120 176Z','#E3FAFF'),P(rr(136,96,74,14,7),'#D2F6FF'),P(rr(136,124,58,14,7),'#D2F6FF','opacity=".8"'),P(rr(136,152,66,14,7),'#D2F6FF','opacity=".6"')])
# ---------- ajustes: engranaje ----------
pts=[];n=8
for i in range(n*4):
    a=i/(n*4)*2*math.pi-math.pi/2;r=100 if i%4 in (0,1) else 76
    a2=a+(0.5/(n*4))*2*math.pi*(1 if i%4 in(0,2) else -1)*0
    pts.append((128+r*math.cos(a),128+r*math.sin(a)))
gear='M'+'L'.join(f'{x:.1f} {y:.1f}' for x,y in pts)+'Z'
reg('ajustes',[f'<path d="{gear}" fill="{g("ajustes","indigo",1,0,0,1,1)}" stroke="url(#iso-ajustes-1)" stroke-width="14" stroke-linejoin="round"/>',P(gear,HL,'stroke="url(#iso-hl)" stroke-width="14" stroke-linejoin="round" opacity=".7"'),P(circ(128,128,38),g('ajustes','lav',2,0,0,1,1,'light'))])
# ---------- puesta: cohete ----------
rk='M128 24C170 50 186 100 178 162H78C70 100 86 50 128 24Z'
reg('puesta',['<g transform="translate(128 128) scale(1.14) translate(-128 -124)">',P('M106 160Q128 238 150 160Z',g('puesta','yellow',1,0,0,0,1)),P('M82 116L44 160Q38 170 50 172L84 168Z',g('puesta','coral',2,0,0,1,1,'dark')),P('M174 116L212 160Q218 170 206 172L172 168Z','url(#iso-puesta-2)'),P(rk,g('puesta','orange',3,.2,0,.8,1)),deco(rk),P(circ(128,98,24),g('puesta','blue',4,0,0,1,1,'light')),P(circ(128,98,24),HL),'</g>'])
# shared overlays
DEFS.append('<linearGradient id="iso-hl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".42"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/></linearGradient>')
DEFS.append('<linearGradient id="iso-sh" x1="0" y1="0" x2="0" y2="1"><stop offset=".55" stop-color="#0A1030" stop-opacity="0"/><stop offset="1" stop-color="#0A1030" stop-opacity=".16"/></linearGradient>')
json.dump({'defs':''.join(DEFS),'icons':ICONS},open('/home/claude/finanzas/iso/iso.json','w'))
print(len(ICONS))
