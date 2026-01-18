'use strict';

/**
 * @fileoverview MCP tool handlers for class hierarchy operations.
 * @module lib/mcp/tools/hierarchy
 */

import { z } from 'zod';
import { get_project_by_name } from '../../model/project.mjs';
import {
  get_class_hierarchy,
  find_implementations,
  analyze_class_hierarchy
} from '../../analysis.mjs';

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Gets project ID from project name.
 * @param {string} project - Project name
 * @returns {Promise<number>} Project ID
 * @throws {Error} If project not found
 */
const get_project_id = async (project) => {
  const projects = await get_project_by_name({ name: project });
  if (projects.length === 0) {
    throw new Error(`Project '${project}' not found`);
  }
  return projects[0].id;
};

// =============================================================================
// Handler Functions (testable independently)
// =============================================================================

/**
 * Gets the inheritance hierarchy tree for a class or struct.
 * @param {Object} params - Parameters
 * @param {string} params.project - Project name
 * @param {string} params.symbol - Class or struct symbol name
 * @param {string} [params.direction='both'] - Direction to traverse (up, down, both)
 * @param {number} [params.max_depth=10] - Maximum depth to traverse
 * @returns {Promise<Object>} MCP response with hierarchy tree
 */
export const class_hierarchy_handler = async ({
  project,
  symbol,
  direction = 'both',
  max_depth = 10
}) => {
  const project_id = await get_project_id(project);
  const result = await get_class_hierarchy(project_id, symbol, {
    direction,
    max_depth
  });
  return {
    content: [{ type: 'text', text: JSON.stringify(result) }]
  };
};

/**
 * Finds all classes that implement a specific interface or extend a class.
 * @param {Object} params - Parameters
 * @param {string} params.project - Project name
 * @param {string} params.symbol - Interface or base class symbol name
 * @returns {Promise<Object>} MCP response with implementations
 */
export const interface_implementations_handler = async ({ project, symbol }) => {
  const project_id = await get_project_id(project);
  const result = await find_implementations(project_id, symbol);
  return {
    content: [{ type: 'text', text: JSON.stringify(result) }]
  };
};

/**
 * Analyzes the complete class hierarchy of a project.
 * @param {Object} params - Parameters
 * @param {string} params.project - Project name
 * @returns {Promise<Object>} MCP response with hierarchy analysis
 */
export const analysis_hierarchy_handler = async ({ project }) => {
  const project_id = await get_project_id(project);
  const result = await analyze_class_hierarchy(project_id);
  return {
    content: [{ type: 'text', text: JSON.stringify(result) }]
  };
};

// =============================================================================
// Tool Definitions (for registration)
// =============================================================================

export const hierarchy_tools = [
  {
    name: 'class_hierarchy',
    description:
      'Gets the inheritance hierarchy tree for a class or struct. Can traverse up (parents/ancestors), down (children/descendants), or both.',
    schema: {
      project: z.string().describe('Project name'),
      symbol: z.string().describe('Class or struct symbol name'),
      direction: z
        .enum(['up', 'down', 'both'])
        .optional()
        .default('both')
        .describe(
          'Direction to traverse: up (ancestors), down (descendants), or both'
        ),
      max_depth: z
        .number()
        .optional()
        .default(10)
        .describe('Maximum depth to traverse')
    },
    handler: class_hierarchy_handler
  },
  {
    name: 'interface_implementations',
    description:
      'Finds all classes that implement a specific interface or extend a class.',
    schema: {
      project: z.string().describe('Project name'),
      symbol: z.string().describe('Interface or base class symbol name')
    },
    handler: interface_implementations_handler
  },
  {
    name: 'analysis_hierarchy',
    description:
      'Analyzes the complete class hierarchy of a project. Shows inheritance relationships, root classes, leaf classes, and depth statistics.',
    schema: {
      project: z.string().describe('Project name')
    },
    handler: analysis_hierarchy_handler
  }
];
