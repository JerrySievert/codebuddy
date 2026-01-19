'use strict';

/**
 * @fileoverview Tests for symbol_reference model functions.
 * Uses test fixtures created in the database for each test.
 */

import { test } from 'st';
import { query } from '../../../lib/db.mjs';
import { insert_or_update_project } from '../../../lib/model/project.mjs';
import { insert_or_update_entity } from '../../../lib/model/entity.mjs';
import {
  batch_insert_symbol_references,
  get_symbol_references,
  get_definition_for_symbol,
  get_all_definitions,
  get_reference_summary,
  clear_symbol_references_for_project,
  disable_symbol_reference_indexes,
  rebuild_symbol_reference_indexes
} from '../../../lib/model/symbol_reference.mjs';

// Counter to ensure unique project names
let test_counter = 0;

/**
 * Clean up any leftover test projects from previous runs.
 */
const cleanup_all_test_projects = async () => {
  const projects =
    await query`SELECT id FROM project WHERE name LIKE '_test_symref_%'`;
  for (const p of projects) {
    await query`DELETE FROM symbol_reference WHERE project_id = ${p.id}`;
    await query`DELETE FROM entity WHERE project_id = ${p.id}`;
    await query`DELETE FROM project WHERE id = ${p.id}`;
  }
  if (projects.length > 0) {
    await query`REFRESH MATERIALIZED VIEW project_stats`;
  }
};

// Clean up before tests
await cleanup_all_test_projects();

/**
 * Create test project with entities.
 */
const setup_test_fixtures = async () => {
  const test_id = ++test_counter;
  const project_name = `_test_symref_${test_id}_${Date.now()}`;

  const project_result = await insert_or_update_project({
    name: project_name,
    path: `/tmp/test_symref_${test_id}`
  });
  const project_id = project_result[0].id;

  // Create test entity
  const entity = await insert_or_update_entity({
    project_id,
    symbol: 'my_function',
    type: 'function',
    filename: 'test.js',
    language: 'javascript',
    start_line: 10,
    end_line: 20,
    parameters: 'a, b',
    return_type: 'number',
    source: 'function my_function(a, b) { return a + b; }',
    comment: null
  });

  return { project_id, entity: entity[0] };
};

/**
 * Clean up test fixtures.
 */
const cleanup_test_fixtures = async (project_id) => {
  if (project_id === undefined) return;
  await query`DELETE FROM symbol_reference WHERE project_id = ${project_id}`;
  await query`DELETE FROM entity WHERE project_id = ${project_id}`;
  await query`DELETE FROM project WHERE id = ${project_id}`;
};

// ============ batch_insert_symbol_references tests ============

