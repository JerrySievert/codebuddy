import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'node',
  args: ['/Users/jerry/work/mcp/build-knowledge-graph/index.mjs']
});

const client = new Client({
  name: 'mcp-test-client',
  version: '1.0.0'
});

await client.connect(transport);

const tools = await client.listTools();
//console.log(`tools: ${JSON.stringify(tools, null, 2)}`);

// Call a tool

let result = await client.callTool({
  name: 'project_list',
  arguments: {}
});

console.log(JSON.stringify(result, null, 2));
//console.log(JSON.stringify(JSON.parse(result.content[0].text)));

result = await client.callTool({
  name: 'function_search',
  arguments: {
    name: 'datum',
    project: 'pljs'
  }
});

console.log(result);

client.close();
transport.close();
