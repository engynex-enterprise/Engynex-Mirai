// Escrituras de Planeación. Presupuesto: PATCH /v1/books/:b/categories/:id/tope. Familia: el cupo va con patchMember
// de features/catalogs/hooks.ts.

/** Tope mensual de una categoría (0 = sin tope). Lanza Error con el mensaje para la persona. */
export async function saveTope(bookId: string, id: string, tope: number): Promise<void> {
  const { browserApi, unwrapData } = await import("@/lib/api/client")
  unwrapData(await browserApi().budget.tope({ params: { bookId, id }, body: { tope } }))
}
