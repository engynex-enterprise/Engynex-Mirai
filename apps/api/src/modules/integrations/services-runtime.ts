// Configura @mirai/services en la API (mismo código de avisos, integraciones y Google que la web): el cliente de la base
// es el de SystemScope (clave secreta, con su `reason` en el log), el cifrado es CryptoService (ENCRYPTION_KEY de
// Secret Manager) y las variables salen de ServicesEnv. La IA de las automatizaciones la conectará F2-F.
import { Injectable, type OnModuleInit } from "@nestjs/common"
import { loadBookData } from "@mirai/services/book-data"
import { configureServices } from "@mirai/services/runtime"
import { CryptoService } from "../../core/crypto/crypto.service"
import { systemScope } from "../../core/db/scope"
import { SupabaseJsFactory } from "../../core/db/supabase-js.factory"
import { ServicesEnv } from "./services-env"

const SCOPE = systemScope("servicios compartidos: avisos, integraciones, Google y automatizaciones")

@Injectable()
export class ServicesRuntime implements OnModuleInit {
  constructor(
    private readonly sb: SupabaseJsFactory,
    private readonly crypto: CryptoService,
    private readonly env: ServicesEnv,
  ) {}

  onModuleInit() {
    const v = this.env.values
    configureServices({
      admin: () => this.sb.for(SCOPE),
      encrypt: (s) => this.crypto.encrypt(s),
      decrypt: (s) => this.crypto.decrypt(s),
      env: (name) => v.vars[name],
      siteUrl: () => v.siteUrl,
      publicSiteUrl: () => v.publicSiteUrl,
      loadBook: loadBookData,
    })
  }
}
