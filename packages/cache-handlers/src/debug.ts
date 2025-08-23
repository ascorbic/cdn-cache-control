import type { DebugConfig } from "./types.ts";

/**
 * Debug logger utility for cache operations
 */
export class DebugLogger {
	private config: DebugConfig;

	constructor(config: DebugConfig = {}) {
		this.config = {
			enabled: false,
			logger: console.log,
			logLevel: 'basic',
			...config,
		};
	}

	/**
	 * Check if debug logging is enabled
	 */
	get isEnabled(): boolean {
		return this.config.enabled === true;
	}

	/**
	 * Check if verbose logging is enabled
	 */
	get isVerbose(): boolean {
		return this.isEnabled && this.config.logLevel === 'verbose';
	}

	/**
	 * Log a basic debug message
	 */
	log(operation: string, message: string, ...args: unknown[]): void {
		if (!this.isEnabled) return;
		
		const timestamp = new Date().toISOString();
		const prefix = `[${timestamp}] [cache-handlers:${operation}]`;
		this.config.logger!(`${prefix} ${message}`, ...args);
	}

	/**
	 * Log a verbose debug message (only if verbose mode is enabled)
	 */
	verbose(operation: string, message: string, ...args: unknown[]): void {
		if (!this.isVerbose) return;
		this.log(operation, message, ...args);
	}

	/**
	 * Log cache read operation
	 */
	logCacheRead(url: string, result: 'hit' | 'miss' | 'stale', metadata?: unknown): void {
		this.log('read', `Cache ${result} for ${url}`);
		if (this.isVerbose && metadata) {
			this.verbose('read', 'Cache metadata:', metadata);
		}
	}

	/**
	 * Log cache write operation
	 */
	logCacheWrite(url: string, ttl?: number, tags?: string[]): void {
		this.log('write', `Writing to cache: ${url}${ttl ? ` (TTL: ${ttl}s)` : ''}`);
		if (this.isVerbose && tags?.length) {
			this.verbose('write', `Cache tags: ${tags.join(', ')}`);
		}
	}

	/**
	 * Log cache invalidation operation
	 */
	logInvalidation(type: 'tag' | 'path' | 'all', value: string, count: number): void {
		this.log('invalidation', `Invalidated ${count} entries by ${type}: ${value}`);
	}

	/**
	 * Log conditional request operation
	 */
	logConditionalRequest(url: string, type: 'etag' | 'last-modified', result: '304' | 'fresh'): void {
		this.log('conditional', `${type} check for ${url}: ${result}`);
	}

	/**
	 * Log background revalidation
	 */
	logBackgroundRevalidation(url: string, triggered: boolean): void {
		const status = triggered ? 'triggered' : 'skipped';
		this.log('background', `Background revalidation ${status} for ${url}`);
	}

	/**
	 * Log error
	 */
	logError(operation: string, error: Error, context?: string): void {
		this.log('error', `Error in ${operation}${context ? ` (${context})` : ''}: ${error.message}`);
		if (this.isVerbose) {
			this.verbose('error', 'Stack trace:', error.stack);
		}
	}
}

/**
 * Create a debug logger instance from config
 */
export function createDebugLogger(config?: boolean | DebugConfig): DebugLogger {
	if (typeof config === 'boolean') {
		return new DebugLogger({ enabled: config });
	}
	return new DebugLogger(config);
}