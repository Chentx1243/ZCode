import { resolve } from "node:path";
import { runCommand } from "./spawn-command.mjs";

// 产品身份与后端环境分开；此入口只产出 DexCode，不修改官方打包默认值。
const root = resolve(import.meta.dirname, "..");
runCommand(
  process.execPath,
  [
    resolve(root, "packages/desktop/scripts/bundle.mjs"),
    "--os",
    "win",
    "--arch",
    "x64",
    ...process.argv.slice(2),
  ],
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
