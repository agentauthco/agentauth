import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@agentauth/core': path.resolve(__dirname, '../../packages/agentauth-core/src'),
      '@agentauth/sdk': path.resolve(__dirname, '../../packages/agentauth-sdk/src'),
    },
  },
  test: {
    // Set a longer timeout as E2E tests involving file system and child processes can be slow.
    testTimeout: 20000,
    // Vitest's underlying Vite engine needs a hint to correctly handle some ESM-only packages.
    // This is especially true for tests running in a Node.js environment.
    deps: {
      optimizer: {
        ssr: {
          include: ['execa', 'get-port'],
        },
      },
    },
  },
}); 