import type { Message } from "@telegraf/types";
import type { Context, Telegraf } from "telegraf";
import {
    composeContext,
    elizaLogger,
    ServiceType,
    composeRandomUser,
    getTemplate,
} from "@elizaos/core";
import { getEmbeddingZeroVector } from "@elizaos/core";
import {
    type Content,
    type HandlerCallback,
    type IAgentRuntime,
    type IImageDescriptionService,
    type Memory,
    ModelClass,
    type State,
    type UUID,
    type Media,
    type ShouldRespondResult,
    type MessageResponseResult,
} from "@elizaos/core";
import { stringToUuid } from "@elizaos/core";
import { generateMessageResponse, generateShouldRespond } from "@elizaos/core";
import {
    telegramMessageHandlerTemplate,
    telegramShouldRespondTemplate,
    telegramAutoPostTemplate,
    telegramPinnedMessageTemplate,
} from "./templates";
import { cosineSimilarity, escapeMarkdown } from "./utils";
import {
    MESSAGE_CONSTANTS,
    TIMING_CONSTANTS,
    RESPONSE_CHANCES,
    TEAM_COORDINATION,
} from "./constants";

import fs from "fs";
import { HexagramGenerateResponse } from "./divination";

enum MediaType {
    PHOTO = "photo",
    VIDEO = "video",
    DOCUMENT = "document",
    AUDIO = "audio",
    ANIMATION = "animation",
}

const MAX_MESSAGE_LENGTH = 4096; // Telegram's max message length

interface MessageContext {
    content: string;
    timestamp: number;
}

interface AutoPostConfig {
    enabled: boolean;
    monitorTime: number;
    inactivityThreshold: number; // milliseconds
    mainChannelId: string;
    pinnedMessagesGroups: string[]; // Instead of announcementChannelIds
    lastAutoPost?: number;
    minTimeBetweenPosts?: number;
}

export type InterestChats = {
    [key: string]: {
        currentHandler: string | undefined;
        lastMessageSent: number;
        messages: { userId: UUID; userName: string; content: Content }[];
        previousContext?: MessageContext;
        contextSimilarityThreshold?: number;
    };
};

export class MessageManager {
    public bot: Telegraf<Context>;
    private runtime: IAgentRuntime;
    private interestChats: InterestChats = {};
    private teamMemberUsernames: Map<string, string> = new Map();
    private lastResponseTimes: Map<string, number> = new Map();
    private autoPostConfig: AutoPostConfig;
    private lastChannelActivity: { [channelId: string]: number } = {};
    private autoPostInterval: NodeJS.Timeout;
    private cleanupInterval: NodeJS.Timeout;

    // Define plugin keyword mappings
    private readonly PLUGIN_KEYWORDS = {
        weather: ["weather"],
        news: ["news"],
        // Add other plugins and their keywords here
    } as const;

    private recentHexagrams: string[] = [];
    private currentPerspectiveIndex: number = 0;
    private readonly perspectives = [
        {
            name: "analytical",
            prompt: "Analyze the situation objectively, focusing on patterns and implications.",
        },
        {
            name: "emotional",
            prompt: "Connect with the emotional aspects, considering feelings and personal impact.",
        },
        {
            name: "practical",
            prompt: "Focus on concrete, practical aspects and real-world applications.",
        },
        {
            name: "intuitive",
            prompt: "Draw upon intuitive understanding and subtle connections.",
        },
        {
            name: "reflective",
            prompt: "Consider the broader context and deeper meanings.",
        },
    ];

    constructor(bot: Telegraf<Context>, runtime: IAgentRuntime) {
        this.bot = bot;
        this.runtime = runtime;
        this._initializeAutoPost();

        // Initialize team member usernames
        this._initializeTeamMemberUsernames().catch((error) =>
            elizaLogger.error(
                "Error initializing team member usernames:",
                error,
            ),
        );

        // Set up periodic cleanup every hour
        this.cleanupInterval = setInterval(
            () => {
                this.cleanup();
            },
            60 * 60 * 1000,
        ); // Run cleanup every hour

        this.autoPostConfig = {
            enabled:
                this.runtime.character.clientConfig?.telegram?.autoPost
                    ?.enabled || false,
            monitorTime:
                this.runtime.character.clientConfig?.telegram?.autoPost
                    ?.monitorTime || 300000,
            inactivityThreshold:
                this.runtime.character.clientConfig?.telegram?.autoPost
                    ?.inactivityThreshold || 3600000,
            mainChannelId:
                this.runtime.character.clientConfig?.telegram?.autoPost
                    ?.mainChannelId,
            pinnedMessagesGroups:
                this.runtime.character.clientConfig?.telegram?.autoPost
                    ?.pinnedMessagesGroups || [],
            minTimeBetweenPosts:
                this.runtime.character.clientConfig?.telegram?.autoPost
                    ?.minTimeBetweenPosts || 7200000,
        };

        if (this.autoPostConfig.enabled) {
            this._startAutoPostMonitoring();
        }
    }

    private cleanup(): void {
        this.cleanupAutoPost();
        this.cleanupOldChatEntries();
        this.cleanupRateLimiter();
    }

    private cleanupAutoPost(): void {
        if (this.autoPostInterval) {
            clearInterval(this.autoPostInterval);
        }
        // Clear accumulated channel activity older than 24 hours
        const now = Date.now();
        const dayInMs = 24 * 60 * 60 * 1000;
        for (const [channelId, lastActivity] of Object.entries(
            this.lastChannelActivity,
        )) {
            if (now - lastActivity > dayInMs) {
                delete this.lastChannelActivity[channelId];
            }
        }
    }

