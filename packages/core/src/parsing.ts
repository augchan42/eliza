import type { ActionResponse } from "./types.ts";
import elizaLogger from "./logger.ts";
const jsonBlockPattern = /```(?:json)?\s*([\s\S]*?)\s*```/;

// export const messageCompletionFooter = `\nResponse format should be formatted in a JSON block like this:
// \`\`\`json
// { "user": "{{agentName}}", "text": "string", "action": "string" }
// \`\`\``;

export const formattingInstruction = `
When posting or responding, use explicit newlines (\\n) to separate statements.
Each major concept should be on its own line.
Double newlines (\\n\\n) should separate thematic sections.
`;

export const messageCompletionFooter = `
Response format must be a valid JSON block with properly escaped characters:

\`\`\`json
{
  "user": "{{agentName}}",
  "text": "That's a great idea! I'm thinking we should try it.",
  "action": "Demonstrates enthusiasm and agreement"
}
\`\`\`

Note:
- Use double quotes (") for JSON properties
- Use regular apostrophes (') within text - they will be automatically escaped
- Keep text natural and readable - don't manually escape characters
- Format as a proper JSON code block with \`\`\`json markers
`;

export const shouldRespondFooter = `The available options are [RESPOND], [IGNORE], or [STOP]. Choose the most appropriate option.
If {{agentName}} is talking too much, you can choose [IGNORE]

Your response must include one of the options.`;

export const parseShouldRespondFromText = (
    text: string,
): "RESPOND" | "IGNORE" | "STOP" | null => {
    const match = text
        .split("\n")[0]
        .trim()
        .replace("[", "")
        .toUpperCase()
        .replace("]", "")
        .match(/^(RESPOND|IGNORE|STOP)$/i);
    return match
        ? (match[0].toUpperCase() as "RESPOND" | "IGNORE" | "STOP")
        : text.includes("RESPOND")
          ? "RESPOND"
          : text.includes("IGNORE")
            ? "IGNORE"
            : text.includes("STOP")
              ? "STOP"
              : null;
};

export const booleanFooter = `Respond with only a YES or a NO.`;

/**
 * Parses a string to determine its boolean equivalent.
 *
 * Recognized affirmative values: "YES", "Y", "TRUE", "T", "1", "ON", "ENABLE".
 * Recognized negative values: "NO", "N", "FALSE", "F", "0", "OFF", "DISABLE".
 *
 * @param {string} text - The input text to parse.
 * @returns {boolean|null} - Returns `true` for affirmative inputs, `false` for negative inputs, and `null` for unrecognized inputs or null/undefined.
 */
export const parseBooleanFromText = (text: string) => {
    if (!text) return null; // Handle null or undefined input

    const affirmative = ["YES", "Y", "TRUE", "T", "1", "ON", "ENABLE"];
    const negative = ["NO", "N", "FALSE", "F", "0", "OFF", "DISABLE"];

    const normalizedText = text.trim().toUpperCase();

    if (affirmative.includes(normalizedText)) {
        return true;
    } else if (negative.includes(normalizedText)) {
        return false;
    }

    return null; // Return null for unrecognized inputs
};

export const stringArrayFooter = `Respond with a JSON array containing the values in a JSON block formatted for markdown with this structure:
\`\`\`json
[
  "value",
  "value"
]
\`\`\`

Your response must include the JSON block.`;

function normalizeJsonContent(jsonContent: string): string {
    try {
        // 1. Pre-clean any markdown or text debris
        let normalized = jsonContent
            .replace(/^[\s\S]*?```(?:json)?\s*/, "") // Remove everything before code block
            .replace(/\s*```[\s\S]*$/, "") // Remove everything after code block
            .replace(/[\u2018\u2019]/g, "'") // Normalize smart quotes
            .replace(/[\u201C\u201D]/g, '"'); // Normalize smart quotes

        // 2. Find valid JSON structure
        const startIndex = normalized.search(/[{\[]/);
        const endIndex =
            normalized.length -
            normalized.split("").reverse().join("").search(/[}\]]/);

        if (startIndex === -1 || endIndex === -1) {
            throw new Error("No valid JSON structure found");
        }

        // 3. Extract just the JSON structure
        normalized = normalized.slice(startIndex, endIndex);

        // 4. Validate matching brackets/braces
        const stack = [];
        const pairs = { "{": "}", "[": "]" };
        for (const char of normalized) {
            if ("{[".includes(char)) stack.push(char);
            if ("}]".includes(char)) {
                const last = stack.pop();
                if (pairs[last!] !== char)
                    throw new Error("Mismatched brackets/braces");
            }
        }
        if (stack.length) throw new Error("Unclosed brackets/braces");

        // 5. Handle string values with consistent escaping while preserving whitespace
        let inString = false;
        let result = "";
        let i = 0;

        while (i < normalized.length) {
            const char = normalized[i];

            if (char === '"' && normalized[i - 1] !== "\\") {
                inString = !inString;
            }

            if (!inString) {
                // Outside strings - remove whitespace
                if (!/\s/.test(char)) {
                    result += char;
                }
            } else {
                // Inside strings - preserve whitespace and escape properly
                result += char;
            }

            i++;
        }

        // 6. Handle escaping within string values
        return result.replace(
            /"([^"]*?)"/g,
            (match, content) =>
                `"${
                    content
                        .replace(/\\"/g, '"') // Unescape any already escaped quotes
                        .replace(/"/g, '\\"') // Re-escape quotes
                        .replace(/\\/g, "\\\\") // Escape backslashes
                        .replace(/\r/g, "\\r") // Escape carriage returns
                        .replace(/\t/g, "\\t") // Escape tabs
                        .replace(/[\x00-\x1F\x7F-\x9F]/g, "") // Remove control characters
                }"`,
        );
    } catch (error) {
        elizaLogger.error("[normalizeJsonContent] Failed to normalize:", {
            input: jsonContent,
            error: error.message,
        });
        throw error;
    }
}

