'use strict';

/**
 * @fileoverview API v1 route aggregator.
 * Combines all API route definitions for registration with Hapi.js server.
 * @module lib/api/v1/index
 */

import { projects } from './project.mjs';
import { functions } from './functions.mjs';
import { entities } from './entities.mjs';
import { sourcecode } from './sourcecode.mjs';
import { jobs } from './jobs.mjs';
import { analysis } from './analysis.mjs';
import { files } from './files.mjs';

/** @type {Object[]} All API v1 routes */
const routes = [
  ...projects,
  ...functions,
  ...entities,
  ...sourcecode,
  ...jobs,
  ...analysis,
  ...files
];

export {
  routes,
  projects,
  functions,
  entities,
  sourcecode,
  jobs,
  analysis,
  files
};
