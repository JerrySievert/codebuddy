'use strict';

/**
 * @fileoverview MCP HTTP transport setup for Hapi.js integration.
 * Provides streamable HTTP transport for the MCP server.
 * @module lib/mcp-http
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import { get_all_projects_with_metadata, delete_project } from './model/project.mjs';
import { create_project, refresh_project } from './project.mjs';
import {
  get_entity,
  get_entity_by_id,
  get_entity_symbols,
  get_class_members,
  entity_search
} from './model/entity.mjs';
import {
  build_call_tree,
  build_call_graph,
  build_caller_tree,
  build_callee_tree,
  get_entities_by_caller_id,
  get_entities_by_callee_id
} from './model/relationship.mjs';
import { get_sourcecode } from './model/sourcecode.mjs';
import { get_references_by_symbol } from './model/reference.mjs';
import { text_at_position } from './sourcecode.mjs';
import { get_project_by_name } from './model/project.mjs';
import { build_control_flow_from_source } from './controlflow.mjs';
import {
  detect_dead_code,
  detect_code_duplication,
  analyze_dependencies,
  detect_security_vulnerabilities,
  get_code_metrics,
  detect_code_smells,
  analyze_types,
  analyze_api_surface,
  analyze_documentation,
  analyze_variable_scope,
  get_analysis_dashboard,
  find_all_references,
  go_to_definition,
  list_definitions,
  get_symbol_reference_summary,
  find_symbols_at_location,
  get_class_hierarchy,
  find_implementations,
  analyze_class_hierarchy,
  analyze_project_concurrency,
  analyze_project_resources,
  analyze_project_naming_conventions,
  analyze_project_readability_score
} from './analysis.mjs';

import { tools } from './strings.mjs';

/**
 * Creates and configures the MCP server with all tools.
 * @returns {McpServer} Configured MCP server instance
 */
