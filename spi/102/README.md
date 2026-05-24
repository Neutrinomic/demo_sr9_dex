# SPI-102: Discover, Quote, Execute

SPI-102 drafts a generic DeFi transition surface:

1. `discover` returns a graph of possible protocol transitions.
2. `quote` selects one transition and returns a structured reusable preview.
3. `execute` uses the quote plus caller acceptance limits and applies the
   transition if it is still valid.

This folder contains the mathematical model, shared types, a small static
kernel, verified DEX/DAO examples, and client harness coverage. Multi-edge
routes can be a later profile; base SPI-102 is single-edge, local, atomic, and
await-free.

See [spec.md](spec.md).

## Files

- `Types.sr9` defines the shared SPI-102 DTOs for edges, discovery entries,
  quotes, guards, receipts, position effects, and generic execution errors.
  Node identity is imported from SPI-101 as `#ledger(LedgerId)` or
  `#local(Blob)`.
- `Kernel.sr9` defines the behavioral predicates, shared quote/execute checks,
  and proof lemmas that protocol actors can call before committing local state.
  Successful execute receipts are proved guard-accepted through
  `receiptAccepted`, with lemmas for min receive, max spend, max fee, and
  deadline consequences.
- `examples/` contains verified DEX and DAO actors using `SPI100.Account`,
  SPI-101 wallet holdings, SPI-102 discover/quote/execute transitions, and
  SPI-103 ICRC deposit/withdraw.
- `spec.md` is the narrative/math draft.
- `experience.md` records what we learned from the removed alternatives and
  current kernel/example probes.
- `notes.md` records verifier limitations found during hardening so the kernel
  stays conceptually clean.

Targeted verification commands:

```bash
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi reference/dex/spi --verify reference/dex/spi/102/Types.sr9
XDG_CACHE_HOME=/tmp/sector9 ./bin/sector9 --package core ./core/src --package spi reference/dex/spi --verify reference/dex/spi/102/Kernel.sr9
```

Runtime client test commands from `reference/dex`:

```bash
SECTOR9_BIN=/srv/shared/code/sr9/viperwork/bin/sector9 CORE_PACKAGE_PATH=/srv/shared/code/sr9/viperwork/core/src bun run build:spi102
bun run test:spi102
```

The example actors, generated fixtures, and PIC tests now use the current
100/101/102/103 split: SPI-100 account blobs, SPI-101 wallet holdings,
SPI-102 local transitions, and SPI-103 ICRC deposit/withdraw.
