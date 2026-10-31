# Changelog

Generado desde `RELEASES` en `src/k_ayuda.js` (Ayuda › Novedades). No editar a mano: `node scripts/changelog.js`.

## v4.0 — Nuevo menú DIAN y acceso para tu contador (31 oct 2026)

- **Nuevo · Menú DIAN:** Reúne la Declaración de renta, el Calendario fiscal y laboral y el Acceso de tu contador.
- **Nuevo · Declaración de renta completa:** Por pestañas: ¿Debo declarar?, ingresos y retenciones, bienes, deudas, dependientes, deducciones, documentos y borrador del impuesto con la tabla del artículo 241. Puedes elegir quién declara (tú o tu pareja) y el año gravable.
- **Nuevo · Registro de bienes:** Casas, lotes, carros, cuentas, inversiones, cripto y bienes en el exterior, con costo fiscal, avalúo, porcentaje de propiedad y dueño. Se pueden traer desde Mi dinero.
- **Nuevo · Dependientes:** Marca a tus hijos y familiares como dependientes con su fecha de nacimiento y si estudian. Mirai verifica si cuentan y aplica la combinación que más te conviene (10% o 72 UVT por dependiente).
- **Nuevo · Acceso de tu contador:** Enlace de solo lectura, cifrado en tu equipo (ni el servidor puede leer tus datos), con vencimiento, actualización automática, descarga en Excel o PDF y notas entre los dos. Lo puedes quitar cuando quieras.
- **Mejora · Calendario con valores estimados:** Cada fecha muestra un valor calculado con tus datos: primas, cesantías e intereses según tu salario, renta según tu borrador, predial y vehicular según tus bienes, matrículas según la pensión del colegio y el ajuste del arriendo con el IPC.
- **Mejora · Informe y Excel para la declaración:** Un informe imprimible y un Excel con hojas de borrador, ingresos, bienes, cuentas, inversiones, deudas, dependientes, deducciones y gastos del año.

## v3.9 — Logros, integraciones en tu servidor y pantalla más limpia (31 oct 2026)

- **Nuevo · Logros y nivel:** Ganas puntos por registrar gastos, pagar a tiempo, ahorrar y cumplir retos. 8 niveles (de Semilla a Mirai), racha de días seguidos, 18 insignias ilustradas (bronce: sello redondo, plata: hexágono, oro: roseta con laureles), y 3 misiones nuevas cada semana. Se puede apagar.
- **Nuevo · Proveedor de correo a elección:** En Alertas y notificaciones eliges Gmail, SendGrid, Resend o SMTP y, según el que elijas, llenas sus datos (clave de API, contraseña de aplicación o servidor SMTP). Se guardan cifrados en tu servidor.
- **Nuevo · WhatsApp y claves de IA en el servidor:** El token de WhatsApp Cloud API y las claves de Claude, ChatGPT o Gemini se guardan en tu servidor, nunca en el navegador. Con botón de prueba para cada uno.
- **Nuevo · Listo para Vercel + Supabase:** El servidor de Mirai funciona en Vercel con base de datos Supabase, con cron para los avisos aunque no abras la app.
- **Mejora · Sin barra superior:** El botón para contraer el menú quedó dentro del menú, la ruta (miga de pan) pasó al contenido y Agregar quedó en el menú (atajo N). El tema y ocultar montos siguen en tu menú de usuario.
- **Mejora · Globo de chat más claro:** El asistente ahora es un globo de conversación con puntos animados y la etiqueta "Pregúntale a Mirai".

## v3.8 — Calendarios renovados (31 oct 2026)

- **Nuevo · Próximos pagos estilo Google Calendar:** Vistas Agenda, Semana y Mes, calendario pequeño para saltar de fecha, filtros por tipo, totales del periodo y detalle de cada evento con botón para pagar o registrar el cobro.
- **Nuevo · Exportar a .ics:** Lleva tus pagos a Google Calendar, Outlook o el calendario del celular, con recordatorio un día antes.
- **Nuevo · Calendario fiscal de Colombia:** Plantillas laborales y tributarias: cesantías, intereses, primas, dotación, salario mínimo, renta, activos en el exterior, predial y vehicular de Bogotá 2026, SOAT, técnico-mecánica, matrículas y más.
- **Nuevo · Tu fecha de renta:** Escribe los 2 últimos dígitos de tu cédula y ves tu fecha según el calendario DIAN 2026.
- **Mejora · Fechas más cómodas:** En todos los calendarios puedes tocar el mes o el año para saltar, escribir la fecha (dd/mm/aaaa) o usar atajos como +6 meses o +1 año.
- **Mejora · Plazo de inversiones:** Elige el plazo en días, semanas, meses o años, con atajos y la fecha de vencimiento calculada.
- **Mejora · Integrantes de la familia:** Parentesco para seleccionar, presupuesto mensual explicado y edición de cada integrante.

## v3.7 — Asesor financiero, nuevo diseño y servidor propio (31 oct 2026)

