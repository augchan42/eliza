import {
    AudioReceiveStream,
    NoSubscriberBehavior,
    StreamType,
    VoiceConnection,
    createAudioPlayer,
    createAudioResource,
    getVoiceConnection,
    joinVoiceChannel,
} from "@discordjs/voice";
import {
    BaseGuildVoiceChannel,
    ChannelType,
    Client,
    Guild,
    GuildMember,
    VoiceChannel,
    VoiceState,
} from "discord.js";
import EventEmitter from "events";
import prism from "prism-media";
import { Readable, pipeline } from "stream";
import { composeContext, elizaLogger } from "@ai16z/eliza";
import { generateMessageResponse } from "@ai16z/eliza";
import { embeddingZeroVector } from "@ai16z/eliza";
import {
    Content,
    HandlerCallback,
    IAgentRuntime,
    ISpeechService,
    ITranscriptionService,
    Memory,
    ModelClass,
    ServiceType,
    State,
    UUID,
} from "@ai16z/eliza";
import { stringToUuid } from "@ai16z/eliza";
import { rateLimiter } from "./messages";
import { embeddingConfig } from "@ai16z/eliza";
import { VoiceConnectionStatus } from "@discordjs/voice";
// Voice-specific rate limiter
export const voiceRateLimiter = {
    lastCall: 0,
    minInterval: 2000, // Slightly longer interval for voice to prevent overlap
    maxQueueSize: 25, // Smaller queue size for voice
    maxMemoryMB: 5, // Less memory needed for voice queue
    messageQueue: [] as VoiceQueueItem[],
    currentMemoryUsage: 0,

    estimateMessageSize(message: Memory): number {
        const baseSize = 100; // Fixed fields
        const textSize = (message.content?.text?.length || 0) * 2;
        const embeddingSize = embeddingConfig.dimensions * 4; // 4 bytes per float
        return baseSize + textSize + embeddingSize;
    },

    async enqueue(
        message: Memory,
        runtime: IAgentRuntime,
        userId: UUID,
        voiceManager: VoiceManager
    ): Promise<boolean> {
        const messageSize = this.estimateMessageSize(message);
        const newMemoryUsage = this.currentMemoryUsage + messageSize;

        // Add queue size check
        if (this.messageQueue.length >= this.maxQueueSize) {
            console.log(
                `Voice queue full (${this.maxQueueSize} messages), dropping oldest message`
            );
            const dropped = this.messageQueue.shift();
            this.currentMemoryUsage -= this.estimateMessageSize(
                dropped!.memory
            );
        }
        // Drop messages if memory limit exceeded
        if (newMemoryUsage > this.maxMemoryMB * 1024 * 1024) {
            console.log(
                `Voice memory limit (${this.maxMemoryMB}MB) exceeded, dropping oldest message`
            );
            while (
                this.messageQueue.length > 0 &&
                newMemoryUsage > this.maxMemoryMB * 1024 * 1024
            ) {
                const dropped = this.messageQueue.shift();
                this.currentMemoryUsage -= this.estimateMessageSize(
                    dropped!.memory
                );
            }
        }

        const now = Date.now();
        const isDirectMention =
            Array.isArray(message.content?.mentions) &&
            message.content.mentions.includes(runtime.agentId);

        // Priority messages bypass queue
        if (isDirectMention) {
            this.lastCall = now;
            return true;
        }

        // Check if we can process immediately
        if (now - this.lastCall >= this.minInterval) {
            this.lastCall = now;
            return true;
        }

        // Add to queue if we're rate limited
        this.messageQueue.push({
            memory: message,
            userId,
            runtime,
            voiceManager,
        });
        this.currentMemoryUsage += messageSize;
        console.log(
            `Voice Queue: ${this.messageQueue.length} messages, ${(
                this.currentMemoryUsage /
                1024 /
                1024
            ).toFixed(2)}MB`
        );
        return false;
    },

    async processQueue(): Promise<VoiceQueueItem | null> {
        if (this.messageQueue.length === 0) return null;

        const now = Date.now();
        if (now - this.lastCall >= this.minInterval) {
            this.lastCall = now;
            const item = this.messageQueue.shift()!;
            this.currentMemoryUsage -= this.estimateMessageSize(item.memory);
            return item;
        }

        return null;
    },
};

