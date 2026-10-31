// ================= Ayuda: Novedades (release notes), Preguntas frecuentes, Manual e instructivos =================
const APP_VER='4.0';
const RELEASES=[
 {v:'4.0',f:'31 oct 2026',t:'Nuevo menú DIAN y acceso para tu contador',items:[
  ['new','Menú DIAN','Reúne la Declaración de renta, el Calendario fiscal y laboral y el Acceso de tu contador.'],
  ['new','Declaración de renta completa','Por pestañas: ¿Debo declarar?, ingresos y retenciones, bienes, deudas, dependientes, deducciones, documentos y borrador del impuesto con la tabla del artículo 241. Puedes elegir quién declara (tú o tu pareja) y el año gravable.'],
  ['new','Registro de bienes','Casas, lotes, carros, cuentas, inversiones, cripto y bienes en el exterior, con costo fiscal, avalúo, porcentaje de propiedad y dueño. Se pueden traer desde Mi dinero.'],
  ['new','Dependientes','Marca a tus hijos y familiares como dependientes con su fecha de nacimiento y si estudian. Mirai verifica si cuentan y aplica la combinación que más te conviene (10% o 72 UVT por dependiente).'],
  ['new','Acceso de tu contador','Enlace de solo lectura, cifrado en tu equipo (ni el servidor puede leer tus datos), con vencimiento, actualización automática, descarga en Excel o PDF y notas entre los dos. Lo puedes quitar cuando quieras.'],
  ['imp','Calendario con valores estimados','Cada fecha muestra un valor calculado con tus datos: primas, cesantías e intereses según tu salario, renta según tu borrador, predial y vehicular según tus bienes, matrículas según la pensión del colegio y el ajuste del arriendo con el IPC.'],
  ['imp','Informe y Excel para la declaración','Un informe imprimible y un Excel con hojas de borrador, ingresos, bienes, cuentas, inversiones, deudas, dependientes, deducciones y gastos del año.']]},
 {v:'3.9',f:'31 oct 2026',t:'Logros, integraciones en tu servidor y pantalla más limpia',items:[
  ['new','Logros y nivel','Ganas puntos por registrar gastos, pagar a tiempo, ahorrar y cumplir retos. 8 niveles (de Semilla a Mirai), racha de días seguidos, 18 insignias ilustradas (bronce: sello redondo, plata: hexágono, oro: roseta con laureles), y 3 misiones nuevas cada semana. Se puede apagar.'],
  ['new','Proveedor de correo a elección','En Alertas y notificaciones eliges Gmail, SendGrid, Resend o SMTP y, según el que elijas, llenas sus datos (clave de API, contraseña de aplicación o servidor SMTP). Se guardan cifrados en tu servidor.'],
  ['new','WhatsApp y claves de IA en el servidor','El token de WhatsApp Cloud API y las claves de Claude, ChatGPT o Gemini se guardan en tu servidor, nunca en el navegador. Con botón de prueba para cada uno.'],
  ['new','Listo para Vercel + Supabase','El servidor de Mirai funciona en Vercel con base de datos Supabase, con cron para los avisos aunque no abras la app.'],
  ['imp','Sin barra superior','El botón para contraer el menú quedó dentro del menú, la ruta (miga de pan) pasó al contenido y Agregar quedó en el menú (atajo N). El tema y ocultar montos siguen en tu menú de usuario.'],
  ['imp','Globo de chat más claro','El asistente ahora es un globo de conversación con puntos animados y la etiqueta "Pregúntale a Mirai".']]},
 {v:'3.8',f:'31 oct 2026',t:'Calendarios renovados',items:[
  ['new','Próximos pagos estilo Google Calendar','Vistas Agenda, Semana y Mes, calendario pequeño para saltar de fecha, filtros por tipo, totales del periodo y detalle de cada evento con botón para pagar o registrar el cobro.'],
  ['new','Exportar a .ics','Lleva tus pagos a Google Calendar, Outlook o el calendario del celular, con recordatorio un día antes.'],
  ['new','Calendario fiscal de Colombia','Plantillas laborales y tributarias: cesantías, intereses, primas, dotación, salario mínimo, renta, activos en el exterior, predial y vehicular de Bogotá 2026, SOAT, técnico-mecánica, matrículas y más.'],
  ['new','Tu fecha de renta','Escribe los 2 últimos dígitos de tu cédula y ves tu fecha según el calendario DIAN 2026.'],
  ['imp','Fechas más cómodas','En todos los calendarios puedes tocar el mes o el año para saltar, escribir la fecha (dd/mm/aaaa) o usar atajos como +6 meses o +1 año.'],
  ['imp','Plazo de inversiones','Elige el plazo en días, semanas, meses o años, con atajos y la fecha de vencimiento calculada.'],
  ['imp','Integrantes de la familia','Parentesco para seleccionar, presupuesto mensual explicado y edición de cada integrante.']]},
 {v:'3.7',f:'31 oct 2026',t:'Asesor financiero, nuevo diseño y servidor propio',items:[
  ['new','Consejero guiado','Escribe lo que piensas hacer con tus palabras; la IA entiende el caso, arma un formulario corto ya lleno y tú solo ajustas.'],
  ['new','Más situaciones','Comprar, sacar tarjeta de crédito, pedir un crédito, prestar, asumir un gasto mensual, invertir, abonar a una deuda o empeñar.'],
  ['new','Respuesta en tarjetas con dos vistas','"Explicación sencilla" (por defecto) para quien no sabe de finanzas y "Vista financiera" con flujo de caja, endeudamiento, liquidez y TEA.'],
  ['new','Chat del asesor','Burbuja flotante que puedes mover a donde quieras. Responde dudas, te lleva al Consejo antes de gastar cuando vas a decidir algo y guarda el historial como en ChatGPT.'],
  ['new','Mirai Server','Correo con SendGrid, Resend o SMTP, WhatsApp con la API oficial, IA con tus claves y avisos aunque no abras la app. Listo para Cloud Run o Hostinger.'],
  ['imp','Diseño tipo shadcn','Sin barra superior: buscador y notificaciones en el menú, contenido a todo el ancho y ruta con botón Agregar arriba.']]},
 {v:'3.6',f:'31 oct 2026',t:'Ajustes renovados, IA a tu medida y descuentos de nómina',items:[
  ['new','Encender o apagar la IA','Interruptor general y por función: categoría automática, hormiga, lectura de fotos, consejero y asistentes.'],
  ['new','Elegir proveedor de IA','Claude incluido, o tu propia clave de API de Anthropic, OpenAI o Google Gemini, con botón "Probar conexión". La clave se guarda solo en tu navegador.'],
  ['new','Alertas y notificaciones por canal','En la app, por correo (resumen diario o semanal desde tu Gmail) y por WhatsApp (mensaje listo para enviar con un toque). Tabla para elegir qué aviso llega por cada canal y horario de silencio.'],
  ['new','Descuentos de nómina','Al registrar un ingreso escribe el salario o valor del contrato y elige empleado, independiente o pensionado: calculamos salud, pensión, fondo de solidaridad, ARL, retención y tus otros descuentos para usar lo que realmente te llega.'],
  ['new','Apariencia','Tema claro, oscuro o automático, tamaño de letra, densidad compacta y menos animaciones.'],
  ['new','Privacidad','Ocultar montos al abrir, difuminar al cambiar de ventana y quitar valores de correos y WhatsApp.'],
  ['new','Salario mínimo y UVT editables','En Ajustes › Finanzas, con los valores 2026 ya cargados.'],
  ['imp','Ajustes más fáciles de recorrer','Menú lateral con grupos, descripciones y buscador de ajustes.']]},
 {v:'3.5',f:'31 oct 2026',t:'Ahorro automático en tu calendario',items:[
  ['new','Aporte programado al fondo de emergencia','Define cuánto guardas cada quincena o mes; queda como gasto fijo con recordatorio y, al tocar "Ya aporté", se suma al fondo.'],
  ['new','Aporte programado a cada meta','Igual que el fondo: te recordamos aportar cuando recibes tu pago y el avance de la meta se actualiza solo.'],
  ['imp','Días de pago automáticos','El aporte se programa en los días en que recibes tu ingreso, para que ahorres apenas te paguen.'],
  ['imp','Menú más ordenado','Al abrir una sección del menú se cierran las demás.']]},
 {v:'3.4',f:'31 oct 2026',t:'Imprevistos, empeños y préstamos que ya venían de antes',items:[
  ['new','Fondo de emergencia como bolsillo aparte','Guarda dinero solo para emergencias y úsalo cuando pase algo; cada uso queda como gasto en Imprevistos.'],
  ['new','Categoría Imprevistos','Se detecta sola al escribir "se dañó", "grúa", "multa", "plomero"… y ofrece pagarlo con el fondo de emergencia.'],
  ['new','Empeños','Botón "Registrar empeño" en Le debo: objeto empeñado, valor, boleta y fecha límite, con aviso 15 días antes.'],
  ['new','Garantías en Me deben','Registra el objeto que te dejaron como garantía de un préstamo.'],
  ['new','Préstamos ya iniciados','Al registrar un préstamo o deuda elige "Va al día", "Ya se pagaron X cuotas" o "Sé cuánto se debe hoy" y no tienes que registrar cada pago.'],
  ['new','Leer extracto o pagaré con foto','La IA llena entidad, valor, cuotas, tasa, seguros y lo ya pagado; si el banco no existe, lo crea con su NIT.'],
  ['new','Leer comprobante de pago con foto','Llena el valor y la fecha y decide si es una cuota completa o un abono.'],
  ['new','Pago diario','Frecuencias "Diario" y "Diario (lunes a sábado)" para préstamos.'],
  ['imp','Nuevo diseño de Me deben y Le debo','Recuadro de "lo que debe pagar ahora", cifras claras, barra de qué incluye cada cuota, gráfica de todas las cuotas y guía para leer la tabla.'],
  ['imp','Suscripciones','Accesos rápidos a servicios populares, medio de pago, planes compartidos (solo se cuenta tu parte) y logo propio opcional.']]},
 {v:'3.3',f:'31 oct 2026',t:'Formularios más simples e inteligentes',items:[
  ['new','Ayuda en cada campo','Ícono de información (i) junto a cada título con una explicación sencilla; ya no hay textos debajo de los campos.'],
  ['new','Descripción en cada ventana','Todas las ventanas explican para qué sirven.'],
  ['new','Crear categorías desde la lista','"Crear categoría" o "Que la IA la cree" al final del desplegable.'],
  ['new','Crear bancos o entidades desde la lista','Con identificación por nombre o NIT usando IA y cálculo del dígito de verificación.'],
  ['new','Ciudades de Colombia y dirección inteligente','Lista de municipios con su departamento; al escribir la dirección se ordena al formato colombiano y se detectan ciudad, departamento y barrio.'],
  ['new','Gastos fijos con rango de valor','Agua, luz, gas, internet y planes móviles piden mínimo y máximo; el rango se ajusta con tus pagos reales.'],
  ['new','Fecha del próximo pago','Los gastos fijos se cuentan desde la próxima fecha, así nada sale vencido si ese mes no tocaba pagar (ideal para el agua bimestral).'],
  ['new','Quincenas y frecuencias','Indica qué quincena pagaste y la fecha; nuevas frecuencias cada tres y cada seis meses.'],
  ['new','¿Gasto fijo o deuda?','Si escribes "cuota", "Celya", "Addi"… te sugiere registrarlo como deuda.'],
  ['imp','Notificaciones renovadas','Avisos con ícono y color por tipo, barra de tiempo, pausa al pasar el mouse y botón Deshacer al eliminar.'],
  ['imp','Formularios más amplios','Más espacio entre campos y campos más altos.'],
  ['fix','Buscador de las listas','La búsqueda dentro de los desplegables ahora filtra correctamente.']]},
 {v:'3.0',f:'Oct 2026',t:'Nace Mirai',items:[
  ['new','Nueva marca: Mirai','"Futuro" en japonés. Logo de sol naciente sobre un horizonte que sube.'],
  ['new','Colección de isotipos','Íconos propios para cada sección, en estilo fluido y consistente.'],
  ['new','Cuenta de acceso','Registro, inicio de sesión, verificación en dos pasos con app de autenticación, códigos de respaldo, recuperación de cuenta y bloqueo por inactividad.'],
  ['new','Cajón de apps','El botón de 9 puntos abre tus otras apps favoritas.'],
  ['imp','Diseño estilo Microsoft 365','Encabezado, menú y componentes con la paleta Engynex.']]},
 {v:'2.0',f:'Oct 2026',t:'Más módulos y guía de uso',items:[
  ['new','Puesta en marcha','Guía de primeros pasos para nuevos usuarios.'],
  ['new','Tour y tutoriales','Recorrido guiado y explicación de cada sección.'],
  ['new','Tarjetas de crédito','Cupo, fechas de corte y pago, y costo real de diferir compras.'],
  ['new','Correo del banco e Importar extractos','Trae tus compras desde las notificaciones del banco o desde un CSV.'],
  ['new','Planeación','Presupuesto 50/30/20, flujo de caja, retos de ahorro, primas y cesantías, gastos por miembro, mesada de los hijos y gastos compartidos.'],
  ['new','Informes','Salud financiera (solo con datos suficientes), reportes con resumen de IA y asistente de renta.'],
  ['new','Calendario fiscal y próximos pagos','Fechas anuales y recordatorios, con envío a Google Calendar.'],
  ['new','Acuerdo de pago en PDF','Documento de referencia para préstamos entre personas.'],
  ['new','Varios libros','Separa, por ejemplo, el hogar y el negocio.'],
  ['imp','Menú lateral colapsable','Estilo shadcn, con submenús e íconos.'],
  ['imp','Ajustes ampliados','Alertas, finanzas, valores por defecto, categorías, entidades, medios de pago, reglas, seguridad, respaldo, formatear datos y eliminar cuenta.']]},
 {v:'1.0',f:'Oct 2026',t:'Primera versión',items:[
  ['new','Cuenta T','Lo que tienes frente a lo que debes, por quincena o mes completo.'],
  ['new','Me deben y Le debo','Préstamos con tabla de amortización, sistemas francés, alemán, interés simple y americano, cuotas y abonos.'],
  ['new','Gastos hormiga','Detección automática con IA y límite mensual.'],
  ['new','Categoría automática','La categoría se elige sola mientras escribes la descripción.'],
  ['new','Recordatorios y notificaciones','Pagos y cobros próximos o vencidos.'],
  ['new','Consejero IA','Pregúntale si te alcanza antes de comprar, prestar o endeudarte.'],
  ['new','Inversiones y CDT','Rendimiento, retención y vencimiento.'],
  ['new','Perfil, ajustes y modo claro/oscuro','']]}];
