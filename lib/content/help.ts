import HELP_RAW from "@/lib/data/legacy-help.json"
import MDESC_RAW from "@/lib/data/legacy-mdesc.json"
import FHELP_RAW from "@/lib/data/legacy-fhelp.json"

/** Ayuda "Cómo funciona" por sección: título, introducción, pasos y consejos (textos literales de la v4). */
export type HelpEntry = { t: string; i: string; p: string[]; tips?: string[] }
export const HELP: Record<string, HelpEntry> = {
  ...(HELP_RAW as Record<string, HelpEntry>),
  opiniones: {
    t: "Tu opinión", i: "Aquí nos cuentas qué piensas de Mirai y ves qué pasó con lo que nos enviaste.",
    p: ["Toca <b>Enviar una opinión</b> y elige el tema: calificar, algo que no funciona, una función que quieres, una sugerencia, un elogio o una duda.", "Si es un error, adjunta una captura de pantalla: nos ayuda a encontrarlo más rápido. Puedes decidir si incluimos la página donde estás.", "Cada opinión muestra su estado (<b>Recibido</b>, <b>En revisión</b>, <b>Planeado</b>, <b>Listo</b>) y nuestra respuesta. Te llega un aviso cuando respondemos.", "Si necesitas ayuda con algo puntual, abre un caso en <b>Centro de ayuda › Contactar soporte</b>: aparece aquí con su número."],
    tips: ["Nunca enviamos tus montos ni tus datos financieros: solo lo que escribes, la página donde estabas (si la incluyes) y tu tipo de pantalla."],
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
  admin: {
    t: "Panel de administración", i: "Solo lo ves tú como dueño de Mirai: cómo va la plataforma y qué opinan las personas.",
    p: ["<b>Resumen</b>: personas registradas, activas, hogares, uso por día y lo más usado.", "<b>Clientes</b>: cada cuenta con su hogar, plan, último ingreso y actividad; descárgalo en CSV.", "<b>Opiniones</b>: calificaciones, errores, ideas, elogios y casos de soporte. Cambia el estado y responde; la persona recibe un aviso."],
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
