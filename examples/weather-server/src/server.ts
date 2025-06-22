#!/usr/bin/env node

/*
 * Copyright (c) 2025 AgentCore Labs
 * SPDX-License-Identifier: MIT
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import cors from "cors";
import { z } from "zod";
import { verify as verifyAgentAuth } from "@agentauth/sdk";

const NWS_API_BASE = "https://api.weather.gov";
const USER_AGENT = "agentauth-weather-example/1.0";

// Parse command line arguments
const args = process.argv.slice(2);
const transportArg = args.find(arg => arg.startsWith('--transport='));
const TRANSPORT_MODE = transportArg ? transportArg.split('=')[1] : 'http'; // default to HTTP
const PORT = process.env.PORT || 8000;

console.log(`🚀 Starting AgentAuth Weather Server`);
console.log(`📡 Transport: ${TRANSPORT_MODE.toUpperCase()}`);
console.log(`🌐 Port: ${PORT}`);

// Helper function for making NWS API requests
async function makeNWSRequest<T>(url: string): Promise<T | null> {
  const headers = {
    "User-Agent": USER_AGENT,
    Accept: "application/geo+json",
  };

  try {
    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return (await response.json()) as T;
  } catch (error) {
    console.error("Error making NWS request:", error);
    return null;
  }
}

interface AlertFeature {
  properties: {
    event?: string;
    areaDesc?: string;
    severity?: string;
    status?: string;
    headline?: string;
  };
}

interface ForecastPeriod {
  name?: string;
  temperature?: number;
  temperatureUnit?: string;
  windSpeed?: string;
  windDirection?: string;
  shortForecast?: string;
}

interface ForecastResponse {
  properties: {
    periods: ForecastPeriod[];
  };
}

interface AlertsResponse {
  features: AlertFeature[];
}

interface PointsResponse {
  properties: {
    forecast: string;
  };
}

// Format alert data
function formatAlert(feature: AlertFeature): string {
  const props = feature.properties;
  return [
    `Event: ${props.event || "Unknown"}`,
    `Area: ${props.areaDesc || "Unknown"}`,
    `Severity: ${props.severity || "Unknown"}`,
    `Status: ${props.status || "Unknown"}`,
    `Headline: ${props.headline || "No headline"}`,
    "---",
  ].join("\n");
}

// Create server instance
const server = new McpServer({
  name: "agentauth-weather-example",
  version: "1.0.0",
});

// Helper function to get auth context for the current request
function getAuthForCurrentRequest(): any {
  const currentTransport = (server as any)._currentTransport;
  
  if (!currentTransport) return null;
  
  // Get auth context from current transport (set by HTTP/SSE handlers)
  const sessionAuthContext = (currentTransport as any).sessionAuthContext;
  return sessionAuthContext?.extra?.agentauth || null;
}

// Register authentication status tool
server.tool(
  "auth-status",
  "Check your AgentAuth authentication status and get more info about how to authenticate using AgentAuth",
  {},
  async () => {
    const auth = getAuthForCurrentRequest();
    console.error(`🔐 Auth status check - Agent: ${auth?.agentauth_id || 'unauthenticated'}`);
    
    const intro = `This MCP server uses AgentAuth for authentication.`;

    // If authenticated, return agent's AgentAuth ID
    if (auth) {
      return { 
        content: [{ 
          type: "text", 
          text: `${intro}\n\nYou are currently **authenticated**.\nYour **AgentAuth ID** is: \`${auth.agentauth_id}\``
        }] 
      };
    }

    // Otherwise, return information about how to authenticate
    const unauthMessage = `${intro}

You are currently **unauthenticated**.

To authenticate:
- If you already have an **AgentAuth Token** for this agent, please include it as an environment variable in this MCP server's configuration file.
- If not, please generate an **AgentAuth Token** (and corresponding **AgentAuth ID**) using [@agentauth/mcp](https://npmjs.com/package/@agentauth/mcp), then add it as an environment variable in this MCP server's configuration file.

**Example configuration:**
\`\`\`json
{
  "mcpServers": {
    "my-server": {
      "command": "agentauth-mcp",
      "args": [connect, http://localhost:8000/mcp/sse],
      "env": {
        "AGENTAUTH_TOKEN": "aa-..."
      }
    }
  }
}
\`\`\`

**Debugging tips:**
- If you have already included an **AgentAuth Token** but are still seeing this message, please check that:
  - Your token is valid and complete (starts with "aa-")
  - It's entered in the correct "env" property as shown above
  - You can verify your token using: \`agentauth-mcp derive <your_token>\`

Learn more about the open-source AgentAuth authentication standard at https://agentauth.co`;

    return {
      content: [{ 
        type: "text", 
        text: unauthMessage
      }] 
    };
  }
);

// Register weather tools
server.tool(
  "get-alerts",
  "Get weather alerts for a state (Premium Feature - Requires Authentication)",
  {
    state: z.string().length(2).describe("Two-letter state code (e.g. CA, NY)"),
  },
  async ({ state }) => {
    const agentauth = getAuthForCurrentRequest();
    console.error(`🚨 Alert request - State: ${state}, Agent: ${agentauth?.agentauth_id || 'anonymous'}`);
    
    // Check authentication
    if (!agentauth) {
      console.error(`🔒 Alert access denied - authentication required`);
      return {
        content: [
          {
            type: "text",
            text: `🔒 **Premium Feature: Weather Alerts**\n\nWeather alerts require AgentAuth authentication.\n\n💡 **To unlock:**\n1. Generate credentials: \`agentauth-mcp generate\`\n2. Add to your MCP client config\n3. Restart and try again\n\n📊 **What you're missing:**\n• Real-time weather alerts for ${state.toUpperCase()}\n• Severe weather warnings\n• Emergency notifications\n\n🌟 **Example with auth:** Same command, but with full alert data!`,
          },
        ],
      };
    }

    console.error(`✅ Alert access granted - Agent: ${agentauth.agentauth_id}`);
    const stateCode = state.toUpperCase();
    const alertsUrl = `${NWS_API_BASE}/alerts?area=${stateCode}`;
    const alertsData = await makeNWSRequest<AlertsResponse>(alertsUrl);

    if (!alertsData) {
      return {
        content: [
          {
            type: "text",
            text: "Failed to retrieve alerts data from National Weather Service",
          },
        ],
      };
    }

    const features = alertsData.features || [];
    if (features.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `✅ **Premium Alerts for ${stateCode}**\n\nNo active weather alerts for ${stateCode}\n\n🛡️ *Authenticated via AgentAuth*\nAgent ID: ${agentauth.agentauth_id.slice(0, 8)}...\n\n💡 Try checking a different state or get a forecast!`,
          },
        ],
      };
    }

    const formattedAlerts = features.map(formatAlert);
    const alertsText = `🚨 **Premium Alerts for ${stateCode}**\n\n${formattedAlerts.join("\n")}\n🛡️ *Authenticated via AgentAuth*\nAgent ID: ${agentauth.agentauth_id.slice(0, 8)}...`;

    return {
      content: [
        {
          type: "text",
          text: alertsText,
        },
      ],
    };
  }
);

server.tool(
  "get-forecast",
  "Get weather forecast for a location (Enhanced for authenticated users)",
  {
    latitude: z.number().min(-90).max(90).describe("Latitude of the location"),
    longitude: z
      .number()
      .min(-180)
      .max(180)
      .describe("Longitude of the location"),
  },
  async ({ latitude, longitude }) => {
    const agentauth = getAuthForCurrentRequest();
    console.error(`🌤️ Forecast request - Lat: ${latitude}, Lon: ${longitude}, Agent: ${agentauth?.agentauth_id || 'anonymous'}`);
    
    // Get grid point data
    const pointsUrl = `${NWS_API_BASE}/points/${latitude.toFixed(4)},${longitude.toFixed(4)}`;
    const pointsData = await makeNWSRequest<PointsResponse>(pointsUrl);

    if (!pointsData) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Failed to get weather data for coordinates: ${latitude}, ${longitude}\n\n💡 This location may not be supported by the NWS API (US locations only)\n\n🌍 **Try these coordinates:**\n• San Francisco: 37.7749, -122.4194\n• New York: 40.7128, -74.0060\n• Miami: 25.7617, -80.1918`,
          },
        ],
      };
    }

    const forecastUrl = pointsData.properties?.forecast;
    if (!forecastUrl) {
      return {
        content: [
          {
            type: "text",
            text: "Failed to get forecast URL from grid point data",
          },
        ],
      };
    }

    // Get forecast data
    const forecastData = await makeNWSRequest<ForecastResponse>(forecastUrl);
    if (!forecastData) {
      return {
        content: [
          {
            type: "text",
            text: "Failed to retrieve forecast data from National Weather Service",
          },
        ],
      };
    }

    const periods = forecastData.properties?.periods || [];
    if (periods.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: "No forecast periods available for this location",
          },
        ],
      };
    }

    // Format forecast periods (limit for anonymous users)
    const periodsToShow = agentauth ? periods : periods.slice(0, 3);
    const formattedForecast = periodsToShow.map((period: ForecastPeriod) =>
      [
        `**${period.name || "Unknown"}:**`,
        `🌡️ Temperature: ${period.temperature || "Unknown"}°${period.temperatureUnit || "F"}`,
        `💨 Wind: ${period.windSpeed || "Unknown"} ${period.windDirection || ""}`,
        `☁️ ${period.shortForecast || "No forecast available"}`,
        "---",
      ].join("\n")
    );

    let forecastText = `🌤️ **Weather Forecast** for ${latitude}, ${longitude}:\n\n${formattedForecast.join("\n")}`;

    // Add authentication-specific messaging
    if (agentauth) {
      console.error(`✅ Enhanced forecast provided - Agent: ${agentauth.agentauth_id}`);
      forecastText += `\n\n🛡️ **Premium Access**\n• Showing full ${periods.length}-day forecast\n• Agent ID: ${agentauth.agentauth_id.slice(0, 8)}...\n\n💡 **Try next:** \\"Get weather alerts for [state]\\" for real-time alerts!`;
    } else {
      console.error(`📊 Basic forecast provided - anonymous user`);
      if (periods.length > 3) {
        forecastText += `\n\n📊 **Unauthenticated Access**\n• Showing first 3 days (${periods.length} days available)\n• Generate AgentAuth credentials for full forecast\n\n🔓 **Authentication benefits:**\n• Full extended forecast\n• Weather alerts and warnings\n• Stable agent identity\n\n💡 Generate credentials: \`agentauth-mcp generate\``;
      } else {
        forecastText += `\n\n🔓 **Add AgentAuth Credentials** for premium features!\n💡 Generate credentials: \`agentauth-mcp generate\``;
      }
    }

    return {
      content: [
        {
          type: "text",
          text: forecastText,
        },
      ],
    };
  }
);

// --- EXPRESS-BASED SERVER SETUP ---

const app = express();
app.use(cors());
app.use(express.json());

// AgentAuth middleware - supports both authenticated and unauthenticated connections
app.use(async (req, _res, next) => {
  const authResult = verifyAgentAuth({ headers: req.headers });
  if (authResult.valid) {
    console.error(`✅ Authenticated request - Agent: ${authResult.agentauth_id}`);
    // Store in MCP SDK's expected auth format
    (req as any).auth = {
      clientId: authResult.agentauth_id,
      extra: {
        agentauth: authResult  // Contains agentauth_id and valid flag
      }
    };
  } else {
    console.error(`ℹ️  Unauthenticated request`);
  }
  next();
});

if (TRANSPORT_MODE === 'sse') {
  console.log('🔧 Setting up SSE transport endpoints');
  
  // SSE-specific storage for multiple concurrent connections
  const sseTransports: Record<string, SSEServerTransport> = {};

  // SSE connection endpoint to establish a new session
  app.get("/mcp/sse", (req, res) => {
    console.error(`🔗 New SSE connection - Auth: ${(req as any).auth ? 'YES' : 'NO'}`);
    
    const transport = new SSEServerTransport("/mcp/messages", res);
    
    sseTransports[transport.sessionId] = transport;
    console.error(`📝 Session ID: ${transport.sessionId}`);

    res.on("close", () => {
      delete sseTransports[transport.sessionId];
      console.error(`👋 Client disconnected: ${transport.sessionId}`);
    });

    res.on("error", (error) => {
      console.error(`❌ Response error for ${transport.sessionId}:`, error);
      delete sseTransports[transport.sessionId];
    });

    server.connect(transport).catch((err) => {
      console.error(`❌ Error connecting server to transport: ${err}`);
    });
  });

  // Message handling endpoint for existing sessions
  app.post("/mcp/messages", async (req, res) => {
    const sessionId = req.query.sessionId as string;
    if (!sessionId) {
      return res.status(400).send("Missing sessionId query parameter");
    }

    const transport = sseTransports[sessionId];
    if (transport) {
      // Set auth context from current request (fresh headers verified by middleware)
      (transport as any).sessionAuthContext = (req as any).auth;
      // Set current transport so tool handlers can access it
      (server as any)._currentTransport = transport;
      await transport.handlePostMessage(req, res, req.body);
    } else {
      res.status(404).send(`No active transport found for sessionId: ${sessionId}`);
    }
  });

} else if (TRANSPORT_MODE === 'http') {
  console.log('🔧 Setting up Streamable HTTP transport endpoints');
  
  // Create transport with stateless mode (no session management)
  const httpTransport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // Stateless mode - this is key!
  });

  // Connect the server to transport once at startup
  server.connect(httpTransport).then(() => {
    console.log('🔗 MCP Server connected to HTTP transport');
  }).catch(err => {
    console.error('❌ Failed to connect server to HTTP transport:', err);
  });

  // Single endpoint for all MCP HTTP requests
  app.all("/mcp", async (req, res) => {
    console.error(`📡 HTTP ${req.method} request - Auth: ${(req as any).auth ? 'YES' : 'NO'}`);

    // Store auth context in transport for this request (same format as SSE)
    (httpTransport as any).sessionAuthContext = (req as any).auth;
    (server as any)._currentTransport = httpTransport;
    
    try {
      await httpTransport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error(`❌ Error handling HTTP request:`, error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  });

} else {
  console.error(`❌ Unknown transport mode: ${TRANSPORT_MODE}. Use --transport=sse or --transport=http`);
  process.exit(1);
}

// Health check endpoint
app.get("/health", (_req, res) => {
  res.json({ 
    status: "ok", 
    name: "AgentAuth Weather Example",
    transport: TRANSPORT_MODE.toUpperCase(),
    endpoints: TRANSPORT_MODE === 'sse' ? ['/mcp/sse', '/mcp/messages'] : ['/mcp'],
    timestamp: new Date().toISOString()
  });
});

// Start the server
app.listen(PORT, () => {
  console.error(`🌟 AgentAuth Weather Server Ready!`);
  console.error(`🌐 URL: http://localhost:${PORT}`);
  if (TRANSPORT_MODE === 'sse') {
    console.error(`📡 SSE endpoint: http://localhost:${PORT}/mcp/sse`);
  } else {
    console.error(`📡 HTTP endpoint: http://localhost:${PORT}/mcp`);
  }
  console.error(`🏥 Health check: http://localhost:${PORT}/health`);
  console.error(`💡 Ready to test with agentauth-mcp!`);
  console.error(`📖 Example configs available in README.md`);
});