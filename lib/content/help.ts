import HELP_RAW from "@/lib/data/legacy-help.json"
import MDESC_RAW from "@/lib/data/legacy-mdesc.json"
import FHELP_RAW from "@/lib/data/legacy-fhelp.json"

/** Ayuda "Cómo funciona" por sección: título, introducción, pasos y consejos (textos literales de la v4). */
export type HelpEntry = { t: string; i: string; p: string[]; tips?: string[] }
export const HELP: Record<string, HelpEntry> = {
  ...(HELP_RAW as Record<string, HelpEntry>),
  consejero: {
    t: "Consejero", i: "Tu asesor financiero en un chat: pregúntale lo que quieras de tu plata o cuéntale una decisión y te dice si te conviene con tus números reales.",
    p: [
      "Escribe con tus palabras en la caja de abajo, toca una de las preguntas sugeridas o dicta con el micrófono. Enter envía y Shift + Enter hace un salto de línea.",
      "Para decidir, escribe la decisión con el valor: <b>\"¿me conviene comprar una moto de 8 millones a 24 cuotas?\"</b>. Mirai la analiza con tus ingresos, gastos y deudas y te muestra una tarjeta con el veredicto, las cifras clave, los riesgos y los pasos. Si falta un dato, te lo pregunta en la conversación.",
      "Preguntas como <b>¿cuánto gasté este mes?</b> o <b>¿cuánto debo?</b> se responden al instante con tus datos (verás la marca <b>Calculado con tus datos</b>).",
      "Pídele que registre un gasto o un ingreso, cree una meta o un recordatorio: te muestra una tarjeta y solo guarda cuando tocas <b>Confirmar</b>. Con el clip adjuntas la foto o el PDF de una factura, un comprobante o un extracto.",
      "A la izquierda (en el celular, en <b>Historial</b>) están tus conversaciones por fecha. Con el botón <b>⋯</b> o clic derecho puedes fijarlas arriba, renombrarlas, pedir un título nuevo, duplicarlas, archivarlas, copiarlas o descargarlas en Markdown o PDF, copiar su enlace, ver sus detalles o eliminarlas (con Deshacer). Con <b>Seleccionar varias</b> archivas o eliminas muchas a la vez. La burbuja flotante abre la misma conversación.",
    ],
    tips: [
      "En cada respuesta puedes copiar, regenerar, calificar con el pulgar o editar tu pregunta y volver a enviarla. Mientras escribe, toca el cuadrado para detenerla.",
      "Elige el tono Sencillo o Financiero arriba a la derecha (o en el menú ⋯ de la conversación).",
      "Atajos: Ctrl/⌘ + Shift + O abre una conversación nueva y Ctrl/⌘ + K busca en tus conversaciones (presiónalo otra vez para buscar en todo Mirai).",
      "En el plan gratis te responde con tus datos y analiza decisiones con tus números; la conversación con inteligencia artificial es Premium.",
    ],
  },
  opiniones: {
    t: "Tu opinión", i: "Aquí nos cuentas qué piensas de Mirai y ves qué pasó con lo que nos enviaste.",
    p: ["Toca <b>Enviar una opinión</b> y elige el tema: calificar, algo que no funciona, una función que quieres, una sugerencia, un elogio o una duda.", "Si es un error, adjunta una captura de pantalla: nos ayuda a encontrarlo más rápido. Puedes decidir si incluimos la página donde estás.", "Cada opinión muestra su estado (<b>Recibido</b>, <b>En revisión</b>, <b>Planeado</b>, <b>Listo</b>) y nuestra respuesta. Te llega un aviso cuando respondemos.", "Si necesitas ayuda con algo puntual, abre un caso en <b>Centro de ayuda › Contactar soporte</b>: aparece aquí con su número."],
    tips: ["Nunca enviamos tus montos ni tus datos financieros: solo lo que escribes, la página donde estabas (si la incluyes) y tu tipo de pantalla."],
  },
  proveedores: {
    t: "Proveedores", i: "Las empresas o personas a las que les pagas: Enel, el acueducto, la inmobiliaria, Claro, el colegio… Guárdalas una vez y elígelas en vez de escribir el nombre.",
    p: [
      "Toca <b>Agregar proveedor</b> y escribe su nombre. Mirai sugiere el tipo (servicios públicos, internet, arriendo, salud…) y muestra su logo si lo conoce.",
      "Si quieres, guarda el número de contrato o de cliente, el teléfono, el correo y la página donde pagas: así los tienes a mano.",
      "Elige una <b>categoría del gasto</b>: cuando escojas este proveedor en un gasto fijo o un gasto, Mirai pone esa categoría si aún no tiene una.",
      "En la tabla ves en cuántos gastos fijos, suscripciones y gastos lo usas y <b>cuánto le pagas al mes</b>. Búscalo, fíltralo por tipo, ordénalo o expórtalo a Excel.",
      "Con el botón <b>⋯</b> lo editas, lo desactivas (si ya no le pagas) o lo eliminas (con Deshacer).",
    ],
    tips: ["En los formularios, escribe el nombre en el selector de proveedor y toca <b>Agregar proveedor</b>: queda creado y elegido de una vez.", "Abajo tienes proveedores comunes en Colombia para agregarlos con un toque; solo se guardan los que elijas."],
  },
  deseos: {
    t: "Lista de deseos", i: "Antes de comprar algo que no necesitas ya, anótalo y espera unos días.",
    p: ["Agrega lo que te antoja con su precio y qué tanto lo necesitas.", "Mirai te muestra cuántos días faltan para decidir (la regla de los 30 días).", "Al final marca <b>Lo compré</b> o <b>Ya no lo quiero</b>: verás cuánto te ahorraste al no comprar por impulso."],
    tips: ["Si pasados los días lo sigues queriendo y te cabe en el presupuesto, cómpralo tranquilo."],
  },
  calculadoras: {
    t: "Calculadoras", i: "Haz cuentas antes de decidir. Todos los resultados son estimados.",
    p: ["<b>CDT</b>: cuánto ganas, con la retención en la fuente.", "<b>Crédito</b>: tu cuota, cuánto pagas en total y la tabla mes a mes.", "<b>Ahorro y metas</b>: cuánto tendrás, o cuánto ahorrar al mes para llegar a una meta.", "<b>4×1000</b> e <b>inflación</b>: lo que se lleva el banco y lo que pierde la plata quieta."],
  },
  academia: {
    t: "Academia Mirai", i: "Lecciones de 2 a 4 minutos para entender tu plata.",
    p: ["Abre una lección, léela y responde la pregunta de repaso.", "Tu avance queda guardado.", "Cada lección te lleva a la sección de Mirai donde lo pones en práctica."],
  },
  referidos: {
    t: "Invita y gana", i: "Comparte Mirai y gana días de plan gratis.",
    p: ["Copia tu enlace o compártelo por WhatsApp.", "Cuando tu invitado se registra y crea su hogar, los dos reciben días de Mirai Premium.", "Aquí ves a quién invitaste y si ya recibieron el premio."],
  },
  planes: {
    t: "Planes de Mirai", i: "Lo básico es gratis para siempre. Premium agrega lo que más tiempo te ahorra.",
    p: ["<b>Gratis</b>: gastos, ingresos, quincena, presupuesto, préstamos, metas, avisos y más, con anuncios.", "<b>Premium</b>: inteligencia artificial, automatización con tu banco, impuestos y contador, y toda la familia con varios libros. Sin anuncios.", "Paga con tarjeta (se renueva sola y la cancelas cuando quieras) o con Nequi, PSE o Bancolombia por un mes o un año."],
    tips: ["El plan es del hogar: si el dueño paga, todos los integrantes tienen Premium.", "Si vuelves a Gratis no se borra nada."],
  },
  automatizaciones: {
    t: "Automatizaciones", i: "Pon a Mirai a trabajar por ti: cuando pase algo con tu plata, Mirai hace lo que le digas, solo.",
    p: [
      "Cada automatización es un <b>diagrama</b> que se lee de arriba hacia abajo: un <b>disparador</b> (lo que la pone a andar), <b>condiciones</b> (preguntas con dos caminos: Sí o No) y <b>acciones</b> (lo que Mirai hace).",
      "Empieza con una <b>plantilla</b> o con las que ya te dejamos listas. Toca una para abrir el editor, arrastra pasos desde la izquierda y únelos con líneas.",
      "Toca un paso para cambiar sus datos a la derecha. En los textos puedes usar variables como <b>{monto}</b> o <b>{descripcion}</b>.",
      "Toca <b>Probar</b> para ver el recorrido con tus datos reales sin cambiar nada. Cuando todo esté bien, actívala con el interruptor.",
      "En <b>Historial</b> ves cada vez que corrió, qué hizo y si algo falló.",
    ],
    tips: [
      "Las que crean movimientos o apartan plata empiezan pausadas: revísalas antes de activarlas.",
      "Con el plan Gratis puedes tener 3 automatizaciones activas a la vez; con Premium, todas las que quieras y el paso de consejo con IA.",
      "Una automatización nunca se dispara con los gastos que ella misma crea: así no se forman bucles.",
    ],
  },
  hogar: {
    t: "Tu hogar", i: "Las personas con las que llevas las cuentas de la casa, en una sola lista: quienes usan Mirai, quienes solo registras tú y las invitaciones que enviaste.",
    p: [
      "Toca <b>Agregar persona</b>. Elige <b>Invitarla para que use Mirai</b> (tu pareja o un hijo mayor: tendrá su cuenta) o <b>Solo agregarla al hogar</b> (un hijo pequeño: es para asignarle gastos, ingresos y un presupuesto).",
      "Para invitar escribe su correo o celular y elige qué podrá hacer. Le llega un correo con el botón <b>Aceptar invitación</b>; por celular, tócale <b>Enviar desde mi WhatsApp</b> y el mensaje sale listo desde tu teléfono. También puedes copiar el enlace o compartirlo.",
      "Cada persona muestra su estado: <b>Es parte del hogar</b>, <b>Invitación enviada</b>, <b>Venció</b> o <b>No tiene cuenta</b>. Con el botón <b>⋯</b> reenvías o cancelas la invitación, cambias el rol, invitas a alguien que agregaste sin cuenta o lo quitas del hogar.",
      "Los roles: <b>Dueño del hogar</b> (todo, incluso el plan y borrar el hogar), <b>Administra</b> (todo menos eso; puede invitar), <b>Colabora</b> (registra y edita movimientos, presupuestos y metas), <b>Registra sus gastos</b> (solo agrega y edita lo suyo) y <b>Solo mira</b>. Toca <b>¿Qué puede hacer cada rol?</b> para ver la tabla.",
    ],
    tips: [
      "Mirai no deja invitar dos veces a la misma persona: si ya la invitaste, te ofrece reenviarle la invitación. Puedes reenviarla una vez cada 10 minutos y hasta 5 veces al día.",
      "Si invitas a alguien que ya tenías sin cuenta, al aceptar se une a ese mismo integrante con sus gastos: no queda repetido.",
      "El dueño puede pasarle el hogar a otra persona desde el botón ⋯ (queda como Administra).",
    ],
  },
  admin: {
    t: "Panel de administración", i: "Solo lo ves tú como dueño de Mirai: cómo va la plataforma y qué opinan las personas.",
    p: ["<b>Resumen</b>: personas registradas, activas, hogares, uso por día y lo más usado.", "<b>Clientes</b>: cada cuenta con su hogar, plan, último ingresoy actividad; descárgalo en CSV.", "<b>Opiniones</b>: calificaciones, errores, ideas, elogios y casos de soporte. Cambia el estado y responde; la persona recibe un aviso."],
  },
}

/** Descripción de cada ventana/modal. */
export const MDESC = MDESC_RAW as Record<string, string>

const FHELP = FHELP_RAW as Record<string, string>
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[*:?¿()]/g, "").trim()
const FHELP_N = Object.fromEntries(Object.entries(FHELP).map(([k, v]) => [norm(k), v]))

/** Ayuda de un campo por su etiqueta (igual que la búsqueda de FHELP en la v4). */
export function fieldHelp(label: string): string | undefined {
  const n = norm(label)
  return FHELP_N[n] ?? Object.entries(FHELP_N).find(([k]) => n.startsWith(k) || k.startsWith(n))?.[1]
}