function normalizeAndParseJson(jsonContent: string): any {
    elizaLogger.debug("[normalizeAndParseJson] Processing content:", {
        length: jsonContent.length,
        snippet: jsonContent.substring(0, 50),
    });

    const normalizedJson = normalizeJsonContent(jsonContent);

    try {
        return JSON.parse(normalizedJson);
    } catch (e) {
        elizaLogger.error("[normalizeAndParseJson] Parse error:", {
            input: jsonContent,
            normalized: normalizedJson,
            error: e.message,
        });
        throw e;
    }
}

export function parseJsonArrayFromText(text: string) {
    let jsonData = null;

    elizaLogger.debug(
        "[parseJsonArrayFromText] Attempting to parse JSON array from:",
        {
            text: text.substring(0, 200),
            length: text.length,
        },
    );

    // First try to find JSON block
    const jsonBlockMatch = text.match(jsonBlockPattern);
    if (jsonBlockMatch) {
        jsonData = normalizeAndParseJson(jsonBlockMatch[1]);
    } else {
        // Fallback to finding array pattern
        const arrayPattern = /\[[\s\S]*?\]/;
        const arrayMatch = text.match(arrayPattern);

        if (arrayMatch) {
            try {
                const normalizedJson = normalizeJsonContent(arrayMatch[0]);
                elizaLogger.debug("Normalized array:", normalizedJson);
                jsonData = JSON.parse(normalizedJson);
            } catch (e) {
                elizaLogger.error("Error parsing array:", {
                    error: e.message,
                    json: arrayMatch[0],
                });
            }
        }
    }

    return Array.isArray(jsonData) ? jsonData : null;
}

export function parseJSONObjectFromText(text: string): any {
    elizaLogger.debug("[parseJSONObjectFromText] Parsing JSON from text:", {
        textLength: text?.length,
        textStart: text?.substring(0, 100),
        hasJsonBlock: /```json\s*\n/.test(text),
    });

    const jsonMatch = text.match(jsonBlockPattern);
    if (!jsonMatch) {
        elizaLogger.debug("[parseJSONObjectFromText] No JSON block found");
        return null;
    }

    try {
        return normalizeAndParseJson(jsonMatch[1]);
    } catch (e) {
        elizaLogger.error("[parseJSONObjectFromText] Failed to parse JSON:", {
            content: jsonMatch[1],
            error: e.message,
        });
        return null;
    }
}

export const postActionResponseFooter = `Choose any combination of [LIKE], [RETWEET], [QUOTE], and [REPLY] that are appropriate. Each action must be on its own line. Your response must only include the chosen actions.`;

export const parseActionResponseFromText = (
    text: string,
): { actions: ActionResponse } => {
    const actions: ActionResponse = {
        like: false,
        retweet: false,
        quote: false,
        reply: false,
    };

    // Regex patterns
    const likePattern = /\[LIKE\]/i;
    const retweetPattern = /\[RETWEET\]/i;
    const quotePattern = /\[QUOTE\]/i;
    const replyPattern = /\[REPLY\]/i;

    // Check with regex
    actions.like = likePattern.test(text);
    actions.retweet = retweetPattern.test(text);
    actions.quote = quotePattern.test(text);
    actions.reply = replyPattern.test(text);

    // Also do line by line parsing as backup
    const lines = text.split("\n");
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === "[LIKE]") actions.like = true;
        if (trimmed === "[RETWEET]") actions.retweet = true;
        if (trimmed === "[QUOTE]") actions.quote = true;
        if (trimmed === "[REPLY]") actions.reply = true;
    }

    return { actions };
};

/**
 * Truncate text to fit within the character limit, ensuring it ends at a complete sentence.
 */
export function truncateToCompleteSentence(
    text: string,
    maxLength: number,
): string {
    if (text.length <= maxLength) {
        return text;
    }

    // Attempt to truncate at the last period within the limit
    const lastPeriodIndex = text.lastIndexOf(".", maxLength - 1);
    if (lastPeriodIndex !== -1) {
        const truncatedAtPeriod = text.slice(0, lastPeriodIndex + 1).trim();
        if (truncatedAtPeriod.length > 0) {
            return truncatedAtPeriod;
        }
    }

    // If no period, truncate to the nearest whitespace within the limit
    const lastSpaceIndex = text.lastIndexOf(" ", maxLength - 1);
    if (lastSpaceIndex !== -1) {
        const truncatedAtSpace = text.slice(0, lastSpaceIndex).trim();
        if (truncatedAtSpace.length > 0) {
            return truncatedAtSpace + "...";
        }
    }

    // Fallback: Hard truncate and add ellipsis
    const hardTruncated = text.slice(0, maxLength - 3).trim();
    return hardTruncated + "...";
}

export async function prettifyJson(json: string): Promise<string> {
    try {
        // First ensure it's valid JSON by parsing
        const parsed = JSON.parse(json);
        // Then return pretty version
        return JSON.stringify(parsed, null, 2);
    } catch (e) {
        elizaLogger.error("[prettifyJson] Failed to prettify JSON:", {
            input: json,
            error: e.message,
        });
        return json; // Return original if fails
    }
}
