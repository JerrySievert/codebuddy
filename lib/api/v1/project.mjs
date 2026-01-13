'use strict';

/**
 * @fileoverview Project API routes.
 * Handles listing, importing, and managing code projects.
 * @module lib/api/v1/project
 */

import { get_all_projects_with_metadata } from '../../model/project.mjs';
import { info } from './project/info.mjs';
import { import_project } from './project/import.mjs';
import { refresh } from './project/refresh.mjs';

/**
 * Handler for GET /api/v1/projects - list all projects with metadata.
 * @param {Object} request - Hapi request object
 * @param {Object} h - Hapi response toolkit
 * @returns {Promise<Object[]>} Array of project objects with statistics
 */
const list_handler = async (request, h) => {
  const projects = await get_all_projects_with_metadata();
  return projects;
};

/** @type {Object} Hapi route definition for listing projects */
const list = {
  method: 'GET',
  path: '/api/v1/projects',
  handler: list_handler
};

/** @type {Object[]} All project-related API routes */
const projects = [list, info, import_project, refresh];

export { projects, list, info, import_project, refresh };
