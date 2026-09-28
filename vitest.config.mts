import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		environment: 'node',
		include: ['test/**/*.test.ts'],
		// The smoke lane runs real n8n containers and is driven by test/smoke/run.sh.
		exclude: ['test/smoke/**'],
		testTimeout: 30_000,
	},
});
