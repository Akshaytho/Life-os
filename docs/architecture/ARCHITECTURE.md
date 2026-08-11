# Life OS Architecture

## System Shape

Life OS starts as a TypeScript-first modular monolith with separate deployable web, API, worker-capable backend modules, and a later MCP gateway. The goal is clean internal boundaries without premature distributed systems.

```text
User
  |
  +--> Life OS Web
  |      |
  |      +--> Application API
  |              |
  |              +--> Domain modules
  |              +--> Context / intelligence layer
  |              +--> Event writer
  |              +--> Background processing
  |                      |
  |                      +--> Supabase PostgreSQL + pgvector
  |
  +--> ChatGPT --MCP--> Life OS MCP Gateway --> Application/domain services

Codex --> Git repository / development environment
```

## Planned Infrastructure

### Supabase

- PostgreSQL
- pgvector extension
- Authentication
- Object storage for media/reference assets
- Production backup capabilities

### Railway

- Web/API compute as appropriate
- Background worker
- Scheduled processing
- MCP server when introduced

### OpenAI

- Language reasoning
- Classification
- Memory consolidation assistance
- Embeddings
- Later multimodal creator analysis where appropriate

OpenAI-specific details must stay behind provider interfaces.

## Architectural Boundaries

Primary domains:

- Identity
- Direction
- Calendar / Today
- Becoming / Journey
- Creator / Reels
- Drift / Brain Dump / NOT NOW
- Reviews
- Memory
- Events
- Intelligence
- External Intelligence
- MCP / Integration

## Canonical State and Events

Life OS does not use full event sourcing.

A meaningful mutation writes current canonical state and its corresponding domain event in the same transaction.

Example:

```text
Complete Skill Session
  -> update skill_session.status = COMPLETED
  -> append SKILL_SESSION_COMPLETED
```

This preserves simple current-state queries while retaining reliable chronology.

## Outbox Direction

If/when asynchronous processing is needed, use a PostgreSQL transactional outbox before introducing a message broker.

Potential consumers include:

- memory consolidation
- daily/weekly summarization
- attention detection
- MCP change streams

## Environment Separation

- Local: source code, Node tooling, fake/sample data
- Development: remote dev infrastructure, non-sensitive data
- Production: real Life OS data, separate credentials and projects

Codex should not require unrestricted production credentials.

## Core Rule

The application must remain usable when AI is unavailable. AI enriches Life OS; it is not the persistence layer or sole execution path.
