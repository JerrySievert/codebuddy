'use strict';

/**
 * @fileoverview Server configuration module.
 * Stores runtime configuration that can be accessed by other modules.
 * @module lib/config
 */

// Parse command line arguments for flags
const args = process.argv.slice(2);
const read_only = args.includes('--read-only');
const mcp_disabled = args.includes('--disable-mcp');

// Parse --tracing-endpoint argument (expects --tracing-endpoint=URL or --tracing-endpoint URL)
let tracing_endpoint = null;
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg.startsWith('--tracing-endpoint=')) {
    tracing_endpoint = arg.split('=')[1];
    break;
  } else if (arg === '--tracing-endpoint' && args[i + 1]) {
    tracing_endpoint = args[i + 1];
    break;
  }
}

/**
 * Get the server configuration.
 * @returns {Object} Server configuration object
 */
const get_config = () => {
  return {
    read_only,
    mcp_disabled,
    tracing_endpoint
  };
};

/**
 * Check if the server is in read-only mode.
 * @returns {boolean} True if read-only mode is enabled
 */
const is_read_only = () => {
  return read_only;
};

/**
 * Check if MCP is disabled.
 * @returns {boolean} True if MCP is disabled
 */
const is_mcp_disabled = () => {
  return mcp_disabled;
};

/**
 * Get the tracing endpoint URL.
 * @returns {string|null} The tracing endpoint URL or null if not configured
 */
const get_tracing_endpoint = () => {
  return tracing_endpoint;
};

export {
  get_config,
  is_read_only,
  is_mcp_disabled,
  get_tracing_endpoint,
  read_only,
  mcp_disabled,
  tracing_endpoint
};
