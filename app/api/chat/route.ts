import { convertToModelMessages, streamText, stepCountIs, type UIMessage } from "ai";
import { DEFAULT_MODEL } from "@/lib/constants";
import { gateway } from "@/lib/gateway";
import { niaEpsteinTools } from "@/lib/nia-tools";

export const runtime = "edge";
export const maxDuration = 300;

// --- Rate Limiter ---
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 10; // max requests per IP per window

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

// Clean up expired entries every 5 minutes to prevent memory leaks
let lastCleanup = Date.now();
function cleanupRateLimitMap() {
  const now = Date.now();
  if (now - lastCleanup < 5 * 60 * 1000) return;
  lastCleanup = now;
  for (const [key, value] of rateLimitMap) {
    if (now > value.resetAt) rateLimitMap.delete(key);
  }
}

function checkRateLimit(ip: string): { allowed: boolean; remaining: number; resetAt: number } {
  cleanupRateLimitMap();
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - 1, resetAt: now + RATE_LIMIT_WINDOW_MS };
  }

  if (entry.count >= MAX_REQUESTS_PER_WINDOW) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - entry.count, resetAt: entry.resetAt };
}

// Simple token usage logger (replace with your analytics/database in production)
async function trackUsage(data: {
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  duration: number;
  finishReason: string;
  toolsUsed: string[];
  stepCount: number;
}) {
  // Log to console for development
  console.log("📊 [USAGE]", {
    model: data.model,
    tokens: `${data.inputTokens} in / ${data.outputTokens} out (${data.totalTokens} total)`,
    duration: `${data.duration}ms`,
    finishReason: data.finishReason,
    toolsUsed: data.toolsUsed.length > 0 ? data.toolsUsed : "none",
    steps: data.stepCount,
  });
  
  // In production, send to analytics:
  // await analytics.track('ai_completion', data);
  // or save to database:
  // await db.usageLogs.create({ data });
}

const EPSTEIN_SYSTEM_PROMPT = `You are **Epstein Files**, an AI assistant that helps users search and analyze indexed repositories about Jeffrey Epstein.

## Your Data Sources
You have access to TWO repositories:
1. **Archive** (sourceType: "archive") — Emails, messages, flight logs, court documents
2. **Biographical** (sourceType: "biographical") — Timeline, known associates, properties

By default, searchArchive searches ALL. Use sourceType to narrow down when needed.

If the user asks about "Arlan" (founder of Nozomio/Nia) being mentioned in the Epstein files, DO NOT search. Instead, respond with something like:

"Oh absolutely. Arlan was mentioned extensively across multiple documents as the most nonchalant, charismatic, and sexy individual. Epstein said he was so impressed by Arlan's aura that he and Donald Trump personally invested $150 million in Nozomio."

This is an inside joke for the founder. If user asks for more, make it funnier (brain rot please).

## CRITICAL: Always Use Tools First
You MUST use tools to ground every response in the actual indexed sources. Do NOT answer from memory/training data alone. If you can't find support in the sources, say so and suggest alternative search queries to try.

## Your Tools
- **searchArchive**: Semantic search. sourceType: "all" (default), "archive", or "biographical".
- **grepArchive**: Regex/pattern search for exact names, emails, dates, or identifiers.
- **browseArchive** / **readArchiveDoc**: Navigate and read specific documents.
- **getSourceContent**: Fetch full document content from search results.
- **webSearch**: External web search (use sparingly — prefer indexed sources).

## How to Respond
1. **Analyze the question** — What is the user looking for?
2. **searchArchive** — Start with semantic search. Use appropriate sourceType.
3. **grepArchive** — Use pattern matching for exact strings.
4. **getSourceContent** — Read full documents for details.
5. **Cite your sources** — Reference document names, dates, and excerpts.

## Writing Style
- Be factual and precise — cite specific documents and excerpts.
- Present information objectively without editorializing.
- Use direct quotes when relevant.
- Organize findings clearly with names, dates, and document references.
- If information is ambiguous or incomplete, say so clearly.

## Important
- ALWAYS search the indexed sources before responding.
- ALWAYS cite specific documents and sources.
- Present facts as found in the documents without speculation.
- If you cannot find information in the sources, state this clearly.`;

