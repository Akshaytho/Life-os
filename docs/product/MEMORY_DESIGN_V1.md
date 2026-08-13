# Life OS — Memory Design V1

**Canonical artifact:** `LIFE-OS-CANON-001` v1.2.0  
**Architecture:** `docs/architecture/MEMORY.md`  
**Classification:** ALIGNED + REFINEMENT  
**Status:** sample/read-only visual slice

## Product question

**What do I need to remember, and how much should I trust it?**

Memory is a trustworthy recall surface. It is not a chronological feed, a diary dump, a vector-search console, or a second owner of direction/calendar/journey state.

## Ownership boundary

Memory can **retrieve and reference** current truth, but it does not steal ownership from the domain that makes that truth canonical.

Examples:

- current direction / constitution / major active decisions → owned by **You**
- active journey / capability → owned by **Journey**
- dated commitments → owned by **Calendar**
- what matters today → owned by **Today**
- how a Life OS interaction led to a change → owned by the cross-cutting **Interaction & Change Ledger**

Memory owns the ability to preserve, compress, retrieve, connect and inspect historical/derived context across those domains.

## Durable top-level hierarchy

The top-level Memory screen must remain useful after years of data.

### 1. Recall instrument

Memory should open with the mental model:

> Find the right memory, at the right authority.

V1 shows a read-only/sample recall prompt. A later intelligent retrieval flow can accept natural language, but the screen must not fake live semantic search before persistence/retrieval exists.

The recall instrument should make clear that Memory can move from a compact answer to source context rather than showing everything at once.

### 2. Trusted now

A compact reference layer for a few truths that matter to recall correctly **right now**.

Each item shows:

- value
- authority class
- owning domain
- provenance / last confirmed source

This is an index into canonical truth, not a duplicate canonical store.

Sample examples may include:

- chosen direction → owner `YOU`, authority `DECISION`
- active capability → owner `JOURNEY`, authority `CURRENT STATE`
- next meaningful commitment → owner `CALENDAR`, authority `FACT`

Do not render every current state item here.

### 3. Worth keeping

Selected historical evidence that is likely to matter later:

- learning
- reflection
- experience
- decision/history
- important person context

This is **not** every event. Selection is based on meaning/retrieval value, not streaks, scores or engagement.

Every memory shows its type, date and source/provenance.

### 4. Time compression

Long-range recall follows:

`month → week → day → source`

The overview should expose the compressed shape of time rather than a giant timeline.

V1 can show one monthly summary with a few weekly summaries underneath. The summaries are visibly derived/compressed context; they are not presented as canonical facts.

At future year scale, the same model becomes:

`year → month → week → day → evidence`

Calendar owns the temporal commitments themselves. Reviews own the act of compression. Memory makes those review summaries retrievable as long-range context.

### 5. Derived patterns

Patterns are useful but lower authority.

Each pattern must show:

- `DERIVED PATTERN` / `OBSERVATION`
- evidence window
- evidence count or sources when useful
- no automatic canonical action

A pattern must never visually look equivalent to an active decision or confirmed fact.

## Authority representation

Top-level Memory should preserve the canonical default order:

1. active structured state
2. active explicit decisions
3. constitution/principles
4. confirmed facts/events
5. user reflections
6. derived patterns
7. raw conversations
8. AI hypotheses

The UI does not need to print this list literally. It must express the distinction through labels, hierarchy and provenance.

Recency is not authority.

## Progressive disclosure

Memory follows the canonical rule:

**Life OS stores depth; the UI shows compression; AI helps the user move between them.**

Three practical levels:

### Glance

- memory title/value
- authority/type
- owner/source

### Summary

- why it matters
- evidence / contradiction / uncertainty
- related period or domain

### Full context — later drill-down

- source record/conversation/review/event
- memory versions
- related decisions
- contradictions
- retrieval trace
- ask Life OS AI / ChatGPT

V1 top-level stays at Glance + selected Summary. It does not attempt the full source browser yet.

## Contradictions

Memory must not silently resolve contradictions.

A later contradiction surface can show:

```text
ACTIVE DECISION
Sound Design remains current capability

RECENT REFLECTION
Maybe another capability should come first
```

The reflection stays historical/unresolved until the user makes a superseding decision.

V1 should not invent a contradiction just to fill the sample screen.

## Visual metaphor

**A memory observatory / recall instrument.**

Not a notebook app and not an archive database.

Use the existing Life Instrument world:

- warm operating canvas
- deep-ocean recall instrument
- coral only for active attention/action
- mono authority/provenance labels
- strong sans typography
- generous spacing
- time compression represented spatially rather than as equal cards

Memory should feel quieter than Today and less craft-instrument dense than Journey.

## Mobile hierarchy

The first phone viewport should establish:

1. Memory / private sample state
2. the recall question/instrument
3. beginning of `TRUSTED NOW`

The bottom dock must not obscure recall controls or the first trust anchor.

Long-term summaries stack vertically. Do not build a tiny desktop timeline on mobile.

## Desktop hierarchy

Use horizontal space to make relationships clearer:

- recall instrument spans the working field
- `Trusted now` can form a horizontal authority strip
- `Worth keeping` + compressed time can relate side-by-side where useful
- derived patterns remain visually lower authority

Avoid a centered narrow phone layout floating inside empty desktop space.

## Interaction boundary V1

V1 is sample/read-only:

- recall input is visually present but disabled/read-only
- source/open-detail controls may be present but disabled where no destination exists
- no semantic/vector search
- no memory promotion
- no deletion/supersession
- no canonical writes
- no AI retrieval call

This prevents the UI from claiming retrieval/persistence capability before it exists.

## Sample data rules

Use synthetic/non-sensitive data only.

Sample content demonstrates data shape, not doctrine. The layout must survive:

- short/long memory titles
- missing optional provenance detail
- different memory types
- different number of weekly summaries
- no derived pattern state
- multiple future years of summaries

## Acceptance checks

- In five seconds, the user understands Memory is about trustworthy recall rather than a feed.
- Current truth references visibly name their owning domain.
- A derived pattern cannot be mistaken for a fact or decision.
- The page shows long-range compression without dumping every event.
- Historical items preserve type/date/source.
- No fake score, streak, mastery percentage or memory confidence meter appears.
- No vector similarity score appears.
- No sample content silently becomes a new product rule.
- Memory navigation becomes live while `You` remains disabled.
- 390, 430, 768 and 1440 real browser renders are inspected before merge.

## Canonical comparison

- **ALIGNED:** Memory preserves current truth, historical evidence, retrieval and derived understanding.
- **ALIGNED:** Memory is not a chronological dump.
- **ALIGNED:** active state/decisions outrank reflection/pattern/raw conversation.
- **ALIGNED:** vector retrieval is not authoritative and is not exposed as a score.
- **ALIGNED:** long-range retrieval uses summary hierarchy.
- **ALIGNED:** contradictions are not silently solved.
- **ALIGNED:** short UI / deep data uses progressive disclosure.
- **REFINEMENT:** top-level Memory is defined as a recall surface that references canonical owners rather than duplicating their ownership.
- **NO CONFLICT:** `You`, Calendar, Journey, Today and Interaction Ledger responsibilities remain unchanged.
