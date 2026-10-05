import { build } from "esbuild";
import { createRequire } from "node:module";

// Reuse the existing toolchain. Vite's ?url font import is irrelevant to these
// Node fixtures because the tests register the actual font bytes themselves.
const result = await build({
  entryPoints: ["client/src/lib/shipment-account-statement.test.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  write: false,
  packages: "external",
  plugins: [{
    name: "fixture-font",
    setup(builder) {
      builder.onResolve({ filter: /Amiri-Regular\.ttf\?url$/ }, () => ({
        path: "font", namespace: "fixture",
      }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
        contents: 'export default "fixture-font"', loader: "js",
      }));
    },
  }],
});
const module = { exports: {} };
new Function("require", "module", "exports", result.outputFiles[0].text)(
  createRequire(import.meta.url), module, module.exports,
);
