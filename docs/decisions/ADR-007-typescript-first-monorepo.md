# ADR-007: TypeScript-First Monorepo

Status: Accepted

## Context

Life OS will include a web client, backend API, shared contracts/domain logic, and later an MCP gateway. Using one primary language reduces duplication and makes shared types and repository-wide reasoning easier.

## Decision

Use a TypeScript-first monorepo with workspace packages for domain logic, contracts, database, events, intelligence, and UI.

## Consequences

- shared types/contracts are straightforward
- fewer runtime/language boundaries during early development
- easier repository-wide changes for Codex
- framework-specific logic must remain outside core domain packages
