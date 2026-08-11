# Life OS — Design System V2

## Design intent

Life OS is a mobile-first personal operating system, not a dashboard, habit tracker, project manager, or generic AI chat wrapper. The interface should feel like a private field journal, film director's monitor, travel notebook, and personal control surface combined into one coherent product.

The design must help answer seven questions quickly:

1. Where am I going?
2. What is true today?
3. What requires my attention now?
4. What am I becoming capable of?
5. What changed?
6. Am I drifting, and how do I return?
7. What is fact versus reflection versus AI suggestion versus my decision?

Visual beauty is subordinate to those questions, but the product should still feel unusually crafted, personal, calm, and emotionally memorable.

## Design process order

Every screen is designed in this order:

1. Product question
2. Information hierarchy
3. Data representation
4. Interaction pattern
5. Typography hierarchy
6. Spatial grid and alignment
7. Color and material
8. Motion and transitions
9. Accessibility and responsive behavior
10. Implementation

Do not begin with cards, gradients, or component libraries.

## Product-wide visual metaphor

### A living field guide

Life OS should feel like an evolving field guide to the user's life. It combines:

- editorial typography for meaning and direction
- precise interface typography for actions and metadata
- timeline structures for chronology
- map/route language for journey and direction
- film/craft language for creator learning
- notebook/capture language for reflections and brain dumps
- restrained system status language for AI and provenance

Avoid conventional SaaS dashboard patterns such as dense grids of equal cards, percentage donuts, streak counters, generic KPI tiles, and neon gradient glassmorphism.

## Mobile-first shell

The primary product is a web-based mobile app.

### Phone

- one dominant vertical reading flow
- 16–20 px page gutters depending on width
- bottom navigation within thumb reach
- center capture action is globally available
- safe-area aware navigation and sheets
- no permanent sidebars
- one primary action per visual region
- secondary information expands progressively instead of competing on first view

### Desktop

Desktop is an expanded reading canvas, not a different product.

- centered content frame
- optional compact navigation rail
- wider timeline and comparison views
- preserve the same hierarchy as mobile
- avoid stretching text/cards across the full screen

## Navigation

Permanent destinations:

- Today
- Journey
- Calendar
- Memory
- You

Global capture is visually central but not a sixth destination.

AI is contextual and appears inside the screen where the question arises rather than as a permanent chat tab.

## Today information architecture

Today answers: "What matters today given the life I actually have today?"

The visual order is:

### 1. Orientation strip

A compact top region containing:

- date/daypart
- one-line current direction
- current state such as calm / constrained / open / recovery day only when explicitly known

Direction should not occupy a giant card. It behaves like a compass heading that remains visible but quiet.

### 2. Now / Next / Later timeline

Calendar is represented as time, not as a list of unrelated cards.

Use a continuous vertical day rail with:

- current-time marker
- blocks sized approximately by duration when possible
- category cue
- commitment level
- intentional empty space as visible available capacity

The design should make "the shape of the day" understandable at a glance.

### 3. Today's deliberate focus

One small set of intentional actions, not an exhaustive task list.

Each focus item explains why it exists:

- fixed reality
- current journey
- life minimum
- deliberate recovery/rest

### 4. Current craft / journey

Represent creator development as a craft path rather than a progress bar.

For the active Sound Design phase show:

- current technique/experiment
- recent practice evidence
- evidence maturity: Learned -> Practised -> Applied -> Reviewed -> Repeated
- latest learning
- next experiment

The maturity chain is a sequence of evidence states, not a percentage.

### 5. Attention

System/AI attention should look like a margin note or editorial annotation, not a commanding alert card.

It must visibly state its class: observation or suggestion.

### 6. Capture / Drift

A floating capture control opens a bottom sheet with:

- Brain Dump
- I'm Drifting
- Log Learning
- Add Event
- Add Reel
- Record Decision

Capture should feel instant and safe. Classification happens after capture.

### 7. Evening review

Appears more prominently later in the day and asks a small set of reflective questions. No percentage score.

## Journey information architecture

Journey answers: "What am I becoming capable of?"

### Journey map

Use a route/map metaphor:

- Travel Creator as the journey
- skill phases as waypoints
- current phase strongly visible
- future phases visible but quiet/locked
- completed phases become historical evidence, not trophies

### Skill view

For Sound Design:

- technique library
- active experiment
- practice timeline
- reels that used the technique
- learnings
- external analysis separated from personal reflection

### Evidence representation

Do not show "63% Sound Design".

Show evidence coverage per technique:

Learned — Practised — Applied — Reviewed — Repeated

A technique can have multiple evidence instances. The visual should show depth through marks/history, not a fake scalar score.

## Calendar information architecture

Calendar must show intentional life reality, not only productivity.

Views:

- Day: vertical timeline with available-space visualization
- Week: seven-column rhythm map emphasizing category balance and commitments
- Month: high-level life texture, not tiny unreadable event titles

Categories receive restrained semantic accents:

- Work
- Creator
- Learning
- Health
- Family
- Friends
- Travel
- Personal
- Rest

Commitment is represented independently from category:

- Fixed
- Important
- Flexible
- Optional

## Memory information architecture

Memory should feel like retrieval and chronology, not a document database.

Primary views:

- Current truth
- Decisions
- Timeline
- Search
- Patterns

A result must indicate whether it is:

- current structured truth
- historical event
- user reflection
- derived summary/pattern
- raw conversation evidence

Authority must be visually distinct from relevance.

## You information architecture

