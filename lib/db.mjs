'use strict';

/**
 * @fileoverview Database connection module.
 * Provides a configured PostgreSQL client using the postgres.js library.
 * @module lib/db
 */

import postgres from 'postgres';

import config from '../config.json' with { type: 'json' };

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
  host: config.database.hostname
});

export { query };