    private cleanupOldChatEntries(): void {
        const now = Date.now();
        for (const [chatId, chat] of Object.entries(this.interestChats)) {
            if (
                now - chat.lastMessageSent >
                MESSAGE_CONSTANTS.INTEREST_DECAY_TIME
            ) {
                delete this.interestChats[chatId];
            }
        }
    }

    private cleanupRateLimiter(): void {
        const now = Date.now();
        for (const [userId, lastTime] of this.lastResponseTimes.entries()) {
            if (now - lastTime > 60 * 60 * 1000) {
                // 1 hour
                this.lastResponseTimes.delete(userId);
            }
        }
    }

    // Add destroy method to handle cleanup when bot stops
    public destroy(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        if (this.autoPostInterval) {
            clearInterval(this.autoPostInterval);
        }
        this.lastChannelActivity = {};
        this.interestChats = {};
        this.lastResponseTimes.clear();
        this.teamMemberUsernames.clear();
    }

    private async _initializeTeamMemberUsernames(): Promise<void> {
        if (!this.runtime.character.clientConfig?.telegram?.isPartOfTeam)
            return;

        const teamAgentIds =
            this.runtime.character.clientConfig.telegram.teamAgentIds || [];

        for (const id of teamAgentIds) {
            try {
                const chat = await this.bot.telegram.getChat(id);
                if ("username" in chat && chat.username) {
                    this.teamMemberUsernames.set(id, chat.username);
                    elizaLogger.info(
                        `Cached username for team member ${id}: ${chat.username}`,
                    );
                }
            } catch (error) {
                elizaLogger.error(
                    `Error getting username for team member ${id}:`,
                    error,
                );
            }
        }
    }

    private _startAutoPostMonitoring(): void {
        // Wait for bot to be ready
        if (this.bot.botInfo) {
            elizaLogger.info(
                "[AutoPost Telegram] Bot ready, starting monitoring",
            );
            this._initializeAutoPost();
        } else {
            elizaLogger.info(
                "[AutoPost Telegram] Bot not ready, waiting for ready event",
            );
            this.bot.telegram.getMe().then(() => {
                elizaLogger.info(
                    "[AutoPost Telegram] Bot ready, starting monitoring",
                );
                this._initializeAutoPost();
            });
        }
    }

    private _initializeAutoPost(): void {
        // Clear any existing interval first
        if (this.autoPostInterval) {
            clearInterval(this.autoPostInterval);
        }

        setTimeout(() => {
            // Get intervals from settings (in minutes)
            const minInterval = parseInt(
                this.runtime.getSetting("DIVINATION_INTERVAL_MIN") || "1380",
                10,
            ); // Default 23 hours
            const maxInterval = parseInt(
                this.runtime.getSetting("DIVINATION_INTERVAL_MAX") || "1500",
                10,
            ); // Default 25 hours

            // Convert to milliseconds and ensure valid values
            const minMs = Math.max(
                minInterval * 60 * 1000,
                23 * 60 * 60 * 1000,
            ); // Minimum 23 hours
            const maxMs = Math.max(
                maxInterval * 60 * 1000,
                minMs + 2 * 60 * 60 * 1000,
            ); // At least 2 hours more than min

            this.autoPostInterval = setInterval(
                () => {
                    // Check recent message volume
                    this._checkChannelActivity();
                },
                Math.floor(Math.random() * (maxMs - minMs) + minMs),
            );
        }, 5000);
    }

    private async _checkChannelActivity(): Promise<void> {
        if (!this.autoPostConfig.enabled || !this.autoPostConfig.mainChannelId)
            return;

        try {
            // Check recent message volume
            const lastHourMessages =
                await this.runtime.messageManager.getMemories({
                    roomId: stringToUuid(
                        this.autoPostConfig.mainChannelId +
                            "-" +
                            this.runtime.agentId,
                    ),
                    start: Date.now() - 60 * 60 * 1000, // Last hour
                });

            // Only post if chat has been quiet (no messages in last hour)
            if (!lastHourMessages?.length) {
                this._checkChannelActivity();
            }
        } catch (error) {
            elizaLogger.warn(
                "[AutoPost Telegram] Error checking channel activity:",
                error,
            );
        }
    }

