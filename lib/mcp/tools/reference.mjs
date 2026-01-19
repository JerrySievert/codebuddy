'use strict';

/**
 * @fileoverview MCP tool handlers for cross-reference operations.
 * @module lib/mcp/tools/reference
 */

import { z } from 'zod';
import { get_project_by_name } from '../../model/project.mjs';
import {
  find_all_references,
  go_to_definition,
  list_definitions,
  get_symbol_reference_summary,
  find_symbols_at_location
} from '../../analysis/index.mjs';

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Gets project ID from project name.
 * @param {string} project - Project name
 * @returns {Promise<number>} Project ID
 * @throws {Error} If project not found
 */
const get_project_id = async (project_name) => {
  const projects = await get_project_by_name({ name: project_name });
  if (projects.length === 0) {
    throw new Error(`Project '${project_name}' not found`);
  }
  return projects[0].id;
};

// =============================================================================
// Handler Functions (testable independently)
// =============================================================================

/**
 * Finds all references to a symbol in a project.
 * @param {Object} params - Parameters
 * @param {string} params.project - Project name
 * @param {string} params.symbol - Symbol name to find references for
 * @param {string} [params.filename] - Filter by filename
 * @param {boolean} [params.definitions_only=false] - Only return definitions
 * @returns {Promise<Object>} MCP response with references
 */
export const symbol_references_handler = async ({
  project_name,
  symbol,
  filename,
  definitions_only = false
}) => {
  const project_id = await get_project_id(project_name);
  const result = await find_all_references(project_id, symbol, {
    filename,
    definitions_only
  });
  return {
    content: [{ type: 'text', text: JSON.stringify(result) }]
  };
};

/**
 * Finds the definition of a symbol.
 * @param {Object} params - Parameters
 * @param {string} params.project - Project name
 * @param {string} params.symbol - Symbol name to find definition for
 * @param {string} [params.filename] - File where the reference is (for context)
 * @param {number} [params.line] - Line where the reference is (for context)
 * @returns {Promise<Object>} MCP response with definition location
 */
export const go_to_definition_handler = async ({
  project_name,
  symbol,
  filename,
  line
}) => {
  const project_id = await get_project_id(project_name);
  const result = await go_to_definition(project_id, symbol, { filename, line });
  return {
    content: [{ type: 'text', text: JSON.stringify(result) }]
  };
};

/**
 * Lists all symbol definitions in a project.
 * @param {Object} params - Parameters
 * @param {string} params.project - Project name
 * @param {string} [params.type] - Filter by symbol type
 * @returns {Promise<Object>} MCP response with definitions
 */
export const list_definitions_handler = async ({ project_name, type }) => {
  const project_id = await get_project_id(project_name);
  const result = await list_definitions(project_id, { symbol_type: type });
  return {
    content: [{ type: 'text', text: JSON.stringify(result) }]
  };
};

/**
 * Returns a summary of symbol references in a project.
 * @param {Object} params - Parameters
 * @param {string} params.project - Project name
 * @returns {Promise<Object>} MCP response with reference summary
 */
export const symbol_reference_summary_handler = async ({ project_name }) => {
  const project_id = await get_project_id(project_name);
  const result = await get_symbol_reference_summary(project_id);
  return {
    content: [{ type: 'text', text: JSON.stringify(result) }]
  };
};

/**
 * Finds symbols at a specific location in a file.
 * @param {Object} params - Parameters
 * @param {string} params.project - Project name
 * @param {string} params.filename - Filename
 * @param {number} params.line - Line number
 * @param {number} [params.column] - Column number for precise matching
 * @returns {Promise<Object>} MCP response with symbols at location
 */
export const symbols_at_location_handler = async ({
  project_name,
  filename,
  line,
  column
}) => {
  const project_id = await get_project_id(project_name);
  const result = await find_symbols_at_location(
    project_id,
    filename,
    line,
    column
  );
  return {
    content: [{ type: 'text', text: JSON.stringify(result) }]
  };
};

// =============================================================================
// Tool Definitions (for registration)
// =============================================================================

export const reference_tools = [
  {
    name: 'symbol_references',
    description:
      'Finds all references to a symbol (function, class, variable, etc.) in a project. Returns all occurrences with context.',
    schema: {
      project_name: z
        .string()
        .describe(
          'The name of the project (use project_list to see available projects)'
        ),
      symbol: z.string().describe('Symbol name to find references for'),
      filename: z.string().optional().describe('Filter by filename'),
      definitions_only: z
        .boolean()
        .optional()
        .default(false)
        .describe('Only return definitions')
    },
    handler: symbol_references_handler
  },
  {
    name: 'go_to_definition',
    description:
      'Finds the definition of a symbol. Returns the location where the symbol is defined.',
    schema: {
      project_name: z
        .string()
        .describe(
          'The name of the project (use project_list to see available projects)'
        ),
      symbol: z.string().describe('Symbol name to find definition for'),
      filename: z
        .string()
        .optional()
        .describe('File where the reference is (for context)'),
      line: z
        .number()
        .optional()
        .describe('Line where the reference is (for context)')
    },
    handler: go_to_definition_handler
  },
  {
    name: 'list_definitions',
    description:
      'Lists all symbol definitions in a project, optionally filtered by type.',
    schema: {
      project_name: z
        .string()
        .describe(
          'The name of the project (use project_list to see available projects)'
        ),
      type: z
        .string()
        .optional()
        .describe(
          'Filter by symbol type (function, class, variable, parameter, etc.)'
        )
    },
    handler: list_definitions_handler
  },
  {
    name: 'symbol_reference_summary',
    description:
      'Returns a summary of symbol references in a project, showing which symbols are most referenced.',
    schema: {
      project_name: z
        .string()
        .describe(
          'The name of the project (use project_list to see available projects)'
        )
    },
    handler: symbol_reference_summary_handler
  },
  {
    name: 'symbols_at_location',
    description:
      'Finds symbols at a specific location in a file. Useful for hover functionality.',
    schema: {
      project_name: z
        .string()
        .describe(
          'The name of the project (use project_list to see available projects)'
        ),
      filename: z.string().describe('Filename'),
      line: z.number().describe('Line number'),
      column: z
        .number()
        .optional()
        .describe('Column number for precise matching')
    },
    handler: symbols_at_location_handler
  }
];
