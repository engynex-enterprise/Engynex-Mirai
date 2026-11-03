// Ejemplo de Vercel AI Gateway con el AI SDK. Uso: npx tsx --env-file=.env.local scripts/ai-gateway/index.mts
// El AI SDK toma AI_GATEWAY_API_KEY del entorno y enruta "proveedor/modelo" por el Gateway.
import { generateText } from "ai"

const { text, usage } = await generateText({
  model: "moonshotai/kimi-k3",
  prompt: "Invent a new holiday and describe its traditions.",
})

console.log(text)
console.log("\n— tokens:", usage.totalTokens)