    private async _monitorPinnedMessages(ctx: Context): Promise<void> {
        if (!this.autoPostConfig.pinnedMessagesGroups.length) {
            elizaLogger.warn(
                "[AutoPost Telegram] Auto post config no pinned message groups",
            );
            return;
        }

        if (!ctx.message || !("pinned_message" in ctx.message)) {
            return;
        }

        const pinnedMessage = ctx.message.pinned_message;
        if (!pinnedMessage) return;

        if (
            !this.autoPostConfig.pinnedMessagesGroups.includes(
                ctx.chat.id.toString(),
            )
        )
            return;

        const mainChannel = this.autoPostConfig.mainChannelId;
        if (!mainChannel) return;

        try {
            elizaLogger.info(
                `[AutoPost Telegram] Processing pinned message in group ${ctx.chat.id}`,
            );

            // Explicitly type and handle message content
            const messageContent: string =
                "text" in pinnedMessage &&
                typeof pinnedMessage.text === "string"
                    ? pinnedMessage.text
                    : "caption" in pinnedMessage &&
                        typeof pinnedMessage.caption === "string"
                      ? pinnedMessage.caption
                      : "New pinned message";

            const roomId = stringToUuid(
                mainChannel + "-" + this.runtime.agentId,
            );
            const memory = {
                id: stringToUuid(`pinned-${Date.now()}`),
                userId: this.runtime.agentId,
                agentId: this.runtime.agentId,
                roomId,
                content: {
                    text: messageContent,
                    source: "telegram",
                    metadata: {
                        messageId: pinnedMessage.message_id,
                        pinnedMessageData: pinnedMessage,
                    },
                },
                embedding: getEmbeddingZeroVector(),
                createdAt: Date.now(),
            };

            let state = await this.runtime.composeState(memory, {
                telegramBot: this.bot,
                pinnedMessageContent: messageContent,
                pinnedGroupId: ctx.chat.id.toString(),
                agentName: this.runtime.character.name,
            });

            const context = composeContext({
                state,
                template:
                    this.runtime.character.templates
                        ?.telegramPinnedMessageTemplate ||
                    telegramPinnedMessageTemplate,
            });

            const responseContent = await this._generateResponse(
                memory,
                state,
                context,
            );
            if (!responseContent?.text) return;

            // Send message using telegram bot
            const messageText = responseContent.reasoning
                ? `Reasoning: ${responseContent.reasoning}\n\n${responseContent.text.trim()}`
                : responseContent.text.trim();

            const messages = await Promise.all(
                this.splitMessage(messageText).map((chunk) =>
                    this.bot.telegram.sendMessage(mainChannel, chunk),
                ),
            );

            elizaLogger.debug(
                "[Send Message] Sending response with reasoning",
                {
                    reasoningFirst: true,
                    reasoningLength:
                        typeof responseContent.reasoning === "string"
                            ? responseContent.reasoning.length
                            : undefined,
                    textLength: responseContent.text?.length,
                    totalChunks: this.splitMessage(
                        `Reasoning: ${responseContent.reasoning}\n\n${responseContent.text.trim()}`,
                    ).length,
                },
            );

            const memories = messages.map((m) => ({
                id: stringToUuid(
                    m.message_id.toString() + "-" + this.runtime.agentId,
                ),
                userId: this.runtime.agentId,
                agentId: this.runtime.agentId,
                content: {
                    ...responseContent,
                    text: m.text,
                },
                roomId,
                embedding: getEmbeddingZeroVector(),
                createdAt: m.date * 1000,
            }));

            for (const m of memories) {
                await this.runtime.messageManager.createMemory(m);
            }

            state = await this.runtime.updateRecentMessageState(state);
            await this.runtime.evaluate(memory, state, true);
        } catch (error) {
            elizaLogger.warn(
                `[AutoPost Telegram] Error processing pinned message:`,
                error,
            );
        }
    }

    private _getTeamMemberUsername(id: string): string | undefined {
        return this.teamMemberUsernames.get(id);
    }

    private _getNormalizedUserId(id: string | number): string {
        return id.toString().replace(/[^0-9]/g, "");
    }

    private _isTeamMember(userId: string | number): boolean {
        const teamConfig = this.runtime.character.clientConfig?.telegram;
        if (!teamConfig?.isPartOfTeam || !teamConfig.teamAgentIds) return false;

        const normalizedUserId = this._getNormalizedUserId(userId);
        return teamConfig.teamAgentIds.some(
            (teamId) => this._getNormalizedUserId(teamId) === normalizedUserId,
        );
    }

    private _isTeamLeader(): boolean {
        return (
            this.bot.botInfo?.id.toString() ===
            this.runtime.character.clientConfig?.telegram?.teamLeaderId
        );
    }

    private _isTeamCoordinationRequest(content: string): boolean {
        const contentLower = content.toLowerCase();
        return TEAM_COORDINATION.KEYWORDS?.some((keyword) =>
            contentLower.includes(keyword.toLowerCase()),
        );
    }

    private _isRelevantToTeamMember(
        content: string,
        chatId: string,
        lastAgentMemory: Memory | null = null,
    ): boolean {
        const teamConfig = this.runtime.character.clientConfig?.telegram;

        // Check leader's context based on last message
        if (this._isTeamLeader() && lastAgentMemory?.content.text) {
            const timeSinceLastMessage = Date.now() - lastAgentMemory.createdAt;
            if (timeSinceLastMessage > MESSAGE_CONSTANTS.INTEREST_DECAY_TIME) {
                return false;
            }

            const similarity = cosineSimilarity(
                content.toLowerCase(),
                lastAgentMemory.content.text.toLowerCase(),
            );

            return (
                similarity >=
                MESSAGE_CONSTANTS.DEFAULT_SIMILARITY_THRESHOLD_FOLLOW_UPS
            );
        }

        // Check team member keywords
        if (!teamConfig?.teamMemberInterestKeywords?.length) {
            return false; // If no keywords defined, only leader maintains conversation
        }

        // Check if content matches any team member keywords
        return teamConfig.teamMemberInterestKeywords.some((keyword) =>
            content.toLowerCase().includes(keyword.toLowerCase()),
        );
    }

    private async _analyzeContextSimilarity(
        currentMessage: string,
        previousContext?: MessageContext,
        agentLastMessage?: string,
    ): Promise<number> {
        if (!previousContext) return 1;

        const timeDiff = Date.now() - previousContext.timestamp;
        const timeWeight = Math.max(0, 1 - timeDiff / (5 * 60 * 1000));

        const similarity = cosineSimilarity(
            currentMessage.toLowerCase(),
            previousContext.content.toLowerCase(),
            agentLastMessage?.toLowerCase(),
        );

        return similarity * timeWeight;
    }

