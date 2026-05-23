// sidebar-prompt.tsx
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
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

// TODO: Các biến toàn cục và hàm addAIResponse/finishAIResponse hiện đang dùng để mô phỏng
// phản hồi từ main chat. Nếu muốn sidebar nhận dữ liệu từ một API riêng (khác với API chat chính),
// cần thay thế cơ chế này:
// - Gọi API riêng (ví dụ: GET /api/sidebar-responses hoặc WebSocket) để lấy lịch sử và các phản hồi mới.
// - Khi có dữ liệu mới từ API đó, gọi một hàm tương tự addAIResponse nhưng lấy dữ liệu thật.
// - Hook useSidebarAI có thể được sửa để fetch initial data từ API và subscribe vào các sự kiện realtime.
let responsesHistory: AIResponse[] = [];
let listeners: ((responses: AIResponse[]) => void)[] = [];
let currentTypingId: string | null = null;

export const addAIResponse = (content: string) => {
  if (content.length === 0) return;
  
  if (currentTypingId) {
    responsesHistory = responsesHistory.map(response => 
      response.id === currentTypingId 
        ? { ...response, content }
        : response
    );
  } else {
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
  if (currentTypingId) {
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
    // TODO: Nếu dùng API riêng, có thể gọi fetch ở đây để tải lịch sử ban đầu,
    // và thiết lập kết nối (SSE, WebSocket) để nhận phản hồi mới từ API đó.
    // Khi nhận được mỗi chunk hoặc mỗi phản hồi hoàn chỉnh, gọi addAIResponse tương ứng.
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
                  {responses.map((response) => (
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