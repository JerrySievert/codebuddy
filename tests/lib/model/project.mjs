'use strict';

/**
 * @fileoverview Tests for project model functions.
 * Uses test fixtures created in the database for each test.
 */

import { test } from 'st';
import { query } from '../../../lib/db.mjs';
import {
  insert_or_update_project,
  get_project_by_name,
  delete_project
} from '../../../lib/model/project.mjs';
import { insert_or_update_entity } from '../../../lib/model/entity.mjs';
import { batch_insert_relationships } from '../../../lib/model/relationship.mjs';
import { batch_insert_symbol_references } from '../../../lib/model/symbol_reference.mjs';
import { batch_insert_inheritance } from '../../../lib/model/inheritance.mjs';
import { upsert_project_analysis } from '../../../lib/model/project_analysis.mjs';

// Counter to ensure unique project names
let test_counter = 0;

/**
 * Clean up any leftover test projects from previous runs.
 */
const cleanup_all_test_projects = async () => {
  const projects =
    await query`SELECT id FROM project WHERE name LIKE '_test_project_model_%'`;
  for (const p of projects) {
    await query`DELETE FROM project_analysis WHERE project_id = ${p.id}`;
    await query`DELETE FROM symbol_reference WHERE project_id = ${p.id}`;
    await query`DELETE FROM inheritance WHERE child_entity_id IN (SELECT id FROM entity WHERE project_id = ${p.id})`;
    await query`DELETE FROM inheritance WHERE parent_entity_id IN (SELECT id FROM entity WHERE project_id = ${p.id})`;
    await query`DELETE FROM relationship WHERE caller IN (SELECT id FROM entity WHERE project_id = ${p.id})`;
    await query`DELETE FROM relationship WHERE callee IN (SELECT id FROM entity WHERE project_id = ${p.id})`;
    await query`DELETE FROM entity WHERE project_id = ${p.id}`;
    await query`DELETE FROM sourcecode WHERE project_id = ${p.id}`;
    await query`DELETE FROM project WHERE id = ${p.id}`;
  }
  if (projects.length > 0) {
    await query`REFRESH MATERIALIZED VIEW project_stats`;
  }
};

// Clean up before tests
await cleanup_all_test_projects();

/**
 * Create test project with optional entities and relationships.
 */
const setup_test_project = async (options = {}) => {
  const test_id = ++test_counter;
  const project_name = `_test_project_model_${test_id}_${Date.now()}`;

  const project_result = await insert_or_update_project({
    name: project_name,
    path: `/tmp/test_project_model_${test_id}`
  });
  const project_id = project_result[0].id;

  const entities = {};

  if (options.with_entities) {
    // Create some test entities
    const entity1 = await insert_or_update_entity({
      project_id,
      symbol: 'test_function_1',
      type: 'function',
      filename: 'test.js',
      language: 'javascript',
      start_line: 1,
      end_line: 10,
      parameters: '',
      return_type: 'void',
      source: 'function test_function_1() {}',
      comment: null
    });
    entities.func1 = entity1[0];

    const entity2 = await insert_or_update_entity({
      project_id,
      symbol: 'test_function_2',
      type: 'function',
      filename: 'test.js',
      language: 'javascript',
      start_line: 12,
      end_line: 20,
      parameters: '',
      return_type: 'void',
      source: 'function test_function_2() {}',
      comment: null
    });
    entities.func2 = entity2[0];

    // Create a class for inheritance testing
    const class1 = await insert_or_update_entity({
      project_id,
      symbol: 'BaseClass',
      type: 'class',
      filename: 'test.js',
      language: 'javascript',
      start_line: 22,
      end_line: 30,
      parameters: '',
      return_type: '',
      source: 'class BaseClass {}',
      comment: null
    });
    entities.class1 = class1[0];

    const class2 = await insert_or_update_entity({
      project_id,
      symbol: 'ChildClass',
      type: 'class',
      filename: 'test.js',
      language: 'javascript',
      start_line: 32,
      end_line: 40,
      parameters: '',
      return_type: '',
      source: 'class ChildClass extends BaseClass {}',
      comment: null
    });
    entities.class2 = class2[0];
  }

  if (options.with_relationships && entities.func1 && entities.func2) {
    await batch_insert_relationships([
      { caller: entities.func1.id, callee: entities.func2.id, line: 5 }
    ]);
  }

  if (options.with_symbol_references && entities.func1) {
    await batch_insert_symbol_references([
      {
        project_id,
        symbol: 'test_function_1',
        symbol_type: 'function',
        definition_entity_id: entities.func1.id,
        filename: 'test.js',
        line: 1,
        column_start: 0,
        column_end: 20,
        is_definition: true,
        is_write: false,
        context: 'function test_function_1() {}'
      }
    ]);
  }

  if (options.with_inheritance && entities.class1 && entities.class2) {
    await batch_insert_inheritance([
      {
        child_entity_id: entities.class2.id,
        parent_entity_id: entities.class1.id,
        parent_symbol: 'BaseClass',
        relationship_type: 'extends'
      }
    ]);
  }

  if (options.with_analysis) {
    await upsert_project_analysis({
      project_id,
      analysis_type: 'dashboard',
      data: { health_score: 85, test: true }
    });
  }

  return { project_id, project_name, entities };
};

