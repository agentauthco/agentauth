# AgentAuth Testing Guide

## 🎯 **Quick Test Commands**

### **Run All Unit Tests (Safe)**
```bash
# From monorepo root - runs all package tests individually
git clone https://github.com/agentauthco/agentauth.git
cd agentauth
pnpm install
pnpm run build
pnpm test

# Or run individually from each package directory:
cd packages/agentauth-core && pnpm test
cd packages/agentauth-sdk && pnpm test  
cd packages/agentauth-mcp && pnpm test

# Separate e2e tests
cd tests/e2e && pnpm test
```

### **⚠️ AVOID: Commands That Hang**
```bash
# DON'T USE - these will hang in watch mode:
npm test                    # ❌ Hangs in watch mode
npx vitest                  # ❌ Hangs in watch mode  
npx vitest run --reporter=verbose # ❌ Can hang with connection tests

# ALWAYS USE:
npx vitest run              # ✅ Single run, exits properly
```

## 📋 **Test Coverage Summary**

| Package | Tests | Purpose |
|---------|-------|---------|
| **agentauth-core** | 18 tests | Core cryptographic functions |
| **agentauth-sdk** | 11 tests | Address-based verification API |
| **agentauth-mcp** | 16 tests | CLI commands (generate, derive, connect) |
| **e2e-tests** | 8 tests | End-to-end CLI and server integration |

**Total: 53 tests**

## 🧪 **Test Categories**

### **1. Unit Tests**

#### **agentauth-core** (Core Cryptography)
- ✅ Private key parsing (aa-, 0x, raw hex formats)
- ✅ EVM-compatible address derivation
- ✅ Deterministic UUID generation
- ✅ Signature creation and verification
- ✅ Complete identity generation

#### **agentauth-sdk** (Server Verification)
- ✅ Address-based verification
- ✅ Header validation and error handling
- ✅ Timestamp freshness checking
- ✅ Multiple private key format support
- ✅ Simplified response format

#### **agentauth-mcp** (CLI Commands)
- ✅ `generate` command functionality
- ✅ `derive` command with multiple formats
- ✅ `connect` command validation
- ✅ Error handling and help output
- ✅ Integration with crypto-utils

### **2. E2E Tests**

#### **CLI Integration**
- ✅ Token generation and validation
- ✅ Address/ID derivation consistency
- ✅ Multiple private key format handling

#### **Server Integration**
- ✅ HTTP endpoint verification
- ✅ Authentication header processing
- ✅ Health check functionality

#### **Connection Testing (Limited)**
- ✅ Credential validation before connection
- ✅ Quick failure on invalid credentials
- ✅ Timeout handling for actual connections

## 🛠 **Manual Testing Checklist**

### **Working Example Server**

**1. Start the Weather Server**

```bash
# Start server (from repo root)
cd examples/weather-server
pnpm run build
pnpm run start # Defaults to HTTP
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

**3. Test in MCP Client**
Start/Restart your MCP client and try:
- "Check my authentication status"
- "Get weather forecast for Oakland, CA"
- "Get weather alerts for CA"

## 🚫 **Anti-Hanging Best Practices**

### **For Running Tests**
1. **Always use `npx vitest run`** - never plain `vitest` or `npm test`
2. **Use timeouts** for connection tests (`timeout: 3000`)
3. **Proper cleanup** in `afterAll()` hooks
4. **Don't test actual MCP connections** - they keep sockets open

### **For CLI Connection Tests**
1. **Use `execa` with timeout** instead of spawn
2. **Test credential validation** before actual connection
3. **Mock server endpoints** for quick HTTP tests
4. **Accept timeouts as success** for connection attempts

### **Test Design Principles**

```typescript
// ✅ Good - Tests specific functionality
it('should validate credentials format', async () => {
  const result = await execa('node', ['cli.js', 'connect', 'url'], {
    env: { AGENTAUTH_TOKEN: 'invalid' },
    timeout: 3000,
    reject: false
  });
  expect(result.exitCode).toBe(1);
});

// ❌ Bad - Can hang indefinitely  
it('should establish connection', async () => {
  const process = spawn('node', ['cli.js', 'connect', 'url']);
  await new Promise(resolve => {
    process.stdout.on('data', data => {
      if (data.includes('connected')) resolve();
    });
  });
});
```

## 🔍 **Debugging Failed Tests**

### **Common Issues**

1. **Module not found errors**
   ```bash
   # Solution: Build packages first
   cd agentauth-packages && pnpm run build
   ```

2. **Timeout errors**
   ```bash
   # Check if using proper run mode
   npx vitest run  # ✅ Correct
   npx vitest      # ❌ Watch mode
   ```

3. **Path resolution errors**
   ```bash
   # Verify CLI is built and in correct location
   ls packages/agentauth-mcp/dist/proxy.js
   ```

4. **Port conflicts**
   ```bash
   # E2E tests use dynamic ports via get-port
   # Check if any services blocking port ranges
   ```

### **Test Output Analysis**

```bash
# Verbose test output for debugging
npx vitest run --reporter=verbose

# Run specific test file
npx vitest run src/index.test.ts

# Run specific test pattern
npx vitest run -t "should generate"
```

## 📈 **Test Maintenance**

### **When Adding New Features**
1. Add unit tests to relevant package
2. Update e2e tests if CLI changes
3. Update this guide with new commands
4. Verify no hanging behavior

### **Regular Health Checks**

```bash
# Weekly test run to ensure no regressions
cd agentauth-packages
pnpm run build && pnpm run test
```

### **Before Releases**
1. ✅ All unit tests pass
2. ✅ E2E tests pass  
3. ✅ Manual working example test
4. ✅ Claude Desktop integration test
5. ✅ No hanging test processes

## 🏆 **Test Success Criteria**

- **agentauth-core**: 18/18 tests passing
- **agentauth-sdk**: 11/11 tests passing  
- **agentauth-mcp**: 13/13 tests passing
- **e2e-tests**: 7/7 tests passing
- **Manual tests**: Working example functional
- **Zero hanging processes** after test completion

---

**Remember: If a test command doesn't exit within 30 seconds, it's probably hanging. Use Ctrl+C and switch to `npx vitest run`.**