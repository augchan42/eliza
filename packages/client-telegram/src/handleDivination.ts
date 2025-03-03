import { Context } from "telegraf";
import { IAgentRuntime, elizaLogger, stringToUuid } from "@elizaos/core";
import { DivinationClient } from "./divination";
import { composeContext, generateText, ModelClass } from "@elizaos/core";
import { pixDivinationTemplate } from "./divination";

const MAX_MESSAGE_LENGTH = 4096;
const MAX_RETRIES = 3;

export async function handleDivinationCommand(
    ctx: Context,
    runtime: IAgentRuntime,
) {
    let retryCount = 0;
    let statusMessage;

    try {
        statusMessage = await ctx.reply("🔮 Initiating market divination...");
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

        while (retryCount < MAX_RETRIES) {
            try {
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

                // Validate response format
                if (!response.includes('```json')) {
                    elizaLogger.error("Response missing JSON block, retrying...");
                    retryCount++;
                    continue;
                }

                let responseText = `${response}\n`;

                // Add warning if some data sources failed
                if (!marketSentiment || !newsEvents || !oracleReading) {
                    responseText += "\n⚠️ Note: Some data sources were unavailable. Reading may be incomplete.";
                }

                // Check message length
                if (responseText.length > MAX_MESSAGE_LENGTH) {
                    responseText = responseText.substring(0, MAX_MESSAGE_LENGTH - 200) +
                        "\n\n⚠️ Response truncated due to length limits.";
                }

                // Delete status message
                if (statusMessage) {
                    await ctx.telegram.deleteMessage(statusMessage.chat.id, statusMessage.message_id)
                        .catch(err => elizaLogger.error("Failed to delete status message:", err));
                }

                // Send final response
                await ctx.reply(responseText);
                return;
            } catch (error) {
                elizaLogger.error(`Attempt ${retryCount + 1} failed:`, error);
                retryCount++;

                if (retryCount >= MAX_RETRIES) {
                    throw new Error(`Failed after ${MAX_RETRIES} attempts`);
                }
            }
        }
    } catch (error) {
        elizaLogger.error("Error in divination command:", error);

        // Clean up status message if it exists
        if (statusMessage) {
            await ctx.telegram.deleteMessage(statusMessage.chat.id, statusMessage.message_id)
                .catch(err => elizaLogger.error("Failed to delete status message:", err));
        }

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
