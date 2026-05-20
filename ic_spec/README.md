# Local IC Spec References

This folder contains local copies of the official Internet Computer docs that
matter for protocol interfaces using inter-canister calls.

Source:

- Repository: https://github.com/dfinity/portal
- Commit: `fe646b2990d25d0f00714d50d9df283dac5d2e91`
- Downloaded on: 2026-05-20

The old `dfinity/interface-spec` repository now points to `dfinity/portal` for
the current Interface Specification.

## Included Files

| Local file | Why it is here |
| --- | --- |
| `portal/docs/references/ic-interface-spec.md` | Formal Interface Spec, abstract behavior, call contexts, ordering, System API calls, bounded-wait expiration, callback behavior. |
| `portal/docs/references/async-code.mdx` | Developer-facing explanation of unbounded-wait guaranteed-response calls and bounded-wait best-effort calls. |
| `portal/docs/references/message-execution-properties.mdx` | Message execution properties, await/callback commit points, single-response property, bounded-wait unknown responses. |
| `portal/docs/building-apps/security/inter-canister-calls.mdx` | Security guidance for async inter-canister calls, reentrancy, and when call results are uncertain. |
| `portal/docs/building-apps/best-practices/idempotency.mdx` | Safe retry/idempotency guidance for ingress and bounded-wait inter-canister calls. |
| `portal/docs/building-apps/canister-management/trapping.mdx` | Trap rollback behavior, especially around callbacks after inter-canister calls. |
| `portal/docs/building-apps/developer-tools/cdks/rust/intercanister.mdx` | Concrete CDK-level explanation of unbounded-wait and bounded-wait error semantics. |
| `portal/docs/defi/token-ledgers/usage/icrc1_ledger_usage.mdx` | ICRC ledger usage guidance, including bounded-wait examples and deduplication. |
| `portal/docs/references/_attachments/requests.cddl` | Request/response CDDL referenced by the Interface Spec. |
| `portal/docs/references/_attachments/ic.did` | Management canister Candid referenced by the Interface Spec. |
| `portal/docs/references/_attachments/certificates.cddl` | Certificate CDDL referenced by the Interface Spec. |
| `portal/docs/references/_attachments/interface-spec-changelog.md` | Interface Spec changelog. |
| `icrc/` | Local snapshot of the official ICRC-1, ICRC-2, and ICRC-3 ledger standards from `dfinity/ICRC-1`. |

## Working Conclusions

For normal Motoko actor calls to ledgers, we should model unbounded-wait
inter-canister calls unless we explicitly choose a bounded-wait API. The
unbounded-wait path is the guaranteed-response path: the caller eventually gets
one response, and if the callee produces a response, that exact response is
delivered.

Bounded-wait calls are different. They can return `SYS_UNKNOWN`; after that the
caller may not know whether the callee processed the request. Retry and
idempotency are required for state-changing bounded-wait calls.

For SPI-101 this means:

- base deposit should not have a retry variant;
- base deposit should credit local balance only after `icrc2_transfer_from`
  returns `#Ok`;
- base withdraw should not have a retry variant;
- base withdraw can debit before `await` for reentrancy safety, then finalize
  or restore that debit from the guaranteed-response ledger result;
- bounded-wait ledger calls, if we add them later, should be a separate SPI
  extension with explicit idempotency/reconciliation rules.
