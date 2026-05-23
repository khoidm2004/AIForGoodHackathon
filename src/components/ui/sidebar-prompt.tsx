import type { Message } from "../../pages/chatbot";
import { useRef, useEffect } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarFooter,
} from "./sidebar";

interface AppSidebarProps {
  messages: Message[];
}

export function AppSidebar({ messages }: AppSidebarProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  // Lọc tất cả các tin nhắn assistant có simplifiedMessage (không null)
  const simplifiedMessages = messages.filter(
    (msg) => msg.role === "assistant" && msg.simplifiedMessage != null
  );

  // Theo dõi sự kiện scroll của container để biết người dùng có đang ở cuối không
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

  // Tự động cuộn xuống cuối khi có tin nhắn mới (nếu người dùng đang ở gần cuối)
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
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-3 py-4 max-h-[calc(100vh-120px)]"
          >
            {simplifiedMessages.length === 0 ? (
              <div className="text-center text-muted-foreground text-sm py-8">
                No simplify context yet. Send a message to see simplify text.
              </div>
            ) : (
              <div className="space-y-4">
                {simplifiedMessages.map((msg, idx) => (
                  <div key={idx} className="flex justify-start">
                    <div className="px-4 py-3 rounded-2xl rounded-bl-sm bg-card border border-border max-w-full">
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">
                        {msg.simplifiedMessage}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {msg.timestamp.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))}
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