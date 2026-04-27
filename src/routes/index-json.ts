import type { APIRoute } from 'astro';
import type { SkillData, SkillsIndex } from '../types.js';
import { SCHEMA_URI } from '../types.js';

/**
 * GET /.well-known/agent-skills/index.json
 *
 * Returns a JSON index of all available skills per the Agent Skills Discovery RFC v0.2.0.
 *
 * @see https://github.com/agentskills/agentskills/pull/254
 */
export const GET: APIRoute = async () => {
	// Dynamic import of virtual module - resolved at runtime by Astro
	// @ts-expect-error - astro:content is a virtual module only available at runtime
	const { getCollection } = await import('astro:content');
	const skills = await getCollection('skills');

	const index: SkillsIndex = {
		$schema: SCHEMA_URI,
		skills: skills.map(
			(skill: { id: string; data: SkillData }) => {
				const { name, type, description, digest } = skill.data;

				// Determine URL based on type
				const url =
					type === 'archive'
						? `/.well-known/agent-skills/${skill.id}.tar.gz`
						: `/.well-known/agent-skills/${skill.id}/SKILL.md`;

				return {
					name,
					type,
					description,
					url,
					digest,
				};
			}
		),
	};

	return new Response(JSON.stringify(index, null, 2), {
		status: 200,
		headers: {
			'Content-Type': 'application/json',
			'Cache-Control': 'public, max-age=3600',
		},
	});
};
