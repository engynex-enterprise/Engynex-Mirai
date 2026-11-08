"use client"

import { Suspense } from "react"
import { AuthSkeleton } from "@/components/auth/auth-skeleton"
import { MiraiVerification } from "@/components/auth/mirai-verification"

export default function Page() {
  // Reto de dos pasos de Better Auth (código, respaldo o re-enrolamiento).
  return <Suspense fallback={<AuthSkeleton />}><MiraiVerification /></Suspense>
}
