export const idlFactory = ({ IDL }) => {
  const ClaimUnstakeReceipt = IDL.Record({
    'amount' : IDL.Nat,
    'liquidBalance' : IDL.Nat,
  });
  const UnstakeError = IDL.Variant({
    'unstakeAlreadyPending' : IDL.Null,
    'zeroAmount' : IDL.Null,
    'insufficientActiveStake' : IDL.Null,
    'cooldownActive' : IDL.Record({ 'now' : IDL.Int, 'unlockAt' : IDL.Int }),
    'stakeLockedForVote' : IDL.Record({
      'lockedStake' : IDL.Nat,
      'activeStake' : IDL.Nat,
    }),
    'noPendingUnstake' : IDL.Null,
  });
  const Result_8 = IDL.Variant({
    'ok' : ClaimUnstakeReceipt,
    'err' : UnstakeError,
  });
  const ProposalStatus = IDL.Variant({
    'open' : IDL.Null,
    'stale' : IDL.Null,
    'executed' : IDL.Null,
    'failed' : IDL.Null,
    'passed' : IDL.Null,
  });
  const CloseReceipt = IDL.Record({
    'id' : IDL.Nat,
    'status' : ProposalStatus,
    'noVotes' : IDL.Nat,
    'quorumVotes' : IDL.Nat,
    'yesVotes' : IDL.Nat,
  });
  const CloseError = IDL.Variant({
    'proposalNotFound' : IDL.Null,
    'votingPeriodActive' : IDL.Record({
      'now' : IDL.Int,
      'deadline' : IDL.Int,
    }),
    'proposalNotOpen' : IDL.Null,
  });
  const Result_7 = IDL.Variant({ 'ok' : CloseReceipt, 'err' : CloseError });
  const Config = IDL.Record({
    'quorumVotes' : IDL.Nat,
    'proposalThreshold' : IDL.Nat,
  });
  const ConfigAction = IDL.Variant({
    'setConfig' : Config,
    'setQuorum' : IDL.Nat,
    'setProposalThreshold' : IDL.Nat,
  });
  const ProposalReceipt = IDL.Record({
    'id' : IDL.Nat,
    'quorumVotes' : IDL.Nat,
    'createdAt' : IDL.Int,
    'configVersion' : IDL.Nat,
    'deadline' : IDL.Int,
    'proposer' : IDL.Principal,
    'snapshotActiveStake' : IDL.Nat,
  });
  const ProposalError = IDL.Variant({
    'proposalThresholdNotMet' : IDL.Null,
    'stakeLockActive' : IDL.Record({ 'now' : IDL.Int, 'unlockAt' : IDL.Int }),
    'proposalCapacityReached' : IDL.Null,
    'stakeLockedForVote' : IDL.Record({
      'lockedStake' : IDL.Nat,
      'activeStake' : IDL.Nat,
    }),
    'invalidConfigAction' : IDL.Null,
  });
  const Result_6 = IDL.Variant({
    'ok' : ProposalReceipt,
    'err' : ProposalError,
  });
  const DaoTotals = IDL.Record({
    'totalActiveStake' : IDL.Nat,
    'totalSupply' : IDL.Nat,
    'totalProposalBonds' : IDL.Nat,
    'totalPendingUnstake' : IDL.Nat,
    'totalLiquid' : IDL.Nat,
    'totalPendingWithdraw' : IDL.Nat,
  });
  const DepositReceipt = IDL.Record({
    'txIndex' : IDL.Nat,
    'ledger' : IDL.Principal,
    'amount' : IDL.Nat,
    'liquidBalance' : IDL.Nat,
  });
  const TransferFromError = IDL.Variant({
    'GenericError' : IDL.Record({
      'message' : IDL.Text,
      'error_code' : IDL.Nat,
    }),
    'TemporarilyUnavailable' : IDL.Null,
    'InsufficientAllowance' : IDL.Record({ 'allowance' : IDL.Nat }),
    'BadBurn' : IDL.Record({ 'min_burn_amount' : IDL.Nat }),
    'Duplicate' : IDL.Record({ 'duplicate_of' : IDL.Nat }),
    'BadFee' : IDL.Record({ 'expected_fee' : IDL.Nat }),
    'CreatedInFuture' : IDL.Record({ 'ledger_time' : IDL.Nat64 }),
    'TooOld' : IDL.Null,
    'InsufficientFunds' : IDL.Record({ 'balance' : IDL.Nat }),
  });
  const LedgerReject = IDL.Record({ 'message' : IDL.Text });
  const DepositError = IDL.Variant({
    'zeroAmount' : IDL.Null,
    'ledgerTransferFromErr' : TransferFromError,
    'ledgerTransferFromRejected' : LedgerReject,
  });
  const Result_5 = IDL.Variant({ 'ok' : DepositReceipt, 'err' : DepositError });
  const ExecuteReceipt = IDL.Record({
    'id' : IDL.Nat,
    'configVersion' : IDL.Nat,
    'applied' : IDL.Bool,
    'config' : Config,
  });
  const ExecuteError = IDL.Variant({
    'proposalNotFound' : IDL.Null,
    'proposalNotPassed' : IDL.Null,
    'alreadyExecuted' : IDL.Null,
    'invalidConfigAction' : IDL.Null,
  });
  const Result_4 = IDL.Variant({ 'ok' : ExecuteReceipt, 'err' : ExecuteError });
  const PendingWithdrawal = IDL.Record({
    'fee' : IDL.Nat,
    'debitAmount' : IDL.Nat,
    'createdAtTime' : IDL.Nat,
    'operationId' : IDL.Nat,
    'amount' : IDL.Nat,
  });
  const Proposal = IDL.Record({
    'id' : IDL.Nat,
    'status' : ProposalStatus,
    'noVotes' : IDL.Nat,
    'action' : ConfigAction,
    'quorumVotes' : IDL.Nat,
    'yesVotes' : IDL.Nat,
    'bond' : IDL.Nat,
    'createdAt' : IDL.Int,
    'configVersion' : IDL.Nat,
    'deadline' : IDL.Int,
    'proposer' : IDL.Text,
    'snapshotActiveStake' : IDL.Nat,
  });
  const ProposalWindow = IDL.Record({
    'nextProposalId' : IDL.Nat,
    'maxProposals' : IDL.Nat,
  });
  const RequestUnstakeReceipt = IDL.Record({
    'pendingUnstake' : IDL.Nat,
    'unlockAt' : IDL.Int,
    'amount' : IDL.Nat,
    'activeStake' : IDL.Nat,
  });
  const Result_3 = IDL.Variant({
    'ok' : RequestUnstakeReceipt,
    'err' : UnstakeError,
  });
  const WithdrawReceipt = IDL.Record({
    'fee' : IDL.Nat,
    'txIndex' : IDL.Nat,
    'debitAmount' : IDL.Nat,
    'operationId' : IDL.Nat,
    'ledger' : IDL.Principal,
    'amount' : IDL.Nat,
    'liquidBalance' : IDL.Nat,
  });
  const TransferError = IDL.Variant({
    'GenericError' : IDL.Record({
      'message' : IDL.Text,
      'error_code' : IDL.Nat,
    }),
    'TemporarilyUnavailable' : IDL.Null,
    'BadBurn' : IDL.Record({ 'min_burn_amount' : IDL.Nat }),
    'Duplicate' : IDL.Record({ 'duplicate_of' : IDL.Nat }),
    'BadFee' : IDL.Record({ 'expected_fee' : IDL.Nat }),
    'CreatedInFuture' : IDL.Record({ 'ledger_time' : IDL.Nat64 }),
    'TooOld' : IDL.Null,
    'InsufficientFunds' : IDL.Record({ 'balance' : IDL.Nat }),
  });
  const WithdrawError = IDL.Variant({
    'insufficientLiquidBalance' : IDL.Null,
    'zeroAmount' : IDL.Null,
    'ledgerTransferErr' : TransferError,
    'ledgerTransferRejected' : LedgerReject,
    'withdrawReconciliationRejected' : LedgerReject,
    'withdrawInProgress' : IDL.Null,
    'withdrawReconciliationRequired' : TransferError,
    'noPendingWithdrawal' : IDL.Null,
    'ledgerFeeRejected' : LedgerReject,
  });
  const Result = IDL.Variant({ 'ok' : WithdrawReceipt, 'err' : WithdrawError });
  const StakeReceipt = IDL.Record({
    'amount' : IDL.Nat,
    'activeStake' : IDL.Nat,
    'votingPowerUnlockAt' : IDL.Int,
    'liquidBalance' : IDL.Nat,
  });
  const StakeError = IDL.Variant({
    'insufficientLiquidBalance' : IDL.Null,
    'zeroAmount' : IDL.Null,
  });
  const Result_2 = IDL.Variant({ 'ok' : StakeReceipt, 'err' : StakeError });
  const StakeInfo = IDL.Record({
    'pendingWithdraw' : IDL.Nat,
    'pendingUnstake' : IDL.Nat,
    'activeVoteLock' : IDL.Nat,
    'unlockAt' : IDL.Opt(IDL.Int),
    'proposalBond' : IDL.Nat,
    'activeStake' : IDL.Nat,
    'votingPowerUnlockAt' : IDL.Opt(IDL.Int),
    'liquid' : IDL.Nat,
  });
  const VoteChoice = IDL.Variant({ 'no' : IDL.Null, 'yes' : IDL.Null });
  const VoteReceipt = IDL.Record({
    'id' : IDL.Nat,
    'weight' : IDL.Nat,
    'noVotes' : IDL.Nat,
    'yesVotes' : IDL.Nat,
    'voter' : IDL.Principal,
    'choice' : VoteChoice,
  });
  const VoteError = IDL.Variant({
    'votingPeriodEnded' : IDL.Record({ 'now' : IDL.Int, 'deadline' : IDL.Int }),
    'proposalNotFound' : IDL.Null,
    'alreadyVoted' : IDL.Null,
    'stakeLockActive' : IDL.Record({ 'now' : IDL.Int, 'unlockAt' : IDL.Int }),
    'proposalNotOpen' : IDL.Null,
    'noVotingPower' : IDL.Null,
  });
  const Result_1 = IDL.Variant({ 'ok' : VoteReceipt, 'err' : VoteError });
  const VoteInfo = IDL.Record({
    'voteWeight' : IDL.Nat,
    'lockedStake' : IDL.Nat,
    'choice' : IDL.Opt(VoteChoice),
    'hasVoted' : IDL.Bool,
  });
  const DaoActorDemo = IDL.Service({
    'claim_unstaked' : IDL.Func([], [Result_8], []),
    'close' : IDL.Func([IDL.Nat], [Result_7], []),
    'config_version' : IDL.Func([], [IDL.Nat], ['query']),
    'create_proposal' : IDL.Func([ConfigAction], [Result_6], []),
    'dao_totals' : IDL.Func([], [DaoTotals], ['query']),
    'deposit' : IDL.Func([IDL.Nat], [Result_5], []),
    'execute' : IDL.Func([IDL.Nat], [Result_4], []),
    'governance_ledger' : IDL.Func([], [IDL.Principal], ['query']),
    'max_proposals' : IDL.Func([], [IDL.Nat], ['query']),
    'next_proposal_id' : IDL.Func([], [IDL.Nat], ['query']),
    'pending_withdrawal' : IDL.Func(
        [IDL.Principal],
        [IDL.Opt(PendingWithdrawal)],
        ['query'],
      ),
    'proposal' : IDL.Func([IDL.Nat], [IDL.Opt(Proposal)], ['query']),
    'proposal_config' : IDL.Func([], [Config], ['query']),
    'proposal_window' : IDL.Func([], [ProposalWindow], ['query']),
    'request_unstake' : IDL.Func([IDL.Nat], [Result_3], []),
    'retry_withdrawal' : IDL.Func([], [Result], []),
    'stake' : IDL.Func([IDL.Nat], [Result_2], []),
    'stake_info' : IDL.Func([IDL.Principal], [StakeInfo], ['query']),
    'vote' : IDL.Func([IDL.Nat, VoteChoice], [Result_1], []),
    'vote_info' : IDL.Func([IDL.Nat, IDL.Principal], [VoteInfo], ['query']),
    'voting_power' : IDL.Func([IDL.Principal], [IDL.Nat], ['query']),
    'withdraw' : IDL.Func([IDL.Nat], [Result], []),
  });
  return DaoActorDemo;
};
export const init = ({ IDL }) => { return [IDL.Principal, IDL.Nat, IDL.Nat]; };
