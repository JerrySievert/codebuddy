'use strict';

/**
 * @fileoverview MCP tool handlers for entity operations.
 * @module lib/mcp/tools/entity
 */

import { z } from 'zod';
import { get_project_by_name } from '../../model/project.mjs';
import {
  get_entity_symbols,
  get_entity_by_id,
  get_class_members,
  entity_search
} from '../../model/entity.mjs';
import { get_references_by_symbol } from '../../model/reference.mjs';
import { tools } from '../../strings.mjs';

// =============================================================================
// Handler Functions (testable independently)
// =============================================================================

/**
 * Lists all entities in a project, optionally filtered by filename or type.
 * @param {Object} params - Parameters
 * @param {string} params.project - Project name
 * @param {string} [params.filename] - Filter by filename
 * @param {string} [params.type] - Filter by entity type (function, class, struct)
 * @returns {Promise<Object>} MCP response with entity list
 */
export const entity_list_handler = async ({ project_name, filename, type }) => {
  const projects = await get_project_by_name({ name: project_name });
  if (projects.length === 0) {
    throw new Error(`Project '${project_name}' not found`);
  }

  const symbols = await get_entity_symbols({
    project_id: projects[0].id,
    filename,
    type: type || undefined
  });

  return {
    content: [{ type: 'text', text: JSON.stringify(symbols) }]
  };
};

/**
 * Searches for entities by name using fuzzy matching.
 * @param {Object} params - Parameters
 * @param {string} params.name - Entity name to search for
 * @param {string} [params.project] - Filter by project name
 * @param {string} [params.filename] - Filter by filename
 * @param {string} [params.type] - Filter by entity type
 * @param {number} [params.limit=10] - Maximum results to return
 * @returns {Promise<Object>} MCP response with search results
 */
export const entity_search_handler = async ({
  name,
  project_name,
  filename,
  type,
  limit = 10
}) => {
  let project_id;
  if (project_name) {
    const projects = await get_project_by_name({ name: project_name });
    if (projects.length !== 0) {
      project_id = projects[0].id;
    }
  }

  const results = await entity_search({
    project_id,
    filename,
    symbol: name,
    type: type || undefined,
    limit: limit || 10
  });

  return {
    content: [{ type: 'text', text: JSON.stringify(results) }]
  };
};

/**
 * Retrieves all references to a struct or class.
 * @param {Object} params - Parameters
 * @param {string} params.name - Name of the struct or class
 * @param {string} params.project - Project name
 * @param {string} [params.type] - Filter by reference type
 * @returns {Promise<Object>} MCP response with references
 */
export const entity_references_handler = async ({
  name,
  project_name,
  type
}) => {
  const projects = await get_project_by_name({ name: project_name });
  if (projects.length === 0) {
    throw new Error(`Project '${project_name}' not found`);
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
};

/**
 * Gets member functions of a class or struct by entity ID.
 * @param {Object} params - Parameters
 * @param {number} params.id - Entity ID of the class or struct
 * @returns {Promise<Object>} MCP response with class members
 */
export const class_members_handler = async ({ id }) => {
  const entity = await get_entity_by_id(id);

  if (!entity) {
    throw new Error('Entity not found');
  }

  if (entity.type !== 'class' && entity.type !== 'struct') {
    throw new Error('Entity is not a class or struct');
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
};

// =============================================================================
// Tool Definitions (for registration)
// =============================================================================

export const entity_tools = [
  {
    name: 'entity_list',
    description:
      'Lists all entities in a project. Entities include functions, classes, and structs. Can be filtered by filename or type.',
    schema: {
      project_name: z
        .string()
        .describe(
          'The name of the project (required, use project_list to see available projects)'
        ),
      filename: z.string().optional().describe('Filter by filename'),
      type: z
        .string()
        .optional()
        .describe('Filter by entity type: function, class, or struct')
    },
    handler: entity_list_handler
  },
  {
    name: 'entity_search',
    description:
      "Searches for entities (functions, classes, structs) by name using fuzzy matching. Returns results sorted by relevance. Useful when you don't know the exact name of a symbol.",
    schema: {
      name: z.string().describe('Entity name to search for'),
      project_name: z.string().optional().describe('Filter by project name'),
      filename: z.string().optional().describe('Filter by filename'),
      type: z
        .string()
        .optional()
        .describe('Filter by entity type: function, class, or struct'),
      limit: z
        .number()
        .optional()
        .default(10)
        .describe('Maximum number of results')
    },
    handler: entity_search_handler
  },
  {
    name: tools['entity_references'].name,
    description: tools['entity_references'].description,
    schema: {
      name: z
        .string()
        .describe('Name of the struct or class to find references for'),
      project_name: z
        .string()
        .describe(
          'The name of the project (use project_list to see available projects)'
        ),
      type: z
        .string()
        .optional()
        .describe(
          'Filter by reference type (variable, parameter, field, typedef, macro)'
        )
    },
    handler: entity_references_handler
  },
  {
    name: 'class_members',
    description:
      'Gets member functions of a class or struct. Returns all methods/functions defined within the class body.',
    schema: {
      id: z.number().describe('Entity ID of the class or struct')
    },
    handler: class_members_handler
  }
];
