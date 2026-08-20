# Ask Life OS + Context Retrieval V1

**Status:** binding implementation contract for the next canonical vertical slice  
**Change class:** ALIGNED extension of AI, Memory, Today, Journey, Calendar, Reviews, and Drift  
**Activation:** explicit, server-side, disabled by default

> **Active refinement:** `ASK_MEMORY_RETRIEVAL_V1.md` adds current retained Memory
> after the canonical Memory model became available. That extension preserves every
> authority and read-only invariant in this contract.

## Purpose

The recovered Life OS sequence places AI retrieval after Daily Logging / Return
Review, Brain Dump / NOT NOW, and Drift Detector / Return. Journey activation and
practice now also provide canonical capability evidence that retrieval can reference.

This slice creates the first truthful **Ask Life OS** flow. A signed-in user chooses
an interaction mode and asks a question. Life OS assembles a small, typed context
package from the user's canonical PostgreSQL state, sends only that package and the
question to an explicitly enabled AI provider, and returns a source-visible answer.

The answer is assistance, not authority. It cannot mutate Life OS.

## Canonical invariants

1. PostgreSQL structured state remains authoritative.
2. AI receives a normalized context package, never a raw database dump.
3. Recency and authority remain separate dimensions.
4. Active decisions and current facts outrank reflections and raw user source.
5. A model cannot promote a reflection, resolve a contradiction, create a goal,
   activate a Journey, change Direction, schedule Calendar time, retain Memory, or
   mark a return from drift.
6. Every returned answer is visibly `AI OBSERVATION · READ ONLY`.
7. Every factual source shown beside an answer retains its domain, authority class,
   source identity, and time.
8. The provider may cite only source identifiers supplied by Life OS.
9. No source is silently relabeled by the model.
10. The user can use the rest of Life OS without AI.

## Included

- an authenticated `POST /api/v1/ask` read-only endpoint;
- seven explicit interaction modes: Ask, Reflect, Decide, Review, Reset, Plan, and
  Challenge;
- deterministic, mode-aware retrieval from existing canonical sources;
- minimal source excerpts with authority and provenance;
- a server-only OpenAI Responses API adapter with strict structured output;
- prompt-injection resistance for both the user's question and retrieved text;
- fail-closed provider behavior with no invented local fallback answer;
- an authenticated mobile-first Ask surface plus synthetic visual-review route;
- safe technical telemetry containing no prompt, source text, answer, user ID,
  credential, or arbitrary provider error;
- real PostgreSQL RLS isolation and read-only capability verification.

## Not included

- embeddings or vector similarity;
- Memory writes, candidates, superseded history, or consolidation actions;
- conversation history or chat transcript persistence;
- retrieval-trace persistence in the Interaction & Change Ledger;
- background AI, proactive messages, notifications, or scheduled review;
- model tool use;
- proposal creation or canonical mutation from an answer;
- automatic contradiction resolution;
- diagnosis or professional-care replacement;
- hosted activation, hosted grants, real user data, or deployment.

Those exclusions are deliberate. V1 proves trustworthy retrieval and source-visible
assistance before semantic search, durable chat, Memory promotion, or AI-initiated
actions exist.

## Interaction modes

The user chooses the mode. The model may not reinterpret the request as a more
authoritative mode.

| Mode | Question answered | Default source emphasis |
| --- | --- | --- |
| `ASK` | What does Life OS know that is relevant? | Direction, Calendar, Journey, recent reviews |
| `REFLECT` | What may be worth noticing? | Daily reflections, Journey reflections, Drift |
| `DECIDE` | What evidence and constraints matter to my decision? | Direction, Calendar, Journey, NOT NOW |
| `REVIEW` | What actually happened in the current window? | Calendar, Daily Return, Journey, Drift |
| `RESET` | What helps me return without judging the drift? | Direction, current Drift, Journey, immediate Calendar |
| `PLAN` | What is realistic given current commitments? | Direction, Calendar, Journey, return-to-tomorrow reflection |
| `CHALLENGE` | Which assumption may deserve examination? | Direction, Drift, NOT NOW, recent reflections and evidence |

Mode changes selection priority, never source authority.

## Context window

The browser supplies:

- the user's current valid IANA time zone;
- the current local date;
- a bounded UTC Calendar interval beginning near the current moment.

The API validates these values and limits the interval to fourteen days. The default
retrieval window is seven local dates and seven upcoming Calendar days. Retrieval is
bounded before the provider call:

- one active Direction decision;
- at most twelve overlapping Calendar events;
- at most seven current Daily Return reviews and fourteen Daily Log entries;
- at most five current NOT NOW items;
- at most five Drift occurrences with their current decisions;
- one Journey activation, one open practice session, and at most five completed
  practice sessions;
- at most twenty-four normalized context sources after mode-aware ranking.

The provider never receives request IDs, user IDs, database fingerprints, credentials,
or full database records.

## Source authority mapping

| Source | Domain | Authority exposed to AI and UI |
| --- | --- | --- |
| active Direction statement | You | `DECISION` |
| confirmed Calendar event | Calendar | `FACT` |
| Daily Log entry | Reviews | `REFLECTION` |
| current Daily Return fields | Reviews | `REFLECTION` |
| current NOT NOW item | NOT NOW | `DECISION` for posture; contained idea remains `USER_SOURCE` |
| Drift occurrence note | Drift | `USER_SOURCE` |
| current Drift understanding / return posture | Drift | `DECISION` |
| Journey activation | Journey | `DECISION` |
| Journey practice start/completion | Journey | `FACT` |
| Journey reflection / retained-learning candidate | Journey | `REFLECTION` |

