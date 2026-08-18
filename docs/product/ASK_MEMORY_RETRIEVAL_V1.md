# Life OS — Ask + Canonical Memory Retrieval V1

**Canonical basis:** `LIFE-OS-CANON-001` v1.2.0  
**Extends:** `ASK_LIFE_OS_RETRIEVAL_V1.md`, `MEMORY_ACTIVATION_CONSOLIDATION_V1.md`  
**Change class:** ALIGNED refinement of Ask, Memory, and provenance  
**Status:** binding V1 implementation specification

## Product outcome

Ask Life OS can use explicitly retained Memory as source-visible reflection evidence.
This closes the deliberate omission in the original Ask V1 contract, which shipped
before a canonical persisted Memory model existed.

The user can ask about prior learning or experience and inspect both the retained
Memory revision and the Review or Journey Practice source that gave it meaning.
Current Direction, Calendar facts, Journey decisions, and other owning domains still
outrank retained reflection. The answer remains `AI OBSERVATION · READ ONLY`.

## Non-negotiable authority rules

1. Retained Memory enters Ask only as `MEMORY · REFLECTION`.
2. Retention, revision, and recency do not make a Memory item a fact or decision.
3. Ask never reads a Memory candidate or superseded Memory revision.
4. Ask never retains, revises, links, merges, deletes, or promotes Memory.
5. The underlying source domain, entity identity, label, and time remain visible.
6. Current owner sources continue to outrank conflicting retained reflection.
7. Contradicting Memory remains unresolved evidence; AI cannot select a winner.
8. No vector, embedding, similarity score, confidence score, or hidden ranking value
   is sent to the provider or exposed in the UI.
9. No conversation, retrieval trace, prompt, answer, or Memory text is persisted.
10. The Memory capability remains independently disabled by default.

## Runtime composition

The existing Ask capability remains controlled by:

```text
LIFE_OS_AI_RETRIEVAL_ENABLED=true
```

Canonical Memory joins its context package only when the separately reviewed Memory
capability is also enabled:

```text
LIFE_OS_MEMORY_ENABLED=true
```

When Memory is disabled, Ask retains its existing source-bounded behavior. When both
are enabled, startup readiness additionally proves forced RLS, non-ownership, and
`SELECT` access for `memory_item`. Missing Memory readiness prevents the private
runtime from accepting traffic; it does not silently substitute sample data.

## Retrieval boundary

For one authenticated Ask request, application code requests the current user's
Memory overview using the same validated time zone and server-owned instant used by
the response. It consumes only `overview.items`.

The following are deliberately excluded from the provider package:

- candidate reflections awaiting a retention decision;
- trusted-now references already retrieved from their canonical owners;
- superseded Memory history;
- monthly/weekly compression already owned by Reviews;
- Memory relationship graph expansion;
- Memory write metadata such as request IDs or fingerprints.

At most six current retained Memory items may enter the existing twenty-four-source
Ask package.

## Deterministic selection

Application code normalizes question words to lower-case alphanumeric tokens and
ignores short/common routing words. It compares those tokens with Memory title,
body, kind, relationship, and source label.

Items with more matching tokens are selected first. Ties use source time, then stable
root identity. If no word matches, the same stable source-time order supplies a small
fallback set. The numeric overlap count is internal selection mechanics only: it is
not sent to the model, returned by the API, or displayed as relevance/confidence.

Mode-aware domain ordering then places Memory without changing authority:

| Mode | Memory position |
|---|---|
| `ASK` | after current owners, before ordinary Reviews |
| `REFLECT` | beside Reviews, before lower-priority raw context |
| `DECIDE` | below current decisions/facts and NOT NOW posture |
| `REVIEW` | below Reviews, Calendar, and Journey evidence |
| `RESET` | below Direction, Drift, Journey, and immediate Calendar |
| `PLAN` | below Calendar, Direction, and Journey constraints |
| `CHALLENGE` | below current decisions and NOT NOW posture |

## Context source contract

A retained Memory becomes one `AiContextSource`:

```json
{
  "sourceId": "memory:memory-root-1:revision:2",
  "domain": "MEMORY",
  "authorityClass": "REFLECTION",
  "title": "Retained learning · Room tone reveals layering choices",
  "excerpt": "A short A/B comparison makes environmental layers easier to hear…",
  "occurredAt": "2026-08-10T11:00:00.000Z",
  "memoryProvenance": {
    "rootId": "memory-root-1",
    "itemId": "memory-item-2",
    "revision": 2,
    "kind": "LEARNING",
    "relationship": "NEW",
    "sourceDomain": "JOURNEY_PRACTICE",
    "sourceEntityId": "practice-completion-1",
    "sourceLabel": "Journey practice · ENVIRONMENTAL SOUND",
    "sourceOccurredAt": "2026-08-08T11:00:00.000Z"
  }
}
```

The provider receives this provenance as untrusted data under the existing no-tools,
no-store instruction boundary. The model may cite only the application-owned
`sourceId` and cannot alter the UI's domain or authority label.

## UI

Ask source cards for retained Memory show:

- `MEMORY · REFLECTION`;
- current Memory revision and kind;
- relationship label;
- retained text excerpt;
- exact Review or Journey Practice source label and source time;
- cited/retrieved status owned by the validated provider response.

The answer boundary continues to state that nothing changed and the exchange did not
create a Memory item or saved conversation.

## Database and privacy

- No migration or table change is introduced.
- Reads use the existing non-owner, `NOBYPASSRLS`, user-scoped application pool.
- Readiness conditionally includes `memory_item` only when Memory is enabled.
- Real PostgreSQL tests prove cross-user isolation and zero Ask writes.
- Technical telemetry contains no question, answer, Memory text, source text, user
  identity, or provider detail.

## Acceptance checks

1. Ask works without Memory when only Ask is enabled.
2. Both flags compose current retained Memory and no candidates/history.
3. At most six Memory items and twenty-four total sources reach the provider.
4. Memory sources remain `REFLECTION` with exact revision/source provenance.
5. Direction/fact/decision authority is never weakened by Memory recency.
6. Contradicting Memory is labeled and not resolved by application code.
7. Provider citations remain restricted to supplied source IDs.
8. RLS prevents one user from retrieving another user's Memory.
9. The request performs no database write or domain event.
10. The real UI shows no synthetic personal data.
11. Phone, tablet, and desktop source cards remain usable.
12. No hosted flag, grant, migration, deployment, merge, or real provider call occurs.

## Safety boundary

- synthetic development data only;
- no hosted AI or Memory activation;
- no hosted grants or migrations;
- no real prompt or personal context sent to a provider;
- no deployment;
- no merge;
- the pull request remains draft through verification.
