# CodeBuddy

CodeBuddy is a code analysis and knowledge graph tool that parses source code using tree-sitter, extracts functions, classes, and their relationships, and provides comprehensive code analysis capabilities. It supports multiple programming languages and offers three interfaces: a command-line tool, a web interface, and an MCP (Model Context Protocol) server for AI assistant integration.

![CodeBuddy Web Interface](public/image/codebuddy.png)

## Features

### Code Parsing and Analysis
- Multi-language support: C, C++, C#, Go, Java, JavaScript, TypeScript, Python, Ruby, Rust, Swift, PHP, and Zig
- Function and method extraction with parameters, return types, and documentation
- Class and struct detection with member function relationships
- Call graph analysis showing caller/callee relationships
- Control flow graph generation

### Code Quality Analysis
- Dead code detection (unreferenced functions)
- Code duplication detection
- Cyclomatic complexity metrics
- Code smell detection (long methods, deep nesting, etc.)
- Security vulnerability scanning
- Documentation coverage analysis
- Type coverage analysis for dynamic languages
- API surface analysis
- Variable scope analysis
- Dependency analysis with circular dependency detection

### Interfaces
- **CLI**: Command-line tool for project management and code queries
- **Web UI**: Interactive browser-based interface with visualizations
- **MCP Server**: Integration with AI assistants via Model Context Protocol

## Requirements

- Node.js 18 or higher
- PostgreSQL 14 or higher
- Git (for cloning repositories)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/anthropics/codebuddy.git
cd codebuddy
```

2. Install dependencies:
```bash
npm install
```

3. Configure the database connection by setting the `DATABASE_URL` environment variable:
```bash
export DATABASE_URL="postgres://user:password@localhost:5432/codebuddy"
```

4. Run database migrations:
```bash
npm run migrate
```

5. Link the CLI tool (optional):
```bash
npm link
```

## Usage

### Command-Line Interface

The CLI is available as `cb` after linking, or can be run directly with `node bin/cb`.

#### Project Management

```bash
# Import a local project
cb project import --name=myproject --path=/path/to/project

# Import a git repository
cb project import --name=myproject --path=https://github.com/user/repo.git

# List all projects
cb project list

# Get project information
cb project info --name=myproject

# Refresh project data
cb project refresh --name=myproject
```

#### Function Queries

```bash
# List all functions in a project
cb function list --project=myproject

# Search for functions by name
cb function search --name=parse --project=myproject

# Get function details with source code
cb function retrieve --name=main --project=myproject

# Find functions that call a specific function
cb function callers --name=parse --project=myproject

# Find functions called by a specific function
cb function callees --name=main --project=myproject

# Generate a call graph
cb function call-graph --name=main --project=myproject --depth=3

# Show control flow for a function
cb function control-flow --name=parse --project=myproject
```

#### Entity Queries (Classes and Structs)

```bash
# List all entities (functions, classes, structs)
cb entity list --project=myproject

# Filter by type
cb entity list --project=myproject --type=class

# Search for entities
cb entity search --name=Parser --project=myproject

# Get class/struct members
cb entity members --id=123
```

#### Code Analysis

```bash
# Full analysis dashboard
cb analysis dashboard --project=myproject

# Dead code detection
cb analysis dead-code --project=myproject

# Code duplication
cb analysis duplication --project=myproject --threshold=0.8

# Dependency analysis
cb analysis dependencies --project=myproject

# Security vulnerabilities
cb analysis security --project=myproject

# Code metrics
cb analysis metrics --project=myproject

# Code smells
cb analysis smells --project=myproject

# Type coverage
cb analysis types --project=myproject

# API surface
cb analysis api --project=myproject

# Documentation coverage
cb analysis docs --project=myproject

# Variable scope issues
cb analysis scope --project=myproject
```

### Web Interface

Start the web server:
```bash
node server.mjs
```

Open http://localhost:3000 in your browser. The web interface provides:

- Project browsing and management
- Interactive function and class explorer
- Call graph visualization
- Control flow diagrams
- Code analysis dashboard with health scores
- Source code viewer with syntax highlighting

### MCP Server

CodeBuddy can run as an MCP server for integration with AI assistants like Claude.

#### Stdio Transport (for Claude Desktop)

Add to your Claude Desktop configuration:
```json
{
  "mcpServers": {
    "codebuddy": {
      "command": "node",
      "args": ["/path/to/codebuddy/index.mjs"]
    }
  }
}
```

#### HTTP Transport

The web server exposes an MCP endpoint at `/mcp` for HTTP-based MCP clients.

#### Available MCP Tools

Project tools:
- `project_list` - List all projects
- `project_info` - Get project details

Function tools:
- `function_list` - List functions in a project
- `function_search` - Search for functions
- `function_retrieve` - Get function details
- `function_callers` - Find callers of a function
- `function_callees` - Find callees of a function
- `function_caller_tree` - Build caller tree
- `function_callee_tree` - Build callee tree
- `function_call_graph` - Build bidirectional call graph
- `function_control_flow` - Get control flow graph

Entity tools:
- `entity_list` - List all entities
- `entity_search` - Search entities
- `class_members` - Get class/struct members

Analysis tools:
- `analysis_dashboard` - Full analysis overview
- `analysis_dead_code` - Dead code detection
- `analysis_duplication` - Code duplication
- `analysis_dependencies` - Dependency analysis
- `analysis_security` - Security scanning
- `analysis_metrics` - Code metrics
- `analysis_code_smells` - Code smell detection
- `analysis_types` - Type coverage
- `analysis_api_surface` - API analysis
- `analysis_documentation` - Documentation coverage
- `analysis_scope` - Variable scope analysis

Utility tools:
- `read_sourcecode` - Read source code from files

## Development

### Running Tests

```bash
npm test
```

### Database Migrations

```bash
# Create a new migration
npm run migrate:create

# Run pending migrations
npm run migrate

# Rollback last migration
npm run migrate:down
```

### Project Structure

```
codebuddy/
├── bin/                    # CLI entry point
├── lib/
│   ├── api/               # REST API routes
│   ├── cli/               # CLI commands
│   ├── model/             # Database models
│   ├── analysis.mjs       # Code analysis functions
│   ├── controlflow.mjs    # Control flow graph generation
│   ├── db.mjs             # Database connection
│   ├── functions.mjs      # Tree-sitter parsing
│   ├── mcp-http.mjs       # MCP HTTP transport
│   └── project.mjs        # Project import/refresh
├── migrations/            # Database migrations
├── public/                # Web interface static files
├── tests/                 # Test files
├── index.mjs              # MCP stdio server
└── server.mjs             # Web server
```

## Supported Languages

| Language   | Functions | Classes | Structs | Call Graph |
|------------|-----------|---------|---------|------------|
| C          | Yes       | No      | Yes     | Yes        |
| C++        | Yes       | Yes     | Yes     | Yes        |
| C#         | Yes       | Yes     | Yes     | Yes        |
| Go         | Yes       | No      | Yes     | Yes        |
| Java       | Yes       | Yes     | No      | Yes        |
| JavaScript | Yes       | Yes     | No      | Yes        |
| TypeScript | Yes       | Yes     | No      | Yes        |
| Python     | Yes       | Yes     | No      | Yes        |
| Ruby       | Yes       | Yes     | No      | Yes        |
| Rust       | Yes       | No      | Yes     | Yes        |
| Swift      | Yes       | Yes     | Yes     | Yes        |
| PHP        | Yes       | Yes     | No      | Yes        |
| Zig        | Yes       | No      | Yes     | Yes        |

## License

MIT License. See LICENSE file for details.
