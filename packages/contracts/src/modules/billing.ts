// Módulo `billing` (docs/arquitectura/v6-separacion-front-back.md §2.6). Dueño: F2-I.
// Endpoints: Planes, suscripción del hogar, cupones, checkout y webhooks de Mercado Pago y Wompi.
// Aquí van sus DTO zod (Checkout, CouponPreview) y su contrato. Stub vacío de F2-A: solo lo llena su dueño.
export const meta = { id: "billing", owner: "F2-I" } as const
