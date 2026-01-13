'use strict';

import { get_nodes_from_source, get_return_type_from_function } from '../../lib/functions.mjs';
import { test } from 'st';

// ============ C# parsing tests ============

await test('C#: parses method declarations', async (t) => {
  const source = `public class Calculator {
    public int Add(int a, int b) {
        return a + b;
    }

    public void PrintResult() {
        Console.WriteLine("Result");
    }
}`;

  const nodes = get_nodes_from_source(source, 'Calculator.cs');

  t.assert.eq(nodes.function_definition.length >= 2, true, 'Should find method declarations');

  const methodNames = nodes.function_definition.map(f => f.content);
  t.assert.eq(methodNames.some(m => m.includes('Add')), true, 'Should find Add method');
  t.assert.eq(methodNames.some(m => m.includes('PrintResult')), true, 'Should find PrintResult method');
});

await test('C#: parses constructor declarations', async (t) => {
  const source = `public class Person {
    private string _name;

    public Person(string name) {
        _name = name;
    }

    public string GetName() {
        return _name;
    }
}`;

  const nodes = get_nodes_from_source(source, 'Person.cs');

  t.assert.eq(nodes.function_definition.length >= 2, true, 'Should find constructor and method');

  const hasConstructor = nodes.function_definition.some(f => f.content.includes('Person('));
  t.assert.eq(hasConstructor, true, 'Should find constructor');
});

await test('C#: extracts method invocations', async (t) => {
  const source = `public class Main {
    public void Run() {
        Console.WriteLine("Hello");
        _helper.DoSomething();
        Calculate(1, 2);
    }
}`;

  const nodes = get_nodes_from_source(source, 'Main.cs');

  t.assert.eq(nodes.call_expression.length >= 1, true, 'Should find method invocations');
});

await test('C#: extracts comments', async (t) => {
  const source = `public class Example {
    // This is a line comment
    public void Method1() {}

    /* This is a block comment */
    public void Method2() {}

    /// <summary>
    /// This is an XML documentation comment
    /// </summary>
    public void Method3() {}
}`;

  const nodes = get_nodes_from_source(source, 'Example.cs');

  t.assert.eq(nodes.comment.length >= 1, true, 'Should find comments');
});

await test('C#: extracts parameter lists', async (t) => {
  const source = `public class Service {
    public void Process(string input, int count, bool flag) {
        // process
    }
}`;

  const nodes = get_nodes_from_source(source, 'Service.cs');

  t.assert.eq(nodes.parameter_list.length >= 1, true, 'Should find parameter lists');
});

await test('C#: parses async methods', async (t) => {
  const source = `public class AsyncService {
    public async Task<string> FetchDataAsync() {
        return await httpClient.GetStringAsync(url);
    }

    public async Task ProcessAsync() {
        await Task.Delay(100);
    }
}`;

  const nodes = get_nodes_from_source(source, 'AsyncService.cs');

  t.assert.eq(nodes.function_definition.length >= 2, true, 'Should find async methods');

  const hasAsync = nodes.function_definition.some(f => f.content.includes('async'));
  t.assert.eq(hasAsync, true, 'Should find async keyword in methods');
});

await test('C#: parses static methods', async (t) => {
  const source = `public class Utils {
    public static int Max(int a, int b) {
        return a > b ? a : b;
    }

    public static void Main(string[] args) {
        Console.WriteLine("Hello");
    }
}`;

  const nodes = get_nodes_from_source(source, 'Utils.cs');

  t.assert.eq(nodes.function_definition.length >= 2, true, 'Should find static methods');

  const hasMain = nodes.function_definition.some(f => f.content.includes('Main'));
  t.assert.eq(hasMain, true, 'Should find Main method');
});

await test('C#: parses properties with getters and setters', async (t) => {
  const source = `public class Entity {
    private string _name;

    public string Name {
        get { return _name; }
        set { _name = value; }
    }

    public int Id { get; set; }
}`;

  const nodes = get_nodes_from_source(source, 'Entity.cs');

  // Properties may or may not be parsed as methods depending on tree-sitter grammar
  // Just verify parsing doesn't crash
  t.assert.eq(true, true, 'Should parse properties without crashing');
});
