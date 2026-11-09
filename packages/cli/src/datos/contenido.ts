// Los textos en español de la consola. Una línea por cosa: lo largo se lee en el repositorio.
// Las versiones y los nombres NO van aquí (salen del repositorio); aquí solo el "para qué sirve".

/** Qué hace cada paquete del monorepo. */
export const PAQUETES: Record<string, string> = {
  web: "El Next.js que ve la gente. Solo front: los datos y el login los pide a la API.",
  api: "NestJS: login propio (Better Auth), /v1, tiempo real, trabajos programados y webhooks de pagos.",
  "@mirai/domain": "Los cálculos puros de Mirai (totales, préstamos, renta, flujo integral). Corren igual en el navegador y en la API.",
  "@mirai/db": "Los tipos de la base, generados desde Postgres, y los scripts de migración.",
  "@mirai/contracts": "El contrato entre la web y la API: zod, tablas en vivo, límites y política del libro.",
  "@mirai/services": "Código de servidor compartido: avisos, Google, integraciones, automatizaciones.",
  "@mirai/ai": "La inteligencia artificial: prompts, enrutador de modelos y control de costos.",
  "@mirai/crypto": "Cifrado de los secretos de las integraciones (AES-256-GCM).",
  "@mirai/config": "Configuración compartida: tsconfig, ESLint, Prettier y Vitest.",
  "@mirai/cli": "Esta consola.",
}

/** Para qué usa Mirai cada tecnología, y en qué capa va. */
export type Capa = "front" | "api" | "datos" | "infra" | "herramientas"

export const TECNOLOGIAS: { paquete: string; capa: Capa; que: string }[] = [
  { paquete: "next", capa: "front", que: "El marco de la web: rutas, render en el servidor y PWA." },
  { paquete: "react", capa: "front", que: "La librería con la que está hecha la interfaz." },
  { paquete: "@tanstack/react-query", capa: "front", que: "Guarda y sincroniza los datos en el navegador (y permite usar la app sin conexión)." },
  { paquete: "tailwindcss", capa: "front", que: "Los estilos. Encima va shadcn con la paleta Engynex." },
  { paquete: "@radix-ui/react-dialog", capa: "front", que: "La base accesible de las ventanas y menús (shadcn)." },
  { paquete: "react-hook-form", capa: "front", que: "Los formularios." },
  { paquete: "@xyflow/react", capa: "front", que: "El editor visual de automatizaciones." },
  { paquete: "@nestjs/core", capa: "api", que: "El marco de la API." },
  { paquete: "better-auth", capa: "api", que: "El login propio: contraseña, enlace mágico, Google y MFA." },
  { paquete: "@ts-rest/core", capa: "api", que: "Hace que la web y la API compartan el mismo contrato tipado." },
  { paquete: "zod", capa: "api", que: "Valida todo lo que entra a la API (y los formularios)." },
  { paquete: "socket.io", capa: "api", que: "El 'sincronizado en vivo': avisa a la web cuando algo cambia." },
  { paquete: "pg", capa: "datos", que: "Conexión directa a Postgres para el login y los avisos de cambios." },
  { paquete: "ioredis", capa: "datos", que: "Redis: colas y límites de uso." },
  { paquete: "@aws-sdk/client-s3", capa: "datos", que: "Archivos (adjuntos, avatares, copias) por S3." },
  { paquete: "turbo", capa: "herramientas", que: "Corre y cachea las tareas del monorepo." },
  { paquete: "typescript", capa: "herramientas", que: "El lenguaje de todo el proyecto." },
  { paquete: "vitest", capa: "herramientas", que: "Las pruebas de los cálculos." },
  { paquete: "@playwright/test", capa: "herramientas", que: "La batería de pruebas de pantalla (escritorio y celular)." },
  { paquete: "eslint", capa: "herramientas", que: "Revisa el estilo y los errores del código." },
  { paquete: "ink", capa: "herramientas", que: "React para la terminal: con esto está hecha esta consola." },
]

export const CAPAS: Record<Capa, string> = {
  front: "Lo que ve la gente",
  api: "El servidor",
  datos: "Los datos",
  infra: "Dónde corre",
  herramientas: "Para trabajar",
}

/** Qué hace cada servicio de Docker. */
export const SERVICIOS: Record<string, string> = {
  db: "Postgres: toda la información de Mirai, con seguridad por fila (RLS).",
  postgrest: "Convierte las tablas en una API REST con los permisos de cada persona.",
  redis: "Colas, límites de uso y candados.",
  api: "La API de Mirai (NestJS).",
  realtime: "El tiempo real: avisa a las pantallas abiertas cuando algo cambia.",
  web: "El Next.js servido a la gente.",
  cron: "Los trabajos programados: avisos cada hora y automatizaciones cada 5 minutos.",
  "db-backup": "Copia diaria de la base.",
  minio: "Archivos (SeaweedFS hablando S3): adjuntos, avatares y copias.",
  gateway: "Puerta de entrada del Supabase local (solo para pruebas).",
}

