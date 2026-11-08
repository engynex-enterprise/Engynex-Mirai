"use client"

import { useEffect, useState } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ThemeProvider } from "next-themes"
import { NuqsAdapter } from "nuqs/adapters/next/app"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"
import { unlockSoundOnGesture } from "@/lib/sound"

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          // gcTime de un día: lo que se vio sigue en memoria y se guarda en el dispositivo para usarse sin conexión.
          queries: { staleTime: 30_000, gcTime: 24 * 3600_000, refetchOnWindowFocus: false, retry: 2 },
          mutations: { retry: 0 },
        },
      }),
  )
  // Los navegadores solo dejan sonar los avisos después del primer toque o tecla (lib/sound.ts).
  useEffect(() => unlockSoundOnGesture(), [])
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={client}>
        <NuqsAdapter>
          <TooltipProvider delayDuration={250}>
            {children}
            <Toaster />
          </TooltipProvider>
        </NuqsAdapter>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
