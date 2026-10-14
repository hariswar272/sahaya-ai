import { createContext, useContext, type ReactNode } from "react";

/**
 * The website UI is always English. The AI *voice* language is separate:
 * Telugu is live today; the other Indian languages are on the roadmap.
 */
export type Lang = "en" | "hi" | "te" | "ta" | "kn" | "ml" | "mr" | "bn" | "gu" | "pa" | "od";

export const LANGS: { code: Lang; native: string; english: string }[] = [
  { code: "te", native: "తెలుగు", english: "Telugu" },
  { code: "hi", native: "हिन्दी", english: "Hindi" },
  { code: "ta", native: "தமிழ்", english: "Tamil" },
  { code: "kn", native: "ಕನ್ನಡ", english: "Kannada" },
  { code: "ml", native: "മലയാളം", english: "Malayalam" },
  { code: "mr", native: "मराठी", english: "Marathi" },
  { code: "bn", native: "বাংলা", english: "Bengali" },
  { code: "gu", native: "ગુજરાતી", english: "Gujarati" },
  { code: "pa", native: "ਪੰਜਾਬੀ", english: "Punjabi" },
  { code: "od", native: "ଓଡ଼ିଆ", english: "Odia" },
  { code: "en", native: "English", english: "English" },
];

/** Voice languages the agent speaks today. */
export const LIVE_VOICE_LANGS: Lang[] = ["te"];
export const VOICE_LANG: Lang = "te";

type LangCtx = {
  /** UI language: always "en". */
  lang: Lang;
  /** AI voice language: "te". */
  voiceLang: Lang;
  setLang: (l: Lang) => void;
  toggle: () => void;
  /** UI copy: always the English string. */
  t: (te: string, en: string) => string;
  /** UI copy: identity (UI is English-only). */
  tr: (en: string) => string;
};

const value: LangCtx = {
  lang: "en",
  voiceLang: VOICE_LANG,
  setLang: () => {},
  toggle: () => {},
  t: (_te, en) => en,
  tr: (en) => en,
};

const Ctx = createContext<LangCtx>(value);

export function LangProvider({ children }: { children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLang() {
  return useContext(Ctx);
}
