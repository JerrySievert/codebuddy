'use strict';

/**
 * @fileoverview Tests for inheritance extraction handlers.
 * These are pure functions that process tree-sitter nodes.
 */

import { test } from 'st';
import {
  extract_type_names,
  extract_from_child_type,
  get_inheritance_handler,
  handle_java,
  handle_typescript,
  handle_python,
  handle_csharp,
  handle_cpp,
  handle_rust,
  handle_swift,
  handle_ruby,
  handle_php,
  handle_go
} from '../../../lib/inheritance/handlers.mjs';

// ============================================================================
// Mock Node Helper
// ============================================================================

/**
 * Create a mock tree-sitter node for testing.
 * @param {string} type - Node type
 * @param {string} text - Node text
 * @param {Object[]} children - Child nodes
 * @returns {Object} Mock node
 */
const create_mock_node = (type, text, children = []) => {
  return {
    type,
    text,
    childCount: children.length,
    child: (i) => children[i] || null,
    children
  };
};

// ============================================================================
// extract_type_names tests
// ============================================================================

await test('extract_type_names extracts type_identifier nodes', async (t) => {
  const node = create_mock_node('generic_type', 'List<String>', [
    create_mock_node('type_identifier', 'List'),
    create_mock_node('type_arguments', '<String>', [
      create_mock_node('type_identifier', 'String')
    ])
  ]);

  const result = extract_type_names(node);

  t.assert.ok(result.includes('List'), 'Should extract List');
  t.assert.ok(result.includes('String'), 'Should extract String');
});

await test('extract_type_names extracts identifier nodes', async (t) => {
  const node = create_mock_node('base_class', 'ParentClass', [
    create_mock_node('identifier', 'ParentClass')
  ]);

  const result = extract_type_names(node);

  t.assert.ok(result.includes('ParentClass'), 'Should extract ParentClass');
});

await test('extract_type_names filters out keywords', async (t) => {
  const node = create_mock_node('clause', 'extends public Base', [
    create_mock_node('identifier', 'extends'),
    create_mock_node('identifier', 'public'),
    create_mock_node('identifier', 'Base')
  ]);

  const result = extract_type_names(node);

  t.assert.ok(!result.includes('extends'), 'Should filter extends');
  t.assert.ok(!result.includes('public'), 'Should filter public');
  t.assert.ok(result.includes('Base'), 'Should keep Base');
});

await test('extract_type_names handles null input', async (t) => {
  const result = extract_type_names(null);
  t.assert.eq(result.length, 0, 'Should return empty array for null');
});

// ============================================================================
// extract_from_child_type tests
// ============================================================================

await test('extract_from_child_type finds matching children', async (t) => {
  const class_node = create_mock_node('class_declaration', 'class Foo extends Bar', [
    create_mock_node('identifier', 'Foo'),
    create_mock_node('superclass', 'Bar', [
      create_mock_node('type_identifier', 'Bar')
    ])
  ]);

  const result = extract_from_child_type(class_node, 'superclass', 'extends');

  t.assert.eq(result.length, 1, 'Should find one relationship');
  t.assert.eq(result[0].parent_symbol, 'Bar', 'Should have correct parent');
  t.assert.eq(result[0].relationship_type, 'extends', 'Should be extends');
});

await test('extract_from_child_type returns empty for no matches', async (t) => {
  const class_node = create_mock_node('class_declaration', 'class Foo', [
    create_mock_node('identifier', 'Foo')
  ]);

  const result = extract_from_child_type(class_node, 'superclass', 'extends');

  t.assert.eq(result.length, 0, 'Should return empty array');
});

// ============================================================================
// get_inheritance_handler tests
// ============================================================================

await test('get_inheritance_handler returns handler for supported languages', async (t) => {
  const languages = [
    'java',
    'typescript',
    'tsx',
    'javascript',
    'python',
    'csharp',
    'cpp',
    'rust',
    'swift',
    'ruby',
    'php',
    'go'
  ];

  for (const lang of languages) {
    const handler = get_inheritance_handler(lang);
    t.assert.ok(handler !== null, `Should have handler for ${lang}`);
    t.assert.eq(typeof handler, 'function', `Handler for ${lang} should be function`);
  }
});

