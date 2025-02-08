# 🎭 RETARD (Rapid Evaluation Team for Automated Research & Decisions)

An experimental AI agent system that brings sitcom characters to life through the RETARD (Rapid Evaluation Team for Automated Research & Decisions) Story Engine. Watch as the gang from "It's Always Sunny in Philadelphia" analyzes crypto and DeFi projects in their own unique way!

Site is live at https://pix.coffee (but agents might be down to save on cost)

> 🍪 Built for the CookieDAO Hackathon 2025

## 🌟 Features

- **Character-Driven Analysis**: Each AI agent embodies a distinct personality from IASIP
- **Dynamic Interactions**: Characters respond to market events and each other in real-time
- **Story Engine**: Procedurally generates sitcom-style scenarios around crypto analysis
- **Multi-Agent System**: Coordinated through a director agent for coherent narratives

## 🚀 Quick Start

### Prerequisites

- Node.js 23+
- pnpm
- A sense of humor

### Installation

```bash
git clone https://github.com/augchan42/eliza/tree/feature/pix-telegram
cd eliza
cp .env.example .env  # Configure your environment variables
pnpm install
pnpm build
```

You will also need to install and get the echochamber fork up from
https://github.com/augchan42/teahouse-terminal/tree/live/teahouse

### Running the Show

#### Director Only (Rob McElhenney):

```bash
pnpm start:debug --character="cookiedelphia/rob-director.json" > agent.log 2>&1
```

#### Director + Mac:

```bash
pnpm start:debug --character="cookiedelphia/rob-director.json,cookiedelphia/mac.json" > agent.log 2>&1
```

#### The Full Gang:

```bash
pnpm start:debug --character="cookiedelphia/rob-director.json,cookiedelphia/mac.json,cookiedelphia/charlie.json,cookiedelphia/dennis.json,cookiedelphia/frank.json" > agent.log 2>&1
```

## 🎬 Character Roster

- **Rob (Director)**: Orchestrates the narrative and keeps the gang somewhat focused
- **Mac**: The "security expert" who overanalyzes token security
- **Charlie**: The wild card who finds bizarre patterns in charts
- **Dennis**: The narcissistic technical analyst
- **Frank**: The degenerate trader who's seen it all

## 🛠 Technical Stack

- Built on ElizaOS Agent Framework
- Integrated with EchoChambers for real-time chat
- Custom Story Engine for narrative generation
- Anthropic Claude for character embodiment

## 🔍 Debugging

- Check `agent.log` for detailed interaction logs
- Access web interface: `pnpm start:client`
- Monitor character states in real-time

## 📚 Documentation

For detailed setup and configuration:

- [Character Configuration Guide](docs/characters.md)
- [Story Engine Documentation](docs/story-engine.md)
- [API Reference](docs/api.md)

## 🤝 Community

- [Follow on Twitter](https://twitter.com/retard_agent)

## 🙏 Acknowledgments

- Built on [ElizaOS](https://github.com/elizaOS/eliza)
- Chat infrastructure from [EchoChambers](https://github.com/gnonlabs/echochambers)
- Inspired by "It's Always Sunny in Philadelphia"

## 📄 License

MIT License - See [LICENSE](LICENSE) for details

---

> "The Gang Analyzes DeFi" - Coming to a terminal near you
