// DKG client factory with failover capabilities
import DKG from "dkg.js";
import { IAgentRuntime } from "@elizaos/core";
import { DKGNode } from "./dkg-nodes";

export interface DKGClientConfig {
    environment: string;
    port: string;
    blockchainName: string;
    publicKey: string;
    privateKey: string;
}

export class DKGClientFactory {
    private config: DKGClientConfig;

    constructor(runtime: IAgentRuntime) {
        this.config = {
            environment: runtime.getSetting("DKG_ENVIRONMENT"),
            port: runtime.getSetting("DKG_PORT"),
            blockchainName: runtime.getSetting("DKG_BLOCKCHAIN_NAME"),
            publicKey: runtime.getSetting("DKG_PUBLIC_KEY"),
            privateKey: runtime.getSetting("DKG_PRIVATE_KEY"),
        };
    }

    /**
     * Create DKG client for specific node
     */
    createClient(node: DKGNode): DKG {
        return new DKG({
            environment: this.config.environment,
            endpoint: node.hostname,
            port: this.config.port,
            blockchain: {
                name: this.config.blockchainName,
                publicKey: this.config.publicKey,
                privateKey: this.config.privateKey,
            },
            maxNumberOfRetries: 1,  // We handle retries ourselves
            frequency: 1,
            contentType: "all",
            nodeApiVersion: "/v1",
        });
    }
}