await test('get_inheritance_handler returns null for unsupported language', async (t) => {
  const result = get_inheritance_handler('unknown_language');
  t.assert.eq(result, null, 'Should return null for unsupported language');
});

// ============================================================================
// handle_java tests
// ============================================================================

await test('handle_java extracts superclass', async (t) => {
  const class_node = create_mock_node('class_declaration', 'class Child extends Parent', [
    create_mock_node('identifier', 'Child'),
    create_mock_node('superclass', 'extends Parent', [
      create_mock_node('type_identifier', 'Parent')
    ])
  ]);

  const result = handle_java(class_node);

  t.assert.eq(result.length, 1, 'Should find one relationship');
  t.assert.eq(result[0].parent_symbol, 'Parent', 'Should have Parent as parent');
  t.assert.eq(result[0].relationship_type, 'extends', 'Should be extends');
});

await test('handle_java extracts super_interfaces', async (t) => {
  const class_node = create_mock_node('class_declaration', 'class Foo implements Bar, Baz', [
    create_mock_node('identifier', 'Foo'),
    create_mock_node('super_interfaces', 'implements Bar, Baz', [
      create_mock_node('type_identifier', 'Bar'),
      create_mock_node('type_identifier', 'Baz')
    ])
  ]);

  const result = handle_java(class_node);

  t.assert.eq(result.length, 2, 'Should find two relationships');
  t.assert.ok(
    result.some((r) => r.parent_symbol === 'Bar'),
    'Should have Bar'
  );
  t.assert.ok(
    result.some((r) => r.parent_symbol === 'Baz'),
    'Should have Baz'
  );
  t.assert.ok(
    result.every((r) => r.relationship_type === 'implements'),
    'All should be implements'
  );
});

// ============================================================================
// handle_typescript tests
// ============================================================================

await test('handle_typescript extracts extends_clause', async (t) => {
  const class_node = create_mock_node('class_declaration', 'class Child extends Parent', [
    create_mock_node('identifier', 'Child'),
    create_mock_node('class_heritage', 'extends Parent', [
      create_mock_node('extends_clause', 'extends Parent', [
        create_mock_node('type_identifier', 'Parent')
      ])
    ])
  ]);

  const result = handle_typescript(class_node);

  t.assert.eq(result.length, 1, 'Should find one relationship');
  t.assert.eq(result[0].parent_symbol, 'Parent', 'Should have Parent');
  t.assert.eq(result[0].relationship_type, 'extends', 'Should be extends');
});

await test('handle_typescript extracts implements_clause', async (t) => {
  const class_node = create_mock_node('class_declaration', 'class Foo implements Bar', [
    create_mock_node('identifier', 'Foo'),
    create_mock_node('class_heritage', 'implements Bar', [
      create_mock_node('implements_clause', 'implements Bar', [
        create_mock_node('type_identifier', 'Bar')
      ])
    ])
  ]);

  const result = handle_typescript(class_node);

  t.assert.eq(result.length, 1, 'Should find one relationship');
  t.assert.eq(result[0].parent_symbol, 'Bar', 'Should have Bar');
  t.assert.eq(result[0].relationship_type, 'implements', 'Should be implements');
});

await test('handle_typescript extracts interface extends', async (t) => {
  const interface_node = create_mock_node('interface_declaration', 'interface Child extends Parent', [
    create_mock_node('identifier', 'Child'),
    create_mock_node('extends_type_clause', 'extends Parent', [
      create_mock_node('type_identifier', 'Parent')
    ])
  ]);

  const result = handle_typescript(interface_node);

  t.assert.eq(result.length, 1, 'Should find one relationship');
  t.assert.eq(result[0].relationship_type, 'extends', 'Should be extends');
});

// ============================================================================
// handle_python tests
// ============================================================================

