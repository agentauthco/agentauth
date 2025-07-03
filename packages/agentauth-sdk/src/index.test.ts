/*
 * Copyright (c) 2025 AgentAuth
 * SPDX-License-Identifier: MIT
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { verify } from './index';
import {
  generateIdentity,
  signPayload,
  deriveAddress,
  generateId,
} from '@agentauth/core';
import { Buffer } from 'buffer';

// Mock the crypto-utils module to control its output in tests
vi.mock('@agentauth/core', async () => {
  const originalModule = await vi.importActual('@agentauth/core');
  return {
    ...originalModule,
    // We explicitly use the real implementations of all functions
  };
});

describe('AgentAuth SDK: verify', () => {
  let identity: { agentauth_token: string; agentauth_address: string; agentauth_id: string };

  beforeAll(() => {
    // Generate a single identity for all tests in this suite
    identity = generateIdentity('secp256k1');
  });

  const createMockRequest = ({
    agentauth_token = identity.agentauth_token,
    payloadData = { message: 'hello world' },
    timestamp = new Date().toISOString(),
    tamperSignature = false,
    omitHeader,
    useWrongAddress = false,
  }: {
    agentauth_token?: string;
    payloadData?: object;
    timestamp?: string;
    tamperSignature?: boolean;
    omitHeader?: 'ADDRESS' | 'PAYLOAD' | 'SIGNATURE';
    useWrongAddress?: boolean;
  } = {}) => {
    const payload = { ...payloadData, timestamp };
    const signature = signPayload(payload, agentauth_token);
    
    let finalSignature = signature;
    if (tamperSignature) {
      // This creates a tampered hex signature that is cryptographically invalid.
      finalSignature = '0x' + (signature.slice(2, 3) === 'a' ? 'b' : 'a') + signature.slice(3);
    }

    // Derive the correct address from the token, or use a wrong one for testing
    let address = deriveAddress(agentauth_token);
    if (useWrongAddress) {
      address = '0x1234567890123456789012345678901234567890';
    }

    const headers: Record<string, string> = {
      'x-agentauth-address': address,
      'x-agentauth-payload': Buffer.from(JSON.stringify(payload)).toString('base64'),
      'x-agentauth-signature': finalSignature,
    };
    
    if (omitHeader) {
        const headerKey = omitHeader === 'ADDRESS' ? 'x-agentauth-address' :
                         omitHeader === 'PAYLOAD' ? 'x-agentauth-payload' :
                         'x-agentauth-signature';
        delete headers[headerKey];
    }

    return { headers };
  };

  it('should successfully verify a valid request and return valid result with ID', () => {
    const request = createMockRequest({});
    const result = verify(request);
    
    expect(result.valid).toBe(true);
    expect(result.agentauth_id).toBe(identity.agentauth_id);
  });

  it('should return invalid if the ADDRESS header is missing', () => {
    const request = createMockRequest({ omitHeader: 'ADDRESS' });
    const result = verify(request);
    
    expect(result.valid).toBe(false);
    expect(result.agentauth_id).toBeUndefined();
  });
  
  it('should return invalid if the PAYLOAD header is missing', () => {
    const request = createMockRequest({ omitHeader: 'PAYLOAD' });
    const result = verify(request);
    
    expect(result.valid).toBe(false);
    expect(result.agentauth_id).toBeUndefined();
  });

  it('should return invalid if the SIGNATURE header is missing', () => {
    const request = createMockRequest({ omitHeader: 'SIGNATURE' });
    const result = verify(request);
    
    expect(result.valid).toBe(false);
    expect(result.agentauth_id).toBeUndefined();
  });

  it('should return invalid for an invalid signature', () => {
    const request = createMockRequest({ tamperSignature: true });
    const result = verify(request);
    
    expect(result.valid).toBe(false);
    expect(result.agentauth_id).toBeUndefined();
  });

  it('should return invalid for a wrong address', () => {
    const request = createMockRequest({ useWrongAddress: true });
    const result = verify(request);
    
    expect(result.valid).toBe(false);
    expect(result.agentauth_id).toBeUndefined();
  });

  it('should return invalid for a request with an expired timestamp', () => {
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const request = createMockRequest({ timestamp: twoMinutesAgo });
    const result = verify(request);
    
    expect(result.valid).toBe(false);
    expect(result.agentauth_id).toBeUndefined();
  });

  it('should return invalid for a future timestamp beyond acceptable window', () => {
    const twoMinutesFromNow = new Date(Date.now() + 2 * 60 * 1000).toISOString();
    const request = createMockRequest({ timestamp: twoMinutesFromNow });
    const result = verify(request);
    
    expect(result.valid).toBe(false);
    expect(result.agentauth_id).toBeUndefined();
  });

  it('should handle different private key formats consistently', () => {
    const rawKey = '2e6bea4b9180e920e209973473ce4b6d362e564e869917907a00bb1a50dddfca';
    const aaKey = `aa-${rawKey}`;
    const evmKey = `0x${rawKey}`;

    const request1 = createMockRequest({ agentauth_token: rawKey });
    const request2 = createMockRequest({ agentauth_token: aaKey });
    const request3 = createMockRequest({ agentauth_token: evmKey });

    const result1 = verify(request1);
    const result2 = verify(request2);
    const result3 = verify(request3);

    // All should be valid and have the same ID (deterministic from same address)
    expect(result1.valid).toBe(true);
    expect(result2.valid).toBe(true);
    expect(result3.valid).toBe(true);
    
    expect(result1.agentauth_id).toBe(result2.agentauth_id);
    expect(result2.agentauth_id).toBe(result3.agentauth_id);
  });

  it('should respect custom freshness window', () => {
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
    const request = createMockRequest({ timestamp: oneMinuteAgo });
    
    // With default 60s window, this should be invalid (exactly at the edge)
    const resultDefault = verify(request);
    expect(resultDefault.valid).toBe(false);
    
    // With 120s window, this should be valid
    const resultExtended = verify(request, { freshness: 120 * 1000 });
    expect(resultExtended.valid).toBe(true);
    expect(resultExtended.agentauth_id).toBeDefined();
  });

  it('should handle malformed payload gracefully', () => {
    const request = createMockRequest({});
    
    // Manually corrupt the payload
    request.headers['x-agentauth-payload'] = 'invalid-base64-!@#';
    
    const result = verify(request);
    expect(result.valid).toBe(false);
    expect(result.agentauth_id).toBeUndefined();
  });
});