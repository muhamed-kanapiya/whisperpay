import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const result = spawnSync(process.execPath, [require.resolve("next/dist/bin/next"), "build"], {
  stdio: "inherit",
  env: { ...process.env, NEXT_PUBLIC_BASE_PATH: "/whisperpay" },
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
writeFileSync("out/.nojekyll", "");