const createMcpServer = () => {
  const server = new McpServer({
    name: 'codebuddy',
    version: '1.0.0'
  });

  // Register all the same tools as in index.mjs
  server.tool(
    tools[`function_list`].name,
    tools[`function_list`].description,
    {
      project: z
        .string()
        .describe('Project name to retrieve the function list from'),
      filename: z
        .string()
        .optional()
        .describe('Filename to retrieve the function list from')
    },
    async ({ project, filename }) => {
      try {
        const projects = await get_project_by_name({ name: project });

        if (projects.length === 0) {
          throw new Error(`Project '${project}' not found`);
        }

        const symbols = await get_entity_symbols({
          project_id: projects[0].id,
          filename,
          type: 'function'
        });

        const content = [];
        for (const symbol of symbols) {
          content.push({
            type: 'text',
            text: JSON.stringify(symbol)
          });
        }

        return { content };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error ${err}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    tools[`function_search`].name,
    tools[`function_search`].description,
    {
      name: z.string().describe('Name of the function to search for'),
      project: z
        .string()
        .optional()
        .describe('Project name in which to search for the function'),
      filename: z
        .string()
        .optional()
        .describe('Filename in which to search for the function'),
      limit: z
        .number()
        .optional()
        .default(10)
        .describe('Maximum number of results to return')
    },
    async ({ name, project, filename, limit }) => {
      try {
        let project_id;
        if (project !== undefined) {
          const projects = await get_project_by_name({ name: project });

          if (projects.length !== 0) {
            project_id = projects[0].id;
          }
        }

        const symbols = await entity_search({
          project_id,
          filename,
          symbol: name,
          type: 'function',
          limit
        });

        if (symbols.length === 0) {
          throw new Error(`Function '${name}' not found`);
        }

        const content = [];
        for (const symbol of symbols) {
          content.push({
            type: 'text',
            text: JSON.stringify(symbol)
          });
        }

        return { content };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error ${err}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    tools[`function_retrieve`].name,
    tools['function_retrieve'].description,
    {
      name: z.string().describe('Name of the function to retrieve'),
      project: z
        .string()
        .optional()
        .describe('Project name to retrieve function from')
    },
    async ({ name, project, filename }) => {
      try {
        let project_id;
        if (project !== undefined) {
          const projects = await get_project_by_name({ name: project });

          if (projects.length !== 0) {
            project_id = projects[0].id;
          }
        }

        const entities = await get_entity({
          project_id,
          filename,
          symbol: name,
          type: 'function'
        });

        if (entities.length === 0) {
          throw new Error(`Function '${name}' not found`);
        }

        const content = [];
        for (const entity of entities) {
          content.push({
            type: 'text',
            text: JSON.stringify(entity)
          });
        }

        return { content };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error ${err}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    tools[`function_callers`].name,
    tools[`function_callers`].description,
    {
      name: z.string().describe('Function name to retrieve callers for'),
      project: z
        .string()
        .optional()
        .describe('Project to narrow the scope of the callers')
    },
    async ({ name, project }) => {
      try {
        let project_id;
        if (project !== undefined) {
          const projects = await get_project_by_name({ name: project });

          if (projects.length !== 0) {
            project_id = projects[0].id;
          }
        }

        const entities = await get_entities_by_callee_id({
          project_id,
          symbol: name,
          type: 'function'
        });

        if (entities.length === 0) {
          throw new Error(`Function '${name}' not found`);
        }

        const content = [];
        for (const entity of entities) {
          content.push({
            type: 'text',
            text: JSON.stringify(entity)
          });
        }

        return { content };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error ${err}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    tools[`function_callees`].name,
    tools[`function_callees`].description,
    {
      name: z.string().describe('Function name to retrieve callees for'),
      project: z
        .string()
        .optional()
        .describe('Project to narrow the scope of the callees')
    },
    async ({ name, project }) => {
      try {
        let project_id;
        if (project !== undefined) {
          const projects = await get_project_by_name({ name: project });

          if (projects.length !== 0) {
            project_id = projects[0].id;
          }
        }

        const entities = await get_entities_by_caller_id({
          project_id,
          symbol: name,
          type: 'function'
        });

        if (entities.length === 0) {
          throw new Error(`Function '${name}' not found`);
        }

        const content = [];
        for (const entity of entities) {
          content.push({
            type: 'text',
            text: JSON.stringify(entity)
          });
        }

        return { content };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error ${err}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    tools[`project_list`].name,
    tools['project_list'].description,
    {},
    async () => {
      try {
        const entities = await get_all_projects_with_metadata();

        const content = [];
        for (const entity of entities) {
          content.push({
            type: 'text',
            text: JSON.stringify(entity)
          });
        }

        return { content };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error ${err}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    tools[`project_info`].name,
    tools['project_info'].description,
    { name: z.string().describe('Project name') },
    async ({ name }) => {
      try {
        const project = await get_project_by_name({ name });

        if (project.length === 0) {
          throw new Error(`Project '${name}' not found`);
        }

        const content = [];
        content.push({
          type: 'text',
          text: JSON.stringify(project[0])
        });

        return { content };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error ${err}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    tools[`read_sourcecode`].name,
    tools[`read_sourcecode`].description,
    {
      project_id: z.number().describe('Project to read source code from'),
      filename: z.string().describe('Filename to read source code from'),
      start_line: z
        .number()
        .optional()
        .describe('Start line of the source code'),
      end_line: z.number().optional().describe('End line of the source code'),
      start_position: z
        .number()
        .optional()
        .describe('Start position of the source code'),
      end_position: z
        .number()
        .optional()
        .describe(
          'End position of the source code, if -1 then the full line will be returned'
        )
    },
    async ({
      project_id,
      filename,
      start_line,
      end_line,
      start_position,
      end_position
    }) => {
      try {
        const source_obj = await get_sourcecode({
          project_id,
          filename
        });

        const source = source_obj[0].source;

        const extracted = text_at_position({
          source,
          start_line,
          end_line,
          start_position,
          end_position
        });

        return {
          content: [
            {
              type: 'text',
              text: extracted
            }
          ]
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error ${err}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    tools[`function_caller_tree`].name,
    tools[`function_caller_tree`].description,
    {
      name: z.string().describe('Function name to retrieve caller tree for'),
      project: z.string().describe('Project name'),
      depth: z
        .number()
        .optional()
        .default(1)
        .describe('Depth of the tree (-1 for unlimited, default 1)')
    },
    async ({ name, project, depth }) => {
      try {
        const projects = await get_project_by_name({ name: project });

        if (projects.length === 0) {
          throw new Error(`Project '${project}' not found`);
        }

        const tree = await build_caller_tree({
          symbol: name,
          project_id: projects[0].id,
          depth
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(tree)
            }
          ]
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error ${err}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    tools[`function_callee_tree`].name,
    tools[`function_callee_tree`].description,
    {
      name: z.string().describe('Function name to retrieve callee tree for'),
      project: z.string().describe('Project name'),
      depth: z
        .number()
        .optional()
        .default(1)
        .describe('Depth of the tree (-1 for unlimited, default 1)')
    },
    async ({ name, project, depth }) => {
      try {
        const projects = await get_project_by_name({ name: project });

        if (projects.length === 0) {
          throw new Error(`Project '${project}' not found`);
        }

        const tree = await build_callee_tree({
          symbol: name,
          project_id: projects[0].id,
          depth
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(tree)
            }
          ]
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error ${err}` }],
          isError: true
        };
      }
    }
  );

  // Entity list - lists all entities (functions, classes, structs) in a project
  server.tool(
    'entity_list',
    `Lists all entities (functions, classes, structs, etc.) in a project, optionally filtered by filename or type.`,
    {
      project: z.string().describe('Project name to retrieve entities from'),
      filename: z.string().optional().describe('Filter by filename'),
      type: z.string().optional().describe('Filter by entity type (function, class, struct)')
    },
    async ({ project, filename, type }) => {
      try {
        const projects = await get_project_by_name({ name: project });
        if (projects.length === 0) {
          throw new Error(`Project '${project}' not found`);
        }

        const symbols = await get_entity_symbols({
          project_id: projects[0].id,
          filename,
          type
        });

        return {
          content: [{ type: 'text', text: JSON.stringify(symbols) }]
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true
        };
      }
    }
  );

  // Entity search - searches for entities by name
  server.tool(
    'entity_search',
    `Searches for entities (functions, classes, structs) by name. Partial matches are returned, case-insensitive.`,
    {
      name: z.string().describe('Name to search for'),
      project: z.string().optional().describe('Project name to search in'),
      type: z.string().optional().describe('Filter by entity type (function, class, struct)'),
      limit: z.number().optional().default(10).describe('Maximum results to return')
    },
    async ({ name, project, type, limit }) => {
      try {
        let project_id;
        if (project) {
          const projects = await get_project_by_name({ name: project });
          if (projects.length !== 0) {
            project_id = projects[0].id;
          }
        }

        const results = await entity_search({
          project_id,
          symbol: name,
          type,
          limit
        });

        return {
          content: [{ type: 'text', text: JSON.stringify(results) }]
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true
        };
      }
    }
  );

  // Class/struct members - retrieves member functions of a class or struct
  server.tool(
    'class_members',
    `Retrieves member functions of a class or struct by its entity ID.`,
    {
      entity_id: z.number().describe('Entity ID of the class or struct')
    },
    async ({ entity_id }) => {
      try {
        const entity = await get_entity_by_id(entity_id);
        if (!entity) {
          throw new Error(`Entity with ID ${entity_id} not found`);
        }
        if (entity.type !== 'class' && entity.type !== 'struct') {
          throw new Error(`Entity is not a class or struct (type: ${entity.type})`);
        }

        const members = await get_class_members({
          project_id: entity.project_id,
          filename: entity.filename,
          start_line: entity.start_line,
          end_line: entity.end_line
        });

        return {
          content: [{ type: 'text', text: JSON.stringify({ entity, members }) }]
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true
        };
      }
    }
  );

  // Entity references - retrieves all code locations where a struct/class is referenced
  server.tool(
    tools['entity_references'].name,
    tools['entity_references'].description,
    {
      name: z.string().describe('Name of the struct or class to find references for'),
      project: z.string().describe('Project name'),
      type: z.string().optional().describe('Filter by reference type (variable, parameter, field, typedef, macro)')
    },
    async ({ name, project, type }) => {
      try {
        const projects = await get_project_by_name({ name: project });
        if (projects.length === 0) {
          throw new Error(`Project '${project}' not found`);
        }

        const references = await get_references_by_symbol({
          symbol: name,
          project_id: projects[0].id,
          reference_type: type
        });

        if (references.length === 0) {
          return {
            content: [{ type: 'text', text: `No references found for '${name}'` }]
          };
        }

        return {
          content: [{ type: 'text', text: JSON.stringify(references) }]
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true
        };
      }
    }
  );

  // Call graph - builds a bidirectional call graph centered on a function
  server.tool(
    'function_call_graph',
    `Builds a bidirectional call graph centered on a function, showing both callers and callees.`,
    {
      name: z.string().describe('Function name to center the graph on'),
      project: z.string().describe('Project name'),
      depth: z.number().optional().default(3).describe('Maximum depth to traverse (max 5)'),
      filename: z.string().optional().describe('Filename to disambiguate if multiple functions have the same name')
    },
    async ({ name, project, depth, filename }) => {
      try {
        const projects = await get_project_by_name({ name: project });
        if (projects.length === 0) {
          throw new Error(`Project '${project}' not found`);
        }

        const graph = await build_call_graph({
          symbol: name,
          project_id: projects[0].id,
          filename,
          max_depth: Math.min(depth || 3, 5)
        });

        if (!graph.root) {
          throw new Error(`Function '${name}' not found`);
        }

        return {
          content: [{ type: 'text', text: JSON.stringify(graph) }]
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true
        };
      }
    }
  );

  // Control flow - returns control flow graph for a function
  server.tool(
    'function_control_flow',
    `Returns the control flow graph for a function, suitable for rendering as a flowchart.`,
    {
      name: z.string().describe('Function name'),
      project: z.string().describe('Project name'),
      filename: z.string().optional().describe('Filename to disambiguate')
    },
    async ({ name, project, filename }) => {
      try {
        const projects = await get_project_by_name({ name: project });
        if (projects.length === 0) {
          throw new Error(`Project '${project}' not found`);
        }
        const project_id = projects[0].id;

        const entities = await get_entity({
          project_id,
          symbol: name,
          filename,
          type: 'function'
        });

        if (entities.length === 0) {
          throw new Error(`Function '${name}' not found`);
        }

        let entity = entities[0];
        if (filename) {
          const match = entities.find(e => e.filename === filename || e.filename.endsWith(filename));
          if (match) entity = match;
        }

        const source_records = await get_sourcecode({
          project_id,
          filename: entity.filename
        });

        if (source_records.length === 0) {
          throw new Error('Source code not found');
        }

        const cfg = build_control_flow_from_source(
          source_records[0].source,
          entity.language,
          entity.start_line,
          entity.end_line
        );

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              function: {
                symbol: entity.symbol,
                filename: entity.filename,
                start_line: entity.start_line,
                end_line: entity.end_line,
                language: entity.language
              },
              ...cfg
            })
          }]
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true
        };
      }
    }
  );

  // Analysis dashboard - combined analysis overview
  server.tool(
    'analysis_dashboard',
    `Returns a comprehensive code analysis dashboard for a project, including health score and summaries of all analysis types.`,
    {
      project: z.string().describe('Project name')
    },
    async ({ project }) => {
      try {
        const projects = await get_project_by_name({ name: project });
        if (projects.length === 0) {
          throw new Error(`Project '${project}' not found`);
        }

        const result = await get_analysis_dashboard(projects[0].id);
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }]
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true
        };
      }
    }
  );

  // Dead code detection
  server.tool(
    'analysis_dead_code',
    `Detects potentially dead (unreferenced) code in a project.`,
    {
      project: z.string().describe('Project name')
    },
    async ({ project }) => {
      try {
        const projects = await get_project_by_name({ name: project });
        if (projects.length === 0) {
          throw new Error(`Project '${project}' not found`);
        }

        const result = await detect_dead_code(projects[0].id);
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }]
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true
        };
      }
    }
  );

  // Code duplication detection
  server.tool(
    'analysis_duplication',
    `Detects code duplication in a project.`,
    {
      project: z.string().describe('Project name'),
      threshold: z.number().optional().default(0.7).describe('Similarity threshold (0.0-1.0)')
    },
    async ({ project, threshold }) => {
      try {
        const projects = await get_project_by_name({ name: project });
        if (projects.length === 0) {
          throw new Error(`Project '${project}' not found`);
        }

        const result = await detect_code_duplication(projects[0].id, threshold);
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }]
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true
        };
      }
    }
  );

  // Dependency analysis
  server.tool(
    'analysis_dependencies',
    `Analyzes file dependencies and detects circular dependencies in a project.`,
    {
      project: z.string().describe('Project name')
    },
    async ({ project }) => {
      try {
        const projects = await get_project_by_name({ name: project });
        if (projects.length === 0) {
          throw new Error(`Project '${project}' not found`);
        }

        const result = await analyze_dependencies(projects[0].id);
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }]
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true
        };
      }
    }
  );

  // Security vulnerability detection
  server.tool(
    'analysis_security',
    `Detects potential security vulnerabilities in a project's code.`,
    {
      project: z.string().describe('Project name')
    },
    async ({ project }) => {
      try {
        const projects = await get_project_by_name({ name: project });
        if (projects.length === 0) {
          throw new Error(`Project '${project}' not found`);
        }

        const result = await detect_security_vulnerabilities(projects[0].id);
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }]
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true
        };
      }
    }
  );

  // Code metrics
  server.tool(
    'analysis_metrics',
    `Returns code complexity metrics for a project including cyclomatic complexity, lines of code, and maintainability index.`,
    {
      project: z.string().describe('Project name')
    },
    async ({ project }) => {
      try {
        const projects = await get_project_by_name({ name: project });
        if (projects.length === 0) {
          throw new Error(`Project '${project}' not found`);
        }

        const result = await get_code_metrics(projects[0].id);
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }]
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true
        };
      }
    }
  );

  // Code smell detection
  server.tool(
    'analysis_code_smells',
    `Detects code smells such as long methods, high complexity, deep nesting, and long parameter lists.`,
    {
      project: z.string().describe('Project name')
    },
    async ({ project }) => {
      try {
        const projects = await get_project_by_name({ name: project });
        if (projects.length === 0) {
          throw new Error(`Project '${project}' not found`);
        }

        const result = await detect_code_smells(projects[0].id);
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }]
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true
        };
      }
    }
  );

  // Type analysis
  server.tool(
    'analysis_types',
    `Analyzes type coverage and identifies functions without type hints in dynamically-typed languages.`,
    {
      project: z.string().describe('Project name')
    },
    async ({ project }) => {
      try {
        const projects = await get_project_by_name({ name: project });
        if (projects.length === 0) {
          throw new Error(`Project '${project}' not found`);
        }

        const result = await analyze_types(projects[0].id);
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }]
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true
        };
      }
    }
  );

  // API surface analysis
  server.tool(
    'analysis_api_surface',
    `Analyzes the public API surface of a project, identifying public vs private functions and entry points.`,
    {
      project: z.string().describe('Project name')
    },
    async ({ project }) => {
      try {
        const projects = await get_project_by_name({ name: project });
        if (projects.length === 0) {
          throw new Error(`Project '${project}' not found`);
        }

        const result = await analyze_api_surface(projects[0].id);
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }]
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true
        };
      }
    }
  );

  // Documentation coverage
  server.tool(
    'analysis_documentation',
    `Analyzes documentation coverage, identifying undocumented functions.`,
    {
      project: z.string().describe('Project name')
    },
    async ({ project }) => {
      try {
        const projects = await get_project_by_name({ name: project });
        if (projects.length === 0) {
          throw new Error(`Project '${project}' not found`);
        }

        const result = await analyze_documentation(projects[0].id);
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }]
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true
        };
      }
    }
  );

  // Variable scope analysis
  server.tool(
    'analysis_scope',
    `Analyzes variable scope issues including global variable usage and variable shadowing.`,
    {
      project: z.string().describe('Project name')
    },
    async ({ project }) => {
      try {
        const projects = await get_project_by_name({ name: project });
        if (projects.length === 0) {
          throw new Error(`Project '${project}' not found`);
        }

        const result = await analyze_variable_scope(projects[0].id);
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }]
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true
        };
      }
    }
  );

  // Project import - imports a new project from local path or git URL
  server.tool(
    'project_import',
    `Imports a new project from a local path or git URL. Parses all source files and extracts functions, classes, and relationships.`,
    {
      name: z.string().describe('Name for the project'),
      path: z.string().describe('Local path or git URL to import from')
    },
    async ({ name, path }) => {
      try {
        await create_project({ name, path });
        return {
          content: [{ type: 'text', text: `Project '${name}' imported successfully from '${path}'` }]
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true
        };
      }
    }
  );

  // Project refresh - refreshes an existing project's data
  server.tool(
    'project_refresh',
    `Refreshes an existing project, re-parsing all source files and updating functions, classes, and relationships.`,
    {
      name: z.string().describe('Name of the project to refresh')
    },
    async ({ name }) => {
      try {
        await refresh_project({ name });
        return {
          content: [{ type: 'text', text: `Project '${name}' refreshed successfully` }]
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true
        };
      }
    }
  );

  // Project delete - deletes a project and all its data
  server.tool(
    'project_delete',
    `Deletes a project and all associated data (entities, relationships, source code).`,
    {
      name: z.string().describe('Name of the project to delete')
    },
    async ({ name }) => {
      try {
        const projects = await get_project_by_name({ name });
        if (projects.length === 0) {
          throw new Error(`Project '${name}' not found`);
        }

        await delete_project(projects[0].id);
        return {
          content: [{ type: 'text', text: `Project '${name}' deleted successfully` }]
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true
        };
      }
    }
  );

  // Cross-reference: Find all references to a symbol
  server.tool(
    'symbol_references',
    `Finds all references to a symbol (function, class, variable, etc.) in a project. Returns all occurrences with context.`,
    {
      project: z.string().describe('Project name'),
      symbol: z.string().describe('Symbol name to find references for'),
      filename: z.string().optional().describe('Filter by filename'),
      definitions_only: z.boolean().optional().default(false).describe('Only return definitions')
    },
    async ({ project, symbol, filename, definitions_only }) => {
      try {
        const projects = await get_project_by_name({ name: project });
        if (projects.length === 0) {
          throw new Error(`Project '${project}' not found`);
        }

        const result = await find_all_references(projects[0].id, symbol, {
          filename,
          definitions_only
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }]
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true
        };
      }
    }
  );

  // Cross-reference: Go to definition
  server.tool(
    'go_to_definition',
    `Finds the definition of a symbol. Returns the location where the symbol is defined.`,
    {
      project: z.string().describe('Project name'),
      symbol: z.string().describe('Symbol name to find definition for'),
      filename: z.string().optional().describe('File where the reference is (for context)'),
      line: z.number().optional().describe('Line where the reference is (for context)')
    },
    async ({ project, symbol, filename, line }) => {
      try {
        const projects = await get_project_by_name({ name: project });
        if (projects.length === 0) {
          throw new Error(`Project '${project}' not found`);
        }

        const result = await go_to_definition(projects[0].id, symbol, { filename, line });
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }]
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true
        };
      }
    }
  );

  // Cross-reference: List all definitions
  server.tool(
    'list_definitions',
    `Lists all symbol definitions in a project, optionally filtered by type.`,
    {
      project: z.string().describe('Project name'),
      type: z.string().optional().describe('Filter by symbol type (function, class, variable, parameter, etc.)')
    },
    async ({ project, type }) => {
      try {
        const projects = await get_project_by_name({ name: project });
        if (projects.length === 0) {
          throw new Error(`Project '${project}' not found`);
        }

        const result = await list_definitions(projects[0].id, { symbol_type: type });
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }]
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true
        };
      }
    }
  );

  // Cross-reference: Symbol reference summary
  server.tool(
    'symbol_reference_summary',
    `Returns a summary of symbol references in a project, showing which symbols are most referenced.`,
    {
      project: z.string().describe('Project name')
    },
    async ({ project }) => {
      try {
        const projects = await get_project_by_name({ name: project });
        if (projects.length === 0) {
          throw new Error(`Project '${project}' not found`);
        }

        const result = await get_symbol_reference_summary(projects[0].id);
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }]
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true
        };
      }
    }
  );

  // Cross-reference: Symbols at location
  server.tool(
    'symbols_at_location',
    `Finds symbols at a specific location in a file. Useful for hover functionality.`,
    {
      project: z.string().describe('Project name'),
      filename: z.string().describe('Filename'),
      line: z.number().describe('Line number'),
      column: z.number().optional().describe('Column number for precise matching')
    },
    async ({ project, filename, line, column }) => {
      try {
        const projects = await get_project_by_name({ name: project });
        if (projects.length === 0) {
          throw new Error(`Project '${project}' not found`);
        }

        const result = await find_symbols_at_location(projects[0].id, filename, line, column);
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }]
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true
        };
      }
    }
  );

  // Class hierarchy: Get hierarchy tree for a class
  server.tool(
    'class_hierarchy',
    `Gets the inheritance hierarchy tree for a class or struct. Can traverse up (parents/ancestors), down (children/descendants), or both.`,
    {
      project: z.string().describe('Project name'),
      symbol: z.string().describe('Class or struct symbol name'),
      direction: z.enum(['up', 'down', 'both']).optional().default('both').describe('Direction to traverse: up (ancestors), down (descendants), or both'),
      max_depth: z.number().optional().default(10).describe('Maximum depth to traverse')
    },
    async ({ project, symbol, direction, max_depth }) => {
      try {
        const projects = await get_project_by_name({ name: project });
        if (projects.length === 0) {
          throw new Error(`Project '${project}' not found`);
        }

        const result = await get_class_hierarchy(projects[0].id, symbol, { direction, max_depth });
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }]
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true
        };
      }
    }
  );

  // Class hierarchy: Find implementations
  server.tool(
    'interface_implementations',
    `Finds all classes that implement a specific interface or extend a class.`,
    {
      project: z.string().describe('Project name'),
      symbol: z.string().describe('Interface or base class symbol name')
    },
    async ({ project, symbol }) => {
      try {
        const projects = await get_project_by_name({ name: project });
        if (projects.length === 0) {
          throw new Error(`Project '${project}' not found`);
        }

        const result = await find_implementations(projects[0].id, symbol);
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }]
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true
        };
      }
    }
  );

  // Class hierarchy: Full project hierarchy analysis
  server.tool(
    'analysis_hierarchy',
    `Analyzes the complete class hierarchy of a project. Shows inheritance relationships, root classes, leaf classes, and depth statistics.`,
    {
      project: z.string().describe('Project name')
    },
    async ({ project }) => {
      try {
        const projects = await get_project_by_name({ name: project });
        if (projects.length === 0) {
          throw new Error(`Project '${project}' not found`);
        }

        const result = await analyze_class_hierarchy(projects[0].id);
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }]
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true
        };
      }
    }
  );

  // Concurrency analysis
  server.tool(
    'analysis_concurrency',
    `Analyzes concurrency patterns in a project. Detects async/await, threads, locks, synchronization primitives, and potential race conditions.`,
    {
      project: z.string().describe('Project name')
    },
    async ({ project }) => {
      try {
        const projects = await get_project_by_name({ name: project });
        if (projects.length === 0) {
          throw new Error(`Project '${project}' not found`);
        }

        const result = await analyze_project_concurrency(projects[0].id);
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }]
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true
        };
      }
    }
  );

  // Resource analysis
  server.tool(
    'analysis_resources',
    `Analyzes memory and resource management patterns in a project. Detects resource acquisition/release, smart pointers, RAII patterns, and potential resource leaks.`,
    {
      project: z.string().describe('Project name')
    },
    async ({ project }) => {
      try {
        const projects = await get_project_by_name({ name: project });
        if (projects.length === 0) {
          throw new Error(`Project '${project}' not found`);
        }

        const result = await analyze_project_resources(projects[0].id);
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }]
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true
        };
      }
    }
  );

  // Naming convention analysis
  server.tool(
    'analysis_naming',
    `Analyzes naming conventions across a codebase. Detects case conventions (camelCase, snake_case, PascalCase), checks language-specific compliance, calculates consistency scoring, and identifies naming issues.`,
    {
      project: z.string().describe('Project name')
    },
    async ({ project }) => {
      try {
        const projects = await get_project_by_name({ name: project });
        if (projects.length === 0) {
          throw new Error(`Project '${project}' not found`);
        }

        const result = await analyze_project_naming_conventions(projects[0].id);
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }]
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true
        };
      }
    }
  );

  // Readability score analysis
  server.tool(
    'analysis_readability',
    `Calculates code readability scores based on multiple metrics: identifier length, comment-to-code ratio, function length, nesting depth, line length, magic numbers, and boolean expression complexity. Returns per-function scores and project-wide statistics.`,
    {
      project: z.string().describe('Project name')
    },
    async ({ project }) => {
      try {
        const projects = await get_project_by_name({ name: project });
        if (projects.length === 0) {
          throw new Error(`Project '${project}' not found`);
        }

        const result = await analyze_project_readability_score(projects[0].id);
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }]
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true
        };
      }
    }
  );

  return server;
};

