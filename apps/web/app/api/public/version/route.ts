import { NextResponse } from "next/server"

/** Versión desplegada (la app la compara con la suya para ofrecer "Hay una versión nueva · Actualizar"). */
export function GET() {
  return NextResponse.json({ build: process.env.NEXT_PUBLIC_BUILD_ID ?? "dev" }, { headers: { "Cache-Control": "no-store, max-age=0" } })
}