You is the slow-changing layer:

- direction
- principles / constitution
- goals
- active major decisions
- Not Now
- personal patterns
- integrations/privacy/settings

This screen should feel more archival and deliberate than Today.

## Trust semantics

Five semantic classes remain visually distinct:

- FACT
- REFLECTION
- OBSERVATION
- SUGGESTION
- DECISION

Do not rely on color alone. Use label, icon/shape, provenance, and language.

High-authority state changes must visually feel different from acknowledging or dismissing information.

## Color system

The default visual direction is "travel editorial" rather than black SaaS dashboard.

### Core palette

- Canvas Warm: #F4F0E8
- Canvas Soft: #E9E3D8
- Ink: #171A1C
- Ink Muted: #60656A
- Deep Ocean: #153D46
- Sea Glass: #7FA9A4
- Sun Clay: #E66A3D
- Golden Hour: #E6A44E
- Moss: #74886B
- Sky: #8AAFC2
- Plum: #78627B

Use warm light surfaces as the default Today experience. Dark surfaces are reserved for immersive creator/reel analysis moments and optional night mode rather than making the whole product another dark dashboard.

### Color rules

- 70–80% neutral canvas
- 15–20% ink / structural contrast
- 5–10% semantic accents
- accents communicate domain/state, not decoration
- never use five saturated colors in the same viewport
- gradients only when they represent time/light/depth; never as generic decoration

## Typography

Use two type systems maximum.

### Interface / data

A highly legible humanist or geometric sans variable font. Target direction: Manrope or a similarly warm sans.

Use for:

- body
- navigation
- metadata
- controls
- time
- labels

### Meaning / editorial moments

A contemporary editorial serif variable font. Target direction: Fraunces or a similarly expressive serif.

Use sparingly for:

- orientation headline
- direction statement
- journey/skill title
- reflective questions

Do not use serif for dense metadata or controls.

### Mobile scale

- Hero: 38–52 px responsive
- Display: 30–38 px
- Section title: 22–28 px
- Body: 16–18 px
- Secondary: 14–15 px
- Metadata: 12–13 px

Avoid tiny 8–10 px labels except nonessential decorative notation. Important information must remain comfortably readable.

## Grid and alignment

### Base spatial system

Use a 4 px base with preferred steps:

4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64

### Phone

- 16 or 20 px outer gutter
- minimum 44 px interactive height; prefer 48–56 px primary controls
- align text to a consistent content spine
- break the spine intentionally only for timelines, media, or emphasis

### Cards/surfaces

Use fewer containers.

Prefer:

- open sections separated by whitespace
- thin rules
- subtle tinted regions
- timeline rails
- grouped list surfaces

Use elevated cards only when the object is genuinely independent or interactive.

## Data representation rules

Choose the representation based on the question:

- chronology -> timeline
- duration/capacity -> proportional time block
- hierarchy -> typography/indentation
- lifecycle -> staged path
- evidence maturity -> ordered evidence chain
- comparison over time -> small trend line or weekly strip
- categorical composition -> restrained segmented band
- causality -> linked event chain
- uncertainty -> confidence/provenance language, never fake precision

Avoid charts when plain language or a timeline communicates the truth faster.

## Motion

Motion should communicate continuity and state change.

Use:

- 160–220 ms control transitions
- 240–360 ms sheet/navigation transitions
- spring motion only for direct manipulation
- shared-axis transitions between related views
- subtle current-time movement on Today

Avoid decorative looping animation, bouncing badges, and attention-seeking motion.

## Materials

Visual materials should evoke paper, light, glass, and film subtly.

Allowed:

- warm matte canvas
- faint paper/noise texture
- hairline rules
- translucent bottom navigation when readability remains high
- dark immersive media surfaces for reel review

Avoid:

- excessive glassmorphism
- thick drop shadows everywhere
- glossy 3D controls
- generic purple/blue AI gradients

## Iconography

Use one coherent outline icon family. Icons support labels; they do not replace critical text.

Avoid abstract glyphs such as arbitrary circles/arrows where a clear icon exists.

## Responsive web-app behavior

The product must feel intentionally designed for touch even though it is web-based.

- viewport-fit=cover
- safe-area insets
- sticky/floating bottom navigation
- touch-friendly hit areas
- no hover-dependent functionality
- bottom sheets for quick actions on phone
- keyboard and pointer support on desktop
- preserve readable line lengths on wide screens

## Design acceptance test

Before merging a screen, ask:

1. Can the user understand the screen's main question in three seconds?
2. Is there one obvious primary visual hierarchy?
3. Is data represented in the form closest to its meaning?
4. Can the user distinguish facts, reflections, observations, suggestions, and decisions?
5. Is anything presented as a percentage that is not truly measurable?
6. Does the screen still work at 320–390 px widths?
7. Are primary touch targets comfortable?
8. Is important text at a comfortably readable size?
9. Does the screen feel like Life OS specifically rather than a reusable SaaS template?
10. Would removing a decorative element improve clarity? If yes, remove it.

## Immediate redesign target

The current Today prototype should be replaced, not cosmetically patched.

V2 Today should prototype:

- warm travel-editorial canvas
- mobile app shell and bottom navigation
- compact compass/orientation header
- Now / Next / Later day timeline
- proportional calendar blocks
- deliberate-focus strip
- Sound Design evidence path
- margin-note-style system suggestion
- floating capture control
- evening-review entry point
- clear trust/provenance semantics

The redesigned screen remains sample-data-only until canonical persistence and domain events are wired.