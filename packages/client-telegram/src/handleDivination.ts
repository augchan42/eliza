import { Context } from "telegraf";
import {
    IAgentRuntime,
    elizaLogger,
    Memory,
    stringToUuid,
    HandlerCallback,
    Content,
} from "@elizaos/core";
import {
    TelegramFormatter,
    DivinationResponse,
} from "@elizaos/plugin-8bitoracle";

export async function handleDivinationCommand(
    ctx: Context,
    runtime: IAgentRuntime,
) {
    try {
        await ctx.reply("🔮 Initiating market divination...");

        // Create a memory object for the divination action
        const memory: Memory = {
            userId: stringToUuid(ctx.from?.id.toString() || "unknown"),
            roomId: stringToUuid(ctx.chat?.id.toString() || "unknown"),
            agentId: runtime.agentId,
            content: {
                action: "PERFORM_DIVINATION",
                text: "market divination",
            },
        };

        // Process the divination action and capture the response
        const response = await new Promise<DivinationResponse>((resolve) => {
            const callback: HandlerCallback = async (response: Content) => {
                if ("divination" in response) {
                    resolve(response.divination as DivinationResponse);
                } else {
                    throw new Error("Invalid divination response");
                }
                return Promise.resolve([]);
            };
            runtime.processActions(memory, [memory], undefined, callback);
        });

        // Format the response using the plugin's Telegram formatter
        const formatter = new TelegramFormatter();
        const formatted = formatter.format(response);

        // Handle long messages
        if (formatted.length > 4096) {
            const parts = formatter.split(formatted);
            for (const part of parts) {
                await ctx.reply(part);
            }
        } else {
            await ctx.reply(formatted);
        }
    } catch (error) {
        elizaLogger.error("Error in divination command:", error);
        await ctx.reply("⚠️ Divination circuits overloaded. Try again later.");
    }
}

function getSentimentEmoji(sentiment: string): string {
    const sentimentMap = {
        bearish: "🔻",
        "very bearish": "📉",
        bullish: "🔺",
        "very bullish": "📈",
        neutral: "➡️",
        unknown: "❓",
    };

    return sentimentMap[sentiment.toLowerCase()] || "❓";
}
