# Epstein Files

AI agent that searches and analyzes indexed **Jeffrey Epstein** sources. Powered by [Nia](https://trynia.ai).

## Data Sources

The agent searches across two indexed repositories:

1. **Archive** — Emails, messages, flight logs, court documents
2. **Biographical** — Timeline, known associates, properties

## Quick Start

1. Clone the repo
2. Copy `.env.example` to `.env` and fill in:
   - `NIA_API_KEY` - Get from [trynia.ai](https://trynia.ai)
   - `AI_GATEWAY_API_KEY` - Your AI provider key
   - `NIA_EPSTEIN_ARCHIVE_SOURCES` - Indexed archive repository
   - `NIA_EPSTEIN_BIOGRAPHICAL_SOURCES` - Indexed biographical repository
3. Install & run:
   ```bash
   bun install
   bun run dev
   ```

## Getting the Indexed Sources

These repositories are large (100M+ tokens combined). Email **arlan@nozomio.com** for access.

## Docs

[docs.trynia.ai](https://docs.trynia.ai)
