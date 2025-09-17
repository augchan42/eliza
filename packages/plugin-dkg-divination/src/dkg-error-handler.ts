// DKG error handling and retry logic
import { elizaLogger } from "@elizaos/core";

export interface RetryConfig {
    maxNodeAttempts: number;
    baseDelay: number;
    maxDelay: number;
    jitterRange: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
    maxNodeAttempts: 3,
    baseDelay: 30000,        // 30 seconds - conservative for RPC recovery
    maxDelay: 300000,        // 5 minutes max delay
    jitterRange: 10000,      // 0-10 second jitter for better distribution
};

export class DKGErrorHandler {
    /**
     * Check if error is retryable or permanent
     */
    static isRetryableError(error: any): boolean {
        const errorMsg = error?.message?.toLowerCase() || '';
        const errorStr = error?.toString?.().toLowerCase() || '';

        // Permanent failures - don't retry
        if (errorMsg.includes('insufficient funds') ||
            errorMsg.includes('insufficient balance') ||
            errorMsg.includes('invalid private key') ||
            errorMsg.includes('invalid credentials') ||
            errorMsg.includes('unauthorized') ||
            errorMsg.includes('forbidden') ||
            errorStr.includes('401') ||
            errorStr.includes('403') ||
            errorStr.includes('400')) {
            elizaLogger.error(`🚫 Permanent DKG failure detected - not retrying: ${errorMsg}`);
            return false;
        }

        // Retryable errors: network issues, timeouts, 5xx, rate limits
        return errorMsg.includes('timeout') ||
               errorMsg.includes('network') ||
               errorMsg.includes('econnreset') ||
               errorMsg.includes('enotfound') ||
               errorMsg.includes('rate limit') ||
               errorMsg.includes('too many requests') ||
               errorMsg.includes('overload') ||
               errorStr.includes('5') || // 5xx errors
               errorMsg.includes('socket hang up');
    }

    /**
     * Calculate delay with exponential backoff and jitter
     */
    static calculateDelay(attempt: number, config: RetryConfig = DEFAULT_RETRY_CONFIG): number {
        const exponentialDelay = Math.min(
            config.baseDelay * Math.pow(1.5, attempt),
            config.maxDelay
        );
        const jitter = Math.random() * config.jitterRange;
        return exponentialDelay + jitter;
    }

    /**
     * Log error details with proper serialization
     */
    static logError(error: any, context: string, hostname?: string): void {
        elizaLogger.error(`🔍 DKG error details for ${context}:`, {
            message: error?.message || 'No message',
            code: error?.code,
            response: error?.response,
            data: error?.data,
            stack: error?.stack,
            hostname: hostname,
            // Serialize all properties including non-enumerable
            fullError: JSON.stringify(error, Object.getOwnPropertyNames(error))
        });
    }
}