const RTYPE={new:['Nuevo','ok','sparkles'],imp:['Mejora','info','trending-up'],fix:['Corrección','warn','wrench']};

const FAQ=[
 {c:'DIAN',q:'¿Cómo le doy acceso a mi contador?',a:'Ve a <b>DIAN › Acceso de tu contador</b>, escribe su nombre, elige qué puede ver y hasta cuándo, y envíale el enlace. Solo puede ver, descargar y dejarte notas. Requiere tener Mirai en tu servidor (Vercel + Supabase).',go:'contador'},
 {c:'DIAN',q:'¿Mis hijos me ayudan a pagar menos renta?',a:'Sí, si son tus dependientes: menores de 18 años, de 18 a 23 si estudian, o con discapacidad. Márcalos en <b>DIAN › Declaración de renta › Dependientes</b>.',go:'renta'},
 {c:'DIAN',q:'¿Para qué registro mis bienes?',a:'Tu casa, carro y cuentas forman tu patrimonio, que se declara cada año y define si estás obligado a declarar. También sirven para estimar el predial y el impuesto vehicular.',go:'renta'},
 {c:'Logros',q:'¿Cómo gano puntos y subo de nivel?',a:'Solo con usar Mirai: registrar gastos (5 puntos), ingresos (20), pagar cuotas a tiempo (25), marcar gastos fijos pagados (10), cumplir metas, retos y misiones semanales, y ganar insignias. Míralo en <b>Planeación › Logros y nivel</b>.',go:'logros'},
 {c:'Logros',q:'¿Puedo quitar los logros?',a:'Sí. En <b>Logros y nivel</b> apaga el interruptor "Mostrar logros" y desaparecen de Inicio y del menú.',go:'logros'},
 {c:'Notificaciones',q:'¿Qué servicio de correo uso: Gmail, SendGrid, Resend o SMTP?',a:'<b>Gmail</b> si quieres algo rápido con tu cuenta (necesitas una contraseña de aplicación). <b>Resend</b> es el más fácil con Vercel. <b>SendGrid</b> si ya lo usas. <b>SMTP</b> si tienes el correo de tu hosting (Hostinger, Zoho…). Elígelo en Ajustes › Alertas y notificaciones.',go:'ajustes'},
 {c:'Notificaciones',q:'¿Dónde quedan guardadas mis claves?',a:'En tu servidor (por ejemplo Vercel + Supabase), cifradas con AES-256. El navegador solo ve los últimos 4 caracteres.',go:'ajustes'},
 {c:'Primeros pasos',q:'¿Por dónde empiezo?',a:'Abre <b>Puesta en marcha</b> en el menú. Te lleva paso a paso: tu ingreso, tus gastos fijos, tus cuentas y tus deudas. Con eso Mirai ya puede avisarte y aconsejarte.',go:'puesta'},
 {c:'Primeros pasos',q:'Ya tenía deudas y préstamos pagados en parte, ¿debo registrar cada pago?',a:'No. Al registrar el préstamo, en "¿Ya has pagado algo?" elige <b>Va al día</b>, <b>Ya se pagaron algunas cuotas</b> o <b>Sé cuánto se debe hoy</b>. Pon la fecha real en que empezó el préstamo.',go:'le-debo'},
 {c:'Primeros pasos',q:'¿Puedo usar Mirai en el celular?',a:'Sí. La plataforma se adapta a la pantalla del celular. El menú se abre con el botón de tres rayas arriba a la izquierda.'},
 {c:'Primeros pasos',q:'¿Escribo mi salario completo o lo que me llega?',a:'Puedes escribir cualquiera. Si escribes el salario o el valor del contrato, elige <b>"No, es el salario o valor del contrato"</b> y Mirai calcula salud, pensión, fondo de solidaridad, retención y tus otros descuentos (libranzas, cooperativa…). Si eres independiente, calcula la seguridad social sobre el 40%. Todo es configurable porque no a todos les descuentan lo mismo.',go:'ingresos'},
 {c:'Inteligencia artificial',q:'¿Puedo apagar la IA o usar ChatGPT o Gemini?',a:'Sí. En <b>Ajustes › Inteligencia artificial</b> puedes apagarla, apagar funciones una por una o elegir proveedor. Para OpenAI, Gemini o tu propia cuenta de Claude se usa una clave de API (las suscripciones personales no se pueden vincular). Dentro de claude.ai la conexión a otros proveedores puede estar bloqueada; en ese caso Mirai usa Claude incluido.',go:'ajustes',tab:'ia'},
 {c:'Cuenta y seguridad',q:'¿Me pueden llegar los avisos por correo o WhatsApp?',a:'Sí. En <b>Ajustes › Alertas y notificaciones</b> activa el correo (resumen diario o semanal desde tu Gmail conectado) y WhatsApp (te dejamos el mensaje listo para enviarlo a tu número con un toque). Elige qué avisos van por cada canal.',go:'ajustes',tab:'alertas'},
 {c:'Inteligencia artificial',q:'¿Cómo uso el asesor financiero?',a:'Toca la <b>burbuja</b> flotante (puedes arrastrarla a donde quieras) y escribe tu pregunta. Si vas a decidir una compra, crédito, tarjeta o préstamo, te lleva al <b>Consejo antes de gastar</b> para analizarlo con tus números. Elige el tono <b>Sencillo</b> o <b>Financiero</b>. Tus conversaciones quedan en el historial.',go:'consejero'},
 {c:'Gastos',q:'¿Cuál es la diferencia entre gasto, gasto fijo y deuda?',a:'<b>Gasto</b>: algo que pagaste una vez (mercado, un almuerzo). <b>Gasto fijo</b>: se repite y no se acaba (arriendo, servicios, colegio). <b>Deuda</b>: tiene un total que se termina de pagar en cuotas (crédito, compra a cuotas como un televisor con Celya).'},
 {c:'Gastos',q:'¿Qué es un gasto hormiga?',a:'Gastos pequeños y frecuentes (cafés, snacks, domicilios) que al mes suman mucho. La IA los detecta sola; puedes ponerles un límite mensual en Ajustes.',go:'gastos'},
 {c:'Gastos',q:'Los servicios no cuestan lo mismo cada mes, ¿cómo los registro?',a:'En Gastos fijos elige <b>"Cambia cada mes (rango)"</b> y escribe cuánto pagas en un mes bajo y en uno alto. Se usa el promedio y el rango se ajusta con tus pagos reales.',go:'fijos'},
 {c:'Gastos',q:'Mi recibo del agua aparece vencido pero este mes no tocaba pagar',a:'Abre el gasto fijo, toca <b>Pagar › "No tocaba pagar · cambiar fecha"</b> y pon la fecha del próximo pago. Desde esa fecha se cuentan los periodos.',go:'fijos'},
 {c:'Gastos',q:'¿Cómo registro un imprevisto?',a:'Registra el gasto normalmente; si escribes algo como "se dañó la nevera" la categoría <b>Imprevistos</b> se pone sola y te ofrece pagarlo con tu fondo de emergencia. También puedes hacerlo desde Metas › Fondo de emergencia › "Usar para un imprevisto".',go:'metas'},
 {c:'Gastos',q:'No encuentro mi categoría',a:'Al final de la lista de categorías toca <b>"Crear categoría"</b> o <b>"Que la IA la cree"</b>. Queda guardada y seleccionada.'},
 {c:'Préstamos y deudas',q:'No entiendo la tabla de cuotas',a:'Cada fila es un pago. <b>Valor de la cuota = Abono a la deuda + Interés</b> (+ seguros si hay). El abono es lo que baja la deuda; el interés es el costo del préstamo (o tu ganancia si prestaste). "Queda debiendo" es lo que falta después de esa cuota.',go:'me-deben'},
 {c:'Préstamos y deudas',q:'¿Qué significa "1% mensual" y "E.A."?',a:'El <b>interés mensual</b> es lo que se cobra cada mes sobre lo que se debe. La <b>tasa E.A. (efectiva anual)</b> es lo que cuesta en un año completo; es la que muestran los bancos. Si solo tienes la E.A., escríbela y Mirai calcula la mensual.'},
 {c:'Préstamos y deudas',q:'¿Qué sistema de cuota elijo?',a:'Si no sabes, deja <b>Cuota fija</b>: es el que usan los bancos en Colombia. "Cuota que va bajando" paga menos intereses en total. "Interés sobre lo prestado" es común entre conocidos. "Solo intereses" es típico en empeños.'},
 {c:'Préstamos y deudas',q:'¿Cómo registro algo que empeñé?',a:'En <b>Le debo › Registrar empeño</b>. Pon la casa de empeño, el valor que te prestaron, el interés, qué empeñaste y la fecha límite para recuperarlo. Te avisamos 15 días antes.',go:'le-debo'},
 {c:'Préstamos y deudas',q:'Me pagaron un valor diferente a la cuota, ¿qué hago?',a:'En Registrar pago elige <b>"Hizo un abono"</b> y escribe el valor. Puedes decidir si el abono acorta el plazo o baja la cuota.'},
 {c:'Préstamos y deudas',q:'¿Puedo registrar préstamos que se cobran todos los días?',a:'Sí. En "¿Cada cuánto se paga?" elige <b>Diario</b> o <b>Diario (lunes a sábado)</b>.'},
 {c:'Préstamos y deudas',q:'El banco no está en la lista',a:'En la lista de bancos toca <b>"Crear banco o entidad"</b> o <b>"Que la IA la identifique"</b> escribiendo el nombre o el NIT. Confirma el NIT con tu extracto.'},
 {c:'Ahorro',q:'¿Qué es el fondo de emergencia y cuánto debo tener?',a:'Es dinero guardado aparte solo para imprevistos (perder el trabajo, una enfermedad, un daño). Lo recomendado es entre 3 y 6 meses de tus gastos básicos. Puedes cambiar los meses en Ajustes.',go:'metas'},
 {c:'Ahorro',q:'¿Cómo hago para no olvidar ahorrar cada quincena?',a:'En Metas y emergencia toca <b>"Programar un aporte fijo"</b> en el fondo de emergencia o en cualquier meta. Elige cuánto y cada cuánto: queda en tus gastos fijos, te recordamos el día en que te pagan y al tocar <b>"Ya aporté"</b> se suma solo.',go:'metas'},
 {c:'Ahorro',q:'¿Cómo registro mis suscripciones de streaming?',a:'En <b>Mi dinero › Suscripciones › Agregar</b>. Toca el servicio, escribe el valor y la fecha del próximo cobro. Si compartes el plan, indica entre cuántos y solo se cuenta tu parte.',go:'suscripciones'},
 {c:'Inteligencia artificial',q:'¿Qué hace la IA en Mirai?',a:'Categoriza gastos, detecta gastos hormiga, lee facturas, extractos y comprobantes con foto, identifica bancos por NIT, crea categorías, detecta la ciudad de una dirección y te aconseja antes de gastar o prestar.'},
 {c:'Inteligencia artificial',q:'¿Puedo confiar en lo que llena la IA?',a:'La IA ayuda, pero puede equivocarse. Siempre revisa los datos antes de guardar, sobre todo valores, fechas y NIT.'},
 {c:'Inteligencia artificial',q:'La lectura con foto no funciona',a:'Funciona dentro de claude.ai. Usa una foto nítida, con buena luz y el documento completo. Si no lee bien, escribe los datos a mano.'},
 {c:'Cuenta y seguridad',q:'¿Cómo protejo mi información?',a:'Crea tu cuenta con contraseña y activa la <b>verificación en dos pasos</b> en Ajustes › Seguridad. Guarda tus códigos de respaldo en un lugar seguro.',go:'ajustes',tab:'seguridad'},
 {c:'Cuenta y seguridad',q:'Perdí el celular con la app de autenticación',a:'En la pantalla de verificación toca <b>"¿No tienes tu celular? Usa un código de respaldo"</b>. Si tampoco los tienes, toca <b>"¿Olvidaste tu contraseña?"</b> para recuperar la cuenta con un código que te enviamos al correo.'},
 {c:'Cuenta y seguridad',q:'¿Dónde se guardan mis datos?',a:'Si en la parte de abajo del menú dice <b>"Guardado en la nube"</b>, tus datos se guardan en la nube de tu cuenta. Si dice <b>"Solo en este navegador"</b>, quedan en este equipo: haz respaldos en Ajustes › Respaldo.'},
 {c:'Cuenta y seguridad',q:'¿Cómo borro todo o elimino mi cuenta?',a:'En Ajustes › Respaldo puedes descargar un respaldo, formatear los datos o eliminar la cuenta. Ambas acciones son definitivas.',go:'ajustes'},
 {c:'Otros',q:'¿Puedo llevar las finanzas de mi negocio aparte?',a:'Sí. Toca el nombre del libro arriba en el menú y crea un libro nuevo. Cada libro tiene sus propios datos.'},
 {c:'Otros',q:'¿Cómo comparto gastos con otras personas?',a:'En Planeación › Gastos compartidos crea un grupo (un viaje, la casa) y anota quién pagó; Mirai calcula quién le debe a quién.',go:'compartidos'},
 {c:'Otros',q:'¿Cómo vuelvo a ver el tour?',a:'Usa el botón <b>"Ver el tour"</b> en Manual e instructivos, o el botón "Hacer el tour" en Ajustes.',go:'manual'}];

