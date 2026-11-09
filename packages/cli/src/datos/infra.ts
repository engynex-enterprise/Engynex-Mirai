// El panel de infraestructura: los servicios de Docker, los puertos y qué variables exige cada compose.
import { clasificarVariables, leerCompose } from "./compose.ts"
import { SERVICIOS } from "./contenido.ts"
import { PUERTOS, variablesDefinidas } from "./salud-local.ts"
import type { Fila, Seccion } from "./tipos.ts"

export function infraestructura(): Seccion[] {
  const servidor = leerCompose("infra/servidor/docker-compose.yml")
  const local = leerCompose("infra/local/docker-compose.yml")
  const definidas = variablesDefinidas()
  const secciones: Seccion[] = []

  secciones.push({
    id: "donde",
    titulo: "Dónde vive Mirai",
    descripcion: "Desde el 7 de noviembre de 2026, todo en un solo servidor.",
    filas: [
      { id: "vps", nombre: "Servidor", valor: "vps.engynex.com", detalle: "Un VPS de Hostinger manejado con Dokploy. Ya no se usan Vercel ni Supabase." },
      { id: "dominio", nombre: "Producción", valor: "mirai.engynex.com", detalle: "La rama main es producción: push → CI → Desplegar VPS." },
      { id: "despliegue", nombre: "Cómo se sube", valor: "/deploy", detalle: "Verificar en local, migrar la base si toca, push a main y seguir el CI." },
      { id: "copias", nombre: "Copias", valor: "diarias", detalle: "El servicio db-backup del compose guarda una copia de la base cada día." },
    ],
  })

  for (const [titulo, c, nota] of [
    ["Servicios en el servidor", servidor, "infra/servidor/docker-compose.yml"],
    ["Servicios en este computador", local, "infra/local/docker-compose.yml"],
  ] as const) {
    if (!c) continue
    secciones.push({
      id: c.archivo,
      titulo,
      descripcion: nota,
      filas: c.servicios.map((s): Fila => ({
        id: s.nombre,
        nombre: s.nombre,
        valor: s.imagen.replace(/^docker\.io\//, ""),
        detalle: [SERVICIOS[s.nombre] ?? "", s.puertos.length ? `Puertos ${s.puertos.join(", ")}.` : "", s.dependeDe.length ? `Necesita: ${s.dependeDe.join(", ")}.` : "", s.perfil ? `Solo con el perfil ${s.perfil}.` : ""].filter(Boolean).join(" "),
        grupo: titulo,
      })),
    })
  }

  secciones.push({
    id: "puertos",
    titulo: "Puertos locales",
    descripcion: "Los 55xxx del arnés local, para no chocar con nada más.",
    filas: PUERTOS.map((p) => ({ id: String(p.puerto), nombre: String(p.puerto), valor: p.que, detalle: "" })),
  })

  if (servidor) {
    const exigidas = clasificarVariables(servidor.exigidas)
    secciones.push({
      id: "variables",
      titulo: "Variables obligatorias del servidor",
      descripcion: "Las que el compose exige sí o sí. Aquí solo se dice si están: el valor nunca se muestra.",
      filas: exigidas.map((v) => ({
        id: v.nombre,
        nombre: v.nombre,
        valor: definidas.has(v.nombre) ? "definida" : "falta",
        detalle: v.secreta ? "Guarda un secreto: su valor no se muestra nunca." : "",
        grupo: v.secreta ? "Secretas" : "Configuración",
      })),
    })
  }
  return secciones
}
