# Life OS — Application Operation Telemetry V1

**Canonical artifact:** `LIFE-OS-CANON-001` v1.2.0  
**Companion:** `TECHNICAL_TELEMETRY_V1.md`  
**Classification:** ALIGNED + EXTENSION

## Purpose

Add a reusable observation boundary for future Life OS application operations without moving telemetry into domain authority or exposing private command content.

The wrapper answers technical questions such as:

- which release handled this operation?
- did it succeed, reject safely, become unavailable, or fail?
- how long did it take?
- which opaque Capture/proposal/event/correlation IDs connect it to the private Interaction & Change Ledger?

It does **not** answer what the user said. That remains in authenticated product data.

## Structural privacy rule

`runInstrumentedOperation` does not accept a command/body/payload argument.

Private work executes inside a closure:

```text
private command + application service
             ↓ inside closure only
runInstrumentedOperation
             ↓ receives only result + opaque trace IDs
TechnicalTelemetryEvent
```

The instrumentation boundary therefore cannot accidentally serialize raw Capture text merely because the command object contains it.

Allowed trace references remain the small `TechnicalTraceReferences` contract.

## Success semantics

A normal successful operation emits:

- operation name
- `SUCCESS` unless the caller deliberately returns another successful business outcome
- duration
- release/runtime provenance
- optional opaque trace references

Proposal rejection is a successful no-write product action, so a future rejection transport may emit telemetry outcome `REJECTED` while still returning the normal application receipt.

## Failure semantics

The wrapper always rethrows the **original** application error.

A caller may classify a known failure into:

- REJECTED
- UNAVAILABLE
- FAILED

plus a stable machine `errorCode`.

If there is no deliberate classification, telemetry uses:

`UNCLASSIFIED_OPERATION_FAILURE`

Raw exception text is never copied into telemetry.

## Telemetry must not control product correctness

A telemetry sink is observability infrastructure, not part of Life OS's canonical transaction.

Therefore:

- successful application work remains successful if the telemetry sink throws;
- failed application work still throws the original application error if the telemetry sink throws;
- no telemetry emit can commit, roll back or authorize a Life OS mutation.

This keeps the product functional when observability is degraded.

## Timing

V1 accepts an injected timer so tests and later request composition can measure operation duration without embedding platform clocks into domain services.

The wrapper emits:

- one technical timestamp;
- rounded non-negative duration in milliseconds.

Timing is technical telemetry only and never becomes a Life Timeline event.

## Intended future use

When authenticated private HTTP routes are introduced, their composition layer can wrap existing application services:

```text
HTTP/auth boundary
      ↓
trusted request context
      ↓
runInstrumentedOperation
      ↓
Capture / Review / Apply / Reject / Ledger service
      ↓
opaque result references
      ↓
technical event
```

The route must not pass raw request bodies into the telemetry wrapper.

## V1 tests

Tests prove:

- private command text used inside work is absent from telemetry;
- success returns the exact application result;
- known business rejection is represented with a stable code while original error is rethrown;
- unclassified errors expose only a generic code;
- telemetry sink failure cannot turn application success into failure;
- telemetry sink failure cannot replace the original application error;
- a successful proposal rejection can use technical outcome `REJECTED` without pretending the operation failed.

## Not introduced

- private HTTP routes
- request/response logging
- telemetry persistence/vendor
- automatic operation instrumentation via magic middleware
- user analytics
- production retention policy
- raw error logging
- Supabase/Railway external resources

V1 only establishes the safe application observation primitive that future transport composition can use.
