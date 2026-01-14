'use strict';

/**
 * @fileoverview Entities API route aggregator.
 * Combines all entity-related route definitions.
 * @module lib/api/v1/entities
 */

import { list } from './entities/list.mjs';
import { search } from './entities/search.mjs';

/** @type {Object[]} All entity routes */
const entities = [list, search];

export { entities };
