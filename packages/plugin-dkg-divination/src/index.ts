import { Plugin } from "@elizaos/core";

import { dkgDivinationInsert } from "./actions/dkgDivinationInsert";
import { graphSearch } from "./providers/graphSearch";

export * as actions from "./actions/index";
export * as providers from "./providers/index";

export const dkgDivinationPlugin: Plugin = {
    name: "@elizaos/plugin-dkg-divination",
    description:
        "Specialized DKG plugin for storing market divinations and hexagram readings on the OriginTrail Decentralized Knowledge Graph",
    actions: [dkgDivinationInsert],
    providers: [graphSearch],
    evaluators: []
};

export default dkgDivinationPlugin;
