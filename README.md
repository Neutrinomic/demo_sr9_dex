# SR9 Protocol Foundation Blueprints

This repository collects SR9 protocol foundation blueprints: working protocol
shapes that are meant to be studied, forked, customized, and built on for your
own projects.

They are primarily here to show reusable SR9 verification patterns: how to
split protocol logic into modules, express accounting guarantees, isolate
async boundaries, write observers, and keep runtime tests next to verified
code.

They are not production-ready custody software, not audited mainnet systems,
not complete protocol standards, and not something to deploy unchanged. The
designs are intentionally foundation-level rather than perfect final protocol
designs.

Because these blueprints are meant to be customized, we do not provide an
upgrade path for downstream forks when the examples change. Once you build on
one, you own the protocol decisions, modifications, deployment process, and
future migrations.

The current tree is organized around protocol families:

- `standard_icrc/` contains protocols that integrate with standard ICRC ledgers.
  They use the deposit, withdraw, and local-balance flow so async ledger calls
  stay at the boundary while protocol logic runs against local state.
- `sr9_token/` is a placeholder for protocols that will use SR9's
  inter-canister token system. More examples will be added there soon.
- `shared/` contains reusable PocketIC and TypeScript test harness code for the
  projects in this repository.

The first project is `standard_icrc/dex`, a verified constant-product DEX demo
with local balances, ICRC deposits and withdrawals, LP-share virtual ledgers,
controller-managed ledger/pool lifecycle, runtime tests, and benchmark reports.

From the repository root:

```bash
bun install
bun run typecheck
bun run test
```

Each project owns its own test configuration and project-specific exceptions
file. The root package scripts currently default to the DEX project.
For another project, pass `E2E_CONFIG=path/to/project/test/config.json` to the
shared build or test runner.