const GUIDES=[
 {id:'g1',t:'Registrar tu primer gasto',icon:'receipt',go:'gastos',min:1,s:['Toca el botón + arriba o "Registrar gasto".','Escribe en qué gastaste; la categoría se elige sola.','Escribe el valor; el formato de pesos se pone solo.','Revisa quién gastó y cómo pagaste, y toca Guardar gasto.'],tip:'También puedes escribir en Inicio: "gasté 15 mil en almuerzo ayer".'},
 {id:'g2',t:'Registrar una deuda que ya venías pagando',icon:'landmark',go:'le-debo',min:3,s:['Ve a Le debo › Nueva deuda.','Elige el banco (o créalo desde la lista).','Escribe cuánto te prestaron, la fecha en que empezó y el número de cuotas.','Escribe la tasa o el valor de la cuota.','En "¿Ya has pagado algo?" elige "Sé cuánto se debe hoy" y escribe el saldo del extracto.','Revisa el resumen y guarda.'],tip:'Con el botón "Leer con foto" la IA llena todo desde el extracto.'},
 {id:'g3',t:'Registrar un pago recibido o hecho',icon:'circle-dollar-sign',go:'me-deben',min:1,s:['Abre el préstamo en Me deben o Le debo.','Toca "Registrar pago".','Elige "Pagó la cuota completa" o "Hizo un abono".','Pon la fecha y guarda.'],tip:'Sube el comprobante con "Leer comprobante" y se llena solo.'},
 {id:'g4',t:'Registrar un empeño',icon:'gem',go:'le-debo',min:2,s:['Ve a Le debo › Registrar empeño.','Elige o crea la casa de empeño.','Escribe el valor prestado, el interés mensual y los meses.','Escribe qué empeñaste, cuánto vale, la fecha límite y el número de boleta.','Guarda: te avisaremos 15 días antes de la fecha límite.']},
 {id:'g5',t:'Agregar los servicios públicos',icon:'zap',go:'fijos',min:2,s:['Ve a Gastos fijos › Agregar gasto fijo.','Escribe el nombre (agua, luz, gas, internet): se marca "Cambia cada mes".','Escribe cuánto pagas en un mes bajo y en uno alto.','Elige cada cuánto se paga y la fecha del próximo pago.','Si ya pagaste el último, márcalo con su fecha.']},
 {id:'g6',t:'Crear tu fondo de emergencia',icon:'umbrella',go:'metas',min:1,s:['Ve a Planeación › Metas y emergencia.','En Fondo de emergencia toca "Guardar dinero" para registrar lo que ya tienes.','Toca "Programar un aporte fijo" y elige cuánto guardar cada quincena o mes.','Cada vez que te llegue el recordatorio, toca "Ya aporté".','Cuando pase algo, usa "Usar para un imprevisto".']},
 {id:'g7',t:'Agregar una suscripción de streaming',icon:'repeat',go:'suscripciones',min:1,s:['Ve a Mi dinero › Suscripciones › Agregar.','Toca el servicio o escribe otro.','Escribe el valor, si es mensual o anual y el próximo cobro.','Si compartes el plan, indica entre cuántos.']},
 {id:'g8',t:'Proteger tu cuenta con verificación en dos pasos',icon:'shield-check',go:'ajustes',tab:'seguridad',min:3,s:['Ve a Ajustes › Seguridad.','Activa la verificación en dos pasos.','Escanea el código QR con Google o Microsoft Authenticator.','Escribe el código de 6 dígitos.','Descarga y guarda tus códigos de respaldo.']},
 {id:'g9',t:'Dividir gastos con amigos o familia',icon:'split',go:'compartidos',min:2,s:['Ve a Planeación › Gastos compartidos.','Crea un grupo y agrega a los participantes.','Anota cada gasto y quién lo pagó.','Mira el resumen de quién le debe a quién.']},
 {id:'g10',t:'Preguntarle al consejero antes de gastar',icon:'sparkles',go:'consejero',min:1,s:['Abre Consejero IA.','Elige si vas a comprar, prestar o endeudarte.','Escribe el valor y, si es a cuotas, cuántas.','Toca "Analizar con IA" y lee el veredicto.']}];

