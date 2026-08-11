# ADR-006: Railway as the Initial Compute Platform

Status: Accepted for initial implementation

## Context

Life OS needs lightweight managed compute for the web/API, background jobs, scheduled processing, and later the MCP gateway. The user's local Mac should not be responsible for always-on infrastructure.

## Decision

Use Railway as the initial managed compute platform.

## Consequences

- simple deployment path for TypeScript services
- scheduled/background processing can run without the local machine
- compute remains separate from the Supabase data platform
- infrastructure can be revisited later without changing core domain contracts
