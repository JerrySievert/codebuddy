'use strict';

import Hapi from '@hapi/hapi';
import Inert from '@hapi/inert';
import Nes from '@hapi/nes';
import Path from 'path';
import { fileURLToPath } from 'url';
import { routes } from './lib/api/v1/index.mjs';
import { mcp_routes } from './lib/mcp-http.mjs';
import { set_web_socket_server } from './lib/jobs.mjs';
import { is_read_only } from './lib/config.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = Path.dirname(__filename);

if (is_read_only()) {
  console.log('Starting server in read-only mode');
}

const server = Hapi.server({
  port: process.env.PORT || 3000,
  host: process.env.HOST || 'localhost'
});

const init = async () => {
  // Register Inert plugin for static file serving
  await server.register(Inert);

  // Register Nes plugin for WebSocket support
  await server.register(Nes);

  // Create subscription for job updates
  // Clients can subscribe to /jobs/{id} to receive real-time updates
  server.subscription('/jobs/{id}', {
    filter: (path, message, options) => {
      // Only send messages matching the subscribed job ID
      return true;
    },
    onSubscribe: (socket, path, params) => {
      console.log(`[WS] Client subscribed to ${path}`);
    },
    onUnsubscribe: (socket, path, params) => {
      console.log(`[WS] Client unsubscribed from ${path}`);
    }
  });

  // Create subscription for job queue stats
  server.subscription('/jobs/stats');

  // Store server reference for broadcasting from jobs.mjs
  set_web_socket_server(server);

  // Register MCP HTTP transport routes
  server.route(mcp_routes);

  // Register all API routes
  server.route(routes);

  // Serve static files from public directory
  server.route({
    method: 'GET',
    path: '/{param*}',
    handler: {
      directory: {
        path: Path.join(__dirname, 'public'),
        index: ['index.html']
      }
    }
  });

  await server.start();
  console.log(`Server running on ${server.info.uri}`);
  console.log(
    `WebSocket available at ws://${server.info.host}:${server.info.port}`
  );
  console.log(`MCP HTTP transport available at ${server.info.uri}/mcp`);
};

init().catch((err) => {
  console.error(err);
  process.exit(1);
});
