'use strict';

/**
 * @fileoverview MCP tool handlers for project operations.
 * @module lib/mcp/tools/project
 */

import { z } from 'zod';
import {
  get_all_projects_with_metadata,
  get_project_by_name,
  delete_project
} from '../../model/project.mjs';
import { create_project, refresh_project } from '../../project.mjs';
import { tools } from '../../strings.mjs';
import { is_read_only } from '../../config.mjs';

// =============================================================================
// Handler Functions (testable independently)
// =============================================================================

/**
 * Lists all known projects with their metadata.
 * @returns {Promise<Object>} MCP response with project list
 */
export const project_list_handler = async () => {
  const entities = await get_all_projects_with_metadata();

  const content = [];
  for (const entity of entities) {
    content.push({
      type: 'text',
      text: JSON.stringify(entity)
    });
  }

  return { content };
};

/**
 * Retrieves detailed information about a specific project.
 * @param {Object} params - Parameters
 * @param {string} params.name - Project name
 * @returns {Promise<Object>} MCP response with project info
 */
export const project_info_handler = async ({ name }) => {
  const project = await get_project_by_name({ name });

  if (project.length === 0) {
    throw new Error(`Project '${name}' not found`);
  }

  return {
    content: [{ type: 'text', text: JSON.stringify(project[0]) }]
  };
};

/**
 * Imports a new project from a local path or git URL.
 * @param {Object} params - Parameters
 * @param {string} params.name - Name for the project
 * @param {string} params.path - Local path or git URL to import from
 * @returns {Promise<Object>} MCP response with success message
 */
export const project_import_handler = async ({ name, path }) => {
  if (is_read_only()) {
    throw new Error('Server is in read-only mode. Import is disabled.');
  }

  await create_project({ name, path });
  return {
    content: [
      {
        type: 'text',
        text: `Project '${name}' imported successfully from '${path}'`
      }
    ]
  };
};

/**
 * Refreshes an existing project, re-parsing all source files.
 * @param {Object} params - Parameters
 * @param {string} params.name - Name of the project to refresh
 * @returns {Promise<Object>} MCP response with success message
 */
export const project_refresh_handler = async ({ name }) => {
  if (is_read_only()) {
    throw new Error('Server is in read-only mode. Refresh is disabled.');
  }

  await refresh_project({ name });
  return {
    content: [
      { type: 'text', text: `Project '${name}' refreshed successfully` }
    ]
  };
};

/**
 * Deletes a project and all associated data.
 * @param {Object} params - Parameters
 * @param {string} params.name - Name of the project to delete
 * @returns {Promise<Object>} MCP response with success message
 */
export const project_delete_handler = async ({ name }) => {
  if (is_read_only()) {
    throw new Error('Server is in read-only mode. Delete is disabled.');
  }

  const projects = await get_project_by_name({ name });
  if (projects.length === 0) {
    throw new Error(`Project '${name}' not found`);
  }

  await delete_project(projects[0].id);
  return {
    content: [{ type: 'text', text: `Project '${name}' deleted successfully` }]
  };
};

// =============================================================================
// Tool Definitions (for registration)
// =============================================================================

export const project_tools = [
  {
    name: tools['project_list'].name,
    description: tools['project_list'].description,
    schema: {},
    handler: project_list_handler
  },
  {
    name: tools['project_info'].name,
    description: tools['project_info'].description,
    schema: {
      name: z
        .string()
        .describe(
          'The name of the project (use project_list to see available projects)'
        )
    },
    handler: project_info_handler
  },
  {
    name: 'project_import',
    description:
      'Imports a new project from a local path or git URL. Parses all source files and extracts functions, classes, and relationships.',
    schema: {
      name: z.string().describe('Name for the project'),
      path: z.string().describe('Local path or git URL to import from')
    },
    handler: project_import_handler
  },
  {
    name: 'project_refresh',
    description:
      'Refreshes an existing project, re-parsing all source files and updating functions, classes, and relationships.',
    schema: {
      name: z.string().describe('Name of the project to refresh')
    },
    handler: project_refresh_handler
  },
  {
    name: 'project_delete',
    description:
      'Deletes a project and all associated data (entities, relationships, source code).',
    schema: {
      name: z.string().describe('Name of the project to delete')
    },
    handler: project_delete_handler
  }
];
