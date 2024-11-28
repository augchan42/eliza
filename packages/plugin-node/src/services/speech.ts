import { PassThrough, Readable } from "stream";
import { IAgentRuntime, ISpeechService, ServiceType } from "@ai16z/eliza";
import { getWavHeader } from "./audioUtils.ts";
import { Service } from "@ai16z/eliza";
import { validateNodeConfig } from "../environment.ts";
import * as Echogarden from "echogarden";

interface VoiceSettings {
    model?: string;
    speed?: number;
    pitch?: number;
    volume?: number;
}

function prependWavHeader(
    readable: Readable,
    audioLength: number,
    sampleRate: number,
    channelCount: number = 1,
    bitsPerSample: number = 16
): Readable {
    const wavHeader = getWavHeader(
        audioLength,
        sampleRate,
        channelCount,
        bitsPerSample
    );
    let pushedHeader = false;
    const passThrough = new PassThrough();
    readable.on("data", function (data) {
        if (!pushedHeader) {
            passThrough.push(wavHeader);
            pushedHeader = true;
        }
        passThrough.push(data);
    });
    readable.on("end", function () {
        passThrough.end();
    });
    return passThrough;
}

async function textToSpeech(runtime: IAgentRuntime, text: string) {
    await validateNodeConfig(runtime);

    // Helper function to create WAV stream from audio data
    const createWavStream = async (audio: any): Promise<Readable> => {
        if (audio instanceof Buffer) {
            console.log("audio is a buffer");
            return Readable.from(audio);
        }
        if ("audioChannels" in audio && "sampleRate" in audio) {
            console.log("audio is a RawAudio");
            const floatBuffer = Buffer.from(audio.audioChannels[0].buffer);
            const floatArray = new Float32Array(floatBuffer.buffer);
            const pcmBuffer = new Int16Array(floatArray.length);

            for (let i = 0; i < floatArray.length; i++) {
                pcmBuffer[i] = Math.round(floatArray[i] * 32767);
            }

            const wavHeaderBuffer = getWavHeader(
                pcmBuffer.length * 2,
                audio.sampleRate,
                1,
                16
            );
            const wavBuffer = Buffer.concat([
                wavHeaderBuffer,
                Buffer.from(pcmBuffer.buffer),
            ]);

            return Readable.from(wavBuffer);
        }
        throw new Error("Unsupported audio format");
    };

    // Try ElevenLabs if configured
    if (runtime.getSetting("ELEVENLABS_XI_API_KEY")) {
        try {
            const response = await fetch(
                `https://api.elevenlabs.io/v1/text-to-speech/${runtime.getSetting("ELEVENLABS_VOICE_ID")}/stream?optimize_streaming_latency=${runtime.getSetting("ELEVENLABS_OPTIMIZE_STREAMING_LATENCY")}&output_format=${runtime.getSetting("ELEVENLABS_OUTPUT_FORMAT")}`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "xi-api-key": runtime.getSetting(
                            "ELEVENLABS_XI_API_KEY"
                        ),
                    },
                    body: JSON.stringify({
                        model_id: runtime.getSetting("ELEVENLABS_MODEL_ID"),
                        text,
                        voice_settings: {
                            similarity_boost: runtime.getSetting(
                                "ELEVENLABS_VOICE_SIMILARITY_BOOST"
                            ),
                            stability: runtime.getSetting(
                                "ELEVENLABS_VOICE_STABILITY"
                            ),
                            style: runtime.getSetting("ELEVENLABS_VOICE_STYLE"),
                            use_speaker_boost: runtime.getSetting(
                                "ELEVENLABS_VOICE_USE_SPEAKER_BOOST"
                            ),
                        },
                    }),
                }
            );

            if (response.status === 200) {
                const reader = response.body?.getReader();
                const readable = new Readable({
                    read() {
                        reader?.read().then(({ done, value }) => {
                            if (done) this.push(null);
                            else this.push(value);
                        });
                    },
                });

                if (
                    runtime
                        .getSetting("ELEVENLABS_OUTPUT_FORMAT")
                        .startsWith("pcm_")
                ) {
                    const sampleRate = parseInt(
                        runtime
                            .getSetting("ELEVENLABS_OUTPUT_FORMAT")
                            .substring(4)
                    );
                    return prependWavHeader(
                        readable,
                        1024 * 1024 * 100,
                        sampleRate,
                        1,
                        16
                    );
                }
                return readable;
            }
            console.log("ElevenLabs failed, falling back to VITS");
        } catch (error) {
            console.log("ElevenLabs error, falling back to VITS:", error);
        }
    }

    // Default to VITS
    const { audio } = await Echogarden.synthesize(text, {
        engine: "vits",
        voice: "en_US-hfc_female-medium",
    });
    return createWavStream(audio);
}

