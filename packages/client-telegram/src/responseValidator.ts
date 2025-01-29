import { elizaLogger } from "@elizaos/core";
import {
    type Content,
    type ContentMetadata,
    type IAgentRuntime,
    ModelClass,
} from "@elizaos/core";
import { generateText } from "@elizaos/core";

export interface Correction {
    original: string;
    corrected: string;
    reason: string;
}

// Main validation result structure
export interface ValidationResult {
    isValid: boolean;
    corrections: Correction[];
    correctedContent?: Content;
}

export const validationPrompt = `You are a validation assistant. Your task is to check if the response contains any serious factual errors or critical inconsistencies when compared to the provided knowledge base entries.

For I-Ching and other divinatory responses:
- Allow creative interpretation and metaphorical language
- Only flag clear factual errors (wrong hexagram names, incorrect symbols, wrong numbers)
- Preserve the poetic and interpretive nature of readings
- Allow references to traditional concepts even if not explicitly in knowledge base
- Focus on correcting technical accuracy while preserving interpretive freedom

Focus on validating:
1. Hexagram numbers match their correct names
2. Correct Unicode symbols are used for hexagrams
3. Basic facts are not contradicted (if stated in knowledge base)
4. Names and key terms are spelled correctly

Do NOT flag:
- Creative interpretations
- Metaphorical language
- Traditional concepts not contradicted by knowledge base
- Poetic or artistic expressions
- References to common I-Ching themes

IMPORTANT: Respond ONLY with a JSON object and no additional text. Format your response as:
{
    "isValid": boolean,
    "corrections": [
        {
            "original": "text with critical error",
            "corrected": "corrected text",
            "reason": "explanation of correction"
        }
    ]
}`;

export class ResponseValidator {
    private runtime: IAgentRuntime;

    constructor(runtime: IAgentRuntime) {
        elizaLogger.debug("ResponseValidator: Initializing with runtime", {
            runtimeId: runtime?.agentId,
            hasRagManager: !!runtime?.ragKnowledgeManager,
        });
        this.runtime = runtime;
    }

    private extractJSON(text: string): string {
        try {
            // Find first { and last }
            const start = text.indexOf("{");
            const end = text.lastIndexOf("}") + 1;
            if (start === -1 || end === 0) return text;

            return text.slice(start, end);
        } catch (error) {
            elizaLogger.error("Failed to extract JSON from text", {
                text,
                error,
            });
            return text;
        }
    }

    async validateResponse(
        response: Content,
        conversationContext: string,
    ): Promise<ValidationResult> {
        elizaLogger.debug(
            "ResponseValidator.validateResponse: Starting validation",
            {
                responseLength: response?.text?.length,
                hasContext: !!conversationContext,
                responseMetadata: response?.metadata,
            },
        );

        try {
            const recentContext = conversationContext || response.text;
            elizaLogger.debug("ResponseValidator: Using context", {
                contextLength: recentContext?.length,
                isUsingResponseAsContext: !conversationContext,
            });

            elizaLogger.debug("ResponseValidator: Fetching knowledge data", {
                queryLength: response.text?.length,
                contextLength: recentContext?.length,
            });

            const knowledgeData =
                await this.runtime.ragKnowledgeManager.getKnowledge({
                    query: response.text,
                    conversationContext: recentContext,
                    limit: 5,
                });

            elizaLogger.debug("ResponseValidator: Knowledge data fetched", {
                knowledgeEntriesCount: knowledgeData?.length,
                hasKnowledgeData: !!knowledgeData,
            });

            if (!knowledgeData || knowledgeData.length === 0) {
                elizaLogger.debug(
                    "ResponseValidator: No knowledge data found, returning default validation",
                );
                return {
                    isValid: true,
                    corrections: [],
                };
            }

            const formattedKnowledge = knowledgeData
                .map((k) => k.content.text)
                .join("\n\n");

            elizaLogger.debug("ResponseValidator: Knowledge formatted", {
                formattedKnowledgeLength: formattedKnowledge?.length,
                entriesFormatted: knowledgeData.length,
            });

            const validationContext = `
Knowledge Base Entries:
${formattedKnowledge}

Response to Validate:
${response.text}

${validationPrompt}`;

            elizaLogger.debug("ResponseValidator: Generating validation", {
                validationContextLength: validationContext.length,
                modelClass: ModelClass.SMALL,
            });

            const validationResponse = await generateText({
                runtime: this.runtime,
                context: validationContext,
                modelClass: ModelClass.SMALL,
            });

            elizaLogger.debug(
                "ResponseValidator: Parsing validation response",
                {
                    validationResponseLength: validationResponse?.length,
                    hasValidationResponse: !!validationResponse,
                    validationResponse: validationResponse,
                },
            );

            let validation: ValidationResult;
            try {
                // Extract just the JSON part
                const jsonPart = this.extractJSON(validationResponse);
                validation = JSON.parse(jsonPart) as ValidationResult;

                elizaLogger.debug(
                    "ResponseValidator: Parsed validation result",
                    {
                        isValid: validation.isValid,
                        correctionsCount: validation.corrections?.length,
                        hasCorrections: Array.isArray(validation.corrections),
                        extractedJson: jsonPart,
                    },
                );

                if (!validation.isValid && validation.corrections?.length > 0) {
                    elizaLogger.debug(
                        "ResponseValidator: Applying corrections",
                        {
                            numberOfCorrections: validation.corrections.length,
                            corrections: validation.corrections.map((c) => ({
                                originalLength: c.original?.length,
                                correctedLength: c.corrected?.length,
                                reasonLength: c.reason?.length,
                            })),
                        },
                    );

                    let correctedText = response.text;
                    for (const correction of validation.corrections) {
                        correctedText = correctedText.replace(
                            correction.original,
                            correction.corrected,
                        );
                    }

                    elizaLogger.debug("ResponseValidator: Text corrected", {
                        originalTextLength: response.text.length,
                        correctedTextLength: correctedText.length,
                        hasDifference: correctedText !== response.text,
                    });

                    const metadata: ContentMetadata = {
                        ...(response.metadata || {}),
                        corrections: validation.corrections,
                        timestamp: Date.now(),
                    };

                    validation.correctedContent = {
                        ...response,
                        text: correctedText,
                        metadata,
                    };

                    elizaLogger.debug(
                        "ResponseValidator: Created corrected content",
                        {
                            hasMetadata: !!metadata,
                            hasCorrectedContent: !!validation.correctedContent,
                        },
                    );
                }

                return validation;
            } catch (parseError) {
                elizaLogger.error(
                    "ResponseValidator: Failed to parse validation response",
                    {
                        error: parseError,
                        validationResponse,
                    },
                );
                // throw new Error("Failed to parse validation response");
                // Return a default valid result instead of throwing
                return {
                    isValid: true,
                    corrections: [],
                };
            }
        } catch (error) {
            elizaLogger.error("ResponseValidator: Error during validation", {
                error,
                errorMessage: error?.message,
                errorStack: error?.stack,
            });
            return {
                isValid: true,
                corrections: [],
            };
        }
    }
}