/**
 * Session manager for MCP HTTP transport.
 * Maps session IDs to their transport instances.
 */
const transports = {};

/**
 * Hapi route handler for MCP HTTP transport.
 * Handles POST, GET, and DELETE methods for the /mcp endpoint.
 */
const mcpRouteHandler = async (request, h) => {
  const sessionId = request.headers['mcp-session-id'];

  // Get raw Node.js request and response objects from Hapi
  const req = request.raw.req;
  const res = request.raw.res;

  // For POST requests, get the parsed body
  const body = request.method === 'post' ? request.payload : undefined;

  try {
    let transport;

    if (sessionId && transports[sessionId]) {
      // Reuse existing transport for established sessions
      transport = transports[sessionId];
    } else if (!sessionId && isInitializeRequest(body)) {
      // New initialization request - create new transport
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          // Store transport when session is initialized
          transports[id] = transport;
        }
      });

      // Set up close handler to clean up
      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid && transports[sid]) {
          delete transports[sid];
        }
      };

      // Connect transport to MCP server before handling request
      const mcpServer = createMcpServer();
      await mcpServer.connect(transport);
    } else if (!sessionId) {
      // No session ID and not an initialize request
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: -32600,
          message: 'Bad Request: No session ID provided and not an initialization request'
        },
        id: null
      }));
      return h.abandon;
    } else {
      // Session ID provided but transport not found
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: -32600,
          message: 'Bad Request: Session not found'
        },
        id: null
      }));
      return h.abandon;
    }

    // Handle the request through the MCP transport
    await transport.handleRequest(req, res, body);
    return h.abandon;
  } catch (err) {
    console.error('MCP HTTP error:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: 'Internal error',
        data: err.message
      },
      id: null
    }));
    return h.abandon;
  }
};

/**
 * Hapi routes for MCP HTTP transport.
 * @type {Object[]}
 */
const mcpRoutes = [
  {
    method: 'POST',
    path: '/mcp',
    options: {
      payload: {
        parse: true,
        output: 'data'
      }
    },
    handler: mcpRouteHandler
  },
  {
    method: 'GET',
    path: '/mcp',
    handler: mcpRouteHandler
  },
  {
    method: 'DELETE',
    path: '/mcp',
    handler: mcpRouteHandler
  }
];

export { mcpRoutes, createMcpServer };
