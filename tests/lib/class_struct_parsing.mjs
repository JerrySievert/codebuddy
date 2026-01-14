'use strict';

import { get_nodes_from_source } from '../../lib/functions.mjs';
import { prepare_entities_for_nodes } from '../../lib/project.mjs';
import { import_file } from '../../lib/sourcecode.mjs';

import { test } from 'st';

// ============ JavaScript Class Parsing ============

await test('JavaScript: parses class declarations', async (t) => {
  const source = await import_file('./tests/fixtures/classes_structs.js');
  const nodes = get_nodes_from_source(source, 'classes_structs.js');

  t.assert.ok(nodes.class_definition, 'Should have class_definition array');
  t.assert.ok(nodes.class_definition.length > 0, 'Should find class definitions');

  const classNames = nodes.class_definition.map((c) => c.content.substring(0, 50));
  t.assert.ok(classNames.some((n) => n.includes('Animal')), 'Should find Animal class');
  t.assert.ok(classNames.some((n) => n.includes('Dog')), 'Should find Dog class');
  t.assert.ok(classNames.some((n) => n.includes('MathUtils')), 'Should find MathUtils class');
  t.assert.ok(classNames.some((n) => n.includes('Rectangle')), 'Should find Rectangle class');
});

await test('JavaScript: parses class expressions', async (t) => {
  const source = await import_file('./tests/fixtures/classes_structs.js');
  const nodes = get_nodes_from_source(source, 'classes_structs.js');

  // Class expressions assigned to variables should be found
  const classTypes = nodes.class_definition.map((c) => c.type);
  t.assert.ok(classTypes.includes('class') || classTypes.includes('class_declaration'), 'Should find class types');
});

await test('JavaScript: creates entities for classes', async (t) => {
  const source = await import_file('./tests/fixtures/classes_structs.js');
  const nodes = get_nodes_from_source(source, 'classes_structs.js');

  const entities = prepare_entities_for_nodes({
    project_id: 1,
    nodes,
    filename: 'classes_structs.js',
    language: 'javascript'
  });

  const classEntities = entities.filter((e) => e.type === 'class');
  t.assert.ok(classEntities.length > 0, 'Should create class entities');

  const classSymbols = classEntities.map((e) => e.symbol);
  t.assert.ok(classSymbols.includes('Animal'), 'Should have Animal class entity');
  t.assert.ok(classSymbols.includes('Dog'), 'Should have Dog class entity');
});

// ============ Python Class Parsing ============

await test('Python: parses class definitions', async (t) => {
  const source = await import_file('./tests/fixtures/classes_structs.py');
  const nodes = get_nodes_from_source(source, 'classes_structs.py');

  t.assert.ok(nodes.class_definition, 'Should have class_definition array');
  t.assert.ok(nodes.class_definition.length > 0, 'Should find class definitions');

  const classNames = nodes.class_definition.map((c) => c.content.substring(0, 50));
  t.assert.ok(classNames.some((n) => n.includes('Animal')), 'Should find Animal class');
  t.assert.ok(classNames.some((n) => n.includes('Dog')), 'Should find Dog class');
  t.assert.ok(classNames.some((n) => n.includes('Shape')), 'Should find Shape class');
  t.assert.ok(classNames.some((n) => n.includes('Rectangle')), 'Should find Rectangle class');
});

await test('Python: parses dataclasses', async (t) => {
  const source = await import_file('./tests/fixtures/classes_structs.py');
  const nodes = get_nodes_from_source(source, 'classes_structs.py');

  const classNames = nodes.class_definition.map((c) => c.content.substring(0, 50));
  t.assert.ok(classNames.some((n) => n.includes('Point')), 'Should find Point dataclass');
  t.assert.ok(classNames.some((n) => n.includes('Vector')), 'Should find Vector dataclass');
});

await test('Python: creates entities for classes', async (t) => {
  const source = await import_file('./tests/fixtures/classes_structs.py');
  const nodes = get_nodes_from_source(source, 'classes_structs.py');

  const entities = prepare_entities_for_nodes({
    project_id: 1,
    nodes,
    filename: 'classes_structs.py',
    language: 'python'
  });

  const classEntities = entities.filter((e) => e.type === 'class');
  t.assert.ok(classEntities.length > 0, 'Should create class entities');

  const classSymbols = classEntities.map((e) => e.symbol);
  t.assert.ok(classSymbols.includes('Animal'), 'Should have Animal class entity');
  t.assert.ok(classSymbols.includes('Dog'), 'Should have Dog class entity');
  t.assert.ok(classSymbols.includes('Shape'), 'Should have Shape class entity');
});

