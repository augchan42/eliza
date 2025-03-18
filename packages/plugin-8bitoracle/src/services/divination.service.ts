import { Service } from "@elizaos/core";
import { IraiProvider } from "../providers/irai.provider";
import { OracleProvider } from "../providers/oracle.provider";
import { DivinationResponse, DivinationError } from "../types/response";

export class DivinationService implements Service {
    name = "DIVINATION_SERVICE";
    private isRunning = false;

    constructor(
        private iraiProvider: IraiProvider,
        private oracleProvider: OracleProvider,
    ) {}

    async start(): Promise<void> {
        try {
            // Initialize providers
            await Promise.all([
                this.iraiProvider.initialize(),
                this.oracleProvider.initialize(),
            ]);
            this.isRunning = true;
        } catch (error) {
            throw new DivinationError(
                "Failed to start divination service",
                error,
            );
        }
    }

    async stop(): Promise<void> {
        this.isRunning = false;
    }

    async performDivination(): Promise<DivinationResponse> {
        if (!this.isRunning) {
            throw new DivinationError("Divination service is not running");
        }

        try {
            // Fetch market data and generate hexagram in parallel
            const [marketData, hexagram] = await Promise.all([
                this.iraiProvider.getMarketData(),
                this.oracleProvider.generateHexagram(),
            ]);

            return {
                hexagram,
                marketData,
                timestamp: new Date().toISOString(),
            };
        } catch (error) {
            throw new DivinationError("Failed to perform divination", error);
        }
    }
}
