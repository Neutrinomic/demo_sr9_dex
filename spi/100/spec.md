# SPI-100: Compact Local Account Ids

SPI-100 defines a compact account id for protocol-local wallets.

An account id is a `Blob` that decodes to:

```text
wallet : Principal
id     : Nat
```

The `wallet` is the canister principal whose local account namespace owns the
id. The `id` is a wallet-local numeric account id, such as `123`.

SPI-100 does not synthesize principals, does not use reserved principals, and
does not claim that possession of an account blob authorizes mutation. A wallet
canister may assign these account ids during registration, but the registration
table and authorization policy live in that canister, not in SPI-100.

## Goals

- Use a real `Blob` account id instead of pretending a local account is an IC
  principal.
- Keep the binary form compact.
- Decode every valid account back to exactly `{ wallet; id }`.
- Provide a short human text form using Bitcoin's Base58 alphabet.
- Add a checksum to the text form so clients can reject mistyped account ids.
- Keep authorization out of the codec.

## Types

```motoko
public type LocalId = Nat;
public type Wallet = Principal;
public type Account = Blob;
public type Controller = Principal;

public type DecodedAccount = {
  wallet : Wallet;
  id : LocalId
};
```

`Account` is a blob. It is not an authenticated actor.

`Controller` is the authenticated caller/controller principal.

## Binary Format

The canonical binary account is:

```text
header || trimmed_wallet_bytes || id_bytes
```

Where:

```text
wallet_bytes         = Principal.toBlob(wallet)
principal_len        = len(wallet_bytes)
trimmed_wallet_bytes = wallet_bytes with leading 0x00 bytes removed
suffix_len           = len(trimmed_wallet_bytes)
id_bytes             = minimal big-endian encoding of id
id_len               = len(id_bytes), 1..4
header               = principal_len * 8 + (id_len - 1)
```

Valid input constraints:

```text
1 <= principal_len <= 29
0 <= id <= 2^32 - 1
1 <= id_len <= 4
```

The codec trims **leading** zero bytes from the principal and keeps the original
principal length in the header. This lets the decoder reconstruct the exact
principal bytes by restoring the removed leading zeros.

Trailing zero bytes are never trimmed.

## Id Encoding

`id` is encoded in the shortest big-endian form that can hold it:

```text
0..255                 -> 1 byte
256..65_535            -> 2 bytes
65_536..16_777_215     -> 3 bytes
16_777_216..2^32 - 1   -> 4 bytes
```

Examples:

```text
id = 0      -> 00
id = 123    -> 7b
id = 256    -> 01 00
id = 65_536 -> 01 00 00
```

Non-minimal id encodings are invalid. For example, `id = 123` must be encoded
as `7b`, not `00 7b`.

## Decode Rules

To decode an account blob:

1. Read `header`.
2. Compute:

```text
principal_len = header / 8
id_len        = header % 8 + 1
```

3. Reject if `principal_len` is outside `1..29`.
4. Reject if `id_len` is outside `1..4`.
5. Split the remaining bytes into `trimmed_wallet_bytes` and `id_bytes`.
6. Reject if the trimmed wallet suffix is longer than `principal_len`.
7. Reject non-canonical wallet encodings where the suffix begins with `0x00`.
8. Reconstruct the principal by prepending enough leading zeros to reach
   `principal_len`.
9. Decode `id_bytes` as big-endian `Nat`.
10. Reject if the id was not minimally encoded.

## Roundtrip And No-Collision Laws

For every usable wallet principal and supported local id:

```text
decode(encode(wallet, id)) = ?{ wallet; id }
```

For every valid canonical account blob:

```text
decode(account) = ?decoded
  implies
encode(decoded.wallet, decoded.id) = ?account
```

Together these make SPI-100 a bijection between semantic account pairs and
canonical account blobs.

Encode is injective:

```text
encode(walletA, idA) = encode(walletB, idB)
  implies
walletA = walletB and idA = idB
```

Equivalently:

```text
walletA != walletB or idA != idB
  implies
encode(walletA, idA) != encode(walletB, idB)
```

Decode is injective only over valid canonical blobs:

```text
decode(accountA) != null
decode(accountB) != null
decode(accountA) = decode(accountB)
  implies
accountA = accountB
```

Equivalently:

```text
decode(accountA) != null
decode(accountB) != null
accountA != accountB
  implies
decode(accountA) != decode(accountB)
```

Decode is intentionally not injective over arbitrary invalid blobs because many
bad byte strings decode to `null`.

The SR9 module exposes these facts as checked lemmas in `AccountCodec.sr9`, and
the proof observer in `proofs/AccountCodecObservers.sr9` verifies external use.

### Proof Surface

`AccountCodec.sr9` exposes the proof facts protocols should rely on:

```motoko
encodeDecodeRoundtrip(wallet, id)
decodeEncodeRoundtrip(account)
encodeInjective(walletA, idA, walletB, idB)
encodeNoCollision(walletA, idA, walletB, idB)
validDecodeInjective(accountA, accountB)
validDecodeNoCollision(accountA, accountB)
decodedIdIsBounded(account)
```

