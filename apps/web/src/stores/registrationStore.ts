import { create } from 'zustand';

/**
 * Hasil kalkulasi harga dari API `POST /pricing/calculate`. Frontend hanya menampilkan, tidak menghitung.
 */
export interface CalculatedPrice {
  [key: string]: unknown;
}

interface RegistrationState {
  currentStep: number;
  paxCount: number;
  participantNames: string[];
  selectedAddons: Record<string, number>;
  promoCode: string | null;
  calculatedPrice: CalculatedPrice | null;
  setStep: (step: number) => void;
  setPaxCount: (count: number) => void;
  setParticipantNames: (names: string[]) => void;
  setAddonQty: (addonId: string, qty: number) => void;
  setPromoCode: (code: string | null) => void;
  setCalculatedPrice: (price: CalculatedPrice | null) => void;
  reset: () => void;
}

const initialState = {
  currentStep: 1,
  paxCount: 1,
  participantNames: [] as string[],
  selectedAddons: {} as Record<string, number>,
  promoCode: null as string | null,
  calculatedPrice: null as CalculatedPrice | null,
};

/**
 * Store state wizard registrasi 5 langkah. Ephemeral: reset saat refresh (TAD v1.6 Section 4.4).
 */
export const useRegistrationStore = create<RegistrationState>((set) => ({
  ...initialState,
  setStep: (currentStep) => set({ currentStep }),
  setPaxCount: (paxCount) => set({ paxCount }),
  setParticipantNames: (participantNames) => set({ participantNames }),
  setAddonQty: (addonId, qty) =>
    set((state) => {
      const next = { ...state.selectedAddons };
      if (qty <= 0) {
        delete next[addonId];
      } else {
        next[addonId] = qty;
      }
      return { selectedAddons: next };
    }),
  setPromoCode: (promoCode) => set({ promoCode }),
  setCalculatedPrice: (calculatedPrice) => set({ calculatedPrice }),
  reset: () => set({ ...initialState }),
}));