await test('handle_python extracts base classes', async (t) => {
  const class_node = create_mock_node('class_definition', 'class Child(Parent)', [
    create_mock_node('identifier', 'Child'),
    create_mock_node('argument_list', '(Parent)', [
      create_mock_node('identifier', 'Parent')
    ])
  ]);

  const result = handle_python(class_node);

  t.assert.eq(result.length, 1, 'Should find one relationship');
  t.assert.eq(result[0].parent_symbol, 'Parent', 'Should have Parent');
  t.assert.eq(result[0].relationship_type, 'extends', 'Should be extends');
});

await test('handle_python extracts multiple base classes', async (t) => {
  const class_node = create_mock_node('class_definition', 'class Child(A, B, C)', [
    create_mock_node('identifier', 'Child'),
    create_mock_node('argument_list', '(A, B, C)', [
      create_mock_node('identifier', 'A'),
      create_mock_node('identifier', 'B'),
      create_mock_node('identifier', 'C')
    ])
  ]);

  const result = handle_python(class_node);

  t.assert.eq(result.length, 3, 'Should find three relationships');
});

// ============================================================================
// handle_csharp tests
// ============================================================================

await test('handle_csharp extracts base_list', async (t) => {
  const class_node = create_mock_node('class_declaration', 'class Child : Parent', [
    create_mock_node('identifier', 'Child'),
    create_mock_node('base_list', ': Parent', [
      create_mock_node('type_identifier', 'Parent')
    ])
  ]);

  const result = handle_csharp(class_node);

  t.assert.eq(result.length, 1, 'Should find one relationship');
  t.assert.eq(result[0].parent_symbol, 'Parent', 'Should have Parent');
});

await test('handle_csharp uses extends for interface declarations', async (t) => {
  const interface_node = create_mock_node('interface_declaration', 'interface IChild : IParent', [
    create_mock_node('identifier', 'IChild'),
    create_mock_node('base_list', ': IParent', [
      create_mock_node('type_identifier', 'IParent')
    ])
  ]);

  const result = handle_csharp(interface_node);

  t.assert.eq(result.length, 1, 'Should find one relationship');
  t.assert.eq(result[0].relationship_type, 'extends', 'Interface should use extends');
});

// ============================================================================
// handle_cpp tests
// ============================================================================

await test('handle_cpp extracts base_class_clause', async (t) => {
  const class_node = create_mock_node('class_specifier', 'class Child : public Parent', [
    create_mock_node('identifier', 'Child'),
    create_mock_node('base_class_clause', ': public Parent', [
      create_mock_node('type_identifier', 'Parent')
    ])
  ]);

  const result = handle_cpp(class_node);

  t.assert.eq(result.length, 1, 'Should find one relationship');
  t.assert.eq(result[0].parent_symbol, 'Parent', 'Should have Parent');
  t.assert.eq(result[0].relationship_type, 'extends', 'Should be extends');
});

// ============================================================================
// handle_rust tests
// ============================================================================

await test('handle_rust extracts trait implementation', async (t) => {
  const impl_node = create_mock_node('impl_item', 'impl Display for MyType', [
    create_mock_node('type_identifier', 'Display'),
    { type: 'keyword', text: 'for' },
    create_mock_node('type_identifier', 'MyType')
  ]);

  const result = handle_rust(impl_node);

  t.assert.eq(result.length, 1, 'Should find one relationship');
  t.assert.eq(result[0].parent_symbol, 'Display', 'Should have Display as parent');
  t.assert.eq(result[0].relationship_type, 'implements', 'Should be implements');
});

await test('handle_rust returns empty for non-trait impl', async (t) => {
  const impl_node = create_mock_node('impl_item', 'impl MyType', [
    create_mock_node('type_identifier', 'MyType')
  ]);

  const result = handle_rust(impl_node);

  t.assert.eq(result.length, 0, 'Should return empty for inherent impl');
});

// ============================================================================
// handle_swift tests
// ============================================================================

