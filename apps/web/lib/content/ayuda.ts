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
    ["new", "Todos tus gastos en una sola lista", "En Gastos › Todos ves todo lo que sale de tu bolsillo (día a día, fijos, suscripciones, tarjetas, cuotas de deudas, impuestos y mesadas) sin contar nada dos veces. Muévete de mes en mes o mira los próximos 7 días, compara con el periodo anterior, mira si te alcanza con lo que tienes, en qué se va la plata, cómo vas con tu presupuesto y cuánto pagas en intereses. Toca un pago para ver su detalle, págalo, cambia su fecha o pide que te avisemos; elige varios para pagarlos de una vez o exportarlos. Si registraste un pago dos veces, te lo mostramos para enlazarlo con un toque."],
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
    ["new", "Chat de Mirai renovado", "La burbuja y el Consejero son ahora un chat como ChatGPT o Claude: respuestas que se escriben en vivo, preguntas sugeridas que cambian, copiar, regenerar, calificar y editar tu pregunta, dictado por voz y fotos o PDF de facturas y extractos. Pídele que registre un gasto, cree una meta o un recordatorio: solo guarda cuando tocas Confirmar."],
    ["imp", "Consejero sin formulario", "Escribe la decisión en el chat (por ejemplo, \"¿me conviene comprar una moto de 8 millones a 24 cuotas?\") y el análisis con tus números sale como una tarjeta con veredicto, cifras, riesgos y pasos. La tarjeta cambia según lo que preguntas: cifras en frases sencillas con su explicación, un medidor de cuánto pesa frente a lo que te sobra al mes y qué te recomendamos."],
    ["new", "Historial de conversaciones completo", "Con el botón ⋯ o clic derecho: fija, renombra, pide un título nuevo, duplica, archiva, exporta en texto, Markdown o PDF, copia el enlace o elimina (con Deshacer). Selecciona varias a la vez y usa Ctrl/⌘ + Shift + O para una conversación nueva."],
    ["new", "Proveedores", "Guarda a quién le pagas (Enel, el acueducto, la inmobiliaria, Claro, el colegio…) con su número de contrato y contacto, y elígelo de una lista en vez de escribirlo. Agrégalo desde el mismo selector, mira cuánto le pagas a cada uno al mes y escoge entre proveedores comunes de Colombia. En Mi dinero › Proveedores y en Ajustes."],
    ["new", "Recibe pagos por banco o billetera", "En tu perfil agrupa tus llaves Bre-B y cuentas por entidad, con su logo: varias llaves por banco (celular, cédula, correo, @alfanumérica o código de comercio), Nequi, Daviplata y más de 30 bancos, billeteras y cooperativas. Marca una como principal, ponle un nombre, cópiala con un toque, comparte por WhatsApp con vista previa, saca un QR por llave u oculta los números. El recordatorio de cobro de un préstamo ya incluye dónde pagarte."],
    ["new", "Tu hogar en una sola lista", "En Ajustes › Hogar y en tu perfil ves a todas las personas del hogar: quienes usan Mirai, quienes solo registras tú (como un hijo pequeño) y las invitaciones pendientes. Con Agregar persona la invitas por correo o WhatsApp (o la envías desde tu WhatsApp), y Mirai no deja invitar dos veces a la misma persona. Roles nuevos con nombres simples: Dueño del hogar, Administra, Colabora, Registra sus gastos y Solo mira."],
    ["new", "Fiado y pago único", "En Le debo puedes registrar lo que te fía una tienda o negocio (\"Tienda o negocio (fiado)\") y deudas que se pagan de una sola vez en una fecha pactada (\"Pago único\"). Te avisamos antes de la fecha."],
    ["new", "Cambia de correo o de cuenta de Google sin perder nada", "En tu perfil, Cuentas conectadas muestra cómo entras (Google con su correo, correo y contraseña, enlace mágico) con Cambiar y Quitar. Cambia el correo de tu cuenta con un enlace de confirmación, conecta tu otra cuenta de Google y quita la vieja, o crea una contraseña. Si ya no usas tu correo de Google, un paso a paso te pasa al nuevo sin crear una cuenta vacía. Mirai no deja quitar la última forma de entrar."],
    ["new", "Pasa el hogar a tu pareja o a otro familiar", "El dueño puede pasarle el hogar a otra persona con cuenta y escoger qué rol queda (por defecto Administra). Le llega un aviso en la campana y un correo para aceptar o rechazar, y tiene 7 días. En Ajustes › Tu cuenta también ves tus hogares (abrir, salir o borrar), las sesiones abiertas en cada dispositivo y la actividad de seguridad de tu cuenta."],
    ["new", "Deudas a la medida de cada tipo", "Al registrar una deuda o un préstamo, primero escoges el tipo (banco o cooperativa, empeño, fiado en una tienda, préstamo de una persona, compra a cuotas en un almacén o gota a gota) y el formulario te pregunta solo lo que aplica, con sus propias palabras: \"¿Cuánto fue lo que te fiaron?\", \"¿Qué objeto dejaste?\", \"Cuota mensual\". A la derecha ves en vivo el resumen: la cuota, las fechas, cuánto pagas de intereses y si la tasa pasa la usura. Toca Más detalle para ver todas las cuotas. El botón aparte de Empeño ya no está: es un tipo más dentro de Nueva deuda."],
    ["imp", "Tus deudas juntas por entidad o persona", "En Le debo y Me deben, las deudas con el mismo banco, casa de empeño, tienda o persona salen en una sola tarjeta con el total; al abrirla, cada deuda es una pestaña. La lista es más compacta y el detalle ya no se sale de su caja: el menú ⋯ tiene Editar datos, Descargar plan de pagos (Excel), Simular un abono y más; en Datos ves la tasa en E.A. frente a la usura, y llamas o escribes por WhatsApp con un toque."],
    ["new", "La fecha del préstamo y desde cuándo pagas, por separado", "Al registrar un préstamo de una persona (y también un crédito, lo que le prestaste o una venta fiada en cuotas) escoges cuándo te prestaron y desde cuándo empiezas a pagar: las cuotas se acomodan desde esa fecha según cada cuánto pagas, y Mirai te dice cuándo cae la primera y la última. Puedes cambiarla después en Editar datos."],
    ["fix", "Ya no se repite la casa de empeño", "Quien te presta siempre queda guardado para escogerlo la próxima vez: la casa de empeño o el banco en Contactos › Bancos y entidades, la tienda en Proveedores y las personas (también el gota a gota, con su apodo) en Contactos. Si escribes un nombre que ya tienes, Mirai usa el que existe en vez de crear otro. Los empeños que habías registrado con el nombre escrito ya quedaron enlazados a una sola entidad."],
    ["fix", "Tus gastos ya se ven en el Balance", "Los gastos que registras en Gastos se suman en el Balance: en Tu mes y en cada quincena salen como Hecho, y lo que te falta por gastar según tu presupuesto sale como Por gastar (sin repetir pagos de fijos, tarjetas ni cuotas)."],
    ["imp", "Balance con todo lo de Mirai", "El Balance ahora junta cada entrada y salida de todos los módulos: ingresos en su día de pago, gastos, fijos, suscripciones, el pago de tus tarjetas, cuotas y abonos de tus deudas, lo que te deben, préstamos, impuestos del calendario (con valor estimado), mesadas y lo que ahorras en metas, fondo e inversiones. Míralo por quincena, mes o año, agrupado por módulo y categoría, filtra por módulo o por Pendiente, Vencido y Hecho, y nada se cuenta dos veces."],
    ["imp", "Lo que tienes y lo que debes, línea por línea", "Tu mes muestra lo que entra, lo que sale, lo que ahorras y lo que te queda. La cuenta T lista cada cuenta, inversión, préstamo que te deben, crédito, tarjeta e impuesto que ya debes (estimado), con subtotales por tipo. Actualiza el saldo de una cuenta con un toque y exporta a Excel."],
    ["new", "Dashboard", "Un módulo nuevo en General con tus gráficas para decidir: entra y sale mes a mes (12 meses), en qué se va la plata, tu patrimonio en el tiempo, tus deudas y cuándo terminan con sus intereses, qué parte de tu ingreso ya está comprometida, cuánto puedes ahorrar y cuántos meses aguantas sin ingresos, los próximos pagos, los impuestos que vienen y tus metas."],
    ["new", "Decisiones con su impacto en pesos", "En el Dashboard, Mirai te dice qué hacer primero: qué deuda pagar antes y cuánto ahorras en intereses, si tus compromisos pasan la mitad de tu ingreso, cuánto puedes ahorrar al mes, cuánto separar para el próximo impuesto y qué suscripción revisar. Cada recomendación te lleva a donde lo haces."],
    ["new", "Tus cuentas se actualizan solas", "Al agregar una cuenta (banco, Nequi, efectivo) elige con qué medios de pago la usas: los gastos, ingresos y pagos que registres suben o bajan su saldo. Tócala para ver sus movimientos o cuadrarla con tu banco."],
    ["new", "Abonos a metas con Deshacer", "Cada abono queda con su fecha, cuenta en lo que ahorras del mes y lo puedes quitar si te equivocaste. Tus metas y tu fondo suman en tu patrimonio como ahorro apartado."],
    ["fix", "Las mismas cifras en todas partes", "Inicio, Balance, Dashboard, Flujo de caja, Metas y el chat usan ahora el mismo cálculo: el fondo de emergencia, lo que te queda y lo que debes dicen lo mismo en cada pantalla."],
    ["new", "Paga tu tarjeta de crédito", "Registra el pago del mes, el total o el valor que quieras: lo que debes baja y el pago aparece en tu Balance. También puedes editar o borrar una compra de la tarjeta."],
    ["imp", "Tus movimientos quedan enlazados", "Si borras en Gastos una compra con tarjeta o tu parte de un gasto de grupo, también sale de la tarjeta o del grupo. Si cambias el valor del gasto de un fijo, su pago se actualiza. Al deshacer “Ya se cobró”, la suscripción vuelve a su fecha, y si registras un gasto que parece el pago de un fijo, Mirai te pregunta para no contarlo dos veces."],
    ["new", "Avisos a la hora que elijas", "Tu resumen por correo, WhatsApp, Telegram o push te llega a la hora que escogiste, una sola vez al día. Además te avisamos el corte de tu tarjeta, cuando usas mucho cupo, tu fecha de renta según tu cédula, las mesadas y lo que te deben en los gastos compartidos."],
    ["new", "Google Calendar al día solo", "Si conectas tu Google Calendar, cada mañana llevamos tus pagos y cobros: si cambias un monto lo actualizamos y si pagas o borras algo lo quitamos."],
    ["fix", "Recordatorios de una sola vez", "Un recordatorio que no es anual ya no se repite cada año, y la prima o las cesantías ahora salen como “te llega”, no como un pago."],
    ["new", "El chat registra en todos tus módulos", "Escríbele “le presté 200 mil a Juan a 3 meses”, “pagué la cuota del carro”, “ya se cobró Netflix” o “compré un celular con la Visa a 12 cuotas”: te muestra una tarjeta y lo guarda cuando tocas Confirmar. Sus cifras salen del mismo cálculo del Balance."],
    ["imp", "Roles en el chat y la IA", "Quien registra sus gastos puede anotarlos desde el chat; quien solo mira consulta sin poder registrar. El interruptor Consejero IA ahora sí se respeta."],
    ["new", "Automatizaciones con cuotas, tarjetas y suscripciones", "Ahora una automatización puede arrancar cuando se paga una cuota, compras con tarjeta, se cobra una suscripción o agregas un recordatorio. También puede registrar un ingreso, marcar un gasto fijo como pagado (débito automático) y avisarle solo a una persona del hogar."],
    ["fix", "Pagos del plan más seguros", "Una notificación repetida ya no extiende tu plan dos veces, un reembolso quita el periodo pagado y el portal del contador se cierra si tu plan deja de incluirlo. El respaldo de la versión 4 también se puede traer en Gratis."],
    ["new", "Gastos que te sirven para la renta", "Marca un gasto como deducible (prepagada, intereses de vivienda o ICETEX) y la Declaración lo propone en tus deducciones."],
    ["imp", "Renta más completa", "Tu declaración ahora cuenta tus tarjetas, tus ingresos extra, los descuentos de tu nómina y los saldos al 31 de diciembre. Los hijos que estudian cuentan como dependientes hasta los 25 años."],
    ["imp", "Busca y agrega de todo", "El buscador (Ctrl K) encuentra gastos, proveedores, tarjetas, metas e inversiones, y Agregar tiene suscripción, compra o pago de tarjeta, abono a meta, cuenta y recordatorio."],
    ["new", "Instala Mirai como una app", "En el celular o el computador, toca Instalar Mirai (en tu foto del menú o en Ajustes › Mirai como app). En iPhone te mostramos paso a paso cómo agregarlo a inicio desde Safari. Se abre a pantalla completa, con su pantalla de carga, sin barras del navegador y con el número de avisos sin leer en el ícono."],
    ["new", "Cada ingreso con sus propias preguntas", "Al agregar un ingreso lo primero es escoger qué tipo es, entre 19 opciones agrupadas (trabajo con contrato, por tu cuenta, pensión y ayudas, rentas y capital, y de una sola vez). Según el que escojas, Mirai pregunta solo lo que aplica y calcula los descuentos que de verdad te hacen: un bono ocasional, las vacaciones pagadas en dinero y la liquidación no pagan salud ni pensión; las comisiones y las horas extras sí."],
    ["imp", "La prima no se registra dos veces", "La prima legal de junio y diciembre, las cesantías y sus intereses ya los proyecta Mirai con tu salario (míralos en Primas). El formulario te lo avisa para que ahí solo anotes las primas o bonos que tu empresa dé aparte."],
    ["imp", "Auxilio de transporte bien calculado", "Puedes separar cuánto de tu pago es auxilio de transporte ($249.095 en 2026): no paga salud ni pensión, pero sí cuenta para la retención. Antes se te descontaba de más."],
    ["fix", "Salud de los pensionados", "La mesada paga 4 % de salud hasta un salario mínimo, 10 % hasta tres y 12 % de ahí en adelante (antes Mirai cobraba 12 % a todos). En mesadas altas también se suma el aporte de solidaridad."],
    ["imp", "Tus ingresos, más claros", "Las tarjetas de arriba se adaptan a cómo te pagan: quincenal muestra las dos quincenas; mensual, tu próximo pago con la fecha; semanal o diario, lo de cada semana o día. Cada ingreso es ahora una tarjeta separada y eliminar pide confirmación."],
    ["imp", "Balance por el periodo que te sirve", "El Balance ya no asume quincenas: muestra la semana, las quincenas, el mes, el semestre o el año según cómo te paguen y cómo pagues."],
    ["new", "Cuenta T del mes y patrimonio aparte", "La cuenta T ahora es la del periodo: a un lado todo lo que entra y al otro todo lo que hay que pagar (fijos, día a día, cuotas, tarjetas, suscripciones e impuestos), con cuánto falta por pagar de cada uno. Lo que tienes y lo que debes en total pasó a su propia tarjeta, «Tu patrimonio hoy»."],
    ["imp", "Tu mes se entiende de un vistazo", "La tarjeta «Tu mes» muestra en grande lo que te queda, una barra de cómo se reparte lo que entra (pagos, ahorro y lo que te sobra) y la comparación con el mes pasado."],
    ["fix", "Mensajes del Balance que no se contradicen", "Si debes más de lo que tienes, Mirai aclara que esa es la foto de hoy y no la del mes, y el sobrante del mes te lo manda a la deuda más cara en vez de a una meta."],
    ["new", "Tu meta financiera, con avance y pasos", "En tu perfil escoges qué quieres lograr (un colchón para emergencias, salir de deudas, la cuota de tu casa, un viaje, estudiar, el retiro o tu negocio), cuánto cuesta y para cuándo. Mirai la enlaza con una meta de Metas, te muestra cuánto llevas, cuánto te falta y cuánto separar cada mes, y te marca los pasos que ya cumpliste. Además, el Dashboard, el Consejero y el chat te recomiendan primero lo que te acerca a esa meta."],
    ["new", "Escoge la portada de tu perfil", "La franja de arriba de tu perfil ya no es solo un color: hay portadas ilustradas de naturaleza, ciudad, viaje, tu plata, familia y figuras, y también puedes subir tu propia foto."],
    ["imp", "El teléfono se acomoda solo", "Al escribir tu teléfono en el perfil se va ordenando mientras escribes (300 123 4567 o (601) 234 5678) y te avisamos si quedó incompleto."],
    ["imp", "Invita por correo o por WhatsApp", "Al agregar a alguien a tu hogar escoges si le llega por correo o por WhatsApp. Ahora Mirai sí envía la invitación por correo; si la plantilla de WhatsApp está lista, también la manda por ahí y, si no, se abre tu WhatsApp con el mensaje escrito."],
    ["fix", "Perfil más ordenado", "«Recibe pagos» quedó al lado de tu resumen y debajo de tus datos, y «Cuentas conectadas» ahora ocupa todo el ancho: se ve claro qué correo usas y con qué formas entras."],
    ["imp", "Te recordamos instalar Mirai al entrar", "Si todavía no lo tienes instalado, al entrar te sale una ventana corta con lo que ganas al hacerlo. Toca Instalar ahora, Instalar después (te lo recordamos la próxima vez que entres) o No ver más este mensaje (no vuelve a salir en este celular, con el navegador que estás usando). Puedes instalarlo cuando quieras desde tu foto en el menú o en Ajustes › Mirai como app."],
    ["new", "Accesos directos y compartir a Mirai", "Mantén presionado el ícono de Mirai (en el computador, clic derecho) para registrar un gasto, un ingreso, una deuda, un préstamo o un recordatorio de una vez. En Android, comparte la foto o el PDF de una factura desde la Galería o WhatsApp a Mirai y el gasto se llena solo."],
    ["imp", "Se siente como una app", "Desliza hacia abajo para actualizar, una barra arriba te muestra que la sección está cargando, el cambio entre secciones es suave y nada queda debajo del notch ni de la barra del celular. Si te quedas sin internet ves un aviso claro, y cuando hay una versión nueva te preguntamos antes de actualizar."],
    ["imp", "Salir de deudas, dicho en palabras", "La pantalla empieza por tu situación real: cuánto debes, cuánto se te va al mes en cuotas y en qué fecha quedarías libre, con la lista de las deudas que está contando y los supuestos de la cuenta (por ejemplo, que no vuelves a comprar con la tarjeta). Lo primero que te propone no te cuesta un peso: cuando termines una deuda, échale esa misma cuota a la siguiente. Escribe cuánto más puedes poner cada mes —así sean $20.000— y te dice la fecha y cuánto te ahorras. Al final te arma tu plan en 3 pasos, con el nombre de tus deudas y las cifras en pesos."],
    ["fix", "Las cuentas de Salir de deudas ya cuadran", "Si habías registrado el pago del mes de tu tarjeta, la pantalla decía que ibas a tardar 600 meses y mostraba ahorros imposibles; ya cuenta lo que de verdad debes y la cuota de un mes normal. Un crédito que pagas por quincenas contaba cada quincena como un mes, así que el plazo salía al doble: ahora 20 quincenas son 10 meses, y la plata que dice que pagas al mes es la misma que usa para la cuenta. Y cuando la cuota solo alcanza para los intereses, te explicamos que así la deuda no baja en vez de inventarnos un plazo."],
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
  "¿Puedo usar Mirai en el celular?": { a: "Sí, y mejor si lo instalas: toca tu foto en el menú › <b>Instalar Mirai</b>. En iPhone, abre Mirai en Safari, toca <b>Compartir</b> y luego <b>Agregar a inicio</b>. Queda con su ícono, se abre a pantalla completa y te llegan los avisos. El menú se abre con <b>Menú</b> en la barra de abajo.", go: "ajustes", tab: "app" },
  "¿Dónde se guardan mis datos?": { a: "En los servidores de Mirai (Hostinger, en Brasil; los archivos en Cloudflare), protegidos con permisos por hogar: solo tú y las personas que invites pueden verlos. Puedes descargar una copia o eliminar tu cuenta en <b>Ajustes › Datos y cuenta</b>.", go: "ajustes", tab: "respaldo" },
}
/** Preguntas nuevas de la v5 (van al final de su categoría). */
const FAQ_V5: Faq[] = [
  { c: "Gastos", q: "¿Por qué una compra con tarjeta no sale como gasto en el Balance?", a: "Para no contarla dos veces. En el Balance la plata sale de tu bolsillo cuando <b>pagas la tarjeta</b>, así que ahí sale el pago del mes de cada tarjeta (las cuotas de tus compras). La compra sí cuenta en <b>en qué se va la plata</b> del Dashboard y contra tu presupuesto. Lo mismo pasa con el pago de un gasto fijo y con la cuota de un préstamo: salen una sola vez.", go: "balance" },
  { c: "Primeros pasos", q: "¿Cómo instalo Mirai como app en mi celular o computador?", a: "<b>Android y computador (Chrome o Edge):</b> toca tu foto en el menú › <b>Instalar Mirai</b> y confirma. <b>iPhone o iPad:</b> abre Mirai en <b>Safari</b>, toca <b>Compartir</b> › <b>Agregar a inicio</b> › <b>Agregar</b>. <b>Mac:</b> en Safari, Archivo › <b>Agregar al Dock</b>. No ocupa casi espacio, se actualiza sola y tus datos siguen en la nube. Mantén presionado el ícono para los accesos directos (no aplica en iPhone).", go: "ajustes", tab: "app" },
  { c: "Ingresos", q: "¿Debo registrar la prima como un ingreso?", a: "<b>No.</b> La prima legal (la de junio y diciembre), las cesantías y sus intereses Mirai ya los proyecta con tu salario: los ves en <b>Primas</b>. Si la registras también como ingreso, queda contada dos veces. En «Prima o pago extra» anota solo las primas o bonos que tu empresa te dé aparte (prima extralegal, bono por resultados).", go: "primas" },
  { c: "Ingresos", q: "¿A qué ingresos les descuentan salud y pensión?", a: "A lo que es salario: tu sueldo, las horas extras y recargos, y las comisiones. <b>No</b> pagan salud ni pensión el auxilio de transporte, los bonos ocasionales, las vacaciones pagadas en dinero ni la liquidación (aunque sí cuentan para la retención en la fuente). Si trabajas por tu cuenta, tú pagas tu salud (12,5 %) y tu pensión (16 %) sobre el 40 % de lo que facturas. Mirai hace esa cuenta sola según el tipo de ingreso que escojas; todo es un estimado.", go: "ingresos" },
  { c: "Mi dinero", q: "¿Por qué la cuenta T del Balance no muestra mi patrimonio?", a: "Son dos cuentas distintas y ahora están separadas para que no se confundan. La <b>cuenta T del periodo</b> muestra solo lo del mes: lo que entra contra lo que hay que pagar (fijos, día a día, cuotas, tarjetas, suscripciones, impuestos). <b>Tu patrimonio hoy</b>, debajo, muestra todo lo que tienes y todo lo que debes, sin importar el mes. Lo que tienes ahorrado cuenta en el patrimonio, no como gasto del mes.", go: "balance" },
  { c: "Primeros pasos", q: "¿Para qué sirve mi meta financiera principal?", a: "Es tu norte: lo que más quieres lograr con tu plata. En <b>Tu perfil › Tu meta financiera</b> escoges el tipo (fondo de emergencia, salir de deudas, comprar casa, viajar, estudiar, el retiro o tu negocio), cuánto cuesta y para cuándo. Mirai te muestra <b>cuánto llevas, cuánto te falta y cuánto separar al mes</b>, te marca los pasos que ya diste y pone de primeras los consejos que te acercan a ella (en el Dashboard, el Consejero y el chat). Si la meta se cumple ahorrando, la enlazas con una meta de la sección Metas y el avance se actualiza con cada abono.", go: "perfil" },
  { c: "Primeros pasos", q: "¿Cómo cambio la portada de mi perfil?", a: "Entra a <b>Tu perfil</b> y toca <b>Cambiar portada</b> (arriba a la derecha de la franja de color). Escoges una escena por categoría (naturaleza, ciudad, viaje, tu plata, familia o figuras), un color liso o <b>tu propia foto</b>. Se ve mejor si la foto es horizontal. Solo tú la ves en tu perfil.", go: "perfil" },
  { c: "Primeros pasos", q: "¿Cómo quito la ventana que me invita a instalar Mirai?", a: "Cuando te salga, toca <b>No ver más este mensaje</b>: no vuelve a salir en este celular con el navegador que estás usando. Si tocas <b>Instalar después</b>, te la recordamos la próxima vez que entres. Solo aparece si todavía no tienes Mirai instalado, así que al instalarlo también deja de salir; cuando quieras hacerlo, entra a Ajustes › Mirai como app.", go: "ajustes", tab: "app" },
  { c: "Primeros pasos", q: "¿Mirai funciona sin internet?", a: "Necesita internet para mostrarte tus cuentas al día y guardar lo que registras. Si te quedas sin señal, verás un aviso de Mirai y la pantalla se recarga sola cuando vuelve la conexión. Tus datos no se pierden: están guardados en la nube.", go: "ajustes", tab: "app" },
  { c: "Primeros pasos", q: "¿Puedo compartir una factura a Mirai desde otra app?", a: "Sí, en Android con Mirai instalado: en la Galería, WhatsApp o el correo toca <b>Compartir</b> y elige <b>Mirai</b>. Se abre <b>Registrar gasto</b> y la IA lee el valor, el comercio y la fecha de la foto o el PDF. Revisa los datos y guarda. En iPhone, usa <b>Leer una factura con foto</b> dentro del formulario.", go: "gastos" },
  { c: "Primeros pasos", q: "¿Qué me muestra el Dashboard?", a: "Tus números en gráficas para decidir: cuánto entra y sale cada mes, en qué se va la plata, tu patrimonio en el tiempo, tus deudas y cuándo terminan, qué parte de tu ingreso ya está comprometida, cuánto puedes ahorrar y cuántos meses aguantas sin ingresos. En <b>Decisiones</b> te dice qué hacer primero y cuánto te ahorra en pesos.", go: "dashboard" },
]
export const FAQ: Faq[] = [...(FAQ_V4 as Faq[]).map((f) => ({ ...f, ...(FIX[f.q] ?? {}) })), ...FAQ_V5]
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
      "Abre <b>Balance</b> y entra a la pestaña de la quincena: ves lo que entra, lo que sale y lo que te queda en esa mitad del mes.",
      "Cambia de mes con las flechas para ver lo que viene, o abre la pestaña <b>Año</b> para ver el año completo. Filtra por módulo o por lo <b>Pendiente</b> y lo <b>Vencido</b>.",
      "En <b>Inicio</b>, la tarjeta de la quincena te dice cuánto te queda hoy.",
      "Si un gasto fijo es quincenal, puedes ponerle un valor distinto en cada quincena.",
    ],
    tip: "Si te pagan por quincena pero el arriendo sale de la primera, ponlo con su día de pago: Mirai lo ubica en la quincena correcta. Para verlo en gráficas, abre el <b>Dashboard</b>.",
  },
  {
    id: "familia", t: "Invitar a tu familia", icon: "users", go: "ajustes?tab=hogar", min: 2,
    s: [
      "Ve a <b>Ajustes › Hogar y familia</b>.",
      "Toca <b>Agregar persona</b> y elige <b>Invitarla para que use Mirai</b> (o <b>Solo agregarla al hogar</b> si es un niño pequeño o alguien sin cuenta).",
      "Escribe su correo o celular y elige qué podrá hacer: <b>Administra</b>, <b>Colabora</b>, <b>Registra sus gastos</b> o <b>Solo mira</b>.",
      "Toca <b>Enviar invitación</b>. Le llega por correo, o la envías tú con <b>Enviar desde mi WhatsApp</b>. Vence en 7 días y la puedes reenviar o cancelar.",
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
