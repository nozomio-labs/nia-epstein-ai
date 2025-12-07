import { tool } from "ai";
import { z } from "zod";

const NIA_API_BASE = "https://apigcp.trynia.ai/v2";

// Logging helpers
const log = {
  tool: (name: string, input: unknown) => {
    console.log(`\n🔧 [NIA TOOL] ${name}`);
    console.log(`   Input:`, JSON.stringify(input, null, 2).split('\n').join('\n   '));
  },
  success: (name: string, summary: string) => {
    console.log(`✅ [NIA SUCCESS] ${name}: ${summary}`);
  },
  error: (name: string, error: string) => {
    console.error(`❌ [NIA ERROR] ${name}: ${error}`);
  },
  response: (data: unknown) => {
    const preview = JSON.stringify(data, null, 2);
    const lines = preview.split('\n');
    const truncated = lines.length > 20 
      ? lines.slice(0, 20).join('\n') + '\n   ... (truncated)'
      : preview;
    console.log(`   Response:`, truncated.split('\n').join('\n   '));
  }
};

async function niaFetch(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const apiKey = process.env.NIA_API_KEY;
  if (!apiKey) {
    throw new Error("NIA_API_KEY environment variable is not set");
  }

  return fetch(`${NIA_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
}

function getSourceId(): string {
  const sourceId = process.env.NAVAL_NIA_SOURCE;
  if (!sourceId) {
    throw new Error("NAVAL_NIA_SOURCE environment variable is not set");
  }
  return sourceId;
}

/**
 * Semantic search over Naval Ravikant's content
 */
export const searchEssays = tool({
  description:
    "Search Naval Ravikant's content using semantic search. Use this to find tweets, essays, podcast transcripts, and interviews related to a topic or concept. Returns relevant chunks with context.",
  inputSchema: z.object({
    query: z
      .string()
      .describe("The search query - a question or topic to search for"),
  }),
  execute: async ({ query }) => {
    const sourceId = getSourceId();
    log.tool("searchEssays", { query, sourceId });
    const response = await niaFetch("/query", {
      method: "POST",
      body: JSON.stringify({
        messages: [{ role: "user", content: query }],
        data_sources: [sourceId],
        search_mode: "sources",
        include_sources: true,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      log.error("searchEssays", error);
      throw new Error(`Nia API error: ${error}`);
    }

    const data = await response.json();
    const sourcesCount = data.sources?.length || 0;
    log.success("searchEssays", `Found ${sourcesCount} sources`);
    log.response(data);
    return data;
  },
});

/**
 * Get the tree structure of all Naval Ravikant content
 */
export const browseEssays = tool({
  description:
    "Get the complete tree structure of all Naval Ravikant content. Use this to see what content is available and how it's organized.",
  inputSchema: z.object({}),
  execute: async () => {
    log.tool("browseEssays", {});
    const sourceId = getSourceId();
    const response = await niaFetch(`/data-sources/${sourceId}/tree`);

    if (!response.ok) {
      const error = await response.text();
      log.error("browseEssays", error);
      throw new Error(`Nia API error: ${error}`);
    }

    const data = await response.json();
    const result = {
      tree: data.tree_string,
      pageCount: data.page_count,
      baseUrl: data.base_url,
    };
    log.success("browseEssays", `Found ${result.pageCount} pages`);
    log.response(result);
    return result;
  },
});

/**
 * List content in a virtual directory
 */
export const listDirectory = tool({
  description:
    "List Naval Ravikant content in a specific virtual directory path. Use this to explore content at a particular location in the tree structure.",
  inputSchema: z.object({
    path: z
      .string()
      .default("/")
      .describe(
        'Virtual path to list (e.g., "/" for root). Get paths from browseEssays first.'
      ),
  }),
  execute: async ({ path }) => {
    log.tool("listDirectory", { path });
    const sourceId = getSourceId();
    const params = new URLSearchParams({ path });
    const response = await niaFetch(
      `/data-sources/${sourceId}/ls?${params.toString()}`
    );

    if (!response.ok) {
      const error = await response.text();
      log.error("listDirectory", error);
      throw new Error(`Nia API error: ${error}`);
    }

    const data = await response.json();
    const result = {
      path: data.path,
      directories: data.directories,
      files: data.files,
      total: data.total,
    };
    log.success("listDirectory", `Found ${result.total} items at ${path}`);
    log.response(result);
    return result;
  },
});

/**
 * Read the full content of Naval Ravikant content
 */
export const readEssay = tool({
  description:
    "Read the full content of specific Naval Ravikant content by its virtual path. Use this to get the complete text after finding it via search or browse.",
  inputSchema: z.object({
    path: z
      .string()
      .describe(
        'Virtual path to the essay (e.g., "/startups.md"). Get paths from browseEssays or listDirectory.'
      ),
  }),
  execute: async ({ path }) => {
    log.tool("readEssay", { path });
    const sourceId = getSourceId();
    const params = new URLSearchParams({ path });
    const response = await niaFetch(
      `/data-sources/${sourceId}/read?${params.toString()}`
    );

    if (!response.ok) {
      const error = await response.text();
      log.error("readEssay", error);
      throw new Error(`Nia API error: ${error}`);
    }

    const data = await response.json();
    const result = {
      path: data.path,
      url: data.url,
      content: data.content,
    };
    const contentLength = result.content?.length || 0;
    log.success("readEssay", `Read ${contentLength} chars from ${path}`);
    console.log(`   URL: ${result.url}`);
    return result;
  },
});

/**
 * Search content using regex pattern
 */
export const grepEssays = tool({
  description:
    "Search Naval Ravikant's content using a regex pattern. Use this to find specific phrases, quotes, or text patterns across all content. Supports case sensitivity, whole word matching, and context lines.",
  inputSchema: z.object({
    pattern: z
      .string()
      .describe("Regex pattern to search for (e.g., 'startup.*founder')"),
    path: z
      .string()
      .default("/")
      .describe("Limit search to this virtual path prefix"),
    contextLines: z
      .number()
      .min(0)
      .max(10)
      .optional()
      .describe("Lines before AND after each match (default: 3)"),
    linesAfter: z
      .number()
      .min(0)
      .max(20)
      .optional()
      .describe("Lines after each match (like grep -A). Overrides contextLines for after."),
    linesBefore: z
      .number()
      .min(0)
      .max(20)
      .optional()
      .describe("Lines before each match (like grep -B). Overrides contextLines for before."),
    caseSensitive: z
      .boolean()
      .default(false)
      .describe("Case-sensitive matching (default is case-insensitive)"),
    wholeWord: z
      .boolean()
      .default(false)
      .describe("Match whole words only"),
    fixedString: z
      .boolean()
      .default(false)
      .describe("Treat pattern as literal string, not regex"),
    maxMatchesPerFile: z
      .number()
      .min(1)
      .max(100)
      .default(10)
      .describe("Maximum matches to return per file"),
    maxTotalMatches: z
      .number()
      .min(1)
      .max(1000)
      .default(100)
      .describe("Maximum total matches to return"),
    outputMode: z
      .enum(["content", "files_with_matches", "count"])
      .default("content")
      .describe("Output format: content (matched lines), files_with_matches (file paths only), count (match counts)"),
    highlight: z
      .boolean()
      .default(false)
      .describe("Add >>markers<< around matched text in results"),
  }),
  execute: async ({ 
    pattern, 
    path, 
    contextLines, 
    linesAfter, 
    linesBefore, 
    caseSensitive, 
    wholeWord, 
    fixedString, 
    maxMatchesPerFile, 
    maxTotalMatches, 
    outputMode, 
    highlight 
  }) => {
    log.tool("grepEssays", { pattern, path, contextLines, linesAfter, linesBefore, caseSensitive, wholeWord, fixedString, outputMode });
    const sourceId = getSourceId();
    const response = await niaFetch(`/data-sources/${sourceId}/grep`, {
      method: "POST",
      body: JSON.stringify({
        pattern,
        path,
        context_lines: contextLines ?? 3,
        A: linesAfter,
        B: linesBefore,
        case_sensitive: caseSensitive,
        whole_word: wholeWord,
        fixed_string: fixedString,
        max_matches_per_file: maxMatchesPerFile,
        max_total_matches: maxTotalMatches,
        output_mode: outputMode,
        highlight,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      log.error("grepEssays", error);
      throw new Error(`Nia API error: ${error}`);
    }

    const data = await response.json();
    const result = {
      matches: data.matches,
      files: data.files,
      counts: data.counts,
      pattern: data.pattern,
      pathFilter: data.path_filter,
      totalMatches: data.total_matches,
      filesSearched: data.files_searched,
    };
    log.success("grepEssays", `Found ${result.totalMatches} matches in ${result.filesSearched} files`);
    log.response(result);
    return result;
  },
});

/**
 * Web search for additional context
 */
export const webSearch = tool({
  description:
    "Search the web for information not available in Naval Ravikant's indexed content. Use this sparingly, only for recent events or external context.",
  inputSchema: z.object({
    query: z.string().describe("Search query"),
    numResults: z
      .number()
      .min(1)
      .max(10)
      .default(5)
      .describe("Number of results to return"),
    category: z
      .enum(["github", "company", "research", "news", "tweet", "pdf", "blog"])
      .optional()
      .describe("Filter by content category"),
  }),
  execute: async ({ query, numResults, category }) => {
    log.tool("webSearch", { query, numResults, category });
    const response = await niaFetch("/web-search", {
      method: "POST",
      body: JSON.stringify({
        query,
        num_results: numResults,
        ...(category && { category }),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      log.error("webSearch", error);
      throw new Error(`Nia API error: ${error}`);
    }

    const data = await response.json();
    const resultsCount = (data.github_repos?.length || 0) + (data.documentation?.length || 0) + (data.general?.length || 0);
    log.success("webSearch", `Found ${resultsCount} web results`);
    log.response(data);
    return data;
  },
});

/**
 * Get full source content by identifier
 */
export const getSourceContent = tool({
  description:
    "Retrieve the full content of a specific source file or document. Use this when you have a source identifier from search results and need the complete content.",
  inputSchema: z.object({
    sourceType: z
      .enum(["repository", "documentation"])
      .describe("Type of source to retrieve"),
    sourceIdentifier: z
      .string()
      .describe(
        "Identifier for the source. For repositories: 'owner/repo:path/to/file'. For documentation: the source URL"
      ),
    metadata: z
      .record(z.unknown())
      .optional()
      .describe("Optional metadata from search results to help locate the source"),
  }),
  execute: async ({ sourceType, sourceIdentifier, metadata }) => {
    log.tool("getSourceContent", { sourceType, sourceIdentifier });
    const response = await niaFetch("/sources/content", {
      method: "POST",
      body: JSON.stringify({
        source_type: sourceType,
        source_identifier: sourceIdentifier,
        ...(metadata && { metadata }),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      log.error("getSourceContent", error);
      throw new Error(`Nia API error: ${error}`);
    }

    const data = await response.json();
    const contentLength = data.content?.length || 0;
    log.success("getSourceContent", `Retrieved ${contentLength} chars from ${sourceIdentifier}`);
    return {
      success: data.success,
      content: data.content,
      metadata: data.metadata,
    };
  },
});

// Export all tools as a single object for easy use
export const niaNavalTools = {
  searchEssays,
  browseEssays,
  listDirectory,
  readEssay,
  grepEssays,
  webSearch,
  getSourceContent,
};
