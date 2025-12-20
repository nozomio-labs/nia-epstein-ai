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
 * Get Chromium documentation source IDs (UUIDs)
 */
export function getChromiumDocsSources(): string[] {
  return parseCsvEnv(process.env.CHROMIUM_DOCS_SOURCES);
}

/**
 * Get Chromium repository sources (owner/repo paths)
 */
export function getChromiumRepoSources(): string[] {
  return parseCsvEnv(process.env.CHROMIUM_REPO_SOURCES);
}

/**
 * Get all Chromium sources for unified search
 */
export function getChromiumSources(): { docs: string[]; repos: string[] } {
  const docs = getChromiumDocsSources();
  const repos = getChromiumRepoSources();
  
  if (docs.length === 0 && repos.length === 0) {
    throw new Error(
      "No Chromium sources configured. Set CHROMIUM_DOCS_SOURCES and/or CHROMIUM_REPO_SOURCES in your .env"
    );
  }
  
  return { docs, repos };
}

/**
 * Get default doc source ID for browsing/listing/reading
 */
function getDefaultDocSourceId(): string {
  const docs = getChromiumDocsSources();
  if (docs.length === 0) {
    throw new Error("CHROMIUM_DOCS_SOURCES not configured");
  }
  return docs[0]!;
}


/**
 * Semantic search over Chromium codebase + documentation
 */