let AYQ='',FAQC='Todas',MANT='guias';
const ayNorm=s=>FN(String(s).replace(/<[^>]*>/g,''));
const ayGo=(go,tab)=>go?`<button class="btn sm" data-go="${go}" ${tab?`data-tab="${tab}"`:''}>${ic('arrow-right')}Ir a la sección</button>`:'';

V.novedades=()=>{const seen=store.get('mirai-nov-seen','');if(seen!==APP_VER)setTimeout(()=>{store.set('mirai-nov-seen',APP_VER);renderNav(view())},400);
  return pageH('megaphone','b-violet','Novedades','Todo lo que hemos agregado y mejorado en Mirai, de lo más nuevo a lo más antiguo.','')+`
  <div class="rel-hero card"><div>${isoIcon('mirai',56)}</div><div><span class="pill ok">Versión ${APP_VER}</span><h2 style="margin:6px 0 4px">${esc(RELEASES[0].t)}</h2><p class="note" style="margin:0">${RELEASES[0].items.length} novedades · ${RELEASES[0].f}</p></div></div>
  <div class="rel-list">${RELEASES.map((r,ri)=>`<section class="card rel"><div class="rel-h"><span class="rel-v">v${r.v}</span><div><h2>${esc(r.t)}</h2><span class="note">${r.f}${ri===0?' · actual':''}</span></div><div class="rel-cnt">${Object.keys(RTYPE).map(k=>{const n=r.items.filter(i=>i[0]===k).length;return n?`<span class="pill ${RTYPE[k][1]}">${n} ${RTYPE[k][0].toLowerCase()}${n>1?(k==='fix'?'es':'s'):''}</span>`:''}).join('')}</div></div>
   <ul class="rel-items">${r.items.map(([k,t,d])=>`<li><span class="rel-i ${RTYPE[k][1]}">${ic(RTYPE[k][2])}</span><div><b>${esc(t)}</b>${d?`<span>${esc(d)}</span>`:''}</div><span class="pill ${RTYPE[k][1]}">${RTYPE[k][0]}</span></li>`).join('')}</ul></section>`).join('')}</div>`};

