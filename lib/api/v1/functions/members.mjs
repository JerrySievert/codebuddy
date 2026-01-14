'use strict';

/**
 * @fileoverview Class/struct members API route.
 * Gets member functions of a class or struct.
 * @module lib/api/v1/functions/members
 */

import { get_project_by_name } from '../../../model/project.mjs';
import { get_entity_by_id, get_class_members } from '../../../model/entity.mjs';

/**
 * Handler for GET /api/v1/functions/{id}/members - get member functions of a class/struct.
 * @param {Object} request - Hapi request object
 * @param {Object} request.params - Path parameters
 * @param {string} request.params.id - Entity ID of the class/struct
 * @param {Object} h - Hapi response toolkit
 * @returns {Promise<Object[]>} Array of member function records, or error
 */
const members_handler = async (request, h) => {
  const { id } = request.params;

  // Get the class/struct entity
  const entity = await get_entity_by_id(parseInt(id, 10));

  if (!entity) {
    return h.response({ error: 'Entity not found' }).code(404);
  }

  // Only classes and structs can have members
  if (entity.type !== 'class' && entity.type !== 'struct') {
    return h.response({ error: 'Entity is not a class or struct' }).code(400);
  }

  // Get member functions
  const members = await get_class_members({
    project_id: entity.project_id,
    filename: entity.filename,
    start_line: entity.start_line,
    end_line: entity.end_line
  });

  return {
    entity,
    members
  };
};

const members = {
  method: 'GET',
  path: '/api/v1/functions/{id}/members',
  handler: members_handler
};

export { members };
