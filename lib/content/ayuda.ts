// Versión, novedades, preguntas frecuentes, guías y tour (k_ayuda.js de la v4).
// Las versiones anteriores se conservan literales (son historia); las respuestas vigentes se actualizan a la v5.
import RELEASES_V4 from "@/lib/data/legacy-releases.json"
import FAQ_V4 from "@/lib/data/legacy-faq.json"
import GUIDES_RAW from "@/lib/data/legacy-guides.json"
import TOUR_RAW from "@/lib/data/legacy-tour.json"

export type ReleaseItem = [kind: "new" | "imp" | "fix", title: string, desc: string]
export type Release = { v: string; f: string; t: string; items: ReleaseItem[] }
export type Faq = { c: string; q: string; a: string; go?: string; tab?: string }
export type Guide = { id: string; t: string; icon: string; go: string; min: number; s: string[]; tip?: string }

export const APP_VER = "5.5"

const V5: Release = {
  v: "5.0", f: "31 oct 2026", t: "Mirai en la nube: tu familia, en tiempo real",
  items: [
    ["new", "Cuentas de verdad", "Entras con correo y contraseña, enlace mágico o Google, con verificación en dos pasos opcional. Tus datos viven en la nube y se sincronizan entre tus dispositivos."],
    ["new", "Hogares y permisos", "Invita a tu pareja o a tus hijos a tu hogar como editores o lectores. Cada hogar puede tener varios libros."],
    ["new", "Cambios en vivo", "Si alguien de tu familia registra un gasto, lo ves al instante en tu pantalla."],
    ["new", "Integraciones en Ajustes", "Activa, ajusta y prueba la IA (Gemini, Groq, OpenRouter, Claude, OpenAI o el AI Gateway), el correo, Telegram, notificaciones push, WhatsApp, TRM, usura, festivos, cripto y acciones."],
    ["new", "Avisos aunque no abras Mirai", "Un resumen por correo, Telegram, push o WhatsApp a la hora que elijas, con la matriz de qué aviso va por qué canal."],
    ["new", "Acceso del contador en vivo", "Tu contador entra con un enlace privado, ve tu información actualizada sin poder cambiarla, descarga los documentos que subas y te deja notas."],
    ["new", "Documentos de la renta", "Sube tus certificados (PDF o foto) a cada documento de la lista. Quedan guardados de forma privada."],
    ["imp", "TRM, usura y festivos automáticos", "Se actualizan solos cada día desde la Superfinanciera y datos.gov.co."],
    ["imp", "Respaldos en la nube", "Crea copias, restaura y descarga todos tus datos (Ley 1581) desde Ajustes › Datos y cuenta."],
    ["imp", "Más rápido en el celular", "Instala Mirai en la pantalla de inicio y úsalo como una app."],
  ],
}

