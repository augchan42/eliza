import { IAgentRuntime, settings } from "@ai16z/eliza";
import { Service, ServiceType } from "@ai16z/eliza";
import { exec } from "child_process";
import { File } from "formdata-node";
import fs from "fs";
import { nodewhisper } from "nodejs-whisper";
import OpenAI from "openai"; // todo, can probably move this to model provider or whateer
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { promisify } from "util";

// Instead, use the same pattern as vits.ts
const PLUGIN_ROOT = (() => {
    const currentScriptDir = path.dirname(fileURLToPath(import.meta.url));
    return path.resolve(currentScriptDir, "..", "..");
})();

const execAsync = promisify(exec);

export class TranscriptionService extends Service {
    static serviceType: ServiceType = ServiceType.TRANSCRIPTION;
    private CONTENT_CACHE_DIR: string;
    private DEBUG_AUDIO_DIR: string;
    private TARGET_SAMPLE_RATE = 16000; // Common sample rate for speech recognition
    private isCudaAvailable: boolean = false;
    private openai: OpenAI | null = null;

    private queue: { audioBuffer: ArrayBuffer; resolve: Function }[] = [];
    private processing: boolean = false;

    async initialize(runtime: IAgentRuntime): Promise<void> {}

    constructor() {
        super();
        this.CONTENT_CACHE_DIR = path.join(PLUGIN_ROOT, "content_cache");
        this.DEBUG_AUDIO_DIR = path.join(PLUGIN_ROOT, "debug_audio");
        this.ensureCacheDirectoryExists();
        this.ensureDebugDirectoryExists();
        // TODO: It'd be nice to handle this more gracefully, but we can do local transcription for now
        // TODO: remove the runtime from here, use it when called
        // if (runtime.getSetting("OPENAI_API_KEY")) {
        //     this.openai = new OpenAI({
        //         apiKey: runtime.getSetting("OPENAI_API_KEY"),
        //     });
        // } else {
        //     this.detectCuda();
        // }
    }

    private ensureCacheDirectoryExists() {
        if (!fs.existsSync(this.CONTENT_CACHE_DIR)) {
            fs.mkdirSync(this.CONTENT_CACHE_DIR, { recursive: true });
        }
    }

    private ensureDebugDirectoryExists() {
        if (!fs.existsSync(this.DEBUG_AUDIO_DIR)) {
            fs.mkdirSync(this.DEBUG_AUDIO_DIR, { recursive: true });
        }
    }

    private detectCuda() {
        const platform = os.platform();
        if (platform === "linux") {
            try {
                fs.accessSync("/usr/local/cuda/bin/nvcc", fs.constants.X_OK);
                this.isCudaAvailable = true;
                console.log(
                    "CUDA detected. Transcription will use CUDA acceleration."
                );
            } catch (error) {
                console.log(
                    "CUDA not detected. Transcription will run on CPU."
                );
            }
        } else if (platform === "win32") {
            const cudaPath = path.join(
                settings.CUDA_PATH ||
                    "C:\\Program Files\\NVIDIA GPU Computing Toolkit\\CUDA\\v11.0",
                "bin",
                "nvcc.exe"
            );
            if (fs.existsSync(cudaPath)) {
                this.isCudaAvailable = true;
                console.log(
                    "CUDA detected. Transcription will use CUDA acceleration."
                );
            } else {
                console.log(
                    "CUDA not detected. Transcription will run on CPU."
                );
            }
        } else {
            console.log(
                "CUDA not supported on this platform. Transcription will run on CPU."
            );
        }
    }

    private async convertAudio(inputBuffer: ArrayBuffer): Promise<Buffer> {
        const inputPath = path.join(
            this.CONTENT_CACHE_DIR,
            `input_${Date.now()}.wav`
        );
        const outputPath = path.join(
            this.CONTENT_CACHE_DIR,
            `output_${Date.now()}.wav`
        );

        fs.writeFileSync(inputPath, Buffer.from(inputBuffer));

        try {
            const { stdout } = await execAsync(
                `ffprobe -v error -show_entries stream=codec_name,sample_rate,channels -of json "${inputPath}"`
            );
            const probeResult = JSON.parse(stdout);
            const stream = probeResult.streams[0];

            console.log("Input audio info:", stream);

            let ffmpegCommand = `ffmpeg -i "${inputPath}" -ar ${this.TARGET_SAMPLE_RATE} -ac 1`;

            if (stream.codec_name === "pcm_f32le") {
                ffmpegCommand += " -acodec pcm_s16le";
            }

            ffmpegCommand += ` "${outputPath}"`;

            console.log("FFmpeg command:", ffmpegCommand);

            await execAsync(ffmpegCommand);

            const convertedBuffer = fs.readFileSync(outputPath);
            fs.unlinkSync(inputPath);
            fs.unlinkSync(outputPath);
            return convertedBuffer;
        } catch (error) {
            console.error("Error converting audio:", error);
            throw error;
        }
    }

