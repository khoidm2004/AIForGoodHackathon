import { useChatStore } from "../../stores/chatStore";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarFooter,
} from "./sidebar";

export function AppSidebar() {
  const simplifiedMessage = useChatStore((state) => state.simplifiedMessage);

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
          <SidebarGroupLabel>Simplify Text</SidebarGroupLabel>
          <div className="flex-1 overflow-y-auto px-3 py-4">
            {simplifiedMessage ? (
              <div className="space-y-4">
                <div className="flex justify-start">
                  <div className="px-4 py-3 rounded-2xl rounded-bl-sm bg-card border border-border max-w-full">
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">
                      {simplifiedMessage}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center text-muted-foreground text-sm py-8">
                No simplify context yet. Send a message to see simplify text.
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