    private async _shouldRespond(
        message: Message.CommonMessage,
        state: State,
    ): Promise<boolean> {
        elizaLogger.debug(
            `[shouldRespond] Starting response evaluation for message`,
            {
                messageType: message.chat.type,
                chatId: message.chat.id,
                hasText: 'text' in message,
                hasPhoto: 'photo' in message,
                isDocument: 'document' in message,
            },
        );

        const messageText =
            'text' in message ? (message as Message.TextMessage).text :
            'caption' in message ? (message as Message.CaptionableMessage & { caption?: string }).caption || '' :
            '';

        // Store the original message for context
        state.currentMessage = messageText;
        state.messageType = message.chat.type;
        state.chatId = message.chat.id.toString();

        // Check for plugin keywords
        for (const [plugin, keywords] of Object.entries(this.PLUGIN_KEYWORDS)) {
            if (keywords.some((keyword) => messageText.toLowerCase().includes(keyword))) {
                elizaLogger.debug(`[shouldRespond] ${plugin} query detected, setting plugin flag`);
                state.pluginQuery = plugin;
                state.evaluationReasoning = `Responding to ${plugin} plugin query`;
                return true;
            }
        }

        // Handle mentions and direct messages
        if (this._isMessageForMe(message)) {
            state.evaluationReasoning = "Direct mention or reply to bot";
            return true;
        }

        // Final context check with LLM
        if ('text' in message || ('caption' in message && message.caption)) {
            elizaLogger.debug(`[shouldRespond] Making final context-based decision`, {
                hasText: 'text' in message,
                hasCaption: 'caption' in message,
                messageLength: messageText.length,
            });

            const templateToUse = this.runtime.character.templates?.telegramShouldRespondTemplate ||
                this.runtime.character?.templates?.shouldRespondTemplate ||
                telegramShouldRespondTemplate;

            const baseTemplate = typeof templateToUse === 'string'
                ? getTemplate(templateToUse)
                : templateToUse({ state });
            const templateWithRandomUsers = templateToUse === telegramShouldRespondTemplate
                ? composeRandomUser(baseTemplate, 2)
                : baseTemplate;

            const shouldRespondContext = composeContext({
                state,
                template: templateWithRandomUsers,
            });

            const response = (await generateShouldRespond({
                runtime: this.runtime,
                context: shouldRespondContext,
                modelClass: ModelClass.SMALL,
                structured: true,
            })) as 'RESPOND' | 'IGNORE' | 'STOP' | null | ShouldRespondResult;

            elizaLogger.debug(`[shouldRespond] LLM decision received:`, response);

            // Store reasoning in state
            if (typeof response === 'object' && response?.reasoning) {
                state.evaluationReasoning = response.reasoning;
                state.evaluationDecision = response.decision;

                elizaLogger.debug("[shouldRespond] Stored evaluation data", {
                    reasoning: response.reasoning,
                    decision: response.decision
                });
            }

            if (typeof response === 'string') {
                state.evaluationDecision = response;
                state.evaluationReasoning = `Simple decision: ${response}`;
                return response === 'RESPOND';
            }

            return response?.decision === 'RESPOND';
        }

        elizaLogger.debug(`[shouldRespond] No text/caption content, defaulting to false`);
        state.evaluationReasoning = "No text content to evaluate";
        state.evaluationDecision = "IGNORE";
        return false;
    }

    private _isMessageForMe(message: Message.CommonMessage): boolean {
        const botUsername = this.bot.botInfo?.username;
        const characterName = this.runtime.character.name;
        if (!botUsername) return false;

        const messageText =
            'text' in message ? (message as Message.TextMessage).text :
            'caption' in message ? (message as Message.CaptionableMessage & { caption?: string }).caption || '' :
            '';
        if (!messageText) return false;

        const isReplyToBot = 'reply_to_message' in message &&
            message.reply_to_message?.from?.is_bot === true &&
            message.reply_to_message.from?.username === botUsername;

        const isMentioned = messageText.toLowerCase().split(/\s+/).some(word =>
            word === botUsername.toLowerCase() ||
            word === `@${botUsername.toLowerCase()}` ||
            word === characterName.toLowerCase()
        );

        const hasUsername = messageText.toLowerCase().includes(botUsername.toLowerCase());

        // If it's a direct mention or reply, bypass rate limiting
        const isDirectInteraction = isReplyToBot || isMentioned;

        // Only apply rate limiting for non-direct messages
        if (!isDirectInteraction) {
            const lastResponseTime = this.lastResponseTimes.get(message.chat.id.toString()) || 0;
            const minTimeBetweenResponses = 60000; // 60 seconds
            const timeSinceLastResponse = Date.now() - lastResponseTime;
            if (timeSinceLastResponse < minTimeBetweenResponses) {
                elizaLogger.debug(`Rate limited: Last response was ${timeSinceLastResponse / 1000}s ago`);
                return false;
            }
        }

        return isReplyToBot || isMentioned || (!this.runtime.character.clientConfig?.telegram?.shouldRespondOnlyToMentions && hasUsername);
    }

