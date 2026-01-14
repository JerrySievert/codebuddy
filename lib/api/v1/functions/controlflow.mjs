'use strict';

/**
 * @fileoverview Functions control flow API route.
 * Returns control flow graph for a function to render as a flowchart.
 * @module lib/api/v1/functions/controlflow
 */

import { get_project_by_name } from '../../../model/project.mjs';
import { get_entity } from '../../../model/entity.mjs';
import { get_sourcecode } from '../../../model/sourcecode.mjs';
import { build_control_flow_from_source } from '../../../controlflow.mjs';

/**
 * Handler for GET /api/v1/functions/{name}/controlflow - get control flow graph for a function.
 * @param {Object} request - Hapi request object
 * @param {Object} request.params - Route parameters
 * @param {string} request.params.name - Function name
 * @param {Object} request.query - Query parameters
 * @param {string} request.query.project - Project name (required)
 * @param {string} [request.query.filename] - Optional filename to disambiguate
 * @param {Object} h - Hapi response toolkit
 * @returns {Promise<Object>} Control flow graph { nodes: [], edges: [] }
 */
const controlflow_handler = async (request, h) => {
  const { name } = request.params;
  const { project, filename } = request.query;

  if (!project) {
    return h
      .response({ error: 'Project name is required' })
      .code(400);
  }

  const projects = await get_project_by_name({ name: project });
  if (projects.length === 0) {
    return h
      .response({ error: `Project '${project}' not found` })
      .code(404);
  }

  const project_id = projects[0].id;

  // Get the function entity
  const entities = await get_entity({
    project_id,
    symbol: name,
    filename,
    type: 'function'
  });

  if (entities.length === 0) {
    return h
      .response({ error: `Function '${name}' not found` })
      .code(404);
  }

  // Use first match or filename-matched entity
  let entity = entities[0];
  if (filename) {
    const match = entities.find(e => e.filename === filename || e.filename.endsWith(filename));
    if (match) entity = match;
  }

  // Get the source code for the file
  const source_records = await get_sourcecode({
    project_id,
    filename: entity.filename
  });

  if (source_records.length === 0) {
    return h
      .response({ error: 'Source code not found' })
      .code(404);
  }

  const source = source_records[0].source;

  // Build control flow graph
  const cfg = build_control_flow_from_source(
    source,
    entity.language,
    entity.start_line,
    entity.end_line
  );

  return {
    function: {
      symbol: entity.symbol,
      filename: entity.filename,
      start_line: entity.start_line,
      end_line: entity.end_line,
      language: entity.language
    },
    ...cfg
  };
};

const controlflow = {
  method: 'GET',
  path: '/api/v1/functions/{name}/controlflow',
  handler: controlflow_handler
};

export { controlflow };
