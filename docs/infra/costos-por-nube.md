# Costos estimados por nube (USD/mes)

> **Todo aquí es ESTIMADO.** Precios de lista de referencia (on-demand, sin impuestos, sin descuentos por compromiso ni
> créditos), en la región del este de EE. UU. de cada nube (GCP `us-east1`, AWS `us-east-1`, Azure `eastus2`), con la
> configuración de `clouds/<nube>/envs/*/terraform.tfvars.example`. Verificar con las calculadoras oficiales antes del
> bootstrap (GCP Pricing Calculator, AWS Pricing Calculator, Azure Pricing Calculator): los precios cambian y la carga
> real manda. Escrito el 2026-11-02.

**Supuestos de carga** (los de `estrategia-gcp.md` §13): 1 000–5 000 personas activas al mes, ~1 M de peticiones/mes a
web + API en producción, 30–50 GB de salida, base de ~90 MB (20 GB de disco), Redis de 1 GB, 60 despliegues al mes.

## 1. Producción (con HA en la base)

| Componente | GCP | AWS | Azure |
|---|---|---|---|
| Contenedores siempre encendidos: web, api, realtime (1 vCPU) y PostgREST (0,5) con mínimo 1 | 110–160 (Cloud Run; realtime con CPU siempre) | 130–200 (Fargate, + worker 0,5 vCPU) | 170–280 (Container Apps Consumption activa todo el mes, + worker) |
| Postgres 2 vCPU / ~8 GB con HA, 20 GB, copias 30 días | 200–215 (Cloud SQL `db-custom-2-7680` REGIONAL) | 240–270 (RDS `db.m7g.large` Multi-AZ) | 260–290 (Flexible `D2ds_v5` zone-redundant) |
| Redis 1 GB | 35–40 (Memorystore Basic) | 25–50 (ElastiCache t4g.small, réplica opcional) | 40–100 (Basic C1 / Standard C1 con réplica) |
| Borde: balanceador/CDN + WAF + certificado | 45–65 (ALB global + Cloud Armor + CDN) | 40–70 (ALB interno + CloudFront + WAF) | 340–370 (**Front Door Premium**: ~330 de cuota fija) · 50–80 con Front Door Standard |
| NAT (salida a internet) | 2–6 (Cloud NAT) | 70–85 (2 NAT Gateway, uno por zona) | 35–45 (NAT Gateway + IP) |
| Archivos, secretos, colas, cron | 3–8 | 10–20 (Secrets Manager cobra por secreto) | 15–25 (Service Bus Standard ~10) |
| Registros, métricas, alertas, trazas (OTEL) | 5–20 | 10–30 | 15–40 (Log Analytics / Application Insights por GB) |
| **Total producción** | **≈ 400–515** | **≈ 525–725** | **≈ 875–1 150** (Premium) · **≈ 585–860** (Standard) |

## 2. Pruebas (mínimos, escala a cero donde se puede)

| Componente | GCP | AWS | Azure |
|---|---|---|---|
| Contenedores | 0–10 (escala a cero) | 40–70 (Fargate no escala a cero detrás del ALB; Spot abarata web y worker) | 10–40 (mínimo 0) |
| Postgres sin HA | 27–32 (`db-g1-small`) | 13–18 (`db.t4g.micro`) | 13–20 (`B1ms`) |
| Redis | — (realtime de 1 instancia sin Redis) | — | — |
| Borde | 38–42 | 25–40 | 330–345 (Premium) · 35–45 (Standard) |
| NAT | 1–3 | 33–40 (un NAT) | 35–40 |
| Resto (secretos, colas, logs) | 3–8 | 10–20 | 15–25 (Service Bus incluido) |
| **Total pruebas** | **≈ 70–95** | **≈ 120–190** | **≈ 405–470** (Premium) · **≈ 110–170** (Standard) |

## 3. Compartido (CI/CD)

| | GCP | AWS | Azure |
|---|---|---|---|
| Registro de imágenes (10–15 GB) | 1–3 | 1–3 | 5–20 (ACR Basic/Standard) |
| Estado de Terraform | < 1 | < 1 | < 1 |
| GitHub Actions | 0 en repos con minutos incluidos; ~USD 0,008/min Linux por encima (≈ 900 min/mes) | igual | igual |
| Cloud Build (solo si se usa la alternativa) | 15–30 | — | — |

## 4. Lectura

- **GCP es la más barata para Mirai** por tres razones: Cloud Run cobra casi nada cuando no hay peticiones (pruebas),
  Cloud NAT no tiene cuota fija por hora y el borde global (ALB + Armor) cuesta menos que Front Door Premium.
- **AWS** sale más cara sobre todo por los NAT Gateway (≈ USD 33 cada uno) y porque Fargate no escala a cero detrás
  del ALB. Ahorros: un solo NAT también en producción (−35, sin redundancia de zona), Fargate Spot para web/worker,
  Savings Plans (−20 a −50 % en Fargate) y RDS reservada (−30 a −40 %).
- **Azure** sube por Front Door **Premium** (cuota fija ~330/mes por perfil, la pide el WAF administrado y Private Link).
  Con Front Door Standard (WAF solo con reglas propias, sin Private Link) queda en el rango de AWS. Ahorro adicional:
  un perfil de Front Door compartido por pruebas y producción.
- En las tres, lo más caro es **Postgres con HA** (~40–50 % del total). Sin HA en producción se ahorra la mitad de esa
  fila a cambio de no tener conmutación automática.
- A estos totales se les **resta** lo que deja de pagarse en Vercel (plan, funciones, AI Gateway) y Supabase (plan,
  cómputo, salida) al apagarlos (v7 §5.5).
