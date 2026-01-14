'use strict';

/**
 * @fileoverview Sourcecode API route aggregator.
 * Combines all sourcecode-related route definitions.
 * @module lib/api/v1/sourcecode
 */

import { read } from './sourcecode/read.mjs';

/** @type {Object[]} All sourcecode routes */
const sourcecode = [read];

export { sourcecode };
