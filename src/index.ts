import type { AstroIntegration } from 'astro';

// Re-export the loader for use in content.config.ts
export { skillsLoader } from './loader.js';

// Re-export types
export type { Skill, SkillData, SkillFile, SkillsIndex, SkillsLoaderOptions } from './types.js';

const PKG_NAME = 'astro-skills';

/**
 * Astro integration for Agent Skills Discovery.
 *
 * This integration:
 * 1. Injects routes for serving skills via the `.well-known/skills` path
 * 2. Works with the `skillsLoader` to load skills from the filesystem
 *
 * @example
 * ```ts
 * // astro.config.mjs
 * import { defineConfig } from 'astro/config';
 * import skills from 'astro-skills';
 *
 * export default defineConfig({
 *   integrations: [skills()],
 * });
 * ```
 *
 * You also need to configure the content collection:
 *
 * ```ts
 * // src/content.config.ts
 * import { defineCollection } from 'astro:content';
 * import { skillsLoader } from 'astro-skills';
 *
 * export const collections = {
 *   skills: defineCollection({
 *     loader: skillsLoader({ base: './skills' }),
 *   }),
 * };
 * ```
 *
 * @see https://agentskills.io/
 */
export default function skillsIntegration(): AstroIntegration {
	return {
		name: PKG_NAME,
		hooks: {
			'astro:config:setup': ({ injectRoute, logger }) => {
				logger.info('Setting up Agent Skills Discovery routes');

				// Inject the index.json route
				injectRoute({
					pattern: '/.well-known/skills/index.json',
					entrypoint: 'astro-skills/routes/index-json',
				});

				// Inject the catch-all skill files route
				// This handles /.well-known/skills/[skill]/[...path]
				// When path is empty/undefined, it defaults to SKILL.md
				injectRoute({
					pattern: '/.well-known/skills/[skill]/[...path]',
					entrypoint: 'astro-skills/routes/skill-files',
				});

				logger.info('Agent Skills Discovery routes configured');
			},
		},
	};
}
