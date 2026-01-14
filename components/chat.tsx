"use client";

import { useChat } from "@ai-sdk/react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { ModelSelector } from "@/components/model-selector";
import {
  ArrowUpIcon,
  PlusIcon,
  SearchIcon,
  FileTextIcon,
  GlobeIcon,
  CopyIcon,
  CheckIcon,
  ThumbsUpIcon,
  ThumbsDownIcon,
  GithubIcon,
  FolderIcon,
  FolderTreeIcon,
  PaperclipIcon,
  XIcon,
  ImageIcon,
  Loader2Icon,
} from "lucide-react";
import Image from "next/image";
import { useState, useEffect, useRef, useCallback } from "react";
import type { UIMessage } from "@ai-sdk/react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Streamdown } from "streamdown";
import { DEFAULT_MODEL, type SupportedModel } from "@/lib/constants";
import { FlickeringGrid } from "@/components/ui/flickering-grid";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import { SplashScreen } from "@/components/splash-screen";

// Helper to check if an error is retryable
function isRetryableError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes("timeout") ||
    message.includes("network") ||
    message.includes("rate limit") ||
    message.includes("503") ||
    message.includes("429") ||
    message.includes("fetch failed")
  );
}

// Sanitize filename for Anthropic API compatibility
// Only allows: alphanumeric, whitespace, hyphens, parentheses, square brackets
// No consecutive whitespace
function sanitizeFileName(name: string): string {
  // Get file extension
  const lastDot = name.lastIndexOf('.');
  const ext = lastDot > 0 ? name.slice(lastDot) : '';
  const baseName = lastDot > 0 ? name.slice(0, lastDot) : name;
  
  // Replace invalid characters with hyphens, collapse multiple spaces/hyphens
  const sanitized = baseName
    .replace(/[^a-zA-Z0-9\s\-\(\)\[\]]/g, '-') // Replace invalid chars
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .replace(/-+/g, '-') // Collapse multiple hyphens
    .trim();
  
  return sanitized + ext;
}

// Create sanitized File from original
function createSanitizedFile(file: File): File {
  const sanitizedName = sanitizeFileName(file.name);
  return new File([file], sanitizedName, { type: file.type });
}

