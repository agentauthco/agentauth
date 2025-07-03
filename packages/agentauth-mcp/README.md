# @agentauth/mcp: A Universal Proxy for Remote MCP Server Connections

[![npm version](https://img.shields.io/npm/v/@agentauth/mcp.svg)](https://www.npmjs.com/package/@agentauth/mcp)
[![npm downloads](https://img.shields.io/npm/dm/@agentauth/mcp.svg)](https://www.npmjs.com/package/@agentauth/mcp)
[![Types](https://img.shields.io/npm/types/@agentauth/mcp)](https://www.npmjs.com/package/@agentauth/mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub stars](https://img.shields.io/github/stars/agentauthco/agentauth?style=social)](https://github.com/agentauthco/agentauth)

Connect any MCP client to any remote MCP server — with or without authentication.

## Why `@agentauth/mcp`?

- ✅ **Supports all auth types** — Compatible with MCP servers using no auth, AgentAuth, or other auth methods
- ✅ **Native support for AgentAuth** — Natively supports connecting to MCP servers using AgentAuth
- ✅ **Transport compatibility** — Automatically handles both HTTP and SSE MCP server connections
- ✅ **Super simple config** — Just set the server config once and forget
- ✅ **Works with all clients** — Works with all popular MCP clients like Claude, Cursor, Windsurf, and more
- ✅ **Future-ready** — Built to support AgentAuth, OAuth, API keys, JWT tokens, custom headers, and more (coming soon)

Basically, `@agentauth/mcp` is designed to be your default MCP proxy tool - and the only one you'll need!

## Installation

```bash
npm install -g @agentauth/mcp
```

## Quick Start

### Basic Connection (No Auth Required)

Add to your MCP client config (e.g. Claude, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "my-server": {
      "command": "agentauth-mcp",
      "args": ["connect", "https://example.com/mcp"]
    }
  }
}
```

That's it! The proxy then handles the connection between your MCP client and the remote MCP server.

### Connect with AgentAuth Identity

AgentAuth is an open-source standard that lets you give any agent an `AgentAuth ID` — a stable, unique, verifiable UUID — and the power to connect to AgentAuth-enabled servers with no logins, accounts, or sessions required.

To connect to any AgentAuth-enabled MCP server:

1. **Generate your `AgentAuth Token`:**

```bash
agentauth-mcp generate
# Output:
AGENTAUTH_ID=...
AGENTAUTH_TOKEN=aa-...
```

The `AgentAuth Token` is like the password for your agent's `AgentAuth ID` -- and, since the `AgentAuth Token` is used to derive the `AgentAuth ID`, it's all you need to include in your configuration!

⚠️ Note: Just like any password, please remember to store your `AgentAuth Token` **SECURELY** and never share it with anyone, as it is used to authenticate your agent.

2. **Add it to your MCP client config (e.g. Claude, Cursor, Windsurf):**

```json
{
  "mcpServers": {
    "my-server": {
      "command": "agentauth-mcp",
      "args": ["connect", "https://example.com/mcp"],
      "env": {
        "AGENTAUTH_TOKEN": "aa-..."
      }
    }
  }
}
```

And you're all set!

Since your agent's `AgentAuth Token` is stable and unique, it can be reused across **any** MCP server using AgentAuth — so when adding a new server, all you need to do is update the `connect` URL, then set once and forget!

⚠️ Note: The `AgentAuth Token` is only ever used **LOCALLY** by the @agentauth/mcp package, and never sent to the MCP server. The server only receives the `AgentAuth ID` and verification that you have the `AgentAuth Token`.

Learn more about AgentAuth [here](https://agentauth.co).

### With other credentials

(Coming soon)

## Command Reference

### `connect <server_url>`

The main command - connects to any MCP server.

```bash
agentauth-mcp connect <server_url> [options]
```

ℹ️ Note: MCP clients will call `agentauth-mcp connect` automatically via their config files. The below examples are provided for reference and testing or debugging purposes.

**Examples:**
```bash
# Basic connection
agentauth-mcp connect http://localhost:8000/mcp

# With AgentAuth environment variable
AGENTAUTH_TOKEN="aa-..." agentauth-mcp connect http://localhost:8000/mcp

# With debug logging
agentauth-mcp connect http://localhost:8000/mcp --debug

# Force specific transport
agentauth-mcp connect http://localhost:8000/mcp/sse --transport sse-only

# Allow HTTP for non-localhost (development only)
agentauth-mcp connect http://example.com/mcp --allow-http
```

**Options:**
- `--transport, -t`: Transport strategy (default: `http-first`)
  - `http-first`: Try HTTP, fallback to SSE
  - `sse-first`: Try SSE, fallback to HTTP  
  - `http-only`: HTTP only
  - `sse-only`: SSE only
- `--allow-http`: Allow HTTP connections (not recommended for production, default: false)
- `--debug, -d`: Enable debug logging

⚠️ **Security Note**: HTTPS is enforced by default. HTTP connections are only allowed for localhost or when using the `--allow-http` flag.

**Example MCP Client Configuration:**

Here's an example of how you would actually use these in an MCP client configuration:

```json
{
  "mcpServers": {
    "premium-tools": {
      "command": "agentauth-mcp",
      "args": ["connect", "https://api.example.com/mcp/sse", "--transport", "sse-only"],
      "env": {
        "AGENTAUTH_TOKEN": "aa-..."
      }
    }
  }
}
```

### `generate`

Use this to generate a new AgentAuth identity for your agent.

```bash
agentauth-mcp generate
```

**Output:**
- `AGENTAUTH_ID`: Your agent's stable UUID (same across all servers)
- `AGENTAUTH_TOKEN`: Your agent's access token ("aa-" prefixed), like a password

⚠️ Note: Just like any password, please remember to store your `AgentAuth Token` **SECURELY** and never share it with anyone, as it is used to authenticate your agent.

### `derive <token>`

Derive your agent's `AgentAuth ID` (a stable UUID) from a valid `AgentAuth Token`.

```bash
agentauth-mcp derive <agentauth_token>
```

**Output:**
- `AGENTAUTH_ID`: Your agent's stable UUID (same across all servers)
- `AGENTAUTH_ADDRESS`: Derived address (0x-prefixed), used for server-side verification

## Example Configurations

### Example 1: Public Server (No Auth)

```json
{
  "mcpServers": {
    "weather": {
      "command": "agentauth-mcp",
      "args": ["connect", "https://weather-api.example.com/mcp"]
    }
  }
}
```

### Example 2: Server with AgentAuth

```json
{
  "mcpServers": {
    "premium-tools": {
      "command": "agentauth-mcp",
      "args": ["connect", "https://api.example.com/mcp"],
      "env": {
        "AGENTAUTH_TOKEN": "aa-..."
      }
    }
  }
}
```

### Example 3: Multiple Servers, One Identity

```json
{
  "mcpServers": {
    "analytics-server": {
      "command": "agentauth-mcp",
      "args": ["connect", "https://analytics.example.com/mcp"],
      "env": {
        "AGENTAUTH_TOKEN": "aa-..."
      }
    },
    "database-tools": {
      "command": "agentauth-mcp",
      "args": ["connect", "https://db.example.com/mcp"],
      "env": {
        "AGENTAUTH_TOKEN": "aa-..."  // Same token = same identity!
      }
    }
  }
}
```

## How It Works

### As a Universal Proxy

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   MCP Client    │    │  agentauth-mcp   │    │   MCP Server    │
│ (Claude/Cursor) │───▶│ (Universal Proxy)│───▶│   (Any Auth)    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌────────────────────┐
                       │ • No auth? Works!  │
                       │ • AgentAuth? Added │
                       │ • OAuth? (Soon!)   │
                       │ • Other? (Soon!)   │
                       └────────────────────┘
```

### With AgentAuth Identity

When you provide an `AGENTAUTH_TOKEN`, the proxy:
1. Derives your `AgentAuth ID` (a stable UUID) from your token
2. Signs each request with verifiable proof
3. Adds authentication headers automatically
4. Servers can identify and personalize for your agent

## 🔜 Coming Soon

We're building agentauth-mcp to handle **any** authentication method -- including API keys, OAuth, and custom credentials (like email / password) -- so you can focus on using MCP servers, not configuring them.

## Try It: Weather Server Demo

We provide a full working example [weather server](https://github.com/agentauthco/agentauth/tree/main/examples/weather-server) to help with development and testing.

**1. Start the Weather Server:**

```bash
# Start by cloning the AgentAuth repository
git clone https://github.com/agentauthco/agentauth.git

# The example uses AgentAuth workspace dependencies, so install and build from root, first
cd agentauth
pnpm install
pnpm run build

# Then run build from the weather-server directory
cd examples/weather-server
pnpm run build  # Dependencies already installed by root pnpm install

# Start the server
pnpm start  # Starts the weather server at http://localhost:8000/mcp using HTTP by default
```

**2. Configure your MCP Client (e.g. Claude, Cursor, Windsurf, etc.)**

Without Authentication:
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

With Authentication:
```bash
# Generate credentials for testing
agentauth-mcp generate
# Output:
AGENTAUTH_ID=...
AGENTAUTH_TOKEN=aa-...
```

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

**3. Try It Out!**
Start/Restart your MCP client and try:
- "Check my authentication status"
- "Get weather forecast for Oakland, CA"
- "Get weather alerts for CA"

**What the example demonstrates:**
- **Tiered authentication** - Free forecasts, premium alerts requiring auth
- **Dual transport support** - Both HTTP and SSE transport modes
- **Real-world integration** - External API usage with proper error handling
- **Production patterns** - Middleware, rate limiting, database-ready UUIDs

👉 **[Full Example Guide](https://github.com/agentauthco/agentauth/tree/main/examples/weather-server/README.md)**

## Technical Details

### Transport Compatibility

The proxy automatically detects and uses the right transport:
- **HTTP servers** - Uses Streamable HTTP transport
- **SSE servers** - Uses Server-Sent Events transport
- **Auto-detection** - Tests the connection and picks the right one
- **Fallback support** - Seamlessly switches if primary fails

### Security Features

- **Tokens stay local** - Your credentials never leave your machine
- **Signed requests** - Each request includes verifiable proof (when using AgentAuth)

## Troubleshooting

### Quick Fixes

**Connection failed?**
```bash
# Try with debug mode
agentauth-mcp connect http://localhost:8000/mcp --debug

# Force specific transport
agentauth-mcp connect http://localhost:8000/mcp/sse --transport sse-only
```

**Authentication not working?**
```bash
# Verify your token is set
echo $AGENTAUTH_TOKEN

# Check if it's valid and the right one
agentauth-mcp derive <AGENTAUTH_TOKEN>

# Generate a new one if needed
agentauth-mcp generate
```

**Need help?**
- Check debug output for detailed connection info
- Ensure server is running on the specified port
- Verify your MCP client config points to agentauth-mcp

## Development

```bash
# Clone and build from repository root (uses workspace dependencies)
git clone https://github.com/agentauthco/agentauth
cd agentauth
pnpm install
pnpm run build

# Link for local testing
cd packages/agentauth-mcp
npm link
agentauth-mcp --help
```

## FAQ

**Q: Do I need AgentAuth to use this proxy?**  
A: No! It works with any MCP server. AgentAuth just adds identity when you want it.

**Q: Can I use this with non-AgentAuth servers?**  
A: Yes! The proxy passes through all MCP traffic unchanged unless you provide a token.

**Q: Is my token sent to the server?**  
A: No, only a derived address and signature are sent. Your token stays local.

**Q: Can I use the same token for multiple servers?**  
A: Yes! One token gives you the same UUID across all AgentAuth-enabled servers. Configure it once in each server block.

**Q: What if I already have servers configured?**  
A: Just change the `command` from the server executable to `agentauth-mcp` and add `connect` + the URL to `args`.

## Contributing

AgentAuth MCP is an early-stage open-source project maintained by the AgentAuth team. We welcome bug reports, feature suggestions, and early feedback via [GitHub Issues](https://github.com/agentauthco/agentauth/issues). You can also reach out at [developers@agentauth.co](mailto:developers@agentauth.co?subject=Contributing%20to%20AgentAuth) if you are interested in contributing.

## Credits

Transport connection logic adapted from [mcp-remote](https://www.npmjs.com/package/mcp-remote) - thanks for the solid foundation!

## License

MIT License - see [LICENSE](https://github.com/agentauthco/agentauth/blob/main/LICENSE) for details.

## Links

- **Website**: [agentauth.co](https://agentauth.co)
- **Documentation**: [docs.agentauth.co](https://docs.agentauth.co)
- **GitHub**: [agentauthco/agentauth](https://github.com/agentauthco/agentauth)
- **npm**: [@agentauth/mcp](https://www.npmjs.com/package/@agentauth/mcp)

---

**Built by [AgentAuth](https://agentauth.co)** - The Collaboration Layer for AI Agents.