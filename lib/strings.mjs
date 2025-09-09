'use strict';

// String representations for tool calls.
const tools = {
  function_list: {
    name: 'function_list',
    description: `Lists all functions, filtered by project.

    The returned JSON will be in the following format:

    {
      "$schema": "http://json-schema.org/draft-04/schema#",
      "description": "function",
      "type": "object",
      "properties": {
        "id": {
          "type": "number",
          "description": "The unique identifier of the entity"
        },
        "project": {
          "type": "string",
          "minLength": 1,
          "description": "The project name"
        },
        "language": {
          "type": "string",
          "minLength": 1,
          "description": "The language of the function"
        },
        "symbol": {
          "type": "string",
          "minLength": 1,
          "description": "The symbol name of the function"
        },
        "type": {
          "type": "string",
          "minLength": 1,
          "description": "The type of the symbol, function or class"
        },
        "filename": {
          "type": "string",
          "minLength": 1,
          "description": "The filename the function is defined in"
        },
        "start_line": {
          "type": "number"
        },
        "end_line": {
          "type": "number"
        },
        "parameters": {
          "type": "string",
          "minLength": 1
        },
        "comment": {
          "type": "string",
          "description": "The comment for the entity"
        },
        "returns": {
          "type": "string",
          "minLength": 1,
          "description": "The return type of the function"
        },
        "created_at": {
          "type": "string",
          "minLength": 1
        },
        "updated_at": {
          "type": "string",
          "minLength": 1
        }
      },
      "required": [
        "id",
        "project",
        "language",
        "symbol",
        "type",
        "filename",
        "start_line",
        "end_line",
        "parameters",
        "returns",
        "created_at"
      ]
    }`
  },
  function_search: {
    name: `function_search`,
    description: `Searches for a function by name.  Partial matches will be returned, and the
    search is case-insensitive.  Results are sorted by relevance and then by name.

    The returned JSON will be in the following format:

    {
      "$schema": "http://json-schema.org/draft-04/schema#",
      "description": "function",
      "type": "object",
      "properties": {
        "id": {
          "type": "number",
          "description": "The unique identifier of the entity"
        },
        "project": {
          "type": "string",
          "minLength": 1,
          "description": "The project name"
        },
        "language": {
          "type": "string",
          "minLength": 1,
          "description": "The language of the function"
        },
        "symbol": {
          "type": "string",
          "minLength": 1,
          "description": "The symbol name of the function"
        },
        "type": {
          "type": "string",
          "minLength": 1,
          "description": "The type of the symbol, function or class"
        },
        "filename": {
          "type": "string",
          "minLength": 1,
          "description": "The filename the function is defined in"
        },
        "start_line": {
          "type": "number"
        },
        "end_line": {
          "type": "number"
        },
        "parameters": {
          "type": "string",
          "minLength": 1
        },
        "comment": {
          "type": "string",
          "description": "The comment for the entity"
        },
        "returns": {
          "type": "string",
          "minLength": 1,
          "description": "The return type of the function"
        },
        "created_at": {
          "type": "string",
          "minLength": 1
        },
        "updated_at": {
          "type": "string",
          "minLength": 1
        }
      },
      "required": [
        "id",
        "project",
        "language",
        "symbol",
        "type",
        "filename",
        "start_line",
        "end_line",
        "parameters",
        "returns",
        "created_at"
      ]
    }`
  },
  function_retrieve: {
    name: 'function_retrieve',
    description: `Retrieves an function from the code knowledge graph.
     This tool is useful for retrieving functions from the code knowledge graph.
     It takes a symbol name (function name) as input and returns the function
     information.  The  entity information includes the function's name (symbol), type, location
     in the code, and the source of the function.  The function information is returned
     as a JSON object.  If more than one function matches the input, the tool will return
     all matching functions.  You can also specify the project to only return functions
     from that project, as well as the type of symbol to retrieve (function name).

     The returned JSON will be in the following format:

     {
       "$schema": "http://json-schema.org/draft-04/schema#",
       "description": "function",
       "type": "object",
       "properties": {
         "id": {
           "type": "number",
           "description": "The unique identifier of the entity"
         },
         "project": {
           "type": "string",
           "minLength": 1,
           "description": "The project name"
         },
         "language": {
           "type": "string",
           "minLength": 1,
           "description": "The language of the function"
         },
         "symbol": {
           "type": "string",
           "minLength": 1,
           "description": "The symbol name of the function"
         },
         "type": {
           "type": "string",
           "minLength": 1,
           "description": "The type of the symbol, function or class"
         },
         "filename": {
           "type": "string",
           "minLength": 1,
           "description": "The filename the function is defined in"
         },
         "start_line": {
           "type": "number"
         },
         "end_line": {
           "type": "number"
         },
         "parameters": {
           "type": "string",
           "minLength": 1
         },
         "comment": {
           "type": "string",
           "description": "The comment for the entity"
         },
         "returns": {
           "type": "string",
           "minLength": 1,
           "description": "The return type of the function"
         },
         "source": {
           "type": "string",
           "description": "The source code of the function"
         },
         "created_at": {
           "type": "string",
           "minLength": 1
         },
         "updated_at": {
           "type": "string",
           "minLength": 1
         }
       },
       "required": [
         "id",
         "project",
         "language",
         "symbol",
         "type",
         "filename",
         "start_line",
         "end_line",
         "created_at"
       ]
     }
    `
  },
  generate_call_tree: {
    name: 'generate_call_tree',
    description: `Generates a call tree of code through all known projects, with the
     root of the tree being the specified symbol (always a function).  The resulting
     data structure will be a JSON object representing the call tree.  Each object of
     the tree will have a node containing the project, language symbol, filename,
     start_line, end_line, and child nodes representing the called symbols (functions).

     The returned JSON will be of the following format:

     {
       "$schema": "http://json-schema.org/draft-04/schema#",
       "description": "A call tree representing function calls made from a function.  The node is the entity, each entry in children represents an additional call tree.  If there is a loop, then loop is set to true and no children are appended.",
       "id": "call_tree",
       "type": "object",
       "properties": {
         "node": {
           "type": "object",
           "properties": {
             "id": {
               "type": "number",
               "description": "The unique identifier of the node"
             },
             "project": {
               "type": "string",
               "minLength": 1,
               "description": "The project name"
             },
             "language": {
               "type": "string",
               "minLength": 1,
               "description": "The language of the function"
             },
             "symbol": {
               "type": "string",
               "minLength": 1,
               "description": "The symbol name of the function"
             },
             "type": {
               "type": "string",
               "minLength": 1,
               "description": "The type of the symbol, function or class"
             },
             "filename": {
               "type": "string",
               "minLength": 1,
               "description": "The filename the function is defined in"
             },
             "start_line": {
               "type": "number"
             },
             "end_line": {
               "type": "number"
             },
             "parameters": {
               "type": "string",
               "minLength": 1
             },
             "comment": {
               "type": "string",
               "description": "The comment for the entity"
             },
             "returns": {
               "type": "string",
               "minLength": 1,
               "description": "The return type of the function"
             },
             "created_at": {
               "type": "string",
               "minLength": 1
             },
             "updated_at": {
               "type": "string",
               "minLength": 1
             }
           },
           "required": [
             "id",
             "project",
             "language",
             "symbol",
             "type",
             "filename",
             "start_line",
             "end_line",
             "created_at"
           ]
         },
         "loop": {
           "type": "boolean",
           "description": "Whether this symbol having children would cause an infinite loop"
         },
         "children": {
           "type": "array",
           "items": {
             "$ref": "#"
           }
         }
       },
       "required": [
         "node",
         "children"
       ]
     }`
  },
  function_callees: {
    name: 'function_callees',
    description: `Retrieves one or more functions that are called by the function passed in.

     The returned JSON will be in the following format:

     {
       "$schema": "http://json-schema.org/draft-04/schema#",
       "description": "function",
       "type": "object",
       "properties": {
         "id": {
           "type": "number",
           "description": "The unique identifier of the entity"
         },
         "project": {
           "type": "string",
           "minLength": 1,
           "description": "The project name"
         },
         "language": {
           "type": "string",
           "minLength": 1,
           "description": "The language of the function"
         },
         "symbol": {
           "type": "string",
           "minLength": 1,
           "description": "The symbol name of the function"
         },
         "type": {
           "type": "string",
           "minLength": 1,
           "description": "The type of the symbol, function or class"
         },
         "filename": {
           "type": "string",
           "minLength": 1,
           "description": "The filename the function is defined in"
         },
         "start_line": {
           "type": "number"
         },
         "end_line": {
           "type": "number"
         },
         "parameters": {
           "type": "string",
           "minLength": 1
         },
         "comment": {
           "type": "string",
           "description": "The comment for the entity"
         },
         "returns": {
           "type": "string",
           "minLength": 1,
           "description": "The return type of the function"
         },
         "created_at": {
           "type": "string",
           "minLength": 1
         },
         "updated_at": {
           "type": "string",
           "minLength": 1
         }
       },
       "required": [
         "id",
         "project",
         "language",
         "symbol",
         "type",
         "filename",
         "start_line",
         "end_line",
         "parameters",
         "returns",
         "created_at"
       ]
     }`
  },
  function_callers: {
    name: 'function_callers',
    description: `Retrieves one or more functions that are called by the function passed in.

     The returned JSON will be in the following format:

     {
       "$schema": "http://json-schema.org/draft-04/schema#",
       "description": "function",
       "type": "object",
       "properties": {
         "id": {
           "type": "number",
           "description": "The unique identifier of the entity"
         },
         "project": {
           "type": "string",
           "minLength": 1,
           "description": "The project name"
         },
         "language": {
           "type": "string",
           "minLength": 1,
           "description": "The language of the function"
         },
         "symbol": {
           "type": "string",
           "minLength": 1,
           "description": "The symbol name of the function"
         },
         "type": {
           "type": "string",
           "minLength": 1,
           "description": "The type of the symbol, function or class"
         },
         "filename": {
           "type": "string",
           "minLength": 1,
           "description": "The filename the function is defined in"
         },
         "start_line": {
           "type": "number"
         },
         "end_line": {
           "type": "number"
         },
         "parameters": {
           "type": "string",
           "minLength": 1
         },
         "comment": {
           "type": "string",
           "description": "The comment for the entity"
         },
         "returns": {
           "type": "string",
           "minLength": 1,
           "description": "The return type of the function"
         },
         "created_at": {
           "type": "string",
           "minLength": 1
         },
         "updated_at": {
           "type": "string",
           "minLength": 1
         }
       },
       "required": [
         "id",
         "project",
         "language",
         "symbol",
         "type",
         "filename",
         "start_line",
         "end_line",
         "parameters",
         "returns",
         "created_at"
       ]
     }`
  },
  project_list: {
    name: 'project_list',
    description: `Lists projects available to the user.  A project name can be used as an argument
    to retrieve functions and information about source code.

     The returned JSON will be in the following format:

     {
       "$schema": "http://json-schema.org/draft-04/schema#",
       "description": "Code Projects",
       "type": "object",
       "properties": {
         "id": {
           "type": "number",
           "description": "Unique identifier for the project"
         },
         "name": {
           "type": "string",
           "minLength": 1,
           "description": "Name of the project"
         },
         "path": {
           "type": "string",
           "minLength": 1,
           "description": "Path to the project"
         },
         "created_at": {
           "type": "string",
           "minLength": 1,
           "description": "Date and time when the project was created"
         },
         "updated_at": {
           "type": "string",
           "minLength": 1,
           "description": "Date and time when the project was last updated"
         },
         "file_count": {
           "type": "number",
           "description": "Number of files in the project"
         },
         "entity_count": {
           "type": "number",
           "description": "Number of entities in the project"
         }
       },
       "required": [
         "id",
         "name",
         "path",
         "created_at",
         "updated_at",
         "file_count",
         "entity_count"
       ]
     }`
  },
  project_info: {
    name: 'project_info',
    description: `Returns information about a project.`,
    parameters: {
      id: {
        type: 'string',
        description: 'ID of the project'
      }
    },
    response: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'ID of the project'
        },
        name: {
          type: 'string',
          description: 'Name of the project'
        },
        path: {
          type: 'string',
          description: 'Path of the project'
        },
        created_at: {
          type: 'string',
          description: 'Date and time the project was created'
        },
        updated_at: {
          type: 'string',
          description: 'Date and time the project was last updated'
        },
        file_count: {
          type: 'number',
          description: 'Number of files in the project'
        },
        entity_count: {
          type: 'number',
          description: 'Number of entities in the project'
        }
      }
    },
    required: ['id']
  },
  read_sourcecode: {
    name: 'read_sourcecode',
    description: `Returns a copy of the source code for a \`filename\` in a project.  This
     tool can return both any part of a file, including the whole file, or when given
     \`start_line\` and \`end_line\` a \`function\` or \`comment\` can be retrieved.

     If \`start_line\` is provided, the source code will be returned from that line to the
     end of the file, otherwise the \`start_line\` will be the first line of the file if
     not provided.  If you wish to start at the first line of the file, you can provide
     \`start_line: 1\`.

     If \`end_line\` is provided, the source code will be returned from the \`start_line\`
     to the \`end_line\`, otherwise the \`end_line\` will be last line of the file if not
     provided.  If you wish to retrieve the the end of the file, you can also provide
     \`end_line\: -1\`, which is the default behavior if not provided.

     If \`start_position\` is provided, the source code will be returned from that
     position in the line.  If it is not provided, it will default to \`0\` or the
     start of the line.

     If \`end_position\` is provided, the source code will be returned from the
     \`start_position\` (or \`0\` if not provided) to the \`end_position\`.  If no
     \`end_position\` is provided, it will default to \`-1\`, which is the end of
     the line.`
  }
};

export { tools };
