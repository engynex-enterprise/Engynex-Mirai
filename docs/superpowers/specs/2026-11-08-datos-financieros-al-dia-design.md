# Datos financieros al día en toda la plataforma — diseño

> Fecha: 2026-11-08 · Estado: aprobado por el dueño del producto · Siguiente paso: plan de implementación.

Las integraciones de **Datos financieros** (TRM, tasa de usura, festivos, cambio de monedas, cripto y
acciones) dejan de ser un trabajo nocturno invisible y pasan a ser la fuente viva de las cifras: si la
integración está activa, Mirai se asegura de que el dato **no esté vencido** en el momento en que se
necesita (registrar una compra en dólares, comparar un préstamo con la usura, ubicar un pago en el
calendario). Y cada integración —las 30, no solo las de datos— explica en la consola **qué es** y **para
qué sirve**.

## 1. El problema

Hoy el dato viaja así:

```
cron diario (/v1/jobs/notify/tick → refreshReferenceData)
    → ref_trm / ref_usury_rate / ref_holidays
    → book_settings.trm / book_settings.usura   (solo si trm_auto / usura_auto)
    → todos los cálculos (settings.trm)
```

Cuatro cosas no funcionan:

1. **Nadie refresca si el cron no corrió.** Un hogar recién creado arranca con el valor por defecto del
   esquema (`{"EUR": 4450, "USD": 4100}`, `usura 26`), y ahí se queda hasta la noche siguiente. Si la
   fuente estuvo caída esa noche, se queda otro día más.
2. **No hay forma de pedir el dato.** Ni la persona ni el administrador pueden decir «tráelo ahora»; no
   existe endpoint ni botón.
3. **Los festivos se bajan y no se usan.** `refreshReferenceData` llena `ref_holidays` y el registro
   promete «para correr las fechas de pago al siguiente día hábil», pero no existe ni una función que lo
   haga: no hay `siguienteHabil` en `packages/domain` ni consumidor de `GET /v1/refs/festivos`. La
   integración promete algo que la app no cumple.
4. **No se ve si la fuente sirve.** `ref_trm` no guarda cuándo se consultó ni si falló. La consola muestra
   el resultado de la última *prueba manual* (`platform_integrations.meta.lastMsg`), no el de la última
   consulta real.

Y en la pantalla: el registro ya tiene una descripción por integración (`IntegrationDef.d`), pero la
tarjeta de `/admin/integraciones` **no la pinta** — se ve el nombre, el estado y los planes, nada más.

## 2. Decisiones tomadas

| Pregunta | Decisión |
|---|---|
| ¿Qué tan "al día"? | **Bajo demanda con caché**: la API devuelve lo que tiene y, si venció y la integración está activa, consulta la fuente en ese momento, la guarda y la devuelve. |
| ¿Cómo llega la cifra fresca a los módulos? | **Refrescando la cifra guardada** (`book_settings`) e invalidando la caché. Los módulos siguen leyendo `settings.trm` / `settings.usura`: **una sola cifra en toda la app**, como exige `.agents/rules/cifras.md`. |
| ¿Festivos? | **Se usan para correr fechas**, detrás de un ajuste del libro apagado por defecto. |
| ¿Dónde se nota? | Formularios en moneda extranjera · préstamos y asesor · botón «actualizar precios» en Inversiones · Ajustes › Finanzas y la consola. |
| ¿Descripciones? | **Dos líneas**: el «qué es» que ya existe (`d`) más un campo nuevo `para` con lo que Mirai hace con ella. |

Enfoques descartados y por qué:

- **Cotizar en cada render** (cada formulario llama a `/v1/refs/trm`): rompe la regla de una sola cifra
  —dos pestañas abiertas mostrarían totales distintos— y quema los límites de las APIs gratis.
- **Solo poner el cron cada hora**: no arregla al hogar nuevo, ni la fuente caída, ni da forma de
  refrescar a mano.
- **Refrescar en el servidor de Next al cargar el shell** (dentro de `getAppContext()`): bloquea el primer
  render esperando a `datos.gov.co` y se pelea con `cacheComponents`.

## 3. Arquitectura

No cambia el camino del dato: se le agregan **vencimiento** y **un «tráelo ahora»** que comparten el cron y
la app.

