import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
// Remove unused User import
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarFooter,
} from "./sidebar";

interface AIResponse {
  id: string;
  content: string;
  timestamp: Date;
}

let responsesHistory: AIResponse[] = [];
let listeners: ((responses: AIResponse[]) => void)[] = [];
let currentTypingId: string | null = null;

export const addAIResponse = (content: string) => {
  if (content.length === 0) return;
  
  // If we're currently typing a response, update it
  if (currentTypingId) {
    responsesHistory = responsesHistory.map(response => 
      response.id === currentTypingId 
        ? { ...response, content }
        : response
    );
  } else {
    // Start a new response
    const newId = Date.now().toString();
    currentTypingId = newId;
    responsesHistory = [
      ...responsesHistory,
      {
        id: newId,
        content,
        timestamp: new Date(),
      }
    ];
  }
  
  listeners.forEach(listener => listener([...responsesHistory]));
};

export const finishAIResponse = () => {
  // Mark the current typing response as complete
  if (currentTypingId) {
    // Ensure the final content is saved with a fresh timestamp
    responsesHistory = responsesHistory.map(response => 
      response.id === currentTypingId 
        ? { ...response, timestamp: new Date() }
        : response
    );
    currentTypingId = null;
    listeners.forEach(listener => listener([...responsesHistory]));
  }
};

export const useSidebarAI = () => {
  const [responses, setResponses] = useState<AIResponse[]>(responsesHistory);
  
  useEffect(() => {
    listeners.push(setResponses);
    return () => {
      listeners = listeners.filter(l => l !== setResponses);
    };
  }, []);
  
  return responses;
};

export function AppSidebar() {
  const responses = useSidebarAI();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [responses]);

  return (
    <Sidebar side="left" variant="floating" collapsible="offcanvas" className="w-[320px] min-w-[320px] [&_.w-\\[--sidebar-width\\]]:!w-[320px]" style={{ "--sidebar-width": "320px" } as React.CSSProperties}>
      <SidebarContent className="bg-background">
        <SidebarGroup>
          <SidebarGroupLabel>Application</SidebarGroupLabel>
          <div className="flex-1 overflow-y-auto px-3 py-4">
            {responses.length === 0 ? (
              <div className="text-center text-muted-foreground text-sm py-8">
                No responses yet
              </div>
            ) : (
              <div className="space-y-4">
                <AnimatePresence initial={false}>
                  {responses.map((response) => (  // Remove unused 'idx' parameter
                    <motion.div
                      key={response.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="flex justify-start"
                    >
                      <div className="px-4 py-3 rounded-2xl rounded-bl-sm bg-card border border-border max-w-full">
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">
                          {response.content}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(response.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
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