    private _checkInterest(rawChatId: string): boolean {
        const chatState = this.interestChats[rawChatId];
        if (!chatState) return false;

        const lastMessage = chatState.messages[chatState.messages.length - 1];
        const timeSinceLastMessage = Date.now() - chatState.lastMessageSent;

        if (timeSinceLastMessage > MESSAGE_CONSTANTS.INTEREST_DECAY_TIME) {
            delete this.interestChats[rawChatId];
            return false;
        } else if (
            timeSinceLastMessage > MESSAGE_CONSTANTS.PARTIAL_INTEREST_DECAY
        ) {
            return this._isRelevantToTeamMember(
                lastMessage?.content.text || "",
                rawChatId,
            );
        }

        // Team leader specific checks
        if (this._isTeamLeader() && chatState.messages.length > 0) {
            if (
                !this._isRelevantToTeamMember(
                    lastMessage?.content.text || "",
                    rawChatId,
                )
            ) {
                const recentTeamResponses = chatState.messages
                    .slice(-3)
                    .some(
                        (m) =>
                            m.userId !== this.runtime.agentId &&
                            this._isTeamMember(m.userId.toString()),
                    );

                if (recentTeamResponses) {
                    delete this.interestChats[rawChatId];
                    return false;
                }
            }
        }

        return true;
    }

    // Process image messages and generate descriptions
    private async processImage(
        message: Message.CommonMessage,
    ): Promise<{ description: string } | null> {
        try {
            let imageUrl: string | null = null;

            elizaLogger.info(`Telegram Message: ${message}`);

            if ('photo' in message && (message as Message.PhotoMessage).photo?.length > 0) {
                const photo = (message as Message.PhotoMessage).photo[(message as Message.PhotoMessage).photo.length - 1];
                const fileLink = await this.bot.telegram.getFileLink(photo.file_id);
                imageUrl = fileLink.toString();
            } else if (
                'document' in message &&
                (message as Message.DocumentMessage).document?.mime_type?.startsWith('image/')
            ) {
                const fileLink = await this.bot.telegram.getFileLink(
                    (message as Message.DocumentMessage).document.file_id,
                );
                imageUrl = fileLink.toString();
            }

            if (imageUrl) {
                const imageDescriptionService =
                    this.runtime.getService<IImageDescriptionService>(
                        ServiceType.IMAGE_DESCRIPTION,
                    );
                const { title, description } =
                    await imageDescriptionService.describeImage(imageUrl);
                return { description: `[Image: ${title}\n${description}]` };
            }
        } catch (error) {
            console.error("❌ Error processing image:", error);
        }

        return null;
    }

    // Send long messages in chunks
    private async sendMessageInChunks(
        ctx: Context,
        content: Content,
        replyToMessageId?: number,
    ): Promise<Message.TextMessage[]> {
        elizaLogger.debug("[Send Message] Starting message sending", {
            hasText: !!content.text,
            hasAttachments: !!content.attachments?.length,
            hasReasoning: !!content.reasoning
        });

        // If we have reasoning, send it first
        const messages: Message.TextMessage[] = [];
        if (content.reasoning) {
            const reasoningText = `🤔 Reasoning: ${content.reasoning}`;
            const reasoningChunks = this.splitMessage(reasoningText);

            for (const chunk of reasoningChunks) {
                const msg = await ctx.reply(chunk, {
                    reply_parameters: replyToMessageId ? {
                        message_id: replyToMessageId
                    } : undefined,
                    parse_mode: "Markdown",
                });
                messages.push(msg);
            }
        }

        // Then send the main message
        if (content.text) {
            const mainChunks = this.splitMessage(content.text);
            for (const chunk of mainChunks) {
                const msg = await ctx.reply(chunk, {
                    reply_parameters: replyToMessageId ? {
                        message_id: replyToMessageId
                    } : undefined,
                    parse_mode: "Markdown",
                });
                messages.push(msg);
            }
        }

        return messages;
    }

    private async sendMedia(
        ctx: Context,
        mediaPath: string,
        type: MediaType,
        caption?: string,
    ): Promise<void> {
        try {
            const isUrl = /^(http|https):\/\//.test(mediaPath);
            const sendFunctionMap: Record<MediaType, Function> = {
                [MediaType.PHOTO]: ctx.telegram.sendPhoto.bind(ctx.telegram),
                [MediaType.VIDEO]: ctx.telegram.sendVideo.bind(ctx.telegram),
                [MediaType.DOCUMENT]: ctx.telegram.sendDocument.bind(
                    ctx.telegram,
                ),
                [MediaType.AUDIO]: ctx.telegram.sendAudio.bind(ctx.telegram),
                [MediaType.ANIMATION]: ctx.telegram.sendAnimation.bind(
                    ctx.telegram,
                ),
            };

            const sendFunction = sendFunctionMap[type];

            if (!sendFunction) {
                throw new Error(`Unsupported media type: ${type}`);
            }

            if (isUrl) {
                // Handle HTTP URLs
                await sendFunction(ctx.chat.id, mediaPath, { caption });
            } else {
                // Handle local file paths
                if (!fs.existsSync(mediaPath)) {
                    throw new Error(`File not found at path: ${mediaPath}`);
                }

                const fileStream = fs.createReadStream(mediaPath);

                try {
                    await sendFunction(
                        ctx.chat.id,
                        { source: fileStream },
                        { caption },
                    );
                } finally {
                    fileStream.destroy();
                }
            }

            elizaLogger.info(
                `${
                    type.charAt(0).toUpperCase() + type.slice(1)
                } sent successfully: ${mediaPath}`,
            );
        } catch (error) {
            elizaLogger.error(
                `Failed to send ${type}. Path: ${mediaPath}. Error: ${error.message}`,
            );
            elizaLogger.debug(error.stack);
            throw error;
        }
    }