```
                       ┌─ cron (cada hora)            ─┐
                       │                               │   asegurarTrm()
POST /v1/books/:b/refs/sync  (al abrir la app, 1×hora) ─┼─▶ asegurarUsura()   ──▶ ref_trm / ref_usury_rate
                       │                               │   asegurarFestivos()     ref_holidays
POST …/investments/refresh-prices  (botón)            ─┘                          ref_sources (bitácora)
                       │
                       └─▶ book_settings.trm / .usura  ──▶ TanStack invalida ──▶ todos los módulos recalculan
```

Tres piezas nuevas y una bitácora:

| Pieza | Dónde | Qué hace |
|---|---|---|
| `refs-live.ts` | `packages/services/src/integrations/` | Una función por fuente que asegura que el dato no esté vencido. La usan el cron y los endpoints. |
| `habiles.ts` | `packages/domain/src/` | Cálculo puro de días hábiles con los festivos de Colombia. |
| `<RefsSync />` | `apps/web/features/refs/` | Un solo punto en el shell que pide el sync y refresca la caché. |
| `ref_sources` | base | Bitácora por fuente: último intento, si funcionó y qué dijo. Sirve de freno y de pantalla. |

## 4. `refs-live.ts`: datos con vencimiento

`packages/services/src/integrations/refs-live.ts`. Una función por fuente, todas con la misma receta:

El tipo `EstadoFuente` se define **una sola vez, en los contratos** (`packages/contracts/src/modules/refs.ts`,
como zod), y `refs-live.ts` importa el tipo inferido. Es lo que viaja al navegador, así que ahí es donde va:

```ts
// packages/contracts/src/modules/refs.ts
export const EstadoFuente = z.object({
  kind: z.string(),
  /** La integración está activa en la consola y aplica al plan del hogar. */
  activa: z.boolean(),
  /** Cuándo se consultó la fuente por última vez (ref_sources.last_try). */
  ultima: z.string().nullable(),
  ok: z.boolean().nullable(),
  msg: z.string().nullable(),
  /** Se consultó en esta llamada (no estaba vencida → false). */
  consultada: z.boolean(),
})
```

```ts
// packages/services/src/integrations/refs-live.ts
export async function asegurarTrm(opts?: { plan?: string; forzar?: boolean }): Promise<EstadoFuente>
export async function asegurarUsura(opts?: { plan?: string; forzar?: boolean }): Promise<EstadoFuente>
export async function asegurarFestivos(opts?: { plan?: string; forzar?: boolean }): Promise<EstadoFuente>
```

La receta, en orden:

1. **¿Apagada?** `getGlobalIntegration(kind)?.modo === "apagada"`, o los planes de la fila global no
   incluyen el plan del hogar → `{ activa: false, consultada: false }` y no se consulta nada. Es la misma
   regla de `resolvePlatformOnly`, que ya existe y está probada.
2. **¿Venció?** Por fuente:
   - **TRM**: no hay fila con `hasta >= hoy`. (La columna `hasta` es nueva; ver §10. Las filas que ya están
     guardadas la tienen en `null`, y para esas se cae a `fecha < hoy`.)
   - **Usura**: la fila más reciente tiene `hasta < hoy`. Esa tabla ya guarda la vigencia.
   - **Festivos**: faltan filas del año actual o del siguiente.
   Si no venció → `{ activa: true, consultada: false }`, sin red.
3. **¿Alguien ya lo intentó?** Reclamo atómico sobre `ref_sources`, el mismo truco de `notify_claim`:

   ```sql
   update ref_sources set last_try = now()
    where kind = $1 and (last_try is null or last_try < now() - interval '15 minutes')
   returning kind
   ```

   Sin fila devuelta, otro proceso ya está en eso → se devuelve lo que hay. Esto es lo que evita que 500
   personas abriendo la app a las 7 a. m. tumben `datos.gov.co` (y que una fuente caída se consulte 500
   veces seguidas).
4. **Consulta y guarda.** Reusa `fetchTrm` / `fetchUsura` / `fetchFestivos` de `data-sources.ts` tal como
   están, hace el `upsert` en `ref_*` y escribe el resultado en `ref_sources` (`last_ok`, `ok`, `msg`,
   `detalle`). Cada fuente falla por separado: un error se registra y se devuelve, nunca se propaga.

Y una función que aplica el dato a un libro:

