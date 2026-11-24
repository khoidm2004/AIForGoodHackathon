import { useState } from "react";
import { Sparkles, PanelLeft, Copy, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./dialog";

export const ONBOARDING_STORAGE_KEY = "privacyguard_onboarding_dismissed";

const SAMPLE_MESSAGE = `Hello, my name is Daniel Mercer, and I currently live at 42 Willowbrook Street, Helsinki. My phone number is +358 40 123 9876, and my email is daniel.mercer@example.com. I was born on 14 March 1998, although honestly, I always forget whether my birthday falls on a Wednesday or Thursday.

Anyway, moving on to something more important. Our small technology company, NovaTech Solutions, has been developing an AI-powered document management platform since January 2026. The main objective is to help businesses automatically classify documents, extract relevant information, and identify potential security risks.

Last Tuesday, we had an unexpected meeting with three investors, two of whom arrived late because of traffic. Someone ordered four coffees, one tea, and a rather expensive chocolate cake. During the meeting, we agreed on three major priorities:

1. Improve document-processing accuracy to at least 95%.
2. Implement end-to-end encryption to protect sensitive customer information.
3. Launch the first public beta version before March 2027.

There was also some discussion about changing the company logo from blue to orange, but nobody could remember who originally suggested it. Sarah mentioned that the development team currently has seven members, while Michael believes we should hire two additional backend developers. Oh, and the office printer is still broken.

One more thing: the project currently stores customer documents in an Azure cloud environment, and the team plans to introduce automated backups and role-based access control next month.

Considering the project priorities, security requirements, and planned beta release, which three major improvements should the development team prioritize before launching the public beta?`;

function SampleMessageField() {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(SAMPLE_MESSAGE);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable (e.g. insecure context) — nothing to recover.
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-foreground">
          Not sure what to ask? Try this sample message:
        </p>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {copied ? <Check className="size-3.5 text-green-600 dark:text-green-400" /> : <Copy className="size-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <textarea
        readOnly
        value={SAMPLE_MESSAGE}
        rows={4}
        onFocus={(e) => e.currentTarget.select()}
        className="w-full resize-none rounded-xl border border-border bg-input-background px-3 py-2 text-xs leading-relaxed text-muted-foreground outline-none focus:ring-2 focus:ring-primary/20"
      />
    </div>
  );
}

interface InstructionModalProps {
  open: boolean;
  onDismiss: () => void;
}

export function InstructionModal({ open, onDismiss }: InstructionModalProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onDismiss(); }}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
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

          <SampleMessageField />
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
