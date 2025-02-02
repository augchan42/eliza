export class RateLimiter {
    private requests: Map<string, number>;
    private timeWindow: number;

    constructor(timeWindow: number) {
        this.requests = new Map();
        this.timeWindow = timeWindow;
    }

    canMakeRequest(userId: string): boolean {
        const lastRequest = this.requests.get(userId);
        if (!lastRequest) return true;

        return Date.now() - lastRequest >= this.timeWindow;
    }

    recordRequest(userId: string): void {
        this.requests.set(userId, Date.now());
    }

    getTimeUntilNextRequest(userId: string): number {
        const lastRequest = this.requests.get(userId);
        if (!lastRequest) return 0;

        const timeLeft = this.timeWindow - (Date.now() - lastRequest);
        return Math.max(0, timeLeft);
    }
}
