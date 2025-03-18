import { Provider } from "@elizaos/core";
import {
    MarketData,
    MarketSentiment,
    IraiAskRequest,
    IraiAskResponse,
} from "../types/market";
import { DivinationError } from "../types/response";

export interface IraiProviderConfig {
    apiKey: string;
    rateLimits: {
        maxRequests: number;
        timeWindow: number; // in milliseconds
    };
}

export class IraiProvider implements Provider {
    name = "IRAI_PROVIDER";
    private apiKey: string;
    private requestCount = 0;
    private lastReset = Date.now();
    private rateLimits: IraiProviderConfig["rateLimits"];

    constructor(config: IraiProviderConfig) {
        this.apiKey = config.apiKey;
        this.rateLimits = config.rateLimits;
    }

    async initialize(): Promise<void> {
        // Validate API key
        try {
            await this.validateApiKey();
        } catch (error) {
            throw new DivinationError(
                "Failed to initialize IRAI provider",
                error,
            );
        }
    }

    private async validateApiKey(): Promise<void> {
        const response = await fetch("https://api.irai.co/validate", {
            headers: { "irai-api-key": this.apiKey },
        });

        if (!response.ok) {
            throw new DivinationError("Invalid IRAI API key");
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

    async fetchNews(topK: number = 5): Promise<string[]> {
        if (!this.checkRateLimit()) {
            throw new DivinationError("Rate limit exceeded");
        }

        try {
            const response = await fetch(
                `https://api.irai.co/top_news?top_k=${topK}`,
                {
                    headers: { "irai-api-key": this.apiKey },
                },
            );

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            return data.news || [];
        } catch (error) {
            throw new DivinationError("Failed to fetch news", error);
        }
    }

    async fetchMarketSentiment(): Promise<MarketSentiment> {
        if (!this.checkRateLimit()) {
            throw new DivinationError("Rate limit exceeded");
        }

        try {
            const response = await fetch(
                "https://api.irai.co/market_sentiment",
                {
                    headers: { "irai-api-key": this.apiKey },
                },
            );

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            throw new DivinationError(
                "Failed to fetch market sentiment",
                error,
            );
        }
    }

    async ask(request: IraiAskRequest): Promise<IraiAskResponse> {
        if (!this.checkRateLimit()) {
            throw new DivinationError("Rate limit exceeded");
        }

        try {
            const response = await fetch("https://api.irai.co/ask", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "irai-api-key": this.apiKey,
                },
                body: JSON.stringify(request),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            throw new DivinationError("Failed to get IRAI response", error);
        }
    }

    async getMarketData(): Promise<MarketData> {
        try {
            const [news, sentiment] = await Promise.all([
                this.fetchNews(),
                this.fetchMarketSentiment(),
            ]);

            return {
                news,
                sentiment,
                interpretation: await this.interpretMarketData(news, sentiment),
            };
        } catch (error) {
            throw new DivinationError("Failed to get market data", error);
        }
    }

    private async interpretMarketData(
        news: string[],
        sentiment: MarketSentiment,
    ): Promise<string> {
        try {
            const response = await this.ask({
                question:
                    "Analyze the market sentiment and news. Provide a concise interpretation.",
                features: {
                    market_sentiment: true,
                    news: true,
                },
            });

            return response.output;
        } catch (error) {
            // Don't throw here, interpretation is optional
            console.error("Failed to interpret market data:", error);
            return "";
        }
    }
}
