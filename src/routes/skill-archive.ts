import type { APIRoute, GetStaticPaths } from 'astro';
import type { SkillData } from '../types.js';

/**
 * Generate static paths for all archive type skills.
 * This enables static generation for the dynamic [skill].tar.gz route.
 */
export const getStaticPaths: GetStaticPaths = async () => {
	// Dynamic import of virtual module - resolved at runtime by Astro
	// @ts-expect-error - astro:content is a virtual module only available at runtime
	const { getCollection } = await import('astro:content');
	const skills = await getCollection('skills');

	// Only generate paths for archive type skills
	return skills
		.filter((skill: { data: SkillData }) => skill.data.type === 'archive')
		.map((skill: { id: string }) => ({
			params: { skill: skill.id },
		}));
};

/**
 * GET /.well-known/agent-skills/[skill].tar.gz
 *
 * Serves the pre-generated tar.gz archive for an archive type skill
 * per the Agent Skills Discovery RFC v0.2.0.
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

	if (skillEntry.data.type !== 'archive' || !skillEntry.data.archive) {
		return new Response(`Skill "${skill}" is not available as an archive`, {
			status: 404,
			headers: { 'Content-Type': 'text/plain' },
		});
	}

	// Decode the base64-encoded archive
	const archiveBuffer = Buffer.from(skillEntry.data.archive, 'base64');

	return new Response(archiveBuffer, {
		status: 200,
		headers: {
			'Content-Type': 'application/gzip',
			'Cache-Control': 'public, max-age=3600',
			'Content-Length': archiveBuffer.length.toString(),
		},
	});
};