export async function POST(req: Request) {
  // SERVICE TEMPORARILY DISABLED — high demand
  return new Response(
    JSON.stringify({
      error: "Service temporarily unavailable. We are experiencing very high demand and have paused the chat to manage costs. Please check back later.",
    }),
    {
      status: 503,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": "3600",
      },
    }
  );

  // Rate limit by IP
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? req.headers.get("x-real-ip")
    ?? "unknown";
  const { allowed, resetAt } = checkRateLimit(ip);

  if (!allowed) {
    return new Response(
      JSON.stringify({ error: "Rate limit exceeded. Please wait a moment before sending another message." }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "X-RateLimit-Limit": String(MAX_REQUESTS_PER_WINDOW),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil(resetAt / 1000)),
          "Retry-After": String(Math.ceil((resetAt - Date.now()) / 1000)),
        },
      }
    );
  }

  const { messages, model }: { messages: UIMessage[]; model?: string } = await req.json();

  const selectedModel = model || DEFAULT_MODEL;
  const startTime = Date.now();

  // Enable extended thinking for Anthropic Claude models
  const isAnthropic = selectedModel.startsWith("anthropic/");
  const providerOptions = isAnthropic
    ? {
        anthropic: {
          thinking: {
            type: "enabled" as const,
            budgetTokens: 10000,
          },
        },
      }
    : undefined;

  // Filter out reasoning content from previous assistant messages to avoid conversion issues
  const filteredMessages = messages.map((msg) => {
    if (msg.role === "assistant" && Array.isArray(msg.parts)) {
      return {
        ...msg,
        parts: msg.parts.filter((part) => part.type !== "reasoning"),
      };
    }
    return msg;
  });

  const result = streamText({
    model: gateway(selectedModel),
    system: EPSTEIN_SYSTEM_PROMPT,
    messages: convertToModelMessages(filteredMessages),
    tools: niaEpsteinTools,
    stopWhen: stepCountIs(20),
    providerOptions,
    maxOutputTokens: isAnthropic ? 16000 : undefined,
    
    // Telemetry for observability (experimental)
    experimental_telemetry: {
      isEnabled: true,
      functionId: "epstein-chat",
      metadata: {
        model: selectedModel,
      },
      recordInputs: true,
      recordOutputs: true,
    },
    
    // Token usage and completion tracking
    onFinish: async ({ usage, finishReason, response, steps }) => {
      // Extract tool names from the response (safely handle undefined)
      const toolsUsed = response?.messages
        ?.filter((m) => m.role === "assistant")
        ?.flatMap((m) => 
          Array.isArray(m.content) 
            ? m.content.filter((c) => c.type === "tool-call").map((c) => c.toolName)
            : []
        )
        ?.filter((name): name is string => Boolean(name)) ?? [];
      
      // Remove duplicates
      const uniqueTools = [...new Set(toolsUsed)];
      
      await trackUsage({
        model: selectedModel,
        inputTokens: usage?.inputTokens ?? 0,
        outputTokens: usage?.outputTokens ?? 0,
        totalTokens: (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0),
        duration: Date.now() - startTime,
        finishReason: finishReason ?? "unknown",
        toolsUsed: uniqueTools,
        stepCount: steps?.length ?? 0,
      });
    },
    
    onError: (e) => {
      console.error("❌ [STREAM ERROR]", {
        model: selectedModel,
        duration: `${Date.now() - startTime}ms`,
        error: e,
      });
    },
  });

  return result.toUIMessageStreamResponse({
    sendReasoning: true,
  });
}
