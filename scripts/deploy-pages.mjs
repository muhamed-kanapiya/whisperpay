import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep, basename } from "node:path";

if (!process.argv.includes("--skip-build")) await import("./build-pages.mjs");
const output = resolve("out");
if (!existsSync(join(output, "index.html")) || !existsSync(join(output, ".nojekyll"))) {
  throw new Error("Run npm run build:pages before publishing.");
}
const gitConfig = process.platform === "win32" ? ["-c", "http.sslBackend=schannel"] : [];
function git(args, env = process.env) {
  const result = spawnSync("git", [...gitConfig, ...args], { env, encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || "Git operation failed.");
  return result.stdout.trim();
}
const gitDirectory = git(["rev-parse", "--absolute-git-dir"]);
const temporaryDirectory = mkdtempSync(join(tmpdir(), "whisperpay-pages-"));
const env = {
  ...process.env,
  GIT_DIR: gitDirectory,
  GIT_WORK_TREE: output,
  GIT_INDEX_FILE: join(temporaryDirectory, "index"),
  GIT_TERMINAL_PROMPT: "0",
  GCM_INTERACTIVE: "Never",
};
try {
  // A separate index publishes only the export without changing the source checkout.
  git(["read-tree", "--empty"], env);
  git(["-C", output, "add", "--force", "--all"], env);
  const tree = git(["write-tree"], env);
  const previous = spawnSync("git", ["rev-parse", "--verify", "refs/heads/gh-pages"], { encoding: "utf8" });
  const parent = previous.status === 0 ? ["-p", previous.stdout.trim()] : [];
  const commit = git(["commit-tree", tree, ...parent, "-m", "Deploy WhisperPay to GitHub Pages"], env);
  git(["update-ref", "refs/heads/gh-pages", commit], env);
  console.log(git(["push", "origin", "gh-pages"], env));
  console.log(`Published static export: ${commit}`);
} finally {
  const absoluteTemporaryDirectory = resolve(temporaryDirectory);
  if (!absoluteTemporaryDirectory.startsWith(resolve(tmpdir()) + sep) || !basename(absoluteTemporaryDirectory).startsWith("whisperpay-pages-")) {
    throw new Error("Unexpected temporary cleanup path.");
  }
  rmSync(absoluteTemporaryDirectory, { recursive: true, force: true });
}
