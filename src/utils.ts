import { extname } from 'node:path';

/**
 * Regex for validating skill names per the Agent Skills RFC:
 * - 1-64 characters
 * - Lowercase alphanumeric and hyphens only (a-z, 0-9, -)
 * - Must not start or end with a hyphen
 * - Must not contain consecutive hyphens
 */
const SKILL_NAME_REGEX = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/**
 * Validates a skill name against the Agent Skills RFC specification.
 *
 * Rules:
 * - 1-64 characters
 * - Lowercase alphanumeric and hyphens only (a-z, 0-9, -)
 * - Must not start or end with a hyphen
 * - Must not contain consecutive hyphens
 */
export function isValidSkillName(name: string): boolean {
	if (name.length < 1 || name.length > 64) {
		return false;
	}
	if (!SKILL_NAME_REGEX.test(name)) {
		return false;
	}
	if (name.includes('--')) {
		return false;
	}
	return true;
}

/**
 * Returns validation error message for an invalid skill name, or null if valid.
 */
export function getSkillNameValidationError(name: string): string | null {
	if (name.length < 1) {
		return 'Skill name cannot be empty';
	}
	if (name.length > 64) {
		return `Skill name must be 64 characters or less (got ${name.length})`;
	}
	if (name.startsWith('-')) {
		return 'Skill name cannot start with a hyphen';
	}
	if (name.endsWith('-')) {
		return 'Skill name cannot end with a hyphen';
	}
	if (name.includes('--')) {
		return 'Skill name cannot contain consecutive hyphens';
	}
	if (!/^[a-z0-9-]+$/.test(name)) {
		return 'Skill name can only contain lowercase letters, numbers, and hyphens';
	}
	return null;
}

/**
 * Validates a slash-separated skill path for SEP-2640 resource mapping.
 *
 * Prefix segments are server-chosen organization. The final segment is the
 * skill name and must satisfy the Agent Skills naming rules.
 */
export function isValidSkillPath(path: string): boolean {
	return getSkillPathValidationError(path) === null;
}

/**
 * Returns validation error message for an invalid skill path, or null if valid.
 */
export function getSkillPathValidationError(path: string): string | null {
	if (!path) {
		return 'Skill path cannot be empty';
	}

	const normalized = normalizeFilePath(path);
	const segments = normalized.split('/');
	if (segments.some((segment) => segment.length === 0)) {
		return 'Skill path cannot contain empty segments';
	}
	if (segments.some((segment) => segment === '.' || segment === '..')) {
		return 'Skill path cannot contain "." or ".." segments';
	}

	const skillName = segments.at(-1);
	if (!skillName) {
		return 'Skill path cannot be empty';
	}

	const skillNameError = getSkillNameValidationError(skillName);
	if (skillNameError) {
		return `Final path segment is invalid: ${skillNameError}`;
	}

	return null;
}

/**
 * File extensions that can be safely stored as UTF-8 strings. Unknown
 * extensions default to base64 so served resource bytes still match digests.
 */
const TEXT_EXTENSIONS = new Set([
	'.css',
	'.csv',
	'.html',
	'.js',
	'.json',
	'.md',
	'.mdc',
	'.mjs',
	'.py',
	'.sh',
	'.svg',
	'.toml',
	'.ts',
	'.tsx',
	'.txt',
	'.xml',
	'.yaml',
	'.yml',
]);

/**
 * Determines if a file should be stored as UTF-8 text.
 */
export function isTextFile(filePath: string): boolean {
	const ext = extname(filePath).toLowerCase();
	return TEXT_EXTENSIONS.has(ext);
}

/**
 * MIME types used when serving skill files as resources.
 */
export function getMimeType(filePath: string): string {
	const ext = extname(filePath).toLowerCase();
	switch (ext) {
		case '.md':
		case '.mdc':
			return 'text/markdown';
		case '.json':
			return 'application/json';
		case '.js':
		case '.mjs':
			return 'application/javascript';
		case '.ts':
		case '.tsx':
			return 'text/typescript';
		case '.py':
			return 'text/x-python';
		case '.sh':
			return 'text/x-shellscript';
		case '.svg':
			return 'image/svg+xml';
		case '.html':
			return 'text/html';
		case '.css':
			return 'text/css';
		case '.png':
			return 'image/png';
		case '.jpg':
		case '.jpeg':
			return 'image/jpeg';
		case '.gif':
			return 'image/gif';
		case '.webp':
			return 'image/webp';
		case '.pdf':
			return 'application/pdf';
		case '.zip':
			return 'application/zip';
		case '.gz':
			return 'application/gzip';
		case '.tar':
			return 'application/x-tar';
		case '.txt':
		case '.yaml':
		case '.yml':
		case '.toml':
			return 'text/plain';
		default:
			return 'application/octet-stream';
	}
}

/**
 * Determines if a MIME type can be safely served as UTF-8 text.
 */
export function isTextMimeType(mimeType: string): boolean {
	return (
		mimeType.startsWith('text/') ||
		mimeType === 'application/json' ||
		mimeType === 'application/javascript' ||
		mimeType === 'image/svg+xml'
	);
}

/**
 * Converts a file path to use forward slashes (for consistent storage keys)
 */
export function normalizeFilePath(filePath: string): string {
	return filePath.replace(/\\/g, '/');
}
