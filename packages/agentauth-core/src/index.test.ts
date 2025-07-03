/*
 * Copyright (c) 2025 AgentAuth
 * SPDX-License-Identifier: MIT
 */

import { describe, it, expect } from 'vitest';
import {
  generateId,
  generateIdentity,
  signPayload,
  verifySignature,
  parsePrivateKey,
  deriveAddress,
} from './index';

describe('Crypto Utilities', () => {
  const payload = { data: 'hello, world', timestamp: new Date().toISOString() };

  describe('parsePrivateKey', () => {
    it('should parse aa-prefixed private keys', () => {
      const aaKey = 'aa-1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      const parsed = parsePrivateKey(aaKey);
      expect(parsed).toBe('1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef');
    });

    it('should parse 0x-prefixed private keys', () => {
      const evmKey = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      const parsed = parsePrivateKey(evmKey);
      expect(parsed).toBe('1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef');
    });

    it('should parse raw hex private keys', () => {
      const rawKey = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      const parsed = parsePrivateKey(rawKey);
      expect(parsed).toBe('1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef');
    });

    it('should throw error for invalid private key format', () => {
      expect(() => parsePrivateKey('invalid')).toThrow('Invalid private key format');
      expect(() => parsePrivateKey('aa-invalid')).toThrow('Invalid private key format');
      expect(() => parsePrivateKey('0x123')).toThrow('Invalid private key format');
    });
  });

  describe('deriveAddress', () => {
    it('should derive consistent EVM-compatible address from private key', () => {
      // Use a valid secp256k1 private key for testing (generated from secp.utils.randomPrivateKey())
      const privateKey = 'aa-2e6bea4b9180e920e209973473ce4b6d362e564e869917907a00bb1a50dddfca';
      const address1 = deriveAddress(privateKey);
      const address2 = deriveAddress(privateKey);
      
      // Should be deterministic
      expect(address1).toBe(address2);
      
      // Should be valid EVM-compatible address format
      expect(address1).toMatch(/^0x[0-9a-fA-F]{40}$/);
    });

    it('should derive same address regardless of private key format', () => {
      const rawKey = '2e6bea4b9180e920e209973473ce4b6d362e564e869917907a00bb1a50dddfca';
      const aaKey = `aa-${rawKey}`;
      const evmKey = `0x${rawKey}`;
      
      const address1 = deriveAddress(rawKey);
      const address2 = deriveAddress(aaKey);
      const address3 = deriveAddress(evmKey);
      
      expect(address1).toBe(address2);
      expect(address2).toBe(address3);
    });
  });

  describe('generateId', () => {
    it('should generate stable, valid UUIDv5 for a given address', () => {
      const address = '0x742d35Cc6F8BC94E5C6f1b4b54F2e99e07a1B8A5';
      const id1 = generateId(address);
      const id2 = generateId(address);

      // Should be valid UUIDv5 format
      expect(id1).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );

      // Should be deterministic
      expect(id1).toBe(id2);
    });

    it('should generate different IDs for different addresses', () => {
      const address1 = '0x742d35Cc6F8BC94E5C6f1b4b54F2e99e07a1B8A5';
      const address2 = '0x123d35Cc6F8BC94E5C6f1b4b54F2e99e07a1B8A5';
      
      const id1 = generateId(address1);
      const id2 = generateId(address2);
      
      expect(id1).not.toBe(id2);
    });
  });

  describe('generateIdentity', () => {
    it('should generate complete identity', () => {
      const identity = generateIdentity();
      
      // Should have all required fields
      expect(identity).toHaveProperty('agentauth_token');
      expect(identity).toHaveProperty('agentauth_address');
      expect(identity).toHaveProperty('agentauth_id');
      
      // Token should be aa-prefixed
      expect(identity.agentauth_token).toMatch(/^aa-[0-9a-fA-F]{64}$/);
      
      // Address should be valid EVM-compatible format
      expect(identity.agentauth_address).toMatch(/^0x[0-9a-fA-F]{40}$/);
      
      // ID should be valid UUID
      expect(identity.agentauth_id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });

    it('should generate deterministic identity from same private key', () => {
      const privateKey = 'aa-2e6bea4b9180e920e209973473ce4b6d362e564e869917907a00bb1a50dddfca';
      
      const address = deriveAddress(privateKey);
      const id = generateId(address);
      
      // Should be deterministic
      expect(address).toBe(deriveAddress(privateKey));
      expect(id).toBe(generateId(address));
    });

    it('should throw error for unsupported algorithm', () => {
      // @ts-expect-error
      expect(() => generateIdentity('unsupported')).toThrow('Unsupported algorithm: unsupported');
    });
  });

  describe('signPayload and verifySignature', () => {
    it('should correctly sign and verify with address-based verification', () => {
      const identity = generateIdentity();
      const signature = signPayload(payload, identity.agentauth_token);

      // Signature should be valid EVM-standard format
      expect(signature).toMatch(/^0x[0-9a-fA-F]{130}$/);

      // Should verify against the derived address
      const isValid = verifySignature(signature, payload, identity.agentauth_address);
      expect(isValid).toBe(true);
    });

    it('should work with any private key format', () => {
      const rawKey = '2e6bea4b9180e920e209973473ce4b6d362e564e869917907a00bb1a50dddfca';
      const aaKey = `aa-${rawKey}`;
      const evmKey = `0x${rawKey}`;
      
      const expectedAddress = deriveAddress(rawKey);
      
      const sig1 = signPayload(payload, rawKey);
      const sig2 = signPayload(payload, aaKey);
      const sig3 = signPayload(payload, evmKey);
      
      // All should verify against the same address
      expect(verifySignature(sig1, payload, expectedAddress)).toBe(true);
      expect(verifySignature(sig2, payload, expectedAddress)).toBe(true);
      expect(verifySignature(sig3, payload, expectedAddress)).toBe(true);
    });

    it('should fail verification with wrong address', () => {
      const identity = generateIdentity();
      const signature = signPayload(payload, identity.agentauth_token);
      
      const wrongAddress = '0x123d35Cc6F8BC94E5C6f1b4b54F2e99e07a1B8A5';
      const isValid = verifySignature(signature, payload, wrongAddress);
      
      expect(isValid).toBe(false);
    });

    it('should fail verification with tampered payload', () => {
      const identity = generateIdentity();
      const signature = signPayload(payload, identity.agentauth_token);
      
      const tamperedPayload = { ...payload, data: 'tampered' };
      const isValid = verifySignature(signature, tamperedPayload, identity.agentauth_address);
      
      expect(isValid).toBe(false);
    });

    it('should fail verification with tampered signature', () => {
      const identity = generateIdentity();
      const signature = signPayload(payload, identity.agentauth_token);
      
      // Tamper with signature
      const tamperedSignature = '0x' + 
        (signature.slice(2, 3) === 'a' ? 'b' : 'a') + 
        signature.slice(3);
      
      const isValid = verifySignature(tamperedSignature, payload, identity.agentauth_address);
      
      expect(isValid).toBe(false);
    });

    it('should fail verification with invalid address format', () => {
      const identity = generateIdentity();
      const signature = signPayload(payload, identity.agentauth_token);
      
      const isValid = verifySignature(signature, payload, 'invalid-address');
      
      expect(isValid).toBe(false);
    });

    it('should fail verification with invalid signature format', () => {
      const identity = generateIdentity();
      
      const isValid = verifySignature('invalid-signature', payload, identity.agentauth_address);
      
      expect(isValid).toBe(false);
    });
  });
});