    // Split message into smaller parts
    private splitMessage(text: string): string[] {
        const chunks: string[] = [];
        let currentChunk = "";

        const lines = text.split("\n");
        for (const line of lines) {
            if (currentChunk.length + line.length + 1 <= MAX_MESSAGE_LENGTH) {
                currentChunk += (currentChunk ? "\n" : "") + line;
            } else {
                if (currentChunk) chunks.push(currentChunk);
                currentChunk = line;
            }
        }

        if (currentChunk) chunks.push(currentChunk);
        return chunks;
    }

    private getNextPerspective(messageText: string): {
        name: string;
        prompt: string;
    } {
        // Check if it's a greeting or personal question
        const isGreeting = /\b(hi|hello|welcome|hey|greetings)\b/i.test(
            messageText,
        );
        const isPersonalQuestion =
            /what('?s| is) your (favorite|favourite)|do you (like|enjoy|prefer)|how (are|do) you feel/i.test(
                messageText,
            );

        if (isGreeting || isPersonalQuestion) {
            return {
                name: "personal",
                prompt: "Focus on expressing genuine acknowledgment and feelings. Keep responses direct, warm, and personal without philosophical or market analysis.",
            };
        }

        // Use rotating perspectives for other messages
        const perspective = this.perspectives[this.currentPerspectiveIndex];
        this.currentPerspectiveIndex =
            (this.currentPerspectiveIndex + 1) % this.perspectives.length;
        return perspective;
    }

    // Generate a response using AI
    private async _generateResponse(
        message: Memory,
        state: State,
        context: string,
    ): Promise<Content> {
        const responseContent = await generateMessageResponse({
            runtime: this.runtime,
            context,
            modelClass: ModelClass.LARGE,
        });

        elizaLogger.debug(
            "[Response Generation] Generated response content",
            {
                hasResponse: !!responseContent,
                responseLength: responseContent?.text?.length,
            },
        );

        return responseContent;
    }

    private async setMessageReaction(ctx: Context, messageId: number, emoji: "😎") {
        try {
            await this.bot.telegram.setMessageReaction(ctx.chat.id, messageId, [{ type: "emoji", emoji }]);
        } catch (error) {
            elizaLogger.error("Error setting message reaction:", error);
        }
    }

