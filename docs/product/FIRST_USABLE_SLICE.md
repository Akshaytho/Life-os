# First Usable Slice — Today

## Goal

Create the first visible Life OS experience without pretending unfinished infrastructure exists.

This slice proves the visual language, information hierarchy, navigation shell, and visible trust model using fake/sample data only.

## Included

- mobile-first application shell
- desktop rail and mobile navigation
- Today orientation
- current direction
- calendar/reality preview
- current creator phase and evidence
- one clearly labeled system suggestion
- Brain Dump and Drift affordances shown as not-yet-active
- provenance details for meaningful claims
- explicit prototype/trust banner

## Not included

- authentication
- database persistence
- Supabase
- real calendar writes
- skill-session writes
- event persistence
- AI calls
- Brain Dump persistence
- Drift persistence
- MCP

The UI must never imply those capabilities work before they are implemented.

## Acceptance criteria

1. The page works at phone and desktop widths.
2. The user can immediately tell that displayed data is sample data.
3. A user decision is visually distinct from a system suggestion.
4. Provenance can be inspected without dominating the interface.
5. Disabled actions are clearly described as unavailable rather than failing silently.
6. The screen avoids progress percentages, streak pressure, and judgmental productivity language.
7. Today feels like orientation, not a generic task dashboard.
8. CI can typecheck and build the web workspace.

## Next vertical slice

Wire the first real mutation: start/complete a creator skill session with canonical state + a corresponding domain event, using development-only infrastructure.
