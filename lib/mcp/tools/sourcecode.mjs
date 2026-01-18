'use strict';

/**
 * @fileoverview MCP tool handlers for source code operations.
 * @module lib/mcp/tools/sourcecode
 */

import { z } from 'zod';
import { get_project_by_name } from '../../model/project.mjs';
import { get_entity } from '../../model/entity.mjs';
import { get_sourcecode } from '../../model/sourcecode.mjs';
import { text_at_position } from '../../sourcecode.mjs';
import { calculate_complexity } from '../../complexity.mjs';
import { tools } from '../../strings.mjs';

// =============================================================================
// Handler Functions (testable independently)
// =============================================================================

/**
 * Reads source code from a file with optional line range.
 * @param {Object} params - Parameters
 * @param {number} params.project_id - Project ID
 * @param {string} params.filename - Filename to read
 * @param {number} [params.start_line] - Start line
 * @param {number} [params.end_line] - End line
 * @param {number} [params.start_position] - Start position
 * @param {number} [params.end_position] - End position (-1 for full line)
 * @returns {Promise<Object>} MCP response with source code
 */
export const read_sourcecode_handler = async ({
  project_id,
  filename,
  start_line,
  end_line,
  start_position,
  end_position
}) => {
  const source_obj = await get_sourcecode({
    project_id,
    filename
  });

  if (source_obj.length === 0) {
    throw new Error(`Source code not found for '${filename}'`);
  }

  const source = source_obj[0].source;

  const extracted = text_at_position({
    source,
    start_line,
    end_line,
    start_position,
    end_position
  });

  return {
    content: [{ type: 'text', text: extracted }]
  };
};

/**
 * Returns analytics and complexity metrics for all entities in a file.
 * @param {Object} params - Parameters
 * @param {string} params.project - Project name
 * @param {string} params.filename - Filename to analyze
 * @returns {Promise<Object>} MCP response with file analytics
 */
export const file_analytics_handler = async ({ project_name, filename }) => {
  const projects = await get_project_by_name({ name: project_name });
  if (projects.length === 0) {
    throw new Error(`Project '${project_name}' not found`);
  }

  const project_id = projects[0].id;

  const entities = await get_entity({
    project_id,
    filename
  });

  if (entities.length === 0) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            filename,
            project,
            entity_count: 0,
            entities_by_type: {},
            complexity: null
          })
        }
      ]
    };
  }

  const entities_with_complexity = entities.map((entity) => ({
    ...entity,
    complexity: calculate_complexity(entity)
  }));

  const entities_by_type = {};
  for (const entity of entities) {
    entities_by_type[entity.type] = (entities_by_type[entity.type] || 0) + 1;
  }

  const functions_with_complexity = entities_with_complexity.filter(
    (e) => e.complexity && e.type === 'function'
  );

  let complexity = null;
  if (functions_with_complexity.length > 0) {
    const cyclomatics = functions_with_complexity.map(
      (e) => e.complexity.cyclomatic
    );
    const locs = functions_with_complexity.map((e) => e.complexity.loc);
    const nesting_depths = functions_with_complexity.map(
      (e) => e.complexity.nesting_depth
    );
    const param_counts = functions_with_complexity.map(
      (e) => e.complexity.parameter_count
    );

    complexity = {
      total_functions: functions_with_complexity.length,
      total_loc: locs.reduce((a, b) => a + b, 0),
      avg_cyclomatic: (
        cyclomatics.reduce((a, b) => a + b, 0) / cyclomatics.length
      ).toFixed(2),
      max_cyclomatic: Math.max(...cyclomatics),
      min_cyclomatic: Math.min(...cyclomatics),
      avg_loc: (locs.reduce((a, b) => a + b, 0) / locs.length).toFixed(1),
      max_loc: Math.max(...locs),
      avg_nesting_depth: (
        nesting_depths.reduce((a, b) => a + b, 0) / nesting_depths.length
      ).toFixed(2),
      max_nesting_depth: Math.max(...nesting_depths),
      avg_parameters: (
        param_counts.reduce((a, b) => a + b, 0) / param_counts.length
      ).toFixed(1),
      max_parameters: Math.max(...param_counts)
    };
  }

  const top_complex = functions_with_complexity
    .sort((a, b) => b.complexity.cyclomatic - a.complexity.cyclomatic)
    .slice(0, 5)
    .map((e) => ({
      id: e.id,
      symbol: e.symbol,
      start_line: e.start_line,
      complexity: e.complexity
    }));

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          filename,
          project,
          entity_count: entities.length,
          entities_by_type,
          complexity,
          top_complex
        })
      }
    ]
  };
};

// =============================================================================
// Tool Definitions (for registration)
// =============================================================================

export const sourcecode_tools = [
  {
    name: tools['read_sourcecode'].name,
    description: tools['read_sourcecode'].description,
    schema: {
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
    handler: read_sourcecode_handler
  },
  {
    name: 'file_analytics',
    description: `Returns analytics and complexity metrics for all entities in a specific file:
- Entity counts by type (functions, classes, structs)
- Aggregated complexity metrics (avg/max cyclomatic, LOC, nesting)
- Top 5 most complex functions in the file
- Total lines of code

Useful for understanding the complexity of a specific file.`,
    schema: {
      project_name: z.string().describe('The name of the project (use project_list to see available projects)'),
      filename: z.string().describe('Filename to analyze')
    },
    handler: file_analytics_handler
  }
];
