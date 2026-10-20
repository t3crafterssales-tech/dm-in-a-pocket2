// Builds the desktop app into dist/: the main process, the preload bridge and the window.
// Run with `npm run build`. The engine and tests don't need this; they run TypeScript directly.

import { build } from "esbuild";
import { copyFileSync, mkdirSync, rmSync } from "node:fs";

const out = "dist";
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const common = { bundle: true, sourcemap: true, logLevel: "warning", legalComments: "none" };

await Promise.all([
  build({ ...common, entryPoints: ["src/app/main.ts"], outfile: `${out}/main.cjs`, platform: "node", format: "cjs", target: "node22", external: ["electron"] }),
  build({ ...common, entryPoints: ["src/app/preload.ts"], outfile: `${out}/preload.cjs`, platform: "node", format: "cjs", target: "node22", external: ["electron"] }),
  build({ ...common, entryPoints: ["src/ui/renderer.ts"], outfile: `${out}/renderer.js`, platform: "browser", format: "iife", target: "chrome130" }),
]);

for (const f of ["index.html", "styles.css"]) copyFileSync(`src/ui/${f}`, `${out}/${f}`);
copyFileSync("build/icon.png", `${out}/icon.png`);
console.log("Built the app into dist/");
