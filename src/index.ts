import type { AstroIntegration } from 'astro';
import { resolveSkillsMcpOptions } from './mcp.js';
import type { ResolvedSkillsMcpOptions, SkillsIntegrationOptions } from './types.js';

// Re-export the loader for use in content.config.ts
export { skillsLoader } from './loader.js';

// Re-export types
export type {
	ResolvedSkillsMcpOptions,
	Skill,
	SkillData,
	SkillFileData,
	SkillFrontmatter,
	SkillsIndex,
	SkillsIndexEntry,
	SkillsIntegrationOptions,
	SkillsLoaderOptions,
	SkillsMcpArchiveEntry,
	SkillsMcpIndex,
	SkillsMcpIndexEntry,
	SkillsMcpOptions,
	SkillsMcpTree,
	SkillsMcpTreeDirectoryEntry,
	SkillsMcpTreeEntry,
	SkillsMcpTreeFileEntry,
	SkillType,
} from './types.js';

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
export default function skillsIntegration(options: SkillsIntegrationOptions = {}): AstroIntegration {
	const mcpOptions = resolveSkillsMcpOptions(options.mcp);

	return {
		name: PKG_NAME,
		hooks: {
			'astro:config:setup': ({ injectRoute, logger, updateConfig }) => {
				logger.info('Setting up Agent Skills Discovery routes');

				// Inject the index.json route
				injectRoute({
					pattern: '/.well-known/agent-skills/index.json',
					entrypoint: 'astro-skills/routes/index-json',
				});

				// Inject the resource route for skill-md and archive type skills
				injectRoute({
					pattern: '/.well-known/agent-skills/[...path]',
					entrypoint: 'astro-skills/routes/agent-skill-resource',
				});

				logger.info('Agent Skills Discovery routes configured');

				if (mcpOptions) {
					updateConfig({
						vite: {
							plugins: [mcpConfigPlugin(mcpOptions)],
						},
					});

					injectRoute({
						pattern: `${mcpOptions.prefix}/[...path]`,
						entrypoint: 'astro-skills/routes/mcp',
					});

					logger.info(`Experimental MCP Skills routes configured at ${mcpOptions.prefix}`);
				}
			},
		},
	};
}

function mcpConfigPlugin(config: ResolvedSkillsMcpOptions) {
	const virtualModuleId = 'astro-skills:mcp-config';
	const resolvedVirtualModuleId = `\0${virtualModuleId}`;

	return {
		name: 'astro-skills:mcp-config',
		resolveId(id: string) {
			if (id === virtualModuleId) {
				return resolvedVirtualModuleId;
			}
			return undefined;
		},
		load(id: string) {
			if (id === resolvedVirtualModuleId) {
				return `export default ${JSON.stringify(config)};`;
			}
			return undefined;
		},
	};
}