export class SpeechService extends Service implements ISpeechService {
    static serviceType: ServiceType = ServiceType.SPEECH_GENERATION;

    async initialize(runtime: IAgentRuntime): Promise<void> {}

    getInstance(): ISpeechService {
        return SpeechService.getInstance();
    }

    async generate(runtime: IAgentRuntime, text: string): Promise<Readable> {
        try {
            // check for elevenlabs API key
            if (runtime.getSetting("ELEVENLABS_XI_API_KEY")) {
                return await textToSpeech(runtime, text);
            }

            // Get voice settings from character configuration
            // Then cast the settings
            const voiceSettings = (runtime.getSetting("voice") ||
                {}) as VoiceSettings;
            const requestedVoice =
                voiceSettings.model || "en_US-hfc_female-medium";

            console.log("Voice settings:", {
                settings: voiceSettings,
                usingVoice: requestedVoice,
            });
            // Default to VITS if no ElevenLabs API key
            // Use the configured voice
            const { audio } = await Echogarden.synthesize(text, {
                engine: "vits",
                voice: requestedVoice,
                // Optional: could also add other voice settings if defined
                speed: voiceSettings.speed || 1.0,
                pitch: voiceSettings.pitch || 1.0,
            });

            let wavStream: Readable;
            if (audio instanceof Buffer) {
                console.log("audio is a buffer");
                wavStream = Readable.from(audio);
            } else if ("audioChannels" in audio && "sampleRate" in audio) {
                console.log("audio is a RawAudio");
                const floatBuffer = Buffer.from(audio.audioChannels[0].buffer);
                console.log("buffer length: ", floatBuffer.length);

                // Get the sample rate from the RawAudio object
                const sampleRate = audio.sampleRate;

                // Create a Float32Array view of the floatBuffer
                const floatArray = new Float32Array(floatBuffer.buffer);

                // Convert 32-bit float audio to 16-bit PCM
                const pcmBuffer = new Int16Array(floatArray.length);
                for (let i = 0; i < floatArray.length; i++) {
                    pcmBuffer[i] = Math.round(floatArray[i] * 32767);
                }

                // Prepend WAV header to the buffer
                const wavHeaderBuffer = getWavHeader(
                    pcmBuffer.length * 2,
                    sampleRate,
                    1,
                    16
                );
                const wavBuffer = Buffer.concat([
                    wavHeaderBuffer,
                    Buffer.from(pcmBuffer.buffer),
                ]);

                wavStream = Readable.from(wavBuffer);
            } else {
                throw new Error("Unsupported audio format");
            }

            return wavStream;
        } catch (error) {
            console.error("Speech generation error:", error);
            // If ElevenLabs fails for any reason, fall back to VITS
            const { audio } = await Echogarden.synthesize(text, {
                engine: "vits",
                voice: "en_US-hfc_female-medium",
            });

            let wavStream: Readable;
            if (audio instanceof Buffer) {
                console.log("audio is a buffer");
                wavStream = Readable.from(audio);
            } else if ("audioChannels" in audio && "sampleRate" in audio) {
                console.log("audio is a RawAudio");
                const floatBuffer = Buffer.from(audio.audioChannels[0].buffer);
                console.log("buffer length: ", floatBuffer.length);

                // Get the sample rate from the RawAudio object
                const sampleRate = audio.sampleRate;

                // Create a Float32Array view of the floatBuffer
                const floatArray = new Float32Array(floatBuffer.buffer);

                // Convert 32-bit float audio to 16-bit PCM
                const pcmBuffer = new Int16Array(floatArray.length);
                for (let i = 0; i < floatArray.length; i++) {
                    pcmBuffer[i] = Math.round(floatArray[i] * 32767);
                }

                // Prepend WAV header to the buffer
                const wavHeaderBuffer = getWavHeader(
                    pcmBuffer.length * 2,
                    sampleRate,
                    1,
                    16
                );
                const wavBuffer = Buffer.concat([
                    wavHeaderBuffer,
                    Buffer.from(pcmBuffer.buffer),
                ]);

                wavStream = Readable.from(wavBuffer);
            } else {
                throw new Error("Unsupported audio format");
            }

            return wavStream;
        }
    }
}
