# SPI-101: Wallet

SPI-101 standardizes the local wallet view exposed by protocol canisters.

It does not move external tokens. Deposits, withdrawals, ledger fees, and
cross-canister ledger calls belong to bridge profiles such as SPI-103. SPI-101
only says how a client asks, "what does this account currently hold locally?"

## Account Boundary

Every field named `account` is typed directly as `SPI100.Account`, the compact
blob from SPI-100 that decodes to:

```text
wallet : Principal
id     : Nat
```

The account blob identifies the local account whose holdings are queried,
quoted, or executed against.

The account blob is not authority by itself. Implementations must use their own
registration or controller policy to decide whether the authenticated `caller`
can inspect the account. SPI-100 proves account id canonicality and
no-collision, but it does not prove ownership.

SPI-100 account blobs are used only for user/protocol accounts. They are not
used to mint identities for pools, LP shares, vault shares, stake classes,
pending-unstake tickets, or other protocol objects. Those objects are nodes.

## Interface

The importable SR9 type module is:

```motoko
import SPI101 "mo:spi/101/Wallet";
```

The actor type has exactly this method:

```motoko
public type Actor = actor {
  spi_101_wallet : shared query (request : WalletRequest) ->
    async Result<WalletReceipt, WalletError>
};
```

`spi_101_wallet` is account-authorized. Rich wallet entries can expose stake,
locks, maturity, debt, collateral, or strategy state, so implementations return
`#accountNotAuthorized` when the caller does not control the requested account.

## Shared Types

```motoko
public type Result<Ok, Err> = { #ok : Ok; #err : Err };
public type LedgerId = Principal;
public type CanisterId = Principal;
public type NodeId = {
  #ledger : LedgerId;
  #local : Blob
};
public type ScopedId = {
  scope : CanisterId;
  namespace : Text;
  id : Nat
};
```

`LedgerId` is the principal of a supported external ledger canister. SPI-101
does not say which ledger standard is used to move tokens; it only reserves
`#ledger(ledger)` as the wallet node for local holdings backed by that ledger.

`CanisterId` is the principal of the canister that defines a scoped id, such as
an SPI-102 edge id. It is not a ledger unless the field is explicitly named
`ledger`.

## Node Boundary

Nodes are not SPI-100 accounts.

Pools, LP shares, vault shares, stake classes, pending-unstake tickets, debt
classes, collateral classes, and derived protocol capacities are all modeled as
nodes. A node has one of these forms:

```text
#ledger(ledgerPrincipal)
#local(localPayload)
```

`#ledger` is reserved for local wallet holdings backed by an external ledger.
`#local` is for everything defined inside the implementing canister. The
canister owns the payload format. For example, a DEX can use
`Blob.fromArray([1, 0])` to mean `[lpShareClass, pool0]`, while a DAO can use
`Blob.fromArray([3, 0])` to mean `[pendingUnstakeClass, class0]`.

The reference type module exposes helper constructors:

```motoko
externalLedgerNode(ledger : LedgerId) : NodeId
localNode(payload : Blob) : NodeId
```

Implementations may define richer node payloads, but they must keep node ids
stable once clients, quotes, receipts, or wallet entries can reference them.

Examples:

```text
ICRC token balance    externalLedgerNode(tokenLedger)
DEX LP share          localNode(pool/share payload)
DAO active stake      localNode(active-stake payload)
DAO pending unstake   localNode(pending ticket payload)
Lending debt          localNode(market/debt payload)
```

## Wallet Entry Types

```motoko
public type NodeForm = {
  #fungible;
  #nonfungible
};

public type NoMetadata = ();

public type WalletHolding = {
  #fungible : { amount : Nat; meta : NoMetadata };
  #nonfungible : { id : Nat; meta : NoMetadata }
};

public type HoldingStatus = {
  #available;
  #locked : { unlockAt : ?Int };
  #pending : { unlockAt : ?Int }
};

public type WalletEntry = {
  node : NodeId;
  holding : WalletHolding;
  status : HoldingStatus;
  displayAsset : ?NodeId;
  displayLabel : ?Text
};
```

