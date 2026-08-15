# Trusted AI Interpretation V1

## Purpose

Life OS may use an external model to interpret a newly persisted Capture, but model output remains lower-authority interpretation. The user remains the decision authority and application code remains the policy authority.

The flow is:

```text
USER SOURCE -> AI semantic interpretation -> application policy mapping -> OBSERVATION / SUGGESTION -> user decision -> reviewed commit boundary
```

## Activation

Trusted AI interpretation is disabled by default. It activates only when `LIFE_OS_AI_INTERPRETER_ENABLED=true` and the server has both an explicit model selection and provider credential configured. Merely configuring a provider credential does not enable the feature.

When disabled, Life OS keeps the existing `SafeFallbackCaptureInterpreter` behavior.

When enabled, provider failure, refusal, malformed output, or timeout falls back to the same SafeFallback result. The raw Capture has already been persisted before interpretation begins, so provider failure does not discard the user's source.

## Privacy boundary

V1 sends only the current raw Capture and its trusted request timestamp for semantic interpretation. It does not send prior memories, database rows, Calendar state, profile context, browser credentials, or database credentials.

The provider request disables response application-state storage, requests no tools, and uses strict structured output. Provider-side data policies remain an external account concern; V1 does not claim that every provider operational retention category is zero.

## Model authority ceiling

The model is not allowed to choose:

- destination/operation pairs directly;
- durable proposal IDs;
- proposed trust class;
- approval mode;
- proposal state;
- applied/rejected status;
- database commands or canonical entities.

The model returns only semantic observations and one of a small set of route kinds. Application code maps those route kinds into the real Life OS proposal contract.

## Route policy

| Semantic route | Life OS owner / operation | Authority outcome in V1 |
|---|---|---|
| Calendar plan | Calendar / create plan | explicit confirmation, needs confirmation |
| Learning evidence | Journey / record learning | proposed suggestion |
| Memory observation | Memory / record memory | proposed suggestion |
| Reflection | Memory / record reflection | proposed suggestion |
| Decision | Memory / record decision | explicit confirmation, needs confirmation |
| Drift signal | Drift / start return flow | proposed suggestion |
| Not now | Not Now / park idea | proposed suggestion |
| Direction reconsideration | You / reconsider direction | high-authority, needs confirmation |
| Raw capture | Brain Dump / keep raw capture | proposed suggestion |

## No model-generated ready state

No `LIFE_OS_AI` proposal can become `READY_TO_APPLY` in V1, even if model confidence is high or Calendar fields look complete.

This is deliberate: model confidence is not user authority, time resolution does not yet have a trusted user-timezone resolver, and most domains do not yet have reviewed canonical commit endpoints.

A later proposal-enrichment/confirmation slice may resolve missing details using deterministic policy and explicit user input. Semantic interpretation itself will not grant commit readiness.

## Calendar interpretation

The model may suggest partial title, start, end, category, and commitment fields. Application code copies only supported non-null Calendar fields into the proposal payload. It never copies the raw Capture into proposal payload fields such as `rawText` or `sourceText`.

The proposal remains `NEEDS_CONFIRMATION`.

## Prompt-injection resistance

Provider instructions treat raw Capture as untrusted source data. Security does not depend on prompt obedience alone:

1. structured output does not contain authority fields;
2. runtime validation rejects extra/malformed fields;
3. application code owns route-to-domain and authority mapping;
4. `captureAndPropose` independently validates interpreter output before persistence;
5. Apply/Reject endpoints independently revalidate identity, ownership, proposal state, and approval policy.

Therefore a Capture that asks the model to mark itself applied cannot directly produce an applied canonical change.

## Health observations

The provider is instructed not to diagnose. It may classify a user-reported health experience as a memory observation, but its wording remains interpretation and suggestion rather than medical truth.

## Acceptance criteria

- SafeFallback remains the default.
- AI requires explicit enablement and explicit model selection.
- Provider calls are server-side only and tool-free.
- Structured output is strict and bounded.
- Provider credentials are not included in request bodies or model output.
- The model cannot choose trust class, approval mode, proposal state, or arbitrary operation pairs.
- No AI proposal becomes `READY_TO_APPLY` in V1.
- Direction reconsideration always maps to high-authority confirmation.
- Non-Calendar routes cannot smuggle Calendar payload into persisted proposals.
- Failure/refusal/malformed output becomes SafeFallback.
- Provider/source error detail is not surfaced through interpreter errors.
- Existing Capture proposal validation and transaction boundaries remain authoritative.
- No new canonical write endpoint or database privilege is introduced.