// ============ delete_project tests ============

await test('delete_project deletes empty project', async (t) => {
  const { project_id, project_name } = await setup_test_project();

  // Delete the project
  await delete_project(project_id);

  // Verify project is deleted
  const projects = await get_project_by_name({ name: project_name });
  t.assert.eq(projects.length, 0, 'Project should be deleted');
});

await test('delete_project deletes project with entities', async (t) => {
  const { project_id, project_name } = await setup_test_project({
    with_entities: true
  });

  // Verify entities exist before delete
  const entities_before =
    await query`SELECT COUNT(*) as count FROM entity WHERE project_id = ${project_id}`;
  t.assert.ok(
    parseInt(entities_before[0].count) > 0,
    'Should have entities before delete'
  );

  // Delete the project
  await delete_project(project_id);

  // Verify project and entities are deleted
  const projects = await get_project_by_name({ name: project_name });
  t.assert.eq(projects.length, 0, 'Project should be deleted');

  const entities_after =
    await query`SELECT COUNT(*) as count FROM entity WHERE project_id = ${project_id}`;
  t.assert.eq(
    parseInt(entities_after[0].count),
    0,
    'Entities should be deleted'
  );
});

await test('delete_project deletes relationships', async (t) => {
  const { project_id, project_name, entities } = await setup_test_project({
    with_entities: true,
    with_relationships: true
  });

  // Verify relationships exist before delete
  const rels_before = await query`
    SELECT COUNT(*) as count FROM relationship
    WHERE caller = ${entities.func1.id} OR callee = ${entities.func2.id}
  `;
  t.assert.ok(
    parseInt(rels_before[0].count) > 0,
    'Should have relationships before delete'
  );

  // Delete the project
  await delete_project(project_id);

  // Verify relationships are deleted (entities are gone, so relationships should be too)
  const rels_after = await query`
    SELECT COUNT(*) as count FROM relationship
    WHERE caller = ${entities.func1.id} OR callee = ${entities.func2.id}
  `;
  t.assert.eq(
    parseInt(rels_after[0].count),
    0,
    'Relationships should be deleted'
  );
});

