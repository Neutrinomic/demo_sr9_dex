# Spec

This alternative adds caller-facing wrappers:

- `quoteAuthorizedForCaller`
- `requestAuthorizedForCaller`
- `executableForCaller`
- `quoteResultForCaller`
- `checkExecuteForCaller`

The wrappers are equivalent to the canonical authorization-boolean helpers, but
they let actor code stay closer to the public shared-function shape.

