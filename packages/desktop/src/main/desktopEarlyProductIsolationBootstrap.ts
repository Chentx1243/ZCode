import { app } from "electron";
import { mkdir } from "node:fs/promises";
import { createDexCodeIsolationEnv } from "./desktopProductIsolation.js";

declare const __ZCODE_PRODUCT_FLAVOR__: string;

// 不能等 app ready 后才隔离：设置、日志和路径模块会在导入时捕获 HOME/dataBaseDir。
if (typeof __ZCODE_PRODUCT_FLAVOR__ !== "undefined" && __ZCODE_PRODUCT_FLAVOR__ === "dexcode") {
  Object.assign(process.env, createDexCodeIsolationEnv(app.getPath("appData")));
  await mkdir(process.env.ZCODE_DESKTOP_HOME_DIR!, { recursive: true });
  await mkdir(process.env.ZCODE_DESKTOP_SESSION_DATA_DIR!, { recursive: true });
}

// 动态导入使 Service 的静态模块初始化也严格晚于隔离环境建立。
await import("./index.js");
