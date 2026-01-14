# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

An AI agent that searches and analyzes indexed Jeffrey Epstein sources, powered by [Nia](https://trynia.ai). The agent searches across two indexed repositories: Archive (emails, messages, flight logs, court documents) and Biographical (timeline, known associates, properties).

## Commands

```bash
bun install       # Install dependencies (uses pnpm under the hood)
bun run dev       # Start development server
bun run build     # Production build
bun run lint      # Run ESLint
bun run type-check # Run TypeScript type checking
```

## Architecture

### Tech Stack
- **Framework**: Next.js 15 with App Router (edge runtime for API routes)
- **AI**: Vercel AI SDK (`ai`, `@ai-sdk/react`, `@ai-sdk/gateway`) with streaming support
- **Styling**: Tailwind CSS v4 with shadcn/ui components
- **Package Manager**: pnpm (via bun)

### Key Directories
- `app/api/chat/route.ts` - Chat API endpoint with edge runtime, handles AI streaming and tool execution
- `lib/nia-tools.ts` - Nia API tool definitions (searchArchive, browseArchive, readArchiveDoc, grepArchive, webSearch, getSourceContent)
- `lib/gateway.ts` - AI Gateway provider configuration
- `lib/constants.ts` - Supported models and display names
- `components/chat.tsx` - Main chat interface component
- `components/ai-elements/` - AI-specific UI components (reasoning display, shimmer effects)
- `components/ui/` - shadcn/ui base components

### Data Flow
1. User sends message via `Chat` component using `useChat` hook
2. Message routed to `/api/chat` endpoint (edge runtime, 300s max duration)
3. `streamText` from Vercel AI SDK processes with system prompt and Nia tools
4. Agent uses tools to search indexed Epstein sources via Nia API
5. Streamed response with reasoning and tool invocations rendered in UI

### Nia Tools
All tools interact with the Nia API (`https://apigcp.trynia.ai/v2`):
- **searchArchive**: Semantic search across all sources (archive, biographical)
- **browseArchive**: Get repository tree structure
- **readArchiveDoc**: Read full document content by path
- **grepArchive**: Regex pattern search with extensive options
- **webSearch**: External web search (use sparingly)
- **getSourceContent**: Fetch full content from search results

### Environment Variables
```
NIA_API_KEY              # Nia API key
AI_GATEWAY_API_KEY       # AI provider key for gateway
NIA_EPSTEIN_ARCHIVE_SOURCES      # Indexed archive repository IDs
NIA_EPSTEIN_BIOGRAPHICAL_SOURCES # Indexed biographical repository IDs
```

### Model Support
Models configured in `lib/constants.ts`. Anthropic models get extended thinking enabled automatically in the chat route.
