# lib/model/ - Database Models

This directory contains the PostgreSQL database models and query functions for Codebuddy.

## Overview

All database operations are centralized in this directory, providing a clean separation between business logic and data access.

## Models

| Module | Table(s) | Description |
|--------|----------|-------------|
| `project.mjs` | `project` | Project metadata and configuration |
| `entity.mjs` | `entity` | Functions, classes, methods, variables |
| `sourcecode.mjs` | `sourcecode` | Source file contents |
| `relationship.mjs` | `relationship` | Caller/callee relationships and call graphs |
| `reference.mjs` | `reference` | Legacy references (deprecated) |
| `symbol_reference.mjs` | `symbol_reference` | All identifier usages in code |
| `inheritance.mjs` | `inheritance` | Class inheritance relationships |
| `project_analysis.mjs` | `project_analysis` | Cached analysis results |

## Key Tables

### entity
Stores all code entities (functions, classes, etc.):
```sql
- id: Primary key
- project_id: Foreign key to project
- symbol: Entity name (e.g., "calculate_total")
- type: Entity type (function, class, method, etc.)
- filename: Source file path
- start_line, end_line: Location in file
- parameters, return_type: Function signature
- parent_class, interfaces: Inheritance info
```

### relationship
Stores caller/callee relationships:
```sql
- id: Primary key
- project_id: Foreign key to project
- caller_id: Entity that makes the call
- callee_id: Entity being called
- line: Line number of the call
- comment: Associated comment if any
```

### symbol_reference
Stores all identifier usages for "find references":
```sql
- id: Primary key
- project_id: Foreign key to project
- symbol: The identifier name
- filename: File containing the reference
- line, column: Location
- context_type: Type of reference (call, assignment, etc.)
```

### inheritance
Stores class inheritance relationships:
```sql
- id: Primary key
- child_entity_id: The derived class
- parent_entity_id: The base class (if in project)
- parent_symbol: Base class name
- relationship_type: 'extends' or 'implements'
```

## Common Operations

### Entity Operations
```javascript
import { get_entity, insert_or_update_entity, batch_insert_or_update_entities } from './entity.mjs';

// Get single entity
const entity = await get_entity({ symbol: 'my_function', project_id: 1 });

// Batch insert (used during project import)
const entities = await batch_insert_or_update_entities(entity_array);
```

### Relationship Operations
```javascript
import { build_call_graph, build_caller_tree, build_callee_tree } from './relationship.mjs';

// Build full call graph
const graph = await build_call_graph({ symbol: 'main', project_id: 1, max_depth: 5 });

// Build caller tree (who calls this function)
const callers = await build_caller_tree({ symbol: 'helper', project_id: 1, depth: 3 });
```

### Symbol Reference Operations
```javascript
import { get_symbol_references, batch_insert_symbol_references } from './symbol_reference.mjs';

// Find all references to a symbol
const refs = await get_symbol_references({ symbol: 'my_var', project_id: 1 });
```

## Cross-Project Relationships

**Important**: Relationships can span projects. For example, Project A may call functions in Project B. This means:

1. Never use DELETE + INSERT for entities - use upserts to preserve IDs
2. Relationships reference entity IDs that may be in different projects
3. When reimporting a project, existing relationships FROM other projects must be preserved

## Migrations

Database schema changes are managed in `/migrations/`. Run migrations with:

```bash
npm run migrate
```

## Performance Considerations

- Symbol references use indexes that can be disabled during bulk import
- Large projects (>300 files) use memory-saving mode
- Materialized views cache expensive aggregations
