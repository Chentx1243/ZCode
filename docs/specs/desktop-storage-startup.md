# Desktop storage startup bundle boundary

## Product behavior

The Desktop Host must start its storage preparation coordinator and publish its first startup state before the renderer waits for local data preparation. The coordinator owns preparation status; Main relays Host states and only synthesizes `transport_closed` when the Host exits before a terminal state. Storage migrations remain owned by `@zcode/services` and run with their existing locking and retry semantics.

## Runtime and bundle boundary

- The Desktop Host runs as an Electron utility process and has no TypeScript loader.
- Workspace package source exports may point to TypeScript files and package `imports` aliases. Any services subpath imported by a Desktop Host entry must therefore be explicitly bundled into the Host output.
- The storage startup entrypoints (`prepareTasksIndexStorage`, `markTasksStoragePrepared`, `getTasksIndexDatabasePath`, `resolveDefaultZCodeAgentCommand`, and `resolveZCodeAgentSpawnCwd`) continue to use the existing services implementation. The fix changes only the Desktop bundle boundary.
- Do not change database schemas, migration order, SQLite locking, retry behavior, or user data paths as part of this fix.

## Failure semantics

If a storage service subpath is left external, Node may resolve it to a workspace `.ts` export and fail while resolving its emitted `.js` alias target. That import failure terminates the Host before the coordinator publishes a state, so Main reports `transport_closed` with an empty disk sample. Bundling the subpath must allow the coordinator to publish a concrete preparation phase; a genuine later Host exit still uses the existing relay behavior.

## Acceptance scenarios

1. The built Host JavaScript contains no bare runtime import of `@zcode/services/storage-startup`.
2. A Desktop development launch receives the Host's first database startup state and does not immediately synthesize `transport_closed` from a Host exit.
3. A storage preparation error after the coordinator starts remains a concrete, classified startup failure, and a user retry uses the existing coordinator retry path.
4. Existing migration ordering, locking, persisted migration records, and user data are unchanged.
