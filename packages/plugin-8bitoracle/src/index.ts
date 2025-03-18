import { Plugin } from "@elizaos/core";
import { IraiProvider, IraiProviderConfig } from "./providers/irai.provider";
import {
    OracleProvider,
    OracleProviderConfig,
} from "./providers/oracle.provider";
import { DivinationService } from "./services/divination.service";
import { performDivinationAction } from "./actions/divination.action";

export * from "./types/hexagram";
export * from "./types/market";
export * from "./types/response";
export * from "./formatters/telegram.formatter";

export interface EightBitOracleConfig {
    irai: IraiProviderConfig;
    oracle?: OracleProviderConfig;
}

export function createEightBitOraclePlugin(
    config: EightBitOracleConfig,
): Plugin {
    // Initialize providers
    const iraiProvider = new IraiProvider(config.irai);
    const oracleProvider = new OracleProvider(config.oracle);

    // Initialize service with providers
    const divinationService = new DivinationService(
        iraiProvider,
        oracleProvider,
    );

    return {
        name: "8BITORACLE",
        description:
            "Street-level market divination through the lens of I-Ching",

        providers: [iraiProvider, oracleProvider],

        services: [divinationService],

        actions: [performDivinationAction],
    };
}
