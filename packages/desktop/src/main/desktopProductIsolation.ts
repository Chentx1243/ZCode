import { join } from "node:path";

/** DexCode 使用自己的应用根，必须在业务路径模块首次读取环境之前应用。 */
export function createDexCodeIsolationEnv(appDataPath: string): Record<string, string> {
  const root = join(appDataPath, "DexCode");
  const home = join(root, "home");
  return {
    ZCODE_DESKTOP_APPLICATION_NAME: "DexCode",
    ZCODE_DESKTOP_HOME_DIR: home,
    ZCODE_DATA_BASE_DIR: home,
    ZCODE_HOME: join(home, ".zcode"),
    ZCODE_DESKTOP_USER_DATA_DIR: root,
    ZCODE_DESKTOP_SESSION_DATA_DIR: join(root, "session"),
    ZCODE_CUA_HELPER_INSTALL_VARIANT: "dexcode",
  };
}
