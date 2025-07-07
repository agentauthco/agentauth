/*
 * Copyright (c) 2025 AgentAuth
 * SPDX-License-Identifier: MIT
 * 
 * Transport connection logic adapted from mcp-remote
 * https://www.npmjs.com/package/mcp-remote
 */

import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import { type JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js'
import { deriveAddress, signPayload } from '@agentauth/core'

const VERSION = '0.1.0'
const REASON_TRANSPORT_FALLBACK = 'falling-back-to-alternate-transport'
export type TransportStrategy = 'sse-only' | 'http-only' | 'sse-first' | 'http-first'

export const pid = process.pid
export let DEBUG = false

/**
 * Gets current timestamp in ISO format
 */
export function timestamp() {
  const now = new Date()
  return now.toISOString()
}

/**
 * Logs a message with timestamp and process ID
 */
export function log(str: string, ...rest: unknown[]) {
  console.error(`[${timestamp()}] [${pid}] ${str}`, ...rest)
}

/**
 * Logs debug messages when debug mode is enabled
 */
export function debugLog(str: string, ...rest: unknown[]) {
  if (DEBUG) {
    log(`[DEBUG] ${str}`, ...rest)
  }
}

/**
 * Enables or disables debug logging
 */
export function setDebug(val: boolean) {
  DEBUG = val
  if (DEBUG) {
    debugLog('Debug mode enabled.')
  }
}

/**
 * Validates that the server URL uses HTTPS or is allowed via exceptions
 * @param serverUrl The URL to validate
 * @param allowHttp Whether HTTP is explicitly allowed via --allow-http flag
 * @throws Error if URL is not secure and not allowed
 */
export function validateServerUrlSecurity(serverUrl: string, allowHttp: boolean): void {
  const url = new URL(serverUrl);
  const isLocalhost = (url.hostname === 'localhost' || url.hostname === '127.0.0.1') && url.protocol === 'http:';
  
  if (!(url.protocol === 'https:' || isLocalhost || allowHttp)) {
    log('Error: Non-HTTPS URLs are only allowed for localhost or when --allow-http flag is provided');
    process.exit(1);
  }
}

/**
 * Generates fresh AgentAuth headers for each request with current timestamp
 * @param token The AgentAuth token to sign with
 * @returns Headers object with address, signature, and base64-encoded payload
 */
export function generateFreshAuthHeaders(token: string): Record<string, string> {
  const agentauth_address = deriveAddress(token);
  const payload = {
    timestamp: new Date().toISOString(),
  };
  const signature = signPayload(payload, token);
  
  return {
    'X-AgentAuth-Address': agentauth_address,
    'X-AgentAuth-Signature': signature,
    'X-AgentAuth-Payload': Buffer.from(JSON.stringify(payload)).toString('base64'),
  };
}

// AgentAuth headers that should not be overridden by custom headers
const PROTECTED_AGENTAUTH_HEADERS = [
  'x-agentauth-address',
  'x-agentauth-signature', 
  'x-agentauth-payload'
] as const;

/**
 * Check if a header name conflicts with protected AgentAuth headers (case-insensitive)
 */
function hasAgentAuthConflict(headerName: string): boolean {
  const normalized = headerName.toLowerCase();
  return PROTECTED_AGENTAUTH_HEADERS.some(
    protectedHeader => protectedHeader.toLowerCase() === normalized
  );
}

/**
 * Merge custom headers with AgentAuth headers, with conflict detection and warnings
 */
function mergeHeaders(agentAuthHeaders: Record<string, string>, customHeaders: Record<string, string>): Record<string, string> {
  // Check for conflicts and warn
  Object.keys(customHeaders).forEach(headerName => {
    if (hasAgentAuthConflict(headerName)) {
      console.warn(`⚠️  Warning: Custom header '${headerName}' is overriding AgentAuth authentication.`);
    }
  });

  // Custom headers take precedence over AgentAuth headers
  return {
    ...agentAuthHeaders,
    ...customHeaders
  };
}

/**
 * Wrapper class that adds fresh auth headers and custom headers to each request by intercepting fetch calls.
 * Intercepts POST requests (MCP message sends) and injects fresh AgentAuth headers
 * with current timestamps to ensure authentication doesn't expire.
 */
class AuthRefreshTransportWrapper implements Transport {
  private wrappedTransport: Transport;
  private token: string;
  private customHeaders: Record<string, string>;
  private originalFetch: typeof fetch;

  constructor(transport: Transport, token: string, customHeaders: Record<string, string> = {}) {
    this.wrappedTransport = transport;
    this.token = token;
    this.customHeaders = customHeaders;
    this.originalFetch = globalThis.fetch;
    this.interceptFetch();
  }

  get sessionId() {
    return this.wrappedTransport.sessionId;
  }

  set onclose(handler: () => void) {
    this.wrappedTransport.onclose = handler;
  }

  set onerror(handler: (error: Error) => void) {
    this.wrappedTransport.onerror = handler;
  }

  set onmessage(handler: (message: JSONRPCMessage) => void) {
    this.wrappedTransport.onmessage = handler;
  }

  async start(): Promise<void> {
    return this.wrappedTransport.start();
  }

  async send(message: JSONRPCMessage): Promise<void> {
    debugLog('Sending message with fresh auth headers via fetch interception');
    return this.wrappedTransport.send(message);
  }

  async close(): Promise<void> {
    // Restore original fetch
    globalThis.fetch = this.originalFetch;
    return this.wrappedTransport.close();
  }

  private interceptFetch(): void {
    const self = this;
    globalThis.fetch = async function(input: string | URL | Request, init?: RequestInit): Promise<Response> {
      // Only intercept POST requests (MCP message sending)
      if (init?.method === 'POST') {
        const freshHeaders = generateFreshAuthHeaders(self.token);
        const finalHeaders = mergeHeaders(freshHeaders, self.customHeaders);
        
        // Create new headers object that includes all headers
        const headers = new Headers(init.headers);
        Object.entries(finalHeaders).forEach(([key, value]) => {
          headers.set(key, value);
        });
        
        // Create new init with all headers
        const newInit = {
          ...init,
          headers
        };
        
        debugLog('Intercepted POST request, injected fresh auth headers and custom headers');
        return self.originalFetch(input, newInit);
      }
      
      // For non-POST requests, use original fetch
      return self.originalFetch(input, init);
    };
  }
}

/**
 * Creates a bidirectional proxy between two transports
 * @param params The transport connections to proxy between
 */
export function mcpProxy({ transportToClient, transportToServer }: { transportToClient: Transport; transportToServer: Transport }) {
  let transportToClientClosed = false
  let transportToServerClosed = false

  transportToClient.onmessage = (message: JSONRPCMessage) => {
    debugLog('[Local→Remote]', 'method' in message ? message.method : message.id)

    if ('method' in message && message.method === 'initialize') {
      const { clientInfo } = message.params as any
      if (clientInfo) {
        clientInfo.name = `${clientInfo.name} (via agentauth-mcp ${VERSION})`
      }
    }

    transportToServer.send(message).catch(onServerError)
  }

  transportToServer.onmessage = (message: JSONRPCMessage) => {
    debugLog('[Remote→Local]', 'method' in message ? message.method : message.id)
    transportToClient.send(message).catch(onClientError)
  }

  transportToClient.onclose = () => {
    if (transportToServerClosed) return
    transportToClientClosed = true
    debugLog('Local transport closed, closing remote transport')
    transportToServer.close().catch(onServerError)
  }

  transportToServer.onclose = () => {
    if (transportToClientClosed) return
    transportToServerClosed = true
    debugLog('Remote transport closed, closing local transport')
    transportToClient.close().catch(onClientError)
  }

  transportToClient.onerror = onClientError
  transportToServer.onerror = onServerError

  function onClientError(error: Error) {
    log('Error from local client:', error.message)
  }

  function onServerError(error: Error) {
    log('Error from remote server:', error.message)
  }
}

/**
 * Wrapper class that only adds custom headers to requests (no AgentAuth)
 */
class CustomHeadersTransportWrapper implements Transport {
  private wrappedTransport: Transport;
  private customHeaders: Record<string, string>;
  private originalFetch: typeof fetch;

  constructor(transport: Transport, customHeaders: Record<string, string>) {
    this.wrappedTransport = transport;
    this.customHeaders = customHeaders;
    this.originalFetch = globalThis.fetch;
    this.interceptFetch();
  }

  get sessionId() {
    return this.wrappedTransport.sessionId;
  }

  set onclose(handler: () => void) {
    this.wrappedTransport.onclose = handler;
  }

  set onerror(handler: (error: Error) => void) {
    this.wrappedTransport.onerror = handler;
  }

  set onmessage(handler: (message: JSONRPCMessage) => void) {
    this.wrappedTransport.onmessage = handler;
  }

  async start(): Promise<void> {
    return this.wrappedTransport.start();
  }

  async send(message: JSONRPCMessage): Promise<void> {
    debugLog('Sending message with custom headers via fetch interception');
    return this.wrappedTransport.send(message);
  }

  async close(): Promise<void> {
    // Restore original fetch
    globalThis.fetch = this.originalFetch;
    return this.wrappedTransport.close();
  }

  private interceptFetch(): void {
    const self = this;
    globalThis.fetch = async function(input: string | URL | Request, init?: RequestInit): Promise<Response> {
      // Only intercept POST requests (MCP message sending)
      if (init?.method === 'POST') {
        // Create new headers object that includes custom headers
        const headers = new Headers(init.headers);
        Object.entries(self.customHeaders).forEach(([key, value]) => {
          headers.set(key, value);
        });
        
        // Create new init with custom headers
        const newInit = {
          ...init,
          headers
        };
        
        debugLog('Intercepted POST request, injected custom headers');
        return self.originalFetch(input, newInit);
      }
      
      // For non-POST requests, use original fetch
      return self.originalFetch(input, init);
    };
  }
}

/**
 * Creates and connects to a remote server with transport strategy fallback support.
 * Uses the AuthRefreshTransportWrapper to provide fresh auth headers when token is provided.
 * @param serverUrl The URL of the remote server
 * @param strategy The transport strategy to use (http-first, sse-first, etc.)
 * @param recursionReasons Set tracking fallback attempts to prevent infinite recursion
 * @param token Optional AgentAuth token for authentication
 * @param customHeaders Optional custom headers to include with requests
 * @returns The connected transport, wrapped with auth refresh if token provided
 */
export async function connectToRemoteServer(
  serverUrl: string,
  strategy: TransportStrategy = 'http-first',
  recursionReasons: Set<string> = new Set(),
  token?: string,
  customHeaders: Record<string, string> = {},
): Promise<Transport> {
  log(`Connecting to remote server: ${serverUrl} with strategy: ${strategy}`)
  const url = new URL(serverUrl)

  const requestInit = {}

  const useSSE = strategy === 'sse-only' || (strategy === 'sse-first' && !recursionReasons.has(REASON_TRANSPORT_FALLBACK))
  const useHTTP = strategy === 'http-only' || (strategy === 'http-first' && !recursionReasons.has(REASON_TRANSPORT_FALLBACK))

  // Determine the transport to use based on the strategy
  let transport: Transport
  if (useSSE) {
    transport = new SSEClientTransport(url, { requestInit })
  } else if (useHTTP) {
    transport = new StreamableHTTPClientTransport(url, { requestInit })
  } else {
    // This case happens on the second leg of a fallback strategy
    const fallbackStrategy = strategy === 'sse-first' ? 'http-only' : 'sse-only'
    return connectToRemoteServer(serverUrl, fallbackStrategy, recursionReasons, token, customHeaders)
  }

  debugLog(`Attempting connection with ${transport.constructor.name}`)

  try {
    await transport.start()

    // Additional probe for HTTP transport to verify endpoint supports Streamable HTTP
    if (!useSSE) {
      debugLog('Performing HTTP probe to confirm server supports Streamable HTTP...')
      try {
        const testTransport = new StreamableHTTPClientTransport(url, { requestInit })
        const testClient = new Client({ name: 'agentauth-mcp-fallback-test', version: '0.0.0' }, { capabilities: {} })
        await testClient.connect(testTransport)
        await testTransport.close()
        debugLog('HTTP probe succeeded; server supports Streamable HTTP.')
      } catch (probeError: any) {
        debugLog(`HTTP probe failed with message: ${probeError.message}`)

        const isProtocolLikeError = probeError instanceof Error &&
          (probeError.message.includes('405') || probeError.message.includes('Method Not Allowed') ||
            probeError.message.includes('404') || probeError.message.includes('Not Found') ||
            probeError.message.includes('protocol error'))

        const shouldAttemptFallback = (strategy === 'http-first' || strategy === 'sse-first') &&
          !recursionReasons.has(REASON_TRANSPORT_FALLBACK)

        if (shouldAttemptFallback && isProtocolLikeError) {
          log(`Transport probe failed, attempting fallback...`)
          recursionReasons.add(REASON_TRANSPORT_FALLBACK)
          // opposite transport
          const fallbackStrategy = 'sse-only'
          return connectToRemoteServer(serverUrl, fallbackStrategy as TransportStrategy, recursionReasons, token, customHeaders)
        }

        // probe failed but no fallback; rethrow
        throw probeError
      }
    }

    log(`Connected successfully using ${transport.constructor.name}.`)
    
    // Determine which wrapper to use based on token and custom headers
    const hasCustomHeaders = Object.keys(customHeaders).length > 0;
    
    if (token && hasCustomHeaders) {
      debugLog('Wrapping transport with auth refresh and custom headers capability');
      return new AuthRefreshTransportWrapper(transport, token, customHeaders);
    } else if (token) {
      debugLog('Wrapping transport with auth refresh capability');
      return new AuthRefreshTransportWrapper(transport, token);
    } else if (hasCustomHeaders) {
      debugLog('Wrapping transport with custom headers capability');
      return new CustomHeadersTransportWrapper(transport, customHeaders);
    }
    
    return transport
  } catch (error: any) {
    debugLog(`Connection failed with ${transport.constructor.name}:`, error.message)

    const shouldAttemptFallback = (strategy === 'http-first' || strategy === 'sse-first') &&
                                  !recursionReasons.has(REASON_TRANSPORT_FALLBACK)

    if (shouldAttemptFallback && error instanceof Error &&
        (error.message.includes('405') || error.message.includes('Method Not Allowed') ||
         error.message.includes('404') || error.message.includes('Not Found') ||
         error.message.includes('protocol error'))) {

      log(`Transport failed, attempting fallback...`)
      recursionReasons.add(REASON_TRANSPORT_FALLBACK)
      
      // The logic above will ensure the other transport is tried on the recursive call
      return connectToRemoteServer(serverUrl, strategy, recursionReasons, token, customHeaders)
    }

    // If no fallback is possible or the error is not a fallback candidate, rethrow.
    throw error
  }
}
