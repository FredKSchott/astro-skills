import type { APIRoute, GetStaticPaths } from 'astro';
import { createSkillsMcpPublication } from '../mcp.js';
import type { ResolvedSkillsMcpOptions, SkillData } from '../types.js';
import { isTextMimeType } from '../utils.js';

// Injected by the integration's Vite plugin.
// @ts-expect-error - virtual module resolved by astro-skills at runtime
import mcpConfig from 'astro-skills:mcp-config';

type JsonArtifactProps = {
	body: string;
	contentType: 'application/json; charset=utf-8';
	kind: 'json';
};

type FileArtifactProps = {
	body: string;
	contentType: string;
	encoding: 'utf-8' | 'base64';
	kind: 'file';
};

type Props = JsonArtifactProps | FileArtifactProps;

const config = mcpConfig as ResolvedSkillsMcpOptions;
const cacheHeaders = {
	'Cache-Control': 'public, max-age=3600',
};

/**
 * Generate static paths for the experimental MCP/SEP skill publication.
 */
export const getStaticPaths: GetStaticPaths = async () => {
	// Dynamic import of virtual module - resolved at runtime by Astro
	// @ts-expect-error - astro:content is a virtual module only available at runtime
	const { getCollection } = await import('astro:content');
	const skills = (await getCollection('skills')) as Array<{ id: string; data: SkillData }>;
	const publication = createSkillsMcpPublication(skills, config);

	return [
		{
			params: { path: 'index.json' },
			props: jsonProps(publication.index),
		},
		...(config.directoryManifest
			? [
				{
					params: { path: '.tree.json' },
					props: jsonProps(publication.tree),
				},
			]
			: []),
		...publication.files.map((file) => ({
			params: { path: file.publicPath },
			props: {
				body: file.content,
				contentType: contentTypeHeader(file.mimeType),
				encoding: file.encoding,
				kind: 'file',
			} satisfies FileArtifactProps,
		})),
		...publication.archives.map((archive) => ({
			params: { path: archive.publicPath },
			props: {
				body: archive.content,
				contentType: archive.mimeType,
				encoding: archive.encoding,
				kind: 'file',
			} satisfies FileArtifactProps,
		})),
	];
};

/**
 * GET /.well-known/mcp/skills/[...path]
 *
 * Serves experimental SEP-2640/MCP skill artifacts.
 */
export const GET: APIRoute<Props> = async ({ props }) => {
	if (props.kind === 'json') {
		return new Response(props.body, {
			status: 200,
			headers: {
				...cacheHeaders,
				'Content-Type': props.contentType,
			},
		});
	}

	return new Response(decodeBody(props.body, props.encoding), {
		status: 200,
		headers: {
			...cacheHeaders,
			'Content-Type': props.contentType,
		},
	});
};

function jsonProps(body: unknown): JsonArtifactProps {
	return {
		body: `${JSON.stringify(body, null, 2)}\n`,
		contentType: 'application/json; charset=utf-8',
		kind: 'json',
	};
}

function contentTypeHeader(mimeType: string): string {
	return isTextMimeType(mimeType) ? `${mimeType}; charset=utf-8` : mimeType;
}

function decodeBody(body: string, encoding: 'utf-8' | 'base64'): string | ArrayBuffer {
	if (encoding === 'utf-8') return body;

	if (typeof Buffer !== 'undefined') {
		const buffer = Buffer.from(body, 'base64');
		return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
	}

	const binary = atob(body);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index++) {
		bytes[index] = binary.charCodeAt(index);
	}
	return bytes.buffer;
}
