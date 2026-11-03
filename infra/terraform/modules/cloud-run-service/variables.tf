variable "project_id" {
  description = "Proyecto del ambiente."
  type        = string
}

variable "region" {
  description = "Región del servicio."
  type        = string
}

variable "name" {
  description = "Nombre del servicio (mirai-<ambiente>-<web|api|realtime>)."
  type        = string
  validation {
    condition     = can(regex("^mirai-[a-z0-9-]{1,40}$", var.name))
    error_message = "El nombre debe empezar por \"mirai-\" (máx. 46 caracteres, minúsculas y guiones)."
  }
}

variable "description" {
  description = "Descripción del servicio."
  type        = string
  default     = ""
}

variable "labels" {
  description = "Etiquetas del servicio y de sus revisiones."
  type        = map(string)
  default     = {}
}

variable "image" {
  description = "Imagen inicial. Después la cambia Cloud Build (Terraform ignora el cambio para no revertir despliegues)."
  type        = string
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
}

variable "command" {
  description = "Comando del contenedor (null = el de la imagen). PostgREST y MODE=worker usan el de la imagen."
  type        = list(string)
  default     = null
}

variable "args" {
  description = "Argumentos del contenedor (null = los de la imagen)."
  type        = list(string)
  default     = null
}

variable "sidecars" {
  description = "Contenedores acompañantes (nombre → imagen, argumentos, variables, recursos y puerto de salud). La app arranca después de ellos."
  type = map(object({
    image       = string
    args        = optional(list(string))
    env         = optional(map(string), {})
    cpu         = optional(string, "0.5")
    memory      = optional(string, "256Mi")
    health_port = optional(number)
  }))
  default = {}
}

variable "service_account_email" {
  description = "Cuenta de servicio con la que corre el contenedor."
  type        = string
}

variable "container_port" {
  description = "Puerto en el que escucha el contenedor (Cloud Run inyecta PORT con este valor)."
  type        = number
  default     = 8080
}

variable "cpu" {
  description = "vCPU por instancia."
  type        = string
  default     = "1"
  validation {
    condition     = contains(["1", "2", "4", "8"], var.cpu)
    error_message = "cpu debe ser 1, 2, 4 u 8."
  }
}

variable "memory" {
  description = "Memoria por instancia (p. ej. 512Mi, 1Gi)."
  type        = string
  default     = "1Gi"
  validation {
    condition     = can(regex("^[0-9]+(Mi|Gi)$", var.memory))
    error_message = "memory debe tener la forma 512Mi o 1Gi."
  }
}

variable "cpu_idle" {
  description = "true = CPU solo durante las peticiones (facturación por petición). false = CPU siempre asignada (WebSocket, trabajos en segundo plano)."
  type        = bool
  default     = true
}

variable "startup_cpu_boost" {
  description = "Más CPU durante el arranque (reduce el arranque en frío)."
  type        = bool
  default     = true
}

variable "min_instances" {
  description = "Instancias mínimas (1 en producción evita arranques en frío)."
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
  description = "Peticiones simultáneas por instancia."
  type        = number
  default     = 80
  validation {
    condition     = var.concurrency >= 1 && var.concurrency <= 1000
    error_message = "concurrency entre 1 y 1000."
  }
}

variable "timeout_seconds" {
  description = "Tiempo máximo por petición (chat en streaming: 300; WebSocket: 3600)."
  type        = number
  default     = 300
  validation {
    condition     = var.timeout_seconds >= 1 && var.timeout_seconds <= 3600
    error_message = "timeout_seconds entre 1 y 3600."
  }
}

variable "session_affinity" {
  description = "Afinidad de sesión (necesaria para socket.io si cae a long-polling)."
  type        = bool
  default     = false
}

variable "ingress" {
  description = "Quién puede llegar al servicio: INGRESS_TRAFFIC_ALL, INGRESS_TRAFFIC_INTERNAL_ONLY o INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER (solo el balanceador y tráfico interno)."
  type        = string
  default     = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"
  validation {
    condition     = contains(["INGRESS_TRAFFIC_ALL", "INGRESS_TRAFFIC_INTERNAL_ONLY", "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"], var.ingress)
    error_message = "ingress no válido."
  }
}

variable "public" {
  description = "true = cualquiera puede invocarlo (la app es pública y la autenticación la hace el código). Usa invoker_iam_disabled, compatible con la política de organización que prohíbe allUsers."
  type        = bool
  default     = true
}

variable "invoker_members" {
  description = "Miembros con roles/run.invoker (clave fija → miembro), p. ej. Scheduler y Tasks."
  type        = map(string)
  default     = {}
}

variable "vpc" {
  description = "Direct VPC egress. egress: PRIVATE_RANGES_ONLY (solo Cloud SQL/Redis por la VPC) o ALL_TRAFFIC (todo por la VPC: IP fija con NAT y llamadas internas a otros servicios)."
  type = object({
    network    = string
    subnetwork = string
    egress     = optional(string, "PRIVATE_RANGES_ONLY")
    tags       = optional(list(string), [])
  })
  default = null
  validation {
    condition     = var.vpc == null || contains(["PRIVATE_RANGES_ONLY", "ALL_TRAFFIC"], try(var.vpc.egress, ""))
    error_message = "vpc.egress debe ser PRIVATE_RANGES_ONLY o ALL_TRAFFIC."
  }
}

variable "env" {
  description = "Variables de entorno sin secretos."
  type        = map(string)
  default     = {}
}

variable "secret_env" {
  description = "Variables que salen de Secret Manager: NOMBRE → { secret = secret_id, version = \"latest\" }. El secreto debe tener al menos una versión antes de desplegar."
  type = map(object({
    secret  = string
    version = optional(string, "latest")
  }))
  default = {}
}

variable "startup_probe" {
  description = "Prueba de arranque: tcp o http (con path)."
  type = object({
    type              = optional(string, "tcp")
    path              = optional(string, "/healthz")
    initial_delay     = optional(number, 0)
    period            = optional(number, 5)
    timeout           = optional(number, 3)
    failure_threshold = optional(number, 24)
  })
  default = {}
  validation {
    condition     = contains(["tcp", "http"], var.startup_probe.type)
    error_message = "startup_probe.type debe ser tcp o http."
  }
}

variable "liveness_path" {
  description = "Ruta de la prueba de vida (null = sin prueba de vida)."
  type        = string
  default     = null
}

variable "deletion_protection" {
  description = "Impide borrar el servicio con Terraform."
  type        = bool
  default     = true
}
