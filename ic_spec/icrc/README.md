# Local ICRC Ledger Standard References

This folder contains local copies of the official Ledger & Tokenization Working
Group standards used by SPI-101 and the protocol blueprints.

Source:

- Repository: https://github.com/dfinity/ICRC-1
- Commit: `5d670e54d9a58fbf472bf0a25f33743d60cfd0e6`
- Downloaded on: 2026-05-20

## Included Standards

| Local file | Standard |
| --- | --- |
| `standards/ICRC-1/README.md` | ICRC-1 base fungible token standard. |
| `standards/ICRC-1/ICRC-1.did` | ICRC-1 Candid interface. |
| `standards/ICRC-1/TextualEncoding.md` | ICRC-1 textual account encoding. |
| `standards/ICRC-1/ADVISORY.md` | ICRC-1 security advisory notes. |
| `standards/ICRC-2/README.md` | ICRC-2 approve and transfer-from extension. |
| `standards/ICRC-2/ICRC-2.did` | ICRC-2 Candid interface. |
| `standards/ICRC-2/ADVISORY.md` | ICRC-2 security advisory notes. |
| `standards/ICRC-3/README.md` | ICRC-3 block log standard. |
| `standards/ICRC-3/ICRC-3.did` | ICRC-3 Candid interface. |
| `standards/ICRC-3/HASHINGVALUES.md` | ICRC-3 hashing value rules. |
| `README.upstream.md` | Upstream repository README snapshot. |

SPI-101 currently depends directly on ICRC-1 account/transfer semantics and
ICRC-2 transfer-from semantics. ICRC-3 is included because it is the standard
place to reason about block logs and operation history when a future extension
needs stronger client-side reconciliation.
