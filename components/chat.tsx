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

  const { messages, error, sendMessage, regenerate, setMessages, stop, status } = useChat();

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
    if (!input.trim()) return;
    sendMessage({ text: input }, { body: { model: selectedModel } });
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
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
            href="https://github.com/nozomio-labs/epstein-files"
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
                  <textarea
                    ref={textareaRef}
                    name="prompt"
                    placeholder="Who visited Little St. James Island in 2005?"
                    onChange={(e) => setInput(e.target.value)}
                    value={input}
                    autoFocus
                    rows={1}
                    className="w-full resize-none bg-transparent px-4 pt-4 pb-14 text-[16px] md:text-base placeholder:text-muted-foreground/50 focus:outline-none min-h-[56px] max-h-[200px]"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSubmit(e);
                      }
                    }}
                  />
                  <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
                    <ModelSelector selectedModel={selectedModel} onModelChange={setSelectedModel} />
                    <Button
                      type="submit"
                      size="icon"
                      className={cn(
                        "h-8 w-8 rounded-lg transition-all duration-200",
                        input.trim() 
                          ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm" 
                          : "bg-muted text-muted-foreground cursor-not-allowed"
                      )}
                      disabled={!input.trim()}
                    >
                      <ArrowUpIcon className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </form>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 md:gap-3 text-xs md:text-sm animate-slide-up" style={{ animationDelay: '150ms' }}>
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
              <button
                onClick={() => {
                  setInput("What documents exist from court proceedings?");
                }}
                className="p-3 rounded-xl text-left text-muted-foreground hover:text-foreground active:bg-muted/70 hover:bg-muted/50 transition-colors"
              >
                &ldquo;Court proceeding documents?&rdquo;
              </button>
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
                  {m.parts.map((part, i) => {
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
          <Alert variant="destructive" className="flex flex-col items-end">
            <div className="flex flex-row gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <AlertDescription className="dark:text-red-400 text-red-600">
                {error.message || "An error occurred while generating the response."}
              </AlertDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="ml-auto transition-all duration-150 ease-out hover:scale-105"
              onClick={() => regenerate()}
            >
              Retry
            </Button>
          </Alert>
        </div>
      )}

      {hasMessages && (
        <div className="w-full max-w-4xl mx-auto px-4 md:px-8 pb-4 md:pb-6 pt-2">
          <form onSubmit={handleSubmit}>
            <div className="relative rounded-2xl bg-muted/50 dark:bg-muted/30 border border-border/50 shadow-sm hover:shadow-md focus-within:shadow-md focus-within:border-border transition-all duration-200">
              <textarea
                ref={textareaRef}
                name="prompt"
                placeholder="Ask a follow-up question..."
                onChange={(e) => setInput(e.target.value)}
                value={input}
                rows={1}
                className="w-full resize-none bg-transparent px-4 pt-3 pb-12 text-[16px] md:text-base placeholder:text-muted-foreground/50 focus:outline-none min-h-[52px] max-h-[200px]"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e);
                  }
                }}
              />
              <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
                <ModelSelector selectedModel={selectedModel} onModelChange={setSelectedModel} />
                <Button
                  type="submit"
                  size="icon"
                  className={cn(
                    "h-8 w-8 rounded-lg transition-all duration-200",
                    input.trim() 
                      ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm" 
                      : "bg-muted text-muted-foreground cursor-not-allowed"
                  )}
                  disabled={!input.trim()}
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