// Agent step progress component
function AgentProgress({ 
  currentStep, 
  maxSteps, 
  currentTool, 
  onStop 
}: { 
  currentStep: number; 
  maxSteps: number; 
  currentTool: string | null;
  onStop: () => void;
}) {
  if (currentStep === 0) return null;
  
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground px-4 py-2 bg-muted/30 rounded-lg">
      <Loader2Icon className="h-3 w-3 animate-spin" />
      <span className="font-medium">Step {currentStep}/{maxSteps}</span>
      {currentTool && (
        <span className="text-muted-foreground/60">({currentTool})</span>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="ml-auto h-6 text-xs"
        onClick={onStop}
      >
        Stop & Keep Results
      </Button>
    </div>
  );
}

const toolIcons: Record<string, React.ReactNode> = {
  searchArchive: <SearchIcon className="h-3 w-3" />,
  browseArchive: <FolderTreeIcon className="h-3 w-3" />,
  listArchiveDirectory: <FolderIcon className="h-3 w-3" />,
  readArchiveDoc: <FileTextIcon className="h-3 w-3" />,
  grepArchive: <SearchIcon className="h-3 w-3" />,
  getSourceContent: <FileTextIcon className="h-3 w-3" />,
  webSearch: <GlobeIcon className="h-3 w-3" />,
};

const toolDisplayNames: Record<string, string> = {
  searchArchive: "Searching archive",
  browseArchive: "Browsing archive",
  listArchiveDirectory: "Listing directory",
  readArchiveDoc: "Reading document",
  grepArchive: "Pattern search",
  getSourceContent: "Opening document",
  webSearch: "Web search",
};

function ToolInvocation({ toolType, toolName, state, input }: { 
  toolType: string;
  toolName?: string;
  state?: string;
  input?: unknown;
}) {
  // Extract tool name from type (e.g., "tool-searchChromium" -> "searchChromium")
  const resolvedToolName = toolName || toolType.replace("tool-", "");
  const displayName = toolDisplayNames[resolvedToolName] || resolvedToolName;
  const defaultIcon = <SearchIcon className="h-3 w-3" />;
  const icon: React.ReactNode = resolvedToolName in toolIcons ? toolIcons[resolvedToolName] : defaultIcon;
  
  // Get query/path from input for context
  const inputObj = input as Record<string, unknown> | undefined;
  const rawContext = inputObj?.query || inputObj?.path || inputObj?.pattern;
  const inputContext = rawContext ? String(rawContext) : null;

  if (state === "output-available") {
    return (
      <div className="text-xs text-muted-foreground/70 flex items-center gap-1.5 py-1.5 px-2 bg-muted/30 rounded-lg my-1">
        {icon}
        <span className="font-medium">{displayName}</span>
        {inputContext && <span className="text-muted-foreground/50 truncate max-w-[200px]">&ldquo;{inputContext}&rdquo;</span>}
        <span className="text-green-500 ml-auto">✓</span>
      </div>
    );
  }

  return (
    <div className="text-xs text-muted-foreground flex items-center gap-1.5 py-1.5 px-2 bg-muted/30 rounded-lg my-1 animate-pulse">
      {icon}
      <span className="font-medium">{displayName}</span>
      {inputContext && <span className="text-muted-foreground/50 truncate max-w-[200px]">&ldquo;{inputContext}&rdquo;</span>}
      <span className="ml-auto">...</span>
    </div>
  );
}

function MessageActions({ message, feedback, onFeedback }: { 
  message: UIMessage;
  feedback: "like" | "dislike" | null;
  onFeedback: (type: "like" | "dislike") => void;
}) {
  const [copied, setCopied] = useState(false);

  const getTextContent = () => {
    return message.parts
      .filter((part) => part.type === "text")
      .map((part) => (part as { type: "text"; text: string }).text)
      .join("\n");
  };

  const handleCopy = async () => {
    const text = getTextContent();
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
      <button
        onClick={handleCopy}
        className="p-1.5 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 transition-colors"
        title="Copy"
      >
        {copied ? <CheckIcon className="h-3.5 w-3.5 text-green-500" /> : <CopyIcon className="h-3.5 w-3.5" />}
      </button>
      <button
        onClick={() => onFeedback("like")}
        className={cn(
          "p-1.5 rounded-md transition-colors",
          feedback === "like" 
            ? "text-green-500 bg-green-500/10" 
            : "text-muted-foreground/60 hover:text-foreground hover:bg-muted/50"
        )}
        title="Good response"
      >
        <ThumbsUpIcon className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={() => onFeedback("dislike")}
        className={cn(
          "p-1.5 rounded-md transition-colors",
          feedback === "dislike" 
            ? "text-red-500 bg-red-500/10" 
            : "text-muted-foreground/60 hover:text-foreground hover:bg-muted/50"
        )}
        title="Bad response"
      >
        <ThumbsDownIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function Chat() {
  const [input, setInput] = useState("");
  const [selectedModel, setSelectedModel] = useState<SupportedModel>(DEFAULT_MODEL);
  const [feedbacks, setFeedbacks] = useState<Record<string, "like" | "dislike" | null>>({});
  const [showSplash, setShowSplash] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // File attachments state
  const [files, setFiles] = useState<FileList | undefined>(undefined);
  
  // Retry state for error handling
  const [retryCount, setRetryCount] = useState(0);
  const MAX_RETRIES = 3;
  
  // Agent step tracking
  const [currentStep, setCurrentStep] = useState(0);
  const [currentTool, setCurrentTool] = useState<string | null>(null);
  const MAX_AGENT_STEPS = 20;

  const { messages, error, sendMessage, regenerate, setMessages, stop, status } = useChat({
    // Throttle updates to 50ms - reduces re-renders ~95% while maintaining smooth UX
    experimental_throttle: 50,
    
    onError: (error) => {
      console.error("Chat error:", error);
      
      // Auto-retry for transient errors with exponential backoff
      if (retryCount < MAX_RETRIES && isRetryableError(error)) {
        const delay = Math.pow(2, retryCount) * 1000;
        console.log(`Retrying in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);
        setTimeout(() => {
          setRetryCount((prev) => prev + 1);
          regenerate();
        }, delay);
      }
    },
    
    onFinish: (message) => {
      // Reset retry count on success
      setRetryCount(0);
      // Reset agent progress
      setCurrentStep(0);
      setCurrentTool(null);
      
      // Log completion for debugging
      console.log("Message completed:", {
        id: message?.id,
        partsCount: message?.parts?.length ?? 0,
      });
    },
  });

  // Track agent steps from tool invocations in messages
  useEffect(() => {
    if (status === "streaming" && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage?.role === "assistant" && lastMessage.parts) {
        const toolParts = lastMessage.parts.filter((p) => 
          p.type.startsWith("tool-")
        );
        setCurrentStep(toolParts.length);
        
        // Get the current/latest tool being executed
        const lastToolPart = toolParts[toolParts.length - 1] as { 
          type: string; 
          toolName?: string;
          state?: string;
        } | undefined;
        
        if (lastToolPart && lastToolPart.state !== "output-available") {
          const toolName = lastToolPart.toolName || lastToolPart.type.replace("tool-", "");
          setCurrentTool(toolDisplayNames[toolName] || toolName);
        } else {
          setCurrentTool(null);
        }
      }
    }
  }, [messages, status]);

  const handleFeedback = (messageId: string, type: "like" | "dislike") => {
    setFeedbacks((prev) => ({
      ...prev,
      [messageId]: prev[messageId] === type ? null : type,
    }));
  };

  const hasMessages = messages.length > 0;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleNewChat = () => {
    stop();
    setMessages([]);
    setInput("");
  };

  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, []);

  useEffect(() => {
    adjustTextareaHeight();
  }, [input, adjustTextareaHeight]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() && !files?.length) return;
    
    // Sanitize filenames for Anthropic API compatibility
    let sanitizedFiles: File[] | undefined;
    if (files && files.length > 0) {
      sanitizedFiles = Array.from(files).map(createSanitizedFile);
    }
    
    sendMessage(
      { 
        text: input,
        files: sanitizedFiles, // AI SDK auto-converts to data URLs for image/* and text/*
      }, 
      { body: { model: selectedModel } }
    );
    
    setInput("");
    setFiles(undefined);
    
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFiles(e.target.files);
    }
  };
  
  const removeFiles = () => {
    setFiles(undefined);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <>
      {showSplash && <SplashScreen onComplete={() => setShowSplash(false)} />}
      <div className="relative flex flex-col h-[100dvh] overflow-hidden">
      <FlickeringGrid
        className="absolute inset-0 z-0 pointer-events-none [mask-image:radial-gradient(ellipse_at_center,transparent_20%,black)]"
        squareSize={4}
        gridGap={6}
        color="rgb(74, 144, 226)"
        maxOpacity={0.15}
        flickerChance={0.1}
      />
      <div className="absolute top-3 left-3 md:top-4 md:left-4 z-10 flex gap-2 animate-fade-in safe-area-top">
        <Button
          onClick={handleNewChat}
          variant="outline"
          size="icon"
          className="h-10 w-10 md:h-9 md:w-9 shadow-border-small hover:shadow-border-medium bg-background/80 backdrop-blur-sm border-0 hover:bg-background active:scale-95 md:hover:scale-[1.02] transition-all duration-150 ease"
        >
          <PlusIcon className="h-4 w-4" />
        </Button>
        <Button
          asChild
          variant="outline"
          size="icon"
          className="h-10 w-10 md:h-9 md:w-9 shadow-border-small hover:shadow-border-medium bg-background/80 backdrop-blur-sm border-0 hover:bg-background active:scale-95 md:hover:scale-[1.02] transition-all duration-150 ease"
        >
          <a
            href="https://github.com/nozomio-labs/nia-epstein-ai"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Epstein Files repository"
          >
            <GithubIcon className="h-4 w-4" />
          </a>
        </Button>
        <ThemeToggle />
      </div>
      {!hasMessages && (
        <div className="flex-1 flex flex-col items-center justify-center px-4 md:px-8 animate-fade-in safe-area-inset">
          <div className="w-full max-w-2xl text-center space-y-6 md:space-y-12">
            <div className="space-y-3 md:space-y-4">
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 animate-slide-up">
                <h1 className="text-2xl sm:text-3xl md:text-5xl tracking-tight text-foreground font-[family-name:var(--font-canela)]">
                  Epstein Files
                </h1>
                <div className="relative group">
                  <span className="text-[10px] text-muted-foreground/60 cursor-default">archive</span>
                  <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 w-64 p-2 rounded-lg bg-popover border border-border shadow-md opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 z-50 text-left">
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      Indexed emails, messages, flight logs, court documents, and other records from the Epstein archive.
                    </p>
                  </div>
                </div>
              </div>
              <div className="animate-slide-up flex justify-center" style={{ animationDelay: '25ms' }}>
                <Image 
                  src="/epstein123.png" 
                  alt="Epstein" 
                  width={180} 
                  height={180} 
                  className="rounded-full"
                  priority
                />
              </div>
              <p className="text-muted-foreground text-sm md:text-base animate-slide-up px-2" style={{ animationDelay: '50ms' }}>
                Search the Epstein archive — emails, messages, and documents. Powered by{" "}
                <a
                  href="https://trynia.ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-4 hover:text-foreground transition-colors"
                >
                  Nia
                </a>
                .
              </p>
            </div>
            <div className="w-full animate-slide-up" style={{ animationDelay: '100ms' }}>
              <form onSubmit={handleSubmit}>
                <div className="relative rounded-2xl bg-muted/50 dark:bg-muted/30 border border-border/50 shadow-sm hover:shadow-md focus-within:shadow-md focus-within:border-border transition-all duration-200">
                  {/* File attachment preview */}
                  {files && files.length > 0 && (
                    <div className="px-4 pt-3 flex flex-wrap gap-2">
                      {Array.from(files).map((file, index) => (
                        <div 
                          key={index}
                          className="flex items-center gap-2 px-2 py-1 bg-muted rounded-lg text-xs"
                        >
                          {file.type.startsWith('image/') ? (
                            <ImageIcon className="h-3 w-3 text-muted-foreground" />
                          ) : (
                            <FileTextIcon className="h-3 w-3 text-muted-foreground" />
                          )}
                          <span className="truncate max-w-[150px]">{file.name}</span>
                          <button
                            type="button"
                            onClick={removeFiles}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <XIcon className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <textarea
                    ref={textareaRef}
                    name="prompt"
                    placeholder="Who visited Little St. James Island in 2005?"
                    onChange={(e) => setInput(e.target.value)}
                    value={input}
                    autoFocus
                    rows={1}
                    className={cn(
                      "w-full resize-none bg-transparent px-4 pb-14 text-[16px] md:text-base placeholder:text-muted-foreground/50 focus:outline-none min-h-[56px] max-h-[200px]",
                      files && files.length > 0 ? "pt-2" : "pt-4"
                    )}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSubmit(e);
                      }
                    }}
                  />
                  <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <ModelSelector selectedModel={selectedModel} onModelChange={setSelectedModel} />
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept="image/*,text/*,.pdf,.txt,.md,.csv"
                        onChange={handleFileSelect}
                        className="hidden"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
                        onClick={() => fileInputRef.current?.click()}
                        title="Attach files"
                      >
                        <PaperclipIcon className="h-4 w-4" />
                      </Button>
                    </div>
                    <Button
                      type="submit"
                      size="icon"
                      className={cn(
                        "h-8 w-8 rounded-lg transition-all duration-200",
                        (input.trim() || files?.length)
                          ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm" 
                          : "bg-muted text-muted-foreground cursor-not-allowed"
                      )}
                      disabled={!input.trim() && !files?.length}
                    >
                      <ArrowUpIcon className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </form>
            </div>
            <div className="flex flex-col gap-2 md:gap-3 text-xs md:text-sm animate-slide-up" style={{ animationDelay: '150ms' }}>
              <button
                onClick={() => {
                  setInput("Was Arlan, the founder of Nozomio, mentioned in Epstein files?");
                }}
                className="p-3 rounded-xl text-center text-muted-foreground hover:text-foreground active:bg-muted/70 hover:bg-muted/50 transition-colors"
              >
                &ldquo;Was Arlan (Nozomio founder) mentioned?&rdquo;
              </button>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 md:gap-3">
                <button
                  onClick={() => {
                    setInput("Who are the most frequently mentioned people in the archive?");
                  }}
                  className="p-3 rounded-xl text-left text-muted-foreground hover:text-foreground active:bg-muted/70 hover:bg-muted/50 transition-colors"
                >
                  &ldquo;Most frequently mentioned people?&rdquo;
                </button>
                <button
                  onClick={() => {
                    setInput("What flight records exist from 2002-2005?");
                  }}
                  className="p-3 rounded-xl text-left text-muted-foreground hover:text-foreground active:bg-muted/70 hover:bg-muted/50 transition-colors"
                >
                  &ldquo;Flight records from 2002-2005?&rdquo;
                </button>
                <button
                  onClick={() => {
                    setInput("Find emails mentioning specific locations or properties");
                  }}
                  className="p-3 rounded-xl text-left text-muted-foreground hover:text-foreground active:bg-muted/70 hover:bg-muted/50 transition-colors"
                >
                  &ldquo;Emails about specific locations?&rdquo;
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {hasMessages && (
        <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full animate-fade-in overflow-hidden">
          <div className="flex-1 overflow-y-auto px-4 md:px-8 py-4 hide-scrollbar">
            <div className="flex flex-col gap-4 md:gap-6 pb-4">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    "group",
                    m.role === "user" &&
                      "bg-primary text-primary-foreground rounded-2xl p-3 md:p-4 ml-auto max-w-[90%] md:max-w-[75%] shadow-border-small font-medium text-sm md:text-base",
                    m.role === "assistant" && "max-w-[95%] md:max-w-[85%] text-foreground/90 leading-relaxed text-sm md:text-base"
                  )}
                >
                  {m.parts?.map((part, i) => {
                    switch (part.type) {
                      case "reasoning":
                        return (
                          <Reasoning 
                            key={`${m.id}-${i}`}
                            isStreaming={part.state === "streaming"}
                          >
                            <ReasoningTrigger />
                            <ReasoningContent>{part.text}</ReasoningContent>
                          </Reasoning>
                        );
                      case "text":
                        return m.role === "assistant" ? (
                          <Streamdown key={`${m.id}-${i}`} isAnimating={status === "streaming" && m.id === messages[messages.length - 1]?.id}>
                            {part.text}
                          </Streamdown>
                        ) : (
                          <div key={`${m.id}-${i}`}>{part.text}</div>
                        );
                      case "file": {
                        // Handle file attachments (images, etc.)
                        const filePart = part as { type: "file"; url: string; mediaType?: string };
                        if (filePart.mediaType?.startsWith("image/")) {
                          // For data URLs from file uploads, we need to use img tag
                          // as Next.js Image doesn't support data URLs directly
                          return (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              key={`${m.id}-${i}`}
                              src={filePart.url}
                              alt="Attached image"
                              className="max-w-[300px] rounded-lg my-2"
                            />
                          );
                        }
                        return (
                          <div key={`${m.id}-${i}`} className="flex items-center gap-2 text-xs text-muted-foreground my-1">
                            <FileTextIcon className="h-3 w-3" />
                            <span>Attached file</span>
                          </div>
                        );
                      }
                      default:
                        // Handle tool invocations
                        if (part.type.startsWith("tool-")) {
                          const toolPart = part as { type: string; toolName?: string; state?: string; input?: unknown };
                          return (
                            <ToolInvocation 
                              key={`${m.id}-${i}`} 
                              toolType={toolPart.type}
                              toolName={toolPart.toolName}
                              state={toolPart.state}
                              input={toolPart.input}
                            />
                          );
                        }
                        return null;
                    }
                  })}
                  {m.role === "assistant" && status !== "streaming" && (
                    <>
                    <MessageActions 
                      message={m} 
                      feedback={feedbacks[m.id] || null}
                      onFeedback={(type) => handleFeedback(m.id, type)}
                    />
                    <div className="mt-3 pt-3 border-t border-border/40 flex items-start gap-2 text-xs text-muted-foreground/70">
                       <div className="mt-1 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                       <span>
                         Grounded answers come from indexed Epstein archive sources via <a href="https://trynia.ai" target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline transition-all">Nia</a>.
                       </span>
                    </div>
                    </>
                  )}
                </div>
              ))}

              <div ref={messagesEndRef} />
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="max-w-4xl mx-auto w-full px-4 md:px-8 pb-4 animate-slide-down">
          <Alert variant="destructive" className="flex flex-col gap-3">
            <div className="flex flex-row gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <AlertDescription className="dark:text-red-400 text-red-600 flex-1">
                {error.message || "An error occurred while generating the response."}
                {retryCount > 0 && retryCount < MAX_RETRIES && (
                  <span className="block text-xs mt-1 text-red-400/70">
                    Auto-retrying... ({retryCount}/{MAX_RETRIES})
                  </span>
                )}
                {retryCount >= MAX_RETRIES && (
                  <span className="block text-xs mt-1 text-red-400/70">
                    Max retries reached. Please try again manually.
                  </span>
                )}
              </AlertDescription>
            </div>
            <div className="flex gap-2 ml-auto">
              <Button
                variant="ghost"
                size="sm"
                className="transition-all duration-150 ease-out hover:scale-105"
                onClick={() => {
                  setRetryCount(0);
                  setMessages([]);
                }}
              >
                Clear Chat
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="transition-all duration-150 ease-out hover:scale-105"
                onClick={() => {
                  setRetryCount(0);
                  regenerate();
                }}
              >
                Retry
              </Button>
            </div>
          </Alert>
        </div>
      )}

      {hasMessages && (
        <div className="w-full max-w-4xl mx-auto px-4 md:px-8 pb-4 md:pb-6 pt-2 space-y-2">
          {/* Agent progress indicator */}
          {status === "streaming" && currentStep > 0 && (
            <AgentProgress
              currentStep={currentStep}
              maxSteps={MAX_AGENT_STEPS}
              currentTool={currentTool}
              onStop={stop}
            />
          )}
          
          {/* Retry indicator */}
          {retryCount > 0 && status === "streaming" && (
            <div className="flex items-center gap-2 text-xs text-amber-500 px-4 py-2 bg-amber-500/10 rounded-lg">
              <Loader2Icon className="h-3 w-3 animate-spin" />
              <span>Retry attempt {retryCount}/{MAX_RETRIES}...</span>
            </div>
          )}
          
          <form onSubmit={handleSubmit}>
            <div className="relative rounded-2xl bg-muted/50 dark:bg-muted/30 border border-border/50 shadow-sm hover:shadow-md focus-within:shadow-md focus-within:border-border transition-all duration-200">
              {/* File attachment preview */}
              {files && files.length > 0 && (
                <div className="px-4 pt-3 flex flex-wrap gap-2">
                  {Array.from(files).map((file, index) => (
                    <div 
                      key={index}
                      className="flex items-center gap-2 px-2 py-1 bg-muted rounded-lg text-xs"
                    >
                      {file.type.startsWith('image/') ? (
                        <ImageIcon className="h-3 w-3 text-muted-foreground" />
                      ) : (
                        <FileTextIcon className="h-3 w-3 text-muted-foreground" />
                      )}
                      <span className="truncate max-w-[150px]">{file.name}</span>
                      <button
                        type="button"
                        onClick={removeFiles}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <XIcon className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <textarea
                ref={textareaRef}
                name="prompt"
                placeholder="Ask a follow-up question..."
                onChange={(e) => setInput(e.target.value)}
                value={input}
                rows={1}
                className={cn(
                  "w-full resize-none bg-transparent px-4 pb-12 text-[16px] md:text-base placeholder:text-muted-foreground/50 focus:outline-none min-h-[52px] max-h-[200px]",
                  files && files.length > 0 ? "pt-2" : "pt-3"
                )}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e);
                  }
                }}
              />
              <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <ModelSelector selectedModel={selectedModel} onModelChange={setSelectedModel} />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
                    onClick={() => fileInputRef.current?.click()}
                    title="Attach files"
                  >
                    <PaperclipIcon className="h-4 w-4" />
                  </Button>
                </div>
                <Button
                  type="submit"
                  size="icon"
                  className={cn(
                    "h-8 w-8 rounded-lg transition-all duration-200",
                    (input.trim() || files?.length)
                      ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm" 
                      : "bg-muted text-muted-foreground cursor-not-allowed"
                  )}
                  disabled={!input.trim() && !files?.length}
                >
                  <ArrowUpIcon className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </form>
        </div>
      )}

      {!hasMessages && (
        <footer className="pb-8 text-center animate-fade-in" style={{ animationDelay: '200ms' }}>
          <p className="text-xs md:text-sm text-muted-foreground">
            Powered by{" "}
            <a
              href="https://trynia.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4 hover:text-foreground transition-colors"
            >
              Nia
            </a>
            {" "}(
            <a
              href="https://nozomio.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4 hover:text-foreground transition-colors"
            >
              Nozomio Labs
            </a>
            )
          </p>
        </footer>
      )}
    </div>
    </>
  );
}
