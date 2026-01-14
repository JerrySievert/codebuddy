'use strict';

/**
 * @fileoverview Sourcecode read API route.
 * Retrieves source code for a file in a project.
 * @module lib/api/v1/sourcecode/read
 */

import { get_project_by_name } from '../../../model/project.mjs';
import { get_sourcecode } from '../../../model/sourcecode.mjs';
import { text_at_position } from '../../../sourcecode.mjs';

/**
 * Handler for GET /api/v1/sourcecode - read source code for a file.
 * @param {Object} request - Hapi request object
 * @param {Object} request.query - Query parameters
 * @param {string} request.query.project - Project name (required)
 * @param {string} request.query.filename - Filename to read (required)
 * @param {number} [request.query.start_line] - Start line (1-based)
 * @param {number} [request.query.end_line] - End line (1-based)
 * @param {number} [request.query.start_position] - Start column position
 * @param {number} [request.query.end_position] - End column position (-1 for full line)
 * @param {Object} h - Hapi response toolkit
 * @returns {Promise<Object>} Source code content, or error
 */
const read_handler = async (request, h) => {
  const { project, filename, start_line, end_line, start_position, end_position } = request.query;

  if (!project) {
    return h
      .response({ error: 'project query parameter is required' })
      .code(400);
  }

  if (!filename) {
    return h
      .response({ error: 'filename query parameter is required' })
      .code(400);
  }

  const projects = await get_project_by_name({ name: project });

  if (projects.length === 0) {
    return h.response({ error: `Project '${project}' not found` }).code(404);
  }

  const source_obj = await get_sourcecode({
    project_id: projects[0].id,
    filename
  });

  if (source_obj.length === 0) {
    return h.response({ error: `File '${filename}' not found in project '${project}'` }).code(404);
  }

  const source = source_obj[0].source;

  // If line parameters provided, extract specific portion
  if (start_line !== undefined || end_line !== undefined) {
    const extracted = text_at_position({
      source,
      start_line: start_line ? parseInt(start_line, 10) : undefined,
      end_line: end_line ? parseInt(end_line, 10) : undefined,
      start_position: start_position ? parseInt(start_position, 10) : undefined,
      end_position: end_position ? parseInt(end_position, 10) : undefined
    });

    return { source: extracted, filename, project };
  }

  return { source, filename, project };
};

const read = {
  method: 'GET',
  path: '/api/v1/sourcecode',
  handler: read_handler
};

export { read };
