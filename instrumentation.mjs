'use strict';

/**
 * @fileoverview OpenTelemetry instrumentation bootstrap.
 * This file must be loaded before the main application using --import flag.
 * Usage: node --import ./instrumentation.mjs server.mjs --tracing-endpoint http://localhost:4318/v1/traces
 * @module instrumentation
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION
} from '@opentelemetry/semantic-conventions';
import { HapiInstrumentation } from '@opentelemetry/instrumentation-hapi';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';

// Parse --tracing-endpoint from command line arguments
const args = process.argv.slice(2);
let tracing_endpoint = null;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg.startsWith('--tracing-endpoint=')) {
    tracing_endpoint = arg.split('=')[1];
    break;
  } else if (arg === '--tracing-endpoint' && args[i + 1]) {
    tracing_endpoint = args[i + 1];
    break;
  }
}

if (tracing_endpoint) {
  // Configure the OTLP exporter
  const trace_exporter = new OTLPTraceExporter({
    url: tracing_endpoint
  });

  // Create the SDK with comprehensive instrumentation
  const sdk = new NodeSDK({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: 'codebuddy',
      [ATTR_SERVICE_VERSION]: process.env.npm_package_version || '1.0.0'
    }),
    traceExporter: trace_exporter,
    instrumentations: [
      // Auto-instrumentations for common modules
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-http': {
          enabled: true
        },
        '@opentelemetry/instrumentation-dns': {
          enabled: true
        },
        '@opentelemetry/instrumentation-net': {
          enabled: true
        },
        '@opentelemetry/instrumentation-fs': {
          enabled: true
        }
      }),
      // Explicit Hapi instrumentation
      new HapiInstrumentation(),
      // Explicit Postgres instrumentation
      new PgInstrumentation({
        enhancedDatabaseReporting: true
      })
    ]
  });

  // Start the SDK synchronously before any other modules load
  sdk.start();

  console.log(`OpenTelemetry tracing enabled, exporting to: ${tracing_endpoint}`);

  // Graceful shutdown
  const shutdown = async () => {
    try {
      await sdk.shutdown();
      console.log('OpenTelemetry SDK shut down successfully');
    } catch (err) {
      console.error('Error shutting down OpenTelemetry SDK:', err);
    }
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
