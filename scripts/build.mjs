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
  build({ ...common, entryPoints: ["src/book/book-view.ts"], outfile: `${out}/book.js`, platform: "browser", format: "iife", target: "chrome130" }),
  // The player's page, served to phones and laptops on the home network (older browsers too).
  build({ ...common, entryPoints: ["src/player/player.ts"], outfile: `${out}/player.js`, platform: "browser", format: "iife", target: ["chrome100", "safari15", "firefox100"] }),
]);

for (const f of ["index.html", "styles.css"]) copyFileSync(`src/ui/${f}`, `${out}/${f}`);
for (const f of ["book.html", "book.css"]) copyFileSync(`src/book/${f}`, `${out}/${f}`);
for (const f of ["player.html", "player.css"]) copyFileSync(`src/player/${f}`, `${out}/${f}`);
copyFileSync("build/icon.png", `${out}/icon.png`);
console.log("Built the app into dist/");
