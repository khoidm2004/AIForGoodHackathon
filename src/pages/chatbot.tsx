import { useState, useRef, useEffect } from "react";
import { Send, Sparkles, Shield, Lock, Sun, Moon, Info } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { SidebarProvider } from "../components/ui/sidebar";
import { AppSidebar } from "../components/ui/sidebar-prompt";
import { useTheme } from "../components/ui/theme";
import { runPipeline } from "../services/api";
import { useSidebar } from "../components/ui/sidebar";
import { ChevronRight } from "lucide-react";

export interface Message {
  content: string;
  role: "user" | "assistant";
  timestamp: Date;
  simplify?: "low" | "medium" | "high";
  simplifiedMessage?: string | null;   // thêm trường này
}

function MobileOpenButton() {
  const { isMobile, openMobile, toggleSidebar } = useSidebar();
  if (!isMobile || openMobile) return null;

  return (
    <button
      onClick={toggleSidebar}
      className="fixed top-1/2 -translate-y-1/2 left-[-10px] z-30 flex items-center justify-center size-8 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:scale-110 transition-all duration-200 cursor-pointer"
      aria-label="Open Sidebar"
    >
      <ChevronRight className="size-4" />
    </button>
  );
}

export default function Chatbot() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [simplify, setSimplify] = useState<"low" | "medium" | "high">("medium");
  const { darkMode, toggleTheme } = useTheme();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  // Hiệu ứng gõ chữ
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
      content: input.trim(),
      role: "user",
      timestamp: new Date(),
      simplify: simplify,
    };

    setMessages((prev) => [...prev, userMessage]);
    const userInput = input.trim();
    setInput("");
    setIsTyping(true);

    try {
      const data = await runPipeline(userInput, simplify);
      if (data.result?.status === "approved") {
        const assistantAnswer = data.result.answer;
        const assistantMessage: Message = {
          content: "",
          role: "assistant",
          timestamp: new Date(),
          simplifiedMessage: data.result.simplifiedMessage ?? null,   // lưu trực tiếp vào message
        };
        setMessages((prev) => [...prev, assistantMessage]);
        await simulateTyping(assistantAnswer);
      } else {
        const errorMsg = "Sorry, I couldn't process your request. Please try again with a different query or check back later.";
        const assistantMessage: Message = {
          content: "",
          role: "assistant",
          timestamp: new Date(),
          simplifiedMessage: null,
        };
        setMessages((prev) => [...prev, assistantMessage]);
        await simulateTyping(errorMsg);
      }
    } catch (error) {
      const errorMessage = "Sorry, I'm having trouble responding right now. Please try again later.";
      const assistantMessage: Message = {
        content: "",
        role: "assistant",
        timestamp: new Date(),
        simplifiedMessage: null,
      };
      setMessages((prev) => [...prev, assistantMessage]);
      await simulateTyping(errorMessage);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <SidebarProvider defaultOpen={false}>
      <div className="flex h-screen w-full bg-background">
        <AppSidebar messages={messages} />
        <MobileOpenButton />
        <div className="flex flex-1 flex-col overflow-hidden">
          <header className="sticky top-0 z-10 flex items-center justify-between px-8 py-5 border-b border-border bg-card rounded-b-lg rounded-t-lg">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-full bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center shadow-lg shadow-primary/20">
                <Sparkles className="size-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-lg font-semibold">AI Assistant</h1>
                <p className="text-sm text-muted-foreground">Always here to help</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={toggleTheme}
                className="p-2 rounded-full bg-secondary/50 hover:bg-secondary transition-colors"
                aria-label="Toggle dark mode"
              >
                {darkMode ? (
                  <Sun className="size-5 text-foreground" />
                ) : (
                  <Moon className="size-5 text-foreground" />
                )}
              </button>
            </div>
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
                <div className="hidden min-[651px]:grid grid-cols-2 gap-3 mt-8 max-w-2xl">
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
                  {messages.map((message, idx) => (
                    <motion.div
                      key={`${message.timestamp.getTime()}-${idx}`}
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
                        {message.role === "user" && message.simplify && (
                          <div className="mt-1 text-[10px] opacity-70 flex items-center gap-1">
                            {message.simplify === "low" && <Info className="size-3" />}
                            {message.simplify === "medium" && <Shield className="size-3" />}
                            {message.simplify === "high" && <Lock className="size-3" />}
                            <span>
                              {message.simplify === "low" && "Low mode"}
                              {message.simplify === "medium" && "Medium mode"}
                              {message.simplify === "high" && "High mode"}
                            </span>
                          </div>
                        )}
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

          <div className="px-8 py-6 border-t border-border bg-card rounded-t-lg rounded-b-lg">
            <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
              <div className="relative flex items-center gap-6 bg-input-background border border-border rounded-2xl px-4 py-3 focus-within:ring-2 focus-within:ring-primary/20 transition-shadow">
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

              <div className="flex gap-3 mt-2 justify-start">
                <button
                  type="button"
                  onClick={() => setSimplify("low")}
                  disabled={isTyping}
                  className={`px-3 py-1.5 text-sm rounded-full border transition-all flex items-center gap-1.5 ${
                    simplify === "low"
                      ? "bg-green-500/10 border-green-500 text-green-600 shadow-sm"
                      : "bg-card border-border text-muted-foreground hover:bg-accent"
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <Info className="size-3.5" />
                  Low
                </button>
                <button
                  type="button"
                  onClick={() => setSimplify("medium")}
                  disabled={isTyping}
                  className={`px-3 py-1.5 text-sm rounded-full border transition-all flex items-center gap-1.5 ${
                    simplify === "medium"
                      ? "bg-yellow-500/10 border-yellow-500 text-yellow-600 shadow-sm"
                      : "bg-card border-border text-muted-foreground hover:bg-accent"
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <Shield className="size-3.5" />
                  Medium
                </button>
                <button
                  type="button"
                  onClick={() => setSimplify("high")}
                  disabled={isTyping}
                  className={`px-3 py-1.5 text-sm rounded-full border transition-all flex items-center gap-1.5 ${
                    simplify === "high"
                      ? "bg-red-500/10 border-red-500 text-red-600 shadow-sm"
                      : "bg-card border-border text-muted-foreground hover:bg-accent"
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <Lock className="size-3.5" />
                  High
                </button>
              </div>

              <p className="hidden min-[651px]:block text-xs text-muted-foreground text-center mt-3">
                Press Enter to send, Shift + Enter for new line
              </p>
            </form>
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}