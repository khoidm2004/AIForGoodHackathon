// sidebar-prompt.tsx
import { useState, useEffect, useRef } from "react";
import { motion } from "motion/react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarFooter,
} from "./sidebar";

export function AppSidebar() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        // Replace with your actual API endpoint
        const response = await fetch("/api/sidebar-data");
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();

        // Kiểm tra success và status theo cấu trúc API đã cho
        if (data.success && data.data?.result?.status === "approved") {
          setAnswer(data.data.result.answer);
        } else {
          setError("Invalid response: not approved or missing data");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch data");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [answer, loading, error]);

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
          <SidebarGroupLabel>Application</SidebarGroupLabel>
          <div className="flex-1 overflow-y-auto px-3 py-4">
            {loading ? (
              <div className="text-center text-muted-foreground text-sm py-8">
                Loading...
              </div>
            ) : error ? (
              <div className="text-center text-destructive text-sm py-8">
                Error: {error}
              </div>
            ) : answer ? (
              <div className="space-y-4">
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className="flex justify-start"
                >
                  <div className="px-4 py-3 rounded-2xl rounded-bl-sm bg-card border border-border max-w-full">
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">
                      {answer}
                    </p>
                  </div>
                </motion.div>
                <div ref={messagesEndRef} />
              </div>
            ) : (
              <div className="text-center text-muted-foreground text-sm py-8">
                No response available
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