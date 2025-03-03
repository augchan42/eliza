import { Context } from "telegraf";
import { IAgentRuntime, elizaLogger, stringToUuid } from "@elizaos/core";
import { DivinationClient } from "./divination";
import { composeContext, generateText, ModelClass } from "@elizaos/core";
import { pixDivinationTemplate } from "./divination";

export async function handleDivinationCommand(
    ctx: Context,
    runtime: IAgentRuntime,
) {
    try {
        await ctx.reply("🔮 Initiating market divination...");

        const divinationClient = new DivinationClient();

        // Fetch all required data in parallel with error handling
        const results = await Promise.allSettled([
            divinationClient.fetchMarketSentiment(),
            divinationClient.fetchIraiNews(5),
            divinationClient.fetch8BitOracle(),
        ]);

        // Process results and handle partial failures
        const [marketSentiment, newsEvents, oracleReading] = results.map((result, index) => {
            if (result.status === 'rejected') {
                elizaLogger.error(`Failed to fetch data for index ${index}:`, result.reason);
                return null;
            }
            return result.value;
        });

        // Check if we have enough data to proceed
        if (!marketSentiment && !newsEvents && !oracleReading) {
            throw new Error("All data sources failed");
        }

        const roomId = stringToUuid(
            `telegram-divination-${ctx.message?.message_id}`,
        );

        // Compose state with available data
        const state = await runtime.composeState(
            {
                userId: runtime.agentId,
                roomId: roomId,
                agentId: runtime.agentId,
                content: {
                    text: "market divination",
                    action: "DIVINATION",
                },
            },
            {
                newsEvent: newsEvents ? JSON.stringify(newsEvents, null, 2) : "{}",
                oracleReading: oracleReading ? JSON.stringify(
                    {
                        interpretation: oracleReading.interpretation,
                    },
                    null,
                    2,
                ) : "{}",
                marketSentiment: marketSentiment ? JSON.stringify(marketSentiment, null, 2) : "{}",
            },
        );

        // Generate context for LLM interpretation
        const context = composeContext({
            state: state,
            template: pixDivinationTemplate,
        });

        // Get LLM interpretation
        const response = await generateText({
            runtime,
            context,
            modelClass: ModelClass.LARGE,
        });

        let responseText = `${response}\n`;

        // Add warning if some data sources failed
        if (!marketSentiment || !newsEvents || !oracleReading) {
            responseText += "\n⚠️ Note: Some data sources were unavailable. Reading may be incomplete.";
        }

        await ctx.reply(responseText);
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