// Add these interfaces
interface VoiceQueueItem {
    memory: Memory;
    userId: UUID;
    runtime: IAgentRuntime;
    voiceManager: VoiceManager;
}

export function getWavHeader(
    audioLength: number,
    sampleRate: number,
    channelCount: number = 1,
    bitsPerSample: number = 16
): Buffer {
    const wavHeader = Buffer.alloc(44);
    wavHeader.write("RIFF", 0);
    wavHeader.writeUInt32LE(36 + audioLength, 4); // Length of entire file in bytes minus 8
    wavHeader.write("WAVE", 8);
    wavHeader.write("fmt ", 12);
    wavHeader.writeUInt32LE(16, 16); // Length of format data
    wavHeader.writeUInt16LE(1, 20); // Type of format (1 is PCM)
    wavHeader.writeUInt16LE(channelCount, 22); // Number of channels
    wavHeader.writeUInt32LE(sampleRate, 24); // Sample rate
    wavHeader.writeUInt32LE(
        (sampleRate * bitsPerSample * channelCount) / 8,
        28
    ); // Byte rate
    wavHeader.writeUInt16LE((bitsPerSample * channelCount) / 8, 32); // Block align ((BitsPerSample * Channels) / 8)
    wavHeader.writeUInt16LE(bitsPerSample, 34); // Bits per sample
    wavHeader.write("data", 36); // Data chunk header
    wavHeader.writeUInt32LE(audioLength, 40); // Data chunk size
    return wavHeader;
}

import { messageCompletionFooter } from "@ai16z/eliza/src/parsing.ts";
import { DiscordClient } from ".";

const discordVoiceHandlerTemplate =
    `# Task: Consider whether to respond in this voice conversation with {{agentName}}.
About {{agentName}}:
{{bio}}

# Attachments
{{attachments}}

# Capabilities
Note that {{agentName}} is capable of reading/seeing/hearing various forms of media, including images, videos, audio, plaintext and PDFs. Recent attachments have been included above under the "Attachments" section.

{{actions}}

# Conversation Guidelines
- Only respond if it feels natural and appropriate
- Allow for comfortable pauses in conversation
- Don't force responses if the conversation has reached a natural end
- Consider the context and timing of the last message

{{messageDirections}}

{{recentMessages}}

# Instructions: Consider whether {{agentName}} should respond. If appropriate, write a natural response. {{actionNames}}
` + messageCompletionFooter;

// These values are chosen for compatibility with picovoice components
const DECODE_FRAME_SIZE = 1024;
const DECODE_SAMPLE_RATE = 16000;

// Buffers all audio
export class AudioMonitor {
    private readable: Readable;
    private buffers: Buffer[] = [];
    private maxSize: number;
    private lastFlagged: number = -1;
    private ended: boolean = false;

    constructor(
        readable: Readable,
        maxSize: number,
        callback: (buffer: Buffer) => void
    ) {
        this.readable = readable;
        this.maxSize = maxSize;
        this.readable.on("data", (chunk: Buffer) => {
            //console.log('AudioMonitor got data');
            if (this.lastFlagged < 0) {
                this.lastFlagged = this.buffers.length;
            }
            this.buffers.push(chunk);
            const currentSize = this.buffers.reduce(
                (acc, cur) => acc + cur.length,
                0
            );
            while (currentSize > this.maxSize) {
                this.buffers.shift();
                this.lastFlagged--;
            }
        });
        this.readable.on("end", () => {
            elizaLogger.log("AudioMonitor ended");
            this.ended = true;
            if (this.lastFlagged < 0) return;
            callback(this.getBufferFromStart());
            this.lastFlagged = -1;
        });
        this.readable.on("speakingStopped", () => {
            if (this.ended) return;
            elizaLogger.log("Speaking stopped");
            if (this.lastFlagged < 0) return;
            callback(this.getBufferFromStart());
        });
        this.readable.on("speakingStarted", () => {
            if (this.ended) return;
            elizaLogger.log("Speaking started");
            this.reset();
        });
    }

    stop() {
        this.readable.removeAllListeners("data");
        this.readable.removeAllListeners("end");
        this.readable.removeAllListeners("speakingStopped");
        this.readable.removeAllListeners("speakingStarted");
    }

