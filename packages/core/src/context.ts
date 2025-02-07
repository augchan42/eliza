import handlebars from "handlebars";
import type { State, TemplateType } from "./types.ts";
import { names, uniqueNamesGenerator } from "unique-names-generator";
import elizaLogger from "./logger.ts";
import fs from "fs/promises";
import { join } from "path";

/**
 * Checks if the template content looks like a file path
 */
function isFilePath(str: string): boolean {
    // Only treat as filepath if it ends with .template extension
    // or starts with ./ or / (absolute/relative path indicators)
    return (
        str.endsWith(".template") || str.startsWith("./") || str.startsWith("/")
    );
}

/**
 * Resolves template path relative to project root
 */
function resolveTemplatePath(templatePath: string): string {
    const cwd = process.cwd();
    elizaLogger.info(
        `[Resolve Template Path] Current working directory: ${cwd}`,
    );

    const fullPath = join(cwd, "..", "characters", templatePath);
    elizaLogger.info(
        `[Resolve Template Path] Resolved template path: ${fullPath}`,
    );

    return fullPath;
}

// Template cache to store loaded templates
export const templateRegistry: Map<string, string> = new Map();

/**
 * Initialize templates by loading them into registry.
 * Call this at startup time.
 */
export async function initializeTemplates(templates: Record<string, string>) {
    elizaLogger.debug("[Template Init] Starting template initialization:", {
        templateCount: Object.keys(templates).length,
        templateNames: Object.keys(templates),
    });

    for (const [name, content] of Object.entries(templates)) {
        try {
            // If it looks like a file path, load the file
            if (isFilePath(content)) {
                const resolvedPath = resolveTemplatePath(content);
                elizaLogger.debug(`[Template Init] Loading template file:`, {
                    templateName: name,
                    path: resolvedPath,
                });

                const fileContent = await fs.readFile(resolvedPath, {
                    encoding: "utf8",
                });

                // Store under both the name and the path for backward compatibility
                templateRegistry.set(name, fileContent);
                templateRegistry.set(content, fileContent); // Also store under the path

                elizaLogger.debug(`[Template Init] Template loaded:`, {
                    templateName: name,
                    contentLength: fileContent.length,
                    registrySize: templateRegistry.size,
                });
            } else {
                // Store direct content
                templateRegistry.set(name, content);
                elizaLogger.debug(`[Template Init] Direct content stored:`, {
                    templateName: name,
                    contentLength: content.length,
                });
            }
        } catch (error) {
            elizaLogger.error(
                `[Template Init] Error loading template ${name}:`,
                error,
            );
            if (error.code === "ENOENT" && content.includes("/")) {
                try {
                    const altPath = join(process.cwd(), "..", content);
                    const fileContent = await fs.readFile(altPath, {
                        encoding: "utf8",
                    });
                    templateRegistry.set(name, fileContent);
                    templateRegistry.set(content, fileContent); // Also store under the path
                    continue;
                } catch (altError) {
                    elizaLogger.error(
                        `[Template Init] Failed to load alternate path:`,
                        altError,
                    );
                }
            }
            throw error;
        }
    }

    elizaLogger.debug("[Template Init] Final registry state:", {
        registrySize: templateRegistry.size,
        registeredKeys: Array.from(templateRegistry.keys()),
    });
}
/**
 * Get template content from registry or return original if not found
 */
export function getTemplate(template: string): string {
    const registryContent = templateRegistry.get(template);
    elizaLogger.debug("[Template Registry] Getting template:", {
        templateInput: template,
        foundInRegistry: !!registryContent,
        registrySize: templateRegistry.size,
        isTemplateString: typeof template === "string",
        firstChars: template.substring(0, 100), // First 100 chars for debugging
    });
    return registryContent ?? template;
}