    private createWavHeader(
        dataLength: number,
        sampleRate: number = 16000,
        channels: number = 1,
        bitsPerSample: number = 16
    ): Buffer {
        const header = Buffer.alloc(44);

        // RIFF identifier
        header.write("RIFF", 0);
        // File length minus RIFF header
        header.writeInt32LE(36 + dataLength, 4);
        // WAVE format
        header.write("WAVE", 8);
        // Format chunk identifier
        header.write("fmt ", 12);
        // Format chunk length
        header.writeInt32LE(16, 16);
        // Sample format (1 is PCM)
        header.writeInt16LE(1, 20);
        // Channel count
        header.writeInt16LE(channels, 22);
        // Sample rate
        header.writeInt32LE(sampleRate, 24);
        // Byte rate (sample rate * block align)
        header.writeInt32LE((sampleRate * channels * bitsPerSample) / 8, 28);
        // Block align
        header.writeInt16LE((channels * bitsPerSample) / 8, 32);
        // Bits per sample
        header.writeInt16LE(bitsPerSample, 34);
        // Data chunk identifier
        header.write("data", 36);
        // Data chunk length
        header.writeInt32LE(dataLength, 40);

        return header;
    }

    private async saveDebugAudio(
        audioBuffer: ArrayBuffer | Buffer,
        prefix: string
    ) {
        try {
            this.ensureDebugDirectoryExists();
            const filename = `${prefix}_${Date.now()}.wav`;
            const filePath = path.join(this.DEBUG_AUDIO_DIR, filename);

            // Log the audio buffer details
            console.log("Debug audio details:", {
                prefix,
                bufferSize: audioBuffer.byteLength,
                path: filePath,
                type: audioBuffer.constructor.name,
            });

            // Ensure we have an ArrayBuffer to work with
            let arrayBuffer: ArrayBuffer;
            if (Buffer.isBuffer(audioBuffer)) {
                arrayBuffer = audioBuffer.buffer.slice(
                    audioBuffer.byteOffset,
                    audioBuffer.byteOffset + audioBuffer.byteLength
                );
            } else {
                arrayBuffer = audioBuffer;
            }

            try {
                // Check if it's a valid WAV format
                const view = new DataView(arrayBuffer);
                const header = {
                    riff: String.fromCharCode(
                        ...new Uint8Array(arrayBuffer.slice(0, 4))
                    ),
                    sampleRate: view.getUint32(24, true),
                    bitsPerSample: view.getUint16(34, true),
                    channels: view.getUint16(22, true),
                };
                console.log("WAV header info:", header);

                if (header.riff !== "RIFF") {
                    // No WAV header, add one
                    const wavHeader = this.createWavHeader(
                        arrayBuffer.byteLength,
                        16000,
                        1,
                        16
                    );

                    // Create a new buffer with header + data
                    const finalBuffer = Buffer.concat([
                        wavHeader,
                        Buffer.from(arrayBuffer),
                    ]);
                    fs.writeFileSync(filePath, finalBuffer);
                } else {
                    // Already has WAV header, write directly
                    fs.writeFileSync(filePath, Buffer.from(arrayBuffer));
                }
            } catch (error) {
                console.error("Error processing audio buffer:", {
                    error,
                    bufferType: audioBuffer.constructor.name,
                    bufferSize: audioBuffer.byteLength,
                    hasArrayBuffer: !!arrayBuffer,
                });
                throw error;
            }

            console.log(`Debug audio saved: ${filePath}`);
        } catch (error) {
            console.error("Error saving debug audio:", {
                error,
                bufferType: audioBuffer?.constructor.name,
                bufferSize: audioBuffer?.byteLength,
            });
        }
    }

    public async transcribeAttachment(
        audioBuffer: ArrayBuffer
    ): Promise<string | null> {
        return await this.transcribe(audioBuffer);
    }

