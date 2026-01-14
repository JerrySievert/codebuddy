'use strict';

/**
 * @fileoverview Tests for MCP HTTP transport.
 * Tests the MCP server via HTTP transport using the SDK client.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { test } from 'st';

const MCP_URL = process.env.MCP_URL || 'http://localhost:3000/mcp';

// Helper to create a connected client
const createClient = async () => {
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL));
  const client = new Client({
    name: 'mcp-test-client',
    version: '1.0.0'
  });
  await client.connect(transport);
  return { client, transport };
};

// Helper to safely close client
const closeClient = async (client, transport) => {
  try {
    await client.close();
  } catch (e) {
    // Ignore close errors
  }
};

// ============ Connection Tests ============

await test('MCP HTTP client can connect and initialize', async (t) => {
  const { client, transport } = await createClient();

  t.assert.eq(typeof client, 'object', 'Client should be created');

  await closeClient(client, transport);
});

await test('MCP HTTP client can list tools', async (t) => {
  const { client, transport } = await createClient();

  const tools = await client.listTools();

  t.assert.eq(Array.isArray(tools.tools), true, 'Should return tools array');
  t.assert.eq(tools.tools.length > 0, true, 'Should have at least one tool');

  // Check for expected tools
  const toolNames = tools.tools.map(tool => tool.name);
  t.assert.eq(toolNames.includes('project_list'), true, 'Should have project_list tool');
  t.assert.eq(toolNames.includes('function_search'), true, 'Should have function_search tool');

  await closeClient(client, transport);
});

// ============ Project Tools Tests ============

await test('MCP project_list returns array', async (t) => {
  const { client, transport } = await createClient();

  const result = await client.callTool({
    name: 'project_list',
    arguments: {}
  });

  t.assert.eq(result.isError, undefined, 'Should not return error');
  t.assert.eq(Array.isArray(result.content), true, 'Should return content array');

  // With a fresh database, content may be empty or contain the projects list
  if (result.content.length > 0) {
    t.assert.eq(result.content[0].type, 'text', 'Content should be text type');
    // Parse the JSON response
    const projects = JSON.parse(result.content[0].text);
    t.assert.eq(Array.isArray(projects), true, 'Parsed content should be array');
  }

  await closeClient(client, transport);
});

await test('MCP project_info returns error for non-existent project', async (t) => {
  const { client, transport } = await createClient();

  const result = await client.callTool({
    name: 'project_info',
    arguments: {
      name: 'non_existent_project_xyz123'
    }
  });

  t.assert.eq(result.isError, true, 'Should return error');
  t.assert.eq(result.content[0].text.includes('not found'), true, 'Error should mention not found');

  await closeClient(client, transport);
});

// ============ Function Tools Tests ============

await test('MCP function_list returns error for non-existent project', async (t) => {
  const { client, transport } = await createClient();

  const result = await client.callTool({
    name: 'function_list',
    arguments: {
      project: 'non_existent_project_xyz123'
    }
  });

  t.assert.eq(result.isError, true, 'Should return error');
  t.assert.eq(result.content[0].text.includes('not found'), true, 'Error should mention not found');

  await closeClient(client, transport);
});

await test('MCP function_search works without project filter', async (t) => {
  const { client, transport } = await createClient();

  const result = await client.callTool({
    name: 'function_search',
    arguments: {
      name: 'test'
    }
  });

  // With a fresh database, no functions exist, so this returns an error
  // In a populated database, this would return results
  t.assert.eq(Array.isArray(result.content), true, 'Should return content array');
  t.assert.eq(result.content.length > 0, true, 'Should have content');

  await closeClient(client, transport);
});

// ============ Entity Tools Tests ============

await test('MCP entity_list returns error for non-existent project', async (t) => {
  const { client, transport } = await createClient();

  const result = await client.callTool({
    name: 'entity_list',
    arguments: {
      project: 'non_existent_project_xyz123'
    }
  });

  t.assert.eq(result.isError, true, 'Should return error');
  t.assert.eq(result.content[0].text.includes('not found'), true, 'Error should mention not found');

  await closeClient(client, transport);
});

await test('MCP entity_search works without project filter', async (t) => {
  const { client, transport } = await createClient();

  const result = await client.callTool({
    name: 'entity_search',
    arguments: {
      name: 'test'
    }
  });

  // With a fresh database, no entities exist, so this returns an error
  // In a populated database, this would return results
  t.assert.eq(Array.isArray(result.content), true, 'Should return content array');
  t.assert.eq(result.content.length > 0, true, 'Should have content');

  await closeClient(client, transport);
});

// ============ Analysis Tools Tests ============

await test('MCP analysis_dashboard returns error for non-existent project', async (t) => {
  const { client, transport } = await createClient();

  const result = await client.callTool({
    name: 'analysis_dashboard',
    arguments: {
      project: 'non_existent_project_xyz123'
    }
  });

  t.assert.eq(result.isError, true, 'Should return error');
  t.assert.eq(result.content[0].text.includes('not found'), true, 'Error should mention not found');

  await closeClient(client, transport);
});

// ============ Multiple Requests Test ============

await test('MCP HTTP can handle multiple sequential requests', async (t) => {
  const { client, transport } = await createClient();

  // First request
  const result1 = await client.callTool({
    name: 'project_list',
    arguments: {}
  });
  t.assert.eq(result1.isError, undefined, 'First request should not error');

  // Second request
  const tools = await client.listTools();
  t.assert.eq(Array.isArray(tools.tools), true, 'Second request should return tools');

  // Third request - with fresh DB, function_search returns error (no functions exist)
  // but this tests that sequential requests work
  const result3 = await client.callTool({
    name: 'function_search',
    arguments: { name: 'main' }
  });
  t.assert.eq(Array.isArray(result3.content), true, 'Third request should return content array');

  await closeClient(client, transport);
});