/** Qué hace cada módulo de la API. Lo que no esté aquí se muestra sin descripción. */
export const MODULOS: Record<string, string> = {
  account: "Cuenta de la persona: perfil, correo, contraseña, borrar cuenta.",
  admin: "La consola de la plataforma (solo administradores).",
  ads: "Anuncios propios del plan Gratis: campañas, alcance y métricas.",
  ai: "Llamadas a la inteligencia artificial, con cupos y registro de costos.",
  assets: "Isotipos y logos que usa la app.",
  auth: "Login propio con Better Auth.",
  automations: "Automatizaciones: dispara las acciones del editor visual.",
  billing: "Planes, suscripciones, pagos y cupones.",
  "book-tables": "El CRUD genérico de las tablas del libro.",
  books: "Libros (cada hogar tiene el suyo) y su snapshot completo.",
  budget: "Presupuesto por categoría.",
  cards: "Tarjetas de crédito: compras, cortes y pagos.",
  catalogs: "Categorías, medios de pago, proveedores y contactos.",
  chat: "El asistente que responde preguntas sobre tus finanzas.",
  expenses: "Gastos.",
  feedback: "Opiniones y sugerencias de la gente.",
  files: "Subir y bajar archivos (adjuntos, avatares).",
  fixed: "Gastos fijos y su pago mes a mes.",
  gami: "Logros, retos y racha.",
  google: "Conexión con Gmail y Calendar.",
  health: "Señales de vida: /healthz, /readyz y la versión.",
  households: "Hogares: miembros, invitaciones y roles.",
  import: "Importar movimientos (archivos y correo) con reglas.",
  incomes: "Ingresos y nómina.",
  insights: "Hallazgos: lo que la app nota sola en tus números.",
  integrations: "Integraciones del hogar y de la plataforma (secretos cifrados).",
  jobs: "Trabajos programados: avisos y automatizaciones.",
  loans: "Lo que te deben y lo que debes, con cuotas e intereses.",
  me: "Quién eres, tu hogar y tu libro activo.",
  notifications: "Avisos por correo, WhatsApp, Telegram y push.",
  realtime: "El gateway de tiempo real.",
  savings: "Metas de ahorro y fondo de emergencia.",
  tax: "Renta: estimación y calendario DIAN.",
}

/** Las reglas que no se rompen (resumen de CLAUDE.md y .agents/rules). */
export const REGLAS: { titulo: string; detalle: string }[] = [
  { titulo: "Un solo camino: la API", detalle: "La web nunca habla con la base. Todo pasa por /v1, con el contrato de @mirai/contracts." },
  { titulo: "Seguridad por fila (RLS)", detalle: "Cada tabla filtra por hogar y libro en la base misma, no solo en el código." },
  { titulo: "Borrado lógico", detalle: "Nada se borra de verdad: se marca deleted_at y las consultas lo filtran." },
  { titulo: "Los secretos viven en la API", detalle: "La web no tiene llaves. Las integraciones se guardan cifradas (AES-256-GCM)." },
  { titulo: "Migraciones aditivas", detalle: "El código publicado tiene que seguir funcionando con el esquema nuevo." },
  { titulo: "Los cálculos son puros", detalle: "Viven en @mirai/domain, sin tocar red ni base, y se prueban contra la versión 4." },
]

/** El camino que recorre un dato, para el panel de arquitectura. */
export const FLUJO: { paso: string; detalle: string }[] = [
  { paso: "Navegador", detalle: "La web (Next 16) con TanStack Query; sin conexión guarda en IndexedDB y encola." },
  { paso: "→ /v1 (mismo origen)", detalle: "Llamadas tipadas con ts-rest y la cookie httpOnly de Better Auth." },
  { paso: "→ API (NestJS)", detalle: "Valida con zod, revisa el plan y arma la consulta con el rol de la persona." },
  { paso: "→ PostgREST", detalle: "Convierte la consulta en SQL aplicando la seguridad por fila." },
  { paso: "→ Postgres", detalle: "Los datos, con RLS, triggers de auditoría y las funciones (RPC) de las escrituras enlazadas." },
  { paso: "↩ Tiempo real", detalle: "Un cambio en la base avisa por socket.io y la pantalla se actualiza sola." },
]
