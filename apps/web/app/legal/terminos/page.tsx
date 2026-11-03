import { LEGAL_VERSION } from "@/lib/legal/version"

export const metadata = { title: "Términos de uso" }

export default function Terminos() {
  return (
    <>
      <h1>Términos de uso</h1>
      <p>Versión {LEGAL_VERSION}.</p>
      <h2>1. Qué es Mirai</h2>
      <p>Una herramienta para organizar las finanzas personales y familiares. No es una entidad financiera ni presta asesoría tributaria, legal o de inversión.</p>
      <h2>2. Cálculos estimados</h2>
      <p>Los valores de renta, nómina, préstamos, impuestos y rendimientos son <b>estimados</b> con la información que registras y las normas vigentes conocidas. El valor final de tu declaración lo define tu contador y la DIAN.</p>
      <h2>3. Tu cuenta</h2>
      <ul>
        <li>Eres responsable de la información que registras y de las personas que invitas a tu hogar.</li>
        <li>Cuida tu contraseña y activa la verificación en dos pasos.</li>
        <li>Puedes descargar tus datos o borrar tu cuenta en cualquier momento.</li>
      </ul>
      <h2>4. Inteligencia artificial</h2>
      <p>Las respuestas de la IA pueden equivocarse. Revísalas antes de tomar decisiones.</p>
      <h2>5. Planes Gratis y Premium</h2>
      <ul>
        <li><b>Gratis</b> incluye las funciones básicas, con anuncios y con límites de libros de cuentas y de personas por hogar.</li>
        <li><b>Premium</b> agrega inteligencia artificial, automatización bancaria, impuestos y contador, y familia con varios libros, sin anuncios. El plan es del hogar: lo comparten todos sus integrantes.</li>
        <li>Los precios se muestran en pesos colombianos e incluyen los impuestos aplicables. Un cambio de precio no afecta lo que ya pagaste.</li>
      </ul>
      <h2>6. Pagos, renovación y cancelación</h2>
      <ul>
        <li>Los pagos los procesan <b>Mercado Pago</b> y <b>Wompi</b> (Bancolombia). Mirai no ve ni guarda los datos de tu tarjeta.</li>
        <li>Con tarjeta, Premium se renueva solo cada mes o cada año hasta que lo canceles en Ajustes › Mi plan. Si lo cancelas, sigues con Premium hasta el final del periodo pagado y no se te cobra más.</li>
        <li>Con Nequi, PSE o Bancolombia pagas un mes o un año sin renovación automática; te avisamos antes de que venza.</li>
        <li><b>Derecho de retracto</b> (Ley 1480 de 2011, art. 47): puedes pedir la devolución dentro de los 5 días hábiles siguientes al pago. Lo devolvemos por el mismo medio en un máximo de 30 días calendario.</li>
        <li>Si un pago no se aprueba o vence, el hogar vuelve al plan Gratis sin perder ningún dato.</li>
        <li>Recibirás la factura electrónica en el correo de tu cuenta.</li>
      </ul>
      <h2>7. Anuncios</h2>
      <p>En el plan Gratis mostramos anuncios marcados como <b>Publicidad</b>. Los anuncios propios y de aliados no usan tu información financiera. Los anuncios de Google solo se muestran si aceptas sus cookies, y puedes cambiar esa decisión cuando quieras.</p>
      <h2>8. Cambios</h2>
      <p>Si cambiamos estos términos te pediremos aceptarlos de nuevo.</p>
    </>
  )
}
