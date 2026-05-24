# Notes

- `walletReceiptWellFormed` intentionally checks only account binding in this
  alternative. Scanning arrays for all entries is useful but adds proof
  complexity; 101-B and 101-C test stronger export/page laws.
- No trusted helper was needed in this alternative.
