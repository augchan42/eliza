import { Action, IAgentRuntime, ServiceType } from "@elizaos/core";
import { DivinationResponse } from "../types/response";

export const performDivinationAction: Action = {
    name: "PERFORM_DIVINATION",
    description: "Generate a market-aware I-Ching reading",
    similes: ["DIVINE", "SCAN_MARKET", "READ_ICHING"],
    examples: [
        {
            context: "User wants to analyze market conditions",
            messages: [
                {
                    user: "user1",
                    content: { text: "/scan" },
                },
            ],
            outcome: "Market analysis with I-Ching reading",
        },
    ],

    validate: async (runtime: IAgentRuntime): Promise<boolean> => {
        // Check if required services are available
        const service = runtime.getService(ServiceType.DIVINATION);
        return !!service;
    },

    handler: async (runtime: IAgentRuntime): Promise<DivinationResponse> => {
        const service = runtime.getService(ServiceType.DIVINATION);
        if (!service) {
            throw new Error("Divination service not available");
        }

        return await service.performDivination();
    },
};
