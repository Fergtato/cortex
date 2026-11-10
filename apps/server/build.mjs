// Bundles the server (and every module's server half) into one ESM file.
// Native/optional deps stay external; the Dockerfile copies them alongside.
import { build } from "esbuild";

await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/server.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: true,
  external: ["better-sqlite3", "pg-native"],
  // Bundled CJS deps (pg) call require(); give ESM output a real one.
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
  logLevel: "info",
});
