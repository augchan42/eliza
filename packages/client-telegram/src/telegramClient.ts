import { type Context, Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import { type IAgentRuntime, elizaLogger } from "@elizaos/core";
import { MessageManager } from "./messageManager.ts";
import { getOrCreateRecommenderInBe } from "./getOrCreateRecommenderInBe.ts";
import { handleDivinationCommand } from "./handleDivination.ts";
import { RateLimiter } from "./rateLimiter";

export class TelegramClient {
    private bot: Telegraf<Context>;
    private runtime: IAgentRuntime;
    private messageManager: MessageManager;
    private backend;
    private backendToken;
    private tgTrader;
    private options;
    private rateLimiter: RateLimiter;

    constructor(runtime: IAgentRuntime, botToken: string) {
        elizaLogger.log("📱 Constructing new TelegramClient...");
        this.options = {
            telegram: {
                apiRoot:
                    runtime.getSetting("TELEGRAM_API_ROOT") ||
                    process.env.TELEGRAM_API_ROOT ||
                    "https://api.telegram.org",
            },
        };
        this.runtime = runtime;
        this.bot = new Telegraf(botToken, this.options);
        this.messageManager = new MessageManager(this.bot, this.runtime);
        this.backend = runtime.getSetting("BACKEND_URL");
        this.backendToken = runtime.getSetting("BACKEND_TOKEN");
        this.tgTrader = runtime.getSetting("TG_TRADER"); // boolean To Be added to the settings

        // Initialize rate limiter (1 request per user per minute)
        this.rateLimiter = new RateLimiter(5 * 60 * 1000); // 5 minutes

        elizaLogger.log("✅ TelegramClient constructor completed");
    }

    public async start(): Promise<void> {
        elizaLogger.log("🚀 Starting Telegram bot...");
        try {
            await this.initializeBot();
            this.setupMessageHandlers();
            this.setupShutdownHandlers();
        } catch (error) {
            elizaLogger.error("❌ Failed to launch Telegram bot:", error);
            throw error;
        }
    }

    private async initializeBot(): Promise<void> {
        this.bot.launch({ dropPendingUpdates: true });
        elizaLogger.log(
            "✨ Telegram bot successfully launched and is running!",
        );

        await this.registerCommands();
        elizaLogger.log("✨ Bot commands registered successfully");

        const botInfo = await this.bot.telegram.getMe();
        this.bot.botInfo = botInfo;
        elizaLogger.success(`Bot username: @${botInfo.username}`);

        this.messageManager.bot = this.bot;
    }

    private async isGroupAuthorized(ctx: Context): Promise<boolean> {
        const config = this.runtime.character.clientConfig?.telegram;
        if (ctx.from?.id === ctx.botInfo?.id) {
            return false;
        }

        if (!config?.shouldOnlyJoinInAllowedGroups) {
            return true;
        }

        if (ctx.chat.type === "private") {
            return true; // Always allow DMs
        }

        const allowedGroups = config.allowedGroupIds || [];
        const currentGroupId = ctx.chat.id.toString();

        if (!allowedGroups.includes(currentGroupId)) {
            elizaLogger.info(`Unauthorized group detected: ${currentGroupId}`);
            try {
                await ctx.reply("Not authorized. Leaving.");
                await ctx.leaveChat();
            } catch (error) {
                elizaLogger.error(
                    `Error leaving unauthorized group ${currentGroupId}:`,
                    error,
                );
            }
            return false;
        }

        return true;
    }

    private setupMessageHandlers(): void {
        elizaLogger.log("Setting up message and command handlers...");

        // Setup command handlers
        this.setupCommandHandlers();

        this.bot.on(message("new_chat_members"), async (ctx) => {
            try {
                const newMembers = ctx.message.new_chat_members;
                const isBotAdded = newMembers.some(
                    (member) => member.id === ctx.botInfo.id,
                );

                if (isBotAdded && !(await this.isGroupAuthorized(ctx))) {
                    return;
                }
            } catch (error) {
                elizaLogger.error("Error handling new chat members:", error);
            }
        });

        this.bot.on("message", async (ctx) => {
            try {
                // Check group authorization first
                if (!(await this.isGroupAuthorized(ctx))) {
                    return;
                }

                if (this.tgTrader) {
                    const userId = ctx.from?.id.toString();
                    const username =
                        ctx.from?.username || ctx.from?.first_name || "Unknown";
                    if (!userId) {
                        elizaLogger.warn(
                            "Received message from a user without an ID.",
                        );
                        return;
                    }
                    try {
                        await getOrCreateRecommenderInBe(
                            userId,
                            username,
                            this.backendToken,
                            this.backend,
                        );
                    } catch (error) {
                        elizaLogger.error(
                            "Error getting or creating recommender in backend",
                            error,
                        );
                    }
                }

                await this.messageManager.handleMessage(ctx);
            } catch (error) {
                elizaLogger.error("❌ Error handling message:", error);
                // Don't try to reply if we've left the group or been kicked
                if (error?.response?.error_code !== 403) {
                    try {
                        await ctx.reply(
                            "An error occurred while processing your message.",
                        );
                    } catch (replyError) {
                        elizaLogger.error(
                            "Failed to send error message:",
                            replyError,
                        );
                    }
                }
            }
        });

        this.bot.on("photo", (ctx) => {
            elizaLogger.log(
                "📸 Received photo message with caption:",
                ctx.message.caption,
            );
        });

        this.bot.on("document", (ctx) => {
            elizaLogger.log(
                "📎 Received document message:",
                ctx.message.document.file_name,
            );
        });

        this.bot.catch((err: Error, ctx) => {
            elizaLogger.error(`❌ Telegram Error for ${ctx.updateType}:`, err);
            const errorMessage = `An unexpected error occurred. Please try again later.\n\nError: ${err.message}`;
            ctx.reply(errorMessage);
        });
    }

    private setupShutdownHandlers(): void {
        const shutdownHandler = async (signal: string) => {
            elizaLogger.log(
                `⚠️ Received ${signal}. Shutting down Telegram bot gracefully...`,
            );
            try {
                await this.stop();
                elizaLogger.log("🛑 Telegram bot stopped gracefully");
            } catch (error) {
                elizaLogger.error(
                    "❌ Error during Telegram bot shutdown:",
                    error,
                );
                throw error;
            }
        };

        process.once("SIGINT", () => shutdownHandler("SIGINT"));
        process.once("SIGTERM", () => shutdownHandler("SIGTERM"));
        process.once("SIGHUP", () => shutdownHandler("SIGHUP"));
    }

    public async stop(): Promise<void> {
        elizaLogger.log("Stopping Telegram bot...");
        //await
        this.bot.stop();
        elizaLogger.log("Telegram bot stopped");
    }

    private async registerCommands(): Promise<void> {
        try {
            await this.bot.telegram.setMyCommands([
                { command: "start", description: "Start the bot" },
                { command: "help", description: "Show help information" },
                { command: "settings", description: "Manage your settings" },
                {
                    command: "scan",
                    description: "Scan crypto market with I-Ching reading",
                },
            ]);
            elizaLogger.log("✅ Bot commands registered successfully");
        } catch (error) {
            elizaLogger.error("❌ Failed to register bot commands:", error);
        }
    }

    private setupCommandHandlers(): void {
        // Start command
        this.bot.command("start", async (ctx) => {
            try {
                if (!(await this.isGroupAuthorized(ctx))) return;

                await ctx.reply(
                    "👋 Hello! I am your assistant. How can I help you today?",
                );
            } catch (error) {
                elizaLogger.error("❌ Error handling start command:", error);
            }
        });

        // Help command
        this.bot.command("help", async (ctx) => {
            try {
                if (!(await this.isGroupAuthorized(ctx))) return;

                const helpText = `
🤖 Available Commands:
/help - Show this help message
/scan - Scan crypto market and sentiment, courtesy of irai.co and 8bitoracle.ai
Asking about 'weather' or 'news' will shortcut normal LLM processing and call
out to Tavily websearch and openweather API.
`;

                await ctx.reply(helpText);
            } catch (error) {
                elizaLogger.error("❌ Error handling help command:", error);
            }
        });

        // Settings command
        this.bot.command("settings", async (ctx) => {
            try {
                if (!(await this.isGroupAuthorized(ctx))) return;

                // Implement your settings logic here
                await ctx.reply("⚙️ Settings functionality coming soon!");
            } catch (error) {
                elizaLogger.error("❌ Error handling settings command:", error);
            }
        });

        // Divination command with rate limiting
        this.bot.command("scan", async (ctx) => {
            try {
                if (!(await this.isGroupAuthorized(ctx))) return;

                const userId = ctx.from?.id.toString();
                if (!userId) {
                    await ctx.reply("Cannot identify user.");
                    return;
                }

                if (!this.rateLimiter.canMakeRequest(userId)) {
                    const timeLeft =
                        this.rateLimiter.getTimeUntilNextRequest(userId);
                    await ctx.reply(
                        `⏳ Please wait ${Math.ceil(timeLeft / 1000)} seconds before requesting another scan.`,
                    );
                    return;
                }

                this.rateLimiter.recordRequest(userId);
                await handleDivinationCommand(ctx, this.runtime);
            } catch (error) {
                elizaLogger.error("❌ Error handling scan command:", error);
            }
        });
    }
}
