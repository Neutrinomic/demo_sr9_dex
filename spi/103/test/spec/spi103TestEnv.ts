import {
  createTestRuntime,
  type PocketIc,
  type TestIdentity,
  type TestRuntime,
} from "../../../../shared/common/runtime.ts";
import {
  deployIcrcWallet,
  type IcrcWalletFixture,
} from "../fixtures/actors/icrcWallet/icrcWalletHarness.ts";

export const IDENTITY_NAMES = ["alice", "bob", "ledger", "unsupportedLedger"] as const;

export const MIN_DEPOSIT = 10n;
export const WITHDRAW_FEE = 2n;

export type Spi103E2E = {
  runtime: TestRuntime<typeof IDENTITY_NAMES>;
  pic: PocketIc;
  alice: TestIdentity;
  bob: TestIdentity;
  ledger: TestIdentity;
  unsupportedLedger: TestIdentity;
  icrcWallet: IcrcWalletFixture;
};

export async function setupSpi103E2E(): Promise<Spi103E2E> {
  const runtime = await createTestRuntime({
    identities: IDENTITY_NAMES,
    identityPrefix: "spi103",
  });
  const { alice, bob, ledger, unsupportedLedger } = runtime.identities;
  const icrcWallet = await deployIcrcWallet(
    runtime.pic,
    ledger.getPrincipal(),
    MIN_DEPOSIT,
    WITHDRAW_FEE,
  );

  return {
    runtime,
    pic: runtime.pic,
    alice,
    bob,
    ledger,
    unsupportedLedger,
    icrcWallet,
  };
}
