/*
 * Copyright (c) 2025 AgentCore Labs
 * SPDX-License-Identifier: MIT
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { exec } from 'child_process';
import { promisify } from 'util';
import { generateIdentity, deriveAddress, generateId } from '@agentauth/core';

const execAsync = promisify(exec);

// Path to the built CLI executable
const CLI_PATH = './dist/proxy.js';

describe('AgentAuth MCP CLI', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Store original environment
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('generate command', () => {
    it('should generate a new identity and output AGENTAUTH_ID and AGENTAUTH_TOKEN', async () => {
      const { stdout } = await execAsync(`node ${CLI_PATH} generate`);
      
      // Should output both ID and token lines
      expect(stdout).toContain('AGENTAUTH_ID=');
      expect(stdout).toContain('AGENTAUTH_TOKEN=');
      expect(stdout).toMatch(/AGENTAUTH_ID=[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
      expect(stdout).toMatch(/AGENTAUTH_TOKEN=aa-[0-9a-fA-F]{64}/);
      
      // Extract the token and verify it's valid
      const tokenMatch = stdout.match(/AGENTAUTH_TOKEN=(aa-[0-9a-fA-F]{64})/);
      expect(tokenMatch).toBeTruthy();
      
      const token = tokenMatch![1];
      
      // Should be able to derive address from the token
      expect(() => deriveAddress(token)).not.toThrow();
    });

    it('should generate different tokens on multiple runs', async () => {
      const { stdout: stdout1 } = await execAsync(`node ${CLI_PATH} generate`);
      const { stdout: stdout2 } = await execAsync(`node ${CLI_PATH} generate`);
      
      expect(stdout1.trim()).not.toBe(stdout2.trim());
    });
  });

  describe('derive command', () => {
    let testToken: string;
    let testAddress: string;
    let testId: string;

    beforeEach(() => {
      const identity = generateIdentity();
      testToken = identity.agentauth_token;
      testAddress = identity.agentauth_address;
      testId = identity.agentauth_id;
    });

    it('should derive address and ID from aa-prefixed private key', async () => {
      const { stdout } = await execAsync(`node ${CLI_PATH} derive ${testToken}`);
      
      expect(stdout).toContain(`AGENTAUTH_ID=${testId}`);
      expect(stdout).toContain(`AGENTAUTH_ADDRESS=${testAddress}`);
    });

    it('should derive address and ID from 0x-prefixed private key', async () => {
      const rawKey = testToken.replace('aa-', '');
      const evmKey = `0x${rawKey}`;
      
      const { stdout } = await execAsync(`node ${CLI_PATH} derive ${evmKey}`);
      
      expect(stdout).toContain(`AGENTAUTH_ID=${testId}`);
      expect(stdout).toContain(`AGENTAUTH_ADDRESS=${testAddress}`);
    });

    it('should derive address and ID from raw hex private key', async () => {
      const rawKey = testToken.replace('aa-', '');
      
      const { stdout } = await execAsync(`node ${CLI_PATH} derive ${rawKey}`);
      
      expect(stdout).toContain(`AGENTAUTH_ID=${testId}`);
      expect(stdout).toContain(`AGENTAUTH_ADDRESS=${testAddress}`);
    });

    it('should fail with invalid private key format', async () => {
      try {
        await execAsync(`node ${CLI_PATH} derive invalid-key`);
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe(1);
        expect(error.stderr).toContain('Invalid private key format');
      }
    });

    it('should fail with missing private key argument', async () => {
      try {
        await execAsync(`node ${CLI_PATH} derive`);
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe(1);
        expect(error.stderr).toContain('Not enough non-option arguments');
      }
    });
  });

  describe('connect command', () => {
    it('should fail with missing server URL argument', async () => {
      try {
        await execAsync(`node ${CLI_PATH} connect`);
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe(1);
        expect(error.stderr).toContain('Not enough non-option arguments');
      }
    });

    it('should reject HTTP URLs by default', async () => {
      try {
        await execAsync(`node ${CLI_PATH} connect http://example.com/mcp`, { timeout: 3000 });
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe(1);
        const output = error.stdout || error.stderr || '';
        expect(output).toContain('Non-HTTPS URLs are only allowed for localhost or when --allow-http flag is provided');
      }
    });

    it('should allow HTTP for localhost', async () => {
      try {
        // This should pass validation but fail on connection (which is expected)
        await execAsync(`node ${CLI_PATH} connect http://localhost:8000/mcp`, { timeout: 3000 });
      } catch (error: any) {
        const output = error.stdout || error.stderr || '';
        // Should not contain the HTTPS validation error
        expect(output).not.toContain('Non-HTTPS URLs are only allowed for localhost');
        // Should contain connection-related error instead
        expect(output).toContain('Failed to connect to the remote server');
      }
    });

    it('should allow HTTP when --allow-http flag is provided', async () => {
      try {
        // This should pass validation but fail on connection (which is expected)
        await execAsync(`node ${CLI_PATH} connect http://example.com/mcp --allow-http`, { timeout: 3000 });
      } catch (error: any) {
        const output = error.stdout || error.stderr || '';
        // Should not contain the HTTPS validation error
        expect(output).not.toContain('Non-HTTPS URLs are only allowed for localhost');
        // Should contain connection-related error instead
        expect(output).toContain('Failed to connect to the remote server');
      }
    });

    it('should handle invalid AGENTAUTH_TOKEN format', async () => {
      try {
        // Use invalid token and expect quick failure
        await execAsync(
          `node ${CLI_PATH} connect http://localhost:8000/mcp/sse`,
          {
            timeout: 3000,
            env: {
              ...process.env,
              AGENTAUTH_TOKEN: 'invalid-token',
            },
          }
        );
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        // Should contain error about invalid token format
        const output = error.stdout || error.stderr || '';
        expect(output).toContain('Invalid AGENTAUTH_TOKEN format');
      }
    });
  });

  describe('command line interface', () => {
    it('should show help when no command is provided', async () => {
      try {
        await execAsync(`node ${CLI_PATH}`);
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe(1);
        expect(error.stderr).toContain('You need at least one command');
      }
    });

    it('should show help with --help flag', async () => {
      const { stdout } = await execAsync(`node ${CLI_PATH} --help`);
      
      expect(stdout).toContain('Commands:');
      expect(stdout).toContain('generate');
      expect(stdout).toContain('derive');
      expect(stdout).toContain('connect');
    });

    it('should show version information', async () => {
      const { stdout } = await execAsync(`node ${CLI_PATH} --version`);
      
      // Should output version number
      expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe('integration scenarios', () => {
    it('should work with generated token in derive command', async () => {
      // Generate a token
      const { stdout: generateOutput } = await execAsync(`node ${CLI_PATH} generate`);
      const tokenMatch = generateOutput.match(/AGENTAUTH_TOKEN=(aa-[0-9a-fA-F]{64})/);
      expect(tokenMatch).toBeTruthy();
      
      const token = tokenMatch![1];
      
      // Use that token in derive command
      const { stdout: deriveOutput } = await execAsync(`node ${CLI_PATH} derive ${token}`);
      
      expect(deriveOutput).toContain('AGENTAUTH_ID=');
      expect(deriveOutput).toContain('AGENTAUTH_ADDRESS=0x');
      
      // Extract address and ID
      const idMatch = deriveOutput.match(/AGENTAUTH_ID=([a-f0-9-]+)/);
      const addressMatch = deriveOutput.match(/AGENTAUTH_ADDRESS=(0x[a-fA-F0-9]{40})/);
      
      expect(idMatch).toBeTruthy();
      expect(addressMatch).toBeTruthy();
      
      // Verify they match crypto-utils output
      const expectedAddress = deriveAddress(token);
      const expectedId = generateId(expectedAddress);
      
      expect(addressMatch![1]).toBe(expectedAddress);
      expect(idMatch![1]).toBe(expectedId);
    });
  });
});