/**
 * Composes a context string by replacing placeholders in a template with corresponding values from the state.
 *
 * This function takes a template string with placeholders in the format `{{placeholder}}` and a state object.
 * It replaces each placeholder with the value from the state object that matches the placeholder's name.
 * If a matching key is not found in the state object for a given placeholder, the placeholder is replaced with an empty string.
 *
 * By default, this function uses a simple string replacement approach. However, when `templatingEngine` is set to `'handlebars'`, it uses Handlebars templating engine instead, compiling the template into a reusable function and evaluating it with the provided state object.
 *
 * @param {Object} params - The parameters for composing the context.
 * @param {State} params.state - The state object containing values to replace the placeholders in the template.
 * @param {TemplateType} params.template - The template string or function containing placeholders to be replaced with state values.
 * @param {"handlebars" | undefined} [params.templatingEngine] - The templating engine to use for compiling and evaluating the template (optional, default: `undefined`).
 * @returns {string} The composed context string with placeholders replaced by corresponding state values.
 *
 * @example
 * // Given a state object and a template
 * const state = { userName: "Alice", userAge: 30 };
 * const template = "Hello, {{userName}}! You are {{userAge}} years old";
 *
 * // Composing the context with simple string replacement will result in:
 * // "Hello, Alice! You are 30 years old."
 * const contextSimple = composeContext({ state, template });
 *
 * // Using composeContext with a template function for dynamic template
 * const template = ({ state }) => {
 * const tone = Math.random() > 0.5 ? "kind" : "rude";
 *   return `Hello, {{userName}}! You are {{userAge}} years old. Be ${tone}`;
 * };
 * const contextSimple = composeContext({ state, template });
 */

export const composeContext = ({
    state,
    template,
    templatingEngine,
}: {
    state: State;
    template: TemplateType;
    templatingEngine?: "handlebars";
}): string => {
    // Handle function templates
    let templateStr =
        typeof template === "function" ? template({ state }) : template;

    // Get from registry if it exists
    templateStr = getTemplate(templateStr);

    if (templatingEngine === "handlebars") {
        const templateFunction = handlebars.compile(templateStr);
        return templateFunction(state);
    }

    return templateStr.replace(/{{([^}]+)}}/g, (match, key) => {
        // Handle nested properties
        const value = key.split(".").reduce((obj, k) => obj?.[k], state);
        return value ?? "";
    });
};

/**
 * Adds a header to a body of text.
 *
 * This function takes a header string and a body string and returns a new string with the header prepended to the body.
 * If the body string is empty, the header is returned as is.
 *
 * @param {string} header - The header to add to the body.
 * @param {string} body - The body to which to add the header.
 * @returns {string} The body with the header prepended.
 *
 * @example
 * // Given a header and a body
 * const header = "Header";
 * const body = "Body";
 *
 * // Adding the header to the body will result in:
 * // "Header\nBody"
 * const text = addHeader(header, body);
 */
export const addHeader = (header: string, body: string) => {
    return body.length > 0 ? `${header ? header + "\n" : header}${body}\n` : "";
};

/**
 * Generates a string with random user names populated in a template.
 *
 * This function generates a specified number of random user names and populates placeholders
 * in the provided template with these names. Placeholders in the template should follow the format `{{userX}}`
 * where `X` is the position of the user (e.g., `{{user1}}`, `{{user2}}`).
 *
 * @param {string} params.template - The template string containing placeholders for random user names.
 * @param {number} params.length - The number of random user names to generate.
 * @returns {string} The template string with placeholders replaced by random user names.
 *
 * @example
 * // Given a template and a length
 * const template = "Hello, {{user1}}! Meet {{user2}} and {{user3}}.";
 * const length = 3;
 *
 * // Composing the random user string will result in:
 * // "Hello, John! Meet Alice and Bob."
 * const result = composeRandomUser({ template, length });
 */
export const composeRandomUser = (template: string, length: number) => {
    const exampleNames = Array.from({ length }, () =>
        uniqueNamesGenerator({ dictionaries: [names] }),
    );
    let result = template;
    for (let i = 0; i < exampleNames.length; i++) {
        result = result.replaceAll(`{{user${i + 1}}}`, exampleNames[i]);
    }

    return result;
};
