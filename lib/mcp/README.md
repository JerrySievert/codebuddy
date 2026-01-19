# lib/mcp/ - Model Context Protocol Server

This directory contains the MCP (Model Context Protocol) server implementation for Codebuddy, allowing AI assistants to interact with the codebase analysis.

## Overview

The MCP server exposes codebase analysis capabilities through a standardized protocol that AI assistants can use to understand and navigate codebases.

## Files

| File | Description |
|------|-------------|
| `tools.mjs` | Tool registration and MCP server creation |

## Subdirectories

### tools/

Contains the tool handlers organized by domain:

| Module | Tools | Description |
|--------|-------|-------------|
| `entity.mjs` | `entity_list`, `entity_search`, `entity_references`, `class_members` | Entity listing and search |
| `function.mjs` | `function_callgraph`, `function_controlflow`, `function_complexity`, etc. | Function analysis |
| `analysis.mjs` | `analysis_dashboard`, `analysis_dead_code`, `analysis_duplication`, etc. | Project analysis |
| `project.mjs` | `project_list`, `project_info`, `project_import`, etc. | Project management |
| `sourcecode.mjs` | `read_sourcecode`, `file_list` | Source code access |
| `reference.mjs` | `symbol_references`, `find_definition`, etc. | Symbol references |
| `hierarchy.mjs` | `class_hierarchy`, `inheritance_tree` | Class hierarchies |

## Available Tools

### Entity Tools
- **entity_list** - List all entities in a project with optional type filtering
- **entity_search** - Search entities by symbol name pattern
- **entity_references** - Find all references to an entity
- **class_members** - Get members of a class or struct

### Function Tools
- **function_callgraph** - Build caller/callee call graph
- **function_controlflow** - Generate control flow graph
- **function_complexity** - Calculate complexity metrics
- **function_callers** - Get functions that call this function
- **function_callees** - Get functions called by this function
- **function_source** - Get source code for a function

### Analysis Tools
- **analysis_dashboard** - Get project analysis summary
- **analysis_dead_code** - Find unused functions
- **analysis_duplication** - Detect code duplication
- **analysis_dependencies** - Analyze dependencies
- **analysis_complexity** - Project-wide complexity analysis
- **analysis_naming** - Naming convention analysis

### Project Tools
- **project_list** - List all projects
- **project_info** - Get project details
- **project_import** - Import a new project
- **project_refresh** - Refresh an existing project

### Source Code Tools
- **read_sourcecode** - Read source code with optional line range
- **file_list** - List files in a project

## Usage

The MCP server can be started via:

```bash
# HTTP/SSE mode
npm run mcp

# Stdio mode (for direct integration)
npm run mcp:stdio
```

## Tool Schema

Each tool defines:
- `name` - Tool identifier
- `description` - Human-readable description for AI assistants
- `inputSchema` - JSON Schema for parameters
- `handler` - Async function that executes the tool

Example tool registration:

```javascript
const tools = [
  {
    name: 'entity_list',
    description: 'List all entities (functions, classes, etc.) in a project',
    inputSchema: {
      type: 'object',
      properties: {
        project_name: { type: 'string', description: 'Project name' },
        entity_type: { type: 'string', description: 'Filter by type' }
      },
      required: ['project_name']
    },
    handler: entity_list_handler
  }
];
```
