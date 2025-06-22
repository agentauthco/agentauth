/*
 * Copyright (c) 2025 AgentCore Labs
 * SPDX-License-Identifier: MIT
 */

import { verifySignature, generateId } from '@agentauth/core';
import { Buffer } from 'buffer';

const SIXTY_SECONDS_IN_MS = 60 * 1000;

/**
 * Defines the headers used for AgentAuth.
 */
export const AGENTAUTH_HEADERS = {
  ADDRESS: 'x-agentauth-address',
  PAYLOAD: 'x-agentauth-payload',
  SIGNATURE: 'x-agentauth-signature',
} as const;

/**
 * Represents a generic request object with headers.
 */
export interface AgentAuthRequest {
  headers: Record<string, string | string[] | undefined>;
}

/**
 * Represents the structured, decoded payload for AgentAuth requests.
 * The payload must contain a timestamp for freshness validation,
 * and can include any additional data needed by the application.
 */
export interface AgentAuthPayload {
  /** ISO 8601 timestamp for request freshness validation */
  timestamp: string;
  /** Additional payload data as needed by the application */
  [key: string]: unknown;
}

/**
 * Represents the result of a successful verification.
 */
export interface VerificationResult {
  valid: boolean;
  agentauth_id?: string;
}

/**
 * Configuration options for the verification functions.
 */
export interface VerifyOptions {
  /**
   * The acceptable time window in milliseconds for the request timestamp.
   * Defaults to 60000 (60 seconds).
   */
  freshness?: number;
}

/**
 * Core verification function for AgentAuth.
 * It is stateless and performs address-based signature verification and timestamp validation.
 *
 * @param request The incoming request object containing headers.
 * @param options Optional configuration for verification.
 * @returns VerificationResult with valid flag and agentauth_id if successful.
 */
export function verify(
  request: AgentAuthRequest,
  options: VerifyOptions = {}
): VerificationResult {
  const { headers } = request;
  const freshness = options.freshness ?? SIXTY_SECONDS_IN_MS;

  const agentauth_address = headers[AGENTAUTH_HEADERS.ADDRESS] as string;
  const signature = headers[AGENTAUTH_HEADERS.SIGNATURE] as string;
  const payloadB64 = headers[AGENTAUTH_HEADERS.PAYLOAD] as string;

  if (!agentauth_address || !signature || !payloadB64) {
    return { valid: false };
  }

  try {
    // 1. Decode payload
    const payloadStr = Buffer.from(payloadB64, 'base64').toString('utf-8');
    const payload: AgentAuthPayload = JSON.parse(payloadStr);

    // 2. Verify signature against address
    const isSignatureValid = verifySignature(
      signature,
      payload,
      agentauth_address
    );
    if (!isSignatureValid) {
      return { valid: false };
    }

    // 3. Check timestamp freshness
    const requestTimestamp = new Date(payload.timestamp).getTime();
    const now = Date.now();

    if (Math.abs(now - requestTimestamp) > freshness) {
      return { valid: false };
    }

    // 4. Generate stable ID from address
    const agentauth_id = generateId(agentauth_address);

    // Verification successful
    return { valid: true, agentauth_id };
  } catch (error) {
    // Any parsing or verification error results in invalid
    return { valid: false };
  }
}
