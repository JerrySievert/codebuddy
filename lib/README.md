# lib/ - Core Library Modules

This directory contains the core library modules for Codebuddy.

## Module Overview

### Core Parsing & Analysis

| Module | Description |
|--------|-------------|
| `functions.mjs` | AST parsing, entity extraction, return type detection |
| `controlflow.mjs` | Control flow graph generation from AST |
| `complexity.mjs` | Cyclomatic complexity, nesting depth, LOC metrics |
| `sourcecode.mjs` | Source file reading and text extraction |

### Project Management

| Module | Description |
|--------|-------------|
| `project.mjs` | Project import, refresh, and entity relationship building |
| `project_analysis.mjs` | Project-level analysis orchestration |
| `parser-pool.mjs` | Parallel file parsing with worker threads |
| `git.mjs` | Git repository cloning and management |
| `jobs.mjs` | Background job queue with WebSocket updates |

### Code Quality Analysis

| Module | Description |
|--------|-------------|
| `analysis.mjs` | Aggregated analysis exports (facade module) |
| `naming.mjs` | Naming convention detection and analysis |
| `patterns.mjs` | Design pattern detection |
| `readability.mjs` | Readability scoring and metrics |
| `concurrency.mjs` | Concurrency pattern detection |
| `resources.mjs` | Resource usage analysis |
| `testing.mjs` | Test file and coverage analysis |
| `strings.mjs` | String literal analysis |

### Infrastructure

| Module | Description |
|--------|-------------|
| `db.mjs` | PostgreSQL database connection |
| `config.mjs` | Configuration and read-only mode |
| `mcp-http.mjs` | MCP server over HTTP/SSE |

## Subdirectories

- `api/` - REST API route handlers
- `cli/` - CLI command implementations
- `controlflow/` - Control flow statement handlers
- `mcp/` - MCP protocol tools and handlers
- `model/` - Database models and queries

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        API Layer                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  REST API   │  │  MCP Server │  │        CLI          │  │
│  │  (api/)     │  │  (mcp/)     │  │       (cli/)        │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│                     Analysis Layer                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐   │
│  │complexity│ │ naming   │ │ patterns │ │ readability  │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│                      Core Layer                             │
│  ┌──────────────┐  ┌─────────────┐  ┌───────────────────┐  │
│  │  functions   │  │ controlflow │  │  project          │  │
│  │  (parsing)   │  │   (CFG)     │  │  (import/refresh) │  │
│  └──────────────┘  └─────────────┘  └───────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│                      Data Layer                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                   model/ (PostgreSQL)                 │  │
│  │  entity │ relationship │ sourcecode │ symbol_reference│  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Key Concepts

### Entity Types
- `function` - Functions and methods
- `class` - Classes and structs
- `method` - Class methods
- `variable` - Global variables
- `constant` - Constants and enums

### Relationships
- **Caller/Callee** - Function call relationships
- **Inheritance** - Class extends/implements relationships
- **Symbol References** - All identifier usages in code
