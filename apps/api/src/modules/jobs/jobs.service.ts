// Esqueleto del tick de avisos (§2.7.7). F2-E lo llena: latido en platform_settings, horarioActivo/tareasDiarias
// (lib/notify/schedule.ts) y una tarea de Cloud Tasks por hogar con nombre determinista (notify-<hogar>-<AAAAMMDDHH>).
import { Injectable } from "@nestjs/common"
import type { TickReport } from "@mirai/contracts/modules/jobs"
import { RequestContextService } from "../../core/context/request-context.service"

/** Hora de Bogotá (0–23). */
export const horaBogota = (d = new Date()) => Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Bogota", hour: "numeric", hourCycle: "h23" }).format(d))

@Injectable()
export class JobsService {
  constructor(private readonly ctx: RequestContextService) {}

  notifyTick(o: { dry: boolean }, now = new Date()): TickReport {
    return { hora: horaBogota(now), dry: o.dry, encoladas: 0, caller: this.ctx.get().caller ?? "?", nota: "Esqueleto de F2-B: todavía no envía avisos (lo implementa F2-E)." }
  }
}
