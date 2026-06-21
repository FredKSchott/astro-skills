import type { APIRoute, GetStaticPaths } from 'astro';
import type { SkillData } from '../types.js';

type FileResourceProps = {
	body: string;
	contentType: 'text/markdown; charset=utf-8';
	encoding: 'utf-8';
	kind: 'file';
};

type ArchiveResourceProps = {
	body: string;
	contentType: 'application/gzip';
	encoding: 'base64';
	kind: 'archive';
};

type Props = FileResourceProps | ArchiveResourceProps;

const cacheHeaders = {
	'Cache-Control': 'public, max-age=3600',
};

/**
 * Generate static paths for legacy Agent Skills Discovery artifacts.
 */
export const getStaticPaths: GetStaticPaths = async () => {
	// Dynamic import of virtual module - resolved at runtime by Astro
	// @ts-expect-error - astro:content is a virtual module only available at runtime
	const { getCollection } = await import('astro:content');
	const skills = (await getCollection('skills')) as Array<{ id: string; data: SkillData }>;
	const paths: Array<{ params: { path: string }; props: Props }> = [];

	for (const skill of skills) {
		if (skill.data.type === 'archive' && skill.data.archive) {
			paths.push({
				params: { path: `${skill.id}.tar.gz` },
				props: {
					body: skill.data.archive,
					contentType: 'application/gzip',
					encoding: 'base64',
					kind: 'archive',
				},
			});
			continue;
		}

		paths.push({
			params: { path: `${skill.id}/SKILL.md` },
			props: {
				body: skill.data.skillMdRaw,
				contentType: 'text/markdown; charset=utf-8',
				encoding: 'utf-8',
				kind: 'file',
			},
		});
	}

	return paths;
};

/**
 * GET /.well-known/agent-skills/[...path]
 *
 * Serves legacy Agent Skills Discovery artifacts.
 */
export const GET: APIRoute<Props> = async ({ props }) => {
	const body = props.encoding === 'base64' ? decodeBase64(props.body) : props.body;

	return new Response(body, {
		status: 200,
		headers: resourceHeaders(props),
	});
};

export const HEAD: APIRoute<Props> = async ({ props }) => {
	return new Response(null, {
		status: 200,
		headers: resourceHeaders(props),
	});
};

function decodeBase64(body: string): ArrayBuffer {
	const buffer = Buffer.from(body, 'base64');
	return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

function resourceHeaders(props: Props): HeadersInit {
	return {
		...cacheHeaders,
		'Content-Type': props.contentType,
		'Content-Length': getContentLength(props).toString(),
	};
}

function getContentLength(props: Props): number {
	if (props.encoding === 'base64') {
		return Buffer.from(props.body, 'base64').byteLength;
	}

	return Buffer.byteLength(props.body, 'utf-8');
}
