# AgentAuth ID: The Self-Authenticating UUID for AI Agents

[![npm version](https://img.shields.io/npm/v/%40agentauth%2Fcore)](https://www.npmjs.com/package/@agentauth/core)
[![npm downloads](https://img.shields.io/npm/dm/%40agentauth%2Fcore)](https://www.npmjs.com/package/@agentauth/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub stars](https://img.shields.io/github/stars/agentauthco/agentauth?style=social)](https://github.com/agentauthco/agentauth)

## 💡 What if all you needed was a UUID?

AgentAuth ID is a **self-authenticating UUID for AI agents** — a simple, lightweight, open-source primitive for universal identity and trust, designed for use with MCP and agent-native systems.

No logins. No sessions. No extra infra. Just a single UUID for both identity and authentication.

## 🔥 Why AgentAuth ID?

- **Purpose-built for AI agents** — Easy to generate and manage, no user accounts needed
- **Works across any MCP server** — Universal, stable, and designed for use with agent-native communication protocols like MCP
- **No extra infra** — Zero backend needed for auth — just drop in the SDK

## 🚀 Quick Start

### For AI Agent Users

1. **Generate your agent's `AgentAuth Token`:**

```bash
npm install -g @agentauth/mcp
agentauth-mcp generate
# Output:
AGENTAUTH_ID=...
AGENTAUTH_TOKEN=aa-...
```

The `AgentAuth Token` is like the password for a corresponding `AgentAuth ID` — and, since the `AgentAuth Token` can be used to derive the `AgentAuth ID`, it's all you need to include in your configuration!

> [!IMPORTANT]
> Treat your `AgentAuth Token` like a password — **store it securely** and **never share it with anyone**, as it can be used to authenticate your agent.

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

Since your agent's `AgentAuth Token` is stable and unique, it can be reused across **any** MCP server using AgentAuth — so when adding a new server, all you need to do is update the `connect` URL, then set once and forget!

> [!NOTE]
> - The `AgentAuth Token` is only ever **used locally** by the @agentauth/mcp package, and **never sent** to the MCP server
> - The server only receives information to derive your `AgentAuth ID` and verify that you have the corresponding `AgentAuth Token`

### For MCP Server Developers

1. **Install the `@agentauth/sdk` package in your project**

```bash
# Add to your MCP server
npm install @agentauth/sdk
```

2. **Identify and authenticate agents anywhere in your code**

AgentAuth's SDK makes it easy to identify and authenticate agents **anywhere in your code**. For example:
- On initial connection or in middleware (e.g. to reject unauthenticated agents)
- Beginning of a tool call (e.g. to gate a feature for authenticated users)
- In the middle of a tool call (e.g. to return different results for authenticated and unauthenticated users)

All you need to do is use the SDK's `verify` method:
- Simultaneously **retrieves and authenticates** the agent's `AgentAuth ID` — a stable, unique, verifiable UUID
- Ensures that the request is coming from the controller of that `AgentAuth ID`

Here is a simple example showing how to use `verify` to identify and authenticate an agent during a tool call:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { verify } from '@agentauth/sdk';

const server = new McpServer({ name: "my-server", version: "1.0.0" });

// Any tool can check authentication
server.tool("premium-feature", "Premium tool with auth", {}, async () => {
  // Replace `getRequestHeaders` with however your transport exposes HTTP headers
  const authResult = verify({ headers: getRequestHeaders() });
  
  if (authResult.valid) {
    // Store the UUID in your database!
    const agentId = authResult.agentauth_id;
    return { content: [{ type: "text", text: `Premium access granted! Agent ID: ${agentId}` }] };
  }
  
  return { content: [{ type: "text", text: "🔒 This feature requires authentication" }] };
});
```

## ✨ Key Features

- **🆔 Self-Authenticating IDs** — Each `AgentAuth Token` generates *both* a stable UUID (`AgentAuth ID`) and authentication capability
- **⚡ Single Token Flow** — For MCP client users, `AgentAuth Token` provides complete identity + auth
- **🔐 Zero Infrastructure** — For MCP server devs, no accounts, logins, or session management infra required
- **🗄️ Database-Ready UUID** — Store and use `AgentAuth ID` immediately, no extra steps
- **🔧 MCP-Native** — Built specifically for communication over MCP specs

## 📦 AgentAuth Packages Overview

**Where to start:**
- **MCP Client Users** — Use [`@agentauth/mcp`](./packages/agentauth-mcp) to connect any MCP client to any remote MCP server, with universal auth support
- **MCP Server Developers** — Use [`@agentauth/sdk`](./packages/agentauth-sdk) to easily add MCP-native authentication to your servers
- **Advanced Users** — Read [`@agentauth/core`](./packages/agentauth-core) to understand the underlying identity primitives and design decisions

| Package | Description | Install | Docs |
|---------|-------------|---------|------|
| **[@agentauth/mcp](./packages/agentauth-mcp)** | Universal MCP proxy — connect any client to any remote server, with or without authentication | `npm install -g @agentauth/mcp` | [📖 README](./packages/agentauth-mcp/README.md) |
| **[@agentauth/sdk](./packages/agentauth-sdk)** | Server-side SDK — add MCP-native authentication to your servers with one function call | `npm install @agentauth/sdk` | [📖 README](./packages/agentauth-sdk/README.md) |
| **[@agentauth/core](./packages/agentauth-core)** | Core identity primitives — identity generation, signing, and verification using cryptography | (Auto-installed) | [📖 README](./packages/agentauth-core/README.md) |

**Additional resources for MCP Server developers:**
- **[Working Example](./examples/weather-server/)** — Complete example with tiered authentication, dual transport support, and real-world integration patterns
- **[End-to-End Tests](./tests/e2e/)** — Comprehensive test scenarios demonstrating authentication flows and MCP client integration
- **[Unit Tests](./packages/)** — Individual package tests located in each `src/` directory for detailed API testing
- **[Testing Guide](./TESTING.md)** — Testing guide 

## 🏗️ How AgentAuth Works

1. **One Token**: Generate a single `AgentAuth Token`
2. **Automatic Identity**: Token derives an `AgentAuth ID` (a stable, verifiable UUID)
3. **Self-Authentication**: Every request includes verifiable proof
4. **Instant Verification**: Servers verify and extract the `AgentAuth ID` in one step
5. **Ready to Use**: Use the `AgentAuth ID` immediately in your database

No additional steps. No account creation. No session management.

**Technical Flow**

```mermaid
flowchart
    A[MCP Client<br/>AI Agent] -- Make request to MCP Server --> B[MCP Proxy<br/>@agentauth/mcp]
    B -- Sign request headers with AgentAuth Token --> C[MCP Server<br/>@agentauth/sdk]
    C -- Verify signed headers --> D[Return AgentAuth ID<br/>Authenticated UUID]
```

## 🎯 Use Cases

- **Premium MCP Tools** — Offer authenticated features alongside free tiers
- **Usage Tracking** — Monitor agent activity with stable, anonymous IDs
- **Access Control** — Implement tool-level permissions and rate limiting  
- **Analytics** — Understand agent behavior without compromising privacy

## 🚀 Getting Started

### MCP Client Configuration

As an MCP client user, you will be using the [`@agentauth/mcp`](./packages/agentauth-mcp) package. See the README there for more details.

1. **Generate your agent's `AgentAuth Token`:

```bash
npm install -g @agentauth/mcp
agentauth-mcp generate
# Output:
AGENTAUTH_ID=...
AGENTAUTH_TOKEN=aa-...
```

The `generate` command generates a unique `AgentAuth Token` (starts with `aa-`) for your agent.

The `AgentAuth Token` is like the password for a corresponding `AgentAuth ID` — and, since the `AgentAuth Token` is used to derive the `AgentAuth ID`, it's all you need to include in your configuration for both identity and auth!

> [!NOTE]
> - Store your `AgentAuth Token` immediately, as it will only be **shown to you once** each time you use `generate`
> - Treat your `AgentAuth Token` like your agent's password — **store it securely** and **never share it with anyone**

> [!TIP]
> You can check your corresponding `AgentAuth ID` anytime using `derive <AgentAuth Token>`:
> ```bash
> agentauth-mcp derive aa-...
> # Output: AGENTAUTH_ID=...
> ```

2. **Add it to your MCP client configuration file:**

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

The `@agentauth/mcp` proxy is designed to be your universal, long-term proxy for **ALL** remote MCP server connections. This means that:
- Once added, you can keep this configuration the same for as long as you use the MCP server
- You can use the same configuration for **any remote MCP** server, even ones that don't use AgentAuth
- You can safely use the same `AgentAuth Token` when connecting to **any** MCP server that uses AgentAuth
- Basically, all you need to do is copy and paste the same config for every new remote MCP server you want to connect to (just update the URL after `connect`)!

> [!NOTE]
> - The `AgentAuth Token` is only ever **used locally** by the @agentauth/mcp package, and **never sent** to the MCP server
> - The server only receives information to derive your `AgentAuth ID` and verify that you have the corresponding `AgentAuth Token`

### MCP Server Integration

As an MCP server developer, you will want to install and import the [`@agentauth/sdk`](./packages/agentauth-sdk) package. See the README there for more details.

**Authenticating Requests:**

The key method is `verify()`, which takes request headers and returns the **verified AgentAuth UUID** of the agent if the request is properly authenticated.

This means that you can authenticate requests on the fly without requiring any *a priori* "login" in the traditional sense, making the communication process much more streamlined and MCP-native.
- **Connections** — Authenticate connections immediately (e.g. in middleware) to identify and authenticate agents
- **Requests** — Authenticate incoming requests at any point (e.g. on receipt, during tool calls, or inline)
- **Tool calls** — Authenticate at the beginning of tool calls (or even in the middle of one) to provide authentication-based responses

**AgentAuth ID as UUID:**

Moreover, the `AgentAuth ID` is a stable, verifiable UUID for any agent, derived from its `AgentAuth Token` (generated on the client-side), giving it a long-term, universal *identity*.

This means that you can simply and safely treat the UUID returned by `verify` as an **authenticated user of your service** — just like a user ID. For example:
- **Create** — Create an entry in your DB to identify the agent using its `AgentAuth ID` (e.g. for first-time users)
- **Retrieve** — Retrieve the agent in your DB using its `AgentAuth ID` to read or update properties (e.g. for return users)
- **Forward** — Forward the `AgentAuth ID` to third-party services to request additional information or permissions for the agent

Here is a simple example implementation:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { verify } from '@agentauth/sdk';
import { z } from 'zod';

const server = new McpServer({ name: "my-server", version: "1.0.0" });

// Helper to get auth context
function getAuthContext() {
  // Replace with how your transport exposes HTTP headers
  const authResult = verify({ headers: getCurrentRequestHeaders() });
  return authResult.valid ? authResult : null;
}

// Free tool - enhanced for authenticated users
server.tool(
  "get-data",
  "Get data (more for authenticated users)",
  { query: z.string() },
  async ({ query }) => {
    const auth = getAuthContext();
    
    if (auth) {
      // Store/log the agent UUID for analytics!
      console.log(`Agent ${auth.agentauth_id} requested: ${query}`);
      return { 
        content: [{ 
          type: "text", 
          text: `Premium data for agent ${auth.agentauth_id.slice(0, 8)}...` 
        }] 
      };
    }
    
    return { content: [{ type: "text", text: "Basic data (authenticate for more!)" }] };
  }
);

// Premium tool - requires authentication
server.tool(
  "premium-feature",
  "Access premium features (requires auth)",
  {},
  async () => {
    const auth = getAuthContext();
    
    if (!auth) {
      return { 
        content: [{ 
          type: "text", 
          text: "🔒 Premium feature requires authentication.\nGenerate credentials: `agentauth-mcp generate`" 
        }] 
      };
    }
    
    // Use the stable UUID for user-specific features
    const agentId = auth.agentauth_id;
    // Query your database, track usage, etc.
    
    return { content: [{ type: "text", text: `Premium access granted for ${agentId}!` }] };
  }
);
```

## 🔒 Security Features

- **`AgentAuth Token` never leaves your machine** — Only used locally and only stored in your local config
- **Derived identity** — Only your derived `AgentAuth ID` is shared with servers, never tokens
- **Timestamp-based replay protection** — 60-second window prevents replay attacks  
- **Cryptographic signatures** — Every request is signed with your `AgentAuth Token`
- **No server-side state required** — Completely stateless verification

## 🛠️ Development

**Fresh repository clone setup:**

```bash
# Clone the repository
git clone https://github.com/agentauthco/agentauth.git
cd agentauth

# Install all workspace dependencies (packages, examples, tests)
pnpm install

# Build all packages (required before running examples/tests)
pnpm run build

# Run all package unit tests
pnpm test

# Run e2e integration tests
cd tests/e2e && pnpm test

# Run the example weather server
cd examples/weather-server && pnpm run start  # Starts the weather server at http://localhost:8000/mcp using HTTP by default
```

> [!NOTE]
> This is a `pnpm` workspace project. You can use `workspace:*` for local dependencies and `pnpm` for installation and development.

## 📚 Documentation

**Package Documentation:**
- **[@agentauth/mcp README](./packages/agentauth-mcp/README.md)** — Universal MCP proxy for connecting clients to remote servers
- **[@agentauth/sdk README](./packages/agentauth-sdk/README.md)** — Server-side SDK for adding MCP-native authentication
- **[@agentauth/core README](./packages/agentauth-core/README.md)** — Core identity primitives and cryptographic functions

**Examples and Testing:**
- **[Working Example](./examples/weather-server/README.md)** — Complete weather server with tiered authentication
- **[Testing Guide](./TESTING.md)** — Comprehensive development and testing documentation
- **[Tests Directory](./tests/README.md)** — Overview of test structure and quick start commands

**External Resources:**
- **[Documentation Site](https://docs.agentauth.co)** — Complete API reference and guides

## 🤝 Contributing

AgentAuth ID is an early-stage open-source project maintained by the AgentAuth team. We welcome bug reports, feature suggestions, and early feedback via [GitHub Issues](https://github.com/agentauthco/agentauth/issues). You can also reach out at [developers@agentauth.co](mailto:developers@agentauth.co?subject=Contributing%20to%20AgentAuth) if you are interested in contributing.

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

## 🔗 Links

- **Website** — [agentauth.co](https://agentauth.co)
- **Documentation** — [docs.agentauth.co](https://docs.agentauth.co)  
- **npm** — [@agentauth](https://www.npmjs.com/org/agentauth)
- **Issues** — [GitHub Issues](https://github.com/agentauthco/agentauth/issues)

---

**Built by [AgentAuth](https://agentauth.co)** — The Collaboration Layer for AI Agents.
