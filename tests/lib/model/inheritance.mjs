'use strict';

/**
 * @fileoverview Tests for inheritance model functions.
 * Uses test fixtures created in the database for each test.
 */

import { test } from 'st';
import { query } from '../../../lib/db.mjs';
import { insert_or_update_project } from '../../../lib/model/project.mjs';
import { batch_insert_or_update_entities } from '../../../lib/model/entity.mjs';
import {
  batch_insert_inheritance,
  get_parents,
  get_children,
  get_children_by_symbol,
  get_project_hierarchy,
  get_inheritance_stats,
  clear_inheritance_for_project
} from '../../../lib/model/inheritance.mjs';

// Counter to ensure unique project names
let test_counter = 0;

/**
 * Clean up any leftover test projects from previous runs.
 */
const cleanup_all_test_projects = async () => {
  const projects =
    await query`SELECT id FROM project WHERE name LIKE '_test_inheritance_%'`;
  for (const p of projects) {
    await query`DELETE FROM inheritance WHERE child_entity_id IN (SELECT id FROM entity WHERE project_id = ${p.id})`;
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
 * Create test project with class entities.
 */
const setup_test_fixtures = async () => {
  const test_id = ++test_counter;
  const project_name = `_test_inheritance_${test_id}_${Date.now()}`;

  const project_result = await insert_or_update_project({
    name: project_name,
    path: `/tmp/test_inheritance_${test_id}`
  });
  const project_id = project_result[0].id;

  // Create test class hierarchy:
  // Animal (base)
  //   ├── Dog extends Animal
  //   └── Cat extends Animal
  // Runnable (interface)
  //   └── Dog implements Runnable
  const entities = await batch_insert_or_update_entities([
    {
      project_id,
      symbol: 'Animal',
      type: 'class',
      filename: 'animals.java',
      language: 'java',
      start_line: 1,
      end_line: 20,
      parameters: '',
      return_type: '',
      source: 'class Animal { }',
      comment: null
    },
    {
      project_id,
      symbol: 'Dog',
      type: 'class',
      filename: 'animals.java',
      language: 'java',
      start_line: 22,
      end_line: 40,
      parameters: '',
      return_type: '',
      source: 'class Dog extends Animal implements Runnable { }',
      comment: null
    },
    {
      project_id,
      symbol: 'Cat',
      type: 'class',
      filename: 'animals.java',
      language: 'java',
      start_line: 42,
      end_line: 60,
      parameters: '',
      return_type: '',
      source: 'class Cat extends Animal { }',
      comment: null
    },
    {
      project_id,
      symbol: 'Runnable',
      type: 'class',
      filename: 'interfaces.java',
      language: 'java',
      start_line: 1,
      end_line: 10,
      parameters: '',
      return_type: '',
      source: 'interface Runnable { }',
      comment: null
    }
  ]);

  const entity_map = {};
  for (const e of entities) {
    entity_map[e.symbol] = e;
  }

  return { project_id, entities, entity_map };
};

/**
 * Clean up test fixtures.
 */
const cleanup_test_fixtures = async (project_id) => {
  if (project_id === undefined) return;
  await query`DELETE FROM inheritance WHERE child_entity_id IN (SELECT id FROM entity WHERE project_id = ${project_id})`;
  await query`DELETE FROM entity WHERE project_id = ${project_id}`;
  await query`DELETE FROM project WHERE id = ${project_id}`;
};

// ============ batch_insert_inheritance tests ============

await test('batch_insert_inheritance inserts multiple relationships', async (t) => {
  let project_id;
  try {
    const fixtures = await setup_test_fixtures();
    project_id = fixtures.project_id;
    const { entity_map } = fixtures;

    const relationships = [
      {
        child_entity_id: entity_map.Dog.id,
        parent_entity_id: entity_map.Animal.id,
        parent_symbol: 'Animal',
        relationship_type: 'extends'
      },
      {
        child_entity_id: entity_map.Cat.id,
        parent_entity_id: entity_map.Animal.id,
        parent_symbol: 'Animal',
        relationship_type: 'extends'
      },
      {
        child_entity_id: entity_map.Dog.id,
        parent_entity_id: entity_map.Runnable.id,
        parent_symbol: 'Runnable',
        relationship_type: 'implements'
      }
    ];

    await batch_insert_inheritance(relationships);

    const count =
      await query`SELECT COUNT(*) as count FROM inheritance WHERE child_entity_id IN (SELECT id FROM entity WHERE project_id = ${project_id})`;
    t.assert.eq(parseInt(count[0].count), 3, 'Should insert 3 relationships');
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

await test('batch_insert_inheritance filters invalid relationships', async (t) => {
  let project_id;
  try {
    const fixtures = await setup_test_fixtures();
    project_id = fixtures.project_id;
    const { entity_map } = fixtures;

    const relationships = [
      {
        child_entity_id: entity_map.Dog.id,
        parent_symbol: 'Animal',
        relationship_type: 'extends'
      },
      {
        child_entity_id: null,
        parent_symbol: 'Animal',
        relationship_type: 'extends'
      }, // Invalid
      {
        child_entity_id: entity_map.Cat.id,
        parent_symbol: null,
        relationship_type: 'extends'
      }, // Invalid
      {
        child_entity_id: entity_map.Cat.id,
        parent_symbol: 'Animal',
        relationship_type: null
      } // Invalid
    ];

    await batch_insert_inheritance(relationships);

    const count =
      await query`SELECT COUNT(*) as count FROM inheritance WHERE child_entity_id IN (SELECT id FROM entity WHERE project_id = ${project_id})`;
    t.assert.eq(
      parseInt(count[0].count),
      1,
      'Should only insert 1 valid relationship'
    );
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

await test('batch_insert_inheritance handles empty array', async (t) => {
  const result = await batch_insert_inheritance([]);
  t.assert.eq(result.length, 0, 'Should return empty array for empty input');
});

await test('batch_insert_inheritance allows null parent_entity_id', async (t) => {
  let project_id;
  try {
    const fixtures = await setup_test_fixtures();
    project_id = fixtures.project_id;
    const { entity_map } = fixtures;

    // External parent that isn't in our codebase
    const relationships = [
      {
        child_entity_id: entity_map.Dog.id,
        parent_entity_id: null, // Parent not in project
        parent_symbol: 'ExternalBaseClass',
        relationship_type: 'extends'
      }
    ];

    await batch_insert_inheritance(relationships);

    const count =
      await query`SELECT COUNT(*) as count FROM inheritance WHERE child_entity_id = ${entity_map.Dog.id}`;
    t.assert.eq(parseInt(count[0].count), 1, 'Should insert with null parent_entity_id');
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

// ============ get_parents tests ============

await test('get_parents returns parent classes', async (t) => {
  let project_id;
  try {
    const fixtures = await setup_test_fixtures();
    project_id = fixtures.project_id;
    const { entity_map } = fixtures;

    await batch_insert_inheritance([
      {
        child_entity_id: entity_map.Dog.id,
        parent_entity_id: entity_map.Animal.id,
        parent_symbol: 'Animal',
        relationship_type: 'extends'
      },
      {
        child_entity_id: entity_map.Dog.id,
        parent_entity_id: entity_map.Runnable.id,
        parent_symbol: 'Runnable',
        relationship_type: 'implements'
      }
    ]);

    const result = await get_parents(entity_map.Dog.id);

    t.assert.eq(result.length, 2, 'Dog should have 2 parents');
    const symbols = result.map((r) => r.parent_symbol);
    t.assert.ok(symbols.includes('Animal'), 'Should include Animal');
    t.assert.ok(symbols.includes('Runnable'), 'Should include Runnable');

    const types = result.map((r) => r.relationship_type);
    t.assert.ok(types.includes('extends'), 'Should have extends');
    t.assert.ok(types.includes('implements'), 'Should have implements');
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

await test('get_parents returns empty for root class', async (t) => {
  let project_id;
  try {
    const fixtures = await setup_test_fixtures();
    project_id = fixtures.project_id;
    const { entity_map } = fixtures;

    // Animal has no parents
    const result = await get_parents(entity_map.Animal.id);

    t.assert.eq(result.length, 0, 'Animal should have no parents');
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

// ============ get_children tests ============

await test('get_children returns child classes', async (t) => {
  let project_id;
  try {
    const fixtures = await setup_test_fixtures();
    project_id = fixtures.project_id;
    const { entity_map } = fixtures;

    await batch_insert_inheritance([
      {
        child_entity_id: entity_map.Dog.id,
        parent_entity_id: entity_map.Animal.id,
        parent_symbol: 'Animal',
        relationship_type: 'extends'
      },
      {
        child_entity_id: entity_map.Cat.id,
        parent_entity_id: entity_map.Animal.id,
        parent_symbol: 'Animal',
        relationship_type: 'extends'
      }
    ]);

    const result = await get_children(entity_map.Animal.id);

    t.assert.eq(result.length, 2, 'Animal should have 2 children');
    const symbols = result.map((r) => r.child_symbol);
    t.assert.ok(symbols.includes('Dog'), 'Should include Dog');
    t.assert.ok(symbols.includes('Cat'), 'Should include Cat');
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

await test('get_children returns empty for leaf class', async (t) => {
  let project_id;
  try {
    const fixtures = await setup_test_fixtures();
    project_id = fixtures.project_id;
    const { entity_map } = fixtures;

    await batch_insert_inheritance([
      {
        child_entity_id: entity_map.Dog.id,
        parent_entity_id: entity_map.Animal.id,
        parent_symbol: 'Animal',
        relationship_type: 'extends'
      }
    ]);

    // Dog has no children
    const result = await get_children(entity_map.Dog.id);

    t.assert.eq(result.length, 0, 'Dog should have no children');
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

// ============ get_children_by_symbol tests ============

await test('get_children_by_symbol finds implementors', async (t) => {
  let project_id;
  try {
    const fixtures = await setup_test_fixtures();
    project_id = fixtures.project_id;
    const { entity_map } = fixtures;

    await batch_insert_inheritance([
      {
        child_entity_id: entity_map.Dog.id,
        parent_entity_id: entity_map.Runnable.id,
        parent_symbol: 'Runnable',
        relationship_type: 'implements'
      }
    ]);

    const result = await get_children_by_symbol({
      project_id,
      parent_symbol: 'Runnable'
    });

    t.assert.eq(result.length, 1, 'Runnable should have 1 implementor');
    t.assert.eq(result[0].child_symbol, 'Dog', 'Dog implements Runnable');
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

await test('get_children_by_symbol finds external parent references', async (t) => {
  let project_id;
  try {
    const fixtures = await setup_test_fixtures();
    project_id = fixtures.project_id;
    const { entity_map } = fixtures;

    // External parent not in our codebase
    await batch_insert_inheritance([
      {
        child_entity_id: entity_map.Dog.id,
        parent_entity_id: null,
        parent_symbol: 'ExternalBase',
        relationship_type: 'extends'
      },
      {
        child_entity_id: entity_map.Cat.id,
        parent_entity_id: null,
        parent_symbol: 'ExternalBase',
        relationship_type: 'extends'
      }
    ]);

    const result = await get_children_by_symbol({
      project_id,
      parent_symbol: 'ExternalBase'
    });

    t.assert.eq(result.length, 2, 'ExternalBase should have 2 children');
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

// ============ get_project_hierarchy tests ============

await test('get_project_hierarchy returns all relationships', async (t) => {
  let project_id;
  try {
    const fixtures = await setup_test_fixtures();
    project_id = fixtures.project_id;
    const { entity_map } = fixtures;

    await batch_insert_inheritance([
      {
        child_entity_id: entity_map.Dog.id,
        parent_entity_id: entity_map.Animal.id,
        parent_symbol: 'Animal',
        relationship_type: 'extends'
      },
      {
        child_entity_id: entity_map.Cat.id,
        parent_entity_id: entity_map.Animal.id,
        parent_symbol: 'Animal',
        relationship_type: 'extends'
      },
      {
        child_entity_id: entity_map.Dog.id,
        parent_entity_id: entity_map.Runnable.id,
        parent_symbol: 'Runnable',
        relationship_type: 'implements'
      }
    ]);

    const result = await get_project_hierarchy(project_id);

    t.assert.eq(result.length, 3, 'Should return 3 relationships');

    // Check that we have both extends and implements
    const types = [...new Set(result.map((r) => r.relationship_type))];
    t.assert.ok(types.includes('extends'), 'Should have extends');
    t.assert.ok(types.includes('implements'), 'Should have implements');
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

// ============ get_inheritance_stats tests ============

await test('get_inheritance_stats returns statistics', async (t) => {
  let project_id;
  try {
    const fixtures = await setup_test_fixtures();
    project_id = fixtures.project_id;
    const { entity_map } = fixtures;

    await batch_insert_inheritance([
      {
        child_entity_id: entity_map.Dog.id,
        parent_entity_id: entity_map.Animal.id,
        parent_symbol: 'Animal',
        relationship_type: 'extends'
      },
      {
        child_entity_id: entity_map.Cat.id,
        parent_entity_id: entity_map.Animal.id,
        parent_symbol: 'Animal',
        relationship_type: 'extends'
      },
      {
        child_entity_id: entity_map.Dog.id,
        parent_entity_id: entity_map.Runnable.id,
        parent_symbol: 'Runnable',
        relationship_type: 'implements'
      }
    ]);

    const result = await get_inheritance_stats(project_id);

    t.assert.ok(result.by_type, 'Should have by_type breakdown');
    t.assert.ok(result.by_type.length > 0, 'Should have type counts');

    const extends_count = result.by_type.find(
      (t) => t.relationship_type === 'extends'
    );
    t.assert.ok(extends_count, 'Should have extends count');
    t.assert.eq(parseInt(extends_count.count), 2, 'Should have 2 extends');

    const implements_count = result.by_type.find(
      (t) => t.relationship_type === 'implements'
    );
    t.assert.ok(implements_count, 'Should have implements count');
    t.assert.eq(parseInt(implements_count.count), 1, 'Should have 1 implements');
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

await test('get_inheritance_stats counts root classes', async (t) => {
  let project_id;
  try {
    const fixtures = await setup_test_fixtures();
    project_id = fixtures.project_id;
    const { entity_map } = fixtures;

    // Only Dog and Cat extend Animal
    await batch_insert_inheritance([
      {
        child_entity_id: entity_map.Dog.id,
        parent_entity_id: entity_map.Animal.id,
        parent_symbol: 'Animal',
        relationship_type: 'extends'
      },
      {
        child_entity_id: entity_map.Cat.id,
        parent_entity_id: entity_map.Animal.id,
        parent_symbol: 'Animal',
        relationship_type: 'extends'
      }
    ]);

    const result = await get_inheritance_stats(project_id);

    // Animal and Runnable are root classes (no parents)
    t.assert.ok(result.root_class_count >= 2, 'Should have at least 2 root classes');
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

// ============ clear_inheritance_for_project tests ============

await test('clear_inheritance_for_project removes all relationships', async (t) => {
  let project_id;
  try {
    const fixtures = await setup_test_fixtures();
    project_id = fixtures.project_id;
    const { entity_map } = fixtures;

    await batch_insert_inheritance([
      {
        child_entity_id: entity_map.Dog.id,
        parent_entity_id: entity_map.Animal.id,
        parent_symbol: 'Animal',
        relationship_type: 'extends'
      },
      {
        child_entity_id: entity_map.Cat.id,
        parent_entity_id: entity_map.Animal.id,
        parent_symbol: 'Animal',
        relationship_type: 'extends'
      }
    ]);

    await clear_inheritance_for_project({ id: project_id });

    const count =
      await query`SELECT COUNT(*) as count FROM inheritance WHERE child_entity_id IN (SELECT id FROM entity WHERE project_id = ${project_id})`;
    t.assert.eq(
      parseInt(count[0].count),
      0,
      'Should have no relationships after clear'
    );
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

// Final cleanup
await cleanup_all_test_projects();