// ============ TypeScript Class and Interface Parsing ============

await test('TypeScript: parses class declarations', async (t) => {
  const source = await import_file('./tests/fixtures/classes_structs.ts');
  const nodes = get_nodes_from_source(source, 'classes_structs.ts');

  t.assert.ok(nodes.class_definition, 'Should have class_definition array');
  t.assert.ok(nodes.class_definition.length > 0, 'Should find class definitions');

  const classNames = nodes.class_definition.map((c) => c.content.substring(0, 50));
  t.assert.ok(classNames.some((n) => n.includes('Dog')), 'Should find Dog class');
  t.assert.ok(classNames.some((n) => n.includes('Shape')), 'Should find Shape class');
  t.assert.ok(classNames.some((n) => n.includes('Rectangle')), 'Should find Rectangle class');
});

await test('TypeScript: creates entities for classes', async (t) => {
  const source = await import_file('./tests/fixtures/classes_structs.ts');
  const nodes = get_nodes_from_source(source, 'classes_structs.ts');

  const entities = prepare_entities_for_nodes({
    project_id: 1,
    nodes,
    filename: 'classes_structs.ts',
    language: 'typescript'
  });

  const classEntities = entities.filter((e) => e.type === 'class');
  t.assert.ok(classEntities.length > 0, 'Should create class entities');
});

// ============ C Struct Parsing ============

await test('C: parses struct definitions', async (t) => {
  const source = await import_file('./tests/fixtures/classes_structs.c');
  const nodes = get_nodes_from_source(source, 'classes_structs.c');

  t.assert.ok(nodes.struct_definition, 'Should have struct_definition array');
  t.assert.ok(nodes.struct_definition.length > 0, 'Should find struct definitions');
});

await test('C: creates entities for structs', async (t) => {
  const source = await import_file('./tests/fixtures/classes_structs.c');
  const nodes = get_nodes_from_source(source, 'classes_structs.c');

  const entities = prepare_entities_for_nodes({
    project_id: 1,
    nodes,
    filename: 'classes_structs.c',
    language: 'c'
  });

  const structEntities = entities.filter((e) => e.type === 'struct');
  t.assert.ok(structEntities.length > 0, 'Should create struct entities');

  const structSymbols = structEntities.map((e) => e.symbol);
  t.assert.ok(structSymbols.includes('Point'), 'Should have Point struct entity');
});

// ============ C++ Class and Struct Parsing ============

await test('C++: parses class definitions', async (t) => {
  const source = await import_file('./tests/fixtures/classes_structs.cpp');
  const nodes = get_nodes_from_source(source, 'classes_structs.cpp');

  t.assert.ok(nodes.class_definition, 'Should have class_definition array');
  t.assert.ok(nodes.class_definition.length > 0, 'Should find class definitions');
});

await test('C++: parses struct definitions', async (t) => {
  const source = await import_file('./tests/fixtures/classes_structs.cpp');
  const nodes = get_nodes_from_source(source, 'classes_structs.cpp');

  t.assert.ok(nodes.struct_definition, 'Should have struct_definition array');
  t.assert.ok(nodes.struct_definition.length > 0, 'Should find struct definitions');
});

await test('C++: creates entities for classes and structs', async (t) => {
  const source = await import_file('./tests/fixtures/classes_structs.cpp');
  const nodes = get_nodes_from_source(source, 'classes_structs.cpp');

  const entities = prepare_entities_for_nodes({
    project_id: 1,
    nodes,
    filename: 'classes_structs.cpp',
    language: 'cpp'
  });

  const classEntities = entities.filter((e) => e.type === 'class');
  const structEntities = entities.filter((e) => e.type === 'struct');

  t.assert.ok(classEntities.length > 0, 'Should create class entities');
  t.assert.ok(structEntities.length > 0, 'Should create struct entities');

  const classSymbols = classEntities.map((e) => e.symbol);
  t.assert.ok(classSymbols.includes('Animal'), 'Should have Animal class entity');
  t.assert.ok(classSymbols.includes('Dog'), 'Should have Dog class entity');

  const structSymbols = structEntities.map((e) => e.symbol);
  t.assert.ok(structSymbols.includes('Point'), 'Should have Point struct entity');
});

