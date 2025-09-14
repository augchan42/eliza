import { elizaLogger } from "@elizaos/core";
import { HexagramGenerateResponse } from "./divination-types";

export class OracleService {
    public async fetch8BitOracle(): Promise<HexagramGenerateResponse> {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);

        try {
            const response = await fetch(
                "https://app.8bitoracle.ai/api/generate/hexagram?includeText=false",
                {
                    method: "GET",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    signal: controller.signal,
                }
            );

            if (!response.ok) {
                throw new Error(
                    `Failed to fetch oracle: ${response.status} ${response.statusText}`
                );
            }

            const data: HexagramGenerateResponse = await response.json();
            return data;
        } catch (error: unknown) {
            elizaLogger.error("Oracle reading failed:", error);
            throw error;
        } finally {
            clearTimeout(timeout);
        }
    }
}