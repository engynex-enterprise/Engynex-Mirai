# Historial de decisiones (construcción con Claude, oct 2026)

Resumen de lo que pidió el dueño del producto y lo que se decidió, para que cualquier agente entienda el porqué.

## Identidad
- Nombre: **Mirai** (未来, "futuro"). Antes "Nido" y "Libro Mayor Familiar". Logo e isotipos propios en `assets/brand/`.
- Estilo Microsoft 365 / Fluent con paleta Engynex; componentes estilo shadcn; isotipos con degradados.
- Se decidió **no** usar logos de marcas de terceros (streaming, proveedores de IA, bancos) por marcas registradas. Se ofrece que el usuario suba sus propios logos.

## Hosting
- "Esto no va a vivir en claude.ai": se publica en **Vercel + Supabase** (o Express en otro hosting). Integraciones y claves se gestionan en el servidor (cifradas), no en el navegador.
- "Claude (incluido)" solo funciona dentro de claude.ai; afuera se usa la clave de Anthropic/OpenAI/Gemini guardada en el servidor.

## Funcionalidades principales (por orden de llegada)
- Formularios con íconos de información; descripciones en cada modal; toasts con deshacer.
- Gastos fijos de servicios como **rango** de valores (agua cada dos meses en Bogotá); elegir quincena pagada y fecha desde la que quedó pagado.
- Crear categorías y entidades (bancos por NIT) con IA.
- Dirección → ciudad/departamento automáticos.
- Préstamos: pago diario, tabla explicada gráficamente, pagos anteriores para usuarios nuevos, OCR de facturas.
- Empeños, suscripciones (streaming), imprevistos y fondo de emergencia con aportes quincenales/mensuales como gasto fijo.
- Novedades, FAQ y manual.
- Ajustes renovados: IA on/off y proveedor; alertas por app, correo y WhatsApp; apariencia; privacidad.
- Descuentos de nómina configurables (salud, pensión, FSP, retención, otros).
- Layout de ancho completo; sin header (sidebar estilo shadcn con buscador, notificaciones, Agregar y botón de contraer).
- Consejero antes de gastar (formulario dinámico, IA, resultado en tarjetas, pestañas simple/financiero) y chat flotante arrastrable con historial.
- Familia con parentesco por lista; calendario de pagos estilo Google Calendar; calendario fiscal de Colombia.
- Integraciones en el servidor: correo Gmail/SendGrid/Resend/SMTP según el proveedor elegido; WhatsApp Cloud API; claves de IA.
- **Gamificación**: puntos, niveles, rachas, insignias ilustradas (bronce/plata/oro), misiones semanales.
- **Menú DIAN**: declaración de renta completa (topes, ingresos, bienes, deudas, dependientes, deducciones, documentos, borrador), valores estimados en el calendario fiscal, y **acceso de la contadora** (solo lectura, cifrado de extremo a extremo, notas).

## Preferencias del dueño del producto
- Respuestas y UI en español; directo, sin rodeos; entiende la intención aunque haya errores de tipeo.
- No es experto en finanzas: todo debe ser extremadamente simple e intuitivo.
- Lenguaje ejecutivo; términos técnicos acompañados de definiciones simples.
