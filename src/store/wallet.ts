import { create } from "zustand";

type WalletStore = {
  address: string | null;
  connecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
};

export const useWallet = create<WalletStore>((set) => ({
  address: null,
  connecting: false,
  connect: async () => {
    set({ connecting: true });
    try {
      const { isConnected, getPublicKey } = await import("@stellar/freighter-api");
      if (!(await isConnected())) throw new Error("Freighter not installed");
      const address = await getPublicKey();
      set({ address });
    } finally {
      set({ connecting: false });
    }
  },
  disconnect: () => set({ address: null }),
}));
