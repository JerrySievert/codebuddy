'use strict';

/**
 * @fileoverview Functions API routes aggregator.
 * Combines all function-related API endpoints.
 * @module lib/api/v1/functions
 */

import { list } from './functions/list.mjs';
import { search } from './functions/search.mjs';
import { retrieve } from './functions/retrieve.mjs';
import { callers } from './functions/callers.mjs';
import { callees } from './functions/callees.mjs';
import { callgraph } from './functions/callgraph.mjs';
import { complexity } from './functions/complexity.mjs';

/** @type {Object[]} All function-related API routes */
const functions = [
  list,
  search,
  retrieve,
  callers,
  callees,
  callgraph,
  complexity
];

export {
  functions,
  list,
  search,
  retrieve,
  callers,
  callees,
  callgraph,
  complexity
};
