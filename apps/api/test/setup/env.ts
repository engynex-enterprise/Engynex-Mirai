// Se carga antes de cada archivo de prueba (vitest.config.mts › setupFiles).
import "reflect-metadata"
import { enableZodEs } from "@mirai/contracts/zod-es"

enableZodEs()