```ts
/** Copia TRM y usura a book_settings si el libro las tiene en automático y la fuente está activa. */
export async function aplicarRefsALibro(bookId: string, plan: string): Promise<{ cambiado: boolean }>
```

Es lo que hoy hace el bucle del cron, extraído para que sirva a un solo libro. El EUR sigue saliendo de
`fetchFx` como hoy: si `fx` está apagada, se deja el EUR que tenga el libro.

**El cron deja de tener lógica propia.** `refreshReferenceData` pasa a llamar `asegurarTrm/Usura/Festivos`
con `forzar: true` y luego `aplicarRefsALibro` por cada libro en automático. El comportamiento visible es el
mismo; lo que se gana es que cron y app no se puedan desalinear.

### Endpoints

Uno nuevo para el sync del libro y otro para el botón de inversiones. Los `GET /v1/refs/*` de hoy quedan
**intactos**: de solo lectura y con su `Cache-Control`.

```ts
// packages/contracts/src/modules/refs.ts
export const RefsSync = z.object({
  trm: z.object({ valor: z.number(), fecha: z.string(), hasta: z.string().nullable(), fuente: z.string().nullable() }).nullable(),
  usura: z.object({ tasa_ea: z.number(), desde: z.string(), hasta: z.string() }).nullable(),
  fuentes: z.record(z.string(), EstadoFuenteSchema),
  /** book_settings cambió: la web invalida la caché del libro. */
  cambiado: z.boolean(),
})

sync: { method: "POST", path: "/v1/books/:bookId/refs/sync", body: c.noBody(),
        responses: { ...COMMON_ERRORS, 200: RefsSync },
        summary: "Asegura TRM, usura y festivos al día y los copia al libro si están en automático" }
```

```ts
// packages/contracts/src/modules/assets.ts (donde ya viven las inversiones)
refreshPrices: { method: "POST", path: "/v1/books/:bookId/investments/refresh-prices", body: c.noBody(),
                 responses: { ...COMMON_ERRORS, 200: RefreshPrices },
                 summary: "Trae los precios de cripto y acciones ahora (CoinGecko, Alpha Vantage o Twelve Data)" }

export const RefreshPrices = z.object({
  actualizadas: z.number(), total: z.number(),
  nombres: z.array(z.string()),            // para el toast: «Bitcoin, Ethereum y 3 más»
  fuentes: z.record(z.string(), EstadoFuenteSchema),
})
```

`refs/sync` va en el módulo `insights/refs` de la API, que ya existe con su repositorio y sus dos
adaptadores; hay que agregarle el puerto de escritura (hoy solo lee). `refresh-prices` va en el módulo de
inversiones y reusa `fetchCryptoPrices` / `fetchStockPrice` y `getIntegration` tal como hace el cron, con el
mismo reclamo pero **por libro**: fila `kind = 'precios:<bookId>'` en `ref_sources` y ventana de 5 minutos.
Es una fila diminuta por libro y el SQL del reclamo no cambia; se descartó mirar `investments.updated_at`
porque esa marca también la mueve una edición a mano y daría un «ya están al día» falso.

**Permisos y quién escribe.** Los dos endpoints autorizan con `is_book_member` como cualquier otro, pero la
escritura de `ref_*`, `book_settings` e `investments.actual` la hace la API con el **rol de servicio**
(`rt().admin()`), igual que ya lo hace `refreshReferenceData`: es una actualización de la plataforma, no una
edición de la persona, y un `viewer` no podría escribir `book_settings` por RLS. Por eso `refs/sync` lo
puede llamar cualquier miembro —incluido `viewer`— y `refresh-prices` pide `editor`, porque ahí sí la
persona está pidiendo cambiar el valor de sus inversiones.

## 5. Una sola cifra: el sincronizador del shell

`apps/web/features/refs/refs-sync.tsx`, montado en `components/app/app-shell.tsx` al lado del
`<AutomationRunner />` que ya existe y con el mismo patrón:

```tsx
export function RefsSync() {
  const bookId = useBookId()
  useEffect(() => {
    try {
      const last = Number(sessionStorage.getItem(`mirai:refs-sync:${bookId}`) ?? 0)
      if (Date.now() - last < 3_600_000) return            // máximo una vez por hora por libro
      sessionStorage.setItem(`mirai:refs-sync:${bookId}`, String(Date.now()))
    } catch { /* sin almacenamiento: el cron lo hace */ }
    syncRefs(bookId)
      .then((r) => { if (r.cambiado) invalidateBook(qc, bookId, "book_settings") })
      .catch(() => {})                                     // sin red: se queda con lo guardado
  }, [bookId])
  return null
}
```

