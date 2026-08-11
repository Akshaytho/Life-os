# ADR-003: Vector Retrieval Is Not Authoritative Memory

Status: Accepted

## Context

Similar or contradictory statements can accumulate across conversations and days. Nearest-neighbor retrieval can surface semantically related but stale or superseded information.

## Decision

Embeddings are used only to retrieve relevant supporting context. Active structured state and explicit active decisions outrank semantic matches. Raw conversations carry lower authority than canonical memory.

## Consequences

- retrieval requires authority/status metadata
- contradictions are labeled rather than resolved by vector similarity
- memory consolidation and versioning are required
- embedding-model/version provenance is stored
