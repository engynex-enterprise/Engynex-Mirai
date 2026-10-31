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
      <h2>5. Cambios</h2>
      <p>Si cambiamos estos términos te pediremos aceptarlos de nuevo.</p>
    </>
  )
}