const V51: Release = {
  v: "5.1", f: "1 nov 2026", t: "Un Mirai más tuyo: nuevo diseño y perfil",
  items: [
    ["new", "Elige tu avatar", "Toca tu foto en Perfil y escoge entre 10 avatares de Mirai, tu foto de Google, una foto tuya o tus iniciales. Cada integrante de la familia también puede tener el suyo."],
    ["new", "Tu foto de Google", "Si entras con Google y no tienes foto, Mirai usa la de tu cuenta. También puedes vincular Google desde Perfil."],
    ["new", "Perfil más completo", "Apodo para saludarte, fecha de nacimiento (te saludamos en tu cumpleaños), color de portada, avance del perfil y tus cuentas conectadas."],
    ["new", "Logos de tus servicios", "Netflix, Spotify, Google, Telegram, Visa y muchos más aparecen con su logo en Suscripciones, Tarjetas e Integraciones."],
    ["imp", "Nuevo diseño", "Fondo con degradado, menú y tarjetas translúcidas, y un banner ilustrado en cada sección."],
    ["fix", "Formularios que no se borran", "Si giras el celular o cambias el tamaño de la ventana con un formulario abierto, ya no se pierde lo que escribiste."],
    ["fix", "Borrar justo después de crear", "Ya puedes eliminar un registro apenas lo creas, sin esperar a que termine de guardarse."],
  ],
}
const V52: Release = {
  v: "5.2", f: "1 nov 2026", t: "Tu opinión cuenta",
  items: [
    ["new", "Califica Mirai y danos tu opinión", "En Ayuda › Tu opinión (o desde tu foto en el menú) puedes calificarnos, reportar algo que no funciona con una captura, pedir funciones o dejar sugerencias. Ves el estado de cada una y nuestra respuesta."],
    ["new", "Escoge el modelo de IA de una lista", "Al configurar Gemini, Groq, OpenRouter, Claude, OpenAI o el AI Gateway, el modelo se elige de la lista de tu cuenta, con el recomendado primero y los gratis aparte."],
    ["imp", "Reporta un error en un toque", "Si una sección falla, el botón Reportar este error nos lo envía con la página donde pasó."],
    ["imp", "Íconos con nombre en español", "Al elegir el ícono de una categoría, medio de pago o meta ves su nombre en español (Efectivo, Transferencia, Billetera…)."],
    ["fix", "Cambiar solo el ícono", "Cambiar el ícono de un medio de pago o una categoría sin tocar el nombre ya no muestra un error."],
    ["fix", "Mensajes de IA más claros", "Mirai ya no dice que el modelo no existe cuando el problema es la clave o el límite de uso del proveedor."],
  ],
}
const V53: Release = {
  v: "5.3", f: "1 nov 2026", t: "Mirai Premium",
  items: [
    ["new", "Planes Gratis y Premium", "Lo básico sigue gratis para siempre. Premium agrega la IA, la automatización con tu banco, los impuestos con tu contador y toda la familia con varios libros, sin anuncios. Míralo en Planes."],
    ["new", "Paga como prefieras", "Con tarjeta (se renueva sola y la cancelas cuando quieras) o con Nequi, PSE o Bancolombia por un mes o un año. Todo en Ajustes › Mi plan."],
    ["new", "Avisos de tu plan", "Te avisamos cuando se aprueba un pago, si se rechaza y 5 días antes de que venza Premium."],
    ["new", "Servicios incluidos por Mirai", "Algunas integraciones (como el correo o la IA) pueden venir incluidas por Mirai: las ves marcadas en Ajustes › Integraciones y funcionan sin configurar nada."],
    ["new", "Cupones de descuento", "Si tienes un cupón, escríbelo en Planes antes de pagar."],
    ["imp", "Términos actualizados", "Explicamos los pagos, el derecho de retracto de 5 días hábiles y los anuncios del plan gratis. Te pedimos aceptarlos de nuevo."],
  ],
}
const V55: Release = {
  v: "5.5", f: "2 nov 2026", t: "Automatiza tu plata y entiende cada peso",
  items: [
    ["new", "Automatizaciones", "Crea flujos con un diagrama: \"si pasa esto, haz aquello\". Por ejemplo, avísame si un gasto pasa de $200.000, ahorra el 10 % de cada ingreso o recuérdame 3 días antes de cada pago. Ya trae plantillas listas; en el plan gratis tienes 3 activas."],
    ["new", "Recibo de tu ingreso", "Al agregar un ingreso ves a la derecha un recibo que se arma mientras escribes. Toca Más detalle para ver cada descuento, lo que llega en cada pago, las próximas fechas y el año completo."],
    ["new", "Uso de IA", "En Ajustes › Uso de IA ves cuántos créditos de IA llevas este mes, cuánto te queda, en qué los usaste y cuánto ahorraste con las respuestas que Mirai calcula sin IA."],
    ["imp", "IA más rápida y económica", "Preguntas como \"¿cuánto gasté en mercado?\" se responden al instante con tus datos, sin gastar IA. La categoría de un gasto se busca primero en tus reglas e historial."],
    ["imp", "Avisos por correo", "Elige en Ajustes › Alertas por qué canal quieres tus avisos y toca Enviarme una prueba para comprobar que te llegan."],
    ["imp", "Ajustes más simples", "Las conexiones de correo, WhatsApp, Telegram y datos de referencia las maneja Mirai. Tú solo escoges tu inteligencia artificial."],
    ["new", "Centro de ayuda", "El panel de ayuda ahora es un Centro de ayuda: busca en todo (preguntas, manual, guías, academia y glosario), mira la ayuda de la pantalla donde estás, marca las novedades como leídas, dinos si una respuesta te sirvió, consulta el glosario financiero de Colombia y los atajos de teclado, revisa el estado del servicio y abre un caso de soporte. Ábrelo desde el menú, con la tecla ? o con Cómo funciona."],
    ["imp", "Academia por niveles", "Once lecciones en tres niveles (básico, intermedio y avanzado), con insignias y la siguiente lección sugerida. Nuevas: lo que te descuentan de la nómina, prima y cesantías, y cómo cuidar tu historial de crédito."],
    ["imp", "Tu opinión más completa", "Ahora puedes enviarnos un elogio, decidir si incluimos la página donde estás y filtrar lo que nos has enviado (sin resolver, con respuesta o casos de soporte)."],
    ["imp", "Mensajes y avisos renovados", "Los mensajes de confirmación tienen el estilo de Facebook y una barra que muestra cuánto falta para que se cierren (se pausa si pasas el mouse). Los avisos y las ventanas de confirmación también se ven más claros."],
    ["fix", "Ayudas en el celular", "Los íconos (i) de ayuda ya se abren con un toque en el celular."],
  ],
}
const V54: Release = {
  v: "5.4", f: "1 nov 2026", t: "Más herramientas para tu plata",
  items: [
    ["new", "Calculadoras", "CDT con retención, crédito con tabla de pagos, ahorro y metas con interés compuesto, 4×1000 e inflación. En Planeación › Calculadoras."],
    ["new", "Lista de deseos", "Anota lo que te antoja y espera 7, 30 o 60 días antes de comprar. Mirai te muestra cuánto te ahorraste al no comprar por impulso."],
    ["new", "Hallazgos en Inicio", "Mirai te avisa qué categoría subió o bajó frente al mes pasado, gastos fuera de lo normal y tu día de más gasto."],
    ["new", "Patrimonio mes a mes", "En Balance ves cómo cambia lo que tienes menos lo que debes, mes a mes."],
    ["new", "Academia Mirai", "Ocho lecciones cortas (presupuesto, emergencia, tasas, deudas, tarjeta, inversión y renta) con repaso."],
    ["new", "Invita y gana", "Comparte tu enlace: cuando alguien se registra y crea su hogar, los dos ganan días de Mirai Premium."],
    ["imp", "Bienvenida y migas de pan", "Una bienvenida al entrar por primera vez y, arriba de cada sección, el camino para volver atrás."],
    ["imp", "Menús más cómodos", "Los menús de opciones ya no parten el texto en varias líneas."],
    ["new", "Ingresos y gastos por quincena", "Si te pagan por quincena puedes poner un valor distinto en cada una, escoger los días de pago y decir en cuál te descuentan salud, pensión y retención (por ejemplo, la 1ª completa y todo el descuento en la 2ª). Los gastos fijos quincenales también pueden tener un valor distinto en cada quincena."],
    ["new", "Agregar ingreso paso a paso", "Primero escoges el tipo (salario, bono, prima, honorarios, pensión…), luego si te descuentan salud, pensión, fondo de solidaridad y retención, y cuánto ganas al mes. Al escoger cada cuánto te pagan repartimos el mes en cada pago (quincena, semana o día) y puedes ajustar cada valor."],
    ["imp", "Retención y fondo de solidaridad a tu medida", "La ley permite dos formas de calcular la retención y tu empresa escoge una: si tu desprendible dice \"Procedimiento 2\" con un porcentaje, escríbelo y el cálculo coincide con tu nómina. En Ajustes › Finanzas › Nómina dejas el procedimiento de siempre y puedes cambiar la tabla del fondo de solidaridad si cambia la ley. Los aportes se redondean como en la planilla PILA."],
    ["imp", "Pagos semanales, diarios y anuales", "Escoge el día de la semana en que te pagan, cuántos días te pagan al mes si es por día y el mes de un ingreso anual (como una prima o un bono de fin de año)."],
    ["imp", "Anuncios con límite", "En el plan gratis cada anuncio sale pocas veces al día y puedes cerrar la barra de arriba. Con Premium no ves ninguno."],
  ],
}
export const RELEASES: Release[] = [V55, V54, V53, V52, V51, V5, ...(RELEASES_V4 as Release[])]