- **Nuevo · Consejero guiado:** Escribe lo que piensas hacer con tus palabras; la IA entiende el caso, arma un formulario corto ya lleno y tú solo ajustas.
- **Nuevo · Más situaciones:** Comprar, sacar tarjeta de crédito, pedir un crédito, prestar, asumir un gasto mensual, invertir, abonar a una deuda o empeñar.
- **Nuevo · Respuesta en tarjetas con dos vistas:** "Explicación sencilla" (por defecto) para quien no sabe de finanzas y "Vista financiera" con flujo de caja, endeudamiento, liquidez y TEA.
- **Nuevo · Chat del asesor:** Burbuja flotante que puedes mover a donde quieras. Responde dudas, te lleva al Consejo antes de gastar cuando vas a decidir algo y guarda el historial como en ChatGPT.
- **Nuevo · Mirai Server:** Correo con SendGrid, Resend o SMTP, WhatsApp con la API oficial, IA con tus claves y avisos aunque no abras la app. Listo para Cloud Run o Hostinger.
- **Mejora · Diseño tipo shadcn:** Sin barra superior: buscador y notificaciones en el menú, contenido a todo el ancho y ruta con botón Agregar arriba.

## v3.6 — Ajustes renovados, IA a tu medida y descuentos de nómina (31 oct 2026)

- **Nuevo · Encender o apagar la IA:** Interruptor general y por función: categoría automática, hormiga, lectura de fotos, consejero y asistentes.
- **Nuevo · Elegir proveedor de IA:** Claude incluido, o tu propia clave de API de Anthropic, OpenAI o Google Gemini, con botón "Probar conexión". La clave se guarda solo en tu navegador.
- **Nuevo · Alertas y notificaciones por canal:** En la app, por correo (resumen diario o semanal desde tu Gmail) y por WhatsApp (mensaje listo para enviar con un toque). Tabla para elegir qué aviso llega por cada canal y horario de silencio.
- **Nuevo · Descuentos de nómina:** Al registrar un ingreso escribe el salario o valor del contrato y elige empleado, independiente o pensionado: calculamos salud, pensión, fondo de solidaridad, ARL, retención y tus otros descuentos para usar lo que realmente te llega.
- **Nuevo · Apariencia:** Tema claro, oscuro o automático, tamaño de letra, densidad compacta y menos animaciones.
- **Nuevo · Privacidad:** Ocultar montos al abrir, difuminar al cambiar de ventana y quitar valores de correos y WhatsApp.
- **Nuevo · Salario mínimo y UVT editables:** En Ajustes › Finanzas, con los valores 2026 ya cargados.
- **Mejora · Ajustes más fáciles de recorrer:** Menú lateral con grupos, descripciones y buscador de ajustes.

## v3.5 — Ahorro automático en tu calendario (31 oct 2026)

- **Nuevo · Aporte programado al fondo de emergencia:** Define cuánto guardas cada quincena o mes; queda como gasto fijo con recordatorio y, al tocar "Ya aporté", se suma al fondo.
- **Nuevo · Aporte programado a cada meta:** Igual que el fondo: te recordamos aportar cuando recibes tu pago y el avance de la meta se actualiza solo.
- **Mejora · Días de pago automáticos:** El aporte se programa en los días en que recibes tu ingreso, para que ahorres apenas te paguen.
- **Mejora · Menú más ordenado:** Al abrir una sección del menú se cierran las demás.

## v3.4 — Imprevistos, empeños y préstamos que ya venían de antes (31 oct 2026)

- **Nuevo · Fondo de emergencia como bolsillo aparte:** Guarda dinero solo para emergencias y úsalo cuando pase algo; cada uso queda como gasto en Imprevistos.
- **Nuevo · Categoría Imprevistos:** Se detecta sola al escribir "se dañó", "grúa", "multa", "plomero"… y ofrece pagarlo con el fondo de emergencia.
- **Nuevo · Empeños:** Botón "Registrar empeño" en Le debo: objeto empeñado, valor, boleta y fecha límite, con aviso 15 días antes.
- **Nuevo · Garantías en Me deben:** Registra el objeto que te dejaron como garantía de un préstamo.
- **Nuevo · Préstamos ya iniciados:** Al registrar un préstamo o deuda elige "Va al día", "Ya se pagaron X cuotas" o "Sé cuánto se debe hoy" y no tienes que registrar cada pago.
- **Nuevo · Leer extracto o pagaré con foto:** La IA llena entidad, valor, cuotas, tasa, seguros y lo ya pagado; si el banco no existe, lo crea con su NIT.
- **Nuevo · Leer comprobante de pago con foto:** Llena el valor y la fecha y decide si es una cuota completa o un abono.
- **Nuevo · Pago diario:** Frecuencias "Diario" y "Diario (lunes a sábado)" para préstamos.
- **Mejora · Nuevo diseño de Me deben y Le debo:** Recuadro de "lo que debe pagar ahora", cifras claras, barra de qué incluye cada cuota, gráfica de todas las cuotas y guía para leer la tabla.
- **Mejora · Suscripciones:** Accesos rápidos a servicios populares, medio de pago, planes compartidos (solo se cuenta tu parte) y logo propio opcional.