V.faq=()=>{ayView();const cats=['Todas',...new Set(FAQ.map(f=>f.c))];const q=ayNorm(AYQ);const L=FAQ.filter(f=>(FAQC==='Todas'||f.c===FAQC)&&(!q||ayNorm(f.q+' '+f.a).includes(q)));
  return pageH('circle-help','b-blue','Preguntas frecuentes','Respuestas cortas a las dudas más comunes. Busca o filtra por tema.','')+`
  <div class="card ay-search"><div class="ui-money" style="padding-left:12px">${ic('search')}<input id="ayQ" placeholder="Busca tu duda: empeño, intereses, contraseña…" value="${esc(AYQ)}" autocomplete="off"></div><div class="chips" style="margin-top:12px">${cats.map(c=>`<button class="chip ${c===FAQC?'on':''}" data-act="faqc" data-c="${esc(c)}">${esc(c)}${c!=='Todas'?` <span class="note">${FAQ.filter(f=>f.c===c).length}</span>`:''}</button>`).join('')}</div></div>
  <div class="card"><div class="faq">${L.map((f,i)=>`<details class="faq-i" ${q&&i<3?'open':''}><summary><span class="faq-c">${esc(f.c)}</span><b>${esc(f.q)}</b>${ic('chevron-down')}</summary><div class="faq-a"><p>${f.a}</p>${ayGo(f.go,f.tab)}</div></details>`).join('')||empty('circle-help',`No encontramos "${esc(AYQ)}". Prueba con otra palabra o revisa el Manual.`,`<button class="btn" data-go="manual">${ic('book-open')}Ir al manual</button>`)}</div></div>
  <div class="card ay-more"><span class="ri t-violet">${ic('sparkles')}</span><div><b>¿No encontraste tu respuesta?</b><span class="note">Pregúntale al Consejero IA o revisa el manual paso a paso.</span></div><button class="btn" data-go="manual">${ic('book-open')}Manual</button><button class="btn pri" data-go="consejero">${ic('sparkles')}Consejero IA</button></div>`};

