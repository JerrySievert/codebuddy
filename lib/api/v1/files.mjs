'use strict';

/**
 * @fileoverview Files API route aggregator.
 * Combines all file-related API routes.
 * @module lib/api/v1/files
 */

import { analytics } from './files/analytics.mjs';

/** @type {Object[]} All file-related routes */
const files = [analytics];

export { files };
