# SPI-102: Discover, Quote, Execute

SPI-102 is a candidate protocol interface for digital-asset protocols whose
public behavior can be exposed as three operations:

```text
discover -> return the current transition graph
quote   -> price or preview one transition
execute -> apply the quoted transition under user acceptance limits
```

The goal is not only swaps. The same model should describe a DEX pool, a DAO
stake or unstake flow, a lending market supply or borrow flow, a vault share
mint, a liquidation, a bond purchase, or a canister-local position transfer.

SPI-102 execution is local and atomic inside the implementing canister. The
`execute` method must not perform awaits. External token movement, deposits,
withdrawals, cross-canister settlement, and other async boundaries belong in
bridge profiles such as SPI-103 or in explicit pre/post settlement
flows outside the SPI-102 atomic execution step.

The base SPI-102 profile is deliberately small:

- `quote` previews exactly one edge.
- Quotes are account-bound reusable previews, not reservations.
- `execute` rechecks current state and either applies one edge or rejects.
- `discover` may include live and locked/future edges so clients can display the
  protocol state machine.
- Multi-edge local routes can be a later profile over the same graph model.
- Firm quotes or reservations are out of scope for base SPI-102.

This document starts with the math. The actor type and concrete Candid/SR9
encoding should come after the model is stable.

## Core Idea

A protocol exposes a directed typed hypergraph.

- Nodes are asset, claim, or protocol-position states.
- Edges are protocol transitions between those states.
- `discover` returns the current graph.
- `quote` selects one edge and fixes the user's intent as a reusable preview.
- `execute` applies the quoted transition if authorization, balances, state,
  and caller limits still permit it.

A plain directed graph is too weak because many DeFi transitions are not
one-input/one-output:

- adding liquidity consumes two token balances and produces one LP share balance;
- removing liquidity consumes one LP share balance and produces two token balances;
- borrowing may produce debt and liquid tokens while consuming collateral
  capacity;
- DAO staking consumes liquid governance tokens and produces a time-locked
  position.

So SPI-102 uses hyperedges: an edge can consume and produce baskets of nodes.

## Mathematical Objects

Let:

```text
S       protocol states
A       SPI-100 account blobs
N_s     nodes visible in state s
E_s     edges visible in state s
G_s     discovery graph in state s, where G_s = (N_s, E_s)
```

On the concrete SR9/Candid surface, fields named `account` are typed directly as
`SPI100.Account`. SPI-102 does not define another account alias.

Each node `n` has a quantity domain:

```text
Q_n = quantities valid for node n
0_n = empty quantity for node n
+_n = quantity combination for node n
<=_n = quantity order for node n
```

For fungible balances:

```text
Q_n = Nat
0_n = 0
+_n = Nat addition
<=_n = Nat order
```

For position-like claims, base SPI-102 uses a node class plus explicit position
ids in quote and receipt data. A pending unstake class, for example, can contain
many position ids, each with its own amount, owner, unlock time, and remaining
quantity. This supports partial consume, split, merge, and wallet display
without making the discovery graph contain one node per individual position.

A basket is a finite map from nodes to quantities:

```text
B = { n -> q_n | n in N_s, q_n in Q_n, q_n != 0_n for finitely many n }
```

Base baskets carry aggregate quantities by node. When a transition consumes,
creates, splits, merges, or leaves a remainder for a position id, that exact id
movement is recorded separately as a position effect in the quote and receipt.

Basket containment means every requested quantity is available:

```text
contains(B, X) =
  for every n in X:
    X[n] <=_n B[n]
```

Basket update is pointwise:

```text
B' = B - X + Y
```

where subtraction is defined only when `contains(B, X)`.

For an account `a`, local balances are modeled as:

```text
bal_s(a) : Basket
```

Protocol state also contains internal reserves, locks, pending operations,
configuration, prices, interest indexes, proposals, and any other data needed
to decide which edges are live.

Not every node has to be stored as a literal row in a balance book. A node can
also be derived from protocol state. For example, a DAO can expose "unlocked
active stake" and "stake locked by proposal 7" as nodes even if the
implementation stores active stake and vote locks in separate maps. The edge
law is what connects the abstract node movement to the concrete state update.

It is useful to name the full account-visible availability view:

```text
avail_s(p) = concrete balances plus derived capacities and positions
```

For protocols with only fungible local balances, `avail_s(p) = bal_s(p)`.

## Nodes

A node is a typed state that value or control can occupy.

