# DEX E2E Harness

This folder is a small PocketIC runtime harness for the verified DEX demo. It
borrows the practical parts of the DVF test layout: deterministic identities,
one shared fixture module, real ICRC ledger deployment, explicit caller
switching, and small helpers for common Candid result variants.
The generic runtime helpers also expose DVF-style time and block control:
`runtime.passTime(n)`, `advanceSeconds`, `block`, lower-level `runtime.time.*`
methods, and canister `stop`/`start` wrappers.
ICRC-1 account helpers normalize `{ owner; subaccount }`, derive 32-byte
subaccounts from numeric ids, and convert accounts/subaccounts to stable text.
The ICRC ledger fixture also has its own harness for deployment, minting,
transfers, approvals, allowances, fees, supply, and balance assertions.

Run it from this folder:

```bash
bun install
bun run typecheck
bun run test
```

The tests deploy checked-in runtime fixtures for the DEX and ICRC ledger, so
they do not need the SR9 monorepo test runner, compiler cache, or package
layout.

Regenerate runtime actor fixtures as a separate step after actor or library
changes. Pass the SR9 command explicitly:

```bash
SECTOR9_BIN=../sr9 bun run build:actors
bun run test
```

`bun run typecheck` uses the local `tsconfig.json`, `typescript`, and Bun types,
which is also what VS Code should pick up for files under this folder. `bun run
test` intentionally does not compile. It runs the quiet e2e runner, which
executes matching specs in parallel, captures each spec's stdout/stderr into
report logs, writes JUnit internally, and prints only a final summary.
`bun run test:raw` runs Bun directly when you need interactive test output.
`bun run build:actors` builds every actor listed in `config.json`. `bun run
build:dex` only rebuilds the DEX actor.
Generated actor fixtures are kept outside the generic harness:

```text
fixtures/actors/dex/DexActorDemo.wasm
fixtures/actors/dex/DexActorDemo.did
fixtures/actors/dex/DexActorDemo.idl.js
```

The build step needs Bun, `didc`, and an SR9 command. `build:dex` requires
`SECTOR9_BIN` or `SR9_BIN`; it does not guess a wrapper path or assume a local
compiler binary. For the Docker workflow from the Sector9 skill, create the
project-local wrapper script in your repo root (`./sr9` or your own `./sr9.sh`)
and pass it explicitly:

```bash
SECTOR9_BIN=../sr9 bun run build:actors
# or
SECTOR9_BIN=../sr9.sh bun run build:actors
```

The harness intentionally does not construct `docker run`. The wrapper owns
Docker, mount, user, and cache behavior. `build:dex` runs SR9 from
`config.json`'s `workspaceRoot`, so a wrapper that mounts `$PWD:/work` sees the
same relative source and output paths. Set `DIDC_BIN` or package env vars such
as `CORE_PACKAGE_PATH` when your environment needs it.

Actor-specific build settings live in `config.json`: source path, optional
fixture directory, output basename, cycles, compiler flags, and package roots.
By default, actor fixtures go to `fixtures/actors/<actor-key>/`. Actor-specific
deploy helpers should live beside that actor's generated WASM and DID files.
Scenario setup belongs in specs or shared test helpers under `common/`; the
files under `harness/` should not need project edits.

Runtime reports are written under `reports/runs/<timestamp>/` and stable latest
copies are kept at `reports/latest-test-results.md` and
`reports/latest-bench-summary.md`. The benchmark report is built from
`SR9P` canister log lines emitted by `mo:core/Profiling`; it aggregates
matching `:start`/`:end` marks by average and total cost, then compares the
current run to the newest previous timestamped run. Use `E2E_JOBS=<n>` to tune
parallel spec execution and `E2E_REPORT_DIR=<path>` to move report output.

Test setup should generally create a runtime with named identities:

```ts
const runtime = await createTestRuntime({
  identities: ["controller", "alice", "bob"] as const,
});

await runtime.callAs(actor, runtime.identities.alice, async (asAlice) => {
  return asAlice.some_update();
});

await runtime.passTime(5);
await runtime.block(2);
await runtime.withStoppedCanister(ledgerId, async () => {
  await runtime.advanceSeconds(30, { ticks: 3 });
});

const account = runtime.account("alice", runtime.subaccount(42n));
const text = runtime.accountText(account);
```

Ledger fixture helpers live beside the ICRC ledger artifact:

```ts
const ledger = await deployIcrcLedger(runtime.pic, {
  controller: runtime.identities.controller,
  symbol: "TKA",
  mintingAccount: runtime.account("controller", runtime.subaccount(99n)),
});

await mint(ledger, runtime.account("alice"), 1_000_000n, {
  minter: runtime.identities.controller,
});
await transfer(ledger, runtime.identities.alice, runtime.account("bob"), 50_000n);
await approve(ledger, runtime.identities.bob, spenderCanisterId, 25_000n);
await expectBalance(ledger, runtime.account("bob"), 50_000n);
```

To reuse this shape in another project:

1. Keep runtime specs under `spec/`.
2. Replace `common/picRuntime.ts` if the project has a different PocketIC
   dependency or server lifecycle.
3. Keep `common/runtime.ts` generic: identities, accounts, time, and result
   unwrapping.
4. Put app-specific actor deployment beside that actor under
   `fixtures/actors/<actor-key>/`.
5. Keep actual `*.pic.ts` tests short and scenario-focused.
6. Use real ledger calls for deposits, withdrawals, approvals, and balance
   assertions whenever the runtime behavior depends on ledger semantics.
