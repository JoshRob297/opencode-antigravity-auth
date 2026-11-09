// The release tarball is consumed as an unpacked directory, and OpenCode resolves a
// configured plugin directory by the conventional name at its root (`index.js`), not
// by `main`. This entry points that name at the single bundled file, so an install
// needs neither node_modules nor a build step.
import { writeFileSync } from "node:fs"

writeFileSync(
  new URL("../index.js", import.meta.url),
  [
    'export { default } from "./dist/standalone.js"',
    'export * from "./dist/standalone.js"',
    "",
  ].join("\n"),
)
