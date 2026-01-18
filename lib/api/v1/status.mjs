'use strict';

/**
 * @fileoverview Server status API route.
 * Provides server status information including read-only mode.
 * @module lib/api/v1/status
 */

import { get_config } from '../../config.mjs';

/**
 * Handler for GET /api/v1/status - get server status.
 * @param {Object} request - Hapi request object
 * @param {Object} h - Hapi response toolkit
 * @returns {Object} Server status information
 */
const status_handler = (request, h) => {
  const config = get_config();
  return {
    read_only: config.read_only
  };
};

const get_status = {
  method: 'GET',
  path: '/api/v1/status',
  handler: status_handler
};

/** @type {Object[]} All status routes */
const status = [get_status];

export { status };
