// DKG node configuration and management
import { elizaLogger } from "@elizaos/core";

export interface DKGNode {
    hostname: string;
    name: string;
}

// Available testnet nodes
export const TESTNET_NODES: DKGNode[] = [
    {
        hostname: "https://v6-pegasus-node-02.origin-trail.network",
        name: "pegasus-02"
    },
    {
        hostname: "https://v6-pegasus-node-03.origin-trail.network",
        name: "pegasus-03"
    }
];

export class NodeSelector {
    private currentIndex = 0;
    private nodes: DKGNode[];

    constructor(nodes: DKGNode[] = TESTNET_NODES) {
        this.nodes = nodes;
    }

    /**
     * Initialize with configured hostname if it exists in the pool
     */
    initializeFromConfig(configuredHostname?: string): void {
        if (configuredHostname) {
            const nodeIndex = this.nodes.findIndex(node => node.hostname === configuredHostname);
            if (nodeIndex >= 0) {
                this.currentIndex = nodeIndex;
                elizaLogger.info(`🎯 Starting with configured node: ${this.nodes[nodeIndex].name}`);
            }
        }
    }

    /**
     * Get next node in round-robin fashion
     */
    getNextNode(): DKGNode {
        const node = this.nodes[this.currentIndex];
        this.currentIndex = (this.currentIndex + 1) % this.nodes.length;
        elizaLogger.info(`🔄 Selected DKG node: ${node.name} (${node.hostname})`);
        return node;
    }

    /**
     * Get total number of available nodes
     */
    getNodeCount(): number {
        return this.nodes.length;
    }
}