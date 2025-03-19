import { Action, IAgentRuntime, ServiceType } from "@elizaos/core";
import { DivinationResponse } from "../types/response";
import { DivinationService } from "../services/divination.service";

export const performDivinationAction: Action = {
    name: "PERFORM_DIVINATION",
    description: "Generate a market-aware I-Ching reading",
    similes: ["DIVINE", "SCAN_MARKET", "READ_ICHING"],
    examples: [
        [
            {
                user: "user1",
                content: { text: "/scan" },
            },
        ],
    ],

    validate: async (runtime: IAgentRuntime): Promise<boolean> => {
        // Check if required services are available
        const service = runtime.getService("divination" as ServiceType);
        return !!service;
    },

    handler: async (runtime: IAgentRuntime): Promise<DivinationResponse> => {
        const service = runtime.getService(
            "divination" as ServiceType,
        ) as DivinationService;
        if (!service) {
            throw new Error("Divination service not available");
        }

        return await service.performDivination();
    },
};
