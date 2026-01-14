import { get_sourcecode } from './lib/model/sourcecode.mjs';
import { text_at_position, import_file } from './lib/sourcecode.mjs';
import { create_project } from './lib/project.mjs';
import { get_entity } from './lib/model/entity.mjs';
import {
  create_tree,
  get_types_from_tree,
  get_nodes_from_source
} from './lib/functions.mjs';

const source = await import_file('./lib/functions.mjs');
const tree = create_tree(source);
const nodes = get_nodes_from_source(source, './lib/functions.mjs', [
  'call_expression',
  'function_definition',
  'function_declarator',
  'comment',
  'primitive_type',
  'parameter_list',
  'statement_identifier'
]);

//console.log(get_types_from_tree(tree));
console.log(JSON.stringify(nodes.function_definition, null, 2));
console.log(JSON.stringify(nodes.function_declarator, null, 2));
console.log(JSON.stringify(nodes.statement_identifier, null, 2));
//const content = await create_project({
//  name: 'quickjs',
//  path: '/Users/jerry/work/pljs/deps/quickjs'
//});

//await create_project({
//  name: 'columnar',
//  path: '/Users/jerry/work/columnar_am/'
//});
/*
const project_obj = await get_project({ project });

const source_obj = await get_sourcecode({
  project_id: project_obj[0].id,
  path: 'test.c'
});

const source = source_obj[0].source;
//console.log(source);
const extracted = text_at_position({
  source,
  start_line: 11,
  end_line: 16
});

console.log(extracted);
*/
//await create_project({ name: 'project', path });
/*
const source = await get_sourcecode({
  project_id: 3,
  path: 'src/pljs.c'
});

const text = text_at_position({
  source: source[0].source,
  start_line: 1014,
  end_line: 1082,
  start_column: 0,
  end_column: -1
});

console.log(text);
*/
/*
const entities = await get_entity({
  symbol: 'pljs_call_handler',
  type: 'function',
  project_id: 3
});

const content = [];
for (const entity of entities) {
  const sources = await get_sourcecode({
    project_id: entity.project_id,
    filename: entity.filename
  });

  if (sources.length) {
    entity.source = text_at_position({
      source: sources[0].source,
      start_line: entity.start_line,
      end_line: entity.end_line
    });
  }

  content.push({
    type: 'text',
    text: JSON.stringify(entity, null, 2)
  });
}
*/
//console.log(content);
process.exit(0);