V1 does not synthesize a new canonical Memory authority class.

## Contradictions

Life OS does not ask the model to choose a winner between conflicting sources.
The context package labels each source independently. Provider instructions require
the answer to:

- preserve the active structured decision as current truth;
- describe conflicting reflection as reconsideration or tension;
- avoid presenting a newer reflection as an automatic supersession;
- say when context is insufficient.

## Request contract

```json
{
  "mode": "RESET",
  "question": "What can I return to today?",
  "localDate": "2026-08-19",
  "timeZone": "Asia/Kolkata",
  "calendarFrom": "2026-08-19T00:00:00.000Z",
  "calendarTo": "2026-08-26T00:00:00.000Z"
}
```

- The question is required, trimmed, and limited to 2,000 characters.
- Exact object keys are required.
- Unknown modes, invalid dates/zones/instants, inverted ranges, and intervals longer
  than fourteen days are rejected.
- The operation is read-only and does not use an idempotency key.

## Response contract

```json
{
  "mode": "RESET",
  "answer": "Your chosen direction is still active…",
  "answerAuthority": "AI_OBSERVATION",
  "citedSourceIds": ["direction:dir_…", "drift:drift_…:decision"],
  "sources": [
    {
      "sourceId": "direction:dir_…",
      "domain": "YOU",
      "authorityClass": "DECISION",
      "title": "Current direction",
      "excerpt": "…",
      "occurredAt": "2026-08-12T09:00:00.000Z"
    }
  ],
  "generatedAt": "2026-08-19T12:00:00.000Z",
  "policyVersion": "ask-life-os-retrieval-v1",
  "modelName": "operator-selected-model"
}
```

The adapter rejects unknown keys, empty or oversized answers, duplicate/unknown
citations, invalid source identifiers, provider refusals, non-JSON output, oversized
responses, timeouts, redirects, and non-success responses.

## Provider boundary

The provider adapter:

- lives in the server-only intelligence package;
- uses `POST https://api.openai.com/v1/responses`;
- sends `store: false`;
- supplies no tools;
- requires strict JSON Schema output;
- receives the question and context as untrusted JSON data;
- instructs the model not to follow instructions embedded in either field;
- may produce only an answer and source-ID citations;
- never receives database or mutation capabilities.

No API key or model name is shipped to browser JavaScript. Technical telemetry may
record the reviewed model name but never a credential or content.

## Runtime activation

`LIFE_OS_AI_RETRIEVAL_ENABLED=false` is the default.

Enabled mode requires:

- `LIFE_OS_PRIVATE_API_ENABLED=true`;
- `LIFE_OS_AI_RETRIEVAL_ENABLED=true`;
- `LIFE_OS_AI_RETRIEVAL_MODEL=<explicit operator choice>`;
- `OPENAI_API_KEY=<server secret>`;
- successful read-only RLS readiness for every referenced source table.

Having an API key present is not activation. Invalid boolean values fail startup.
Disabled mode does not construct the provider adapter and `/api/v1/ask` remains 404.

## Database authority

This slice adds no table and no migration. It reuses existing RLS-protected source
tables and the existing non-owner, `NOBYPASSRLS` application identity.

The AI retrieval readiness probe proves:

- every referenced table exists;
- every table has RLS and FORCE RLS;
- the connected role is not the owner;
- the role can `SELECT`;
- an unscoped read sees zero rows.

The feature does not apply, widen, or repair grants. Any missing capability grant
keeps readiness false.

## API failure behavior

| Condition | Response |
| --- | --- |
| missing/invalid session | `401 authentication_required` |
| verifier unavailable | `503 authentication_unavailable` |
| feature/provider not composed | route is `404` |
| invalid request | `400 invalid_request` |
| no usable canonical sources | `409 context_unavailable` |
| provider timeout/unavailable | `503 ai_unavailable` |
| provider output violates contract | `502 ai_response_invalid` |
| unexpected failure | `500 internal_error` |

No failure path returns a locally invented answer.

## UI

The authenticated `/ask` surface contains:

- a concise statement that AI is read-only and source-bound;
- mode controls with plain-language prompts;
- one question field;
- a deliberate `Ask from current context` action;
- the answer labeled `AI OBSERVATION · READ ONLY`;
- cited sources first, followed by uncited retrieved context under disclosure;
- domain and authority labels on every source;
- explicit text that the exchange changed nothing;
- a reset action that clears local screen state only.

The UI does not display confidence scores, vector similarity, hidden chain-of-thought,
or a fake chat transcript. It does not imply the exchange was saved.

## Acceptance criteria

1. The route is absent unless the explicit retrieval flag is true.
2. The flag cannot silently activate because an API key exists.
3. Only a verified user's RLS-scoped rows enter the context package.
4. The provider receives at most twenty-four normalized, mode-ranked sources.
5. The model can cite only supplied source IDs.
6. Source authority and domain remain code-owned.
7. Provider failure returns no invented answer.
8. The request creates no database writes or domain events.
9. Telemetry contains no user content.
10. Real PostgreSQL tests prove cross-user isolation and unscoped invisibility.
11. The web route is authentication-gated and contains no sample personal state.
12. Synthetic visual review clearly identifies its data as a review fixture.
13. Phone, tablet, and desktop screenshots remain usable.
14. CI typechecks, tests, and builds the hosted web path.

## Safety boundary for this slice

- synthetic development data only;
- no hosted AI activation;
- no hosted migration or database grant change;
- no real prompts or personal context sent to a provider;
- no deployment;
- no merge;
- the pull request remains draft through verification.