`invalidateBook` ya existe (`apps/web/hooks/use-book-data.ts`) y es justo lo que hace falta: refresca la
tabla, las partes del snapshot que la incluyen (`bookPartKey`) y las consultas derivadas que la leen
(`setup-progress`, `renta`…), agrupando todo en una sola pasada. No hay que armar claves a mano.

Con esto **toda la plataforma queda al día sin tocar ni un cálculo**: Balance, Dashboard, Inicio, Flujo de
caja, suscripciones, inversiones, renta y el chat ya leen `settings.trm` y `settings.usura`.

Y un hook para la procedencia, que es lo único que las pantallas necesitan además de la cifra:

```ts
// apps/web/features/refs/use-refs.ts
export function useRefs()   // { trm, usura, fuentes } desde el resultado del sync (staleTime: 1 h)
```

Reglas de la casa que hay que respetar aquí: `useQuery` sale de `@/lib/query`, no de `@tanstack/react-query`
(error React #418), y el componente es de cliente, sin lecturas de cookies.

**Sin conexión:** `syncRefs` **no** se encola en el outbox (`lib/offline/outbox.ts`). Es un refresco, no una
escritura de la persona: si no hay red, se usa lo guardado y ya. Igual que los comandos RPC, que tampoco se
encolan.

## 6. Moneda extranjera en los formularios

Componente nuevo `apps/web/components/mirai/conversion-moneda.tsx`:

```tsx
<ConversionMoneda currency="USD" valor={100} />
// → «US$ 100 × $ 4.120 = $ 412.000 · TRM oficial del 8 nov»            (fuente activa y al día)
// → «US$ 100 × $ 4.100 = $ 410.000 · la tasa que tienes en Ajustes»    (trm_auto apagado)
// → «Escribe la tasa a mano en Ajustes › Finanzas: el administrador apagó la TRM automática»
```

Lo usan los formularios que ya tienen selector de moneda: gasto, fijo, ingreso, suscripción, cuenta e
inversión. **No cambia ningún cálculo** —todos siguen usando `conv(valor, currency, settings.trm)`—, solo le
muestra a la persona de dónde salió el número y le deja ajustarlo.

## 7. Usura viva

`loan-form.tsx` (líneas 136 y 320) y `decision-card.tsx` (línea 67) caen hoy a `?? 26` cuando no hay valor.
Con el sync, `book_settings.usura` llega fresca:

- `TasaUsura` muestra la vigencia: «Por debajo de la usura (25,17 % E.A., vigente desde el 1 nov)».
- El `?? 26` se conserva **solo** como último recurso cuando no hay dato oficial ninguno, y en ese caso el
  texto dice «la tasa que tienes configurada», no «la tasa de usura» — no se afirma que es oficial cuando
  no lo es. Es la misma disciplina de «sin datos no se afirma» de las reglas de cifras.
- `agreement-pdf.tsx` ya recibe `usura` como parámetro; solo cambia de dónde sale.

## 8. Festivos y día hábil

### El cálculo (puro)

`packages/domain/src/habiles.ts`:

```ts
/** ¿Es día hábil? Sábado, domingo y festivo de Colombia no lo son. */
export function esHabil(fecha: string, festivos: ReadonlySet<string> | readonly string[]): boolean

export function siguienteHabil(fecha: string, festivos: …): string
export function anteriorHabil(fecha: string, festivos: …): string

/** Corre una fecha al día hábil que corresponde según hacia dónde se mueve el dinero. */
export function correHabil(fecha: string, festivos: …, dir: "pago" | "cobro"): string
```

`dir` existe porque en Colombia los dos lados se mueven en sentidos contrarios y confundirlos pone mal la
agenda:

- **`"pago"`** (fijos, suscripciones, cuotas, tarjetas) → **siguiente** día hábil. Un pago que cae el 20 de
  julio se hace el 21.
- **`"cobro"`** (nómina y demás ingresos) → día hábil **anterior**. A nadie le consignan el lunes festivo:
  le pagan el viernes.

Es una línea de diferencia y hace que el calendario diga la verdad.

### De dónde salen los festivos

**No van en el snapshot del libro.** `BOOK_PARTS` es, por contrato, «una parte = una tabla del libro», y
`ref_holidays` es global. La web los pide por el `GET /v1/refs/festivos` que ya existe (con su caché HTTP de
una hora) y se los pasa al dominio **como parámetro**, exactamente como ya se le pasa `trm`:

```ts
// apps/web/features/refs/use-refs.ts
export function useFestivos(): ReadonlySet<string>   // staleTime: 12 h; vacío mientras carga
```

`packages/domain` no puede importar nada de la web; los festivos entran por parámetro o no entran.

### Dónde se usa, y el interruptor

Ajuste nuevo del libro `book_settings.habiles` (boolean, **`false` por defecto**). Migración aditiva y
detrás de interruptor, como manda `CLAUDE.md`: a nadie le cambian las fechas de un día para otro.

Encendido, `correHabil` se aplica en:

- `apps/web/features/agenda/events.ts` — el calendario y la lista de próximos.
- `providerNextPayments` (`packages/domain/src/proveedor-pagos.ts`) — «próximos pagos» de un negocio.
- `packages/services/src/notify/*` — los recordatorios salen el día en que de verdad se paga. Ahí no hay
  hook: los avisos corren en la API, que lee `ref_holidays` de la base y le pasa las fechas a `correHabil`
  igual que la web le pasa las del hook.

Interruptor en Ajustes › Finanzas (`features/settings/tabs/finance.tsx`), junto a los de TRM y usura:
**«Correr los pagos que caen en fin de semana o festivo»**, con la ayuda «Un pago que cae sábado, domingo o
festivo se muestra el siguiente día hábil; la nómina, el día hábil anterior».

Las cifras **no cambian**: `correHabil` mueve en qué día se muestra un pago, no cuánto es ni a qué mes
pertenece. Los totales del mes siguen saliendo de `pagosMes(x)` y `flujoIntegral`, intactos.

## 9. Descripciones: qué es + para qué sirve

```ts
// packages/services/src/integrations/registry.ts
export type IntegrationDef = {
  …
  /** Qué es y cuánto cuesta (ya existía). */
  d: string
  /** Qué hace Mirai con ella, en concreto, y qué se pierde si se apaga. Obligatorio. */
  para: string
}
```

`para` es **obligatorio a propósito**: así el compilador obliga a escribir las 30 y no quedan integraciones
sin explicar. En español de Colombia, con tuteo, y sin prometer nada que la app no haga —la de festivos es
justamente el ejemplo de lo que no se debe repetir.

Se pintan dos líneas en la tarjeta de `/admin/integraciones`
(`features/admin/console-plataforma.tsx`, el `<Card>` de la línea 300) y en Ajustes › Integraciones
(`features/settings/tabs/integrations.tsx`):

```
┌─────────────────────────────────────────────────────────────┐
│ [SFC]  TRM del día   ● Activa                               │
│        Solo planes: premium, gratis                         │
│        Tasa de cambio oficial de la Superfinanciera, por    │
│        datos.gov.co. Sin clave.                             │
│        Para qué sirve: convierte a pesos tus cuentas,        │
│        gastos, fijos y suscripciones en dólares, y calcula   │
│        cuánto valen hoy tus inversiones en el exterior. Si   │
│        la apagas, cada quien escribe la tasa a mano en       │
│        Ajustes › Finanzas.                                   │
│        ✓ Última consulta hace 2 h · $ 4.120 del 8 nov        │
│        [Configurar] [Probar]                                 │
└─────────────────────────────────────────────────────────────┘
```

El texto de `para` también entra al buscador de las dos pantallas (`useListControls` en la consola y
`SEARCH` en Ajustes), para poder buscar «dólares» y que salga la TRM. El buscador global del CLI
(`packages/cli/src/datos/buscador.ts`) **no** indexa integraciones hoy, así que ahí no hay nada que hacer.

## 10. Base de datos — `db/postgres/0010_datos_al_dia.sql`

Aditiva, idempotente, sin cambiar el comportamiento de lo publicado:

```sql
-- 1. La vigencia de la TRM, que datos.gov.co da y hoy botamos.
alter table public.ref_trm add column if not exists hasta date;

-- 2. Bitácora por fuente: freno de 15 minutos y pantalla de la consola.
--    kind = 'trm' | 'usura' | 'festivos' | 'fx' | 'precios:<book_id>' (el botón de Inversiones, por libro).
create table if not exists public.ref_sources (
  kind      text primary key,
  last_try  timestamptz,
  last_ok   timestamptz,
  ok        boolean,
  msg       text,
  detalle   jsonb not null default '{}'::jsonb
);
alter table public.ref_sources enable row level security;
-- Es operativa, no es dato público como ref_trm: solo la consola. Misma función que las demás tablas de
-- la plataforma (ads, broadcasts, platform_integrations…).
create policy "admin fuentes de datos" on public.ref_sources to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- 3. Correr las fechas al día hábil (apagado por defecto).
alter table public.book_settings add column if not exists habiles boolean not null default false;
```

Después: `pnpm db:migrate` → `pnpm db:types` → `pnpm typecheck`. `ref_sources` no es tabla del libro
(no tiene `book_id` ni `deleted_at`), así que no entra a `BOOK_TABLE_POLICY` ni a `LIVE_TABLES`.

## 11. Pruebas

| Qué | Dónde | Casos |
|---|---|---|
| Días hábiles | `packages/domain/src/habiles.test.ts` | Sábado y domingo · 20 de julio · puente de Reyes (lunes festivo) · `"pago"` adelanta y `"cobro"` atrasa · sin festivos cargados no mueve nada · 31 de diciembre que salta de año |
| Vencimiento y freno | `packages/services/src/integrations/refs-live.test.ts` | Fuente apagada no se consulta · dato vigente no se vuelve a pedir · reclamo de 15 min bloquea la segunda llamada · fuente caída se registra y no tumba a las demás · plan fuera de la lista no consulta · `forzar` sí consulta |
| Registro completo | `packages/services/src/integrations/registry.test.ts` | Las 30 tienen `para` no vacío · largo razonable · sin inglés suelto · las de `cat: "datos"` nombran dónde se ve el efecto |
| Endpoint | `apps/api/test/v7g/refs-sync.int.test.ts` | `trm_auto` copia a `book_settings` · apagado no copia · `viewer` puede llamar · plan sin la integración no copia · `refresh-prices` pide `editor` |
| Pantallas | `apps/web/tests/e2e/f15-datos-al-dia.spec.ts` | La consola muestra las dos líneas y la última consulta · un gasto en dólares muestra la conversión con su fecha · Ajustes › Finanzas muestra la frescura y el interruptor nuevo · Inversiones actualiza precios. Escritorio 1366 px y móvil 400 px, capturas en `tests/.out/` |

Más la regresión de siempre: `pnpm test` y `pnpm e2e:local` completos antes de cerrar. Los cálculos del
dominio no se tocan, así que las pruebas de paridad con la v4 deben seguir pasando **sin un solo cambio** —
si alguna se mueve, es que algo se rompió.

## 12. Orden de implementación

Tres tandas, cada una verificable y desplegable sola:

1. **Descripciones y frescura en la consola.** Campo `para` en las 30, las dos líneas en la consola y en
   Ajustes › Integraciones, `ref_sources` con su migración y la bitácora escrita por el cron. Lo más
   visible, con cero riesgo en las cifras.
2. **TRM y usura al día.** `refs-live.ts`, `POST /v1/books/:b/refs/sync`, `<RefsSync />`,
   `<ConversionMoneda>` en los seis formularios, la usura con vigencia en préstamos y asesor, y el botón de
   Inversiones.
3. **Festivos y día hábil.** `habiles.ts` con sus pruebas, `useFestivos`, el ajuste `habiles` y su uso en
   agenda, próximos pagos y avisos.

## 13. Lo que este cambio NO hace

- No cotiza en cada render ni en cada cálculo.
- No agrega proveedores nuevos de datos: las seis fuentes son las que ya están en el registro.
- No guarda históricos de TRM para gráficas (`ref_trm` ya acumula una fila por día; nadie la consulta y así
  se queda).
- No toca ningún cálculo del dominio. Cambia **de dónde sale** el número que ya reciben, no el número.
- No muestra montos de hogares en la consola: `ref_sources` guarda la TRM y la usura, que son públicas,
  nunca datos de nadie.
