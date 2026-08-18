# Life OS — Composed Today Orientation V1

**Canonical basis:** `LIFE-OS-CANON-001` v1.2.0  
**Extends:** `LIVE_TODAY_READ_V1.md`, `DESIGN_SYSTEM_V2.md`  
**Change class:** ALIGNED composition of existing canonical owners  
**Status:** binding V1 implementation specification

## Product outcome

Today stops behaving like a Calendar-only status page and becomes the quiet daily
orientation surface promised by the canonical doctrine. It composes existing,
separately reviewed private reads without creating a new owner of truth.

The opening order is:

1. current Direction as a quiet compass heading;
2. Calendar reality now and next;
3. one deliberately small focus signal with its reason and trust class;
4. active Journey capability and current/recent practice evidence;
5. unresolved Drift/return posture when one exists;
6. at most one retained Journey learning as optional `REFLECTION` context;
7. the existing Daily Log / Evening Return surface.

## Authority rules

1. Today is a projection. It owns none of the source records it displays.
2. Direction and Journey activation remain `DECISION`.
3. Calendar and practice evidence remain `FACT`.
4. Drift understanding/return posture remains the user's `DECISION`.
5. Retained Memory and Daily Return remain `REFLECTION`.
6. A small Journey experiment derived by Today is visibly `SUGGESTION`, never a
   task, commitment, schedule change, or proof of progress.
7. Calendar constraints outrank the suggestion.
8. Today never chooses a new direction, starts practice, changes Calendar, resolves
   Drift, promotes Memory, or writes a focus item.
9. Empty source state remains empty; no sample personal state appears on the real
   route.
10. No score, streak, percentage, fake mastery, or judgmental day grade appears.

## Composition boundary

The browser already owns one authenticated Life OS session. When
`NEXT_PUBLIC_LIFE_OS_TODAY_COMPOSITION_ENABLED=true`, it reads in parallel from the
existing RLS-scoped endpoints for Direction, Calendar, Journey, Drift, and Memory.
The API remains the owner of authentication, user scoping, source validation, and
authority labels.

This slice adds no database table, migration, write route, provider call, or AI
authority. The browser flag is only enabled after all corresponding server
capabilities have passed their independent readiness checks. A failed source read
produces an explicit unavailable state rather than a sample fallback.

## Deliberate focus derivation

Exactly one focus signal may be shown:

1. a current fixed Calendar event → protect the current commitment (`FACT`);
2. an active Journey practice session → finish or deliberately stop that session
   (`FACT` plus neutral orientation copy);
3. an imminent next Calendar event → leave capacity for the commitment (`FACT`);
4. otherwise, an active Journey capability → one small experiment using the active
   technique (`SUGGESTION`).

The derivation is deterministic and local to the projection. It is not persisted and
does not appear in Calendar, Journey, Memory, or the Interaction Ledger as a change.

## Memory boundary

Today does not become a Memory feed. It may show at most one current retained Memory
whose exact source is Journey Practice. The card is quiet, labeled `REFLECTION`, links
to Memory, and explains that it is useful context rather than today's instruction.
Candidates, contradictions, unrelated retained items, and superseded history do not
appear.

## UI and responsive contract

- Direction is a compact compass strip, not a giant card.
- Now/next Calendar remains the dominant reality layer.
- Focus explains why it exists and names its authority.
- Journey shows active capability and evidence without progress bars.
- Drift appears only when unresolved and offers navigation, not diagnosis.
- Retained learning is visually lower than current decisions/facts.
- The persistent phone controls cannot cover the current focus or a primary action.
- The real route remains authentication-gated and contains no synthetic personal data.
- `/visual-review/today-composed` is synthetic-only behind the visual-review gate.

## Acceptance checks

1. Composition is browser-disabled by default.
2. The existing Calendar-only Today remains available when the flag is off.
3. All reads reuse one authenticated session and existing private endpoints.
4. Current owners retain their domain and authority labels.
5. Focus follows the deterministic precedence and creates no write.
6. At most one Journey-sourced current Memory reflection appears.
7. Empty and failed states invent nothing.
8. Daily Return remains its own explicit write boundary.
9. Phone, tablet, and desktop renders preserve hierarchy and dock clearance.
10. No hosted flags, real data, deployment, merge, migration, or grant is changed.

## Safety boundary

- synthetic visual data only;
- no hosted activation;
- no provider call;
- no new write authority;
- no deployment;
- no merge;
- the pull request remains draft through verification.
