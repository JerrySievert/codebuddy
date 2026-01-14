'use strict';

/**
 * @fileoverview Tests for API routes.
 * Tests the Web API route handlers for entities and sourcecode.
 */

import { test } from 'st';

// Import route handlers
import { list as entityList } from '../../lib/api/v1/entities/list.mjs';
import { search as entitySearch } from '../../lib/api/v1/entities/search.mjs';
import { read as sourcecodeRead } from '../../lib/api/v1/sourcecode/read.mjs';

// Mock response toolkit for Hapi.js
const createMockH = () => {
  let responseData = null;
  let statusCode = 200;

  return {
    response: (data) => {
      responseData = data;
      return {
        code: (code) => {
          statusCode = code;
          return { responseData, statusCode };
        }
      };
    },
    getResponse: () => responseData,
    getStatusCode: () => statusCode
  };
};

// ============ Entity List Route Tests ============

await test('entity list route requires project parameter', async (t) => {
  const h = createMockH();
  const request = { query: {} };

  const result = await entityList.handler(request, h);

  t.assert.eq(result.statusCode, 400, 'Should return 400 status');
  t.assert.eq(result.responseData.error, 'project query parameter is required', 'Should return error message');
});

await test('entity list route returns 404 for non-existent project', async (t) => {
  const h = createMockH();
  const request = { query: { project: 'non_existent_project_xyz123' } };

  const result = await entityList.handler(request, h);

  t.assert.eq(result.statusCode, 404, 'Should return 404 status');
  t.assert.eq(result.responseData.error.includes('not found'), true, 'Should mention not found');
});

await test('entity list route has correct path', async (t) => {
  t.assert.eq(entityList.path, '/api/v1/entities', 'Should have correct path');
  t.assert.eq(entityList.method, 'GET', 'Should be GET method');
});

// ============ Entity Search Route Tests ============

await test('entity search route requires name parameter', async (t) => {
  const h = createMockH();
  const request = { query: {} };

  const result = await entitySearch.handler(request, h);

  t.assert.eq(result.statusCode, 400, 'Should return 400 status');
  t.assert.eq(result.responseData.error, 'name query parameter is required', 'Should return error message');
});

await test('entity search route has correct path', async (t) => {
  t.assert.eq(entitySearch.path, '/api/v1/entities/search', 'Should have correct path');
  t.assert.eq(entitySearch.method, 'GET', 'Should be GET method');
});

// ============ Sourcecode Read Route Tests ============

await test('sourcecode read route requires project parameter', async (t) => {
  const h = createMockH();
  const request = { query: {} };

  const result = await sourcecodeRead.handler(request, h);

  t.assert.eq(result.statusCode, 400, 'Should return 400 status');
  t.assert.eq(result.responseData.error, 'project query parameter is required', 'Should return error message');
});

await test('sourcecode read route requires filename parameter', async (t) => {
  const h = createMockH();
  const request = { query: { project: 'test' } };

  const result = await sourcecodeRead.handler(request, h);

  t.assert.eq(result.statusCode, 400, 'Should return 400 status');
  t.assert.eq(result.responseData.error, 'filename query parameter is required', 'Should return error message');
});

await test('sourcecode read route returns 404 for non-existent project', async (t) => {
  const h = createMockH();
  const request = { query: { project: 'non_existent_project_xyz123', filename: 'test.js' } };

  const result = await sourcecodeRead.handler(request, h);

  t.assert.eq(result.statusCode, 404, 'Should return 404 status');
  t.assert.eq(result.responseData.error.includes('not found'), true, 'Should mention not found');
});

await test('sourcecode read route has correct path', async (t) => {
  t.assert.eq(sourcecodeRead.path, '/api/v1/sourcecode', 'Should have correct path');
  t.assert.eq(sourcecodeRead.method, 'GET', 'Should be GET method');
});
