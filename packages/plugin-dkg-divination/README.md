# @elizaos/plugin-dkg-divination

A specialized plugin for storing market divinations and hexagram readings on the OriginTrail Decentralized Knowledge Graph.

## Features

- Stores hexagram readings with market context
- Persists market sentiment analysis
- Links divinations with news events
- Creates structured knowledge graphs for divination data
- Provides easy access to historical readings

## Installation

```bash
pnpm install @elizaos/plugin-dkg-divination
```

## Configuration

Add the following environment variables to your `.env` file:

```env
DKG_ENVIRONMENT=
DKG_HOSTNAME=
DKG_PORT=
DKG_BLOCKCHAIN_NAME=
DKG_PUBLIC_KEY=
DKG_PRIVATE_KEY=
```

## Usage

Add the plugin to your character configuration:

```json
{
    "name": "YourDivinationBot",
    "plugins": ["@elizaos/plugin-dkg-divination"],
    "settings": {
        "secrets": {
            "DKG_ENVIRONMENT": "testnet",
            "DKG_HOSTNAME": "...",
            "DKG_PORT": "8900",
            "DKG_BLOCKCHAIN_NAME": "otp::testnet",
            "DKG_PUBLIC_KEY": "your-public-key",
            "DKG_PRIVATE_KEY": "your-private-key"
        }
    }
}
```

## Data Structure

The plugin creates knowledge graphs with the following structure:

```json
{
    "@context": [
        "https://schema.org",
        {
            "hexagram": "https://app.8bitoracle.ai/schema/hexagram#",
            "divination": "https://app.8bitoracle.ai/schema/divination#"
        }
    ],
    "@type": ["CreativeWork", "divination:Reading"],
    "@id": "urn:hexagram:number",
    "name": "Hexagram Name",
    "dateCreated": "timestamp",
    "author": {
        "@type": "Person",
        "@id": "user-id",
        "identifier": "user-identifier"
    },
    "hexagram:data": {
        // Hexagram specific data
    },
    "divination:context": {
        "marketSentiment": {},
        "newsEvents": {},
        "interpretation": "string"
    }
}
```

## Dependencies

- @elizaos/core: workspace:*
- dkg.js: ^8.0.6
- axios: ^1.7.9

## Contributing

Contributions are welcome! Please submit pull requests with improvements or bug fixes.

## License

This plugin is part of the Eliza project. See the main project repository for license information.
