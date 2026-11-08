import { LEGAL } from "@/lib/legal/config"
import { LEGAL_VERSION } from "@/lib/legal/version"

export const metadata = { title: "Política de tratamiento de datos" }

export default function Privacidad() {
  return (
    <>
      <h1>Política de tratamiento de datos personales</h1>
      <p>Versión {LEGAL_VERSION}. Esta política cumple la Ley 1581 de 2012 y el Decreto 1074 de 2015 (capítulo 25).</p>
      <h2>1. Responsable</h2>
      <p>{LEGAL.responsable}{LEGAL.nit && `, NIT ${LEGAL.nit}`}, con domicilio en {LEGAL.ciudad}.{LEGAL.email && ` Contacto: ${LEGAL.email}.`}</p>
      <h2>2. Qué datos tratamos</h2>
      <ul>
        <li>De identificación y contacto: nombre, correo, documento, celular, ciudad y dirección.</li>
        <li>Financieros que tú registras: ingresos, gastos, préstamos, inversiones, metas, bienes y datos para la declaración de renta.</li>
        <li>De integrantes de tu familia, incluidos menores de edad (nombre, parentesco, fecha de nacimiento y si son tus dependientes). Solo los registras tú, como su representante, y se usan únicamente para tus cuentas y tu declaración.</li>
        <li>Técnicos: inicio de sesión, dispositivo y registros de errores, sin montos ni datos personales.</li>
        <li>De pago (plan Premium): estado, monto, fecha, medio y referencia de cada pago. Los datos de la tarjeta o de la cuenta los recibe directamente la pasarela (Mercado Pago o Wompi), nunca Mirai.</li>
        <li>Opiniones que nos envías: lo que escribes, la captura que adjuntes, la página donde estabas, la versión de Mirai y el tamaño de tu pantalla.</li>
      </ul>
      <h2>3. Para qué los usamos</h2>
      <ul>
        <li>Mostrarte tus finanzas, calcular estimados (renta, nómina, préstamos) y enviarte los avisos que actives.</li>
        <li>Permitir que las personas que invites a tu hogar, o tu contador, vean la información que decidas compartir.</li>
        <li>Si activas la inteligencia artificial, enviar al proveedor que elijas solo la información necesaria para responder tu pregunta.</li>
        <li>Cobrar el plan Premium, emitir la factura y atender devoluciones.</li>
        <li>Mejorar Mirai con las opiniones que nos envías y con estadísticas de uso agregadas (sin montos).</li>
      </ul>
      <p><b>No vendemos tus datos ni usamos tu información financiera para publicidad.</b> En el plan Gratis, los anuncios propios se eligen sin mirar tus datos financieros: solo según tu plan y tu tipo de dispositivo. Para no mostrarte el mismo anuncio demasiadas veces, guardamos cuántas veces viste, tocaste o cerraste cada anuncio por día; esa información nunca se comparte con los anunciantes, que solo reciben totales. Los anuncios de Google AdSense solo se cargan si aceptas sus cookies; Google puede usarlas para personalizar anuncios según su propia política. Puedes retirar ese permiso borrando los datos del sitio en tu navegador o pasando a Premium.</p>
      <h2>4. Tus derechos</h2>
      <ul>
        <li>Conocer, actualizar y rectificar tus datos (Perfil y cada sección).</li>
        <li>Descargar todos tus datos (Ajustes › Privacidad › Descargar mis datos).</li>
        <li>Revocar la autorización y pedir que se borren (Ajustes › Privacidad › Borrar mi cuenta).</li>
        <li>Presentar quejas ante la Superintendencia de Industria y Comercio.</li>
      </ul>
      <h2>5. Seguridad</h2>
      <p>Los datos se guardan cifrados en tránsito y en reposo, con reglas de acceso por hogar. Las claves de servicios externos se guardan cifradas y nunca llegan al navegador. Puedes activar la verificación en dos pasos.</p>
      <h2>6. Encargados y transferencias</h2>
      <p>Usamos proveedores de infraestructura (Hostinger, con servidores en Brasil, y Cloudflare para la red y los archivos), de pagos (Mercado Pago y Wompi) si pagas Premium, de publicidad (Google AdSense) solo si aceptas sus cookies y, solo si los activas, de correo, mensajería e inteligencia artificial. Algunos pueden almacenar datos fuera de Colombia con niveles adecuados de protección.</p>
      <h2>7. Vigencia</h2>
      <p>Conservamos tus datos mientras tengas cuenta. Al borrarla eliminamos tu información en un plazo máximo de 30 días, salvo lo que la ley obligue a conservar.</p>
    </>
  )
}
