// Which language a card asks you about first.
// "target-first" shows the language you're learning (recognition: Hund → dog).
// "source-first" shows the language you speak (production: dog → Hund), which is
// harder and is what you need to actually speak.
// "mixed" picks one of the two for each card.
export type StudyDirection = "target-first" | "source-first" | "mixed";

export const STUDY_DIRECTIONS: StudyDirection[] = [
  "target-first",
  "source-first",
  "mixed",
];

export const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  de: "German",
  fr: "French",
  es: "Spanish",
  it: "Italian",
  pt: "Portuguese",
  ja: "Japanese",
  ko: "Korean",
  zh: "Chinese",
};

export function languageName(code: string): string {
  return LANGUAGE_NAMES[code] || code.toUpperCase();
}

// Words and letters that give a language away, for the languages decks can be
// created with. Only used to work out which side of a deck's cards is which.
const LATIN_HINTS: Record<string, { words: string[]; letters: RegExp }> = {
  en: {
    words: "the to of and is are i you it on for with this that my your do not what how where be have he she we they".split(" "),
    letters: /(?!)/g,
  },
  de: {
    words: "der die das den dem des und ist nicht ich du sie es ein eine einen mit zu auf für wir ihr sind haben auch sich mir mich dich kein keine wie wo bitte".split(" "),
    letters: /[äöüß]/g,
  },
  fr: {
    words: "le la les un une des et est je tu il elle nous vous de du pas que qui ce".split(" "),
    letters: /[éèêàçùœ]/g,
  },
  es: {
    words: "el la los las un una y es yo tú que de en no por para con".split(" "),
    letters: /[ñ¿¡áíóú]/g,
  },
  it: {
    words: "il lo la gli le un una e è che di non per con sono io".split(" "),
    letters: /[àèìòù]/g,
  },
  pt: {
    words: "o a os as um uma e é que de não com para eu você".split(" "),
    letters: /[ãõçâê]/g,
  },
};

const SCRIPT_HINTS: Record<string, RegExp> = {
  ja: /[぀-ヿ]/g,
  ko: /[가-힯]/g,
  zh: /[一-鿿]/g,
};

function languageScore(text: string, lang: string): number {
  const lower = text.toLowerCase();
  const script = SCRIPT_HINTS[lang];
  if (script) return Math.min(lower.match(script)?.length || 0, 3);

  const hints = LATIN_HINTS[lang];
  if (!hints) return 0;
  const words = lower.split(/[^\p{L}]+/u).filter(Boolean);
  const wordHits = words.filter((w) => hints.words.includes(w)).length;
  const letterHits = lower.match(hints.letters)?.length || 0;
  return wordHits + letterHits;
}

// The app puts the learned language on the front, but imported Anki decks
// don't always. Look at a sample of cards to see which way round this deck is.
export function frontIsTargetLanguage(
  cards: { front: string; back: string }[],
  targetLanguage: string,
  sourceLanguage: string
): boolean {
  let evidence = 0;
  for (const card of cards) {
    const frontLean =
      languageScore(card.front, targetLanguage) -
      languageScore(card.front, sourceLanguage);
    const backLean =
      languageScore(card.back, targetLanguage) -
      languageScore(card.back, sourceLanguage);
    evidence += frontLean - backLean;
  }
  // No signal either way: trust the app's convention
  return evidence >= 0;
}

// Small stable hash so a "mixed" card keeps its direction across re-renders
function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

// Should this card show its back first?
export function showBackFirst(
  direction: StudyDirection,
  frontIsTarget: boolean,
  cardId: string,
  position: number,
  seed: number
): boolean {
  const targetFirst =
    direction === "target-first" ||
    (direction === "mixed" && hash(`${seed}:${position}:${cardId}`) % 2 === 0);
  return targetFirst ? !frontIsTarget : frontIsTarget;
}

const DIRECTION_KEY = "autobahn-anki:study-direction";
const AUTO_SPEAK_KEY = "autobahn-anki:auto-speak";

// Browser storage can be missing or blocked; preferences are a convenience only
export function loadStudyPrefs(): {
  direction: StudyDirection;
  autoSpeak: boolean;
} {
  try {
    const stored = localStorage.getItem(DIRECTION_KEY) as StudyDirection | null;
    return {
      direction:
        stored && STUDY_DIRECTIONS.includes(stored) ? stored : "target-first",
      autoSpeak: localStorage.getItem(AUTO_SPEAK_KEY) === "1",
    };
  } catch {
    return { direction: "target-first", autoSpeak: false };
  }
}

export function saveStudyDirection(direction: StudyDirection) {
  try {
    localStorage.setItem(DIRECTION_KEY, direction);
  } catch {
    // Not saved; the choice still applies for this session
  }
}

export function saveAutoSpeak(on: boolean) {
  try {
    localStorage.setItem(AUTO_SPEAK_KEY, on ? "1" : "0");
  } catch {
    // Not saved; the choice still applies for this session
  }
}
