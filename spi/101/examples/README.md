# SPI-101 Examples

These examples show how to use `subject` with SPI-101.

## `SPI101TwoLedgerMapDemo.sr9`

A realistic shape example for SPI-101:

- it supports multiple subjects/users;
- it keeps one `BMap<Principal, Nat>` per supported ledger;
- the map key is the SPI-101 `subject`;
- it supports direct subjects and SPI-100 delegated subjects;
- `spi_101_balance` returns the nonzero ledger balances for one subject.

The example simulates successful ledger calls so the local state pattern is easy to
verify. A production actor would replace the local success simulation with real
ICRC `transfer_from` and `transfer` calls.

## `SPI101DexPoolSubjectDemo.sr9`

A DEX-shaped example:

- two deposited token ledgers;
- one virtual SPI-100 pool-share balance key;
- all balances keyed by `subject`;
- `add_liquidity` consumes the subject's token balances and credits pool shares;
- `remove_liquidity` burns pool shares and returns token balances locally.

The AMM math is intentionally tiny. This example is about state shape and
subject authorization, not pricing.

## `SPI101DaoSubjectDemo.sr9`

A DAO-shaped example:

- liquid governance tokens are keyed by `subject`;
- active stake is keyed by the same `subject`;
- vote-locked stake is keyed by the same `subject`;
- staking, vote locks, unlocks, and unstaking all authorize the same subject.

This is the important adaptation rule for DAO protocols: if SPI-101 accepts
delegated subjects, every governance state map must use the subject consistently.

## `SubjectBalanceBook.sr9`

A reusable flat-map balance book pattern. It stores balances under a structured
record key `(subject, asset)` instead of text concatenation. This is useful when
a protocol wants one map for many subjects and many asset keys.

## `SPI101LocalOnlyDemo.sr9`

A smaller actor that exposes the three SPI-101 method names:

- `spi_101_deposit`
- `spi_101_withdraw`
- `spi_101_balance`

It demonstrates subject authorization with SPI-100 and local balance updates.
It intentionally does not call a real ICRC ledger, so it is not a production
deposit or withdrawal implementation.
