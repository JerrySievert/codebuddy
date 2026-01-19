'use strict';

/**
 * @fileoverview Tests for MCP configuration and read-only mode handling.
 * Tests the MCP project tools respect read-only mode and MCP disabled flag.
 */

import { test } from 'st';

// Import MCP project tool handlers
import {
  project_import_handler,
  project_refresh_handler,
  project_delete_handler
} from '../../lib/mcp/tools/project.mjs';

// Import MCP HTTP handler
import { mcp_route_handler } from '../../lib/mcp-http.mjs';

// Import config functions - we'll test with mocked values
import * as config from '../../lib/config.mjs';

// ============ MCP Project Tools - Read-Only Mode Tests ============

// Note: These tests verify the handlers check is_read_only().
// Since we can't easily mock the config at runtime, we test the behavior
// when read-only is NOT set (the default in test environment).

await test('project_import_handler is a function', async (t) => {
  t.assert.eq(
    typeof project_import_handler,
    'function',
    'Should be a function'
  );
});

await test('project_refresh_handler is a function', async (t) => {
  t.assert.eq(
    typeof project_refresh_handler,
    'function',
    'Should be a function'
  );
});

await test('project_delete_handler is a function', async (t) => {
  t.assert.eq(
    typeof project_delete_handler,
    'function',
    'Should be a function'
  );
});

await test('project_delete_handler throws for non-existent project', async (t) => {
  try {
    await project_delete_handler({ name: 'non_existent_project_xyz123' });
    t.assert.eq(true, false, 'Should have thrown an error');
  } catch (error) {
    t.assert.eq(
      error.message.includes('not found'),
      true,
      'Should mention project not found'
    );
  }
});

// ============ MCP HTTP Handler Tests ============

await test('mcp_route_handler is a function', async (t) => {
  t.assert.eq(typeof mcp_route_handler, 'function', 'Should be a function');
});

// ============ Config Function Tests ============

await test('is_read_only returns boolean', async (t) => {
  const result = config.is_read_only();
  t.assert.eq(typeof result, 'boolean', 'Should return a boolean');
});

await test('is_mcp_disabled returns boolean', async (t) => {
  const result = config.is_mcp_disabled();
  t.assert.eq(typeof result, 'boolean', 'Should return a boolean');
});

await test('get_config returns object with expected properties', async (t) => {
  const result = config.get_config();
  t.assert.eq(typeof result, 'object', 'Should return an object');
  t.assert.eq(
    typeof result.read_only,
    'boolean',
    'Should have read_only property'
  );
  t.assert.eq(
    typeof result.mcp_disabled,
    'boolean',
    'Should have mcp_disabled property'
  );
});

// ============ Read-Only Error Message Tests ============
// These tests verify the error messages are correct by checking
// the handler source code behavior indirectly

await test('project handlers include read-only check', async (t) => {
  // We verify that the handlers have the read-only check by examining
  // the function's string representation
  const import_str = project_import_handler.toString();
  const refresh_str = project_refresh_handler.toString();
  const delete_str = project_delete_handler.toString();

  t.assert.eq(
    import_str.includes('is_read_only'),
    true,
    'Import handler should check is_read_only'
  );
  t.assert.eq(
    refresh_str.includes('is_read_only'),
    true,
    'Refresh handler should check is_read_only'
  );
  t.assert.eq(
    delete_str.includes('is_read_only'),
    true,
    'Delete handler should check is_read_only'
  );
});

await test('project handlers have correct read-only error messages', async (t) => {
  const import_str = project_import_handler.toString();
  const refresh_str = project_refresh_handler.toString();
  const delete_str = project_delete_handler.toString();

  t.assert.eq(
    import_str.includes('read-only mode') && import_str.includes('Import'),
    true,
    'Import handler should have correct error message'
  );
  t.assert.eq(
    refresh_str.includes('read-only mode') && refresh_str.includes('Refresh'),
    true,
    'Refresh handler should have correct error message'
  );
  t.assert.eq(
    delete_str.includes('read-only mode') && delete_str.includes('Delete'),
    true,
    'Delete handler should have correct error message'
  );
});

// ============ MCP HTTP Handler - Disabled Check ============

await test('mcp_route_handler includes MCP disabled check', async (t) => {
  const handler_str = mcp_route_handler.toString();

  t.assert.eq(
    handler_str.includes('is_mcp_disabled'),
    true,
    'MCP route handler should check is_mcp_disabled'
  );
});

await test('mcp_route_handler has correct disabled error message', async (t) => {
  const handler_str = mcp_route_handler.toString();

  t.assert.eq(
    handler_str.includes('MCP is disabled'),
    true,
    'MCP route handler should have correct disabled message'
  );
  t.assert.eq(
    handler_str.includes('--disable-mcp'),
    true,
    'MCP route handler should mention --disable-mcp flag'
  );
});
