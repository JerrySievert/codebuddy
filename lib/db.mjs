'use strict';

import postgres from 'postgres';

import config from '../config.json' with { type: 'json' };

const query = postgres({
  user: config.database.username,
  password: config.database.password,
  database: config.database.database,
  host: config.database.hostname
});

export { query };
