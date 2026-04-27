import type { AstroIntegration } from 'astro';

// Re-export the loader for use in content.config.ts
export { skillsLoader } from './loader.js';

// Re-export types
export type { Skill, SkillData, SkillsIndex, SkillsIndexEntry, SkillsLoaderOptions, SkillType } from './types.js';

const PKG_NAME = 'astro-skills';

/**
 * Astro integration for Agent Skills Discovery (v0.2.0).
 *
 * This integration:
 * 1. Injects routes for serving skills via the `.well-known/agent-skills` path
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
					pattern: '/.well-known/agent-skills/index.json',
					entrypoint: 'astro-skills/routes/index-json',
				});

				// Inject the SKILL.md route for skill-md type skills
				injectRoute({
					pattern: '/.well-known/agent-skills/[skill]/SKILL.md',
					entrypoint: 'astro-skills/routes/skill-md',
				});

				// Inject the archive route for archive type skills
				injectRoute({
					pattern: '/.well-known/agent-skills/[skill].tar.gz',
					entrypoint: 'astro-skills/routes/skill-archive',
				});

				// Keep the legacy v0.1 discovery paths working while clients migrate to v0.2.
				injectRoute({
					pattern: '/.well-known/skills/index.json',
					entrypoint: 'astro-skills/routes/index-json',
				});
				injectRoute({
					pattern: '/.well-known/skills/[skill]/SKILL.md',
					entrypoint: 'astro-skills/routes/skill-md',
				});
				injectRoute({
					pattern: '/.well-known/skills/[skill].tar.gz',
					entrypoint: 'astro-skills/routes/skill-archive',
				});

				logger.info('Agent Skills Discovery routes configured');
			},
		},
	};
}
