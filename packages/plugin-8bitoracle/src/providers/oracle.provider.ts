import { Provider } from "@elizaos/core";
import { HexagramGenerateResponse } from "../types/hexagram";
import { DivinationError } from "../types/response";

export interface OracleProviderConfig {
    apiUrl?: string;
    rateLimits?: {
        maxRequests: number;
        timeWindow: number; // in milliseconds
    };
}

export class OracleProvider implements Provider {
    name = "ORACLE_PROVIDER";
    private apiUrl: string;
    private requestCount = 0;
    private lastReset = Date.now();
    private rateLimits: Required<OracleProviderConfig>["rateLimits"];

    constructor(config: OracleProviderConfig = {}) {
        this.apiUrl = config.apiUrl || "https://api.8bitoracle.com";
        this.rateLimits = config.rateLimits || {
            maxRequests: 100,
            timeWindow: 60000, // 1 minute
        };
    }

    async initialize(): Promise<void> {
        try {
            // Validate API connection
            await this.validateConnection();
        } catch (error) {
            throw new DivinationError(
                "Failed to initialize Oracle provider",
                error,
            );
        }
    }

    private async validateConnection(): Promise<void> {
        const response = await fetch(`${this.apiUrl}/health`);
        if (!response.ok) {
            throw new DivinationError("Oracle API is not available");
        }
    }

    private checkRateLimit(): boolean {
        const now = Date.now();
        if (now - this.lastReset > this.rateLimits.timeWindow) {
            this.requestCount = 0;
            this.lastReset = now;
        }

        if (this.requestCount >= this.rateLimits.maxRequests) {
            return false;
        }

        this.requestCount++;
        return true;
    }

    async generateHexagram(): Promise<HexagramGenerateResponse> {
        if (!this.checkRateLimit()) {
            throw new DivinationError("Rate limit exceeded");
        }

        try {
            const response = await fetch(`${this.apiUrl}/generate`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            this.validateHexagramResponse(data);
            return data;
        } catch (error) {
            throw new DivinationError("Failed to generate hexagram", error);
        }
    }

    private validateHexagramResponse(
        data: unknown,
    ): asserts data is HexagramGenerateResponse {
        if (!data || typeof data !== "object") {
            throw new DivinationError("Invalid hexagram response format");
        }

        const response = data as Partial<HexagramGenerateResponse>;

        if (
            !Array.isArray(response.fullHexagramData) ||
            !Array.isArray(response.hexagramLineValues) ||
            !response.interpretation ||
            !response.interpretation.currentHexagram
        ) {
            throw new DivinationError("Invalid hexagram response structure");
        }
    }
}
