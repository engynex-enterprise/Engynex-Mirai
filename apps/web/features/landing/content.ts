// Textos de la página pública (portada). Todo lo que se promete aquí existe en Mirai: sale del menú (lib/nav.ts),
// de los planes (lib/plans.ts), de las novedades (lib/content/ayuda.ts) y de la FAQ. Los ejemplos son ilustrativos.
import {
  BellRing, BookCopy, CalendarSync, Camera, CreditCard, FileSpreadsheet, FolderLock, Landmark, Lightbulb, QrCode,
  Radio, Smartphone, Store, Tags, Wallet, type LucideIcon,
} from "lucide-react"

export const SITE_URL = "https://mirai.engynex.com"

/** Anclas del encabezado. */
export const NAV_LINKS = [
  { href: "#que-es", label: "Qué es" },
  { href: "#funciones", label: "Funciones" },
  { href: "#vs", label: "Sin vs con Mirai" },
  { href: "#planes", label: "Planes" },
  { href: "#preguntas", label: "Preguntas" },
] as const

/** Insignias verificables del hero. */
export const BADGES = [
  { t: "Datos cifrados", d: "Claves con AES-256" },
  { t: "Ley 1581", d: "Descarga o borra tus datos" },
  { t: "Hecho para Colombia", d: "UVT, DIAN y festivos" },
] as const

/** El problema: lo que le pasa hoy a una familia. */
export const PROBLEMAS = [
  { iso: "gastos", t: "No sabes en qué se va la plata", d: "Llega fin de mes, la cuenta está en ceros y no sabes si fue el mercado, los domicilios o el tinto de todos los días." },
  { iso: "le-debo", t: "Deudas y fiados sueltos", d: "La tarjeta, la cuota del carro, el fiado de la tienda y lo que le prestaste a tu primo: cada cosa anotada en un lugar distinto, o en ninguno." },
  { iso: "recordatorios", t: "Se te olvidan los pagos", d: "El recibo de la luz, el corte de la tarjeta o la cuota del banco: te acuerdas cuando ya llegó la mora." },
  { iso: "renta", t: "La renta asusta", d: "No sabes si te toca declarar, cuándo vence tu fecha ni qué papeles pedir. Y cada año es la misma angustia." },
  { iso: "familia", t: "Cada quien anota por su lado", d: "Tu pareja tiene su cuaderno, tú una hoja de cálculo y nadie sabe cuánto queda para la casa." },
] as const

/** Cómo lo resuelve. */
export const PASOS = [
  { n: 1, iso: "gastos", t: "Registras en segundos", d: "Con el botón Agregar, escribiéndole al chat (“gasté 25 mil en mercado”), con una foto de la factura o trayendo los correos y extractos de tu banco." },
  { n: 2, iso: "balance", t: "Mirai lo enlaza todo", d: "Cada movimiento llega a tu Balance, a la cuenta de donde salió, a tu tarjeta, a tu deuda o a tu meta. Las mismas cifras en todas las pantallas." },
  { n: 3, iso: "notificaciones", t: "Te avisa a tiempo", d: "Antes de cada pago, el corte de la tarjeta y tu fecha de renta, por la app, correo, WhatsApp, Telegram, push o Google Calendar." },
  { n: 4, iso: "consejero", t: "Te dice qué hacer", d: "Qué deuda pagar primero, cuánto puedes ahorrar y si te conviene esa compra, con tus números y en palabras simples." },
] as const

export type Funcion = {
  t: string
  d: string
  ej?: string
  iso?: string
  icon?: LucideIcon
  /** Es parte de Mirai Premium. */
  premium?: boolean
  /** Aclaración corta del plan (p. ej. qué hace en Gratis). */
  nota?: string
}
export type GrupoFunciones = { id: string; label: string; iso: string; intro: string; items: Funcion[] }

