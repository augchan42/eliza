import { elizaLogger } from "@elizaos/core";

export class RateLimiter {
    private timeWindow: number;
    private lastRequestTimes: { [key: string]: number };
    private cleanupInterval: NodeJS.Timeout;

    constructor(timeWindow: number) {
        this.timeWindow = timeWindow;
        this.lastRequestTimes = {};

        // Set up periodic cleanup every timeWindow/2 milliseconds
        this.cleanupInterval = setInterval(() => this.cleanup(), timeWindow / 2);

        // Log initialization
        elizaLogger.debug(`RateLimiter initialized with ${timeWindow}ms window`);
    }

    public canMakeRequest(userId: string): boolean {
        const lastRequest = this.lastRequestTimes[userId];
        if (!lastRequest) return true;

        const now = Date.now();
        return now - lastRequest >= this.timeWindow;
    }

    public recordRequest(userId: string): void {
        this.lastRequestTimes[userId] = Date.now();
    }

    public getTimeUntilNextRequest(userId: string): number {
        const lastRequest = this.lastRequestTimes[userId];
        if (!lastRequest) return 0;

        const now = Date.now();
        const timeLeft = this.timeWindow - (now - lastRequest);
        return Math.max(0, timeLeft);
    }

    private cleanup(): void {
        const now = Date.now();
        let cleanedCount = 0;

        for (const [userId, timestamp] of Object.entries(this.lastRequestTimes)) {
            if (now - timestamp > this.timeWindow) {
                delete this.lastRequestTimes[userId];
                cleanedCount++;
            }
        }

        if (cleanedCount > 0) {
            elizaLogger.debug(`RateLimiter cleaned up ${cleanedCount} expired entries`);
        }
    }

    public destroy(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
    }
}
