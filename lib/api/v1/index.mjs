'use strict';

/**
 * @fileoverview API v1 route aggregator.
 * Combines all API route definitions for registration with Hapi.js server.
 * @module lib/api/v1/index
 */

import { projects } from './project.mjs';
import { functions } from './functions.mjs';
import { jobs } from './jobs.mjs';

/** @type {Object[]} All API v1 routes */
const routes = [...projects, ...functions, ...jobs];

export { routes, projects, functions, jobs };
