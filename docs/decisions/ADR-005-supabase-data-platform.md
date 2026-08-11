# ADR-005: Supabase as the Managed Data Platform

Status: Accepted for initial implementation

## Context

Life OS needs PostgreSQL, pgvector, authentication, object storage, and managed backup capabilities. The development machine should not be forced to host all of those services locally.

## Decision

Use Supabase as the initial managed data platform for PostgreSQL, pgvector, Auth, and object storage.

## Consequences

- simplifies remote development and production operations
- keeps PostgreSQL as the underlying canonical database
- reduces local resource requirements
- application/domain logic remains outside vendor-specific database functions where possible to preserve portability
