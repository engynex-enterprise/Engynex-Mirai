import { resetQaUser } from "./qa"

export default async function globalSetup() {
  process.loadEnvFile?.(".env.local")
  await resetQaUser()
}
