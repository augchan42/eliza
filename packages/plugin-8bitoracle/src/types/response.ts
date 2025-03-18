import { HexagramGenerateResponse } from "./hexagram";
import { MarketData } from "./market";

export interface DivinationResponse {
    hexagram: HexagramGenerateResponse;
    marketData: MarketData;
    timestamp: string;
}

export interface ResponseFormatter {
    format(response: DivinationResponse): string;
    split?(text: string): string[];
}

export class DivinationError extends Error {
    constructor(
        message: string,
        public readonly cause?: unknown,
    ) {
        super(message);
        this.name = "DivinationError";
    }
}
