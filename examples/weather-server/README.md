# AgentAuth Weather Server Example

A complete, working MCP server demonstrating AgentAuth integration with support for both unauthenticated (anonymous) and authenticated usage. This example showcases how easy AgentAuth is to integrate, and how flexible it is, by implementing tiered services where some features are freely accessible and others require authentication.

An authenticated agent's **AgentAuth ID** (a stable, verifiable UUID) persists across sessions — perfect for usage tracking, rate limits, or personalization.

💡 Tip: This weather example builds on the official MCP server tutorial at https://modelcontextprotocol.io/quickstart/server.

## Features

- **🌤️ Weather forecasts** - Open to all users (3-day limit for unauthenticated)
- **🚨 Weather alerts** - Premium feature requiring AgentAuth authentication
- **🔐 Authentication tiers** - Graceful degradation for anonymous users
- **📡 Dual transport** - Demonstrates both HTTP and SSE transport modes
- **🆔 Stable identity** - Demonstrates usage of AgentAuth ID (stable, verifiable UUIDs) in practice

## Quick Start

### 1. Install and Build

```bash
# Start by cloning the AgentAuth repository
git clone https://github.com/agentcorelabs/agentauth.git

# The example uses AgentAuth workspace dependencies, so install and build from root, first
cd agentauth
pnpm install
pnpm run build

# Then run build from the weather-server directory
cd examples/weather-server
pnpm run build  # Dependencies already installed by root pnpm install
```

### 2. Start the Server

```bash
# Starts the weather server at http://localhost:8000/mcp using HTTP by default
pnpm run start

# Starts the weather server at http://localhost:8000/mcp/sse using SSE transport
pnpm run start:sse
```

### 3. Test with your MCP Client

```bash
# Install the AgentAuth MCP client proxy
npm install -g @agentauth/mcp
```

**Without Authentication:**

Configure your MCP Client (e.g. Claude, Cursor, Windsurf, etc.):
```json
{
  "mcpServers": {
    "weather-server-anon": {
      "command": "agentauth-mcp",
      "args": ["connect", "http://localhost:8000/mcp"]
    }
  }
}
```

**With Authentication:**

First, generate your AgentAuth credentials:
```bash
agentauth-mcp generate
# Output: AGENTAUTH_TOKEN=aa-...
```

Then, configure your MCP Client (e.g. Claude, Cursor, Windsurf, etc.):
```json
{
  "mcpServers": {
    "weather-server-auth": {
      "command": "agentauth-mcp",
      "args": ["connect", "http://localhost:8000/mcp"],
      "env": {
        "AGENTAUTH_TOKEN": "aa-..."
      }
    }
  }
}
```

## Available Tools

### `auth-status`
This tool returns your AgentAuth ID if authenticated, and explains what features are available to you.

**Example prompts:**
- "Check my authentication status"
- "Am I authenticated?"

### `get-forecast`
Get weather forecast for any location (enhanced for authenticated users).

**Parameters:**
- `latitude` - Latitude (-90 to 90)
- `longitude` - Longitude (-180 to 180)

**Example prompts:**
- "Get weather forecast for San Francisco"
- "What's the weather like at 40.7128, -74.0060?" (New York)

💡 Tip: Agents tend to be able to look up the latitude and longitude for you before making the call.

**Features:**
- **Anonymous users:** 3-day forecast
- **Authenticated users:** Full extended forecast + usage tracking

### `get-alerts` (Premium Only)
Get weather alerts for any US state. Requires AgentAuth authentication.

**Parameters:**
- `state` - Two-letter state code (e.g., "CA", "NY", "FL")

**Example prompts:**
- "Get weather alerts for CA"
- "Are there any weather alerts in Florida?"
- "Check weather alerts for Texas"

**Features:**
- Real-time weather alerts
- Severe weather warnings
- Emergency notifications

## Transport Modes

This server supports both standard MCP transport types:

### HTTP (Streamable HTTP)
- **Default mode**
- **Endpoint:** `/mcp`
- **Best for:** HTTP-native environments, stateless deployments
- **Start with:** `pnpm run start` (or `pnpm run start:http`)

### SSE (Server-Sent Events)
- **Alternative mode**
- **Endpoint:** `/mcp/sse`
- **Best for:** Most MCP clients, persistent connections
- **Start with:** `pnpm run start:sse`

Both transports provide identical functionality and AgentAuth support.

## Testing Different Scenarios

### 1. Anonymous Usage

