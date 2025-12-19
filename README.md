# ChromAgent (Chromium AI Agent)

AI agent that answers questions grounded in your indexed **Chromium repository + documentation**. Powered by [Nia](https://trynia.ai).

## Quick Start

1. Clone the repo
2. Copy `.env.example` to `.env` and fill in:
   - `NIA_API_KEY` - Get from [trynia.ai](https://trynia.ai)
   - `AI_GATEWAY_API_KEY` - Your AI provider key
   - `CHROMIUM_NIA_SOURCES` - Comma-separated Nia data source IDs for your Chromium repo/docs (from [/explore](https://trynia.ai/explore))
3. Install & run:
   ```bash
   bun install
   bun run dev
   ```

## Docs

[docs.trynia.ai](https://docs.trynia.ai)

# chromium-agent-nia