    isFlagged() {
        return this.lastFlagged >= 0;
    }

    getBufferFromFlag() {
        if (this.lastFlagged < 0) {
            return null;
        }
        const buffer = Buffer.concat(this.buffers.slice(this.lastFlagged));
        return buffer;
    }

    getBufferFromStart() {
        const buffer = Buffer.concat(this.buffers);
        return buffer;
    }

    reset() {
        this.buffers = [];
        this.lastFlagged = -1;
    }

    isEnded() {
        return this.ended;
    }
}

export class VoiceManager extends EventEmitter {
    private client: Client;
    private runtime: IAgentRuntime;
    private streams: Map<string, Readable> = new Map();
    private connections: Map<string, VoiceConnection> = new Map();
    private activeMonitors: Map<
        string,
        { channel: BaseGuildVoiceChannel; monitor: AudioMonitor }
    > = new Map();
    private queueInterval: NodeJS.Timeout;

    constructor(client: DiscordClient) {
        super();
        this.client = client.client;
        this.runtime = client.runtime;

        // Start the voice queue processor
        this.queueInterval = setInterval(async () => {
            const nextItem = await voiceRateLimiter.processQueue();
            if (nextItem) {
                try {
                    const { memory, userId, runtime } = nextItem;
                    const speechService = runtime.getService<ISpeechService>(
                        ServiceType.SPEECH_GENERATION
                    );
                    if (!speechService) {
                        throw new Error("Speech generation service not found");
                    }

                    const responseStream = await speechService.generate(
                        runtime,
                        memory.content.text
                    );

                    if (responseStream) {
                        await this.playAudioStream(
                            userId,
                            responseStream as Readable
                        );
                        console.log(
                            `Processed queued voice message: ${memory.content.text.substring(0, 50)}...`
                        );
                    }
                } catch (error) {
                    console.error(
                        "Error processing queued voice message:",
                        error
                    );
                }
            }
        }, voiceRateLimiter.minInterval);
    }

    // Add cleanup method
    cleanup() {
        if (this.queueInterval) {
            clearInterval(this.queueInterval);
        }

        // Clean up all active connections
        for (const [, connection] of this.connections) {
            connection.destroy();
        }
        this.connections.clear();

        // Clean up all streams
        for (const [, stream] of this.streams) {
            stream.destroy();
        }
        this.streams.clear();

        // Clean up all monitors
        for (const [memberId] of this.activeMonitors) {
            this.stopMonitoringMember(memberId);
        }
    }

