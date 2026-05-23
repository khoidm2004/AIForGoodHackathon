import { create } from 'zustand';

interface ChatState {
  simplifiedMessage: string | null;   // keep your naming
  setSimplifiedMessage: (text: string | null) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  simplifiedMessage: null,
  setSimplifiedMessage: (text) => set({ simplifiedMessage: text }),
}));