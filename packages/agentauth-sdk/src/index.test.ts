/*
 * Copyright (c) 2025 AgentAuth
 * SPDX-License-Identifier: MIT
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { verify, generateIdentity as sdkGenerateIdentity, deriveFromToken } from './index';
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

    // Derive the correct AgentAuth Address from the AgentAuth Token, or use a wrong one for testing
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

describe('AgentAuth SDK: generateIdentity', () => {
  it('should generate a new identity with AgentAuth Token, ID, and Address', () => {
    const identity = sdkGenerateIdentity();
    
    expect(identity).toHaveProperty('agentauth_token');
    expect(identity).toHaveProperty('agentauth_id');
    expect(identity).toHaveProperty('agentauth_address');
    
    // AgentAuth Token should be in aa- format
    expect(identity.agentauth_token).toMatch(/^aa-[a-f0-9]{64}$/);
    
    // AgentAuth ID should be a valid UUID
    expect(identity.agentauth_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    
    // AgentAuth Address should be a valid Ethereum address
    expect(identity.agentauth_address).toMatch(/^0x[a-fA-F0-9]{40}$/);
  });

  it('should generate unique identities on each call', () => {
    const identity1 = sdkGenerateIdentity();
    const identity2 = sdkGenerateIdentity();
    
    expect(identity1.agentauth_token).not.toBe(identity2.agentauth_token);
    expect(identity1.agentauth_id).not.toBe(identity2.agentauth_id);
    expect(identity1.agentauth_address).not.toBe(identity2.agentauth_address);
  });

  it('should generate identity that works with verify function', () => {
    const identity = sdkGenerateIdentity();
    
    // Create a request using the generated identity
    const payload = { message: 'test', timestamp: new Date().toISOString() };
    const signature = signPayload(payload, identity.agentauth_token);
    
    const request = {
      headers: {
        'x-agentauth-address': identity.agentauth_address,
        'x-agentauth-payload': Buffer.from(JSON.stringify(payload)).toString('base64'),
        'x-agentauth-signature': signature,
      }
    };
    
    const result = verify(request);
    expect(result.valid).toBe(true);
    expect(result.agentauth_id).toBe(identity.agentauth_id);
  });
});

describe('AgentAuth SDK: deriveFromToken', () => {
  it('should derive AgentAuth ID and Address from an AgentAuth Token', () => {
    const originalIdentity = sdkGenerateIdentity();
    const derived = deriveFromToken(originalIdentity.agentauth_token);
    
    expect(derived).toHaveProperty('agentauth_id');
    expect(derived).toHaveProperty('agentauth_address');
    expect(derived).not.toHaveProperty('agentauth_token');
    
    // Derived values should match original
    expect(derived.agentauth_id).toBe(originalIdentity.agentauth_id);
    expect(derived.agentauth_address).toBe(originalIdentity.agentauth_address);
  });

  it('should handle different token formats', () => {
    const rawKey = '2e6bea4b9180e920e209973473ce4b6d362e564e869917907a00bb1a50dddfca';
    const aaKey = `aa-${rawKey}`;
    const evmKey = `0x${rawKey}`;
    
    const derived1 = deriveFromToken(rawKey);
    const derived2 = deriveFromToken(aaKey);
    const derived3 = deriveFromToken(evmKey);
    
    // All should produce the same results
    expect(derived1.agentauth_id).toBe(derived2.agentauth_id);
    expect(derived2.agentauth_id).toBe(derived3.agentauth_id);
    expect(derived1.agentauth_address).toBe(derived2.agentauth_address);
    expect(derived2.agentauth_address).toBe(derived3.agentauth_address);
  });

  it('should produce consistent results', () => {
    const identity = sdkGenerateIdentity();
    
    const derived1 = deriveFromToken(identity.agentauth_token);
    const derived2 = deriveFromToken(identity.agentauth_token);
    
    // Multiple calls should produce identical results
    expect(derived1.agentauth_id).toBe(derived2.agentauth_id);
    expect(derived1.agentauth_address).toBe(derived2.agentauth_address);
  });

  it('should derive identity that works with verify function', () => {
    const originalIdentity = sdkGenerateIdentity();
    const derived = deriveFromToken(originalIdentity.agentauth_token);
    
    // Create a request using the derived identity
    const payload = { message: 'test', timestamp: new Date().toISOString() };
    const signature = signPayload(payload, originalIdentity.agentauth_token);
    
    const request = {
      headers: {
        'x-agentauth-address': derived.agentauth_address,
        'x-agentauth-payload': Buffer.from(JSON.stringify(payload)).toString('base64'),
        'x-agentauth-signature': signature,
      }
    };
    
    const result = verify(request);
    expect(result.valid).toBe(true);
    expect(result.agentauth_id).toBe(derived.agentauth_id);
  });
});