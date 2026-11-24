import { Sparkles, PanelLeft } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./dialog";

export const ONBOARDING_STORAGE_KEY = "privacyguard_onboarding_dismissed";

interface InstructionModalProps {
  open: boolean;
  onDismiss: () => void;
}

export function InstructionModal({ open, onDismiss }: InstructionModalProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onDismiss(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="size-12 rounded-full bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center shadow-lg shadow-primary/20 mb-1">
            <Sparkles className="size-6 text-primary-foreground" />
          </div>
          <DialogTitle>Welcome to PrivacyGuard</DialogTitle>
          <DialogDescription>
            Your message passes through a privacy pipeline before the AI ever answers it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm text-muted-foreground">
          <p>
            Pick a privacy level —{" "}
            <span className="font-medium text-green-600 dark:text-green-400">Low</span>,{" "}
            <span className="font-medium text-yellow-600 dark:text-yellow-400">Medium</span>, or{" "}
            <span className="font-medium text-red-600 dark:text-red-400">High</span> — and your
            message is masked, compressed, and reviewed by a chain of agents before it's
            answered.
          </p>

          <div className="flex items-start gap-2.5 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5">
            <PanelLeft className="size-4 mt-0.5 shrink-0 text-primary" />
            <p>
              Open the <span className="font-medium text-foreground">sidebar</span> — the panel
              icon in the header, the arrow on the left edge (mobile), or{" "}
              <kbd className="px-1 py-0.5 rounded bg-secondary text-foreground text-xs">
                Ctrl/⌘ + B
              </kbd>{" "}
              — to watch each agent's work in{" "}
              <span className="font-medium text-foreground">Simplify History</span>: what was
              preprocessed, simplified, reviewed, and why.
            </p>
          </div>
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={onDismiss}
            className="w-full rounded-xl bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Got it
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
