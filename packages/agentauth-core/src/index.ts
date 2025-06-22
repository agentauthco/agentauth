/*
 * Copyright (c) 2025 AgentCore Labs
 * SPDX-License-Identifier: MIT
 */

import * as secp from '@noble/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha2';
import { Buffer } from 'buffer';
import { v5 as uuidv5 } from 'uuid';

// Set up HMAC for secp256k1 (required by the noble library)
secp.etc.hmacSha256Sync = (k, ...m) => hmac(sha256, k, secp.etc.concatBytes(...m));

export type Algorithm = 'secp256k1';

/**
 * DO NOT CHANGE THIS UUID - EVER.
 * 
 * This UUID was generated once using `uuid.v4()` and is now a fixed constant.
 * It is a constant namespace for generating AgentAuth UUIDs.
 * This ensures that the same agentauth_key will always produce the same agentauth_id.
 * If you change this UUID, you will break all existing AgentAuth IDs.
 * 
 * This is a security-critical constant and should NEVER be changed.
 */
const AGENTAUTH_NAMESPACE = '2f5a5c48-c283-4231-8975-9271fe11e86c';

/**
 * Parses a private key from any supported format (aa-, 0x, or raw hex).
 * @param token The private key in any format.
 * @returns The clean 32-byte hex private key (without prefix).
 */
export function parsePrivateKey(token: string): string {
  // Remove any prefix (aa-, 0x, or none)
  const cleanHex = token.replace(/^(aa-|0x)/, '');
  
  // Validate 32-byte hex format
  if (!/^[0-9a-fA-F]{64}$/.test(cleanHex)) {
    throw new Error('Invalid private key format: must be 32-byte hex string');
  }
  
  return cleanHex;
}

/**
 * Derives an EVM-compatible address from a private key.
 * @param privateKey The private key in any format (aa-, 0x, or raw hex).
 * @returns The EVM-compatible address (0x-prefixed, 20 bytes).
 */
export function deriveAddress(privateKey: string): string {
  try {
    // Parse and validate private key
    const cleanPrivateKey = parsePrivateKey(privateKey);
    const privateKeyBytes = Buffer.from(cleanPrivateKey, 'hex');
    
    // Get uncompressed public key (65 bytes: 0x04 + 32 + 32)
    const publicKeyBytes = secp.getPublicKey(privateKeyBytes, false);
    
    // Remove the 0x04 prefix to get the 64-byte coordinate pair
    const publicKeyCoords = publicKeyBytes.slice(1);
    
    // Hash with keccak256 and take last 20 bytes for address
    const addressBytes = keccak_256(publicKeyCoords).slice(-20);
    
    return '0x' + Buffer.from(addressBytes).toString('hex');
  } catch (error) {
    throw new Error('Failed to derive address: The provided private key is invalid.');
  }
}

/**
 * Generates a stable, deterministic UUIDv5 for a given address.
 * @param address The EVM-compatible address (0x-prefixed format).
 * @returns The UUIDv5 string representing the stable `agentauth_id`.
 */
export function generateId(address: string): string {
  return uuidv5(address, AGENTAUTH_NAMESPACE);
}

/**
 * Generates a complete AgentAuth identity with address-based components.
 * @param algorithm The algorithm to use. Currently only 'secp256k1' is supported.
 * @returns Complete identity with token, address, and ID.
 */
export function generateIdentity(
  algorithm: Algorithm = 'secp256k1'
): { agentauth_token: string; agentauth_address: string; agentauth_id: string } {
  if (algorithm !== 'secp256k1') {
    throw new Error(`Unsupported algorithm: ${algorithm}`);
  }

  // Generate private key
  const privateKeyBytes = secp.utils.randomPrivateKey();
  const agentauth_token = `aa-${Buffer.from(privateKeyBytes).toString('hex')}`;
  
  // Derive address and ID
  const agentauth_address = deriveAddress(agentauth_token);
  const agentauth_id = generateId(agentauth_address);
  
  return { agentauth_token, agentauth_address, agentauth_id };
}

/**
 * Signs a payload using a private key.
 * @param payload The JSON payload to sign.
 * @param privateKey The private key in any format (aa-, 0x, or raw hex).
 * @returns The hex-encoded signature with 0x prefix (EVM-standard).
 */
export function signPayload(
  payload: object,
  privateKey: string
): string {
  try {
    const messageString = JSON.stringify(payload);
    const messageHash = keccak_256(messageString);
    
    // Parse private key (handles any format)
    const cleanPrivateKey = parsePrivateKey(privateKey);
    const privateKeyBytes = Buffer.from(cleanPrivateKey, 'hex');
    
    const signature = secp.sign(messageHash, privateKeyBytes);
    
    // EVM-standard signature format: 0x + 64 bytes (r + s) + 1 byte (v/recovery)
    const signatureHex = signature.toCompactHex() + signature.recovery.toString(16).padStart(2, '0');
    return `0x${signatureHex}`;
  } catch (error) {
    throw new Error('Failed to sign payload: The provided private key is invalid.');
  }
}

/**
 * Verifies a signature against a payload and expected address.
 * @param signature The hex-encoded signature with 0x prefix.
 * @param payload The JSON payload to verify.
 * @param expectedAddress The expected EVM-compatible address (0x-prefixed).
 * @returns True if the signature is valid and recovers to the expected address, false otherwise.
 */
export function verifySignature(
  signature: string,
  payload: object,
  expectedAddress: string
): boolean {
  try {
    // Validate expected address format
    if (!/^0x[0-9a-fA-F]{40}$/.test(expectedAddress)) {
      return false;
    }

    // Parse signature
    if (!signature.startsWith('0x') || signature.length !== 132) {
      return false;
    }

    const signatureHex = signature.slice(2);
    const r = signatureHex.slice(0, 64);
    const s = signatureHex.slice(64, 128);
    const recoveryHex = signatureHex.slice(128, 130);
    const recovery = parseInt(recoveryHex, 16);

    // Hash the payload
    const messageString = JSON.stringify(payload);
    const messageHash = keccak_256(messageString);

    // Recover public key from signature
    const sig = new secp.Signature(BigInt('0x' + r), BigInt('0x' + s)).addRecoveryBit(recovery);
    const recoveredPublicKey = sig.recoverPublicKey(messageHash);
    
    // Convert recovered public key to address
    const publicKeyBytes = recoveredPublicKey.toRawBytes(false); // uncompressed
    const publicKeyCoords = publicKeyBytes.slice(1); // Remove 0x04 prefix
    const addressBytes = keccak_256(publicKeyCoords).slice(-20);
    const recoveredAddress = '0x' + Buffer.from(addressBytes).toString('hex');
    
    // Compare addresses (case-insensitive)
    return recoveredAddress.toLowerCase() === expectedAddress.toLowerCase();
  } catch (error) {
    // If any recovery or verification fails, the signature is invalid
    return false;
  }
} 