The proof shape is deliberately small.

`encodeDecodeRoundtrip` follows from the postcondition on `encode`:

```text
encode(wallet, id) = ?account
  implies
decode(account) = ?{ wallet; id }
```

`decodeEncodeRoundtrip` follows from the postcondition on `decode`:

```text
decode(account) = ?decoded
  implies
encode(decoded.wallet, decoded.id) = ?account
```

`encodeInjective` is proved by decoding both sides of an equal encoded account:

```text
encode(walletA, idA) = encode(walletB, idB)
decode(encode(walletA, idA)) = ?{ walletA; idA }
decode(encode(walletB, idB)) = ?{ walletB; idB }
therefore { walletA; idA } = { walletB; idB }
```

`encodeNoCollision` is the contrapositive form used by callers:

```text
walletA != walletB or idA != idB
  implies
encode(walletA, idA) != encode(walletB, idB)
```

`validDecodeInjective` is proved by re-encoding both decoded values:

```text
decode(accountA) = decode(accountB) = ?decoded
encode(decoded.wallet, decoded.id) = ?accountA
encode(decoded.wallet, decoded.id) = ?accountB
therefore accountA = accountB
```

`validDecodeNoCollision` is the contrapositive form for valid canonical blobs:

```text
accountA != accountB
decode(accountA) != null
decode(accountB) != null
  implies
decode(accountA) != decode(accountB)
```

The observer module proves that these lemmas can be imported and used outside
the codec module:

```motoko
encodedAccountsDoNotCollide(...)
validDecodedAccountsDoNotCollide(...)
validDecodedAccountsAreInjective(...)
```

### Proof Trust Boundary

The no-collision lemmas are verifier-checked from the public codec contracts.
The byte parser itself is still `pure trusted` because it depends on low-level
facts about:

```text
Blob.fromArray / Blob.get over tabulated arrays
Principal.fromBlob / Principal.toBlob roundtrips
```

So the current guarantee is:

```text
Assuming the AccountCodec encode/decode contracts are correct,
the verifier checks the no-collision and injectivity consequences.
```

Removing that trust boundary requires stronger core lemmas for Blob and
Principal roundtrips. Until then, `decode` owns the canonical re-encode
postcondition, and the no-collision lemmas prove the algebra above that
contract.

## Text Format

The text account id is:

```text
n || Base58(account_blob || crc32(account_blob))
```

Where:

- `n` is the SPI-100 account text prefix.
- `Base58` is the Bitcoin Base58 alphabet:

```text
123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz
```

- `crc32(account_blob)` is encoded as four big-endian checksum bytes.

The checksum is for typo detection. It is not authentication.

Text decode:

1. Require the first character to be `n`.
2. Base58-decode the body.
3. Split the decoded bytes into `account_blob` and four checksum bytes.
4. Recompute `crc32(account_blob)`.
5. Reject if the checksum does not match.
6. Decode and validate `account_blob`.

Text roundtrip law for every valid canonical account blob:

```text
AccountText.decode(AccountText.encode(account)) = ?account
```

This is also verified in `proofs/AccountCodecObservers.sr9`.

## Example

Given:

```text
wallet = togwv-zqaaa-aaaal-qr7aa-cai
id     = 123
```

The raw principal bytes are:

```text
00 00 00 00 01 70 8f c0 01 01
```

The leading zeros are trimmed:

```text
01 70 8f c0 01 01
```

The account blob is:

```text
50 01 70 8f c0 01 01 7b
```

The CRC32 checksum is:

```text
07 a4 10 5d
```

The final text id is:

```text
n2WZtE3RDcCuoZD8Ax
```

## Authorization

SPI-100 does not answer:

```text
Can caller C mutate account A?
```

It only answers:

```text
What wallet principal and local id are encoded in account A?
```

A wallet canister may use SPI-100 like this:

1. A caller registers with the wallet canister.
2. The wallet canister assigns a local id.
3. The wallet returns `encode(wallet_canister_principal, local_id)`.
4. The wallet stores its own mapping from local id to controller, policy, or
   ownership state.
5. Later calls decode the account and check the wallet's own registry.

That registry is deliberately outside SPI-100.

This avoids the dangerous old idea that a local account should be represented as
some crafted `Principal` value. Account ids are data. Principals are authenticated
IC identities or principal-shaped ids.

## Client Notes

Clients should:

- Treat binary accounts as opaque blobs except when they intentionally use the
  SPI-100 decoder.
- Display text accounts with the `n` prefix.
- Reject text accounts that fail Base58, checksum, or account canonicality
  checks.
- Not treat a valid account id as proof of ownership.
- Ask the wallet/protocol canister for metadata or authorization state when
  needed.

## Module Layout

Current SR9 modules:

- `AccountCodec.sr9`: binary account codec and shared semantic aliases.
- `Base58.sr9`: Bitcoin-alphabet Base58 codec.
- `AccountText.sr9`: `n` prefix plus Base58 account text with CRC32 checksum.
- `proofs/AccountCodecObservers.sr9`: roundtrip proof observers.