`displayAsset` is also a node id, but it should not duplicate `node`. `null`
means the node itself is the display asset. Protocol positions can set
`displayAsset` when the holding node differs from the underlying asset clients
should show, such as a stake position displayed as the governance token node.

Timing belongs inside `status`, not in a separate wallet-entry field. For
example, a locked pending unstake should use
`status = #locked({ unlockAt = ?unlockTime })`.

The quantity or concrete nonfungible identity belongs inside `holding`.
Fungible holdings use `holding = #fungible({ amount; meta = () })`. Active stake
positions, unlocking/pending-unstake positions, NFTs, debt tickets, and similar
concrete items use `holding = #nonfungible({ id; meta = () })`. The `status`
says whether that concrete item is available, locked, or pending.

Protocols that need typed metadata can instantiate
`Holdings.Holding<FungibleMeta, NonfungibleMeta>` from the optional
`mo:spi/101/Holdings` profile module in their own extension/profile types.

## Wallet Types

```motoko
public type WalletRequest = {
  account : SPI100.Account;
  cursor : ?Nat;
  limit : ?Nat;
  filter : ?Text
};

public type WalletReceipt = {
  account : SPI100.Account;
  entries : [WalletEntry];
  nextCursor : ?Nat;
  witness : ?Text
};

public type WalletError = {
  #accountNotAuthorized : { caller : Principal; account : SPI100.Account }
};
```

The response contains all nonzero durable local holdings visible through
SPI-101. Fungible holdings should appear at most once per node and should have a
nonzero `amount` inside `holding`. Nonfungible holdings should appear at most
once per node plus the `id` embedded in `holding`.

## Wallet Semantics

`spi_101_wallet` returns the current local wallet for `request.account`.

Required behavior:

- The call is read-only.
- If `caller` does not control `request.account`, return
  `#accountNotAuthorized { caller; account = request.account }`.
- On success, the response account equals the requested account.
- Entries contain all nonzero durable SPI-101 local holdings visible to the
  account.
- External-ledger-backed token holdings use the ledger node, such as
  `externalLedgerNode(ledgerPrincipal)`.
- Local assets, such as LP shares, vault shares, and staking positions, use
  local nodes. They must not be SPI-100 accounts.

Example:

```motoko
[
  {
    // externalLedgerNode(tokenA)
    node = #ledger(tokenA);
    holding = #fungible({ amount = 1_000_000; meta = () });
    status = #available;
    displayAsset = null;
    displayLabel = ?"Token A";
  },
  {
    // localNode(Blob.fromArray([1, 0])) where [1, 0] = [lpShareClass, pool0]
    node = #local(Blob.fromArray([1, 0]));
    holding = #fungible({ amount = 22_500; meta = () });
    status = #available;
    displayAsset = null;
    displayLabel = ?"Pool 0 LP";
  },
  {
    // localNode(Blob.fromArray([3, 0])) where [3, 0] = [pendingUnstakeClass, class0]
    node = #local(Blob.fromArray([3, 0]));
    holding = #nonfungible({ id = 8; meta = () });
    status = #locked({ unlockAt = ?unlockTime });
    displayAsset = ?#ledger(governanceToken);
    displayLabel = ?"Pending unstake";
  }
]
```

## Relationship To SPI-103

SPI-103 can define ledger-specific bridge methods that mutate the wallet
holdings reported by SPI-101. For ICRC ledgers, a successful
`spi_103_icrc_deposit` credits the `#ledger(request.ledger)` node, and a
successful `spi_103_icrc_withdraw` debits that same node by `amount + fee`.

This split keeps the wallet model reusable for local protocol holdings,
HMT-backed assets, ICRC-backed assets, and future bridge profiles.

## Verification Targets

Implementations claiming SPI-101 should prove these boundaries:

- wallet results are account-authorized;
- wallet receipts bind to the requested account;
- wallet results contain no duplicate fungible nodes;
- wallet results contain no duplicate nonfungible entries;
- fungible wallet entries have nonzero amounts;
- wallet entries accurately describe status/unlock facts;
- external-ledger-backed balances use `#ledger(ledger)`;
- local protocol positions use `#local(payload)` and are not SPI-100 accounts.
