"use client"

// useQuery seguro para la hidratación (error React #418). Úsalo SIEMPRE en vez del de @tanstack/react-query (ESLint lo exige).
//
// El servidor pinta cada consulta sin datos (estado "pending" → esqueleto). Si la caché del navegador ya tiene esos datos
// cuando React hidrata ese componente (la precarga del libro en el shell, otra vista con la misma clave, o una API en el
// mismo origen que responde en milisegundos), el primer render del navegador pinta el contenido y no coincide con el HTML
// del servidor: React descarta el bloque entero y lo vuelve a pintar. Aquí, solo durante la hidratación de ese componente,
// se devuelve lo mismo que vio el servidor; en el render siguiente (inmediato) aparecen los datos de la caché.
// Después de hidratar (navegar dentro de la app, abrir ventanas) no cambia nada: es el useQuery de siempre.
import { skipToken, useQuery as useTanstackQuery, type QueryClient, type UseQueryResult } from "@tanstack/react-query"
import { useHydrated } from "@/hooks/use-hydrated"

type AnyOptions = { enabled?: unknown; queryFn?: unknown; initialData?: unknown }

/** Lo que calcula TanStack en el servidor para una consulta sin datos en caché (pendiente; "fetching" si está activa). */
export function serverLikeResult<T, E = Error>(result: UseQueryResult<T, E>, options: AnyOptions): UseQueryResult<T, E> {
  const active = options.queryFn !== skipToken && options.enabled !== false
  return {
    data: undefined,
    dataUpdatedAt: 0,
    error: null,
    errorUpdatedAt: 0,
    failureCount: 0,
    failureReason: null,
    errorUpdateCount: 0,
    isError: false,
    isFetched: false,
    isFetchedAfterMount: false,
    isFetching: active,
    isInitialLoading: active,
    isLoading: active,
    isLoadingError: false,
    isPaused: false,
    isPending: true,
    isPlaceholderData: false,
    isRefetchError: false,
    isRefetching: false,
    isStale: true,
    isSuccess: false,
    isEnabled: active,
    refetch: result.refetch,
    status: "pending",
    fetchStatus: active ? "fetching" : "idle",
    // `promise` (experimental_prefetchInRender) no está en el tipo de todas las variantes; se pasa tal cual.
    promise: (result as { promise?: unknown }).promise,
  } as unknown as UseQueryResult<T, E>
}

/** Mientras hidrata, ¿hay que esconder lo que trae la caché? Solo si el servidor no pudo tenerlo (sin initialData). */
export const hideUntilHydrated = (hydrated: boolean, status: string, options: AnyOptions) =>
  !hydrated && status !== "pending" && options.initialData === undefined

export const useQuery = ((options: AnyOptions, client?: QueryClient) => {
  const result = useTanstackQuery(options as Parameters<typeof useTanstackQuery>[0], client)
  const hydrated = useHydrated()
  return hideUntilHydrated(hydrated, result.status, options) ? serverLikeResult(result, options) : result
}) as typeof useTanstackQuery