/** Funciones una a una, por grupo. */
export const GRUPOS: GrupoFunciones[] = [
  {
    id: "dinero", label: "Tu dinero", iso: "ingresos", intro: "Lo que entra, lo que sale y lo que te queda, sin hacer cuentas a mano.",
    items: [
      { iso: "balance", t: "Balance y quincenas", d: "Junta las entradas y salidas de todos los módulos y te dice cuánto te queda por quincena, mes o año.", ej: "“En la 1ª quincena te quedan $310.000 después del arriendo.”" },
      { iso: "dashboard", t: "Dashboard", d: "Tus números en gráficas para decidir: en qué se va la plata, tu patrimonio en el tiempo, cuándo terminas tus deudas y cuántos meses aguantas sin ingresos.", ej: "Decisiones con su impacto en pesos." },
      { iso: "ingresos", t: "Ingresos y nómina", d: "Escribe tu salario y Mirai calcula salud, pensión, fondo de solidaridad y retención. Un recibo te muestra lo que llega en cada pago.", ej: "Valor distinto en cada quincena, si así te pagan." },
      { iso: "gastos", t: "Gastos del día a día", d: "Anota un gasto en segundos: la categoría se pone sola y Mirai reconoce los gastos hormiga.", ej: "“Tinto 3.500” → Café, gasto hormiga." },
      { iso: "fijos", t: "Gastos fijos", d: "Arriendo, servicios, colegio y cuotas se repiten solos cada mes, aunque el valor cambie. Los marcas pagados con un toque." },
      { iso: "suscripciones", t: "Suscripciones", d: "Las apps y servicios que se cobran solos, con su fecha de cobro. Si compartes el plan, solo cuenta tu parte." },
      { iso: "tarjetas", t: "Tarjetas de crédito", d: "Compras a cuotas, fecha de corte y pago del mes. Cuando pagas, lo que debes baja y el pago sale en tu Balance." },
      { icon: Wallet, t: "Cuentas con saldo automático", d: "Banco, Nequi o efectivo: los gastos, ingresos y pagos que registras suben o bajan su saldo. La cuadras con tu banco cuando quieras." },
      { icon: Store, t: "Proveedores", d: "Guarda a quién le pagas (la energía, el acueducto, la inmobiliaria, el colegio) con su contrato, y mira cuánto le pagas al mes." },
      { iso: "correo", t: "Correo del banco", d: "Lee las compras que te llegan por correo de tu banco (Gmail, solo lectura) para que no las digites.", premium: true },
      { iso: "importar", t: "Importar extractos", d: "Sube el extracto del banco y Mirai trae tus movimientos.", premium: true },
    ],
  },
  {
    id: "deudas", label: "Deudas y préstamos", iso: "me-deben", intro: "Lo que debes y lo que te deben, claro y con sus fechas.",
    items: [
      { iso: "le-debo", t: "Le debo", d: "Cada deuda según su tipo: banco o cooperativa, empeño, fiado en la tienda, préstamo de una persona, compra a cuotas en un almacén o gota a gota. El formulario solo pregunta lo que aplica.", ej: "En un empeño: “¿Qué objeto dejaste?”" },
      { iso: "me-deben", t: "Me deben", d: "Lo que prestaste, con cuotas e intereses si los hay, y un aviso cuando toca cobrar." },
      { icon: FileSpreadsheet, t: "Plan de pagos claro", d: "Cada cuota separada en abono e interés, la tasa en efectiva anual (E.A.), simulación de abonos y descarga en Excel." },
      { iso: "estrategia", t: "Salir de deudas", d: "Compara pagar primero la más cara (avalancha) o la más pequeña (bola de nieve) y mira cuándo terminas y cuánto ahorras en intereses." },
      { iso: "contactos", t: "Contactos y entidades", d: "Personas, bancos, casas de empeño y tiendas quedan guardados para escogerlos la próxima vez, sin repetirlos." },
      { iso: "consejero", t: "Consejero antes de endeudarte", d: "Escribe la decisión y recibe un veredicto con tus números (sí, cuidado o no), con sus riesgos y los pasos a seguir.", ej: "“¿Me conviene una moto de 8 millones a 24 cuotas?”", nota: "En Gratis responde con los cálculos de Mirai; la IA es Premium." },
    ],
  },
  {
    id: "plan", label: "Planeación y metas", iso: "metas", intro: "Que la plata alcance hoy y te sobre para lo que quieres mañana.",
    items: [
      { iso: "presupuesto", t: "Presupuesto 50/30/20", d: "Divide tu ingreso en lo necesario, tus gustos y tu ahorro, y mira cómo vas en cada parte." },
      { iso: "flujo", t: "Flujo de caja", d: "Mes a mes, si lo que entra alcanza para lo que sale, antes de que llegue el problema." },
      { iso: "metas", t: "Metas y fondo de emergencia", d: "Ahorra para lo que quieres con aportes programados. Cada abono queda con su fecha y suma en tu patrimonio." },
      { iso: "retos", t: "Retos de ahorro", d: "Retos cortos para crear el hábito de guardar plata." },
      { iso: "logros", t: "Logros y nivel", d: "Ganas puntos por registrar, pagar a tiempo y cumplir tus metas. Si no te gustan, los apagas." },
      { iso: "primas", t: "Primas y cesantías", d: "Cuánto te llega de prima y de cesantías, y cuándo." },
      { iso: "deseos", t: "Lista de deseos", d: "Anota lo que te antoja y espera 7, 30 o 60 días antes de comprar. Mirai te muestra cuánto te ahorraste." },
      { iso: "calculadoras", t: "Calculadoras", d: "CDT con retención, crédito con tabla de pagos, ahorro con interés compuesto, 4×1000 e inflación." },
      { iso: "inversiones", t: "Inversiones", d: "CDT, cuentas que rinden, fondos, acciones o cripto: cuánto vale hoy cada una y cuándo vence." },
      { iso: "indicadores", t: "Salud financiera", d: "Indicadores simples de cómo estás: cuánto ahorras, cuánto debes y cuánto aguantas sin ingresos." },
      { iso: "reportes", t: "Reportes", d: "El resumen de tu mes para revisar o descargar.", nota: "El resumen escrito por la IA es Premium." },
    ],
  },
  {
    id: "impuestos", label: "Impuestos", iso: "renta", intro: "La DIAN sin estrés. Todo cálculo tributario es un estimado para que llegues preparado.",
    items: [
      { iso: "renta", t: "Declaración de renta estimada", d: "Con tus ingresos, los descuentos de tu nómina, tus dependientes y los gastos deducibles que marques (art. 241 del Estatuto Tributario).", premium: true },
      { iso: "calendario", t: "Calendario fiscal y laboral", d: "Tu fecha para declarar según los últimos dígitos de tu cédula, junto con primas, cesantías y festivos.", premium: true },
      { iso: "contador", t: "Acceso de tu contador", d: "Un enlace privado de solo lectura: ve tu información en vivo, descarga tus documentos y te deja notas. Le quitas el acceso cuando quieras.", premium: true },
      { icon: FolderLock, t: "Documentos de la renta", d: "Sube tus certificados en PDF o foto a cada documento de la lista. Quedan guardados de forma privada.", premium: true },
      { icon: Landmark, t: "Valores de Colombia al día", d: "UVT, salario mínimo, festivos, TRM y tasa de usura con su fuente oficial; la TRM y la usura se actualizan solas cada día." },
    ],
  },
  {
    id: "familia", label: "Familia", iso: "familia", intro: "Las cuentas de la casa, juntas y con permisos claros.",
    items: [
      { iso: "familia", t: "Tu hogar con roles", d: "Invita a tu pareja o a tus hijos por correo o WhatsApp. Cada quien con su rol: Administra, Colabora, Registra sus gastos o Solo mira.", premium: true },
      { icon: Radio, t: "Cambios en vivo", d: "Si alguien de tu hogar registra un gasto, lo ves al instante en tu pantalla." },
      { iso: "mesadas", t: "Mesada de los hijos", d: "Cuánto le das a cada uno y cuándo.", premium: true },
      { iso: "compartidos", t: "Gastos compartidos", d: "Un viaje, la casa o el arriendo entre amigos: anota quién pagó y Mirai calcula quién le debe a quién.", premium: true },
      { icon: BookCopy, t: "Varios libros", d: "Lleva aparte el negocio o los arriendos, cada uno con sus propios datos.", premium: true },
      { icon: QrCode, t: "Recibe pagos", d: "Tus llaves Bre-B y cuentas por banco o billetera, listas para copiar, compartir por WhatsApp o mostrar en un QR." },
    ],
  },
  {
    id: "ia", label: "IA y automatizaciones", iso: "automatizaciones", intro: "Que Mirai haga el trabajo pesado y tú solo confirmes.",
    items: [
      { iso: "chat", t: "Chat de Mirai", d: "Escríbele como a una persona y registra en todos tus módulos. Te muestra una tarjeta y solo guarda cuando tocas Confirmar.", ej: "“Le presté 200 mil a Juan a 3 meses.”", nota: "Preguntas como “¿cuánto gasté en mercado?” se responden con tus datos, sin gastar IA." },
      { icon: Camera, t: "Lee facturas con una foto", d: "Toma una foto o sube el PDF de una factura o un extracto y la IA llena los datos para que los revises.", premium: true },
      { iso: "automatizaciones", t: "Automatizaciones", d: "Flujos de “si pasa esto, haz aquello” en un diagrama, con plantillas listas.", ej: "“Avísame si un gasto pasa de $200.000.”", nota: "En Gratis tienes 3 activas." },
      { icon: Lightbulb, t: "Hallazgos", d: "Qué categoría subió o bajó frente al mes pasado, gastos fuera de lo normal y tu día de más gasto." },
      { icon: Tags, t: "Categorías solas", d: "La categoría de un gasto se busca primero en tus reglas y tu historial; la IA ayuda con lo que no reconoce." },
      { iso: "academia", t: "Academia Mirai", d: "Lecciones cortas en tres niveles, con repaso e insignias: presupuesto, emergencia, tasas, tarjeta, nómina y renta." },
      { iso: "ayuda", t: "Centro de ayuda", d: "Cada pantalla trae su “Cómo funciona”, cada campo su ayuda y hay un glosario financiero de Colombia." },
    ],
  },
  {
    id: "avisos", label: "Avisos", iso: "notificaciones", intro: "Que nada se te pase, sin tener que abrir Mirai todos los días.",
    items: [
      { iso: "recordatorios", t: "Próximos pagos", d: "Todo lo que vence en un solo lugar: fijos, cuotas, tarjetas, suscripciones e impuestos." },
      { icon: BellRing, t: "Correo, WhatsApp, Telegram o push", d: "Un resumen al día, a la hora que elijas y por el canal que prefieras. Toca Enviarme una prueba para comprobarlo." },
      { icon: CreditCard, t: "Corte de tarjeta y cupo", d: "Te avisamos el corte de tu tarjeta y cuando estás usando mucho cupo." },
      { iso: "calendario", t: "Tu fecha de renta", d: "El aviso llega según los últimos dígitos de tu cédula, para que no te coja la tarde.", premium: true },
      { icon: CalendarSync, t: "Google Calendar al día", d: "Cada mañana llevamos tus pagos y cobros a tu calendario; si pagas o borras algo, lo quitamos.", premium: true },
      { icon: Smartphone, t: "Instálala como app", d: "Agrega Mirai a la pantalla de inicio de tu celular o computador y ábrela como cualquier app." },
    ],
  },
]

