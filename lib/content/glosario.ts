// Glosario financiero de Colombia en palabras simples (Centro de ayuda › Glosario).
// Regla: nada de cifras que cambian cada año (UVT, salario mínimo, topes). Cuando un término depende de un valor
// anual se marca con `ref: true` y se explica sin el número: Mirai usa el valor oficial del año (tablas ref_*).

export type GlosarioCat = "basicos" | "nomina" | "impuestos" | "credito" | "ahorro"
export type Termino = {
  id: string
  t: string
  /** Sigla o nombre largo. */
  sigla?: string
  cat: GlosarioCat
  /** Explicación corta y simple. */
  d: string
  ej?: string
  /** El valor cambia cada año o por norma: muéstralo como referencia. */
  ref?: boolean
  ir?: { href: string; label: string }
  ver?: string[]
}

export const GLOSARIO_CATS: Record<GlosarioCat, { label: string; icon: string }> = {
  basicos: { label: "Lo básico", icon: "sprout" },
  nomina: { label: "Trabajo y nómina", icon: "briefcase" },
  impuestos: { label: "Impuestos y DIAN", icon: "landmark" },
  credito: { label: "Créditos y tarjetas", icon: "credit-card" },
  ahorro: { label: "Ahorro e inversión", icon: "piggy-bank" },
}

