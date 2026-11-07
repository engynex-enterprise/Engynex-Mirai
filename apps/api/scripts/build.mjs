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

/**
 * unplugin-swc resuelve por su cuenta las importaciones relativas y las pone en su propio espacio («swc:»); el mismo
 * archivo importado por el nombre del paquete (`@mirai/services/runtime`) queda en el espacio normal. Resultado: dos
 * copias del módulo (p. ej. `configureServices` configura una y `rt()` lee la otra: «@mirai/services sin configurar»).
 * Este plugin, que va antes, resuelve las relativas con esbuild para que cada archivo exista una sola vez (swc lo sigue
 * transformando: su onLoad aplica a todos los espacios).
 */
const SKIP = Symbol("mirai-one-copy")
const oneCopy = {
  name: "mirai-one-copy",
  setup(build) {
    build.onResolve({ filter: /^\.\.?\// }, async (args) => {
      if (args.pluginData === SKIP) return undefined
      const r = await build.resolve(args.path, { kind: args.kind, importer: args.importer, resolveDir: args.resolveDir, pluginData: SKIP })
      // La ruta sale del resolvedor (el de swc o el de esbuild); el espacio siempre es el normal («file»).
      return r.errors.length || r.external ? undefined : { path: r.path, namespace: "file", sideEffects: r.sideEffects }
    })
  },
}

const options = {
  absWorkingDir: root,
  // auth-migrate: migración de usuarios Supabase → auth propio (V7-A, src/modules/auth/migrate/cli.ts).
  // storage-copy: copia de Supabase Storage al ObjectStore destino (V7-E, src/tools/storage-copy.ts).
  entryPoints: { main: "src/main.ts", "auth-migrate": "src/modules/auth/migrate/cli.ts", "storage-copy": "src/tools/storage-copy.ts" },
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
    oneCopy,
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
