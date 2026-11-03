import { NextResponse, type NextRequest } from "next/server"
import { resolveProtocolUrl } from "@/lib/pwa/links"

/** Enlaces web+mirai://gasto, web+mirai://ingreso… (protocol_handlers del manifest). Siempre a una ruta interna. */
export function GET(request: NextRequest) {
  return NextResponse.redirect(new URL(resolveProtocolUrl(request.nextUrl.searchParams.get("u")), request.nextUrl.origin), 303)
}