export const GLOSARIO: Termino[] = [
  // Lo básico
  { id: "patrimonio", t: "Patrimonio", cat: "basicos", d: "Lo que tienes (cuentas, efectivo, casa, carro, inversiones) menos lo que debes. Si es positivo, tienes más de lo que debes.", ej: "Tienes $10 millones entre cuenta y moto, y debes $4 millones: tu patrimonio es de $6 millones.", ir: { href: "/balance", label: "Ver tu balance" }, ver: ["activo-pasivo"] },
  { id: "activo-pasivo", t: "Activos y pasivos", cat: "basicos", d: "Los activos son lo que tienes y vale plata; los pasivos son lo que debes. En Mirai los ves frente a frente en la Cuenta T de Balance.", ir: { href: "/balance", label: "Abrir Balance" } },
  { id: "flujo-caja", t: "Flujo de caja", cat: "basicos", d: "Cuánta plata entra y cuánta sale en un periodo, y en qué fechas. Sirve para saber si te va a alcanzar antes de que llegue el próximo pago.", ir: { href: "/flujo", label: "Ver tu flujo de caja" } },
  { id: "quincena", t: "Quincena", cat: "basicos", d: "Cada mitad del mes. En Colombia muchas empresas pagan dos veces al mes (alrededor del 15 y del 30). Mirai divide el mes en dos quincenas para que veas qué pagos caen en cada una y cuánto te queda.", ir: { href: "/balance", label: "Ver tus quincenas" } },
  { id: "presupuesto-503020", t: "Presupuesto 50/30/20", cat: "basicos", d: "Una forma sencilla de repartir lo que te entra: 50 % para lo necesario, 30 % para gustos y 20 % para ahorrar o pagar deudas. Es un punto de partida, no una regla rígida.", ir: { href: "/presupuesto", label: "Armar tu presupuesto" } },
  { id: "fondo-emergencia", t: "Fondo de emergencia", cat: "basicos", d: "Plata guardada solo para imprevistos: una enfermedad, quedarte sin trabajo o un daño en la casa. Lo ideal es tener entre 3 y 6 meses de tus gastos necesarios.", ir: { href: "/metas", label: "Crear tu fondo" } },
  { id: "gasto-hormiga", t: "Gasto hormiga", cat: "basicos", d: "Gastos pequeños y frecuentes (el tinto, el domicilio, el paquete del semáforo) que solos no pesan, pero juntos se llevan una buena parte del mes.", ej: "$8.000 al día son unos $240.000 al mes.", ir: { href: "/gastos", label: "Ver tus gastos hormiga" } },
  { id: "gasto-fijo", t: "Gasto fijo y gasto variable", cat: "basicos", d: "El fijo se repite casi igual cada mes (arriendo, servicios, internet, cuotas). El variable cambia (mercado, salidas, transporte). En Mirai los fijos se registran una vez y se repiten solos.", ir: { href: "/fijos", label: "Ver tus gastos fijos" } },
  { id: "inflacion", t: "Inflación e IPC", sigla: "Índice de Precios al Consumidor", cat: "basicos", d: "La inflación es cuánto suben los precios en general. El DANE la mide cada mes con el IPC. Si tu plata está quieta, cada año compra menos.", ir: { href: "/calculadoras", label: "Calcular el efecto de la inflación" } },
  { id: "trm", t: "TRM", sigla: "Tasa Representativa del Mercado", cat: "basicos", d: "El precio oficial del dólar en pesos para cada día. La certifica la Superintendencia Financiera. Mirai la actualiza sola para convertir ingresos o gastos en dólares." },

  // Trabajo y nómina
  { id: "smmlv", t: "Salario mínimo", sigla: "SMMLV · salario mínimo mensual legal vigente", cat: "nomina", ref: true, d: "El menor salario que se le puede pagar a un trabajador de tiempo completo. Lo fija el Gobierno cada año. Muchas reglas se miden en salarios mínimos: el auxilio de transporte, el fondo de solidaridad pensional y el salario integral." },
  { id: "auxilio-transporte", t: "Auxilio de transporte", cat: "nomina", ref: true, d: "Un pago adicional para quienes ganan hasta dos salarios mínimos, para ayudar con el transporte. No se le descuenta salud ni pensión, pero sí cuenta al liquidar la prima y las cesantías." },
  { id: "salud-pension", t: "Aportes a salud y pensión", cat: "nomina", d: "Si eres empleado, de tu salario te descuentan 4 % para salud y 4 % para pensión. Tu empleador paga otra parte por su cuenta. Si eres independiente, los pagas tú completos.", ir: { href: "/ingresos", label: "Registrar tu salario con descuentos" }, ver: ["ibc", "pila"] },
  { id: "ibc", t: "IBC", sigla: "Ingreso base de cotización", cat: "nomina", d: "El valor sobre el que se calculan los aportes a salud, pensión y ARL. Para un empleado normalmente es su salario; para un independiente es el 40 % de lo que recibe en el mes. Nunca puede ser menor a un salario mínimo." },
  { id: "fsp", t: "Fondo de solidaridad pensional", sigla: "FSP", cat: "nomina", d: "Un aporte adicional a pensión que pagan quienes ganan 4 salarios mínimos o más. Empieza en 1 % y sube por tramos para los salarios más altos. Con esa plata se subsidia la pensión de personas con menos ingresos.", ir: { href: "/ajustes?tab=finanzas", label: "Ver la tabla en Ajustes › Finanzas" } },
  { id: "arl", t: "ARL", sigla: "Administradora de Riesgos Laborales", cat: "nomina", d: "El seguro que cubre accidentes y enfermedades causados por el trabajo. Si eres empleado la paga tu empleador; si eres independiente con contrato, normalmente la pagas tú según el riesgo de tu actividad." },
  { id: "eps", t: "EPS", sigla: "Entidad Promotora de Salud", cat: "nomina", d: "La entidad que organiza tu atención en salud (citas, medicamentos, urgencias). A ella van tus aportes de salud." },
  { id: "fondo-pension", t: "Fondo de pensiones", cat: "nomina", d: "Donde se guardan tus aportes para la vejez: Colpensiones (público) o un fondo privado (como Porvenir, Protección, Colfondos o Skandia). Revisa cuál es el tuyo en tu desprendible." },
  { id: "caja-compensacion", t: "Caja de compensación", cat: "nomina", d: "Entidad a la que tu empleador aporta el 4 % de tu salario. Te da subsidio familiar, descuentos en recreación, educación y créditos, y ayudas para vivienda." },
  { id: "pila", t: "PILA", sigla: "Planilla Integrada de Liquidación de Aportes", cat: "nomina", d: "El formulario con el que se pagan juntos salud, pensión, ARL y caja de compensación. Las empresas la pagan por sus trabajadores; los independientes la pagan ellos mismos en un operador autorizado. Los valores se redondean como lo hace Mirai al calcular tus descuentos." },
  { id: "desprendible", t: "Desprendible de nómina", cat: "nomina", d: "El documento que te da tu empresa en cada pago con lo que ganaste y lo que te descontaron (salud, pensión, fondo de solidaridad, retención, préstamos). Úsalo para registrar tu salario en Mirai igual a como te llega.", ir: { href: "/ingresos", label: "Agregar tu salario" } },
  { id: "prima", t: "Prima de servicios", cat: "nomina", d: "Un mes de salario al año que la empresa te paga en dos partes: la mitad a más tardar el 30 de junio y la otra mitad en los primeros 20 días de diciembre. Si trabajaste menos tiempo, te pagan la parte proporcional.", ir: { href: "/primas", label: "Planear tu prima" } },
  { id: "cesantias", t: "Cesantías", cat: "nomina", d: "Un mes de salario por cada año trabajado (o la parte proporcional). La empresa las consigna en tu fondo de cesantías a más tardar el 14 de febrero del año siguiente. Sirven para cuando te quedas sin trabajo, y también para vivienda o estudio.", ir: { href: "/primas", label: "Planear tus cesantías" }, ver: ["intereses-cesantias"] },
  { id: "intereses-cesantias", t: "Intereses sobre las cesantías", cat: "nomina", d: "El 12 % al año sobre tus cesantías. A diferencia de las cesantías, te los paga directamente la empresa, a más tardar el 31 de enero." },
  { id: "vacaciones", t: "Vacaciones", cat: "nomina", d: "15 días hábiles de descanso pagado por cada año trabajado. Se pueden acumular, pero lo ideal es tomarlas." },
  { id: "salario-integral", t: "Salario integral", cat: "nomina", ref: true, d: "Un salario alto que ya incluye las prestaciones (prima, cesantías y sus intereses) en el pago de cada mes. Debe ser de al menos 10 salarios mínimos más un 30 % adicional. Los aportes se calculan sobre el 70 % del salario." },
  { id: "libranza", t: "Libranza", cat: "nomina", d: "Un crédito que se paga descontándolo directamente de tu nómina o tu pensión. Suele tener una tasa más baja, pero reduce lo que te llega en cada pago.", ir: { href: "/le-debo", label: "Registrar un crédito" } },

  // Impuestos y DIAN
  { id: "uvt", t: "UVT", sigla: "Unidad de Valor Tributario", cat: "impuestos", ref: true, d: "Una medida que usa la DIAN en lugar de pesos para fijar topes, tablas y sanciones. Cada año publica cuánto vale una UVT en pesos, así los topes suben con la inflación sin cambiar la ley. Para pasar un tope a pesos, multiplica las UVT por el valor del año.", ir: { href: "/renta", label: "Ver la UVT del año en Renta" } },
  { id: "rut", t: "RUT y NIT", sigla: "Registro Único Tributario", cat: "impuestos", d: "El RUT es tu inscripción ante la DIAN. Para una persona, el NIT es su número de cédula más un dígito de verificación. Los dos últimos dígitos de tu NIT definen la fecha en que te toca declarar.", ir: { href: "/calendario", label: "Ver tu fecha" } },
  { id: "declaracion-renta", t: "Declaración de renta", cat: "impuestos", ref: true, d: "El formulario anual en el que le cuentas a la DIAN cuánto ganaste, cuánto tienes y cuánto debes. La presentas si el año anterior pasaste alguno de los topes (ingresos, patrimonio, compras, consumos con tarjeta o consignaciones). Declarar no siempre significa pagar.", ir: { href: "/renta", label: "Revisar si debes declarar" } },
  { id: "retencion", t: "Retención en la fuente", cat: "impuestos", d: "Un cobro anticipado del impuesto de renta: quien te paga (tu empresa, un cliente, el banco) descuenta una parte y se la entrega a la DIAN a tu nombre. Al declarar, lo retenido se resta de lo que debes; si te retuvieron de más, te queda saldo a favor.", ver: ["procedimiento"] },
  { id: "procedimiento", t: "Procedimiento 1 y procedimiento 2", cat: "impuestos", d: "Las dos formas que permite la ley para calcular la retención de un empleado. Con el procedimiento 1 se calcula cada mes con lo que ganaste ese mes y una tabla de la DIAN. Con el procedimiento 2 la empresa calcula un porcentaje fijo cada seis meses (en junio y diciembre) con el promedio de los últimos 12 meses. Tu empresa escoge uno: míralo en tu desprendible.", ir: { href: "/ajustes?tab=finanzas", label: "Elegir tu procedimiento" } },
  { id: "renta-exenta-25", t: "Renta exenta del 25 %", cat: "impuestos", ref: true, d: "Una parte de lo que ganas trabajando no paga impuesto: el 25 % de tus ingresos laborales, después de restar aportes y deducciones, con un límite al año fijado en UVT. Mirai lo tiene en cuenta en el estimado de renta." },
  { id: "dependientes", t: "Dependientes", cat: "impuestos", d: "Personas que dependen económicamente de ti, como hijos menores de 18 años, de 18 a 25 si estudian (y tú les pagas el estudio), o con discapacidad. Pueden reducir tu retención y tu impuesto de renta.", ir: { href: "/renta", label: "Marcar tus dependientes" } },
  { id: "saldo-favor", t: "Saldo a favor", cat: "impuestos", d: "Cuando al declarar te habían retenido más de lo que debías pagar. Puedes pedir que te lo devuelvan o usarlo para pagar la renta del año siguiente." },
  { id: "gmf", t: "4×1000", sigla: "GMF · Gravamen a los Movimientos Financieros", cat: "impuestos", ref: true, d: "Por cada $1.000 que retiras o transfieres, el banco descuenta $4 para el Estado. Puedes marcar una sola cuenta de ahorros como exenta, hasta un monto al mes fijado en UVT (350 UVT).", ej: "Retirar $1.000.000 de una cuenta no exenta cuesta $4.000.", ir: { href: "/calculadoras", label: "Calcular el 4×1000" } },
  { id: "predial-vehicular", t: "Predial e impuesto vehicular", cat: "impuestos", d: "El predial lo cobra el municipio por tu casa, apartamento o lote; el vehicular lo cobra el departamento por tu carro o moto. Se pagan una vez al año y muchas veces tienen descuento por pronto pago.", ir: { href: "/calendario", label: "Ver el calendario" } },

  // Créditos y tarjetas
  { id: "tasa-ea", t: "Tasa efectiva anual", sigla: "E.A.", cat: "credito", d: "Cuánto pagas o ganas en un año completo, incluyendo los intereses sobre intereses. Es la tasa que sirve para comparar créditos o inversiones entre sí.", ir: { href: "/calculadoras", label: "Comparar en la calculadora" }, ver: ["tasa-mv"] },
  { id: "tasa-mv", t: "Tasa mes vencido", sigla: "M.V.", cat: "credito", d: "La tasa que se cobra cada mes. Ojo: 2 % al mes no es 24 % al año sino cerca de 26,8 % E.A., porque cada mes se cobran intereses sobre los intereses anteriores." },
  { id: "usura", t: "Tasa de usura", cat: "credito", d: "El interés máximo que la ley permite cobrar en un crédito. Equivale a 1,5 veces el interés bancario corriente y la Superintendencia Financiera la certifica cada mes. Cobrar por encima es delito. Mirai la actualiza sola y te avisa si un préstamo la supera.", ir: { href: "/le-debo", label: "Revisar tus préstamos" } },
  { id: "interes-compuesto", t: "Interés compuesto", cat: "credito", d: "Cuando los intereses se suman al capital y empiezan a generar más intereses. A tu favor hace crecer el ahorro; en tu contra hace crecer una deuda que no pagas.", ir: { href: "/calculadoras", label: "Simular un ahorro" } },
  { id: "pago-minimo", t: "Pago mínimo y pago total", cat: "credito", d: "En la tarjeta de crédito, el pago total cancela lo del mes y normalmente evita intereses. El pago mínimo solo te mantiene al día: sobre el resto te cobran intereses.", ir: { href: "/tarjetas", label: "Ver tus tarjetas" } },
  { id: "diferir", t: "Diferir a cuotas", cat: "credito", d: "Pagar una compra con tarjeta en varios meses. Cada cuota (salvo a una sola cuota) tiene intereses: entre más cuotas, más pagas en total." },
  { id: "avance", t: "Avance", cat: "credito", d: "Sacar efectivo con la tarjeta de crédito. Cobra intereses desde el primer día y muchas veces una comisión. Es de las formas más caras de conseguir plata." },
  { id: "cuota-manejo", t: "Cuota de manejo", cat: "credito", d: "Lo que cobra el banco cada mes por tener una tarjeta o cuenta. Compara: hay tarjetas y cuentas sin cuota de manejo." },
  { id: "centrales-riesgo", t: "Centrales de riesgo", sigla: "Datacrédito, TransUnion", cat: "credito", d: "Bases de datos donde las entidades reportan cómo pagas. Antes de un reporte negativo te deben avisar con al menos 20 días. El reporte dura el doble del tiempo que estuviste en mora, sin pasar de cuatro años desde que pagas." },
  { id: "bola-nieve", t: "Bola de nieve y avalancha", cat: "credito", d: "Dos métodos para salir de deudas. Bola de nieve: pagas primero la deuda más pequeña para ganar impulso. Avalancha: pagas primero la de tasa más alta para pagar menos intereses. En los dos pagas el mínimo en las demás.", ir: { href: "/estrategia", label: "Armar tu plan" } },
  { id: "empeno", t: "Empeño", cat: "credito", d: "Un préstamo en el que dejas un objeto (una joya, un celular) como garantía. Si no pagas a tiempo, la casa de empeño se queda con él. Revisa la tasa: no puede superar la usura.", ir: { href: "/le-debo?nuevo=1&tipo=empeno", label: "Registrar un empeño" } },
  { id: "gota-a-gota", t: "Gota a gota", cat: "credito", d: "Préstamo informal, sin papeles, con intereses muy por encima de la usura y cobros con presión o amenazas. Es ilegal: evítalo y busca opciones vigiladas (bancos, cooperativas, fintech vigiladas)." },

  // Ahorro e inversión
  { id: "cdt", t: "CDT", sigla: "Certificado de Depósito a Término", cat: "ahorro", d: "Le prestas tu plata al banco por un plazo fijo (por ejemplo 90, 180 o 360 días) a una tasa acordada. Al final te devuelven tu plata más los intereses, a los que les descuentan retención en la fuente. En entidades inscritas en Fogafín, el seguro de depósitos lo protege hasta un monto máximo.", ir: { href: "/calculadoras", label: "Simular un CDT" } },
  { id: "fic", t: "Fondo de inversión colectiva", sigla: "FIC", cat: "ahorro", d: "Un fondo donde muchas personas juntan su plata y una entidad vigilada la invierte. Algunos permiten sacar la plata cuando quieras; la rentabilidad no está garantizada y puede variar.", ir: { href: "/inversiones", label: "Registrar una inversión" } },
  { id: "afc", t: "Cuentas AFC y pensión voluntaria", cat: "ahorro", ref: true, d: "Cuentas para ahorrar a largo plazo (vivienda o pensión). Lo que aportas puede bajar tu retención y tu impuesto de renta, con límites. Si retiras antes de tiempo o para otro fin, puedes perder ese beneficio." },
  { id: "rentabilidad-riesgo", t: "Rentabilidad y riesgo", cat: "ahorro", d: "La rentabilidad es cuánto gana tu inversión; el riesgo, qué tanto puede variar o perderse. Casi siempre van juntos: desconfía de quien prometa ganancias altas sin riesgo y verifica que la entidad esté vigilada por la Superintendencia Financiera." },
  { id: "diversificar", t: "Diversificar", cat: "ahorro", d: "No poner todos los huevos en la misma canasta: repartir tu plata en varias opciones para que, si una va mal, no pierdas todo." },
]

export const glosarioById = (id: string) => GLOSARIO.find((g) => g.id === id)
