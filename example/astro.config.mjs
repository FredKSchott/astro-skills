// @ts-check

import skills from 'astro-skills';
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
	integrations: [
		skills({
			mcp: {
				prefix: '/.well-known/mcp/skills',
				resourceBase: 'skill://',
				directoryManifest: true,
				archives: true,
			},
		}),
	],
});
