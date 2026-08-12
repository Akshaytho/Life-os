# Life OS — Technical Telemetry V1

**Canonical artifact:** `LIFE-OS-CANON-001` v1.2.0  
**Companion:** `docs/product/INTERACTION_CHANGE_LEDGER_V1.md`  
**Classification:** ALIGNED + EXTENSION

## Product/development reason

Life OS needs two different forms of history:

1. **Interaction & Change Ledger** — private, user-facing meaning: what the user said, what Life OS understood/proposed, what the user chose, and what changed.
2. **Technical telemetry** — developer/operations evidence: which release handled an operation, whether it succeeded, how long it took, and which opaque provenance IDs connect it to a trusted product trace.

They may correlate, but they are never the same dataset or UI.

## V1 technical event types

### Runtime lifecycle

- STARTED
- STOPPING
- STARTUP_FAILED
- SERVER_FAILED

### Application/database operation

Known operations include:

- CAPTURE_AND_PROPOSE
- GET_PROPOSAL_REVIEW
- APPLY_CALENDAR_PROPOSAL
- REJECT_ROUTING_PROPOSAL
- GET_INTERACTION_TRACE
- DATABASE_TRANSACTION

Outcomes are a small machine vocabulary:

- SUCCESS
- REJECTED
- UNAVAILABLE
- FAILED

### Interpreter

Future Life OS AI interpretation telemetry may contain:

- interpreter kind
- success/failure
- proposal count
- confidence band
- duration
- routing/AI policy version
- model name when useful and permitted

It must not contain the prompt, user's text, generated explanation, raw provider response, or arbitrary model metadata.

## Allowed correlation references

Technical telemetry may use opaque IDs such as:

- correlation ID
- request ID
- Capture ID
- proposal ID
- domain event ID

These allow a permissioned developer tool to correlate:

```text
release/deployment technical event
        ↕ opaque IDs
user-visible Interaction & Change trace
```

The telemetry contract does not include `userId` by default. The life record remains the source for user-specific meaning under authenticated access.

## Explicitly forbidden from V1 telemetry

- raw Capture text
- conversation text
- proposal payload JSON
- event payload JSON
- reflection/health/relationship/travel content
- `DATABASE_URL`
- service-role keys
- API keys
- cookies / Authorization headers
- session credentials
- passwords/tokens/secrets
- arbitrary environment dumps
- arbitrary metadata bags
- raw exception/error messages

Errors use a stable machine `errorCode`, not provider/database exception text.

## Runtime safety

`serializeTechnicalTelemetry` reconstructs output from the typed allow-list instead of serializing the caller's object wholesale. Unknown runtime properties are discarded.

Opaque trace identifiers and release/model/policy identifiers are format/length checked. Free-form prose cannot be placed into those fields accidentally.

The console sink emits one JSON line per event. V1 adds no external telemetry vendor and no database telemetry table.

## Release provenance

Every normal event carries the safe `RuntimeProvenance` object:

- environment
- release SHA
- optional deployment ID
- optional service name
- platform

This is what makes before/after deployment comparison possible without copying personal content into infrastructure logs.

## API lifecycle integration

The health-only API transport emits typed runtime lifecycle telemetry for:

- STARTED
- STOPPING
- SERVER_FAILED

If bootstrap fails before valid runtime provenance exists, the process emits only a minimal fixed `BOOTSTRAP_FAILED` diagnostic. It does not invent a release/environment and does not print the underlying error.

Health requests themselves are not logged one-by-one in V1; deployment platforms can probe frequently and that noise is not useful life/product history.

## Interaction & Change Ledger relationship

Example future investigation:

```text
User: "Why did Life OS suggest this?"
        ↓
Interaction & Change Ledger
Capture / observation / suggestion / action
        ↓ correlation IDs
Technical telemetry
release SHA / policy version / operation outcome / latency
        ↓
compare previous deployment
        ↓
fix routing or UI
        ↓
new release
        ↓
observe again
```

The user-visible ledger remains interpretable even if technical telemetry is deleted. Technical telemetry cannot redefine what the user said or what became canonical truth.

## Retention / privacy direction

V1 defines shape, not production retention policy.

Before real telemetry storage is enabled, decide deliberately:

- environment-specific retention
- access permissions
- deletion policy
- sampling where needed
- whether IDs need additional pseudonymization
- how user consent/support-debug access works

Development and CI continue using synthetic data.

## Tests

V1 tests prove:

- arbitrary unknown properties cannot leak through serialization;
- private raw text/payload/provider messages are discarded;
- free-form error messages are rejected as machine error codes;
- trace references must resemble opaque technical identifiers;
- runtime secret values are not inherited from arbitrary environment state;
- console sink emits only the sanitized JSON line.

## Not introduced

- external telemetry provider
- telemetry database table
- user analytics/tracking
- session replay
- raw request/response logging
- private content logging
- automated AI model evaluation
- production retention policy
- user-visible technical console

Those require separate decisions. V1 only establishes the safe technical vocabulary and lifecycle emitter needed for future continuous development/deployment comparison.
