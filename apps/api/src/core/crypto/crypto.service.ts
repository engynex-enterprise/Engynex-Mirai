// Cifrado de credenciales de integraciones con @mirai/crypto (mismo formato v1 que la web) y la llave de la
// configuración validada (ENCRYPTION_KEY, Secret Manager).
import { Injectable } from "@nestjs/common"
import { decryptWith, encryptWith, mask, parseKey } from "@mirai/crypto"
import { AppConfig } from "../config/app-config"
import { DomainError } from "../errors/domain-error"

@Injectable()
export class CryptoService {
  private readonly key?: Buffer
  constructor(config: AppConfig) {
    this.key = config.encryptionKey ? parseKey(config.encryptionKey) : undefined
  }
  get ready() {
    return !!this.key
  }
  private k(): Buffer {
    if (!this.key) throw DomainError.internal(new Error("Falta ENCRYPTION_KEY"))
    return this.key
  }
  encrypt(plain: string) {
    return encryptWith(this.k(), plain)
  }
  decrypt(blob: string) {
    return decryptWith(this.k(), blob)
  }
  mask(s: string) {
    return mask(s)
  }
}
