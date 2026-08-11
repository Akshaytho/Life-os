# ADR-002: PostgreSQL Is the Canonical Source of Truth

Status: Accepted

## Context

Life OS depends on relational integrity, explicit current state, history, transactions, JSON payloads, and semantic retrieval. Treating a vector store or AI conversation as primary memory would make current truth ambiguous.

## Decision

Use PostgreSQL as the canonical persistence layer. Supabase is the planned managed PostgreSQL platform. pgvector may live inside PostgreSQL for semantic retrieval.

## Consequences

- current truth is explicit and queryable
- relational constraints and transactions remain available
- vector retrieval stays close to structured data without becoming authoritative
- schema migrations become a first-class engineering concern
