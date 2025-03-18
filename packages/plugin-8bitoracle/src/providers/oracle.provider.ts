import { Provider, IAgentRuntime, Memory, State } from "@elizaos/core";
import { MarketData } from "../types/market";
import { Hexagram, HexagramLine, Trigram } from "../types/hexagram";
import { DivinationError } from "../types/response";
import { webcrypto } from "crypto";

export interface OracleProviderConfig {
    maxRetries: number;
    retryDelay: number; // in milliseconds
}

export class OracleProvider implements Provider {
    name = "ORACLE_PROVIDER";
    private maxRetries: number;
    private retryDelay: number;
    private crypto: typeof webcrypto;

    constructor(config: OracleProviderConfig) {
        this.maxRetries = config.maxRetries;
        this.retryDelay = config.retryDelay;
        this.crypto = webcrypto;
    }

    async get(
        runtime: IAgentRuntime,
        message: Memory,
        state?: State,
    ): Promise<Hexagram> {
        return await this.generateHexagram();
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

    private async generateHexagram(): Promise<Hexagram> {
        let retries = 0;
        while (retries < this.maxRetries) {
            try {
                const lines = await this.castLines();
                const hexagram = this.interpretLines(lines);
                return hexagram;
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

    private async castLines(): Promise<boolean[]> {
        // Generate 6 lines using crypto random values
        const lines: boolean[] = [];
        for (let i = 0; i < 6; i++) {
            const value = await this.generateRandomBit();
            lines.push(value);
        }
        return lines;
    }

    private async generateRandomBit(): Promise<boolean> {
        // Use crypto.getRandomValues for true randomness
        const array = new Uint8Array(1);
        this.crypto.getRandomValues(array);
        return (array[0] & 1) === 1;
    }

    private interpretLines(lines: boolean[]): Hexagram {
        if (lines.length !== 6) {
            throw new DivinationError("Invalid number of lines");
        }

        // Convert boolean array to trigrams
        const lowerTrigram = this.linesToTrigram(lines.slice(0, 3));
        const upperTrigram = this.linesToTrigram(lines.slice(3));

        // Calculate hexagram number (1-64)
        const hexagramNumber = this.calculateHexagramNumber(
            lowerTrigram,
            upperTrigram,
        );

        return {
            number: hexagramNumber,
            lines: lines.map((line) =>
                line ? "yang" : "yin",
            ) as HexagramLine[],
            upperTrigram,
            lowerTrigram,
            changingLines: this.findChangingLines(lines),
        };
    }

    private linesToTrigram(lines: boolean[]): Trigram {
        const trigramMap: { [key: string]: Trigram } = {
            "000": "kun", // Earth
            "001": "zhen", // Thunder
            "010": "kan", // Water
            "011": "xun", // Wind
            "100": "gen", // Mountain
            "101": "li", // Fire
            "110": "dui", // Lake
            "111": "qian", // Heaven
        };

        const binaryString = lines.map((line) => (line ? "1" : "0")).join("");
        const trigram = trigramMap[binaryString];
        if (!trigram) {
            throw new DivinationError("Invalid trigram pattern");
        }
        return trigram;
    }

    private calculateHexagramNumber(
        lowerTrigram: Trigram,
        upperTrigram: Trigram,
    ): number {
        // Implement the King Wen sequence mapping
        const trigramValues: { [key in Trigram]: number } = {
            qian: 0,
            dui: 1,
            li: 2,
            zhen: 3,
            xun: 4,
            kan: 5,
            gen: 6,
            kun: 7,
        };

        const lower = trigramValues[lowerTrigram];
        const upper = trigramValues[upperTrigram];

        // Calculate hexagram number using the King Wen sequence formula
        return upper * 8 + lower + 1;
    }

    private findChangingLines(lines: boolean[]): number[] {
        // In this implementation, we'll consider a line "changing"
        // if it's part of a specific pattern or meets certain criteria
        const changingLines: number[] = [];

        // Example criteria: consecutive similar lines might indicate change
        for (let i = 0; i < lines.length - 1; i++) {
            if (lines[i] === lines[i + 1]) {
                changingLines.push(i + 1); // 1-based line numbering
            }
        }

        return changingLines;
    }
}