/** Sin Mirai ↔ Con Mirai, por situación. */
export const VS = [
  { iso: "balance", t: "Fin de mes", sin: "Llega el 30, la cuenta está en ceros y no sabes en qué se fue la plata.", con: "Ves en qué se fue cada peso, por categoría, y cuánto te queda hoy." },
  { iso: "ingresos", t: "La quincena", sin: "Te pagan y a los tres días ya no sabes cuánto queda para la segunda mitad del mes.", con: "Cada quincena sabes lo que entra, lo que ya está comprometido y lo que te queda libre." },
  { iso: "fijos", t: "El arriendo y los servicios", sin: "Te acuerdas el día del corte o cuando ya te cobraron la mora.", con: "Te avisa antes por el canal que elijas y lo marcas pagado con un toque." },
  { iso: "tarjetas", t: "La tarjeta de crédito", sin: "Pagas el mínimo sin saber cuánto debes de verdad ni cuántas cuotas te faltan.", con: "Ves cada compra a cuotas, la fecha de corte y el pago del mes, y te avisa si usas mucho cupo." },
  { iso: "le-debo", t: "El fiado de la tienda", sin: "Queda en el cuaderno del tendero y nunca sabes cuánto llevas.", con: "Lo registras como fiado, con su total y su fecha, y Mirai te avisa antes de pagar." },
  { iso: "gastos", t: "Los gastos hormiga", sin: "El tinto, el domicilio y el mecato se comen el sueldo sin que lo notes.", con: "Mirai los reconoce y te muestra cuánto suman al mes y al año." },
  { iso: "estrategia", t: "Las deudas con intereses altos", sin: "Le abonas un poquito a todas y no sales de ninguna.", con: "Te dice cuál pagar primero, cuándo terminas y cuánto te ahorras en intereses." },
  { iso: "renta", t: "La declaración de renta", sin: "No sabes si te toca declarar, cuándo vence ni qué papeles necesitas.", con: "Tu fecha según tu cédula, una declaración estimada y un acceso de solo lectura para tu contador." },
  { iso: "familia", t: "La familia", sin: "Cada quien anota por su lado (o nadie anota) y las cuentas no cuadran.", con: "Todo el hogar en un solo lugar, con roles y los cambios en vivo." },
  { iso: "consejero", t: "Antes de una compra grande", sin: "Sacas la moto a 24 cuotas porque “la cuota cabe”.", con: "Le preguntas al Consejero y te responde con tus números: sí, cuidado o no." },
  { iso: "metas", t: "Un imprevisto", sin: "Se daña la nevera y toca pedir prestado.", con: "Tu fondo de emergencia está apartado y Mirai te ofrece pagarlo con él." },
] as const