Base SPI-102 uses a structured node id instead of assuming every node is a
`Principal`. In the SR9/Candid surface, `NodeId` is the SPI-101 structured
variant. External ledger nodes carry the ledger principal directly. Local nodes
carry a compact canister-local payload.

```text
NodeId =
  #ledger(LedgerId)
  #local(Blob)
```

SPI-100 account blobs are for accounts only. They should not be used to create
pool, LP-share, vault-share, stake-class, debt, collateral, or derived-capacity
ids. Those are nodes.

SPI-101 defines a simple reference node encoding:

```text
externalLedgerNode(ledgerPrincipal)
localNode(localPayload)
```

Implementations may define richer payload formats inside `#local`, but clients
can always distinguish ledger nodes from canister-local nodes and then rely on
`NodeShape` for display and interpretation.

Examples:

```text
ICRC token balance       #ledger(tokenLedger)
DEX LP share             #local(pool/share payload)
DAO liquid balance       #ledger(governanceLedger)
DAO stake position       #local(stake-class payload)
DAO pending unstake      #local(pending-ticket payload) plus position id/effects
Lending collateral       #local(market/collateral payload)
Lending debt             #local(debt payload)
Vault share              #local(share-class payload)
```

Nodes do not need to be externally transferable. Some are just canister-local
states that can be displayed, quoted, and consumed by later transitions.

Every node should declare at least:

```text
nodeId          stable node id
form            fungible or nonfungible
displayAsset    optional display node for clients
label           optional display label
risk            optional warning or risk classification
```

## Edges

An edge is a transition schema:

```text
e in E_s
```

Each edge has:

```text
edgeId          stable id inside the discovery graph
inputShape      basket schema the edge may consume
outputShape     basket schema the edge may produce
domain          preconditions over state, account, and user intent
quoteRule       pure rule for producing a quote
executeRule     state transition rule for execution
law             accounting or safety law claimed by the edge
```

Base SPI-102 uses a structured edge id:

```text
EdgeId = {
  scope : CanisterId;
  namespace : Text;
  id : Nat
}
```

`scope` is the canister principal that defines the edge namespace. `namespace`
names the edge family, such as `swap`, `stake`, or `claim`. `id` is the stable
edge id inside that family.

The edge is a schema, not a single transfer. The amount, recipient, deadline,
minimum output, and other user parameters live in the quote intent and execute
guard.

For a DEX with token ledgers `A` and `B`:

```text
swap A->B through pool P:
  inputShape  = { A }
  outputShape = { B }

add liquidity A/B:
  inputShape  = { A, B }
  outputShape = { LP(A,B) }

remove liquidity A/B:
  inputShape  = { LP(A,B) }
  outputShape = { A, B }
```

For a DAO:

```text
stake:
  inputShape  = { liquid GOV }
  outputShape = { locked stake position }

request unstake:
  inputShape  = { active stake position }
  outputShape = { pending unstake position }

claim unstaked:
  inputShape  = { matured pending unstake position }
  outputShape = { liquid GOV }

vote:
  inputShape  = { mature active stake capacity }
  outputShape = { vote lock / vote receipt position }
```

More formally, each edge defines a partial quote relation and a partial
execution relation:

```text
Quote_e(s, p, intent) = q
Exec_e(s, p, q, guard) = (s', r)
```

`Quote_e` is pure. `Exec_e` may mutate state only on success. The receipt `r`
must expose at least:

```text
input_r       basket or derived capacity consumed or locked
output_r      basket or position claims produced
fees_r        fees charged, reserved, or internalized
edgeId_r      edge that actually executed
```

Position effects are not hidden inside `input_r` or `output_r`. A quote or
receipt that touches positions must expose:

```text
positionInputs      position ids and amounts consumed or locked
positionOutputs     newly created or increased position ids
positionRemaining   remaining position ids and amounts after partial changes
```

## Discover

Mathematically:

```text
discover(s, account, request) = G_s'
```

where `G_s'` is a filtered view of `G_s` for `account`. The filter may depend
on requested asset families, account-visible positions, protocol version, page
cursor, or display limits.

The base request shape is intentionally not amount-specific:

```text
DiscoverRequest =
  account
  cursor?
  limit?
  filter?
```

`amount` belongs to `QuoteRequest.intent`, because amount-specific pricing and
slippage are quote concerns. The caller also must not provide `now`; the
implementing canister reads its local time and may pass that value to local
helper functions when classifying time-dependent edges.