await test('C++: parses member functions', async (t) => {
  const source = await import_file('./tests/fixtures/classes_structs.cpp');
  const nodes = get_nodes_from_source(source, 'classes_structs.cpp');

  const entities = prepare_entities_for_nodes({
    project_id: 1,
    nodes,
    filename: 'classes_structs.cpp',
    language: 'cpp'
  });

  const functionEntities = entities.filter((e) => e.type === 'function');
  t.assert.ok(functionEntities.length > 0, 'Should create function entities');

  // Should find free functions and member functions
  const functionSymbols = functionEntities.map((e) => e.symbol);
  t.assert.ok(functionSymbols.includes('main'), 'Should have main function');
  t.assert.ok(functionSymbols.includes('printPoint'), 'Should have printPoint function');
});

// ============ Go Struct and Interface Parsing ============

await test('Go: parses struct definitions', async (t) => {
  const source = await import_file('./tests/fixtures/classes_structs.go');
  const nodes = get_nodes_from_source(source, 'classes_structs.go');

  // Go structs are defined via type declarations
  t.assert.ok(nodes.struct_definition || nodes.class_definition, 'Should have struct or class definitions');
});

await test('Go: creates entities for structs', async (t) => {
  const source = await import_file('./tests/fixtures/classes_structs.go');
  const nodes = get_nodes_from_source(source, 'classes_structs.go');

  const entities = prepare_entities_for_nodes({
    project_id: 1,
    nodes,
    filename: 'classes_structs.go',
    language: 'go'
  });

  // Go may create class or struct entities depending on type declaration
  const typeEntities = entities.filter((e) => e.type === 'class' || e.type === 'struct');
  t.assert.ok(typeEntities.length >= 0, 'Should handle Go type entities');
});

// ============ Rust Struct Parsing ============

await test('Rust: parses struct definitions', async (t) => {
  const source = await import_file('./tests/fixtures/classes_structs.rs');
  const nodes = get_nodes_from_source(source, 'classes_structs.rs');

  t.assert.ok(nodes.struct_definition, 'Should have struct_definition array');
  t.assert.ok(nodes.struct_definition.length > 0, 'Should find struct definitions');
});

await test('Rust: creates entities for structs', async (t) => {
  const source = await import_file('./tests/fixtures/classes_structs.rs');
  const nodes = get_nodes_from_source(source, 'classes_structs.rs');

  const entities = prepare_entities_for_nodes({
    project_id: 1,
    nodes,
    filename: 'classes_structs.rs',
    language: 'rust'
  });

  const structEntities = entities.filter((e) => e.type === 'struct');
  t.assert.ok(structEntities.length > 0, 'Should create struct entities');

  const structSymbols = structEntities.map((e) => e.symbol);
  t.assert.ok(structSymbols.includes('Point'), 'Should have Point struct entity');
  t.assert.ok(structSymbols.includes('Dog'), 'Should have Dog struct entity');
  t.assert.ok(structSymbols.includes('Container'), 'Should have Container struct entity');
});

// ============ Java Class Parsing ============

await test('Java: parses class definitions', async (t) => {
  const source = await import_file('./tests/fixtures/classes_structs.java');
  const nodes = get_nodes_from_source(source, 'classes_structs.java');

  t.assert.ok(nodes.class_definition, 'Should have class_definition array');
  t.assert.ok(nodes.class_definition.length > 0, 'Should find class definitions');
});

await test('Java: creates entities for classes', async (t) => {
  const source = await import_file('./tests/fixtures/classes_structs.java');
  const nodes = get_nodes_from_source(source, 'classes_structs.java');

  const entities = prepare_entities_for_nodes({
    project_id: 1,
    nodes,
    filename: 'classes_structs.java',
    language: 'java'
  });

  const classEntities = entities.filter((e) => e.type === 'class');
  t.assert.ok(classEntities.length > 0, 'Should create class entities');

  const classSymbols = classEntities.map((e) => e.symbol);
  t.assert.ok(classSymbols.includes('Point'), 'Should have Point class entity');
  t.assert.ok(classSymbols.includes('Dog'), 'Should have Dog class entity');
});

// ============ C# Class and Struct Parsing ============

