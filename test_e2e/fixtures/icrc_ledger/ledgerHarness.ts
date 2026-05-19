import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  type Actor,
  type Caller,
  IDL,
  type IcrcAccount,
  type IcrcSubaccountInput,
  type PocketIc,
  type Principal,
  type TestIdentity,
  account,
  asCaller,
  principalOf,
  subaccountOpt,
  unwrapIcrcOk,
} from "../../common/runtime.ts";
import {
  idlFactory as icrcLedgerIdlFactory,
  init as icrcLedgerInit,
} from "./ledger.idl.js";

export type InitialBalance = {
  owner: Caller;
  amount: bigint;
  subaccount?: IcrcSubaccountInput;
};

export type DeployIcrcLedgerOptions = {
  controller: Caller;
  symbol: string;
  name?: string;
  fee?: bigint;
  decimals?: number;
  mintingAccount?: Caller | IcrcAccount;
  initialBalances?: InitialBalance[];
  cycles?: bigint;
};

export type IcrcLedgerFixture = {
  canisterId: Principal;
  actor: Actor<any>;
  fee: bigint;
  symbol: string;
  decimals: number;
  mintingAccount: IcrcAccount;
};

export type TransferOptions = {
  fromSubaccount?: IcrcSubaccountInput;
  fee?: bigint;
  memo?: number[];
  createdAtTime?: bigint;
};

export type MintOptions = TransferOptions & {
  minter?: Caller;
};

export type ApproveOptions = {
  fromSubaccount?: IcrcSubaccountInput;
  spenderSubaccount?: IcrcSubaccountInput;
  fee?: bigint;
  memo?: number[];
  createdAtTime?: bigint;
  expectedAllowance?: bigint;
  expiresAt?: bigint;
};

export type TransferFromOptions = {
  spenderSubaccount?: IcrcSubaccountInput;
  fee?: bigint;
  memo?: number[];
  createdAtTime?: bigint;
};

export type AllowanceOptions = {
  ownerSubaccount?: IcrcSubaccountInput;
  spenderSubaccount?: IcrcSubaccountInput;
};

const DEFAULT_LEDGER_CYCLES = 100_000_000_000_000n;
const DEFAULT_LEDGER_FEE = 10_000n;
const ICRC_LEDGER_WASM = resolve(import.meta.dir, "ledger.wasm");

export async function deployIcrcLedger(
  pic: PocketIc,
  opts: DeployIcrcLedgerOptions,
): Promise<IcrcLedgerFixture> {
  const fee = opts.fee ?? DEFAULT_LEDGER_FEE;
  const decimals = opts.decimals ?? 8;
  const mintingAccount = normalizeAccount(
    opts.mintingAccount ?? opts.controller,
  );
  const controller = principalOf(opts.controller);
  const ledgerArg = {
    Init: {
      minting_account: mintingAccount,
      fee_collector_account: [],
      transfer_fee: fee,
      decimals: [decimals],
      token_symbol: opts.symbol,
      token_name: opts.name ?? `${opts.symbol} Coin`,
      metadata: [],
      initial_balances: (opts.initialBalances ?? []).map((balance) => [
        account(balance.owner, balance.subaccount),
        balance.amount,
      ]),
      archive_options: {
        num_blocks_to_archive: 1000n,
        trigger_threshold: 9000n,
        controller_id: controller,
        max_transactions_per_response: [],
        max_message_size_bytes: [],
        cycles_for_archive_creation: [],
        node_max_memory_size_bytes: [],
      },
      maximum_number_of_accounts: [],
      accounts_overflow_trim_quantity: [],
      max_memo_length: [],
      feature_flags: [{ icrc2: true }],
    },
  };

  const fixture = await pic.setupCanister<any>({
    idlFactory: icrcLedgerIdlFactory as never,
    wasm: new Uint8Array(readFileSync(ICRC_LEDGER_WASM)),
    arg: IDL.encode(icrcLedgerInit({ IDL }) as never, [ledgerArg]),
    cycles: opts.cycles ?? DEFAULT_LEDGER_CYCLES,
  });

  await pic.addCycles(fixture.canisterId, DEFAULT_LEDGER_CYCLES);

  return {
    canisterId: fixture.canisterId,
    actor: fixture.actor,
    fee,
    symbol: opts.symbol,
    decimals,
    mintingAccount,
  };
}

export async function mint(
  ledger: IcrcLedgerFixture,
  to: Caller | IcrcAccount,
  amount: bigint,
  opts: MintOptions = {},
): Promise<bigint> {
  return transfer(
    ledger,
    opts.minter ?? ledger.mintingAccount.owner,
    to,
    amount,
    {
      ...opts,
      fromSubaccount:
        opts.fromSubaccount ?? ledger.mintingAccount.subaccount[0],
    },
  );
}

