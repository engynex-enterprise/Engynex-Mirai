// Reglas de acceso por ruta (§2.2). Las revisa BookGuard (rol y plan del hogar del libro de la ruta) y
// PlatformAdminGuard. Equivalen a requireRole / requireCan / requirePremium / requirePlatformAdmin de apps/web/lib/dal.ts.
import { applyDecorators, SetMetadata, UseGuards } from "@nestjs/common"
import type { AccessRole, Perm } from "@mirai/domain/household/roles"
import type { PremiumFeature } from "@mirai/domain/plans"
import { PlatformAdminGuard } from "./platform-admin.guard"

export const MIN_ROLE = "mirai:min-role"
export const CAN = "mirai:can"
export const PREMIUM = "mirai:premium"

/** Rol mínimo en el hogar del libro (`owner > admin > editor > registra > viewer`). Solo en rutas /v1/books/:bookId. */
export const MinRole = (r: AccessRole) => SetMetadata(MIN_ROLE, r)
/** Permiso de la matriz de roles (mensaje "Tu rol no permite…"). Solo en rutas /v1/books/:bookId. */
export const Can = (p: Perm) => SetMetadata(CAN, p)
/** Función Premium del plan del hogar del libro (402 PLAN_REQUIRED). Solo en rutas /v1/books/:bookId. */
export const Premium = (f: PremiumFeature) => SetMetadata(PREMIUM, f)
/** Solo administradores de la plataforma (consola /admin). */
export const PlatformAdmin = () => applyDecorators(UseGuards(PlatformAdminGuard))