const FIX: Record<string, Partial<Faq>> = {
  "¿Cómo le doy acceso a mi contador?": { a: "Ve a <b>DIAN › Acceso de tu contador</b>, escribe su nombre, elige qué puede ver y hasta cuándo, y envíale el enlace. Solo puede ver, descargar los documentos y dejarte notas. Puedes quitarle el acceso cuando quieras." },
  "¿Qué servicio de correo uso: Gmail, SendGrid, Resend o SMTP?": { a: "Ninguno: el correo lo pone Mirai. Tú solo eliges en <b>Ajustes › Alertas</b> si quieres recibir avisos por correo y a qué dirección, y tocas <b>Enviarme una prueba</b> para comprobar que te llegan.", go: "ajustes", tab: "alertas" },
  "¿Dónde quedan guardadas mis claves?": { a: "En el servidor de Mirai, cifradas con AES-256. Tu navegador nunca las recibe: solo ve los últimos 4 caracteres.", tab: "integraciones" },
  "¿Puedo apagar la IA o usar ChatGPT o Gemini?": { a: "Sí. En <b>Ajustes › Inteligencia artificial</b> puedes apagarla, apagar funciones una por una y ordenar los proveedores. Gemini y Groq tienen plan gratis; para OpenAI o Claude se usa una clave de API (las suscripciones personales no se pueden vincular). Si un proveedor falla, Mirai prueba con el siguiente." },
  "La lectura con foto no funciona": { a: "Revisa que tengas un proveedor de IA activo y la lectura de fotos encendida en Ajustes › Inteligencia artificial. Usa una foto nítida, con buena luz y el documento completo. Si no lee bien, escribe los datos a mano.", go: "ajustes", tab: "ia" },
  "¿Dónde se guardan mis datos?": { a: "En la nube de Mirai (Supabase), protegidos con permisos por hogar: solo tú y las personas que invites pueden verlos. Puedes descargar una copia o eliminar tu cuenta en <b>Ajustes › Datos y cuenta</b>.", go: "ajustes", tab: "respaldo" },
}
export const FAQ: Faq[] = (FAQ_V4 as Faq[]).map((f) => ({ ...f, ...(FIX[f.q] ?? {}) }))
export const FAQ_CATS = [...new Set(FAQ.map((f) => f.c))]
/** Guías nuevas de la v5 (van primero) + instructivos de la v4. */
const GUIDES_V5: Guide[] = [
  {
    id: "primeros-pasos", t: "Primeros pasos en Mirai", icon: "rocket", go: "puesta", min: 5,
    s: [
      "Abre <b>Puesta en marcha</b> en el menú: es la guía para dejar tu libro listo. Cada paso abre el formulario que necesitas.",
      "Agrega tus <b>ingresos</b> (salario, honorarios, pensión…). Es lo más importante: sin eso no podemos decirte cuánto te queda.",
      "Registra tus <b>gastos fijos</b>: arriendo, servicios, internet, cuotas. Se repiten solos cada mes.",
      "Si tienes préstamos o tarjetas, agrégalos en <b>Préstamos y deudas</b> y en <b>Tarjetas de crédito</b>.",
      "Desde ahí, registra lo que gastas con el botón <b>Agregar</b> (o la tecla N) y mira en <b>Inicio</b> cuánto te queda en la quincena.",
    ],
    tip: "¿Manejas la plata con tu pareja o tu familia? Invítalos en <b>Ajustes › Hogar y familia</b> y verán los cambios en vivo.",
  },
  {
    id: "nomina", t: "Registrar tu nómina con descuentos", icon: "briefcase", go: "ingresos", min: 3,
    s: [
      "Ve a <b>Ingresos</b> y toca <b>Agregar ingreso</b>.",
      "En <b>¿Qué tipo de ingreso es?</b> escoge <b>Salario</b>.",
      "Cuando te pregunte por los descuentos, elige <b>Sí, me descuentan</b> y escribe tu salario <b>antes de descuentos</b> (el de tu contrato).",
      "Revisa lo que te descuentan: <b>salud</b>, <b>pensión</b>, <b>fondo de solidaridad</b> (solo si ganas 4 salarios mínimos o más) y <b>retención en la fuente</b>. Si tu desprendible dice <b>Procedimiento 2</b> con un porcentaje, escoge esa opción y escríbelo.",
      "En <b>¿Cada cuánto te pagan?</b> elige <b>Cada quincena</b> (o cada mes) y, en <b>¿En qué quincena te hacen los descuentos?</b>, si van mitad y mitad, todo en la 1ª, todo en la 2ª o una parte en cada una.",
      "Mira el resumen: es lo que te llega en cada pago. Si no coincide con tu desprendible, ajusta el valor de cada quincena y guarda.",
    ],
    tip: "El procedimiento de retención que usa tu empresa y la tabla del fondo de solidaridad se dejan fijos en <b>Ajustes › Finanzas › Nómina</b>.",
  },
  {
    id: "quincena", t: "Usar la quincena", icon: "calendar-range", go: "balance", min: 3,
    s: [
      "Registra tus ingresos con sus días de pago y tus gastos fijos con el día en que los pagas.",
      "Abre <b>Balance y quincenas</b> y entra a la pestaña de la quincena: ves lo que entra, lo que sale y lo que te queda en esa mitad del mes.",
      "Cambia de mes con las flechas para ver lo que viene.",
      "En <b>Inicio</b>, la tarjeta de la quincena te dice cuánto te queda hoy.",
      "Si un gasto fijo es quincenal, puedes ponerle un valor distinto en cada quincena.",
    ],
    tip: "Si te pagan por quincena pero el arriendo sale de la primera, ponlo con su día de pago: Mirai lo ubica en la quincena correcta.",
  },
  {
    id: "familia", t: "Invitar a tu familia", icon: "users", go: "ajustes?tab=hogar", min: 2,
    s: [
      "Ve a <b>Ajustes › Hogar y familia</b>.",
      "En <b>Invitar a alguien</b> escribe su correo y elige el permiso: <b>Editor</b> (registra y cambia movimientos) o <b>Lector</b> (solo puede ver).",
      "Toca <b>Invitar</b>. La invitación vence en 7 días.",
      "Cuando la acepte, entra a tu hogar y los dos ven los cambios en vivo.",
    ],
    tip: "Varios integrantes y varios libros hacen parte de Mirai Premium.",
  },
]
export const GUIDES: Guide[] = [...GUIDES_V5, ...(GUIDES_RAW as Guide[])]
/** Tour de la v4 con el Centro de ayuda (botón del menú y "Cómo funciona" de cada sección). */
export const TOUR = (TOUR_RAW as { sel: string; t: string; d: string }[]).flatMap((s) =>
  s.sel === ".page-h .help-btn"
    ? [
        { sel: '[data-tour="user"]', t: "Centro de ayuda", d: "En tu menú de abajo (y en Soporte) está el Centro de ayuda: novedades, preguntas frecuentes, manual, guías, academia, glosario y soporte en un solo lugar. Atajo: tecla ?." },
        { ...s, d: "En cada sección este botón abre el Centro de ayuda con el paso a paso de esa pantalla." },
      ]
    : [s])
export const stripHtml = (s: string) => s.replace(/<[^>]+>/g, "")
