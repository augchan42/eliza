import { readFile } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import elizaLogger from "./logger";
import { ReferenceEntry } from "./types";

interface ReferenceMap {
    [key: string]: ReferenceEntry;
}

/**
 * Handles loading and parsing of JSON reference files
 */
export class ReferenceLoader {
    private referenceData: Record<string, any> = {};
    private referenceLoader: ReferenceLoader;
    private referencesRoot: string;

    constructor(referencesRoot: string) {
        this.referencesRoot = referencesRoot;
        elizaLogger.debug(
            `[ReferenceLoader] Initialized with root: ${referencesRoot}`,
        );
    }

    /**
     * Load all reference files specified in the character's configuration
     * @param references Map of reference configurations
     * @returns Object containing loaded reference data
     */
    async loadReferences(
        references: ReferenceMap,
    ): Promise<Record<string, any>> {
        if (!references) {
            elizaLogger.debug("[ReferenceLoader] No references to load");
            return {};
        }

        for (const [name, ref] of Object.entries(references)) {
            try {
                await this.loadSingleReference(name, ref);
            } catch (error) {
                this.handleReferenceLoadError(name, error);
            }
        }

        return this.referenceData;
    }

    /**
     * Load a single reference file
     * @param name Reference identifier
     * @param ref Reference configuration
     */
    private async loadSingleReference(
        name: string,
        ref: ReferenceConfig,
    ): Promise<void> {
        // Sanitize the import path to prevent directory traversal
        const sanitizedPath = ref.import.replace(/\.\./g, "");
        const fullPath = join(this.referencesRoot, sanitizedPath);

        elizaLogger.debug(`[ReferenceLoader] Loading ${name} from ${fullPath}`);

        if (!existsSync(fullPath)) {
            throw new Error(`Reference file not found: ${fullPath}`);
        }

        // Handle different file types
        if (fullPath.endsWith(".json")) {
            await this.loadJSONReference(name, fullPath);
        } else if (fullPath.endsWith(".ts") || fullPath.endsWith(".js")) {
            await this.loadModuleReference(name, fullPath, ref.exportName);
        } else {
            throw new Error(`Unsupported reference file type: ${fullPath}`);
        }
    }

    /**
     * Load and parse a JSON reference file
     * @param name Reference identifier
     * @param filepath Full path to JSON file
     */
    private async loadJSONReference(
        name: string,
        filepath: string,
    ): Promise<void> {
        try {
            const content = await readFile(filepath, "utf8");
            this.referenceData[name] = JSON.parse(content);
            elizaLogger.success(
                `[ReferenceLoader] Loaded JSON ${name} from ${filepath}`,
            );
        } catch (error) {
            if (error instanceof SyntaxError) {
                throw new Error(
                    `Invalid JSON in ${filepath}: ${error.message}`,
                );
            }
            throw error;
        }
    }

    /**
     * Load a TypeScript/JavaScript module reference
     * @param name Reference identifier
     * @param filepath Full path to module file
     * @param exportName Name of export to use
     */
    private async loadModuleReference(
        name: string,
        filepath: string,
        exportName: string,
    ): Promise<void> {
        const module = await import(filepath);

        if (!(exportName in module)) {
            throw new Error(
                `No export named '${exportName}' found in ${filepath}. Available exports: ${Object.keys(module).join(", ")}`,
            );
        }

        this.referenceData[name] = module[exportName];
        elizaLogger.success(
            `[ReferenceLoader] Loaded module ${name} from ${filepath}`,
        );
    }

    /**
     * Handle and log reference loading errors
     * @param name Reference identifier
     * @param error Error that occurred
     */
    private handleReferenceLoadError(name: string, error: any): void {
        elizaLogger.error(
            `[ReferenceLoader] Failed to load ${name}: ${error.message}`,
        );

        if (error.message.includes("ERR_REQUIRE_CYCLE_MODULE")) {
            elizaLogger.error(
                `[ReferenceLoader] Circular dependency detected. Refactor imports to avoid cycles.`,
            );
        }

        throw error;
    }

    /**
     * Format loaded references for prompt inclusion
     * @returns Formatted string of reference data
     */
    formatReferencesForPrompt(
        references: Record<string, ReferenceConfig>,
    ): string {
        return Object.entries(this.referenceData)
            .map(([name, data]) => {
                const config = references[name];
                const description = this.generateReferenceDescription(
                    name,
                    config,
                );
                return this.formatReferenceSection(name, description, data);
            })
            .join("\n\n");
    }

    /**
     * Generate a description for a reference section
     * @param name Reference identifier
     * @param data Reference data
     * @returns Description string
     */
    private generateReferenceDescription(
        name: string,
        config: ReferenceConfig,
    ): string {
        // Use description from config if provided
        if (config.description) {
            return config.description;
        }

        // Fallback descriptions for known reference types
        const fallbackDescriptions: Record<string, string> = {
            trigrams: "Core trigram correspondences and meanings",
            hexagrams: "Hexagram symbols and interpretations",
            elements: "Elemental associations and properties",
            deities: "Divine entities and their attributes",
            spirits: "Spirit beings and their characteristics",
            symbols: "Symbolic meanings and interpretations",
        };

        return fallbackDescriptions[name] || `Reference data for ${name}`;
    }

    /**
     * Format a single reference section
     * @param name Reference identifier
     * @param description Section description
     * @param data Reference data
     * @returns Formatted section string
     */
    private formatReferenceSection(
        name: string,
        description: string,
        data: any,
    ): string {
        // Use a more readable format with proper indentation
        const formattedData = JSON.stringify(data, null, 2)
            // Remove escaped quotes
            .replace(/\\"/g, '"')
            // Clean up escaped newlines
            .replace(/\\n/g, "\n");

        return `# ${name} Reference\n${description}\n${formattedData}`;
    }
    /**
     * Get raw reference data
     * @returns Object containing all loaded reference data
     */
    getReferenceData(): Record<string, any> {
        return this.referenceData;
    }
}

// Helper type for more specific typing of reference configurations
export interface ReferenceConfig {
    import: string;
    exportName?: string;
    description?: string; // Direct description field for easier configuration
    type?: "ts" | "js" | "json"; // File type can be explicitly specified
}

export interface CharacterReference {
    [key: string]: ReferenceConfig;
}

// Example character card reference configuration:
/*
{
  "reference": {
    "trigrams": {
      "import": "trigrams.json",
      "metadata": {
        "type": "json",
        "description": "Core trigram correspondences and meanings"
      }
    },
    "hexagrams": {
      "import": "hexagrams.ts",
      "exportName": "hexagramsData",
      "metadata": {
        "type": "ts",
        "description": "Hexagram symbols and interpretations"
      }
    }
  }
}
*/
