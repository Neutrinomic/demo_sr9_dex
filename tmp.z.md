# NodeId Meaning

`Account` is the SPI-100 account blob. It identifies a user/local account that a
controller can operate.

`NodeId` is different. It is a protocol state key:

```motoko
public type NodeId = Blob;
```

The important rule is that SPI-100 accounts are only accounts. They are not pool
ids, LP share ids, stake ids, pending-unstake ids, lending vault ids, or asset
ids.

## Why `NodeId = Blob`

Protocols need more node shapes than accounts:

- external token ledger balance
- LP share balance
- active stake bucket
- pending unstake bucket
- lending collateral bucket
- debt bucket
- proposal bond state
- derived capacity such as voting power or borrow limit

A blob lets each protocol encode the exact identity it needs without pretending
that every node is a principal or an SPI-100 account.

## Reference Node Constructors

SPI-101 currently gives three reference constructors:

```motoko
externalLedgerNode(ledger : Principal) : NodeId
accountNode(account : SPI100.Account) : NodeId
protocolNode(protocol : Principal, localPayload : Blob) : NodeId
```

`externalLedgerNode` is for balances backed by an external ledger canister.

`accountNode` is for rare cases where the account itself is the state key. Most
balances should not use this. The top-level wallet/discovery/quote already says
which account is being viewed or operated.

`protocolNode` is the normal path for protocol-local state. The payload can
encode pool id, position class, position id, maturity bucket, share class, debt
market, or any other local key.

## DEX Use

For a DEX:

```text
token A balance      -> externalLedgerNode(tokenALedger)
token B balance      -> externalLedgerNode(tokenBLedger)
LP share balance     -> protocolNode(dexCanister, encodePoolShare(poolId))
swap edge            -> token A node <-> token B node
add liquidity edge   -> {token A, token B} -> LP share node
remove liquidity     -> LP share node -> {token A, token B}
```

The LP share node is not an account. It is protocol-local inventory held by an
account.

## DAO Use

For a DAO:

```text
liquid governance token  -> externalLedgerNode(govTokenLedger)
active stake             -> protocolNode(daoCanister, encodeStakeClass(...))
pending unstake          -> protocolNode(daoCanister, encodePendingUnstake(...))
proposal bond            -> protocolNode(daoCanister, encodeProposalBond(...))
voting power             -> protocolNode(daoCanister, encodeDerivedVotingPower(...))
```

A delayed unstake is an intermediate node:

```text
active stake -> pending unstake
```

If cancellation is allowed, cancellation is another executable transition:

```text
pending unstake -> active stake
```

After maturity, claim is another transition:

```text
pending unstake -> liquid governance token
```

## Client Rule

Clients should treat `NodeId` as opaque identity and read display/shape metadata
from SPI-101 wallet entries or SPI-102 discovery nodes. A client should not need
to reverse-engineer every protocol-local blob to safely quote and execute.

Protocols may publish decoding conventions for their own `protocolNode`
payloads, but the base SPI surface should only require stable equality and
metadata.
