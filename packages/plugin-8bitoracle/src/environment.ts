import { z } from "zod";
import type { IraiProviderConfig } from "./providers/irai.provider";
import type { OracleProviderConfig } from "./providers/oracle.provider";

export const environmentSchema = z.object({
    IRAI_API_KEY: z.string().min(1, "IRAI API key is required"),
    ORACLE_API_URL: z
        .string()
        .url()
        .optional()
        .default("https://api.8bitoracle.com"),
    MAX_REQUESTS_PER_MINUTE: z
        .number()
        .int()
        .positive()
        .optional()
        .default(100),
    REQUEST_TIMEOUT_MS: z.number().int().positive().optional().default(30000),
});

export type Environment = z.infer<typeof environmentSchema>;

export function validateEnvironment(env: Record<string, unknown>): Environment {
    return environmentSchema.parse(env);
}

export interface PluginConfig {
    irai: IraiProviderConfig;
    oracle?: OracleProviderConfig;
}

export function createConfig(env: Environment): PluginConfig {
    return {
        irai: {
            apiKey: env.IRAI_API_KEY,
            rateLimits: {
                maxRequests: env.MAX_REQUESTS_PER_MINUTE,
                timeWindow: 60000,
            },
        },
        oracle: env.ORACLE_API_URL
            ? {
                  apiUrl: env.ORACLE_API_URL,
                  rateLimits: {
                      maxRequests: env.MAX_REQUESTS_PER_MINUTE,
                      timeWindow: 60000,
                  },
              }
            : undefined,
    };
}
