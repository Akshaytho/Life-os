# ADR-001: Start as a Modular Monolith

Status: Accepted

## Context

Life OS has distinct domains such as calendar, journey, memory, events, intelligence, and MCP. Splitting them into networked services now would increase deployment, debugging, transaction, and operational complexity before usage justifies it.

## Decision

Use one backend application boundary with explicit internal domain modules. MCP may be a separate deployable gateway later, but it must call domain/application services rather than bypassing them.

## Consequences

- simpler development and deployment
- easier cross-domain transactions
- cleaner fit for a single-user private product
- module boundaries remain explicit so extraction is possible later
- no Kubernetes or microservice platform in V1
