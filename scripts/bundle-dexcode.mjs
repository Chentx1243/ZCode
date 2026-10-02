import { resolve } from "node:path";
import { runCommand } from "./spawn-command.mjs";

// 产品身份与后端环境分开；此入口只产出 DexCode，不修改官方打包默认值。
const root = resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
// 通用 bundle 的后置参数可覆盖前置值；独立发行入口必须在启动构建前拒绝冲突平台。
for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  const key = arg.split("=", 1)[0];
  if (!["--os", "-o", "--arch", "-a"].includes(key)) continue;
  const value = arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : args[++index];
  const expected = key === "--os" || key === "-o" ? "win" : "x64";
  if (value !== expected)
    throw new Error(`DexCode requires ${key} ${expected}; received ${value ?? "no value"}`);
}
runCommand(
  process.execPath,
  [resolve(root, "packages/desktop/scripts/bundle.mjs"), "--os", "win", "--arch", "x64", ...args],
  {
    cwd: root,
    env: {
      ...process.env,
      ZCODE_ENV: "production",
      ZCODE_DEXCODE_IDENTITY: "1",
      ZCODE_PREVIEW_IDENTITY: "0",
      ZCODE_SKIP_REMOTE_ASSETS: "1",
      ZCODE_DESKTOP_DIST_DIR: "dist-dexcode",
    },
  },
);
