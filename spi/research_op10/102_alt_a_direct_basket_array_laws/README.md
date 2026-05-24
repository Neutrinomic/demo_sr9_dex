# 102-A: Caller Quote/Execute Wrappers

Thesis: SPI-102 actors should be able to call kernel helpers using the natural
`caller` value while the kernel keeps explicit authorization facts internally.

Result: promoted. This makes actor proofs cleaner without changing the public
discover/quote/execute API.

