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
import { reverse_callgraph } from './functions/reverse_callgraph.mjs';
import { heatmap } from './functions/heatmap.mjs';
import { complexity } from './functions/complexity.mjs';
import { caller_tree } from './functions/caller_tree.mjs';
import { callee_tree } from './functions/callee_tree.mjs';
import { controlflow } from './functions/controlflow.mjs';
import { members } from './functions/members.mjs';

/** @type {Object[]} All function-related API routes */
const functions = [
  list,
  search,
  retrieve,
  callers,
  callees,
  callgraph,
  reverse_callgraph,
  heatmap,
  complexity,
  caller_tree,
  callee_tree,
  controlflow,
  members
];

export {
  functions,
  list,
  search,
  retrieve,
  callers,
  callees,
  callgraph,
  reverse_callgraph,
  heatmap,
  complexity,
  caller_tree,
  callee_tree,
  controlflow,
  members
};