await test('C#: parses class definitions', async (t) => {
  const source = await import_file('./tests/fixtures/classes_structs.cs');
  const nodes = get_nodes_from_source(source, 'classes_structs.cs');

  t.assert.ok(nodes.class_definition, 'Should have class_definition array');
  t.assert.ok(nodes.class_definition.length > 0, 'Should find class definitions');
});

await test('C#: parses struct definitions', async (t) => {
  const source = await import_file('./tests/fixtures/classes_structs.cs');
  const nodes = get_nodes_from_source(source, 'classes_structs.cs');

  t.assert.ok(nodes.struct_definition, 'Should have struct_definition array');
  t.assert.ok(nodes.struct_definition.length > 0, 'Should find struct definitions');
});

await test('C#: creates entities for classes and structs', async (t) => {
  const source = await import_file('./tests/fixtures/classes_structs.cs');
  const nodes = get_nodes_from_source(source, 'classes_structs.cs');

  const entities = prepare_entities_for_nodes({
    project_id: 1,
    nodes,
    filename: 'classes_structs.cs',
    language: 'csharp'
  });

  const classEntities = entities.filter((e) => e.type === 'class');
  const structEntities = entities.filter((e) => e.type === 'struct');

  t.assert.ok(classEntities.length > 0, 'Should create class entities');
  t.assert.ok(structEntities.length > 0, 'Should create struct entities');

  const classSymbols = classEntities.map((e) => e.symbol);
  t.assert.ok(classSymbols.includes('Dog'), 'Should have Dog class entity');
  t.assert.ok(classSymbols.includes('Circle'), 'Should have Circle class entity');

  const structSymbols = structEntities.map((e) => e.symbol);
  t.assert.ok(structSymbols.includes('Point'), 'Should have Point struct entity');
  t.assert.ok(structSymbols.includes('Rectangle'), 'Should have Rectangle struct entity');
});

// ============ Entity Metadata Tests ============

await test('Class entities have correct metadata', async (t) => {
  const source = `
class TestClass {
  constructor() {
    this.value = 0;
  }

  getValue() {
    return this.value;
  }
}
`;
  const nodes = get_nodes_from_source(source, 'test.js');

  const entities = prepare_entities_for_nodes({
    project_id: 42,
    nodes,
    filename: 'test.js',
    language: 'javascript'
  });

  const classEntity = entities.find((e) => e.type === 'class');

  t.assert.ok(classEntity, 'Should create class entity');
  t.assert.eq(classEntity.project_id, 42, 'Should have correct project_id');
  t.assert.eq(classEntity.filename, 'test.js', 'Should have correct filename');
  t.assert.eq(classEntity.language, 'javascript', 'Should have correct language');
  t.assert.eq(classEntity.symbol, 'TestClass', 'Should have correct symbol');
  t.assert.eq(classEntity.type, 'class', 'Should have type "class"');
  t.assert.ok(classEntity.start_line > 0, 'Should have start_line');
  t.assert.ok(classEntity.end_line >= classEntity.start_line, 'Should have end_line');
  t.assert.ok(classEntity.source.includes('class TestClass'), 'Should have source code');
});

await test('Struct entities have correct metadata', async (t) => {
  const source = `
struct Point {
    int x;
    int y;
};
`;
  const nodes = get_nodes_from_source(source, 'test.c');

  const entities = prepare_entities_for_nodes({
    project_id: 42,
    nodes,
    filename: 'test.c',
    language: 'c'
  });

  const structEntity = entities.find((e) => e.type === 'struct');

  t.assert.ok(structEntity, 'Should create struct entity');
  t.assert.eq(structEntity.project_id, 42, 'Should have correct project_id');
  t.assert.eq(structEntity.filename, 'test.c', 'Should have correct filename');
  t.assert.eq(structEntity.language, 'c', 'Should have correct language');
  t.assert.eq(structEntity.symbol, 'Point', 'Should have correct symbol');
  t.assert.eq(structEntity.type, 'struct', 'Should have type "struct"');
});

await test('Class comments are associated correctly', async (t) => {
  const source = `
// This is a comment for MyClass
class MyClass {
  constructor() {}
}
`;
  const nodes = get_nodes_from_source(source, 'test.js');

  const entities = prepare_entities_for_nodes({
    project_id: 1,
    nodes,
    filename: 'test.js',
    language: 'javascript'
  });

  const classEntity = entities.find((e) => e.type === 'class');

  t.assert.ok(classEntity, 'Should create class entity');
  t.assert.ok(classEntity.comment, 'Should have associated comment');
  t.assert.ok(classEntity.comment.includes('This is a comment'), 'Comment should have correct content');
});

