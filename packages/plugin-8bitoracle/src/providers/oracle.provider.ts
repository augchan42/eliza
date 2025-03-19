import { Provider, IAgentRuntime, Memory, State } from "@elizaos/core";
import { HexagramGenerateResponse } from "../types/hexagram";
import { DivinationError } from "../types/response";

export interface OracleProviderConfig {
    maxRetries: number;
    retryDelay: number; // in milliseconds
    apiUrl?: string;
    rateLimits?: {
        maxRequests: number;
        timeWindow: number;
    };
}

export class OracleProvider implements Provider {
    name = "ORACLE_PROVIDER";
    private maxRetries: number;
    private retryDelay: number;
    private apiUrl: string;

    constructor(config?: OracleProviderConfig) {
        const defaultConfig = {
            maxRetries: 3,
            retryDelay: 1000,
            apiUrl: "https://app.8bitoracle.ai/api/generate/hexagram",
            rateLimits: {
                maxRequests: 10,
                timeWindow: 60000,
            },
        };
        const finalConfig = { ...defaultConfig, ...config };
        this.maxRetries = finalConfig.maxRetries;
        this.retryDelay = finalConfig.retryDelay;
        this.apiUrl = finalConfig.apiUrl;
    }

    async get(
        runtime: IAgentRuntime,
        message: Memory,
        state?: State,
    ): Promise<HexagramGenerateResponse> {
        return await this.generateHexagram({ includeText: true });
    }

    async initialize(): Promise<void> {
        // Validate configuration
        if (this.maxRetries < 1) {
            throw new DivinationError("maxRetries must be at least 1");
        }
        if (this.retryDelay < 0) {
            throw new DivinationError("retryDelay must be non-negative");
        }
    }

    public async generateHexagram(
        options: { includeText?: boolean } = {},
    ): Promise<HexagramGenerateResponse> {
        let retries = 0;
        while (retries < this.maxRetries) {
            try {
                const response = await fetch(
                    `${this.apiUrl}?includeText=${options.includeText ?? false}`,
                );
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const data = await response.json();

                // Validate response shape
                if (!this.isValidHexagramResponse(data)) {
                    throw new Error("Invalid response format from API");
                }

                return data;
            } catch (error) {
                retries++;
                if (retries === this.maxRetries) {
                    throw new DivinationError(
                        "Failed to generate hexagram",
                        error,
                    );
                }
                await new Promise((resolve) =>
                    setTimeout(resolve, this.retryDelay),
                );
            }
        }
        throw new DivinationError("Failed to generate hexagram after retries");
    }

    private isValidHexagramResponse(
        data: unknown,
    ): data is HexagramGenerateResponse {
        if (!data || typeof data !== "object") return false;
        const response = data as Partial<HexagramGenerateResponse>;

        return !!(
            response.fullHexagramData &&
            Array.isArray(response.fullHexagramData) &&
            response.hexagramLineValues &&
            Array.isArray(response.hexagramLineValues) &&
            response.interpretation &&
            typeof response.interpretation === "object"
        );
    }
}
