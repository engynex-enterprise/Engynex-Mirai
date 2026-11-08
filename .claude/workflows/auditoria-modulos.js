export const meta = {
  name: 'auditoria-modulos',
  description: 'Audita montos, cálculos, proyecciones y mensajes de varios módulos de Mirai en paralelo, verifica cada hallazgo y entrega una lista priorizada',
  whenToUse: 'Antes de una versión, o cuando una persona dice que las cuentas no cuadran. args: lista de módulos (por defecto Inicio, Dashboard, Balance, Ingresos, Gastos, Me deben, Le debo) o {modulos, foco}',
  phases: [
    { title: 'Auditar', detail: 'un auditor-cifras por módulo' },
    { title: 'Verificar', detail: 'un escéptico por módulo intenta refutar cada hallazgo' },
    { title: 'Coherencia', detail: 'la misma cifra entre pantallas' },
    { title: 'Informe', detail: 'lista priorizada en español' },
  ],
}

// Uso: Workflow({ name: 'auditoria-modulos' })
//      Workflow({ name: 'auditoria-modulos', args: ['gastos', 'fijos'] })
//      Workflow({ name: 'auditoria-modulos', args: { modulos: ['balance'], foco: 'abonos de gastos fijos' } })
const MODULOS = {
  inicio: 'Inicio (apps/web/features/home)',
  dashboard: 'Dashboard (apps/web/features/dashboard, packages/domain/src/dashboard.ts)',
  balance: 'Balance (apps/web/features/balance, packages/domain/src/balance.ts y flujo-integral.ts)',
  ingresos: 'Ingresos (apps/web/features/incomes, reparto.ts, nómina y descuentos)',
  gastos: 'Gastos y hormiga (apps/web/features/expenses, totals.ts, hormiga.ts)',
  fijos: 'Gastos fijos y abonos (apps/web/features/fixed, fixed.ts, pagoPeriodo)',
  'me-deben': 'Me deben: préstamos que hiciste (apps/web/features/loans, loans.ts)',
  'le-debo': 'Le debo: deudas y préstamos que te dieron (apps/web/features/loans, loans.ts)',
  tarjetas: 'Tarjetas de crédito (apps/web/features/cards, cards.ts)',
  suscripciones: 'Suscripciones (apps/web/features/subscriptions)',
  metas: 'Metas y fondo de emergencia (fondoEstado, aportes)',
  compartidos: 'Gastos compartidos (apps/web/features/extras/compartidos-view.tsx)',
}
const POR_DEFECTO = ['inicio', 'dashboard', 'balance', 'ingresos', 'gastos', 'me-deben', 'le-debo']

const lista = Array.isArray(args) ? args : (args && args.modulos) || POR_DEFECTO
const foco = (args && !Array.isArray(args) && args.foco) || ''
const modulos = lista.map((m) => ({ id: m, desc: MODULOS[m] || m }))
const desconocidos = lista.filter((m) => !MODULOS[m])
if (desconocidos.length) log(`Módulos sin descripción conocida (se auditan por su nombre): ${desconocidos.join(', ')}`)

const HALLAZGOS = {
  type: 'object',
  properties: {
    hallazgos: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          titulo: { type: 'string' },
          severidad: { type: 'string', enum: ['grave', 'medio', 'menor'] },
          que_ve: { type: 'string', description: 'pantalla y texto que ve la persona' },
          escenario: { type: 'string', description: 'ejemplo concreto en pesos: registros, valor mostrado y valor correcto' },
          donde: { type: 'array', items: { type: 'string' }, description: 'archivo:línea de la vista y del dominio' },
          arreglo: { type: 'string' },
          confianza: { type: 'string', enum: ['confirmado', 'probable'] },
        },
        required: ['titulo', 'severidad', 'que_ve', 'escenario', 'donde', 'arreglo', 'confianza'],
      },
    },
    cifras: {
      type: 'array',
      description: 'cada cifra que muestra el módulo y la función del dominio de donde sale',
      items: { type: 'object', properties: { concepto: { type: 'string' }, funcion: { type: 'string' }, donde: { type: 'string' } }, required: ['concepto', 'funcion', 'donde'] },
    },
    bien: { type: 'string', description: 'lo revisado que está bien, breve' },
  },
  required: ['hallazgos', 'cifras', 'bien'],
}
const VEREDICTOS = {
  type: 'object',
  properties: {
    veredictos: {
      type: 'array',
      items: {
        type: 'object',
        properties: { titulo: { type: 'string' }, real: { type: 'boolean' }, razon: { type: 'string' }, severidad: { type: 'string', enum: ['grave', 'medio', 'menor'] } },
        required: ['titulo', 'real', 'razon', 'severidad'],
      },
    },
  },
  required: ['veredictos'],
}