V.manual=()=>{ayView();const q=ayNorm(AYQ);const tabs=[['guias','Instructivos paso a paso','list-checks'],['modulos','Manual por sección','book-open']];
  const G=GUIDES.filter(g=>!q||ayNorm(g.t+' '+g.s.join(' ')).includes(q));
  const mods=MENUPAGES().map(([id,l,icon])=>({id,l,icon})).filter(p=>HELP[p.id]).map(p=>({...p,h:HELP[p.id]})).filter(m=>!q||ayNorm(m.h.t+' '+m.h.i+' '+m.h.p.join(' ')).includes(q));
  const body=MANT==='guias'?`<div class="guides">${G.map(g=>`<details class="guide"><summary><span class="ri t-blue">${ic(g.icon)}</span><div><b>${esc(g.t)}</b><span class="note">${g.s.length} pasos · ${g.min} min</span></div>${ic('chevron-down')}</summary><div class="guide-b"><ol class="steps">${g.s.map(x=>`<li>${esc(x)}</li>`).join('')}</ol>${g.tip?`<p class="note guide-tip">${ic('lightbulb')}${esc(g.tip)}</p>`:''}${ayGo(g.go,g.tab)}</div></details>`).join('')||empty('list-checks','No hay instructivos con esa palabra.')}</div>`
   :`<div class="mods">${mods.map(m=>`<details class="mod"><summary><span class="mod-ic">${isoIcon(m.id,30)||ic(m.icon||'circle')}</span><div><b>${esc(m.h.t)}</b><span class="note">${esc(m.h.i)}</span></div>${ic('chevron-down')}</summary><div class="guide-b"><ol class="steps">${m.h.p.map(x=>`<li>${x}</li>`).join('')}</ol>${m.h.tips?`<ul class="tips">${m.h.tips.map(x=>`<li>${ic('lightbulb')}<span>${x}</span></li>`).join('')}</ul>`:''}${ayGo(m.id)}</div></details>`).join('')||empty('book-open','No hay secciones con esa palabra.')}</div>`;
  return pageH('book-open','b-green','Manual e instructivos','Aprende a usar Mirai: guías paso a paso para las tareas más comunes y el manual de cada sección.',`<button class="btn" data-act="tourStart">${ic('route')}Ver el tour</button>`)+`
  <div class="card ay-search"><div class="ui-money" style="padding-left:12px">${ic('search')}<input id="ayQ" placeholder="¿Qué quieres aprender? Ej. empeño, quincena, extracto…" value="${esc(AYQ)}" autocomplete="off"></div></div>
  <div class="tabs">${tabs.map(([k,l,i])=>`<button class="${MANT===k?'on':''}" data-act="mant" data-t="${k}">${ic(i)}${l}</button>`).join('')}</div>${body}`};