export async function transfer(
  ledger: IcrcLedgerFixture | Actor<any>,
  from: Caller,
  to: Caller | IcrcAccount,
  amount: bigint,
  opts: TransferOptions = {},
): Promise<bigint> {
  const actor = ledgerActor(ledger);
  asCaller(actor, from);
  const result = await actor.icrc1_transfer({
    to: normalizeAccount(to),
    amount,
    fee: opts.fee === undefined ? [] : [opts.fee],
    memo: opts.memo === undefined ? [] : [opts.memo],
    from_subaccount: subaccountOpt(opts.fromSubaccount),
    created_at_time:
      opts.createdAtTime === undefined ? [] : [opts.createdAtTime],
  });
  return unwrapIcrcOk<bigint>(result);
}

export async function approve(
  ledger: IcrcLedgerFixture | Actor<any>,
  owner: Caller,
  spender: Caller | IcrcAccount,
  amount: bigint,
  opts: ApproveOptions = {},
): Promise<bigint> {
  const actor = ledgerActor(ledger);
  asCaller(actor, owner);
  const result = await actor.icrc2_approve({
    spender: normalizeAccount(spender, opts.spenderSubaccount),
    amount,
    fee: opts.fee === undefined ? [] : [opts.fee],
    memo: opts.memo === undefined ? [] : [opts.memo],
    from_subaccount: subaccountOpt(opts.fromSubaccount),
    created_at_time:
      opts.createdAtTime === undefined ? [] : [opts.createdAtTime],
    expected_allowance:
      opts.expectedAllowance === undefined ? [] : [opts.expectedAllowance],
    expires_at: opts.expiresAt === undefined ? [] : [opts.expiresAt],
  });
  return unwrapIcrcOk<bigint>(result);
}

export async function transferFrom(
  ledger: IcrcLedgerFixture | Actor<any>,
  spender: Caller,
  from: Caller | IcrcAccount,
  to: Caller | IcrcAccount,
  amount: bigint,
  opts: TransferFromOptions = {},
): Promise<bigint> {
  const actor = ledgerActor(ledger);
  asCaller(actor, spender);
  const result = await actor.icrc2_transfer_from({
    from: normalizeAccount(from),
    to: normalizeAccount(to),
    amount,
    fee: opts.fee === undefined ? [] : [opts.fee],
    spender_subaccount: subaccountOpt(opts.spenderSubaccount),
    memo: opts.memo === undefined ? [] : [opts.memo],
    created_at_time:
      opts.createdAtTime === undefined ? [] : [opts.createdAtTime],
  });
  return unwrapIcrcOk<bigint>(result);
}

export async function balanceOf(
  ledger: IcrcLedgerFixture | Actor<any>,
  owner: Caller | IcrcAccount,
  subaccount?: IcrcSubaccountInput,
): Promise<bigint> {
  return ledgerActor(ledger).icrc1_balance_of(
    normalizeAccount(owner, subaccount),
  );
}

export async function expectBalance(
  ledger: IcrcLedgerFixture | Actor<any>,
  owner: Caller | IcrcAccount,
  expected: bigint,
  subaccount?: IcrcSubaccountInput,
): Promise<void> {
  const actual = await balanceOf(ledger, owner, subaccount);
  if (actual !== expected) {
    throw new Error(`Expected ledger balance ${expected}, got ${actual}.`);
  }
}

export async function allowance(
  ledger: IcrcLedgerFixture | Actor<any>,
  owner: Caller | IcrcAccount,
  spender: Caller | IcrcAccount,
  opts: AllowanceOptions = {},
): Promise<{ allowance: bigint; expires_at: [] | [bigint] }> {
  return ledgerActor(ledger).icrc2_allowance({
    account: normalizeAccount(owner, opts.ownerSubaccount),
    spender: normalizeAccount(spender, opts.spenderSubaccount),
  });
}

export async function fee(
  ledger: IcrcLedgerFixture | Actor<any>,
): Promise<bigint> {
  return ledgerActor(ledger).icrc1_fee();
}

export async function totalSupply(
  ledger: IcrcLedgerFixture | Actor<any>,
): Promise<bigint> {
  return ledgerActor(ledger).icrc1_total_supply();
}

export async function mintingAccount(
  ledger: IcrcLedgerFixture | Actor<any>,
): Promise<[] | [IcrcAccount]> {
  return ledgerActor(ledger).icrc1_minting_account();
}

export function ledgerActor(ledger: IcrcLedgerFixture | Actor<any>): Actor<any> {
  return "actor" in ledger ? ledger.actor : ledger;
}

function normalizeAccount(
  value: Caller | IcrcAccount,
  subaccount?: IcrcSubaccountInput,
): IcrcAccount {
  if (isIcrcAccount(value)) {
    if (subaccount !== undefined) {
      return account(value.owner, subaccount);
    }
    return value;
  }
  return account(value, subaccount);
}

function isIcrcAccount(value: Caller | IcrcAccount): value is IcrcAccount {
  return (
    typeof value === "object" &&
    value !== null &&
    "owner" in value &&
    "subaccount" in value
  );
}

export const approveSpender = approve;
export const icrcBalanceOf = balanceOf;
export type IcrcLedger = IcrcLedgerFixture;
export type MinterIdentity = TestIdentity;
