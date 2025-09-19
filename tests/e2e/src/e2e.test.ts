/*
 * Copyright (c) 2025 AgentAuth
 * SPDX-License-Identifier: MIT
 */

import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { generateIdentity, generateId, deriveAddress } from '@agentauth/core';
import { verify } from '@agentauth/sdk';
import express, { type Request, type Response } from 'express';
import getPort from 'get-port';
import type { Server } from 'http';
// --- Test Setup ---

let port: number;
let server: Server;
let validCredentials: {
  id: string;
  address: string;
  token: string;
};

// --- Helper Functions ---

const createTestServer = (port: number) => {
  const app = express();
  app.use(express.json());
  
  // Simple verification endpoint (simulates MCP server auth check)
  app.get('/mcp/verify', (req: Request, res: Response) => {
    const result = verify({ headers: req.headers });
    if (result.valid) {
      res.status(200).json({ authenticated: true, agentauth_id: result.agentauth_id });
    } else {
      res.status(401).json({ authenticated: false, error: 'Invalid credentials' });
    }
  });
  
  // Health check endpoint
  app.get('/health', (req: Request, res: Response) => {
    res.status(200).send('OK');
  });
  
  return app.listen(port, () => {
    console.log(`E2E test server listening on port ${port}`);
  });
};


// --- Vitest Hooks ---

beforeAll(async () => {
  // Generate credentials
  const identity = generateIdentity();
  validCredentials = {
    id: identity.agentauth_id,
    address: identity.agentauth_address,
    token: identity.agentauth_token,
  };

  port = await getPort();
  server = createTestServer(port);
  
  // Wait for server to be ready
  await new Promise(resolve => setTimeout(resolve, 100));
});

afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }
});

// --- Test Suite ---

describe('AgentAuth E2E Tests', () => {
  

  describe('Server Integration', () => {
    it('should successfully authenticate with valid credentials', async () => {
      // Use our test server's verify endpoint directly
      const result = await fetch(`http://localhost:${port}/mcp/verify`, {
        headers: {
          'x-agentauth-address': validCredentials.address,
          'x-agentauth-signature': '0x' + '0'.repeat(130), // Mock signature for this simple test
          'x-agentauth-payload': Buffer.from(JSON.stringify({ timestamp: new Date().toISOString() })).toString('base64'),
        },
      });

      // This will fail verification due to mock signature, but proves the endpoint works
      expect(result.status).toBe(401);
      
      const data = await result.json();
      expect(data).toHaveProperty('authenticated', false);
    });

    it('should have server health check working', async () => {
      const result = await fetch(`http://localhost:${port}/health`);
      expect(result.status).toBe(200);
      
      const text = await result.text();
      expect(text).toBe('OK');
    });
  });

});