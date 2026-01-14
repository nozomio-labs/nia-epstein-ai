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

function parseCsvEnv(value: string | undefined | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Get Epstein archive repository sources (owner/repo/tree/branch/path format)
 * Contains: emails, messages, flight logs, court documents, and other records
 */
export function getEpsteinArchiveSources(): string[] {
  return parseCsvEnv(process.env.NIA_EPSTEIN_ARCHIVE_SOURCES);
}

/**
 * Get Epstein biographical sources
 * Contains: biographical information, timeline, known associates, properties
 */
export function getEpsteinBiographicalSources(): string[] {
  return parseCsvEnv(process.env.NIA_EPSTEIN_BIOGRAPHICAL_SOURCES);
}

/**
 * Get all Epstein sources combined (archive + biographical)
 */
export function getAllEpsteinSources(): string[] {
  return [...getEpsteinArchiveSources(), ...getEpsteinBiographicalSources()];
}

/**
 * Get default archive repository source for browsing/listing/reading
 */
function getDefaultArchiveSource(): string {
  const repos = getEpsteinArchiveSources();
  if (repos.length === 0) {
    throw new Error("NIA_EPSTEIN_ARCHIVE_SOURCES not configured");
  }
  return repos[0]!;
}

/**
 * Get default biographical repository source
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getDefaultBiographicalSource(): string {
  const repos = getEpsteinBiographicalSources();
  if (repos.length === 0) {
    throw new Error("NIA_EPSTEIN_BIOGRAPHICAL_SOURCES not configured");
  }
  return repos[0]!;
}


/**
 * Semantic search over all Epstein sources (archive + biographical)
 */
export const searchArchive = tool({
  description: `Search all Epstein sources using semantic search.

Searches across TWO repositories:
1. **Archive** - emails, messages, flight logs, court documents, and other records
2. **Biographical** - biographical information, timeline, known associates, properties

Use this to find:
- Names of people (associates, victims, employees)
- Dates and time periods
- Locations (properties, travel destinations)
- Events and meetings
- Topics and subjects discussed in communications
- Biographical details about Epstein's life and network`,
  inputSchema: z.object({
    query: z
      .string()
      .describe("The search query - a question, name, date, or topic to search for"),
    sourceType: z
      .enum(["all", "archive", "biographical"])
      .default("all")
      .describe("Which sources to search: 'all' (default), 'archive', or 'biographical'"),
  }),
  execute: async ({ query, sourceType }) => {
    let repos: string[];
    if (sourceType === "archive") {
      repos = getEpsteinArchiveSources();
    } else if (sourceType === "biographical") {
      repos = getEpsteinBiographicalSources();
    } else {
      repos = getAllEpsteinSources();
    }

    if (repos.length === 0) {
      throw new Error(`No Epstein ${sourceType} sources configured. Check your .env`);
    }

    log.tool("searchArchive", {
      query,
      sourceType,
      repoCount: repos.length
    });

    const body: Record<string, unknown> = {
      messages: [{ role: "user", content: query }],
      search_mode: "repositories",
      include_sources: true,
      repositories: repos,
    };

    const response = await niaFetch("/search/query", {
      method: "POST",
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      log.error("searchArchive", error);
      throw new Error(`Nia API error: ${error}`);
    }

    const data = await response.json();
    const sourcesCount = data.sources?.length || 0;
    log.success("searchArchive", `Found ${sourcesCount} sources`);
    log.response(data);
    return data;
  },
});

/**
 * Get the tree structure of the Epstein archive repository
 */
export const browseArchive = tool({
  description:
    "Get the complete tree structure of the indexed Epstein archive. Use this to explore available documents and their organization.",
  inputSchema: z.object({
    repoId: z
      .string()
      .optional()
      .describe("Optional: specific repository ID (defaults to first configured source)"),
  }),
  execute: async ({ repoId }) => {
    const resolvedRepoId = repoId || getDefaultArchiveSource();
    log.tool("browseArchive", { repoId: resolvedRepoId });
    const response = await niaFetch(`/repositories/${encodeURIComponent(resolvedRepoId)}/tree`);

    if (!response.ok) {
      const error = await response.text();
      log.error("browseArchive", error);
      throw new Error(`Nia API error: ${error}`);
    }

    const data = await response.json();
    const result = {
      tree: data.tree_string,
      fileCount: data.file_count,
      repoId: resolvedRepoId,
    };
    log.success("browseArchive", `Found ${result.fileCount} files`);
    log.response(result);
    return result;
  },
});

/**
 * Read the full content of a file from the Epstein archive
 */
export const readArchiveDoc = tool({
  description:
    "Read the full content of a specific file by its path within the indexed Epstein archive. Use after searchArchive or browseArchive.",
  inputSchema: z.object({
    path: z
      .string()
      .describe('File path to read (e.g., "data/emails/2005-01-15.txt"). Get paths from browseArchive or search results.'),
    repoId: z
      .string()
      .optional()
      .describe("Optional: specific repository ID (defaults to first configured source)"),
  }),
  execute: async ({ path, repoId }) => {
    const resolvedRepoId = repoId || getDefaultArchiveSource();
    log.tool("readArchiveDoc", { path, repoId: resolvedRepoId });
    const params = new URLSearchParams({ path });
    const response = await niaFetch(
      `/repositories/${encodeURIComponent(resolvedRepoId)}/content?${params.toString()}`
    );

    if (!response.ok) {
      const error = await response.text();
      log.error("readArchiveDoc", error);
      throw new Error(`Nia API error: ${error}`);
    }

    const data = await response.json();
    const result = {
      path: path,
      content: data.content,
      metadata: data.metadata,
      repoId: resolvedRepoId,
    };
    const contentLength = result.content?.length || 0;
    log.success("readArchiveDoc", `Read ${contentLength} chars from ${path}`);
    return result;
  },
});

/**
 * Search archive using regex pattern
 */
export const grepArchive = tool({
  description:
    "Search the indexed Epstein archive using a regex pattern. Use this to find exact names, email addresses, phone numbers, dates, or specific text patterns.",
  inputSchema: z.object({
    pattern: z
      .string()
      .describe("Regex pattern to search for (e.g., 'Bill Clinton', '@gmail.com', '2005-.*')"),
    path: z
      .string()
      .default("")
      .describe("Limit search to files with this path prefix"),
    repoId: z
      .string()
      .optional()
      .describe("Optional: specific repository ID (defaults to first configured source)"),
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
    includeLineNumbers: z
      .boolean()
      .default(true)
      .describe("Include line numbers in results"),
    groupByFile: z
      .boolean()
      .default(true)
      .describe("Group matches by file in results"),
    exhaustive: z
      .boolean()
      .default(true)
      .describe("Search ALL chunks for complete results (true = like real grep, false = faster BM25 pre-filter)"),
  }),
  execute: async ({
    pattern,
    path,
    repoId,
    contextLines,
    linesAfter,
    linesBefore,
    caseSensitive,
    wholeWord,
    fixedString,
    maxMatchesPerFile,
    maxTotalMatches,
    outputMode,
    highlight,
    includeLineNumbers,
    groupByFile,
    exhaustive,
  }) => {
    const resolvedRepoId = repoId || getDefaultArchiveSource();
    log.tool("grepArchive", { pattern, path, repoId: resolvedRepoId, outputMode, exhaustive });

    // Build request body, only including defined values
    const requestBody: Record<string, unknown> = {
      pattern,
      context_lines: contextLines ?? 3,
    };

    if (path) requestBody.path = path;
    if (linesAfter !== undefined) requestBody.A = linesAfter;
    if (linesBefore !== undefined) requestBody.B = linesBefore;
    if (caseSensitive !== undefined) requestBody.case_sensitive = caseSensitive;
    if (wholeWord !== undefined) requestBody.whole_word = wholeWord;
    if (fixedString !== undefined) requestBody.fixed_string = fixedString;
    if (maxMatchesPerFile !== undefined) requestBody.max_matches_per_file = maxMatchesPerFile;
    if (maxTotalMatches !== undefined) requestBody.max_total_matches = maxTotalMatches;
    if (outputMode) requestBody.output_mode = outputMode;
    if (highlight !== undefined) requestBody.highlight = highlight;
    if (includeLineNumbers !== undefined) requestBody.include_line_numbers = includeLineNumbers;
    if (groupByFile !== undefined) requestBody.group_by_file = groupByFile;
    if (exhaustive !== undefined) requestBody.exhaustive = exhaustive;

    const response = await niaFetch(`/repositories/${encodeURIComponent(resolvedRepoId)}/grep`, {
      method: "POST",
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.text();
      log.error("grepArchive", error);
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
      filesWithMatches: data.files_with_matches,
      truncated: data.truncated,
      options: data.options,
      repoId: resolvedRepoId,
    };
    log.success("grepArchive", `Found ${result.totalMatches} matches in ${result.filesWithMatches || result.filesSearched} files`);
    log.response(result);
    return result;
  },
});

/**
 * Web search for additional context
 */
export const webSearch = tool({
  description:
    "Search the web for additional context not available in the indexed Epstein archive. Use sparingly - prefer searchArchive first.",
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
    daysBack: z
      .number()
      .optional()
      .describe("Limit results to the last N days (recency filter)"),
    findSimilarTo: z
      .string()
      .optional()
      .describe("URL to find similar content to"),
  }),
  execute: async ({ query, numResults, category, daysBack, findSimilarTo }) => {
    log.tool("webSearch", { query, numResults, category, daysBack, findSimilarTo });
    const response = await niaFetch("/search/web", {
      method: "POST",
      body: JSON.stringify({
        query,
        num_results: numResults,
        ...(category && { category }),
        ...(daysBack !== undefined && { days_back: daysBack }),
        ...(findSimilarTo && { find_similar_to: findSimilarTo }),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      log.error("webSearch", error);
      throw new Error(`Nia API error: ${error}`);
    }

    const data = await response.json();
    const resultsCount = (data.github_repos?.length || 0) + (data.documentation?.length || 0) + (data.other_content?.length || 0);
    log.success("webSearch", `Found ${resultsCount} web results`);
    log.response(data);
    return data;
  },
});

/**
 * Get full file content by path (from search results)
 */
export const getSourceContent = tool({
  description:
    "Retrieve the full content of a specific file from the archive. Use this when you have a file path from searchArchive results.",
  inputSchema: z.object({
    path: z
      .string()
      .describe("The file path (from search results or browseArchive)"),
    repoId: z
      .string()
      .optional()
      .describe("Optional: specific repository ID (defaults to first configured source)"),
  }),
  execute: async ({ path, repoId }) => {
    const resolvedRepoId = repoId || getDefaultArchiveSource();
    log.tool("getSourceContent", { path, repoId: resolvedRepoId });

    const params = new URLSearchParams({ path });
    const response = await niaFetch(
      `/repositories/${encodeURIComponent(resolvedRepoId)}/content?${params.toString()}`
    );

    if (!response.ok) {
      const error = await response.text();
      log.error("getSourceContent", error);
      throw new Error(`Nia API error: ${error}`);
    }

    const data = await response.json();
    const contentLength = data.content?.length || 0;
    log.success("getSourceContent", `Retrieved ${contentLength} chars from ${path}`);
    return {
      success: data.success,
      content: data.content,
      metadata: data.metadata,
    };
  },
});

// Export all tools as a single object for easy use
export const niaEpsteinTools = {
  searchArchive,
  browseArchive,
  readArchiveDoc,
  grepArchive,
  webSearch,
  getSourceContent,
};
