'use strict';

import { Server } from '@hapi/hapi';

const server = new Server({
  port: 3000,
  host: 'localhost'
});

server.route({
  method: 'GET',
  path: '/',
  handler: async (request, h) => {
    return 'Hello, World!';
  }
});

server.start();
