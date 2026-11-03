import { Suspense } from "react"
import { LoginForm } from "@/components/auth/login-form"
import { AuthSkeleton } from "@/components/auth/auth-skeleton"

export const metadata = { title: "Entrar" }

export default function LoginPage() {
  return (
    <Suspense fallback={<AuthSkeleton />}>
      <LoginForm />
    </Suspense>
  )
}