    async handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState) {
        const oldChannelId = oldState.channelId;
        const newChannelId = newState.channelId;
        const member = newState.member;
        if (!member) return;
        if (member.id === this.client.user?.id) {
            return;
        }

        // Ignore mute/unmute events
        if (oldChannelId === newChannelId) {
            return;
        }

        // User leaving a channel where the bot is present
        if (oldChannelId && this.connections.has(oldChannelId)) {
            this.stopMonitoringMember(member.id);
        }

        // User joining a channel where the bot is present
        if (newChannelId && this.connections.has(newChannelId)) {
            await this.monitorMember(
                member,
                newState.channel as BaseGuildVoiceChannel
            );
        }
    }

    async joinChannel(channel: BaseGuildVoiceChannel) {
        const oldConnection = getVoiceConnection(channel.guildId as string);
        if (oldConnection) {
            try {
                oldConnection.destroy();
            } catch (error) {
                console.error("Error leaving voice channel:", error);
            }
        }
        const connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: channel.guild.id,
            adapterCreator: channel.guild.voiceAdapterCreator as any,
            selfDeaf: false,
            selfMute: false,
        });

        // Store the connection in the connections map
        this.connections.set(channel.id, connection);

        for (const [, member] of channel.members) {
            if (!member.user.bot) {
                this.monitorMember(member, channel);
            }
        }

        connection.receiver.speaking.on("start", (userId: string) => {
            const user = channel.members.get(userId);
            if (!user?.user.bot) {
                this.monitorMember(user as GuildMember, channel);
                this.streams.get(userId)?.emit("speakingStarted");
            }
        });

        connection.receiver.speaking.on("end", async (userId: string) => {
            const user = channel.members.get(userId);
            if (!user?.user.bot) {
                this.streams.get(userId)?.emit("speakingStopped");
            }
        });

        // Add error and disconnect handlers
        connection.on("error", (error: any) => {
            console.error(`Voice connection error in ${channel.name}:`, error);
        });

        connection.on(VoiceConnectionStatus.Disconnected, () => {
            this.connections.delete(channel.id);
            // Clean up associated resources
            this.leaveChannel(channel);
            console.log(`Disconnected from ${channel.name}`);
        });

        connection.on(VoiceConnectionStatus.Destroyed, () => {
            this.connections.delete(channel.id);
            // Clean up associated resources
            this.leaveChannel(channel);
            console.log(`Connection destroyed for ${channel.name}`);
        });
    }

    private async monitorMember(
        member: GuildMember,
        channel: BaseGuildVoiceChannel
    ) {
        const userId = member?.id;
        const userName = member?.user?.username;
        const name = member?.user?.displayName;
        const connection = getVoiceConnection(member?.guild?.id);
        const receiveStream = connection?.receiver.subscribe(userId, {
            autoDestroy: true,
            emitClose: true,
        });
        if (!receiveStream || receiveStream.readableLength === 0) {
            return;
        }
        const opusDecoder = new prism.opus.Decoder({
            channels: 1,
            rate: DECODE_SAMPLE_RATE,
            frameSize: DECODE_FRAME_SIZE,
        });
        pipeline(
            receiveStream as AudioReceiveStream,
            opusDecoder as any,
            (err: Error | null) => {
                if (err) {
                    console.log(`Opus decoding pipeline error: ${err}`);
                }
            }
        );
        this.streams.set(userId, opusDecoder);
        this.connections.set(userId, connection as VoiceConnection);
        opusDecoder.on("error", (err: any) => {
            console.log(`Opus decoding error: ${err}`);
        });
        const errorHandler = (err: any) => {
            console.log(`Opus decoding error: ${err}`);
        };
        const streamCloseHandler = () => {
            console.log(`voice stream from ${member?.displayName} closed`);
            this.streams.delete(userId);
            this.connections.delete(userId);
        };
        const closeHandler = () => {
            console.log(`Opus decoder for ${member?.displayName} closed`);
            opusDecoder.removeListener("error", errorHandler);
            opusDecoder.removeListener("close", closeHandler);
            receiveStream?.removeListener("close", streamCloseHandler);
        };
        opusDecoder.on("error", errorHandler);
        opusDecoder.on("close", closeHandler);
        receiveStream?.on("close", streamCloseHandler);

        this.client.emit(
            "userStream",
            userId,
            name,
            userName,
            channel,
            opusDecoder
        );
    }

    leaveChannel(channel: BaseGuildVoiceChannel) {
        // Clean up all connections associated with this channel
        for (const [userId, conn] of this.connections) {
            if (conn.joinConfig.channelId === channel.id) {
                conn.destroy();
                this.connections.delete(userId);
            }
        }

        // Clean up all streams for this channel
        for (const [userId, stream] of this.streams) {
            if (this.activeMonitors.get(userId)?.channel.id === channel.id) {
                stream.destroy();
                this.streams.delete(userId);
            }
        }

        // Existing monitor cleanup
        for (const [memberId, monitorInfo] of this.activeMonitors) {
            if (monitorInfo.channel.id === channel.id) {
                this.stopMonitoringMember(memberId);
            }
        }

        console.log(`Left voice channel: ${channel.name} (${channel.id})`);
    }

    stopMonitoringMember(memberId: string) {
        const monitorInfo = this.activeMonitors.get(memberId);
        if (monitorInfo) {
            monitorInfo.monitor.stop();
            this.activeMonitors.delete(memberId);
            this.streams.delete(memberId);
            console.log(`Stopped monitoring user ${memberId}`);
        }
    }

    async handleGuildCreate(guild: Guild) {
        console.log(`Joined guild ${guild.name}`);
        // this.scanGuild(guild);
    }

    async handleUserStream(
        userId: UUID,
        name: string,
        userName: string,
        channel: BaseGuildVoiceChannel,
        audioStream: Readable
    ) {
        const channelId = channel.id;
        const buffers: Buffer[] = [];
        let totalLength = 0;
        const maxSilenceTime = 1000; // Maximum pause duration in milliseconds
        const minSilenceTime = 50; // Minimum silence duration to trigger transcription
        let lastChunkTime = Date.now();
        let transcriptionStarted = false;
        let transcriptionText = "";

        // Clean up old monitor if it exists
        const existingMonitor = this.activeMonitors.get(userId);
        if (existingMonitor) {
            existingMonitor.monitor.stop();
            this.activeMonitors.delete(userId);
        }

        const monitor = new AudioMonitor(
            audioStream,
            10000000,
            async (buffer) => {
                const currentTime = Date.now();
                const silenceDuration = currentTime - lastChunkTime;
                if (!buffer) {
                    // Handle error
                    console.error("Empty buffer received");
                    return;
                }
                buffers.push(buffer);
                totalLength += buffer.length;
                lastChunkTime = currentTime;

                if (silenceDuration > minSilenceTime && !transcriptionStarted) {
                    transcriptionStarted = true;
                    const inputBuffer = Buffer.concat(buffers, totalLength);
                    buffers.length = 0;
                    totalLength = 0;

                    try {
                        // Convert Opus to WAV and add the header
                        const wavBuffer =
                            await this.convertOpusToWav(inputBuffer);

                        const transcriptionService =
                            this.runtime.getService<ITranscriptionService>(
                                ServiceType.TRANSCRIPTION
                            );

                        if (!transcriptionService) {
                            throw new Error(
                                "Transcription generation service not found"
                            );
                        }

                        const text =
                            await transcriptionService.transcribe(wavBuffer);

                        transcriptionText += text;
                    } catch (error) {
                        console.error("Error processing audio stream:", error);
                    }
                }

                if (silenceDuration > maxSilenceTime && transcriptionStarted) {
                    console.log("transcription finished");
                    transcriptionStarted = false;

                    if (!transcriptionText) return;

                    try {
                        const text = transcriptionText;

                        // handle whisper cases
                        if (
                            (text.length < 15 &&
                                text.includes("[BLANK_AUDIO]")) ||
                            (text.length < 5 &&
                                text.toLowerCase().includes("you"))
                        ) {
                            transcriptionText = ""; // Reset transcription text
                            return;
                        }

                        const roomId = stringToUuid(
                            channelId + "-" + this.runtime.agentId
                        );
                        const userIdUUID = stringToUuid(userId);

                        await this.runtime.ensureConnection(
                            userIdUUID,
                            roomId,
                            userName,
                            name,
                            "discord"
                        );

                        let state = await this.runtime.composeState(
                            {
                                agentId: this.runtime.agentId,
                                content: { text: text, source: "Discord" },
                                userId: userIdUUID,
                                roomId,
                            },
                            {
                                discordChannel: channel,
                                discordClient: this.client,
                                agentName: this.runtime.character.name,
                            }
                        );

                        if (text && text.startsWith("/")) {
                            transcriptionText = ""; // Reset transcription text
                            return null;
                        }

                        const memory = {
                            id: stringToUuid(
                                channelId + "-voice-message-" + Date.now()
                            ),
                            agentId: this.runtime.agentId,
                            content: {
                                text: text,
                                source: "discord",
                                url: channel.url,
                            },
                            userId: userIdUUID,
                            roomId,
                            embedding: embeddingZeroVector,
                            createdAt: Date.now(),
                        };

                        if (!memory.content.text) {
                            transcriptionText = ""; // Reset transcription text
                            return { text: "", action: "IGNORE" };
                        }

                        // Add rate limiting here
                        const canProcessNow = await rateLimiter.enqueue(
                            memory,
                            this.runtime
                        );
                        if (!canProcessNow) {
                            console.log(
                                `Voice message queued for later processing: ${text.substring(0, 50)}...`
                            );
                            transcriptionText = ""; // Reset transcription text
                            return; // Will be processed later from queue
                        }

                        await this.runtime.messageManager.createMemory(memory);

                        state =
                            await this.runtime.updateRecentMessageState(state);

                        const shouldIgnore = await this._shouldIgnore(memory);

                        if (shouldIgnore) {
                            transcriptionText = ""; // Reset transcription text
                            return { text: "", action: "IGNORE" };
                        }

                        const context = composeContext({
                            state,
                            template:
                                this.runtime.character.templates
                                    ?.discordVoiceHandlerTemplate ||
                                this.runtime.character.templates
                                    ?.messageHandlerTemplate ||
                                discordVoiceHandlerTemplate,
                        });

                        const responseContent = await this._generateResponse(
                            memory,
                            state,
                            context
                        );

                        const callback: HandlerCallback = async (
                            content: Content
                        ) => {
                            console.log("callback content: ", content);
                            const { roomId } = memory;

                            const responseMemory: Memory = {
                                id: stringToUuid(
                                    memory.id + "-voice-response-" + Date.now()
                                ),
                                agentId: this.runtime.agentId,
                                userId: this.runtime.agentId,
                                content: {
                                    ...content,
                                    user: this.runtime.character.name,
                                    inReplyTo: memory.id,
                                },
                                roomId,
                                embedding: embeddingZeroVector,
                            };

                            if (responseMemory.content.text?.trim()) {
                                // Filter out I-Ching hexagrams before speech generation
                                const textForSpeech = content.text
                                    .replace(/[䷀-䷿]/g, "")
                                    .trim();

                                const canProcessNow =
                                    await voiceRateLimiter.enqueue(
                                        responseMemory,
                                        this.runtime,
                                        userId,
                                        this
                                    );

                                if (!canProcessNow) {
                                    console.log(
                                        `Voice response queued for later: ${content.text?.substring(0, 50)}...`
                                    );
                                    return [responseMemory];
                                }

                                await this.runtime.messageManager.createMemory(
                                    responseMemory
                                );
                                state =
                                    await this.runtime.updateRecentMessageState(
                                        state
                                    );

                                const speechService =
                                    this.runtime.getService<ISpeechService>(
                                        ServiceType.SPEECH_GENERATION
                                    );
                                if (!speechService) {
                                    throw new Error(
                                        "Speech generation service not found"
                                    );
                                }

                                const responseStream =
                                    await speechService.generate(
                                        this.runtime,
                                        textForSpeech
                                    );

                                if (responseStream) {
                                    await this.playAudioStream(
                                        userId,
                                        responseStream as Readable
                                    );
                                }
                                await this.runtime.evaluate(memory, state);
                            } else {
                                console.warn("Empty response, skipping");
                            }
                            return [responseMemory];
                        };

                        const responseMemories =
                            await callback(responseContent);

                        const response = responseContent;

                        const content = (response.responseMessage ||
                            response.content ||
                            response.message) as string;

                        if (!content) {
                            transcriptionText = ""; // Reset transcription text
                            return null;
                        }

                        console.log("responseMemories: ", responseMemories);

                        await this.runtime.processActions(
                            memory,
                            responseMemories,
                            state,
                            callback
                        );

                        transcriptionText = ""; // Reset transcription text
                    } catch (error) {
                        console.error(
                            "Error processing transcribed text:",
                            error
                        );
                        transcriptionText = ""; // Reset transcription text
                    }
                }
            }
        );
        // Store the monitor in activeMonitors
        this.activeMonitors.set(userId, { channel, monitor });
    }

    private async convertOpusToWav(pcmBuffer: Buffer): Promise<Buffer> {
        try {
            // Generate the WAV header
            const wavHeader = getWavHeader(
                pcmBuffer.length,
                DECODE_SAMPLE_RATE
            );

            // Concatenate the WAV header and PCM data
            const wavBuffer = Buffer.concat([wavHeader, pcmBuffer]);

            return wavBuffer;
        } catch (error) {
            console.error("Error converting PCM to WAV:", error);
            throw error;
        }
    }

    private async _generateResponse(
        message: Memory,
        state: State,
        context: string
    ): Promise<Content> {
        const { userId, roomId } = message;

        const response = await generateMessageResponse({
            runtime: this.runtime,
            context,
            modelClass: ModelClass.SMALL,
        });

        response.source = "discord";

        if (!response) {
            console.error("No response from generateMessageResponse");
            return;
        }

        await this.runtime.databaseAdapter.log({
            body: { message, context, response },
            userId: userId,
            roomId,
            type: "response",
        });

        return response;
    }

    private async _shouldIgnore(message: Memory): Promise<boolean> {
        console.log("message: ", message);
        console.log("message.content: ", message.content);
        // if the message is 3 characters or less, ignore it
        if ((message.content as Content).text.length < 3) {
            return true;
        }

        const loseInterestWords = [
            // telling the bot to stop talking
            "shut up",
            "stop",
            "dont talk",
            "silence",
            "stop talking",
            "be quiet",
            "hush",
            "stfu",
            "stupid bot",
            "dumb bot",

            // offensive words
            "fuck",
            "shit",
            "damn",
            "suck",
            "dick",
            "cock",
            "sex",
            "sexy",
        ];
        if (
            (message.content as Content).text.length < 50 &&
            loseInterestWords.some((word) =>
                (message.content as Content).text?.toLowerCase().includes(word)
            )
        ) {
            return true;
        }

        const ignoreWords = ["k", "ok", "bye", "lol", "nm", "uh"];
        if (
            (message.content as Content).text?.length < 8 &&
            ignoreWords.some((word) =>
                (message.content as Content).text?.toLowerCase().includes(word)
            )
        ) {
            return true;
        }

        return false;
    }

    async scanGuild(guild: Guild) {
        // Removed automatic joining logic
        // This method is now only called explicitly when needed
        return;

        const channels = (await guild.channels.fetch()).filter(
            (channel) => channel?.type == ChannelType.GuildVoice
        );
        let chosenChannel: BaseGuildVoiceChannel | null = null;

        for (const [, channel] of channels) {
            const voiceChannel = channel as BaseGuildVoiceChannel;
            if (
                voiceChannel.members.size > 0 &&
                (chosenChannel === null ||
                    voiceChannel.members.size > chosenChannel.members.size)
            ) {
                chosenChannel = voiceChannel;
            }
        }

        if (chosenChannel != null) {
            this.joinChannel(chosenChannel);
        }
    }

    async playAudioStream(userId: UUID, audioStream: Readable) {
        const connection = this.connections.get(userId);
        if (connection == null) {
            console.log(`No connection for user ${userId}`);
            return;
        }
        const audioPlayer = createAudioPlayer({
            behaviors: {
                noSubscriber: NoSubscriberBehavior.Pause,
            },
        });
        connection.subscribe(audioPlayer);

        const audioStartTime = Date.now();

        const resource = createAudioResource(audioStream, {
            inputType: StreamType.Arbitrary,
        });
        audioPlayer.play(resource);

        audioPlayer.on("error", (err: any) => {
            console.log(`Audio player error: ${err}`);
        });

        audioPlayer.on(
            "stateChange",
            (oldState: any, newState: { status: string }) => {
                if (newState.status == "idle") {
                    const idleTime = Date.now();
                    console.log(
                        `Audio playback took: ${idleTime - audioStartTime}ms`
                    );
                }
            }
        );
    }

    async handleJoinChannelCommand(interaction: any) {
        const channelId = interaction.options.get("channel")?.value as string;
        if (!channelId) {
            await interaction.reply("Please provide a voice channel to join.");
            return;
        }
        const guild = interaction.guild;
        if (!guild) {
            return;
        }
        const voiceChannel = interaction.guild.channels.cache.find(
            (channel: VoiceChannel) =>
                channel.id === channelId &&
                channel.type === ChannelType.GuildVoice
        );

        if (!voiceChannel) {
            await interaction.reply("Voice channel not found!");
            return;
        }

        try {
            this.joinChannel(voiceChannel as BaseGuildVoiceChannel);
            await interaction.reply(
                `Joined voice channel: ${voiceChannel.name}`
            );
        } catch (error) {
            console.error("Error joining voice channel:", error);
            await interaction.reply("Failed to join the voice channel.");
        }
    }

    async handleLeaveChannelCommand(interaction: any) {
        const connection = getVoiceConnection(interaction.guildId as any);

        if (!connection) {
            await interaction.reply("Not currently in a voice channel.");
            return;
        }

        try {
            connection.destroy();
            await interaction.reply("Left the voice channel.");
        } catch (error) {
            console.error("Error leaving voice channel:", error);
            await interaction.reply("Failed to leave the voice channel.");
        }
    }
}
