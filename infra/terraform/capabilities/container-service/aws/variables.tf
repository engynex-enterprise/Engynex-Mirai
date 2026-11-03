# ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
# CONTRATO de la capacidad. Este archivo es IDÉNTICO en gcp/, aws/ y azure/ (lo revisa
# infra/terraform/scripts/contrato.py en CI). Para cambiarlo: edítalo en las tres carpetas a la vez.
# Lo propio de cada nube entra por `context.cloud` (mapa de texto) o por `cloud_options` (cada implementación
# documenta las claves que lee e ignora las demás). Los "handles" (network, platform, origin…) son opacos: su
# forma la define la implementación de cada nube y solo se pasan de una capacidad a otra de la MISMA nube.
# ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

variable "context" {
  description = <<-EOT
    Contexto común del ambiente. prefix = mirai-<ambiente>; region = región de la nube (us-east1, us-east-1, eastus2…).
    cloud = datos propios de la nube: gcp → project_id, project_number; aws → account_id; azure → resource_group_name,
    subscription_id, tenant_id.
  EOT
  type = object({
    prefix      = string
    environment = string
    region      = string
    labels      = map(string)
    cloud       = map(string)
  })
  validation {
    condition     = contains(["pruebas", "produccion"], var.context.environment) && can(regex("^mirai-[a-z0-9-]+$", var.context.prefix))
    error_message = "context.environment debe ser pruebas o produccion y context.prefix empezar por mirai-."
  }
}

variable "cloud_options" {
  description = "Ajustes propios de la nube (opcionales). Cada implementación documenta en su main.tf las claves que lee."
  type        = any
  default     = {}
}

# ── container-service: un servicio HTTP en contenedor (GCP: Cloud Run v2; AWS: ECS Fargate + grupo de destino del ALB;
#    Azure: Container App). La imagen la cambia el CI/CD: Terraform la ignora después de crear el servicio.

variable "platform" {
  description = "Handle de la plataforma (salida platform de container-platform de la misma nube)."
  type        = any
}

variable "identity" {
  description = "Handle de la identidad del servicio (handles[<clave>] de la capacidad identity de la misma nube)."
  type        = any
}

variable "name" {
  description = "Nombre del servicio (mirai-<ambiente>-<web|api|realtime|worker|postgrest>)."
  type        = string
  validation {
    condition     = can(regex("^mirai-[a-z0-9-]{1,40}$", var.name))
    error_message = "El nombre empieza por mirai- (máx. 46 caracteres, minúsculas y guiones)."
  }
}

variable "description" {
  description = "Descripción del servicio."
  type        = string
  default     = ""
}

variable "image" {
  description = "Imagen inicial (null = la imagen de ejemplo de la nube). Después la cambia el CI/CD con el digest aprobado."
  type        = string
  default     = null
}

variable "command" {
  description = "Comando del contenedor (null = el ENTRYPOINT/CMD de la imagen)."
  type        = list(string)
  default     = null
}

variable "args" {
  description = "Argumentos del contenedor (null = los de la imagen)."
  type        = list(string)
  default     = null
}

variable "port" {
  description = "Puerto en el que escucha el contenedor (se inyecta como PORT donde la nube lo hace)."
  type        = number
  default     = 8080
}

variable "cpu" {
  description = "vCPU por instancia: 0.25, 0.5, 1, 2 o 4 (cada nube redondea a lo que admite)."
  type        = string
  default     = "1"
  validation {
    condition     = contains(["0.25", "0.5", "1", "2", "4"], var.cpu)
    error_message = "cpu debe ser 0.25, 0.5, 1, 2 o 4."
  }
}

variable "memory" {
  description = "Memoria por instancia (512Mi, 1Gi, 2Gi…)."
  type        = string
  default     = "1Gi"
  validation {
    condition     = can(regex("^[0-9]+(Mi|Gi)$", var.memory))
    error_message = "memory debe tener la forma 512Mi o 1Gi."
  }
}

variable "min_instances" {
  description = "Instancias mínimas (1 en producción evita arranques en frío). 0 = escala a cero donde la nube lo permite."
  type        = number
  default     = 0
  validation {
    condition     = var.min_instances >= 0 && var.min_instances <= 100
    error_message = "min_instances entre 0 y 100."
  }
}

variable "max_instances" {
  description = "Instancias máximas (techo de costo y de conexiones a la base)."
  type        = number
  default     = 10
  validation {
    condition     = var.max_instances >= 1 && var.max_instances <= 1000
    error_message = "max_instances entre 1 y 1000."
  }
}

variable "concurrency" {
  description = "Peticiones simultáneas por instancia (también es el umbral de escalado en AWS y Azure)."
  type        = number
  default     = 80
  validation {
    condition     = var.concurrency >= 1 && var.concurrency <= 1000
    error_message = "concurrency entre 1 y 1000."
  }
}

variable "timeout_s" {
  description = "Tiempo máximo por petición (chat en streaming: 300; WebSocket: 3600)."
  type        = number
  default     = 300
  validation {
    condition     = var.timeout_s >= 1 && var.timeout_s <= 3600
    error_message = "timeout_s entre 1 y 3600."
  }
}

variable "always_on_cpu" {
  description = "true = CPU siempre asignada (WebSocket, trabajos en segundo plano). false = CPU solo durante las peticiones donde la nube lo permite."
  type        = bool
  default     = false
}

variable "session_affinity" {
  description = "Afinidad de sesión (socket.io cuando cae a long-polling)."
  type        = bool
  default     = false
}

variable "ingress" {
  description = "edge = solo por el borde (balanceador/CDN) y la red interna; internal = solo la red interna (postgrest, worker); public = abierto (sin borde, solo para pruebas)."
  type        = string
  default     = "edge"
  validation {
    condition     = contains(["edge", "internal", "public"], var.ingress)
    error_message = "ingress debe ser edge, internal o public."
  }
}

variable "routes" {
  description = "Cómo llega el borde a este servicio: dominios y caminos (/v1/*, /api/auth/*, /socket.io/*). priority ordena las reglas donde la nube lo pide (AWS: reglas del ALB). Vacío = solo por la red interna."
  type = list(object({
    hosts    = list(string)
    paths    = optional(list(string), ["/*"])
    priority = number
  }))
  default = []
}

variable "health_path" {
  description = "Camino que responde 200 cuando el servicio está sano (chequeos del balanceador y sondas). null = solo TCP."
  type        = string
  default     = "/healthz"
}

variable "probes" {
  description = "Sondas: startup tcp|http (http usa health_path) y liveness (revisar health_path periódicamente)."
  type = object({
    startup  = optional(string, "tcp")
    liveness = optional(bool, false)
  })
  default = {}
  validation {
    condition     = contains(["tcp", "http"], var.probes.startup)
    error_message = "probes.startup debe ser tcp o http."
  }
}

variable "env" {
  description = "Variables de entorno sin secretos."
  type        = map(string)
  default     = {}
}

variable "secret_env" {
  description = "Variables que salen del almacén de secretos: NOMBRE → referencia (salida refs de la capacidad secrets de la misma nube). El secreto debe tener valor antes de desplegar."
  type        = map(string)
  default     = {}
}

variable "invokers" {
  description = "Identidades que pueden invocar el servicio (principals de identity). GCP: roles/run.invoker; AWS y Azure: el acceso es por red y por el token que valida la app."
  type        = map(string)
  default     = {}
}

variable "deletion_protection" {
  description = "Impide borrar el servicio con Terraform."
  type        = bool
  default     = true
}
