# @elizaos/plugin-8bitoracle

Street-level market divination through the lens of I-Ching. This plugin integrates market data analysis with traditional I-Ching divination techniques.

## Installation

```bash
npm install @elizaos/plugin-8bitoracle
```

## Configuration

The plugin requires the following environment variables:

- `IRAI_API_KEY`: Your IRAI API key for market data access

## Usage

```typescript
import { createEightBitOraclePlugin } from "@elizaos/plugin-8bitoracle";
import { TelegramFormatter } from "@elizaos/plugin-8bitoracle";

// Create and configure the plugin
const oraclePlugin = createEightBitOraclePlugin({
    irai: {
        apiKey: process.env.IRAI_API_KEY,
        rateLimits: {
            maxRequests: 10,
            timeWindow: 60000, // 1 minute
        },
    },
});

// Register with runtime
runtime.registerPlugin(oraclePlugin);

// Use with Telegram
const formatter = new TelegramFormatter();
const result = await runtime.executeAction("PERFORM_DIVINATION");
const formatted = formatter.format(result);
```

## Features

- Market-aware I-Ching readings
- Real-time market data integration
- Customizable response formatting
- Rate limiting and error handling
- Platform-specific formatters (Telegram supported)

## API

### Actions

- `PERFORM_DIVINATION`: Generate a market-aware I-Ching reading

### Services

- `DIVINATION_SERVICE`: Core service for generating readings

### Providers

- `IRAI_PROVIDER`: Market data integration
- `ORACLE_PROVIDER`: I-Ching divination engine

## License

MIT
