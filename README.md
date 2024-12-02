# Eliza 🤖

<div align="center">
  <img src="./docs/static/img/eliza_banner.jpg" alt="Eliza Banner" width="100%" />
</div>

<div align="center">
  
  📖 [Documentation](https://ai16z.github.io/eliza/) | 🎯 [Examples](https://github.com/thejoven/awesome-eliza)
  
</div>

## 🌍 README Translations

[中文说明](./README_CN.md) | [日本語の説明](./README_JA.md) | [한국어 설명](./README_KOR.md) | [Français](./README_FR.md) | [Português](./README_PTBR.md) | [Türkçe](./README_TR.md) | [Русский](./README_RU.md) | [Español](./README_ES.md) | [Italiano](./README_IT.md)

## ✨ Features

-   🛠️ Full-featured Discord, Twitter and Telegram connectors
-   🔗 Support for every model (Llama, Grok, OpenAI, Anthropic, etc.)
-   👥 Multi-agent and room support
-   📚 Easily ingest and interact with your documents
-   💾 Retrievable memory and document store
-   🚀 Highly extensible - create your own actions and clients
-   ☁️ Supports many models (local Llama, OpenAI, Anthropic, Groq, etc.)
-   📦 Just works!

## 🎯 Use Cases

-   🤖 Chatbots
-   🕵️ Autonomous Agents
-   📈 Business Process Handling
-   🎮 Video Game NPCs
-   🧠 Trading

## 🚀 Quick Start

### Prerequisites

-   [Python 2.7+](https://www.python.org/downloads/)
-   [Node.js 22+](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm)
-   [pnpm](https://pnpm.io/installation)

> **Note for Windows Users:** [WSL 2](https://learn.microsoft.com/en-us/windows/wsl/install-manual) is required.

### Edit the .env file

Copy .env.example to .env and fill in the appropriate values

```
cp .env.example .env
```

### Automatically Start Eliza

This will run everything to setup the project and start the bot with the default character.

```bash
sh scripts/start.sh
```

### Edit the character file

1. Open `agent/src/character.ts` to modify the default character. Uncomment and edit.

2. To load custom characters:
    - Use `pnpm start --characters="path/to/your/character.json"`
    - Multiple character files can be loaded simultaneously

### Manually Start Eliza

```bash
pnpm i
pnpm build
pnpm start

# The project iterates fast, sometimes you need to clean the project if you are coming back to the project
pnpm clean
```

#### Additional Requirements

You may need to install Sharp. If you see an error when starting up, try installing it with the following command:

```
pnpm install --include=optional sharp
```
## 🐳 Docker Deployment

### Using Docker Compose (Recommended)

1. Clone the repository and create your `.env` file:
```bash
git clone https://github.com/ai16z/eliza
cd eliza
cp .env.example .env
```

2. Configure your `.env` file with your API keys and settings

3. Start with Docker Compose:
```bash
docker-compose up -d
```

### Manual Docker Build

```bash
# Build the Docker image
docker build -t eliza .

# Run the container
docker run -d \
  --name eliza \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/characters:/app/characters \
  -v $(pwd)/.env:/app/.env \
  eliza
```

### Docker Management Commands

```bash
# View logs
docker-compose logs -f

# Restart services
docker-compose restart

# Stop services
docker-compose down

# Update to latest version
git pull
docker-compose down
docker-compose up -d --build
```

### System Requirements for Docker Deployment

- Minimum 4GB RAM (8GB+ recommended)
- 20GB+ available storage
- Docker 20.10.0 or higher
- Docker Compose v2.0.0 or higher



### Twitter Scraper Target

We have included a new script to scrape tweets from a specified Twitter user. This script uses the `agent-twitter-client` package to perform the scraping.

#### Usage

1. Ensure you have the necessary environment variables set in your `.env` file:
    ```plaintext
    TWITTER_USERNAME=your_twitter_username
    TWITTER_PASSWORD=your_twitter_password
    TWITTER_EMAIL=your_twitter_email
    ```

2. Run the script with the target Twitter username as an argument:
    ```bash
    pnpm scrape-twitter <username>
    ```

   Replace `<username>` with the Twitter handle of the user you want to scrape tweets from.

3. The scraped tweets will be saved in the `data/tweets` directory with a timestamped filename.

#### Example

To scrape tweets from the user `exampleuser`, you would run:
    ```bash
    pnpm scrape-twitter exampleuser
    ```

    This will create a file named something like `exampleuser_2023-09-15_12-34-56.json` in the `data/tweets` directory, containing the scraped tweets.


### Community & contact

-   [GitHub Issues](https://github.com/ai16z/eliza/issues). Best for: bugs you encounter using Eliza, and feature proposals.
-   [Discord](https://discord.gg/ai16z). Best for: sharing your applications and hanging out with the community.

## Contributors

<a href="https://github.com/ai16z/eliza/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=ai16z/eliza" />
</a>

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=ai16z/eliza&type=Date)](https://star-history.com/#ai16z/eliza&Date)