EXTRA_ACT.faqc=b=>{FAQC=b.dataset.c;render()};EXTRA_ACT.mant=b=>{MANT=b.dataset.t;render()};
document.addEventListener('input',e=>{if(e.target.id!=='ayQ')return;AYQ=e.target.value;clearTimeout(window._ayT);window._ayT=setTimeout(()=>{const pos=e.target.selectionStart;render();const n=document.getElementById('ayQ');if(n){n.focus();try{n.setSelectionRange(pos,pos)}catch(_){}}},250)});
let AYV='';const ayView=()=>{const v=view();if(v!==AYV){AYQ='';AYV=v}};
Object.assign(HELP,{
 novedades:{t:'Novedades',i:'Las notas de versión: qué hay de nuevo en cada actualización.',p:['Cada tarjeta es una versión, de la más nueva a la más antigua.','Las etiquetas indican si es algo nuevo, una mejora o una corrección.','Cuando haya novedades sin ver, aparece un punto en el menú.']},
 faq:{t:'Preguntas frecuentes',i:'Respuestas cortas a las dudas más comunes.',p:['Escribe en el buscador una palabra de tu duda.','Filtra por tema con los botones.','Toca una pregunta para ver la respuesta y "Ir a la sección" para hacerlo.']},
 manual:{t:'Manual e instructivos',i:'Guías paso a paso y el manual de cada sección.',p:['En "Instructivos paso a paso" encuentras las tareas más comunes.','En "Manual por sección" está la explicación de cada parte de Mirai.','Usa el buscador para encontrar un tema rápido.']}});
const _rnAy=renderNav;renderNav=function(v){_rnAy(v);if(store.get('mirai-nov-seen','')===APP_VER)return;const a=document.querySelector('#side a[href="#novedades"]');if(a&&!a.querySelector('.nov-dot'))a.insertAdjacentHTML('beforeend','<span class="sb-bdg nov-dot">Nuevo</span>');const g=document.querySelector('#side [data-g="ayuda"] .sb-l');if(g&&!g.querySelector('.nov-pt'))g.insertAdjacentHTML('beforeend','<span class="nov-pt"></span>')};