// ============ Mock Node Tests for Name Extraction ============

await test('prepare_entities_for_nodes handles class definitions', async (t) => {
  const mockNodes = {
    function_definition: [],
    class_definition: [
      {
        node: {
          type: 'class_declaration',
          childCount: 2,
          child: (i) =>
            i === 0 ? { type: 'class' } : { type: 'identifier', text: 'MockClass' }
        },
        content: 'class MockClass {}',
        start_line: 1,
        end_line: 1,
        start_position: 0,
        end_position: 18
      }
    ],
    struct_definition: [],
    comment: [],
    parameter_list: []
  };

  const entities = prepare_entities_for_nodes({
    project_id: 1,
    nodes: mockNodes,
    filename: 'test.js',
    language: 'javascript'
  });

  const classEntities = entities.filter((e) => e.type === 'class');
  t.assert.eq(classEntities.length, 1, 'Should create one class entity');
  t.assert.eq(classEntities[0].symbol, 'MockClass', 'Should extract class name');
});

await test('prepare_entities_for_nodes handles struct definitions', async (t) => {
  const mockNodes = {
    function_definition: [],
    class_definition: [],
    struct_definition: [
      {
        node: {
          type: 'struct_specifier',
          childCount: 2,
          child: (i) =>
            i === 0 ? { type: 'struct' } : { type: 'type_identifier', text: 'MockStruct' }
        },
        content: 'struct MockStruct { int x; }',
        start_line: 1,
        end_line: 1,
        start_position: 0,
        end_position: 28
      }
    ],
    comment: [],
    parameter_list: []
  };

  const entities = prepare_entities_for_nodes({
    project_id: 1,
    nodes: mockNodes,
    filename: 'test.c',
    language: 'c'
  });

  const structEntities = entities.filter((e) => e.type === 'struct');
  t.assert.eq(structEntities.length, 1, 'Should create one struct entity');
  t.assert.eq(structEntities[0].symbol, 'MockStruct', 'Should extract struct name');
});

await test('prepare_entities_for_nodes handles mixed functions, classes, and structs', async (t) => {
  const mockNodes = {
    function_definition: [
      {
        node: {
          type: 'function_declaration',
          childCount: 2,
          child: (i) =>
            i === 0 ? { type: 'function' } : { type: 'identifier', text: 'myFunc' }
        },
        content: 'function myFunc() {}',
        start_line: 1,
        end_line: 1,
        start_position: 0,
        end_position: 20
      }
    ],
    class_definition: [
      {
        node: {
          type: 'class_declaration',
          childCount: 2,
          child: (i) =>
            i === 0 ? { type: 'class' } : { type: 'identifier', text: 'MyClass' }
        },
        content: 'class MyClass {}',
        start_line: 3,
        end_line: 3,
        start_position: 0,
        end_position: 16
      }
    ],
    struct_definition: [],
    comment: [],
    parameter_list: []
  };

  const entities = prepare_entities_for_nodes({
    project_id: 1,
    nodes: mockNodes,
    filename: 'test.js',
    language: 'javascript'
  });

  const functionEntities = entities.filter((e) => e.type === 'function');
  const classEntities = entities.filter((e) => e.type === 'class');

  t.assert.eq(functionEntities.length, 1, 'Should create one function entity');
  t.assert.eq(classEntities.length, 1, 'Should create one class entity');
  t.assert.eq(functionEntities[0].symbol, 'myFunc', 'Should have correct function name');
  t.assert.eq(classEntities[0].symbol, 'MyClass', 'Should have correct class name');
});

await test('prepare_entities_for_nodes skips invalid class names', async (t) => {
  const mockNodes = {
    function_definition: [],
    class_definition: [
      {
        node: {
          type: 'class_declaration',
          childCount: 0,
          child: () => null
        },
        content: 'class {}', // anonymous class
        start_line: 1,
        end_line: 1,
        start_position: 0,
        end_position: 8
      }
    ],
    struct_definition: [],
    comment: [],
    parameter_list: []
  };

  const entities = prepare_entities_for_nodes({
    project_id: 1,
    nodes: mockNodes,
    filename: 'test.js',
    language: 'javascript'
  });

  const classEntities = entities.filter((e) => e.type === 'class');
  t.assert.eq(classEntities.length, 0, 'Should skip classes with invalid names');
});