await test('batch_insert_symbol_references inserts multiple references', async (t) => {
  let project_id;
  try {
    const fixtures = await setup_test_fixtures();
    project_id = fixtures.project_id;

    const references = [
      {
        project_id,
        symbol: 'my_function',
        symbol_type: 'function',
        filename: 'caller.js',
        line: 5,
        is_definition: false,
        is_write: false
      },
      {
        project_id,
        symbol: 'my_function',
        symbol_type: 'function',
        filename: 'caller.js',
        line: 15,
        is_definition: false,
        is_write: false
      },
      {
        project_id,
        symbol: 'my_var',
        symbol_type: 'variable',
        filename: 'vars.js',
        line: 1,
        is_definition: true,
        is_write: true
      }
    ];

    await batch_insert_symbol_references(references);

    const count =
      await query`SELECT COUNT(*) as count FROM symbol_reference WHERE project_id = ${project_id}`;
    t.assert.eq(parseInt(count[0].count), 3, 'Should insert 3 references');
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

await test('batch_insert_symbol_references filters invalid references', async (t) => {
  let project_id;
  try {
    const fixtures = await setup_test_fixtures();
    project_id = fixtures.project_id;

    const references = [
      {
        project_id,
        symbol: 'valid_ref',
        symbol_type: 'function',
        filename: 'test.js',
        line: 5
      },
      {
        project_id: null,
        symbol: 'invalid_ref',
        symbol_type: 'function',
        filename: 'test.js',
        line: 10
      }, // Invalid
      {
        project_id,
        symbol: null,
        symbol_type: 'function',
        filename: 'test.js',
        line: 15
      }, // Invalid
      {
        project_id,
        symbol: 'no_line',
        symbol_type: 'function',
        filename: 'test.js',
        line: null
      } // Invalid
    ];

    await batch_insert_symbol_references(references);

    const count =
      await query`SELECT COUNT(*) as count FROM symbol_reference WHERE project_id = ${project_id}`;
    t.assert.eq(
      parseInt(count[0].count),
      1,
      'Should only insert 1 valid reference'
    );
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

await test('batch_insert_symbol_references handles empty array', async (t) => {
  const result = await batch_insert_symbol_references([]);
  t.assert.eq(result.length, 0, 'Should return empty array for empty input');
});

await test('batch_insert_symbol_references stores optional fields', async (t) => {
  let project_id;
  try {
    const fixtures = await setup_test_fixtures();
    project_id = fixtures.project_id;
    const entity_id = fixtures.entity.id;

    const references = [
      {
        project_id,
        symbol: 'detailed_ref',
        symbol_type: 'function',
        definition_entity_id: entity_id,
        filename: 'test.js',
        line: 25,
        column_start: 5,
        column_end: 20,
        context: 'const result = detailed_ref();',
        is_definition: false,
        is_write: false
      }
    ];

    await batch_insert_symbol_references(references);

    const result =
      await query`SELECT * FROM symbol_reference WHERE project_id = ${project_id} AND symbol = 'detailed_ref'`;

    t.assert.eq(result.length, 1, 'Should find the reference');
    t.assert.eq(result[0].column_start, 5, 'Should have column_start');
    t.assert.eq(result[0].column_end, 20, 'Should have column_end');
    t.assert.ok(
      result[0].context.includes('detailed_ref'),
      'Should have context'
    );
    t.assert.eq(
      result[0].definition_entity_id,
      entity_id,
      'Should have definition_entity_id'
    );
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

// ============ get_symbol_references tests ============

await test('get_symbol_references returns references for symbol', async (t) => {
  let project_id;
  try {
    const fixtures = await setup_test_fixtures();
    project_id = fixtures.project_id;

    await batch_insert_symbol_references([
      {
        project_id,
        symbol: 'target_symbol',
        symbol_type: 'function',
        filename: 'a.js',
        line: 10
      },
      {
        project_id,
        symbol: 'target_symbol',
        symbol_type: 'function',
        filename: 'b.js',
        line: 20
      },
      {
        project_id,
        symbol: 'other_symbol',
        symbol_type: 'function',
        filename: 'c.js',
        line: 30
      }
    ]);

    const result = await get_symbol_references({
      project_id,
      symbol: 'target_symbol'
    });

    t.assert.eq(result.length, 2, 'Should find 2 references');
    t.assert.ok(
      result.every((r) => r.symbol === 'target_symbol'),
      'All should be target_symbol'
    );
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

await test('get_symbol_references filters by filename', async (t) => {
  let project_id;
  try {
    const fixtures = await setup_test_fixtures();
    project_id = fixtures.project_id;

    await batch_insert_symbol_references([
      {
        project_id,
        symbol: 'multi_file',
        symbol_type: 'function',
        filename: 'file_a.js',
        line: 10
      },
      {
        project_id,
        symbol: 'multi_file',
        symbol_type: 'function',
        filename: 'file_b.js',
        line: 20
      }
    ]);

    const result = await get_symbol_references({
      project_id,
      symbol: 'multi_file',
      filename: 'file_a.js'
    });

    t.assert.eq(result.length, 1, 'Should find 1 reference in file_a.js');
    t.assert.eq(result[0].filename, 'file_a.js', 'Should be from file_a.js');
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

await test('get_symbol_references filters by is_definition', async (t) => {
  let project_id;
  try {
    const fixtures = await setup_test_fixtures();
    project_id = fixtures.project_id;

    await batch_insert_symbol_references([
      {
        project_id,
        symbol: 'def_test',
        symbol_type: 'function',
        filename: 'test.js',
        line: 10,
        is_definition: true
      },
      {
        project_id,
        symbol: 'def_test',
        symbol_type: 'function',
        filename: 'test.js',
        line: 20,
        is_definition: false
      },
      {
        project_id,
        symbol: 'def_test',
        symbol_type: 'function',
        filename: 'test.js',
        line: 30,
        is_definition: false
      }
    ]);

    const result = await get_symbol_references({
      project_id,
      symbol: 'def_test',
      is_definition: true
    });

    t.assert.eq(result.length, 1, 'Should find 1 definition');
    t.assert.eq(result[0].is_definition, true, 'Should be a definition');
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

// ============ get_definition_for_symbol tests ============

await test('get_definition_for_symbol finds definition in symbol_reference', async (t) => {
  let project_id;
  try {
    const fixtures = await setup_test_fixtures();
    project_id = fixtures.project_id;

    await batch_insert_symbol_references([
      {
        project_id,
        symbol: 'find_def',
        symbol_type: 'function',
        filename: 'def.js',
        line: 5,
        is_definition: true
      },
      {
        project_id,
        symbol: 'find_def',
        symbol_type: 'function',
        filename: 'use.js',
        line: 15,
        is_definition: false
      }
    ]);

    const result = await get_definition_for_symbol({
      project_id,
      symbol: 'find_def'
    });

    t.assert.ok(result, 'Should find definition');
    t.assert.eq(result.filename, 'def.js', 'Should be from definition file');
    t.assert.eq(result.line, 5, 'Should be at definition line');
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

await test('get_definition_for_symbol falls back to entity table', async (t) => {
  let project_id;
  try {
    const fixtures = await setup_test_fixtures();
    project_id = fixtures.project_id;

    // my_function entity was created in setup - no symbol_reference for it
    const result = await get_definition_for_symbol({
      project_id,
      symbol: 'my_function'
    });

    t.assert.ok(result, 'Should find entity');
    t.assert.eq(result.entity_symbol, 'my_function', 'Should find my_function');
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

await test('get_definition_for_symbol returns null for non-existent symbol', async (t) => {
  let project_id;
  try {
    const fixtures = await setup_test_fixtures();
    project_id = fixtures.project_id;

    const result = await get_definition_for_symbol({
      project_id,
      symbol: 'non_existent_symbol_xyz'
    });

    t.assert.eq(result, null, 'Should return null for non-existent');
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

// ============ get_all_definitions tests ============

await test('get_all_definitions returns all definitions', async (t) => {
  let project_id;
  try {
    const fixtures = await setup_test_fixtures();
    project_id = fixtures.project_id;

    await batch_insert_symbol_references([
      {
        project_id,
        symbol: 'def_a',
        symbol_type: 'function',
        filename: 'a.js',
        line: 1,
        is_definition: true
      },
      {
        project_id,
        symbol: 'def_b',
        symbol_type: 'variable',
        filename: 'b.js',
        line: 1,
        is_definition: true
      },
      {
        project_id,
        symbol: 'ref_c',
        symbol_type: 'function',
        filename: 'c.js',
        line: 1,
        is_definition: false
      }
    ]);

    const result = await get_all_definitions({ project_id });

    t.assert.eq(result.length, 2, 'Should find 2 definitions');
    const symbols = result.map((r) => r.symbol);
    t.assert.ok(symbols.includes('def_a'), 'Should include def_a');
    t.assert.ok(symbols.includes('def_b'), 'Should include def_b');
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

await test('get_all_definitions filters by symbol_type', async (t) => {
  let project_id;
  try {
    const fixtures = await setup_test_fixtures();
    project_id = fixtures.project_id;

    await batch_insert_symbol_references([
      {
        project_id,
        symbol: 'func_def',
        symbol_type: 'function',
        filename: 'a.js',
        line: 1,
        is_definition: true
      },
      {
        project_id,
        symbol: 'var_def',
        symbol_type: 'variable',
        filename: 'b.js',
        line: 1,
        is_definition: true
      }
    ]);

    const result = await get_all_definitions({
      project_id,
      symbol_type: 'function'
    });

    t.assert.eq(result.length, 1, 'Should find 1 function definition');
    t.assert.eq(result[0].symbol, 'func_def', 'Should be func_def');
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

// ============ get_reference_summary tests ============

await test('get_reference_summary returns counts grouped by symbol', async (t) => {
  let project_id;
  try {
    const fixtures = await setup_test_fixtures();
    project_id = fixtures.project_id;

    await batch_insert_symbol_references([
      {
        project_id,
        symbol: 'popular',
        symbol_type: 'function',
        filename: 'a.js',
        line: 1,
        is_definition: true
      },
      {
        project_id,
        symbol: 'popular',
        symbol_type: 'function',
        filename: 'b.js',
        line: 10,
        is_definition: false
      },
      {
        project_id,
        symbol: 'popular',
        symbol_type: 'function',
        filename: 'c.js',
        line: 20,
        is_definition: false,
        is_write: true
      },
      {
        project_id,
        symbol: 'unpopular',
        symbol_type: 'function',
        filename: 'd.js',
        line: 1,
        is_definition: true
      }
    ]);

    const result = await get_reference_summary(project_id);

    t.assert.ok(result.length >= 2, 'Should have at least 2 symbols');

    const popular = result.find((r) => r.symbol === 'popular');
    t.assert.ok(popular, 'Should find popular symbol');
    t.assert.eq(
      parseInt(popular.reference_count),
      3,
      'popular should have 3 references'
    );
    t.assert.eq(
      parseInt(popular.definition_count),
      1,
      'popular should have 1 definition'
    );
    t.assert.eq(
      parseInt(popular.write_count),
      1,
      'popular should have 1 write'
    );
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

// ============ clear_symbol_references_for_project tests ============

await test('clear_symbol_references_for_project removes all references', async (t) => {
  let project_id;
  try {
    const fixtures = await setup_test_fixtures();
    project_id = fixtures.project_id;

    await batch_insert_symbol_references([
      {
        project_id,
        symbol: 'to_clear_1',
        symbol_type: 'function',
        filename: 'a.js',
        line: 1
      },
      {
        project_id,
        symbol: 'to_clear_2',
        symbol_type: 'function',
        filename: 'b.js',
        line: 1
      }
    ]);

    await clear_symbol_references_for_project({ id: project_id });

    const count =
      await query`SELECT COUNT(*) as count FROM symbol_reference WHERE project_id = ${project_id}`;
    t.assert.eq(
      parseInt(count[0].count),
      0,
      'Should have no references after clear'
    );
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

// ============ index management tests ============

await test('disable_symbol_reference_indexes and rebuild work correctly', async (t) => {
  // Just verify they don't throw - actual index checking is complex
  try {
    await disable_symbol_reference_indexes();
    t.assert.ok(true, 'disable_symbol_reference_indexes should not throw');

    await rebuild_symbol_reference_indexes();
    t.assert.ok(true, 'rebuild_symbol_reference_indexes should not throw');
  } catch (err) {
    t.assert.fail(`Index operations failed: ${err.message}`);
  }
});

// Final cleanup
await cleanup_all_test_projects();
