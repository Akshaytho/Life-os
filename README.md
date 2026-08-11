# Life OS

Life OS is a private, mobile-first personal operating system designed to preserve direction, externalize memory, support deliberate skill development, and make returning from drift easy.

## Product North Star

Life OS is not a generic productivity app. Its job is to help the user answer:

- Where am I going?
- What matters today given real life constraints?
- What am I becoming capable of?
- What changed and why?
- Did I drift, and did I return?
- What have I learned about myself?
- What decisions are currently authoritative?

The first active becoming journey is Travel Creator, with Sound Design as the initial skill phase.

## Architecture Principles

- TypeScript-first monorepo.
- React/TypeScript web client.
- Lightweight TypeScript backend organized as a modular monolith.
- PostgreSQL is the canonical source of truth.
- pgvector is used for semantic retrieval, never as authoritative memory.
- Current state, historical evidence, and AI-derived interpretation stay separate.
- Important state changes append domain events, but the system does not use full event sourcing.
- Raw conversations are historical evidence, not automatically canonical memory.
- Important AI-generated changes use proposal/approval boundaries.
- ChatGPT will eventually access Life OS through a scoped MCP gateway rather than direct database access.
- Supabase is the planned data platform; Railway is the planned compute platform.
- Development starts with fake/sample data, not real personal data.

## Planned Repository Shape

```text
apps/
  web/
  api/
  mcp/
packages/
  domain/
  contracts/
  database/
  events/
  intelligence/
  ui/
docs/
  product/
  architecture/
  security/
  decisions/
```

## Status

Architecture baseline in progress. Product features have intentionally not been implemented yet.
