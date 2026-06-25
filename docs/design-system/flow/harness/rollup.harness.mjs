/**
 * Bundles the flow harness (real screens + mock backend) for headless rendering.
 *   npx rollup -c docs/design-system/flow/harness/rollup.harness.mjs
 * The inline `mock-backend` plugin swaps src/backends/index.js for mockBackend.js
 * (no extra dependency needed). Targets modern headless Chrome (no chrome53 babel).
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import nodeResolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import postcss from 'rollup-plugin-postcss';

const __dir = dirname(fileURLToPath(import.meta.url));
const mockPath = resolve(__dir, 'mockBackend.js');

const mockBackendPlugin = {
  name: 'mock-backend',
  resolveId(source) {
    if (source.replace(/\\/g, '/').endsWith('backends/index.js')) return mockPath;
    return null;
  },
};

export default {
  input: resolve(__dir, 'flowHarness.js'),
  output: { file: resolve(__dir, 'dist/flow-harness.js'), format: 'iife', name: 'FlowHarness' },
  plugins: [
    mockBackendPlugin,
    nodeResolve({ browser: true }),
    commonjs(),
    postcss({ extract: 'flow-harness.css' }),
  ],
};
