'use strict';

/**
 * @fileoverview Tests for stats and delete API routes.
 * Tests the /api/v1/stats endpoint and delete project functionality.
 */

import { test } from 'st';

// Import route handlers
import { stats } from '../../lib/api/v1/stats.mjs';
import { delete_project_route } from '../../lib/api/v1/project/delete.mjs';
import { refresh } from '../../lib/api/v1/project/refresh.mjs';
import { import_project } from '../../lib/api/v1/project/import.mjs';

// Mock response toolkit for Hapi.js
const create_mock_h = () => {
  let response_data = null;
  let status_code = 200;

  return {
    response: (data) => {
      response_data = data;
      return {
        code: (code) => {
          status_code = code;
          return { response_data, status_code };
        }
      };
    },
    get_response: () => response_data,
    get_status_code: () => status_code
  };
};

// ============ Stats Route Tests ============

await test('stats route has correct path and method', async (t) => {
  t.assert.eq(stats.path, '/api/v1/stats', 'Should have correct path');
  t.assert.eq(stats.method, 'GET', 'Should be GET method');
});

await test('stats route returns statistics object', async (t) => {
  const h = create_mock_h();
  const request = {};

  const result = await stats.handler(request, h);

  // Result should be an object with the expected properties
  t.assert.eq(typeof result, 'object', 'Should return an object');
  t.assert.eq(typeof result.projects, 'number', 'Should have projects count');
  t.assert.eq(typeof result.entities, 'number', 'Should have entities count');
  t.assert.eq(typeof result.files, 'number', 'Should have files count');
  t.assert.eq(
    Array.isArray(result.languages),
    true,
    'Should have languages array'
  );
});

await test('stats route returns non-negative counts', async (t) => {
  const h = create_mock_h();
  const request = {};

  const result = await stats.handler(request, h);

  t.assert.eq(
    result.projects >= 0,
    true,
    'Projects count should be non-negative'
  );
  t.assert.eq(
    result.entities >= 0,
    true,
    'Entities count should be non-negative'
  );
  t.assert.eq(result.files >= 0, true, 'Files count should be non-negative');
});

// ============ Delete Route Tests ============

await test('delete route has correct path and method', async (t) => {
  t.assert.eq(
    delete_project_route.path,
    '/api/v1/projects/{name}',
    'Should have correct path'
  );
  t.assert.eq(delete_project_route.method, 'DELETE', 'Should be DELETE method');
});

await test('delete route returns 404 for non-existent project', async (t) => {
  const h = create_mock_h();
  const request = { params: { name: 'non_existent_project_xyz123' } };

  const result = await delete_project_route.handler(request, h);

  t.assert.eq(result.status_code, 404, 'Should return 404 status');
  t.assert.eq(
    result.response_data.error.includes('not found'),
    true,
    'Should mention not found'
  );
});

// ============ Refresh Route Tests ============

await test('refresh route has correct path and method', async (t) => {
  t.assert.eq(
    refresh.path,
    '/api/v1/projects/{name}/refresh',
    'Should have correct path'
  );
  t.assert.eq(refresh.method, 'POST', 'Should be POST method');
});

await test('refresh route returns 404 for non-existent project', async (t) => {
  const h = create_mock_h();
  const request = { params: { name: 'non_existent_project_xyz123' } };

  const result = await refresh.handler(request, h);

  t.assert.eq(result.status_code, 404, 'Should return 404 status');
  t.assert.eq(
    result.response_data.error.includes('not found'),
    true,
    'Should mention not found'
  );
});

// ============ Import Route Tests ============

await test('import route has correct path and method', async (t) => {
  t.assert.eq(
    import_project.path,
    '/api/v1/projects/import',
    'Should have correct path'
  );
  t.assert.eq(import_project.method, 'POST', 'Should be POST method');
});

await test('import route requires path in payload', async (t) => {
  const h = create_mock_h();
  const request = { payload: {} };

  const result = await import_project.handler(request, h);

  t.assert.eq(result.status_code, 400, 'Should return 400 status');
  t.assert.eq(
    result.response_data.error.includes('path'),
    true,
    'Should mention path is required'
  );
});

await test('import route accepts valid path and queues job', async (t) => {
  const h = create_mock_h();
  // Use current directory as a valid path
  const request = { payload: { path: process.cwd(), name: 'test_import' } };

  const result = await import_project.handler(request, h);

  t.assert.eq(result.status_code, 202, 'Should return 202 Accepted status');
  t.assert.eq(result.response_data.success, true, 'Should indicate success');
  t.assert.eq(
    typeof result.response_data.job_id,
    'string',
    'Should return job_id'
  );
});
