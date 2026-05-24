# Spec

This alternative adds:

- `pendingWithdrawalBindsRequest`
- `pendingWithdrawalSettledByReceipt`
- `canReserveIcrcWithdraw`
- `icrcWithdrawSettledFromPending`

These laws describe the safe async bridge shape:

```text
request -> local pending debit session -> external ledger await -> receipt settlement
```

The session is scalar evidence. It does not carry borrowed ledger or map
payload authority across `await`.