/** Seguridad y privacidad (todo verificable en el código y en la política de datos). */
export const SEGURIDAD = [
  { t: "Claves cifradas", d: "Las claves de tus integraciones se guardan cifradas con AES-256 en el servidor. Tu navegador solo ve los últimos 4 caracteres." },
  { t: "Permisos por hogar", d: "Cada tabla tiene reglas de acceso en la base de datos: solo tú y las personas que invites ven tu información." },
  { t: "Modo privado", d: "Oculta tus montos con un toque, por ejemplo si muestras la pantalla en el trabajo o en el bus." },
  { t: "Verificación en dos pasos", d: "Activa un segundo paso al entrar y revisa las sesiones abiertas en cada dispositivo." },
  { t: "Contador de solo lectura", d: "Tu contador ve lo que tú eliges y hasta cuando tú dices. No puede cambiar nada." },
  { t: "Tus datos son tuyos", d: "No vendemos tus datos. Descarga una copia o elimina tu cuenta cuando quieras (Ley 1581 de 2012)." },
] as const

/** Preguntas frecuentes de la portada (adaptadas de la FAQ de Mirai). Texto plano: también va al JSON-LD. */
export const FAQ_LANDING = [
  { q: "¿Qué es Mirai?", a: "Una plataforma de finanzas personales y familiares hecha para Colombia. Organiza tus ingresos, gastos, deudas, metas e impuestos en palabras simples, para que sepas cuánto te queda y qué hacer con tu plata. Mirai (未来) significa “futuro” en japonés." },
  { q: "¿Necesito saber de finanzas para usarlo?", a: "No. Cada sección tiene su “Cómo funciona”, cada campo su ayuda y hay un glosario con los términos de Colombia (UVT, E.A., 4×1000…). Si no sabes qué elegir, Mirai deja la opción más común." },
  { q: "¿Es gratis?", a: "Sí. Lo básico es gratis para siempre: gastos, ingresos, quincena, balance, fijos, tarjetas, suscripciones, presupuesto, metas, préstamos y deudas. Premium agrega la IA, la automatización con tu banco, los impuestos con tu contador y toda la familia con varios libros, sin anuncios." },
  { q: "¿Por dónde empiezo?", a: "Crea tu cuenta y abre Puesta en marcha: te lleva paso a paso por tu ingreso, tus gastos fijos, tus cuentas y tus deudas. Con eso Mirai ya puede avisarte y aconsejarte." },
  { q: "¿Mirai se conecta a mi banco?", a: "Mirai no pide la clave de tu banco. Con Premium puede leer los correos de compras que te manda tu banco (Gmail, solo lectura) e importar los extractos que descargues." },
  { q: "¿Dónde se guardan mis datos?", a: "En los servidores de Mirai (Hostinger, en Brasil; los archivos en Cloudflare), protegidos con permisos por hogar: solo tú y las personas que invites pueden verlos. Puedes descargar una copia o eliminar tu cuenta en Ajustes › Datos y cuenta." },
  { q: "¿Puedo manejar las finanzas con mi familia?", a: "Sí. Invitas a tu pareja o a tus hijos y cada quien tiene su rol: Administra, Colabora, Registra sus gastos o Solo mira. Toda la familia y varios libros hacen parte de Premium." },
  { q: "¿La declaración de renta que calcula Mirai es oficial?", a: "No. Es un estimado con las normas vigentes para que llegues preparado y sepas qué papeles tener. La declaración la presentas tú (o tu contador) en la DIAN." },
  { q: "¿Puedo confiar en lo que llena la IA?", a: "La IA ayuda, pero puede equivocarse. Por eso Mirai siempre te muestra lo que va a guardar y solo lo registra cuando tocas Confirmar. Revisa sobre todo valores y fechas." },
  { q: "¿Funciona en el celular?", a: "Sí. Mirai está pensado primero para el celular y lo puedes instalar en la pantalla de inicio como una app. También funciona en el computador." },
  { q: "¿Cómo pago Premium y cómo lo cancelo?", a: "Con tarjeta (se renueva sola y la cancelas cuando quieras) o con Nequi, PSE o Bancolombia por un mes o un año, desde Ajustes › Mi plan. Tienes derecho de retracto de 5 días hábiles." },
] as const