export const searchChromium = tool({
  description: `Search the Chromium codebase and documentation using semantic search.

IMPORTANT: Specify relevant subtrees to avoid slow searches across all 33 repos!

Subtree guide:
- base: core utilities, threading, CommandLine, logging
- net: networking, HTTP, sockets, DNS, certificates  
- content: multi-process arch, RenderFrame, browser/renderer
- chrome: browser UI, settings, about:flags
- components: autofill, sync, safe_browsing, shared code
- ui: views, gfx, compositor, accessibility
- gpu: GPU process, command buffer, ANGLE
- mojo: IPC, mojom interfaces
- services: network service, device service
- cc: compositor, layers, animation
- storage: IndexedDB, quota
- extensions: extension APIs`,
  inputSchema: z.object({
    query: z
      .string()
      .describe("The search query - a question or topic to search for"),
    subtrees: z
      .array(z.string())
      .optional()
      .describe("Which subtrees to search (e.g., ['base', 'net', 'content']). If omitted, searches ALL repos (slow!). Pick 1-5 relevant ones."),
    includeDocs: z
      .boolean()
      .default(true)
      .describe("Include documentation sources in search (default true)"),
  }),
  execute: async ({ query, subtrees, includeDocs }) => {
    const allDocs = getChromiumDocsSources();
    const allRepos = getChromiumRepoSources();
    
    // Filter repos to only the specified subtrees
    let selectedRepos: string[] = [];
    if (subtrees && subtrees.length > 0) {
      selectedRepos = subtrees.map(s => `chromium/chromium/tree/main/${s}`);
      // Validate they exist
      const invalid = selectedRepos.filter(r => !allRepos.includes(r));
      if (invalid.length > 0) {
        const availableSubtrees = allRepos.map(r => r.split('/').pop()).join(', ');
        throw new Error(`Invalid subtrees: ${invalid.map(r => r.split('/').pop()).join(', ')}. Available: ${availableSubtrees}`);
      }
    } else {
      selectedRepos = allRepos; // All if not specified
    }
    
    const selectedDocs = includeDocs ? allDocs : [];
    
    log.tool("searchChromium", { 
      query, 
      subtrees: subtrees || "ALL", 
      repoCount: selectedRepos.length, 
      docCount: selectedDocs.length 
    });
    
    const body: Record<string, unknown> = {
      messages: [{ role: "user", content: query }],
      search_mode: selectedDocs.length > 0 && selectedRepos.length > 0 ? "unified" 
                  : selectedRepos.length > 0 ? "repositories" 
                  : "sources",
      include_sources: true,
    };
    
    if (selectedDocs.length > 0) body.data_sources = selectedDocs;
    if (selectedRepos.length > 0) body.repositories = selectedRepos;
    
    const response = await niaFetch("/query", {
      method: "POST",
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      log.error("searchChromium", error);
      throw new Error(`Nia API error: ${error}`);
    }

    const data = await response.json();
    const sourcesCount = data.sources?.length || 0;
    log.success("searchChromium", `Found ${sourcesCount} sources (searched ${selectedRepos.length} repos, ${selectedDocs.length} docs)`);
    log.response(data);
    return data;
  },
});

/**
 * Get the tree structure of a Chromium documentation source
 */
export const browseChromiumDocs = tool({
  description:
    "Get the complete tree structure of an indexed Chromium documentation source. Use this to explore available docs pages and their organization.",
  inputSchema: z.object({
    sourceId: z
      .string()
      .optional()
      .describe("Optional: specific doc source UUID (defaults to first configured doc source)"),
  }),
  execute: async ({ sourceId }) => {
    const resolvedSourceId = sourceId || getDefaultDocSourceId();
    log.tool("browseChromiumDocs", { sourceId: resolvedSourceId });
    const response = await niaFetch(`/data-sources/${resolvedSourceId}/tree`);

    if (!response.ok) {
      const error = await response.text();
      log.error("browseChromiumDocs", error);
      throw new Error(`Nia API error: ${error}`);
    }

    const data = await response.json();
    const result = {
      tree: data.tree_string,
      pageCount: data.page_count,
      baseUrl: data.base_url,
      sourceId: resolvedSourceId,
    };
    log.success("browseChromiumDocs", `Found ${result.pageCount} pages`);
    log.response(result);
    return result;
  },
});

/**
 * List content in a virtual directory for a Chromium documentation source
 */
export const listChromiumDocsDirectory = tool({
  description:
    "List content in a specific virtual directory path within an indexed Chromium documentation source. Use browseChromiumDocs first to discover paths.",
  inputSchema: z.object({
    path: z
      .string()
      .default("/")
      .describe('Virtual path to list (e.g., "/" for root). Get paths from browseChromiumDocs.'),
    sourceId: z
      .string()
      .optional()
      .describe("Optional: specific doc source UUID (defaults to first configured doc source)"),
  }),
  execute: async ({ path, sourceId }) => {
    const resolvedSourceId = sourceId || getDefaultDocSourceId();
    log.tool("listChromiumDocsDirectory", { path, sourceId: resolvedSourceId });
    const params = new URLSearchParams({ path });
    const response = await niaFetch(
      `/data-sources/${resolvedSourceId}/ls?${params.toString()}`
    );

    if (!response.ok) {
      const error = await response.text();
      log.error("listChromiumDocsDirectory", error);
      throw new Error(`Nia API error: ${error}`);
    }

    const data = await response.json();
    const result = {
      path: data.path,
      directories: data.directories,
      files: data.files,
      total: data.total,
      sourceId: resolvedSourceId,
    };
    log.success("listChromiumDocsDirectory", `Found ${result.total} items at ${path}`);
    log.response(result);
    return result;
  },
});

/**
 * Read the full content of a document from a Chromium documentation source
 */
export const readChromiumDoc = tool({
  description:
    "Read the full content of a specific document by its virtual path within an indexed Chromium documentation source. Use after searchChromium or browseChromiumDocs.",
  inputSchema: z.object({
    path: z
      .string()
      .describe('Virtual path to read (e.g., "/docs/something.md"). Get paths from browseChromiumDocs or listChromiumDocsDirectory.'),
    sourceId: z
      .string()
      .optional()
      .describe("Optional: specific doc source UUID (defaults to first configured doc source)"),
  }),
  execute: async ({ path, sourceId }) => {
    const resolvedSourceId = sourceId || getDefaultDocSourceId();
    log.tool("readChromiumDoc", { path, sourceId: resolvedSourceId });
    const params = new URLSearchParams({ path });
    const response = await niaFetch(
      `/data-sources/${resolvedSourceId}/read?${params.toString()}`
    );

    if (!response.ok) {
      const error = await response.text();
      log.error("readChromiumDoc", error);
      throw new Error(`Nia API error: ${error}`);
    }

    const data = await response.json();
    const result = {
      path: data.path,
      url: data.url,
      content: data.content,
      sourceId: resolvedSourceId,
    };
    const contentLength = result.content?.length || 0;
    log.success("readChromiumDoc", `Read ${contentLength} chars from ${path}`);
    console.log(`   URL: ${result.url}`);
    return result;
  },
});

/**
 * Search documentation using regex pattern
 */
export const grepChromiumDocs = tool({
  description:
    "Search indexed Chromium documentation using a regex pattern. Use this to find specific terms, identifiers, or text patterns. For code search, use searchChromium with searchMode='repositories'.",
  inputSchema: z.object({
    pattern: z
      .string()
      .describe("Regex pattern to search for (e.g., 'RenderFrame.*Host')"),
    path: z
      .string()
      .default("/")
      .describe("Limit search to this virtual path prefix"),
    sourceId: z
      .string()
      .optional()
      .describe("Optional: specific doc source UUID (defaults to first configured doc source)"),
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
    sourceId,
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
    const resolvedSourceId = sourceId || getDefaultDocSourceId();
    log.tool("grepChromiumDocs", { pattern, path, sourceId: resolvedSourceId, outputMode });
    
    // Build request body, only including defined values
    const requestBody: Record<string, unknown> = {
      pattern,
      context_lines: contextLines ?? 3,
    };
    
    if (path && path !== "/") requestBody.path = path;
    if (linesAfter !== undefined) requestBody.A = linesAfter;
    if (linesBefore !== undefined) requestBody.B = linesBefore;
    if (caseSensitive !== undefined) requestBody.case_sensitive = caseSensitive;
    if (wholeWord !== undefined) requestBody.whole_word = wholeWord;
    if (fixedString !== undefined) requestBody.fixed_string = fixedString;
    if (maxMatchesPerFile !== undefined) requestBody.max_matches_per_file = maxMatchesPerFile;
    if (maxTotalMatches !== undefined) requestBody.max_total_matches = maxTotalMatches;
    if (outputMode) requestBody.output_mode = outputMode;
    if (highlight !== undefined) requestBody.highlight = highlight;
    
    const response = await niaFetch(`/data-sources/${resolvedSourceId}/grep`, {
      method: "POST",
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.text();
      log.error("grepChromiumDocs", error);
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
      sourceId: resolvedSourceId,
    };
    log.success("grepChromiumDocs", `Found ${result.totalMatches} matches in ${result.filesSearched} files`);
    log.response(result);
    return result;
  },
});

/**
 * Search repository code with regex (code grep)
 * Uses /repositories/{repository_id}/grep endpoint
 */
export const grepChromiumCode = tool({
  description:
    "Search indexed Chromium repository code using a regex pattern. Like Unix grep but for the codebase. Use this to find function definitions, class names, error strings, flags, GN targets, etc. IMPORTANT: Each Chromium subtree is indexed separately (base, chrome, content, etc). Specify the subtree you want to search.",
  inputSchema: z.object({
    pattern: z
      .string()
      .describe("Regex pattern to search for in code (e.g., 'RenderFrameHost::.*Create', 'BUILDFLAG\\(')"),
    subtree: z
      .string()
      .optional()
      .describe("Which Chromium subtree to search (e.g., 'base', 'chrome', 'content', 'components', 'net', 'ui', 'gpu', 'mojo', 'ipc', 'services', etc). Defaults to 'base'."),
    path: z
      .string()
      .default("")
      .describe("Limit search to files with this path prefix within the subtree"),
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
    subtree,
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
    highlight,
    includeLineNumbers,
    groupByFile,
    exhaustive,
  }) => {
    // Build the full repository path: chromium/chromium/tree/main/{subtree}
    const resolvedSubtree = subtree || "base";
    const repoId = `chromium/chromium/tree/main/${resolvedSubtree}`;
    
    // Verify this subtree is in our configured sources
    const repos = getChromiumRepoSources();
    if (repos.length > 0 && !repos.includes(repoId)) {
      const availableSubtrees = repos.map(r => r.split('/').pop()).join(', ');
      throw new Error(`Subtree '${resolvedSubtree}' not found. Available: ${availableSubtrees}`);
    }

    log.tool("grepChromiumCode", { pattern, subtree: resolvedSubtree, path, exhaustive, outputMode });
    
    // Build request body, only including defined values
    const requestBody: Record<string, unknown> = {
      pattern,
      context_lines: contextLines ?? 3,
    };
    
    // Only add optional fields if they have values
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
    
    const response = await niaFetch(`/repositories/${encodeURIComponent(repoId)}/grep`, {
      method: "POST",
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.text();
      log.error("grepChromiumCode", error);
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
      subtree: resolvedSubtree,
      repositoryId: repoId,
    };
    log.success("grepChromiumCode", `Found ${result.totalMatches} matches in ${result.filesWithMatches || 0} files (subtree: ${resolvedSubtree})`);
    log.response(result);
    return result;
  },
});

/**
 * Web search for additional context
 */
export const webSearch = tool({
  description:
    "Search the web for information not available in your indexed Chromium sources. Use sparingly - prefer searchChromium first.",
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
 * Get full source content by identifier (from search results)
 */
export const getSourceContent = tool({
  description:
    "Retrieve the full content of a specific source file or document from search results. Use this when you have a source identifier from searchChromium results.",
  inputSchema: z.object({
    sourceType: z
      .enum(["repository", "documentation"])
      .describe("Type of source to retrieve"),
    sourceIdentifier: z
      .string()
      .describe(
        "Identifier for the source. For repositories: 'owner/repo:path/to/file'. For documentation: the source URL or path"
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
export const niaChromiumTools = {
  searchChromium,
  browseChromiumDocs,
  listChromiumDocsDirectory,
  readChromiumDoc,
  grepChromiumDocs,
  grepChromiumCode,
  webSearch,
  getSourceContent,
};
