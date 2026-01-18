'use strict';

/**
 * @fileoverview Server configuration module.
 * Stores runtime configuration that can be accessed by other modules.
 * @module lib/config
 */

// Parse command line arguments for --read-only flag
const args = process.argv.slice(2);
const read_only = args.includes('--read-only');

/**
 * Get the server configuration.
 * @returns {Object} Server configuration object
 */
const get_config = () => {
  return {
    read_only
  };
};

/**
 * Check if the server is in read-only mode.
 * @returns {boolean} True if read-only mode is enabled
 */
const is_read_only = () => {
  return read_only;
};

export { get_config, is_read_only, read_only };
