# ADR-008: External AI Uses Proposal and Approval Boundaries

Status: Accepted

## Context

ChatGPT and other external intelligence can add valuable analysis, especially for media the core app cannot assess well. External AI can also be wrong, stale, or overconfident.

## Decision

Initial MCP access is read-only except submission of external analyses into a controlled inbox. High-authority changes are represented as proposals that require user approval. External AI never receives direct database credentials.

## Consequences

- provenance is retained for external observations
- user reflection and AI analysis remain separate
- important decisions cannot be silently rewritten
- later direct-write capabilities require explicit, scoped permissions and audit records
