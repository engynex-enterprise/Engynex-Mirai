// Datos de referencia (F2-C-2). Valores oficiales con fuente (UVT, SMMLV, TRM, usura, festivos, calendario de renta):
// la API solo los lee; los actualiza el cron (F2-E, refs/refresh). No conoce Supabase.
import { Injectable } from "@nestjs/common"
import { RequestContextService } from "../../../core/context/request-context.service"
import { RefsRepo, type FestivosQ, type RentaCalendarQ } from "./refs.repository"

@Injectable()
export class RefsService {
  constructor(
    private readonly repo: RefsRepo,
    private readonly ctx: RequestContextService,
  ) {}

  uvt = () => this.repo.porAnio(this.ctx.db, "ref_uvt")
  smmlv = () => this.repo.porAnio(this.ctx.db, "ref_smmlv")
  trm = (limit = 1) => this.repo.trm(this.ctx.db, limit)
  usura = (limit = 1) => this.repo.usura(this.ctx.db, limit)
  festivos = (q: FestivosQ) => this.repo.festivos(this.ctx.db, q)
  rentaCalendar = (q: RentaCalendarQ) => this.repo.rentaCalendar(this.ctx.db, q)
  rentaRegimenes = () => this.repo.rentaRegimenes(this.ctx.db)
}
