'use strict';

/**
 * @fileoverview Database connection module.
 * Provides a configured PostgreSQL client using the postgres.js library.
 * @module lib/db
 */

import postgres from 'postgres';
import { isMainThread } from 'worker_threads';

import config from '../config.json' with { type: 'json' };

// Use fewer connections for worker threads to leave room for API server
const pool_size = isMainThread ? 8 : 3;

/**
 * PostgreSQL query client configured from config.json.
 * Use tagged template literals for parameterized queries.
 * @example
 * const results = await query`SELECT * FROM project WHERE name = ${name}`;
 * @type {import('postgres').Sql}
 */
const query = postgres({
  user: config.database.username,
  password: config.database.password,
  database: config.database.database,
  host: config.database.hostname,
  max: pool_size, // Maximum connections in pool
  idle_timeout: 20, // Close idle connections after 20 seconds
  connect_timeout: 10, // Timeout for new connections
  max_lifetime: 60 * 30, // Max connection lifetime: 30 minutes
  debug: false, // Set to true for query logging
  onnotice: () => {} // Suppress notice messages
});

export { query };
