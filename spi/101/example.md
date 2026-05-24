# SPI-101 Wallet Response Example

Example `spi_101_wallet` response with several holding types:

```motoko
import Blob "mo:core/Blob";

// Local node payload format used in this example:
// [local node class, local id]

#ok({
  account = spi100Account;
  entries = [
    {
      // SPI101.externalLedgerNode(ckBTCLedger)
      node = #ledger(ckBTCLedger);
      holding = #fungible({ amount = 250_000; meta = () });
      status = #available;
      displayAsset = null;
      displayLabel = ?"ckBTC";
    },
    {
      // SPI101.localNode(Blob.fromArray([1, 0]))
      node = #local(Blob.fromArray([1, 0]));
      holding = #fungible({ amount = 10_500; meta = () });
      status = #available;
      displayAsset = null;
      displayLabel = ?"ckBTC/ICP LP shares";
    },
    {
      // SPI101.localNode(Blob.fromArray([2, 0]))
      node = #local(Blob.fromArray([2, 0]));
      holding = #nonfungible({ id = 42; meta = () });
      status = #available;
      // SPI101.externalLedgerNode(govTokenLedger)
      displayAsset = ?#ledger(govTokenLedger);
      displayLabel = ?"Active governance stake";
    },
    {
      // SPI101.localNode(Blob.fromArray([3, 0]))
      node = #local(Blob.fromArray([3, 0]));
      holding = #nonfungible({ id = 77; meta = () });
      status = #locked({ unlockAt = ?1_781_000_000_000_000_000 });
      // SPI101.externalLedgerNode(govTokenLedger)
      displayAsset = ?#ledger(govTokenLedger);
      displayLabel = ?"Pending unstake";
    },
    {
      // SPI101.localNode(Blob.fromArray([4, 1]))
      node = #local(Blob.fromArray([4, 1]));
      holding = #nonfungible({ id = 9; meta = () });
      status = #available;
      // SPI101.externalLedgerNode(usdcLedger)
      displayAsset = ?#ledger(usdcLedger);
      displayLabel = ?"USDC debt";
    }
  ];
  nextCursor = null;
  witness = null;
})
```

Important split:

- `account` is always `SPI100.Account`.
- External token balances use `externalLedgerNode(ledger)`.
- LP shares, stake, pending unstake, debt, collateral, and similar protocol
  holdings use `localNode(payload)`. In this example the payload is
  exactly `[local node class, local id]`.
- `holding` carries the fungible amount or nonfungible id. Base SPI-101 uses
  `meta = ()`; typed metadata belongs in protocol-specific profiles.
- `displayAsset = null` means the node itself is what clients should display.
- `displayAsset = ?someNode` is only for holdings like stake, debt, collateral,
  or other positions whose node differs from the underlying display asset.
