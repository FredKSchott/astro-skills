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
 * Binary file extensions that should be base64-encoded in archives
 */
const BINARY_EXTENSIONS = new Set([
	// Images
	'.png',
	'.jpg',
	'.jpeg',
	'.gif',
	'.webp',
	'.ico',
	'.bmp',
	'.tiff',
	'.tif',

	// Documents
	'.pdf',
	'.doc',
	'.docx',
	'.xls',
	'.xlsx',
	'.ppt',
	'.pptx',

	// Archives
	'.zip',
	'.tar',
	'.gz',
	'.rar',
	'.7z',
	'.bz2',

	// Other binary
	'.wasm',
	'.exe',
	'.dll',
	'.so',
	'.dylib',
	'.bin',
]);

/**
 * Determines if a file should be treated as binary (and base64-encoded).
 */
export function isBinaryFile(filePath: string): boolean {
	const ext = extname(filePath).toLowerCase();
	return BINARY_EXTENSIONS.has(ext);
}

/**
 * Converts a file path to use forward slashes (for consistent storage keys)
 */
export function normalizeFilePath(filePath: string): string {
	return filePath.replace(/\\/g, '/');
}
