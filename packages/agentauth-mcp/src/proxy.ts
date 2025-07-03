#!/usr/bin/env node

/*
 * Copyright (c) 2025 AgentCore Labs
 * SPDX-License-Identifier: MIT
 */

/**
 * AgentAuth MCP Client Proxy
 *
 * A command-line tool to manage AgentAuth credentials and create authenticated
 * connections to an MCP server using address-based identity.
 *
 * Commands:
 *   - generate: Create a new private key token.
 *   - derive <private_key>: Derive address and ID from any private key format.
 *   - connect <server_url>: Start a proxy using AGENTAUTH_TOKEN environment variable.
 */

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  generateIdentity,
  deriveAddress,
  generateId
} from '@agentauth/core';
import { connectToRemoteServer, log, mcpProxy, setDebug, validateServerUrlSecurity } from './lib/utils.js';

async function run() {
  await yargs(hideBin(process.argv))
    .command(
      'generate',
      'Generate a new AgentAuth identity',
      () => {},
      () => {
        const { agentauth_token, agentauth_id } = generateIdentity();
        console.log(`AGENTAUTH_ID=${agentauth_id}`)
        console.log(`AGENTAUTH_TOKEN=${agentauth_token}`);
      }
    )
    .command(
      'derive <private_key>',
      'Derive address and ID from a private key',
      (y) => {
        return y.positional('private_key', {
          describe: 'Private key in any format (aa-, 0x, or raw hex)',
          type: 'string',
        });
      },
      (argv) => {
        const { private_key } = argv;
        if (!private_key) {
          console.error('Error: Missing <private_key> argument.');
          process.exit(1);
        }

        try {
          const agentauth_address = deriveAddress(private_key);
          const agentauth_id = generateId(agentauth_address);

          console.log(`AGENTAUTH_ID=${agentauth_id}`);
          console.log(`AGENTAUTH_ADDRESS=${agentauth_address}`);
        } catch (error) {
          console.error('Error: Invalid private key format.');
          process.exit(1);
        }
      }
    )
    .command(
      'connect <server_url>',
      'Connect to an MCP server using AGENTAUTH_TOKEN environment variable',
      (y) => {
        return y.positional('server_url', {
          describe: 'The URL of the remote MCP server',
          type: 'string',
        }).option('transport', {
          alias: 't',
          describe: 'The transport strategy to use.',
          choices: ['sse-only', 'http-only', 'sse-first', 'http-first'],
          default: 'http-first',
        }).option('allow-http', {
          type: 'boolean',
          description: 'Allow HTTP connections (not recommended for production)',
          default: false,
        });
      },
      async (argv) => {
        const { server_url } = argv;
        if (!server_url) {
          console.error('Error: Missing <server_url> argument.');
          process.exit(1);
        }

        if (argv.debug) {
          setDebug(true);
        }

        // Validate server URL security (HTTPS enforcement)
        validateServerUrlSecurity(server_url, argv['allow-http'] as boolean);

        const transportStrategy = argv.transport as 'sse-only' | 'http-only' | 'sse-first' | 'http-first';

        log(`Connecting to ${server_url} with strategy ${transportStrategy}...`);

        const token = process.env.AGENTAUTH_TOKEN;

        if (token) {
          log('AGENTAUTH_TOKEN found, connecting with authentication.');
          // Validate token format early
          try {
            deriveAddress(token); // This will throw if invalid
          } catch (error) {
            console.error('Error: Invalid AGENTAUTH_TOKEN format.');
            process.exit(1);
          }
        } else {
          log('No AGENTAUTH_TOKEN found, proceeding with an unauthenticated connection.');
        }

        try {
          const remoteTransport = await connectToRemoteServer(server_url, transportStrategy, new Set(), token);
          const localTransport = new StdioServerTransport();

          mcpProxy({
            transportToClient: localTransport,
            transportToServer: remoteTransport,
          });

          await localTransport.start();
          log('Proxy established. Waiting for local client connection...');
        } catch (error) {
          console.error('Failed to connect to the remote server:');
          console.error(error);
          process.exit(1);
        }
      }
    )
    .option('debug', {
      alias: 'd',
      type: 'boolean',
      description: 'Run in debug mode',
      default: false,
    })
    .demandCommand(1, 'You need at least one command before moving on')
    .strict()
    .help().argv;
}

run().catch((error) => {
  console.error('An unexpected error occurred:');
  console.error(error);
  process.exit(1);
});
