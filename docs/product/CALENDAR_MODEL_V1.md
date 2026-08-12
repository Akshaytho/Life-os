# Calendar V1 — Time-Bound Reality Model

**Canonical artifact:** `LIFE-OS-CANON-001` v1.1.0  
**Classification:** EXTENSION + REFINEMENT  
**Status:** implementation design

## Product question

Calendar answers: **What does my real life occupy across time, and what room remains?**

It is not a Google Calendar clone and it is not the owner of every life fact. Calendar owns things that have or may have a time boundary: commitments, appointments, plans, sessions, travel, work, social time, health time, rest, learning and other dated intent.

## Input routing

The user does not have to manually open Calendar to create calendar-shaped information.

Life OS AI may interpret natural-language input and route it toward Calendar when appropriate.

Examples:

- `Gym tomorrow after office` -> proposed dated event; Life OS AI can ask for/derive a useful time and surface conflicts before confirmation.
- `My friend may visit Saturday` -> tentative plan, not automatically a fixed event.
- `My friend confirmed Saturday 8 PM` -> confirmed event candidate.
- `I want to travel to Goa next month` -> travel idea/plan until commitment is clear; not automatically a multi-day calendar block.
- `I booked Goa Sep 12-16` -> dated travel commitment.
- `I want to learn sound today` -> may create or propose a learning window, while Journey owns the learning/capability evidence itself.

The Calendar UI must make proposed/tentative/confirmed state visible. Natural-language routing can be intelligent; authority changes cannot be silent.

## Core event shape for design

A calendar item can vary without requiring a new UI design:

- id
- date / date range
- start/end time when known
- all-day / time-window / exact-time form
- title
- category
- commitment level
- status: tentative / confirmed / completed / cancelled
- origin: user / Life OS AI / external calendar / imported source
- related domain references (journey, reel, health record, travel plan, etc.)
- provenance

Calendar does not need to duplicate the full related-domain record. A creator learning event can link to Journey; a doctor appointment can link to health context; a trip can link to Travel/Memory while Calendar owns its dated span.

## Four temporal lenses

The same raw events must not simply be rendered as the same list at different scales.

### Day — capacity

Question: **Where is my time actually occupied today?**

Representation:

- proportional time plane
- fixed/important/flexible/optional distinction
- open gaps remain visible
- now marker
- events may expand for detail
- conflicts/overlaps can become an attention layer

### Week — rhythm

Question: **What kind of week am I living?**

Representation:

- seven-day rhythm field
- each day shows occupied/open density and dominant categories
- commitments are compressed into bands rather than tiny event cards
- unusual pressure, travel, social concentration or recovery gaps should be recognizable

Week is useful for Life OS AI planning because it exposes capacity before proposing more activity.

### Month — texture

Question: **What shaped this month?**

Representation:

- calendar geometry remains recognizable, but cells carry texture rather than full event detail
- intensity/occupancy + meaningful category marks
- major commitments/trips/health events remain legible
- ordinary repeated work does not dominate every cell with duplicated text
- selecting a day reveals a summary, not every event at once

### Year — seasons

Question: **How did life distribute across the year?**

Representation:

- months as compressed seasons
- meaningful spans and category pressure rather than individual appointments
- trips, major work periods, health periods, creator phases, rest periods and life events can become long-range landmarks
- year view is orientation/history, not scheduling precision

## Progressive disclosure

Calendar obeys the canonical `short UI, deep data` rule.

### Glance

Time, title, category, commitment/status.

### Summary

Reason/notes, related domain, provenance, planning consequences.

### Full context

Original user input or source event, linked records, reschedule history, related decisions/events, and Ask Life OS access.

## Life OS AI relationship

Life OS AI is the native calendar/planning assistant.

It can:

- parse time-bound intent
- detect missing certainty/time
- expose conflicts
- propose rescheduling
- answer schedule questions
- explain why Today changed
- plan around fixed commitments
- keep tentative plans tentative

Calendar should expose an in-context `Ask Life OS` entry point, but Life OS must remain navigable without AI.

## ChatGPT relationship

ChatGPT is not needed for routine calendar management.

A deep ChatGPT conversation may return a structured plan proposal to Life OS, but Calendar receives only the appropriate dated consequences after Life OS applies authority/approval rules.

## Adaptive UI requirements

The design must handle:

- zero events and very busy days
- events without exact times
- multi-day travel
- long titles
- multiple categories in a day
- overlapping commitments
- tentative plans
- repeated work blocks
- user-defined future categories without layout redesign
- months/years with large histories

Sample event names, current creator phase and current routine are not product doctrine.

## V1 prototype scope

This prototype is read-only/sample-data-only and demonstrates:

- Day capacity lens
- Week rhythm lens
- Month texture lens
- Year seasons lens
- routed-plan inbox showing tentative/proposed interpretation
- provenance and commitment semantics
- real Calendar navigation from Today/Journey

No actual Life OS AI parsing, writes, database, external calendar sync or scheduling mutation is implemented yet.
