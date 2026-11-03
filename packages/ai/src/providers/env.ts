// Variables de entorno de la IA de la plataforma (V7-P). Puro: la API las pasa a rt().env (services-env.ts) y la web
// las lee de process.env. Nunca se registran sus valores.

/** Lee una variable (rt().env en el servidor; un objeto en las pruebas). */
export type EnvFn = (name: string) => string | undefined

export const AI_PLATFORM_ENV = [
  // Proveedor que va primero cuando el hogar no tiene su propio orden: vertex | bedrock | azure | gateway | none.
  "AI_PLATFORM_PROVIDER",
  // Google Vertex AI (ADC: la cuenta de servicio de Cloud Run con roles/aiplatform.user).
  "GOOGLE_VERTEX_PROJECT",
  "GOOGLE_VERTEX_LOCATION",
  // Amazon Bedrock: región y cadena de credenciales (variables, contenedor de ECS/EKS o clave de API de Bedrock).
  "AI_BEDROCK_REGION",
  "AWS_REGION",
  "AWS_DEFAULT_REGION",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "AWS_BEARER_TOKEN_BEDROCK",
  "AWS_CONTAINER_CREDENTIALS_RELATIVE_URI",
  "AWS_CONTAINER_CREDENTIALS_FULL_URI",
  "AWS_CONTAINER_AUTHORIZATION_TOKEN",
  "AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE",
  // Azure OpenAI: recurso y clave opcional; sin clave, identidad administrada (Container Apps/App Service o IMDS).
  "AZURE_OPENAI_ENDPOINT",
  "AZURE_OPENAI_API_KEY",
  "AZURE_CLIENT_ID",
  "IDENTITY_ENDPOINT",
  "IDENTITY_HEADER",
] as const

export type AiPlatformEnvName = (typeof AI_PLATFORM_ENV)[number]
