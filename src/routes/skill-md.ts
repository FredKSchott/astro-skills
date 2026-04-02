import type { APIRoute, GetStaticPaths } from 'astro';
import type { SkillData } from '../types.js';

/**
 * Generate static paths for skill-md type skills.
 * This enables static generation for the dynamic [skill]/SKILL.md route.
 */
export const getStaticPaths: GetStaticPaths = async () => {
	// Dynamic import of virtual module - resolved at runtime by Astro
	// @ts-expect-error - astro:content is a virtual module only available at runtime
	const { getCollection } = await import('astro:content');
	const skills = await getCollection('skills');

	// Only generate paths for skill-md type skills
	// Archive skills serve SKILL.md embedded within the .tar.gz archive
	return skills
		.filter((skill: { data: SkillData }) => skill.data.type === 'skill-md')
		.map((skill: { id: string }) => ({
			params: { skill: skill.id },
		}));
};

/**
 * GET /.well-known/agent-skills/[skill]/SKILL.md
 *
 * Serves the SKILL.md file for a skill per the Agent Skills Discovery RFC v0.2.0.
 *
 * @see https://github.com/cloudflare/agent-skills-discovery-rfc
 */
export const GET: APIRoute = async ({ params }) => {
	const { skill } = params;

	if (!skill) {
		return new Response('Skill name is required', {
			status: 400,
			headers: { 'Content-Type': 'text/plain' },
		});
	}

	// Dynamic import of virtual module - resolved at runtime by Astro
	// @ts-expect-error - astro:content is a virtual module only available at runtime
	const { getEntry } = await import('astro:content');

	// Get the skill from the content collection
	const skillEntry = (await getEntry('skills', skill)) as { data: SkillData } | undefined;

	if (!skillEntry) {
		return new Response(`Skill "${skill}" not found`, {
			status: 404,
			headers: { 'Content-Type': 'text/plain' },
		});
	}

	return new Response(skillEntry.data.skillMdRaw, {
		status: 200,
		headers: {
			'Content-Type': 'text/markdown',
			'Cache-Control': 'public, max-age=3600',
		},
	});
};