await test('delete_project deletes symbol references', async (t) => {
  const { project_id, project_name } = await setup_test_project({
    with_entities: true,
    with_symbol_references: true
  });

  // Verify symbol references exist before delete
  const refs_before = await query`
    SELECT COUNT(*) as count FROM symbol_reference WHERE project_id = ${project_id}
  `;
  t.assert.ok(
    parseInt(refs_before[0].count) > 0,
    'Should have symbol references before delete'
  );

  // Delete the project
  await delete_project(project_id);

  // Verify symbol references are deleted
  const refs_after = await query`
    SELECT COUNT(*) as count FROM symbol_reference WHERE project_id = ${project_id}
  `;
  t.assert.eq(
    parseInt(refs_after[0].count),
    0,
    'Symbol references should be deleted'
  );
});

await test('delete_project deletes inheritance records', async (t) => {
  const { project_id, project_name, entities } = await setup_test_project({
    with_entities: true,
    with_inheritance: true
  });

  // Verify inheritance exists before delete
  const inheritance_before = await query`
    SELECT COUNT(*) as count FROM inheritance
    WHERE child_entity_id = ${entities.class2.id}
  `;
  t.assert.ok(
    parseInt(inheritance_before[0].count) > 0,
    'Should have inheritance before delete'
  );

  // Delete the project
  await delete_project(project_id);

  // Verify inheritance is deleted
  const inheritance_after = await query`
    SELECT COUNT(*) as count FROM inheritance
    WHERE child_entity_id = ${entities.class2.id}
  `;
  t.assert.eq(
    parseInt(inheritance_after[0].count),
    0,
    'Inheritance should be deleted'
  );
});

await test('delete_project deletes cached analysis', async (t) => {
  const { project_id, project_name } = await setup_test_project({
    with_analysis: true
  });

  // Verify analysis exists before delete
  const analysis_before = await query`
    SELECT COUNT(*) as count FROM project_analysis WHERE project_id = ${project_id}
  `;
  t.assert.ok(
    parseInt(analysis_before[0].count) > 0,
    'Should have analysis before delete'
  );

  // Delete the project
  await delete_project(project_id);

  // Verify analysis is deleted
  const analysis_after = await query`
    SELECT COUNT(*) as count FROM project_analysis WHERE project_id = ${project_id}
  `;
  t.assert.eq(
    parseInt(analysis_after[0].count),
    0,
    'Analysis should be deleted'
  );
});

await test('delete_project deletes all related data together', async (t) => {
  const { project_id, project_name } = await setup_test_project({
    with_entities: true,
    with_relationships: true,
    with_symbol_references: true,
    with_inheritance: true,
    with_analysis: true
  });

  // Delete the project
  await delete_project(project_id);

  // Verify everything is deleted
  const projects = await get_project_by_name({ name: project_name });
  t.assert.eq(projects.length, 0, 'Project should be deleted');

  const entities =
    await query`SELECT COUNT(*) as count FROM entity WHERE project_id = ${project_id}`;
  t.assert.eq(parseInt(entities[0].count), 0, 'Entities should be deleted');

  const refs =
    await query`SELECT COUNT(*) as count FROM symbol_reference WHERE project_id = ${project_id}`;
  t.assert.eq(parseInt(refs[0].count), 0, 'Symbol references should be deleted');

  const analysis =
    await query`SELECT COUNT(*) as count FROM project_analysis WHERE project_id = ${project_id}`;
  t.assert.eq(parseInt(analysis[0].count), 0, 'Analysis should be deleted');
});

await test('delete_project calls progress callback', async (t) => {
  const { project_id } = await setup_test_project({ with_entities: true });

  const progress_calls = [];
  const on_progress = (pct, msg) => {
    progress_calls.push({ pct, msg });
  };

  // Delete with progress callback
  await delete_project(project_id, on_progress);

  // Verify progress was reported
  t.assert.ok(progress_calls.length > 0, 'Should have called progress callback');
  t.assert.ok(
    progress_calls.some((c) => c.msg.includes('relationships')),
    'Should report relationships step'
  );
  t.assert.ok(
    progress_calls.some((c) => c.msg.includes('entities')),
    'Should report entities step'
  );
});

// Final cleanup
await cleanup_all_test_projects();
