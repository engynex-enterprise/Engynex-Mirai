import "server-only"
import "@/lib/services"

// Re-exportación: el código vive en packages/services (@mirai/services). Edítalo allá. Solo servidor.
export * from "@mirai/services/notify/log"
