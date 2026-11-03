// Compila la API a dist/main.js (F2-B-1/B-9).
// - esbuild empaqueta src/ y los paquetes del monorepo (@mirai/*, que exportan TypeScript sin compilar).
// - swc (unplugin-swc) transforma cada .ts: NestJS necesita `emitDecoratorMetadata`, que esbuild no emite.
// - Las dependencias de npm quedan externas (las instala `pnpm deploy --prod` en la imagen de Docker).
//
// Uso: node scripts/build.mjs            → dist/main.js (+ mapa de fuentes)
//      node scripts/build.mjs --watch    → recompila y reinicia `node dist/main.js` al guardar (pnpm dev)
import { spawn } from "node:child_process"
import { readFileSync, rmSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import * as esbuild from "esbuild"
import swc from "unplugin-swc"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
const watch = process.argv.includes("--watch")

// Externas: todo lo que esté en dependencies (y sus subrutas). Los @mirai/* son devDependencies: se empaquetan.
const external = Object.keys(pkg.dependencies ?? {}).flatMap((d) => [d, `${d}/*`])

/** Reinicia el proceso de la API después de cada compilación (solo --watch). */
function runner() {
  let child = null
  const start = () => {
    child = spawn(process.execPath, ["--enable-source-maps", join(root, "dist/main.js")], { stdio: "inherit", env: process.env })
  }
  return {
    name: "mirai-run",
    setup(build) {
      build.onEnd((r) => {
        if (r.errors.length) return
        if (child) {
          child.once("exit", start)
          child.kill("SIGTERM")
        } else start()
      })
    },
  }
}

const options = {
  absWorkingDir: root,
  entryPoints: { main: "src/main.ts" },
  outdir: "dist",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  sourcemap: true,
  external,
  logLevel: "info",
  legalComments: "none",
  plugins: [
    swc.esbuild({
      tsconfigFile: false,
      jsc: {
        parser: { syntax: "typescript", decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true, useDefineForClassFields: false },
        target: "es2022",
        keepClassNames: true,
      },
    }),
    ...(watch ? [runner()] : []),
  ],
}

rmSync(join(root, "dist"), { recursive: true, force: true })
if (watch) {
  const ctx = await esbuild.context(options)
  await ctx.watch()
} else {
  await esbuild.build(options)
}
