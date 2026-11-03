// Identidad de Azure (identidad administrada en Container Apps/AKS/App Service; az login o variables AZURE_* en local)
// con DefaultAzureCredential. Se carga perezosamente: solo si se usa Service Bus, Key Vault o TASKS_AUTH=azure.
import type { TokenCredential } from "@azure/identity"

let credential: Promise<TokenCredential> | undefined

/** Credencial compartida (cachea tokens por alcance). AZURE_CLIENT_ID elige una identidad asignada por el usuario. */
export function azureCredential(): Promise<TokenCredential> {
  return (credential ??= import("@azure/identity").then(({ DefaultAzureCredential }) => new DefaultAzureCredential(process.env.AZURE_CLIENT_ID ? { managedIdentityClientId: process.env.AZURE_CLIENT_ID } : undefined)))
}

/** Token de acceso para un alcance (p. ej. https://vault.azure.net/.default o api://mirai-api/.default). */
export async function azureToken(scope: string): Promise<string> {
  const t = await (await azureCredential()).getToken(scope)
  if (!t?.token) throw new Error("Azure no entregó un token")
  return t.token
}