await test('handle_swift extracts inheritance_clause', async (t) => {
  const class_node = create_mock_node('class_declaration', 'class Child: Parent', [
    create_mock_node('identifier', 'Child'),
    create_mock_node('inheritance_clause', ': Parent', [
      create_mock_node('type_identifier', 'Parent')
    ])
  ]);

  const result = handle_swift(class_node);

  t.assert.eq(result.length, 1, 'Should find one relationship');
  t.assert.eq(result[0].parent_symbol, 'Parent', 'Should have Parent');
});

await test('handle_swift extracts type_inheritance_clause', async (t) => {
  const class_node = create_mock_node('struct_declaration', 'struct Point: Equatable', [
    create_mock_node('identifier', 'Point'),
    create_mock_node('type_inheritance_clause', ': Equatable', [
      create_mock_node('type_identifier', 'Equatable')
    ])
  ]);

  const result = handle_swift(class_node);

  t.assert.eq(result.length, 1, 'Should find one relationship');
});

// ============================================================================
// handle_ruby tests
// ============================================================================

await test('handle_ruby extracts superclass', async (t) => {
  const class_node = create_mock_node('class', 'class Child < Parent', [
    create_mock_node('constant', 'Child'),
    create_mock_node('superclass', '< Parent', [
      create_mock_node('constant', 'Parent')
    ])
  ]);

  const result = handle_ruby(class_node);

  t.assert.eq(result.length, 1, 'Should find one relationship');
  t.assert.eq(result[0].parent_symbol, 'Parent', 'Should have Parent');
  t.assert.eq(result[0].relationship_type, 'extends', 'Should be extends');
});

// ============================================================================
// handle_php tests
// ============================================================================

await test('handle_php extracts base_clause', async (t) => {
  const class_node = create_mock_node('class_declaration', 'class Child extends Parent', [
    create_mock_node('name', 'Child'),
    create_mock_node('base_clause', 'extends Parent', [
      create_mock_node('name', 'Parent')
    ])
  ]);

  const result = handle_php(class_node);

  t.assert.eq(result.length, 1, 'Should find one relationship');
  t.assert.eq(result[0].parent_symbol, 'Parent', 'Should have Parent');
  t.assert.eq(result[0].relationship_type, 'extends', 'Should be extends');
});

await test('handle_php extracts class_interface_clause', async (t) => {
  const class_node = create_mock_node('class_declaration', 'class Foo implements Bar', [
    create_mock_node('name', 'Foo'),
    create_mock_node('class_interface_clause', 'implements Bar', [
      create_mock_node('name', 'Bar')
    ])
  ]);

  const result = handle_php(class_node);

  t.assert.eq(result.length, 1, 'Should find one relationship');
  t.assert.eq(result[0].parent_symbol, 'Bar', 'Should have Bar');
  t.assert.eq(result[0].relationship_type, 'implements', 'Should be implements');
});

// ============================================================================
// handle_go tests
// ============================================================================

await test('handle_go extracts embedded structs', async (t) => {
  const struct_node = create_mock_node('struct_type', 'struct { BaseType }', [
    create_mock_node('field_declaration_list', '{ BaseType }', [
      create_mock_node('field_declaration', 'BaseType', [
        create_mock_node('type_identifier', 'BaseType')
      ])
    ])
  ]);

  const result = handle_go(struct_node);

  t.assert.eq(result.length, 1, 'Should find one relationship');
  t.assert.eq(result[0].parent_symbol, 'BaseType', 'Should have BaseType');
  t.assert.eq(result[0].relationship_type, 'embeds', 'Should be embeds');
});

await test('handle_go ignores named fields', async (t) => {
  const struct_node = create_mock_node('struct_type', 'struct { name string }', [
    create_mock_node('field_declaration_list', '{ name string }', [
      create_mock_node('field_declaration', 'name string', [
        create_mock_node('field_identifier', 'name'),
        create_mock_node('type_identifier', 'string')
      ])
    ])
  ]);

  const result = handle_go(struct_node);

  t.assert.eq(result.length, 0, 'Should not extract named fields');
});

await test('handle_go returns empty for non-struct types', async (t) => {
  const interface_node = create_mock_node('interface_type', 'interface {}', []);

  const result = handle_go(interface_node);

  t.assert.eq(result.length, 0, 'Should return empty for interface');
});