## v3.3 — Formularios más simples e inteligentes (31 oct 2026)

- **Nuevo · Ayuda en cada campo:** Ícono de información (i) junto a cada título con una explicación sencilla; ya no hay textos debajo de los campos.
- **Nuevo · Descripción en cada ventana:** Todas las ventanas explican para qué sirven.
- **Nuevo · Crear categorías desde la lista:** "Crear categoría" o "Que la IA la cree" al final del desplegable.
- **Nuevo · Crear bancos o entidades desde la lista:** Con identificación por nombre o NIT usando IA y cálculo del dígito de verificación.
- **Nuevo · Ciudades de Colombia y dirección inteligente:** Lista de municipios con su departamento; al escribir la dirección se ordena al formato colombiano y se detectan ciudad, departamento y barrio.
- **Nuevo · Gastos fijos con rango de valor:** Agua, luz, gas, internet y planes móviles piden mínimo y máximo; el rango se ajusta con tus pagos reales.
- **Nuevo · Fecha del próximo pago:** Los gastos fijos se cuentan desde la próxima fecha, así nada sale vencido si ese mes no tocaba pagar (ideal para el agua bimestral).
- **Nuevo · Quincenas y frecuencias:** Indica qué quincena pagaste y la fecha; nuevas frecuencias cada tres y cada seis meses.
- **Nuevo · ¿Gasto fijo o deuda?:** Si escribes "cuota", "Celya", "Addi"… te sugiere registrarlo como deuda.
- **Mejora · Notificaciones renovadas:** Avisos con ícono y color por tipo, barra de tiempo, pausa al pasar el mouse y botón Deshacer al eliminar.
- **Mejora · Formularios más amplios:** Más espacio entre campos y campos más altos.
- **Corrección · Buscador de las listas:** La búsqueda dentro de los desplegables ahora filtra correctamente.

## v3.0 — Nace Mirai (Oct 2026)

- **Nuevo · Nueva marca: Mirai:** "Futuro" en japonés. Logo de sol naciente sobre un horizonte que sube.
- **Nuevo · Colección de isotipos:** Íconos propios para cada sección, en estilo fluido y consistente.
- **Nuevo · Cuenta de acceso:** Registro, inicio de sesión, verificación en dos pasos con app de autenticación, códigos de respaldo, recuperación de cuenta y bloqueo por inactividad.
- **Nuevo · Cajón de apps:** El botón de 9 puntos abre tus otras apps favoritas.
- **Mejora · Diseño estilo Microsoft 365:** Encabezado, menú y componentes con la paleta Engynex.

## v2.0 — Más módulos y guía de uso (Oct 2026)

- **Nuevo · Puesta en marcha:** Guía de primeros pasos para nuevos usuarios.
- **Nuevo · Tour y tutoriales:** Recorrido guiado y explicación de cada sección.
- **Nuevo · Tarjetas de crédito:** Cupo, fechas de corte y pago, y costo real de diferir compras.
- **Nuevo · Correo del banco e Importar extractos:** Trae tus compras desde las notificaciones del banco o desde un CSV.
- **Nuevo · Planeación:** Presupuesto 50/30/20, flujo de caja, retos de ahorro, primas y cesantías, gastos por miembro, mesada de los hijos y gastos compartidos.
- **Nuevo · Informes:** Salud financiera (solo con datos suficientes), reportes con resumen de IA y asistente de renta.
- **Nuevo · Calendario fiscal y próximos pagos:** Fechas anuales y recordatorios, con envío a Google Calendar.
- **Nuevo · Acuerdo de pago en PDF:** Documento de referencia para préstamos entre personas.
- **Nuevo · Varios libros:** Separa, por ejemplo, el hogar y el negocio.
- **Mejora · Menú lateral colapsable:** Estilo shadcn, con submenús e íconos.
- **Mejora · Ajustes ampliados:** Alertas, finanzas, valores por defecto, categorías, entidades, medios de pago, reglas, seguridad, respaldo, formatear datos y eliminar cuenta.

## v1.0 — Primera versión (Oct 2026)

- **Nuevo · Cuenta T:** Lo que tienes frente a lo que debes, por quincena o mes completo.
- **Nuevo · Me deben y Le debo:** Préstamos con tabla de amortización, sistemas francés, alemán, interés simple y americano, cuotas y abonos.
- **Nuevo · Gastos hormiga:** Detección automática con IA y límite mensual.
- **Nuevo · Categoría automática:** La categoría se elige sola mientras escribes la descripción.
- **Nuevo · Recordatorios y notificaciones:** Pagos y cobros próximos o vencidos.
- **Nuevo · Consejero IA:** Pregúntale si te alcanza antes de comprar, prestar o endeudarte.
- **Nuevo · Inversiones y CDT:** Rendimiento, retención y vencimiento.
- **Nuevo · Perfil, ajustes y modo claro/oscuro:** 

