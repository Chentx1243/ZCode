import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const hostOutputDirectory = fileURLToPath(new URL("../out/host/", import.meta.url));
const unresolvedStorageStartupImport =
  /(?:\bfrom\s*|\bimport\s*\()\s*["']@zcode\/services\/storage-startup["']/u;

async function listReachableHostJavaScriptFiles(entryNames) {
  const hostDirectoryPath = hostOutputDirectory;
  const pending = entryNames.map((entryName) => join(hostDirectoryPath, entryName));
  const visited = new Set();
  const importSpecifier = /(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)(["'])([^"']+)\1/gu;

  while (pending.length > 0) {
    const file = pending.pop();
    if (!file || visited.has(file)) continue;
    visited.add(file);

    const contents = await readFile(file, "utf8");
    for (const match of contents.matchAll(importSpecifier)) {
      const specifier = match[2];
      if (!specifier?.startsWith(".")) continue;
      const resolved = fileURLToPath(new URL(specifier, pathToFileURL(file)));
      const pathFromHostRoot = relative(hostDirectoryPath, resolved);
      if (
        pathFromHostRoot !== ".." &&
        !pathFromHostRoot.startsWith(`..${sep}`) &&
        !visited.has(resolved)
      ) {
        pending.push(resolved);
      }
    }
  }

  return [...visited];
}

test("Desktop Host bundles the services storage-startup workspace subpath", async () => {
  const files = await listReachableHostJavaScriptFiles(["index.js", "tasksStorageWorker.js"]);
  assert.ok(files.length > 0, "Build the Desktop Host before running this bundle test");

  const externalImports = [];
  for (const file of files) {
    const contents = await readFile(file, "utf8");
    if (unresolvedStorageStartupImport.test(contents)) externalImports.push(file);
  }

  assert.deepEqual(
    externalImports,
    [],
    "Host runtime must not load the workspace TypeScript export directly",
  );
});
