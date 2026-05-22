import { useState, useRef, useEffect } from "react";
import { Send, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

// Sidebar imports
import { SidebarProvider, SidebarTrigger } from "../components/ui/sidebar";
import { AppSidebar } from "../components/ui/sidebar-prompt";

interface Message {
  id: string;
  content: string;
  role: "user" | "assistant";
  timestamp: Date;
}

export default function Chatbot() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  // Auto‑resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const simulateTyping = (text: string): Promise<void> => {
    return new Promise((resolve) => {
      const words = text.split(" ");
      let currentText = "";
      let wordIndex = 0;

      const intervalId = setInterval(() => {
        if (wordIndex < words.length) {
          currentText += (wordIndex > 0 ? " " : "") + words[wordIndex];
          setMessages((prev) => {
            const newMessages = [...prev];
            const lastMessage = newMessages[newMessages.length - 1];
            if (lastMessage && lastMessage.role === "assistant") {
              lastMessage.content = currentText;
            }
            return newMessages;
          });
          wordIndex++;
        } else {
          clearInterval(intervalId);
          resolve();
        }
      }, 50);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isTyping) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: input.trim(),
      role: "user",
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsTyping(true);

    setTimeout(async () => {
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: "",
        role: "assistant",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);

      const responses = [
        "That's a great question! Let me help you with that. Based on what you've shared, I'd recommend exploring a few different approaches to find what works best for your specific situation.",
        "I understand what you're asking. This is definitely something worth exploring in more detail. Let me break this down into a few key points that might be helpful for you.",
        "Thanks for sharing that with me. I can see why you'd be curious about this. Here's what I know that might be relevant to your question.",
        "Interesting! This touches on a few different aspects. Let me provide some insights that could help guide you in the right direction.",
      ];

      const randomResponse = responses[Math.floor(Math.random() * responses.length)];
      await simulateTyping(randomResponse);
      setIsTyping(false);
    }, 800);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full bg-background">
        <AppSidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <header className="sticky top-0 z-10 flex items-center justify-between px-8 py-5 border-b border-border bg-card">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-full bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center shadow-lg shadow-primary/20">
                <Sparkles className="size-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-lg font-semibold">AI Assistant</h1>
                <p className="text-sm text-muted-foreground">Always here to help</p>
              </div>
            </div>
            <SidebarTrigger />
          </header>

          <div className="flex-1 overflow-y-auto px-8 py-6">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center px-4">
                <div className="size-20 rounded-full bg-gradient-to-br from-primary/10 to-blue-600/10 flex items-center justify-center mb-6">
                  <Sparkles className="size-10 text-primary" />
                </div>
                <h2 className="text-2xl font-semibold mb-3">How can I help you today?</h2>
                <p className="text-muted-foreground max-w-md">
                  Ask me anything, and I'll do my best to provide helpful and accurate information.
                </p>
                <div className="grid grid-cols-2 gap-3 mt-8 max-w-2xl">
                  {[
                    "Explain quantum computing",
                    "Tips for productivity",
                    "Recipe for pasta carbonara",
                    "Learn a new language",
                  ].map((suggestion, idx) => (
                    <button
                      key={idx}
                      onClick={() => setInput(suggestion)}
                      className="px-4 py-3 rounded-xl border border-border bg-card hover:bg-accent transition-colors text-sm text-left group"
                    >
                      <span className="text-foreground group-hover:text-accent-foreground">
                        {suggestion}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-6 mx-auto">
                <AnimatePresence initial={false}>
                  {messages.map((message) => (
                    <motion.div
                      key={message.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className={`flex gap-4 ${
                        message.role === "user" ? "justify-end" : "justify-start"
                      }`}
                    >
                      {message.role === "assistant" && (
                        <div className="size-8 rounded-full bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center flex-shrink-0 shadow-md shadow-primary/20">
                          <Sparkles className="size-4 text-primary-foreground" />
                        </div>
                      )}
                      <div
                        className={`px-5 py-3 rounded-2xl max-w-[80%] ${
                          message.role === "user"
                            ? "bg-primary text-primary-foreground rounded-br-sm"
                            : "bg-card border border-border rounded-bl-sm"
                        }`}
                      >
                        <p className="text-[15px] leading-relaxed whitespace-pre-wrap">
                          {message.content}
                        </p>
                      </div>
                      {message.role === "user" && (
                        <div className="size-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0 text-sm font-medium">
                          You
                        </div>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>

                {isTyping && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex gap-4 justify-start"
                  >
                    <div className="size-8 rounded-full bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center flex-shrink-0 shadow-md shadow-primary/20">
                      <Sparkles className="size-4 text-primary-foreground" />
                    </div>
                    <div className="px-5 py-3 rounded-2xl rounded-bl-sm bg-card border border-border">
                      <div className="flex gap-1.5">
                        {[0, 1, 2].map((i) => (
                          <motion.div
                            key={i}
                            className="size-2 rounded-full bg-muted-foreground/40"
                            animate={{
                              scale: [1, 1.3, 1],
                              opacity: [0.4, 1, 0.4],
                            }}
                            transition={{
                              duration: 1,
                              repeat: Infinity,
                              delay: i * 0.15,
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          <div className="px-8 py-6 border-t border-border bg-card">
            <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
              <div className="relative flex items-center gap-3 bg-input-background border border-border rounded-2xl px-4 py-3 focus-within:ring-2 focus-within:ring-primary/20 transition-shadow">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type your message..."
                  rows={1}
                  className="flex-1 resize-none bg-transparent outline-none placeholder:text-muted-foreground max-h-[200px] min-h-[24px]"
                  disabled={isTyping}
                />
                <button
                  type="submit"
                  disabled={!input.trim() || isTyping}
                  className="size-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center transition-all hover:scale-105 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 shadow-lg shadow-primary/20"
                >
                  <Send className="size-5" />
                </button>
              </div>
              <p className="text-xs text-muted-foreground text-center mt-3">
                Press Enter to send, Shift + Enter for new line
              </p>
            </form>
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}