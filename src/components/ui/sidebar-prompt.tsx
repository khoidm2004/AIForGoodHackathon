import type { Message } from "../../pages/chatbot";
import type { TraceEntry, TraceStage } from "../../services/api";
import type { LucideIcon } from "lucide-react";
import { useRef, useEffect, useState } from "react";
import {
  FileText,
  WandSparkles,
  ShieldCheck,
  Sparkles,
  CircleCheck,
  CircleX,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarFooter,
} from "./sidebar";

const STAGE_LABELS: Record<TraceStage, string> = {
  preprocess: "Preprocess",
  simplify: "Simplify",
  review: "Review",
  output: "Final output",
};

const STAGE_ICONS: Record<TraceStage, LucideIcon> = {
  preprocess: FileText,
  simplify: WandSparkles,
  review: ShieldCheck,
  output: Sparkles,
};

function TraceEntryRow({ entry }: { entry: TraceEntry }) {
  const StageIcon = STAGE_ICONS[entry.stage];
  return (
    <div className="py-1.5">
      <div className="flex items-center gap-1.5 flex-wrap text-xs font-medium text-foreground">
        <StageIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <span>{STAGE_LABELS[entry.stage]}</span>
        {entry.attempt !== undefined && (
          <span className="text-muted-foreground font-normal">Attempt {entry.attempt}</span>
        )}
        {entry.stage === "review" && entry.passed !== undefined && (
          <span
            className={
              entry.passed
                ? "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[10px] font-medium"
                : "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400 text-[10px] font-medium"
            }
          >
            {entry.passed ? <CircleCheck className="size-3" /> : <CircleX className="size-3" />}
            {entry.passed ? "Passed" : "Failed"}
          </span>
        )}
      </div>

      <p className="text-xs leading-relaxed whitespace-pre-wrap break-words text-muted-foreground mt-0.5">
        {entry.text}
      </p>

      {entry.stage === "review" && entry.similarityScore !== undefined && (
        <p className="text-xs text-muted-foreground mt-0.5">
          Similarity score: {entry.similarityScore}
        </p>
      )}

      {entry.stage === "review" && entry.reason !== undefined && (
        <p className="text-xs leading-relaxed whitespace-pre-wrap break-words text-muted-foreground italic mt-0.5">
          {entry.reason}
        </p>
      )}

      {entry.stage === "review" && entry.missingItems !== undefined && entry.missingItems.length > 0 && (
        <ul className="mt-0.5 list-disc list-inside space-y-0.5">
          {entry.missingItems.map((item, i) => (
            <li key={i} className="text-xs leading-relaxed break-words text-muted-foreground">
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface AppSidebarProps {
  messages: Message[];
}

export function AppSidebar({ messages }: AppSidebarProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);
  const [expandedKeys, setExpandedKeys] = useState<Set<number>>(() => new Set());

  const toggleTrace = (key: number) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Build list of assistant messages with their corresponding user message timestamps
  const simplifiedMessages = messages
    .filter(
      (msg) =>
        msg.role === "assistant" &&
        (msg.simplifiedMessage != null || (msg.trace?.length ?? 0) > 0)
    )
    .map((assistantMsg) => {
      // Find the user message that immediately precedes this assistant message
      const precedingUserMsg = messages
        .slice(0, messages.indexOf(assistantMsg))
        .reverse()
        .find((m) => m.role === "user");

      const displayTimestamp = precedingUserMsg
        ? precedingUserMsg.timestamp
        : assistantMsg.timestamp; // fallback (should never happen in normal flow)

      return {
        ...assistantMsg,
        displayTimestamp,
      };
    });

    useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 50;
      autoScrollRef.current = isNearBottom;
    };

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (autoScrollRef.current && scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [simplifiedMessages.length]);

  return (
    <Sidebar
      side="left"
      variant="floating"
      collapsible="offcanvas"
      className="w-[320px] min-w-[320px] [&_.w-\\[--sidebar-width\\]]:!w-[320px]"
      style={{ "--sidebar-width": "320px" } as React.CSSProperties}
    >
      <SidebarContent className="bg-background">
        <SidebarGroup>
          <SidebarGroupLabel>Simplify History</SidebarGroupLabel>
          <SidebarGroupContent className="flex flex-1 flex-col min-h-0">
            <div
              ref={scrollRef}
              className="flex-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden overflow-y-auto px-3 py-4 max-h-[calc(100vh-120px)]"
            >
              {simplifiedMessages.length === 0 ? (
                <div className="text-center text-muted-foreground text-sm py-8">
                  No simplify context yet. Send a message to see simplify text.
                </div>
              ) : (
                <div className="space-y-4">
                  {simplifiedMessages.map((msg) => {
                    const key = msg.timestamp.getTime();
                    const isExpanded = expandedKeys.has(key);
                    const traceCount = msg.trace?.length ?? 0;

                    return (
                      <div key={key} className="flex justify-start">
                        <div className="px-4 py-3 rounded-2xl rounded-bl-sm bg-card border border-border max-w-full w-full">
                          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                            {msg.simplifiedMessage ?? "No simplified result for this turn — see trace below."}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {msg.displayTimestamp.toLocaleTimeString("en-GB", {
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                            })}
                          </p>

                          {traceCount > 0 && (
                            <>
                              <button
                                type="button"
                                onClick={() => toggleTrace(key)}
                                aria-expanded={isExpanded}
                                className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                              >
                                {isExpanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                                {isExpanded ? "Hide trace" : `Show trace (${traceCount} steps)`}
                              </button>

                              {isExpanded && (
                                <div className="mt-2 border-l border-border pl-3 space-y-2">
                                  {msg.trace?.map((entry, i) => (
                                    <TraceEntryRow key={i} entry={entry} />
                                  ))}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-border bg-card p-4 rounded-t-lg rounded-b-lg">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="size-8 rounded-full bg-secondary flex items-center justify-center text-sm font-medium shadow-md">
              You
            </div>
            <div>
              <p className="text-sm font-medium">You</p>
            </div>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}