`filter` is an optional protocol-specific discovery filter, such as market
family, asset family, or display profile. It is intentionally not quote intent
and should not carry amount or slippage data.

The account is required. Discovery status is therefore concrete for that account:
`#insufficientInput` and `#unauthorized` mean the requested account currently
lacks the required availability or authorization, not that the edge is globally
unavailable.

`discover` is read-only discovery. It is not authority. A listed edge can
disappear, become locked, or become live before execution if the protocol state
changes.

The base SPI-102 discovery response can include both executable and
non-executable edges. Each edge should report a typed status:

```text
DiscoveryStatus =
  #live
  #notMature : { unlockAt : Int }
  #insufficientInput
  #paused
  #unauthorized
  #protocolSpecific : Text
```

This lets wallets and routers display the protocol state machine. For example,
a pending unstake position can expose `claimUnstaked` as `#notMature` before
its unlock time instead of hiding the future transition.

Discovery must return both node descriptions and edge descriptions. Returning
only edges leaves clients unable to explain what an edge's input and output ids
mean. A node can represent "this account's BTC balance" by using an external
ledger node, display metadata, and the discovery request's account.

The response shape is:

```text
Discovery =
  account
  nodes       node shapes referenced by the edges
  edges       edge shapes plus typed status
  nextCursor? optional pagination cursor
  witness?    optional protocol-specific lookup hint

DiscoveryEdge =
  edge
  status
```

Mandatory discovery data should be minimal: stable ids, node and edge shapes,
and the typed status. Display metadata should remain optional but
standard-shaped:

```text
label          optional human-facing label
displayAssets  optional asset or principal pointers for wallet display
lockTiming     optional unlock, deadline, or maturity facts
risk           optional warning text or protocol-specific risk tag
```

Required discovery laws:

```text
Edge membership:
  e in E_s' -> every node used by e is in N_s'

Well-formed edge:
  e in E_s' -> quoteRule_e and executeRule_e are defined

No hidden successful edge:
  execute succeeds through edge e -> e is a valid SPI-102 edge for the protocol
```

The last law is the interface discipline: if a protocol claims SPI-102 for a
behavior, successful user-facing mutations should be expressible as edges.
Protocols can still keep administrative or emergency methods outside SPI-102,
but those methods should not pretend to be SPI-102 executions.

## Quote

A quote fixes an account's intent against one edge.

Mathematically:

```text
quote(s, account, edgeId, intent) = q
```

`quote` is pure:

```text
quote does not change s
```

The account is required even when an edge does not depend on the account's
current balances. That keeps quote, authorization, availability, and execution
laws uniform.

A quote object should bind:

```text
account          account whose state is being quoted
edgeId           selected edge
input            quoted input basket
output           quoted output basket
positionInputs   quoted position ids and amounts to consume or lock
positionOutputs  quoted position ids and amounts expected to be created
fees             protocol fees, transfer fees, interest, spread, or slippage data
expiresAt        optional validity time
preconditions    state facts execution must recheck or tolerate as stale
witness          optional protocol-specific lookup hint for execute
```

The quote is not a promise that execution will succeed, and it is not consumed
by `execute`. It is a reusable structured preview plus enough binding data that
`execute` cannot silently run a different transition. Base SPI-102 does not
require stored quote ids, nonces, reservations, or graph/state version numbers.
Execution always rechecks current state.

Quotes may be produced for locked or future edges returned by `discover`. For
example, a pending unstake claim can be quoted before `unlockAt` so a wallet can
show the expected output and maturity time. `execute` must still reject until
the edge is live.

The quote witness is a hint only. `execute` may use it to locate protocol data,
but it must recheck every fact against current canister state before mutating.
The witness is not authority and cannot replace authorization, availability,
liveness, guard, or accounting checks.

Quote law:

```text
Quote binding:
  q = quote(s, p, edgeId, intent)
  -> q.account = p
  -> q.edgeId = edgeId
  -> q.input is derived from intent and s
  -> q.output is derived from quoteRule_edgeId(s, p, intent)
```

Kernel quote guarantee:

```text
quote returns #ok(q)
  -> caller controls request.account
  -> request.intent.amount > 0
  -> q has positive input, output, or position flow
  -> q.account = request.account
  -> q.edgeId = request.edgeId
  -> request.edgeId is a known SPI-102 edge for the protocol
```

The implementation may also prove that the quote was live at the local issue
time. That issue time is normally a local variable inside the quote method, so
the public stable guarantee is the request binding plus positive flow. Execute
must still recheck quote freshness against execution time.