    public async transcribe(audioBuffer: ArrayBuffer): Promise<string | null> {
        // if the audio buffer is less than .2 seconds, just return null
        if (audioBuffer.byteLength < 0.2 * 16000) {
            console.log("Audio buffer too small, skipping");
            return null;
        }

        return new Promise((resolve) => {
            console.log("Adding to transcription queue");
            this.queue.push({ audioBuffer, resolve });
            if (!this.processing) {
                console.log("Starting queue processing");
                this.processQueue();
            }
        });
    }

    public async transcribeAttachmentLocally(
        audioBuffer: ArrayBuffer
    ): Promise<string | null> {
        return this.transcribeLocally(audioBuffer);
    }

    private async processQueue(): Promise<void> {
        console.log("=== Queue Processing Start ===");
        if (this.processing || this.queue.length === 0) {
            console.log("Queue processing skipped:", {
                isProcessing: this.processing,
                queueLength: this.queue.length,
            });
            return;
        }

        this.processing = true;
        console.log("Processing queue items:", this.queue.length);

        while (this.queue.length > 0) {
            const { audioBuffer, resolve } = this.queue.shift()!;
            let result: string | null = null;

            if (this.openai) {
                result = await this.transcribeWithOpenAI(audioBuffer);
                console.log("openai Transcription result:", result);
            } else {
                result = await this.transcribeLocally(audioBuffer);
                console.log("local Transcription result:", result);
            }

            resolve(result);
        }

        this.processing = false;
        console.log("=== Queue Processing End ===");
    }

    private async transcribeWithOpenAI(
        audioBuffer: ArrayBuffer
    ): Promise<string | null> {
        console.log("Transcribing audio with OpenAI...");

        try {
            await this.saveDebugAudio(audioBuffer, "openai_input_original");

            const convertedBuffer = await this.convertAudio(audioBuffer);

            await this.saveDebugAudio(
                convertedBuffer,
                "openai_input_converted"
            );

            const file = new File([convertedBuffer], "audio.wav", {
                type: "audio/wav",
            });

            const result = await this.openai!.audio.transcriptions.create({
                model: "whisper-1",
                language: "en",
                response_format: "text",
                file: file,
            });

            const trimmedResult = (result as any).trim();
            console.log(`OpenAI speech to text result: "${trimmedResult}"`);

            return trimmedResult;
        } catch (error) {
            console.error("Error in OpenAI speech-to-text conversion:", error);
            if (error.response) {
                console.error("Response data:", error.response.data);
                console.error("Response status:", error.response.status);
                console.error("Response headers:", error.response.headers);
            } else if (error.request) {
                console.error("No response received:", error.request);
            } else {
                console.error("Error setting up request:", error.message);
            }
            return null;
        }
    }

    public async transcribeLocally(
        audioBuffer: ArrayBuffer
    ): Promise<string | null> {
        try {
            console.log("Transcribing audio locally...");

            await this.saveDebugAudio(audioBuffer, "local_input_original");

            const convertedBuffer = await this.convertAudio(audioBuffer);

            await this.saveDebugAudio(convertedBuffer, "local_input_converted");

            const tempWavFile = path.join(
                this.CONTENT_CACHE_DIR,
                `temp_${Date.now()}.wav`
            );
            fs.writeFileSync(tempWavFile, convertedBuffer);

            console.log(`Temporary WAV file created: ${tempWavFile}`);

            let output = await nodewhisper(tempWavFile, {
                modelName: "base.en",
                autoDownloadModelName: "base.en",
                verbose: true,
                removeWavFileAfterTranscription: false,
                withCuda: this.isCudaAvailable,
                whisperOptions: {
                    outputInText: true,
                    outputInVtt: false,
                    outputInSrt: false,
                    outputInCsv: false,
                    translateToEnglish: false,
                    wordTimestamps: false,
                    timestamps_length: 60,
                    // splitOnWord: true,
                },
            });

            console.log("Raw output from nodejs-whisper:", output);

            output = output
                .split("\n")
                .map((line) => {
                    if (line.trim().startsWith("[")) {
                        const endIndex = line.indexOf("]");
                        return line.substring(endIndex + 1);
                    }
                    return line;
                })
                .join("\n");

            console.log("Processed output:", output);

            fs.unlinkSync(tempWavFile);

            if (!output || output.length < 5) {
                console.log("Output is null or too short, returning null");
                return null;
            }
            return output;
        } catch (error) {
            console.error("Error in local speech-to-text conversion:", error);
            return null;
        }
    }
}
