'use strict';

import Hapi from '@hapi/hapi';
import Inert from '@hapi/inert';
import Path from 'path';
import { fileURLToPath } from 'url';
import { routes } from './lib/api/v1/index.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = Path.dirname(__filename);

const server = Hapi.server({
  port: 3000,
  host: 'localhost'
});

const init = async () => {
  // Register Inert plugin for static file serving
  await server.register(Inert);

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
};

init().catch((err) => {
  console.error(err);
  process.exit(1);
});
