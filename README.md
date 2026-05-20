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

Because these blueprints are meant to be used for inspiration or customization,
we do not provide an upgrade path for downstream forks when the examples
change. Once you build on one, you own the protocol decisions, modifications,
deployment process, and future migrations.

The current tree is organized around protocol families:

- `standard_icrc/` contains protocols that integrate with standard ICRC ledgers.
  They use the deposit, withdraw, and local-balance flow so async ledger calls
  stay at the boundary while protocol logic runs against local state.
- `hmt/` is a placeholder for protocols that will use HMT, the Hash Module
  Tokens inter-canister asset system. More examples will be added there soon.
- `spi/` contains SR9 Protocol Interface modules and notes. It is wired as an
  SR9 package so projects can import shared interfaces and helpers with paths
  like `mo:spi/100/VirtualPrincipal`.
- `shared/` contains reusable PocketIC and TypeScript test harness code for the
  projects in this repository.

Current projects include `standard_icrc/dex`, a verified constant-product DEX
blueprint with local balances, ICRC deposits and withdrawals, LP-share virtual
ledgers, controller-managed ledger/pool lifecycle, runtime tests, and benchmark
reports, and `standard_icrc/dao`, a governance-token DAO blueprint using the
same standard-ledger boundary style.

## Runtime Testing

The repository uses a shared PocketIC harness for black-box runtime tests. The
tests are meant to complement SR9 verification: they exercise deployed Wasm,
real ICRC ledger calls, multiple identities, time movement, stopped ledgers,
duplicate/memo edge cases, and adversarial user flows.

Current project coverage:

| Project | Command | Latest local result | Main runtime coverage |
| --- | --- | ---: | --- |
| `standard_icrc/dex` | `bun run test:dex` | 28 suites / 61 tests | admin gates, ledger allowlist and retirement, deposits, withdrawals, swaps, slippage, fee distribution, LP shares, pool removal, dust cleanup, stopped-ledger recovery, randomized actions, and theft-style negative cases |
| `standard_icrc/dex` slow stress | `bun run test:slow` | separate slow gate | 20 ledgers, 50 pools, 5000 users, and 20000 mixed actions |
| `standard_icrc/dao` | `bun run test:dao` | 12 suites / 50 tests | deposit and withdrawal security, staking locks, proposal lifecycle, double-vote guards, quorum/participation, config-version stale settlement, threshold and supply-boundary edge cases, direct-transfer surplus probes, multi-identity voting/bond/accounting scenarios, views, and scenario-model accounting |
| `standard_icrc/dao` slow stress | `bun run test:dao:slow` | separate slow gate | 1000 users, up to 32 lifetime proposals, staking, unstaking, claims, withdrawals, deposits, and sampled account/totals checks |

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
