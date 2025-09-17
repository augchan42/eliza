import { elizaLogger } from "../logger.js";
import { parseJSONObjectFromText } from "../parsing.js";

export interface JSONParsingResult {
    success: boolean;
    data: any | null;
    strategy: string;
    warnings?: string[];
}

/**
 * Robust JSON parser with multiple fallback strategies for handling malformed JSON responses.
 * Particularly useful for parsing LLM responses that may be truncated or contain formatting errors.
 */
export class RobustJSONParser {
    /**
     * Parse JSON string using multiple fallback strategies
     * @param jsonString The JSON string to parse
     * @returns Parsing result with success status, data, and metadata
     */
    static parseWithFallbacks(jsonString: string): JSONParsingResult {
        const strategies = [
            this.strategy1_parseJSONObjectFromText,
            this.strategy2_nativeJSONParse,
            this.strategy3_autoFixCommonErrors,
            this.strategy4_extractRankingsArray,
            this.strategy5_completeTruncatedJSON
        ];

        for (let i = 0; i < strategies.length; i++) {
            try {
                const result = strategies[i](jsonString);
                if (result.success) {
                    elizaLogger.debug(`   Strategy ${i + 1} (${result.strategy}) succeeded`);
                    if (result.warnings) {
                        result.warnings.forEach(warning => elizaLogger.warn(`   ${warning}`));
                    }
                    return result;
                }
            } catch (error) {
                elizaLogger.debug(`   Strategy ${i + 1} failed:`, error.message);
            }
        }

        elizaLogger.warn('❌ All parsing strategies failed');
        return { success: false, data: null, strategy: "all_failed" };
    }

    /**
     * Strategy 1: Use Eliza's built-in parseJSONObjectFromText utility
     */
    private static strategy1_parseJSONObjectFromText(jsonString: string): JSONParsingResult {
        const parsed = parseJSONObjectFromText(jsonString);
        return parsed ?
            { success: true, data: parsed, strategy: "parseJSONObjectFromText" } :
            { success: false, data: null, strategy: "parseJSONObjectFromText" };
    }

    /**
     * Strategy 2: Native JSON.parse as fallback
     */
    private static strategy2_nativeJSONParse(jsonString: string): JSONParsingResult {
        const parsed = JSON.parse(jsonString);
        return { success: true, data: parsed, strategy: "JSON.parse" };
    }

    /**
     * Strategy 3: Auto-fix common JSON formatting errors
     */
    private static strategy3_autoFixCommonErrors(jsonString: string): JSONParsingResult {
        // Remove trailing commas
        let fixedJson = jsonString.replace(/,\s*([}\]])/g, '$1');

        // Ensure proper quote escaping (basic fix)
        fixedJson = fixedJson.replace(/([^\\])"([^"]*[^\\])"/g, (match, p1, p2) => {
            // Check if quotes inside need escaping
            const inner = p2.replace(/"/g, '\\"');
            return `${p1}"${inner}"`;
        });

        const parsed = JSON.parse(fixedJson);
        return { success: true, data: parsed, strategy: "auto-fix" };
    }

    /**
     * Strategy 4: Extract just the rankings array if possible
     */
    private static strategy4_extractRankingsArray(jsonString: string): JSONParsingResult {
        const rankingsMatch = jsonString.match(/"rankings"\s*:\s*\[(.*?)\]/s);
        if (rankingsMatch) {
            const rankingsJson = `{"rankings":[${rankingsMatch[1]}]}`;
            const parsed = JSON.parse(rankingsJson);
            return { success: true, data: parsed, strategy: "extract-rankings" };
        }
        return { success: false, data: null, strategy: "extract-rankings" };
    }

    /**
     * Strategy 5: Complete truncated JSON by balancing brackets and quotes
     */
    private static strategy5_completeTruncatedJSON(jsonString: string): JSONParsingResult {
        const openBraces = (jsonString.match(/\{/g) || []).length;
        const closeBraces = (jsonString.match(/\}/g) || []).length;
        const openSquare = (jsonString.match(/\[/g) || []).length;
        const closeSquare = (jsonString.match(/\]/g) || []).length;

        if (openBraces > closeBraces || openSquare > closeSquare) {
            elizaLogger.debug('   Detected truncated JSON, attempting repair...');

            let fixedJson = jsonString;

            // If we're in the middle of a string value, close it
            const quoteCount = (fixedJson.match(/"/g) || []).length;
            if (quoteCount % 2 === 1) {
                fixedJson += '"';
            }

            // Close any open arrays/objects from innermost to outermost
            while ((fixedJson.match(/\[/g) || []).length > (fixedJson.match(/\]/g) || []).length) {
                fixedJson += ']';
            }
            while ((fixedJson.match(/\{/g) || []).length > (fixedJson.match(/\}/g) || []).length) {
                fixedJson += '}';
            }

            const parsed = JSON.parse(fixedJson);
            const recoveredCount = parsed.rankings?.length || 0;

            return {
                success: true,
                data: parsed,
                strategy: "complete-truncated",
                warnings: [`Recovered ${recoveredCount} rankings from truncated JSON`]
            };
        }
        return { success: false, data: null, strategy: "complete-truncated" };
    }
}