    // Main handler for incoming messages
    public async handleMessage(ctx: Context): Promise<void> {
        const message = ctx.message as Message.TextMessage;

        elizaLogger.debug("[Message Handler] Received message:", {
            content: message.text,
            from: ctx.from?.username,
            messageType: message.chat.type,
            isDirectMention: this._isMessageForMe(message)
        });

        if (this._isMessageForMe(message)) {
            await this.setMessageReaction(ctx, message.message_id, "😎");
        }

        if (!ctx.message || !ctx.from) {
            return; // Exit if no message or sender info
        }

        this.lastChannelActivity[ctx.chat.id.toString()] = Date.now();

        // Check for pinned message and route to monitor function
        if (
            this.autoPostConfig.enabled &&
            ctx.message &&
            "pinned_message" in ctx.message
        ) {
            // We know this is a message update context now
            await this._monitorPinnedMessages(ctx);
            return;
        }

        if (
            this.runtime.character.clientConfig?.telegram
                ?.shouldIgnoreBotMessages &&
            ctx.from.is_bot
        ) {
            return;
        }
        if (
            this.runtime.character.clientConfig?.telegram
                ?.shouldIgnoreDirectMessages &&
            ctx.chat?.type === "private"
        ) {
            return;
        }

        const chatId = ctx.chat?.id.toString();

        elizaLogger.debug("[Message Processing] Extracting message content", {
            messageId: message.message_id,
            chatId,
            messageType:
                "text" in message
                    ? "text"
                    : "caption" in message
                      ? "caption"
                      : "other",
        });

        const messageText =
            'text' in message ? (message as Message.TextMessage).text :
            'caption' in message ? (message as Message.CaptionableMessage & { caption?: string }).caption || '' :
            '';

        elizaLogger.debug("[Message Processing] Processed message text", {
            hasText: !!messageText,
            textLength: messageText?.length,
            truncatedText: messageText?.substring(0, 50),
        });

        // Add team handling at the start
        if (
            this.runtime.character.clientConfig?.telegram?.isPartOfTeam &&
            !this.runtime.character.clientConfig?.telegram
                ?.shouldRespondOnlyToMentions
        ) {
            const isDirectlyMentioned = this._isMessageForMe(message);
            const hasInterest = this._checkInterest(chatId);

            // Non-leader team member showing interest based on keywords
            if (
                !this._isTeamLeader() &&
                this._isRelevantToTeamMember(messageText, chatId)
            ) {
                this.interestChats[chatId] = {
                    currentHandler: this.bot.botInfo?.id.toString(),
                    lastMessageSent: Date.now(),
                    messages: [],
                };
            }

            const isTeamRequest = this._isTeamCoordinationRequest(messageText);
            const isLeader = this._isTeamLeader();

            // Check for continued interest
            if (hasInterest && !isDirectlyMentioned) {
                const lastSelfMemories =
                    await this.runtime.messageManager.getMemories({
                        roomId: stringToUuid(
                            chatId + "-" + this.runtime.agentId,
                        ),
                        unique: false,
                        count: 5,
                    });

                const lastSelfSortedMemories = lastSelfMemories
                    ?.filter((m) => m.userId === this.runtime.agentId)
                    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

                const isRelevant = this._isRelevantToTeamMember(
                    messageText,
                    chatId,
                    lastSelfSortedMemories?.[0],
                );

                if (!isRelevant) {
                    delete this.interestChats[chatId];
                    return;
                }
            }

            // Handle team coordination requests
            if (isTeamRequest) {
                if (isLeader) {
                    this.interestChats[chatId] = {
                        currentHandler: this.bot.botInfo?.id.toString(),
                        lastMessageSent: Date.now(),
                        messages: [],
                    };
                } else {
                    this.interestChats[chatId] = {
                        currentHandler: this.bot.botInfo?.id.toString(),
                        lastMessageSent: Date.now(),
                        messages: [],
                    };

                    if (!isDirectlyMentioned) {
                        this.interestChats[chatId].lastMessageSent = 0;
                    }
                }
            }

            // Check for other team member mentions using cached usernames
            const otherTeamMembers =
                this.runtime.character.clientConfig.telegram.teamAgentIds.filter(
                    (id) => id !== this.bot.botInfo?.id.toString(),
                );

            const mentionedTeamMember = otherTeamMembers.find((id) => {
                const username = this._getTeamMemberUsername(id);
                return username && messageText?.includes(`@${username}`);
            });

            // If another team member is mentioned, clear our interest
            if (mentionedTeamMember) {
                if (
                    hasInterest ||
                    this.interestChats[chatId]?.currentHandler ===
                        this.bot.botInfo?.id.toString()
                ) {
                    delete this.interestChats[chatId];

                    // Only return if we're not the mentioned member
                    if (!isDirectlyMentioned) {
                        return;
                    }
                }
            }

            // Set/maintain interest only if we're mentioned or already have interest
            if (isDirectlyMentioned) {
                this.interestChats[chatId] = {
                    currentHandler: this.bot.botInfo?.id.toString(),
                    lastMessageSent: Date.now(),
                    messages: [],
                };
            } else if (!isTeamRequest && !hasInterest) {
                return;
            }

            // Update message tracking
            if (this.interestChats[chatId]) {
                this.interestChats[chatId].messages.push({
                    userId: stringToUuid(ctx.from.id.toString()),
                    userName:
                        ctx.from.username ||
                        ctx.from.first_name ||
                        "Unknown User",
                    content: { text: messageText, source: "telegram" },
                });

                if (
                    this.interestChats[chatId].messages.length >
                    MESSAGE_CONSTANTS.MAX_MESSAGES
                ) {
                    this.interestChats[chatId].messages = this.interestChats[
                        chatId
                    ].messages.slice(-MESSAGE_CONSTANTS.MAX_MESSAGES);
                }
            }
        }

        try {
            // Convert IDs to UUIDs
            const userId = stringToUuid(ctx.from.id.toString()) as UUID;

            // Get user name
            const userName =
                ctx.from.username || ctx.from.first_name || "Unknown User";

            // Get chat ID for memory storage
            const memoryChatId = stringToUuid(
                ctx.chat?.id.toString() + "-" + this.runtime.agentId,
            ) as UUID;

            // Get raw chat ID for interest tracking
            const rawChatId = ctx.chat?.id.toString();

            // Get agent ID
            const agentId = this.runtime.agentId;

            // Get room ID
            const roomId = memoryChatId;

            // Ensure connection
            await this.runtime.ensureConnection(
                userId,
                roomId,
                userName,
                userName,
                "telegram",
            );

            // Get message ID
            const messageId = stringToUuid(
                message.message_id.toString() + "-" + this.runtime.agentId,
            ) as UUID;

            // Handle images
            const imageInfo = await this.processImage(message);

            // Get text or caption
            let messageText = "";
            if ("text" in message) {
                messageText = (message as Message.TextMessage).text;
            } else if ("caption" in message) {
                messageText = (message as Message.CaptionableMessage & { caption?: string }).caption || "";
            }

            // Combine text and image description
            const fullText = imageInfo
                ? `${messageText} ${imageInfo.description}`
                : messageText;

            if (!fullText) {
                return; // Skip if no content
            }

            // Create content
            const content: Content = {
                text: fullText,
                source: "telegram",
                inReplyTo:
                    "reply_to_message" in message && message.reply_to_message
                        ? stringToUuid(
                              message.reply_to_message.message_id.toString() +
                                  "-" +
                                  this.runtime.agentId,
                          )
                        : undefined,
            };

            // Create memory for the message
            const memory: Memory = {
                id: messageId,
                agentId,
                userId,
                roomId,
                content,
                createdAt: message.date * 1000,
                embedding: getEmbeddingZeroVector(),
            };

            // Create memory
            await this.runtime.messageManager.createMemory(memory);

            // Format the conversation thread using raw chat ID
            const formattedConversation = this.interestChats[rawChatId]?.messages
                ?.map(msg => `${msg.userName}: ${msg.content.text}`)
                .join('\n\n');

            // Update state with the new memory
            let state = await this.runtime.composeState(memory, {
                currentPost: `From ${ctx.from.username || ctx.from.first_name || "Unknown"}: ${fullText}`,
                formattedConversation,
                lastMessage: fullText
            });

            elizaLogger.debug("[State Composition] Initial state:", {
                stateKeys: Object.keys(state),
                hasKnowledge: typeof state.knowledge === 'string' && state.knowledge.length > 0,
                hasBio: typeof state.bio === 'string' && state.bio.length > 0,
                hasLore: typeof state.lore === 'string' && state.lore.length > 0,
                hasRecentMessages: typeof state.recentMessages === 'string' && state.recentMessages.length > 0,
                hasActions: typeof state.actions === 'string' && state.actions.length > 0,
                hasProviders: typeof state.providers === 'string' && state.providers.length > 0,
                agentName: state.agentName,
                senderName: state.senderName,
                messageContent: state.currentMessage
            });

            state = await this.runtime.updateRecentMessageState(state);
            elizaLogger.debug("[State Update] After recent message update:", {
                recentMessagesLength: typeof state.recentMessages === 'string' ? state.recentMessages.length : 0,
                recentMessagesFirstLine: typeof state.recentMessages === 'string' ? state.recentMessages.split('\n')[0] : '',
                recentPostsLength: typeof state.recentPosts === 'string' ? state.recentPosts.length : 0
            });

            // Decide whether to respond
            const shouldRespond = await this._shouldRespond(message, state);

            // Send response in chunks
            const callback: HandlerCallback = async (content: Content) => {
                elizaLogger.debug("[Callback Handler] Starting message callback", {
                    contentLength: content?.text?.length,
                    hasAction: !!content?.action,
                });

                const messages = await this.sendMessageInChunks(ctx, content, message.message_id);

                elizaLogger.debug("[Callback Handler] Messages sent", {
                    messageCount: messages.length,
                });

                // Create only one memory for the response
                const memory: Memory = {
                    id: stringToUuid(`telegram-${messages[0].message_id}`),
                    userId: this.runtime.agentId,
                    agentId: this.runtime.agentId,
                    roomId: stringToUuid(`telegram-${memoryChatId}`),
                    content: {
                        text: content.text,
                        action: content.action || "NONE",
                        metadata: {
                            messageId: messages[0].message_id,
                            replyTo: message.message_id,
                        },
                    },
                };

                elizaLogger.log("Creating Memory", memory.id, memory.content.text);

                await this.runtime.messageManager.createMemory(memory);

                elizaLogger.debug("[Callback Handler] Completed memory creation", {
                    memoryId: memory.id,
                });

                return [memory]; // Return array of memories as required by HandlerCallback type
            };

            if (shouldRespond) {
                elizaLogger.debug(
                    "[Response Generation] Starting response generation",
                    {
                        memoryId: memory.id,
                        stateSize: Object.keys(state).length,
                    },
                );

                // Get the template path/name from the configuration
                const templateToUse =
                    this.runtime.character.templates
                        ?.telegramMessageHandlerTemplate ||
                    this.runtime.character?.templates?.messageHandlerTemplate ||
                    telegramMessageHandlerTemplate;

                elizaLogger.debug("[Template Selection] Using template:", {
                    templateSource: this.runtime.character.templates?.telegramMessageHandlerTemplate
                        ? "telegram_specific"
                        : this.runtime.character?.templates?.messageHandlerTemplate
                        ? "character_default"
                        : "telegram_default",
                    templateType: typeof templateToUse
                });

                // Get the actual template content from the registry
                const templateContent =
                    typeof templateToUse === "string"
                        ? getTemplate(templateToUse)
                        : templateToUse({ state });

                elizaLogger.debug("[Template Content] Raw template:", {
                    templateLength: templateContent?.length,
                    firstLines: templateContent?.split('\n').slice(0, 3).join('\n')
                });

                const context = composeContext({
                    state,
                    template: templateContent,
                });

                elizaLogger.debug("[Context Generation] Final context:", {
                    contextLength: context.length,
                    stateKeys: Object.keys(state),
                    firstLines: context.split('\n').slice(0, 3).join('\n'),
                    hasKnowledge: state.knowledge?.length > 0,
                    hasBio: state.bio?.length > 0,
                    hasLore: state.lore?.length > 0,
                    hasRecentMessages: state.recentMessages?.length > 0,
                    hasActions: state.actions?.length > 0,
                    hasProviders: state.providers?.length > 0,
                    context: context,
                    evaluationReasoning: state.evaluationReasoning
                });

                const responseContent = await this._generateResponse(
                    memory,
                    state,
                    context,
                );
                elizaLogger.debug(
                    "[Response Generation] Generated response content",
                    {
                        hasResponse: !!responseContent,
                        responseLength: responseContent?.text?.length,
                    },
                );

                if (!responseContent?.text) {
                    elizaLogger.debug(
                        "[Response Generation] No response text, skipping",
                    );
                    return;
                }

                const responseMessages = await callback(responseContent);
                elizaLogger.debug(
                    "[Response Generation] Sent response messages",
                    {
                        messageCount: responseMessages?.length,
                    },
                );

                state = await this.runtime.updateRecentMessageState(state);
                elizaLogger.debug(
                    "[Response Generation] Updated state after response",
                );

                await this.runtime.processActions(
                    memory,
                    responseMessages,
                    state,
                    callback,
                );
                elizaLogger.debug(
                    "[Response Generation] Processed response actions",
                );
            }

            await this.runtime.evaluate(memory, state, shouldRespond, callback);
        } catch (error) {
            elizaLogger.error("Error handling message:", error);
            throw error;
        }
    }

    private async _evaluateResponse(message: Message.TextMessage, state: State): Promise<MessageResponseResult> {
        elizaLogger.debug("[Template Evaluation] Starting evaluation:", {
            messageText: message.text,
            messageType: message.chat.type,
            isReply: !!message.reply_to_message,
            hasEntities: message.entities?.length > 0
        });

        const shouldRespond = await this._shouldRespond(message, state);

        elizaLogger.debug("[Template Evaluation] Should respond result:", {
            shouldRespond,
            evaluationReasoning: state.evaluationReasoning
        });

        return {
            content: "",
            text: "",
            action: shouldRespond ? "CONTINUE" : "NONE",
            reasoning: state.evaluationReasoning as string
        };
    }
}
