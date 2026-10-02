import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

// 自动发现无需运行中客户端的回归；E2E 必须另用隔离实例，不混入无交互门禁。
const root = resolve(import.meta.dirname, "..");
const requested = process.argv[2];
const packages = requested ? [requested] : ["ui", "desktop"];
for (const name of packages) {
  if (!["ui", "desktop"].includes(name)) throw new Error(`Unknown test package: ${name}`);
  const dir = resolve(root, "packages", name, "test");
  const files = (await readdir(dir)).filter((file) => /\.test\.(ts|mjs)$/.test(file)).sort();
  for (const extension of ["ts", "mjs"]) {
    const group = files.filter((file) => file.endsWith(`.${extension}`));
    if (!group.length) continue;
    const runner =
      extension === "ts"
        ? [
            resolve(root, "node_modules/tsx/dist/cli.mjs"),
            "--tsconfig",
            resolve(root, "packages/ui/tsconfig.json"),
          ]
        : [];
    const status = await new Promise((resolveStatus, reject) => {
      const child = spawn(
        process.execPath,
        [...runner, "--test", ...group.map((file) => resolve(dir, file))],
        { cwd: root, stdio: "inherit" },
      );
      child.once("error", reject);
      child.once("exit", (code) => resolveStatus(code ?? 1));
    });
    if (status !== 0) process.exit(status);
  }
}
