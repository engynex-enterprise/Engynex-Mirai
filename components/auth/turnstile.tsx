"use client"

import { useEffect, useRef, useState } from "react"
import Script from "next/script"

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
declare global { interface Window { turnstile?: { render: (el: HTMLElement, o: Record<string, unknown>) => string; reset: (id?: string) => void } } }

/**
 * Cloudflare Turnstile (captcha invisible). Solo se muestra si existe NEXT_PUBLIC_TURNSTILE_SITE_KEY;
 * la validación la hace Supabase Auth (Bot and Abuse Protection) con el token.
 */
export function useCaptcha() {
  const [token, setToken] = useState<string | undefined>(undefined)
  const ref = useRef<HTMLDivElement>(null)
  const id = useRef<string | null>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (!SITE_KEY || !ready || !ref.current || id.current || !window.turnstile) return
    id.current = window.turnstile.render(ref.current, { sitekey: SITE_KEY, language: "es", appearance: "interaction-only", callback: (t: string) => setToken(t), "expired-callback": () => setToken(undefined) })
  }, [ready])
  const widget = SITE_KEY ? (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" onReady={() => setReady(true)} />
      <div ref={ref} className="min-h-0" />
    </>
  ) : null
  return { enabled: !!SITE_KEY, token, widget, reset: () => { if (id.current) window.turnstile?.reset(id.current); setToken(undefined) } }
}
