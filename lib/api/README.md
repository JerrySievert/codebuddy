# lib/api/ - REST API Routes

This directory contains the REST API route handlers for the Codebuddy web interface.

## Overview

The REST API provides endpoints for the web UI to interact with projects, entities, and analysis features.

## Route Files

| File | Prefix | Description |
|------|--------|-------------|
| `projects.mjs` | `/api/v1/projects` | Project management |
| `entities.mjs` | `/api/v1/entities` | Entity listing and search |
| `functions.mjs` | `/api/v1/functions` | Function details and analysis |
| `files.mjs` | `/api/v1/files` | File listing and source |
| `analysis.mjs` | `/api/v1/analysis` | Analysis endpoints |
| `jobs.mjs` | `/api/v1/jobs` | Background job management |

## Key Endpoints

### Projects

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/projects` | List all projects |
| GET | `/api/v1/projects/:name` | Get project info |
| POST | `/api/v1/projects/import` | Import a new project |
| POST | `/api/v1/projects/:name/refresh` | Refresh project |
| GET | `/api/v1/projects/:name/status` | Get server status |

### Entities

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/entities` | List entities with filters |
| GET | `/api/v1/entities/search` | Search entities by pattern |
| GET | `/api/v1/entities/:id` | Get entity by ID |

### Functions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/functions/:symbol` | Get function details |
| GET | `/api/v1/functions/:symbol/callers` | Get callers |
| GET | `/api/v1/functions/:symbol/callees` | Get callees |
| GET | `/api/v1/functions/:symbol/callgraph` | Get call graph |
| GET | `/api/v1/functions/:symbol/flowchart` | Get control flow |
| GET | `/api/v1/functions/:symbol/complexity` | Get complexity |
| GET | `/api/v1/functions/:symbol/references` | Get references |

### Files

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/files` | List files in project |
| GET | `/api/v1/files/:path/source` | Get file source |
| GET | `/api/v1/files/:path/functions` | Get functions in file |

### Analysis

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/analysis/dashboard` | Get analysis dashboard |
| GET | `/api/v1/analysis/dead-code` | Find dead code |
| GET | `/api/v1/analysis/complexity` | Complexity analysis |
| GET | `/api/v1/analysis/naming` | Naming analysis |

### Jobs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/jobs` | List jobs |
| GET | `/api/v1/jobs/:id` | Get job status |
| GET | `/api/v1/jobs/stats` | Get queue stats |

## Query Parameters

Common query parameters across endpoints:

| Parameter | Description |
|-----------|-------------|
| `project` | Project name (required for most endpoints) |
| `type` | Filter by entity type |
| `limit` | Maximum results to return |
| `offset` | Pagination offset |
| `depth` | Depth for call graphs and trees |

## Response Format

All endpoints return JSON:

```javascript
// Success
{
  "data": { ... },
  "count": 42
}

// Error
{
  "error": "Error message",
  "statusCode": 404
}
```

## Read-Only Mode

When `--read-only` flag is used, POST endpoints return 403:

```javascript
{
  "error": "Server is in read-only mode",
  "statusCode": 403
}
```
