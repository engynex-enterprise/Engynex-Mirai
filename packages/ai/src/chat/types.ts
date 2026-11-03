// Re-exportación: los tipos del chat (ChatEvent, Propuesta, Consulta, ChatMsg…) viven en @mirai/contracts/chat-types
// porque son el protocolo del streaming NDJSON que comparten la web, la API y el navegador.
export * from "@mirai/contracts/chat-types"