**Configure MCP Client Without Authentication:**
```json
{
  "mcpServers": {
    "weather-server-anon": {
      "command": "agentauth-mcp",
      "args": ["connect", "http://localhost:8000/mcp"]
    }
  }
}
```

**What you'll see:**
- ✅ Basic weather forecasts (3-day limit)
- ❌ Weather alerts blocked with helpful upgrade message
- 💡 Clear instructions on how to authenticate

### 2. Authenticated Usage
```bash
npm install -g @agentauth/mcp
agentauth-mcp generate
# Output: AGENTAUTH_TOKEN=aa-...
```

**Configure MCP Client With Authentication:**
```json
{
  "mcpServers": {
    "weather-server-auth": {
      "command": "agentauth-mcp",
      "args": ["connect", "http://localhost:8000/mcp"],
      "env": {
        "AGENTAUTH_TOKEN": "aa-..."
      }
    }
  }
}
```

**What you'll see:**
- ✅ Full extended weather forecasts
- ✅ Weather alerts for any state
- 🆔 Stable agent UUID for tracking/personalization
- 📊 Usage attribution in logs

### 3. SSE Transport Testing
```bash
# Start SSE server at http://localhost:8000/mcp/sse
pnpm run start:sse
```

**Configure MCP Client Explicitly for SSE:**
```json
{
  "mcpServers": {
    "weather-server-auth": {
      "command": "agentauth-mcp",
      "args": ["connect", "http://localhost:8000/mcp/sse", "--transport=sse-only"],
      "env": {
        "AGENTAUTH_TOKEN": "aa-..."
      }
    }
  }
}
```

## Development

### Project Structure
```
weather-server/
├── src/
│   └── server.ts          # Main server implementation
├── build/                 # Compiled JavaScript (after npm run build)
├── package.json
├── tsconfig.json
└── README.md
```

### Key Features in Code

1. **Dual Transport Support**
   ```typescript
   // Command line flag controls transport
   const TRANSPORT_MODE = transportArg ? transportArg.split('=')[1] : 'http';
   ```

2. **Authentication Middleware**
   ```typescript
   // Works with or without AgentAuth
   const authResult = verifyAgentAuth({ headers: req.headers });
   if (authResult.valid) {
     // Store in MCP SDK's expected auth format
     (req as any).auth = {
       clientId: authResult.agentauth_id,
       extra: {
         agentauth: authResult
       }
     };
   }
   ```

3. **Tiered Features**
   ```typescript
   // Premium features check authentication
   if (!agentauth) {
     return { content: [{ type: "text", text: "🔒 Premium feature..." }] };
   }
   ```

### Environment Variables

- `PORT` - Server port (default: 8000)

### Health Check

Visit `http://localhost:8000/health` to see server status:
```json
{
  "status": "ok",
  "name": "AgentAuth Weather Example", 
  "transport": "HTTP",
  "endpoints": ["/mcp"],
  "timestamp": "2025-01-01T00:00:00.000Z"
}
```

## Architecture

This example demonstrates several AgentAuth patterns:

### 1. Flexible Authentication
- Works with or without authentication
- Different feature sets for different usage patterns
- Clear messaging about available features

### 2. Stable Identity
- Authenticated agents get persistent UUIDs
- Same identity across server restarts
- Enables usage tracking and personalization

### 3. Transport Agnostic
- Same authentication works on HTTP and SSE
- AgentAuth proxy handles transport differences
- Server-side code is transport-neutral

### 4. Real-World Integration
- Uses external API (National Weather Service)
- Demonstrates error handling
- Production-ready logging

## Troubleshooting

### Connection Issues
```bash
# Check server status
curl http://localhost:8000/health

# Test with debug mode
agentauth-mcp connect http://localhost:8000/mcp --debug
```

### Authentication Issues
```bash
# Verify token format
agentauth-mcp derive your-token-here

# Check server logs for auth status
# Look for "✅ Authenticated request" vs "ℹ️ Unauthenticated request"
```

### Transport Issues
```bash
# Force specific transport
agentauth-mcp connect http://localhost:8000/mcp --transport=http-only
agentauth-mcp connect http://localhost:8000/mcp/sse --transport=sse-only
```

## Next Steps

This example shows the basics of AgentAuth integration. To extend it:

1. **Add more premium features** - Database access, API integrations, etc.
2. **Implement usage tracking** - Store agent activity using stable UUIDs
3. **Add rate limiting** - Different limits for authenticated vs anonymous users
4. **Create user profiles** - Preferences, history, saved locations
5. **Add team features** - Multi-agent organizations, shared resources

## License

MIT License - see [LICENSE](../../LICENSE) for details.