For mutable protocols, a quote can become stale. Execution must either:

```text
1. recompute against current state and satisfy caller acceptance limits, or
2. reject without debiting user-local assets.
```

## Delayed Transitions

Some user-visible transitions should not be modeled as one long-running
execution. Unstaking, vesting, bond maturity, withdrawal queues, cooldowns, and
some liquidation or auction flows intentionally take protocol time.

SPI-102 should represent these as intermediate nodes plus later edges.

For example, DAO unstaking is not:

```text
active stake --wait 7 days inside execute--> liquid GOV
```

It is:

```text
active stake --requestUnstake--> pending unstake
pending unstake --claimUnstaked, if now >= unlockAt--> liquid GOV
pending unstake --cancelUnstake, if protocol allows--> active stake
```

The first execution is immediate from the protocol's perspective: it consumes
active stake and produces a pending unstake position. The position carries the
amount, owner, creation time, unlock time, and any cancellation policy. Later,
`discover` can show which edges are available from that pending node:

```text
before unlockAt:
  cancelUnstake may be live
  claimUnstaked is listed as locked or omitted

at or after unlockAt:
  claimUnstaked is live
  cancelUnstake may still be live, depending on protocol policy
```

This keeps `execute` bounded and auditable. Time is part of an edge domain, not
an implicit background action:

```text
domain_claim(s, p, pendingPosition, now) =
  owner(pendingPosition) = p and
  now >= pendingPosition.unlockAt
```

Base SPI-102 uses the implementing canister's protocol time for delayed-edge
domains, normally IC time as observed by that canister. Quotes and receipts for
time-sensitive edges should report the relevant `unlockAt`, `deadline`, or
`maturity` values so clients can explain why an edge is locked or live.

Delayed-node laws:

```text
Create pending:
  execute request edge succeeds
  -> old active amount decreases by amount
  -> pending position exists with amount and unlockAt

Claim pending:
  execute claim edge succeeds
  -> pending position is consumed or reduced
  -> liquid output is produced exactly as stated in the receipt

Cancel pending:
  execute cancel edge succeeds
  -> pending position is consumed or reduced
  -> active/staked output is restored according to protocol rules
```

For partial claims or partial cancellation, either split a position into new
position ids or treat the position quantity as fungible amount plus immutable
metadata. The receipt must say exactly which position was consumed, how much was
consumed, and which new position or balance was produced.

This same pattern covers lending and vault delays:

```text
withdrawal request -> pending withdrawal ticket -> claim asset
bond purchase      -> immature bond position    -> redeem matured bond
auction bid        -> escrowed bid position     -> settle or cancel
```

## Acceptance Guards

The user supplies acceptance limits to `execute`.

For swaps this is usually:

```text
minimum amount out
```

SPI-102 generalizes that into a guard:

```text
guard(q, receipt) : Bool
```

Common guard fields:

```text
minReceive       lower bounds on output quantities
maxSpend         upper bounds on input quantities
deadline         latest accepted protocol time
maxFee           fee ceiling
maxPriceImpact   price movement ceiling
minShares        liquidity share lower bound
maxDebt          debt upper bound
minHealth        lending health-factor lower bound
extension        protocol-specific acceptance data
```

The base guard shape should be generic and machine-readable. Protocol-specific
edges can add extension data, but core user protections such as max spend, min
receive, deadline, and fee ceilings should not be hidden in an opaque blob.
State expectations, such as proposal id, position id, pool id, config facts, or
unlock-time expectations, belong in the protocol-specific extension rather than
a base `requiredState` field.

Guard law:

```text
execute succeeds with receipt r -> guard(q, r) = true
```

This is the generic slippage rule. Slippage is just one instance of a broader
acceptance predicate over the actual execution receipt.

## Execute

Mathematically:

```text
execute(s, caller, quote q, guard g) =
  #ok(s', receipt r) or #err(error)
```

Successful execution must satisfy:

```text
Authorization:
  caller controls q.account

Quote binding:
  r.edgeId = q.edgeId
  r.account = q.account

Availability safety:
  avail_s(q.account) contains r.input

Guard:
  g(q, r) = true

Transition:
  s' = executeRule_{q.edgeId}(s, q.account, q, r)

Receipt truth:
  r.input is exactly what was consumed
  r.output is exactly what was produced
  r.fees are exactly what was charged or reserved
  any consumed, remaining, or created position ids are exactly reported
```

When an edge consumes and produces only concrete local balances:

```text
bal_s'(q.account) = bal_s(q.account) - r.input + r.output
```

When an edge uses derived nodes, such as stake capacity or lending health, the
same abstract effect must be justified by the edge law over concrete protocol
state.

If execution fails before a transition commits:

```text
bal_s'(q.account) = bal_s(q.account)
```

More generally, failed execution must not debit or lose account-visible local
state or mutate protocol accounting touched by the attempted edge:

```text
avail_s'(q.account) = avail_s(q.account)
touchedAccounting_s' = touchedAccounting_s
```

SPI-102 execution is await-free. If a protocol needs external ledger movement
or cross-canister settlement, that async phase must happen outside `execute`.
Inside SPI-102, such flows can still be represented as local pending, ticket,
or claim nodes, but creating or consuming those nodes is an atomic local state
transition.

## Accounting Laws

Each edge declares the accounting law it preserves or intentionally changes.

A law is a predicate over old state, new state, quote, and receipt:

```text
law_e(s, s', q, r) : Bool
```

Examples:

```text
DEX swap:
  input reserve increases by effective input plus LP fee
  output reserve decreases by amount out
  platform fee is credited to the controller
  output reserve is not drained

DEX liquidity add:
  user token balances decrease by used amounts
  pool reserves increase by used amounts
  user LP balance increases by minted shares

DEX liquidity remove:
  user LP balance decreases by burned shares
  pool reserves decrease by returned amounts
  user token balances increase by returned amounts

DAO stake:
  total DAO supply is unchanged
  liquid decreases by amount
  active stake increases by amount
  voting unlock time is set by protocol rule

DAO request unstake:
  active stake decreases by amount
  pending unstake increases by amount
  total DAO supply is unchanged

DAO cancel unstake:
  pending unstake decreases by amount
  active stake increases by amount according to the cancel policy
  total DAO supply is unchanged

Lending borrow:
  supplied liquidity decreases or debt accounting increases as declared
  borrower debt position increases
  health factor remains above the accepted guard
```

The generic SPI does not need one universal conservation equation. Different
protocols preserve different resources. What SPI-102 requires is that every
edge expose a declared law and that successful execution satisfy that law.

Base SPI-102 still requires these universal laws for every edge:

```text
Authorization:
  only the controller of quote.account can execute the edge

Quote binding:
  execution cannot switch to a different account or edge

Availability safety:
  execution cannot consume more than the account currently has or controls

Guard satisfaction:
  every successful receipt satisfies the caller's guard

Known edge:
  every successful quote or execute result is bound to a known protocol edge

Receipt truth:
  consumed input, produced output, fees, and position changes are exact

Failure safety:
  failed execution preserves account-visible state and protocol accounting
  touched by the attempted edge
```

In the SR9 kernel pattern, the public execute guarantee is represented by:

```motoko
Kernel.receiptAccepted(caller, quote, guard, receipt)
```

Every successful `spi_102_execute` implementation should expose this as a
postcondition. The predicate includes quote/receipt binding and guard
acceptance at `receipt.executedAt`, so user protections such as minimum receive,
maximum spend, maximum fee, and deadline are part of the verified public API.
The kernel also provides projection lemmas for these consequences, so
implementations and clients can prove the concrete guard facts without
duplicating the definition of `receiptAccepted`.

For large baskets and paginated discovery, implementations should expose a
stable local projection order. The projection must be injective over the
protocol's advertised node/edge universe:

```text
nodeKey : NodeId -> Nat
edgeKey : EdgeId -> Nat
```

The kernel proves the generic laws over these scalar projections:

```text
all amounts > 0
strictly sorted node keys => no duplicate basket nodes
strictly sorted node keys => no duplicate discovery nodes in a page
strictly sorted edge keys => no duplicate discovery edges in a page
last key of page n < first key of page n+1 => adjacent pages are disjoint
```

The projection key is not authority and does not replace `NodeId` or `EdgeId`.
It is a proof/indexing aid for clients and actors that need generic uniqueness
over unbounded pages.

## Future Route Profile

Base SPI-102 quote and execute are single-edge only. A later local-route profile
can compose multiple edges inside one canister without changing the three
function names.

In that profile, an edge route would be a finite sequence:

```text
route = [e_0, e_1, ..., e_n]
```

The route would be composable when the outputs of each prefix can satisfy the
inputs of the next edge, possibly with additional user-supplied input.

For exact one-input/one-output swaps:

```text
A -> B -> C
```

For hyperedges, composition is basket-based:

```text
available_0 = userInput
for each edge e_i:
  require available_i contains input_i
  available_{i+1} = available_i - input_i + output_i
```

That future profile would keep the same discovery shape:

```text
discover  -> graph
quote   -> route through graph
execute -> quoted route
```

## DEX Interpretation

For the current constant-product DEX blueprint:

```text
Nodes:
  each whitelisted ledger principal as an external ledger node
  each pool/share class as a local node

Edges:
  swap ledgerA -> ledgerB for each pool
  swap ledgerB -> ledgerA for each pool
  addLiquidity {ledgerA, ledgerB} -> LP(A,B)
  removeLiquidity LP(A,B) -> {ledgerA, ledgerB}
  retire/return/dust cleanup could be admin or cleanup edges

Quote:
  selected pool, direction, amount in, reserves, fee split, expected amount out

Execute guard:
  minimum amount out for swap
  minimum shares for add liquidity
  minimum returned token amounts for remove liquidity
```

For this DEX, LP shares are not SPI-100 accounts. They are local nodes, for
example `#local(encodePoolShare(poolId))`. External token balances use external
ledger nodes. DAO pending-unstake tickets and lending positions also use local
nodes when they need a
concrete position id, unlock time, split/merge behavior, or non-fungible
identity.

ICRC deposits and withdrawals are covered by SPI-103. SPI-102 can either
reference SPI-103 for external movement or model local deposit/withdrawal
claims as nodes. It should not perform ledger awaits during `execute`.
The base SPI-102 surface does not include a wallet method; account-local
holding queries belong to SPI-101 `spi_101_wallet`.

## DAO Interpretation

For the current DAO blueprint:

```text
Nodes:
  liquid governance token balance
  active stake position
  voting-eligible stake state
  pending unstake position
  proposal bond position
  vote lock / vote receipt position

Edges:
  stake liquid -> active stake
  requestUnstake active stake -> pending unstake
  cancelUnstake pending unstake -> active stake, if the DAO allows cancellation
  claimUnstaked matured pending unstake -> liquid
  createProposal active stake capacity -> proposal bond + open proposal state
  vote mature stake capacity -> vote lock / vote receipt
  close open proposal -> passed or failed proposal state
  execute passed proposal -> updated config or stale settlement

Quote:
  amount, unlock time, proposal threshold, quorum, config version, deadline

Execute guard:
  maximum lock time
  expected unlock time or maximum unlock delay
  expected config version
  minimum voting power
  accepted proposal threshold or quorum bounds
```

The DAO shows why SPI-102 nodes cannot be only fungible tokens. A stake or
pending unstake is position-like: it has amount, owner, lock time, and protocol
meaning.

## Lending Interpretation

For a lending market:

```text
Nodes:
  supplied collateral position
  debt position
  available liquidity token
  interest-bearing share
  liquidation claim

Edges:
  supply token -> collateral/share position
  withdraw collateral/share -> token
  borrow collateral capacity -> debt position + borrowed token
  repay token + debt position -> reduced debt position
  liquidate unhealthy debt + repay token -> collateral claim

Quote:
  interest index, collateral factor, borrow rate, liquidation bonus,
  projected health factor

Execute guard:
  max borrow rate
  min health factor
  max repay
  min collateral seized
```

This fits the same model as long as position nodes can carry protocol-specific
metadata and every successful edge publishes its accounting law.

## Early Design Rules

SPI-102 should keep these rules:

1. `discover` is read-only discovery and may be stale immediately.
2. `discover` is account-specific and can return live and locked/future edges
   with typed statuses.
3. `quote` is read-only, account-bound, reusable, and not authority.
4. Base `quote` and `execute` cover exactly one edge.
5. Quote witnesses are hints only; `execute` must recheck current state.
6. `execute` must recheck authorization, availability, edge liveness, and guards.
7. Successful execution must correspond to an edge in the protocol's SPI-102
   transition graph.
8. Receipts must report exact consumed inputs, produced outputs, fees, and
   position changes.
9. Position-like outputs need stable ids, not only display text.
10. External ledger movement should either reuse SPI-101 or explicitly model
   local pending or claim states outside the await-free execution step.
11. Protocol-specific math belongs in edge laws, not hidden inside prose.

## Open Questions

- Should future local-route support be one optional profile or several profiles
  for swaps, baskets, and position workflows?
- Should `#local` payload conventions become profile-specific helpers, or stay
  entirely implementation-defined with discovery metadata as the client-facing
  explanation layer?
