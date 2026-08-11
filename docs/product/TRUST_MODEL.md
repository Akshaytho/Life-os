# Life OS Trust Model

## Purpose

Life OS should become easier to trust as it becomes more intelligent. Intelligence must never make the system more ambiguous about what happened, what is true, or who made a decision.

## Five visible information classes

### FACT
A recorded state or event supported by canonical application data.
Example: `Sound practice completed at 20:41.`

### REFLECTION
A user's own interpretation, feeling, or meaning.
Example: `The opening felt rushed to me.`

### OBSERVATION
A system or external-AI interpretation based on evidence. It can be wrong.
Example: `Dialogue appears masked by music from 00:17–00:21.`

### SUGGESTION
A proposed next action. It does not modify canonical state by itself.
Example: `Try a 20-minute sound minimum on work-heavy days.`

### DECISION
An explicit user-authorized commitment that can affect canonical state.
Example: `Sound Design remains the active creator phase.`

## Trust rules

- FACT must have a source and timestamp.
- REFLECTION remains attributable to the user and is not silently rewritten by AI.
- OBSERVATION includes provenance and confidence where meaningful.
- SUGGESTION is visually and semantically distinct from DECISION.
- DECISION changes should be visible in history and preserve superseded decisions.
- AI may propose high-authority changes but does not silently activate them.
- Current truth should not be inferred from vector similarity when structured state exists.
- The interface avoids shame, streak punishment, and misleading completion percentages.

## UI consequences

The first Today slice should already demonstrate these rules:
- Direction shows its status as a user decision.
- Calendar items show recorded commitments rather than productivity judgments.
- Creator focus shows what is currently active and why.
- Attention/suggestion cards state that they are suggestions.
- Trust/source details can be inspected without overwhelming the main screen.

## Historical integrity

A changed screen must not erase the path that produced it. Meaningful changes later emit domain events so daily and weekly reviews can reconstruct chronology.

## Reliability language

Avoid absolute language when the system is interpreting incomplete evidence. Prefer `possible`, `appears`, `based on`, and `I found` for derived conclusions. Canonical facts and explicit user decisions may be stated directly.