const auditados = await pipeline(
  modulos,
  (m) => agent(
    `Audita las cifras del módulo ${m.desc} de Mirai siguiendo tus instrucciones y .agents/rules/cifras.md.` +
      (foco ? ` Pon atención especial a: ${foco}.` : '') +
      ' Devuelve los hallazgos (solo los que puedas sostener con el código y un escenario en pesos) y la lista de cifras que muestra el módulo con su función del dominio.',
    { label: `auditar:${m.id}`, phase: 'Auditar', agentType: 'auditor-cifras', schema: HALLAZGOS },
  ),
  async (r, m) => {
    if (!r || !r.hallazgos.length) return { modulo: m.id, confirmados: [], descartados: [], cifras: r ? r.cifras : [], bien: r ? r.bien : 'sin respuesta del auditor' }
    const v = await agent(
      `Eres un revisor escéptico de cálculos de Mirai (finanzas personales, Colombia). Un auditor reporta estos hallazgos del módulo ${m.desc}. ` +
        'Para CADA uno, intenta refutarlo leyendo el código real (vista y packages/domain) y .agents/rules/cifras.md: ¿el escenario en pesos de verdad produce esa cifra? ' +
        '¿ya lo corrige otra función o una regla intencional? Si puedes, compruébalo con una prueba rápida del dominio (sin dejar archivos en el repo). ' +
        'Marca real=false si no se sostiene o si dudas. Ajusta la severidad si exagera.\n\n' + JSON.stringify(r.hallazgos, null, 2),
      { label: `verificar:${m.id}`, phase: 'Verificar', schema: VEREDICTOS },
    )
    const vs = (v && v.veredictos) || []
    const real = (h) => { const x = vs.find((y) => y.titulo === h.titulo); return x ? (x.real ? { ...h, severidad: x.severidad, verificacion: x.razon } : null) : null }
    const confirmados = r.hallazgos.map(real).filter(Boolean)
    const descartados = r.hallazgos.filter((h) => !confirmados.some((c) => c.titulo === h.titulo)).map((h) => {
      const x = vs.find((y) => y.titulo === h.titulo)
      return { titulo: h.titulo, razon: x ? x.razon : 'el verificador no lo evaluó' }
    })
    log(`${m.id}: ${confirmados.length} confirmados, ${descartados.length} descartados`)
    return { modulo: m.id, confirmados, descartados, cifras: r.cifras, bien: r.bien }
  },
)

const resultados = auditados.filter(Boolean)
const fallidos = modulos.filter((m) => !resultados.some((r) => r.modulo === m.id)).map((m) => m.id)
if (fallidos.length) log(`Sin resultado (revisar a mano): ${fallidos.join(', ')}`)

// Barrera a propósito: la coherencia entre pantallas necesita las cifras de TODOS los módulos.
let coherencia = []
if (resultados.length > 1) {
  phase('Coherencia')
  const c = await agent(
    'Estas son las cifras que muestra cada módulo de Mirai y la función del dominio de donde sale cada una. Busca conceptos iguales o equivalentes ' +
      '("te sobra", "te entra", "cuotas del mes", "lo que debes", "gasto hormiga", "meses que aguantas", "te debe hoy"…) que en dos pantallas salgan de funciones distintas ' +
      'o con parámetros distintos y por eso puedan mostrar valores diferentes. Verifícalo en el código y da un escenario en pesos. Solo lo que puedas sostener.\n\n' +
      JSON.stringify(resultados.map((r) => ({ modulo: r.modulo, cifras: r.cifras })), null, 2),
    { label: 'coherencia', phase: 'Coherencia', schema: HALLAZGOS },
  )
  coherencia = (c && c.hallazgos) || []
}

phase('Informe')
const informe = await agent(
  'Escribe en español de Colombia (tuteo, sin jerga) el informe de una auditoría de cifras de Mirai para el dueño del producto. ' +
    'Ordena por severidad (Grave → Medio → Menor) los hallazgos confirmados de todos los módulos y los de coherencia entre pantallas; agrupa duplicados. ' +
    'Cada uno: qué ve la persona, ejemplo en pesos, dónde (archivo:línea), arreglo propuesto y prueba Vitest sugerida. ' +
    'Luego una sección corta de descartados (con su razón) y lo que está bien por módulo. ' +
    (fallidos.length ? `Di que estos módulos no se pudieron auditar: ${fallidos.join(', ')}. ` : '') +
    'No inventes nada que no esté en los datos.\n\n' + JSON.stringify({ resultados, coherencia }, null, 2),
  { label: 'informe', phase: 'Informe' },
)

return { informe, resultados, coherencia, fallidos }
