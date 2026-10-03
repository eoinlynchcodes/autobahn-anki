import type { Card, Deck } from "@/lib/types";

// "Grow with Claude": Claude reflects on a deck (its cards and how the
// learner's reviews are going), works out what they need to learn next and
// writes cards for it. A run is recursive: each round sees the deck as the
// previous round left it, including the cards that round added, and goes one
// level deeper. It bottoms out when Claude has nothing more to add.

export const DEFAULT_CARDS_PER_ROUND = 10;
export const MAX_CARDS_PER_ROUND = 20;
const MAX_FOCUS_LENGTH = 200;
const MAX_PREVIOUS_ROUNDS = 10;
const MAX_REFLECTION_LENGTH = 1500;
// Bigger decks are sampled for the prompt. Duplicates are still checked
// against every card in the deck.
const MAX_PROMPT_CARDS = 400;
const MAX_SIDE_LENGTH = 300;
const MAX_NOTES_LENGTH = 500;

export interface PreviousRound {
  reflection: string;
  cardIds: string[];
}

export interface GrowDeckRequest {
  deckId: string;
  focus: string;
  count: number;
  // The round being requested, counting from 1.
  round: number;
  previousRounds: (PreviousRound & { round: number })[];
}

export interface AddedCard {
  card: Card;
  reason: string;
}

export interface GrowDeckResponse {
  reflection: string;
  added: AddedCard[];
  // Suggestions dropped because the deck (or the round) already had them.
  duplicates: number;
}

export interface SuggestedCard {
  front: string;
  back: string;
  notes: string;
  reason: string;
}

// The card fields the reflection needs.
export type DeckCard = Pick<
  Card,
  "id" | "front" | "back" | "ease_factor" | "interval" | "repetitions" | "last_reviewed"
>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseGrowDeckRequest(body: unknown): GrowDeckRequest | null {
  if (typeof body !== "object" || body === null) return null;
  const { deckId, focus, count, previousRounds } = body as Record<string, unknown>;
  if (typeof deckId !== "string" || !UUID.test(deckId)) return null;

  const history = Array.isArray(previousRounds) ? previousRounds : [];
  const rounds = history.flatMap((entry, index) => {
    if (typeof entry !== "object" || entry === null) return [];
    const { reflection, cardIds } = entry as Record<string, unknown>;
    return [
      {
        round: index + 1,
        reflection:
          typeof reflection === "string"
            ? reflection.trim().slice(0, MAX_REFLECTION_LENGTH)
            : "",
        cardIds: Array.isArray(cardIds)
          ? cardIds
              .filter((id): id is string => typeof id === "string" && UUID.test(id))
              .slice(0, MAX_CARDS_PER_ROUND)
          : [],
      },
    ];
  });

  return {
    deckId,
    focus: typeof focus === "string" ? focus.trim().slice(0, MAX_FOCUS_LENGTH) : "",
    count:
      typeof count === "number" && Number.isFinite(count)
        ? Math.min(MAX_CARDS_PER_ROUND, Math.max(1, Math.round(count)))
        : DEFAULT_CARDS_PER_ROUND,
    round: history.length + 1,
    previousRounds: rounds.slice(-MAX_PREVIOUS_ROUNDS),
  };
}

export type CardStatus = "struggling" | "learning" | "known" | "new";

// SM-2 (see spaced-repetition.ts) resets repetitions to 0 when a review
// fails, and every "hard" or "again" pulls the ease factor down from 2.5.
const KNOWN_INTERVAL_DAYS = 21;
const STRUGGLING_EASE = 2.1;

export function cardStatus(
  card: Pick<Card, "ease_factor" | "interval" | "repetitions" | "last_reviewed">
): CardStatus {
  if (!card.last_reviewed) return "new";
  if (card.repetitions === 0) return "struggling";
  if (card.interval >= KNOWN_INTERVAL_DAYS) return "known";
  return card.ease_factor < STRUGGLING_EASE ? "struggling" : "learning";
}

// Picks the cards Claude sees. Small decks go in whole. Bigger ones keep
// what matters most for the reflection, in deck order.
export function selectPromptCards(
  cards: DeckCard[],
  addedThisRun: Set<string>,
  limit = MAX_PROMPT_CARDS
): DeckCard[] {
  if (cards.length <= limit) return cards;

  const chosen = new Set<string>();
  const take = (candidates: DeckCard[], max: number) => {
    for (const card of candidates) {
      if (max <= 0 || chosen.size >= limit) return;
      if (!chosen.has(card.id)) {
        chosen.add(card.id);
        max--;
      }
    }
  };

  // The cards earlier rounds added: this round builds on them.
  take(cards.filter((card) => addedThisRun.has(card.id)), limit);
  // The cards the learner finds hardest.
  take(
    cards
      .filter((card) => cardStatus(card) === "struggling")
      .sort((a, b) => a.ease_factor - b.ease_factor),
    Math.floor(limit * 0.4)
  );
  // The newest cards, which show where the learner is now.
  const newest = Math.floor(limit * 0.25);
  take(cards.slice(-newest).reverse(), newest);
  // An even spread over the rest, for a sense of what the deck covers.
  const rest = cards.filter((card) => !chosen.has(card.id));
  const room = limit - chosen.size;
  for (let i = 0; i < room; i++) {
    chosen.add(rest[Math.floor((i * rest.length) / room)].id);
  }

  return cards.filter((card) => chosen.has(card.id));
}

// Articles that can lead a card, so "der Bahnhof", "Bahnhof" and "bahnhof."
// count as the same card.
const LEADING_ARTICLES = new Set([
  "the", "a", "an", "to",
  "der", "die", "das", "den", "dem", "des",
  "ein", "eine", "einen", "einem", "einer", "eines",
  "le", "la", "les", "l", "un", "une",
  "el", "los", "las", "una",
  "il", "lo", "gli", "uno",
  "o", "os", "as", "um", "uma",
]);
const NOT_A_WORD = new RegExp("[^\\p{L}\\p{N}]+", "gu");

export function cardKey(text: string): string {
  const words = text
    .normalize("NFKC")
    .toLowerCase()
    .split(NOT_A_WORD)
    .filter(Boolean);
  if (words.length > 1 && LEADING_ARTICLES.has(words[0])) words.shift();
  return words.join(" ");
}

// Keeps the suggestions that are well formed and not already in the deck,
// up to `max` of them.
export function selectNewCards(
  suggestions: SuggestedCard[],
  deckCards: Pick<Card, "front">[],
  max: number
): { cards: SuggestedCard[]; duplicates: number } {
  const seen = new Set(deckCards.map((card) => cardKey(card.front)));
  const cards: SuggestedCard[] = [];
  let duplicates = 0;

  for (const suggestion of suggestions) {
    if (cards.length >= max) break;
    const front = suggestion.front.trim();
    const back = suggestion.back.trim();
    const key = cardKey(front);
    if (!key || !back || front.length > MAX_SIDE_LENGTH || back.length > MAX_SIDE_LENGTH) {
      continue;
    }
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);
    cards.push({
      front,
      back,
      notes: suggestion.notes.trim().slice(0, MAX_NOTES_LENGTH),
      reason: suggestion.reason.trim(),
    });
  }

  return { cards, duplicates };
}

export const GROWTH_SYSTEM_PROMPT = `You are the study coach in Autobahn Anki, a spaced-repetition flashcard app for language learners. You are given one of the learner's decks: its cards, grouped by how their reviews are going. Reflect on what this learner most needs to learn next, then write new flashcards for it. Your cards go straight into the deck.

Deciding what to add:
- Struggling cards come first. Work out why each one is hard (an unfamiliar word inside a phrase, a grammar pattern, an irregular form, a pair that is easy to confuse) and add cards for the smaller pieces underneath it, so the hard card gets easier.
- Known cards show what the learner is ready for. Add the natural next step: related high-frequency words, the same pattern in a new context, a slightly harder construction.
- Look for gaps: essential vocabulary for the deck's topic that is missing, half of an obvious pair, a grammar point the cards lean on but never practise directly.
- If nothing has been reviewed yet, judge from the cards alone: their topic and level, and what someone learning them would need next.
- If the learner asked for a focus, put it first, but connect it to what the deck shows.
- A few well-chosen cards beat filler. If the deck already covers what this learner needs right now, return no cards and say so.

Writing the cards:
- Match the deck's existing cards: which language goes on which side, whether nouns carry their article, capitalisation and punctuation, single words or phrases. If the deck shows no clear pattern, put the language being learned on the front and its meaning in the learner's language on the back.
- One idea per card, and keep each side short.
- Be accurate. Spelling, gender, plurals, conjugation and natural usage must be right, because the learner will memorise exactly what you write.
- Never add a card the deck already has, including the same word with or without its article.
- notes: one short line that helps during review, such as the plural and gender, an example sentence or a usage hint. Leave it empty when there is nothing useful to add.
- reason: one short sentence to the learner, in their language, on why this card helps now, naming the deck card it builds on when there is one.

The reflection: two to four sentences in the learner's language, addressed to them as "you". Say what the deck shows they know, where they are struggling, and what this round's cards target. Plain prose, no lists or headings.`;

export const GROWTH_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    reflection: {
      type: "string",
      description:
        "Two to four sentences to the learner: what they know, where they struggle, what these cards target.",
    },
    cards: {
      type: "array",
      description: "The new cards, most valuable first. Empty when nothing more is needed.",
      items: {
        type: "object",
        properties: {
          front: { type: "string" },
          back: { type: "string" },
          notes: {
            type: "string",
            description: "One short line to help during review, or empty.",
          },
          reason: {
            type: "string",
            description: "Why this card helps the learner now.",
          },
        },
        required: ["front", "back", "notes", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["reflection", "cards"],
  additionalProperties: false,
} as const;

const STATUS_HEADINGS: Record<CardStatus, string> = {
  struggling: "Struggling: failed their latest review or keep being marked hard, hardest first.",
  learning: "Learning: recalled, still on short intervals.",
  known: "Known: recalled at intervals of three weeks or more.",
  new: "Not reviewed yet.",
};

function languageName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

function oneLine(text: string, max = 150): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export function buildGrowthPrompt({
  deck,
  cards,
  focus,
  count,
  round,
  previousRounds,
}: {
  deck: Pick<Deck, "name" | "description" | "source_language" | "target_language">;
  cards: DeckCard[];
  focus: string;
  count: number;
  round: number;
  previousRounds: GrowDeckRequest["previousRounds"];
}): string {
  const lines = [
    `Deck: ${oneLine(deck.name)}`,
    ...(deck.description ? [`Description: ${oneLine(deck.description, 500)}`] : []),
    `The learner speaks ${languageName(deck.source_language)} and is learning ${languageName(deck.target_language)}.`,
    focus
      ? `The learner wants to focus on: ${focus}`
      : "The learner gave no focus, so decide what matters most.",
    `Add up to ${count} new cards.`,
  ];

  const roundOfCard = new Map<string, number>();
  for (const previous of previousRounds) {
    for (const id of previous.cardIds) roundOfCard.set(id, previous.round);
  }

  if (round > 1) {
    lines.push(
      "",
      `This is round ${round} of a recursive pass over the deck: each round reflects on the deck as the round before left it. Your reflections so far:`,
      ...previousRounds.map(
        (previous) => `Round ${previous.round}: ${oneLine(previous.reflection, MAX_REFLECTION_LENGTH)}`
      ),
      "The cards those rounds added are marked [added in round N] below and are part of the deck now. Go one level deeper rather than repeating earlier ideas: break down what the newly added cards themselves depend on, or build on what they open up. If nothing valuable is left to add at this depth, return no cards."
    );
  }

  if (cards.length === 0) {
    lines.push("", "The deck has no cards yet. Start it with the most useful cards for its name and topic.");
    return lines.join("\n");
  }

  const counts: Record<CardStatus, number> = { struggling: 0, learning: 0, known: 0, new: 0 };
  for (const card of cards) counts[cardStatus(card)]++;
  const shown = selectPromptCards(cards, new Set(roundOfCard.keys()));
  lines.push(
    "",
    `The deck has ${cards.length} cards: ${counts.struggling} struggling, ${counts.learning} learning, ${counts.known} known and ${counts.new} not reviewed yet.` +
      (shown.length < cards.length
        ? ` Below are ${shown.length} of them: the cards added in this pass, the hardest struggling cards, the newest cards and an even spread of the rest.`
        : "")
  );

  for (const status of ["struggling", "learning", "known", "new"] as const) {
    const group = shown.filter((card) => cardStatus(card) === status);
    if (group.length === 0) continue;
    if (status === "struggling") group.sort((a, b) => a.ease_factor - b.ease_factor);
    lines.push("", STATUS_HEADINGS[status]);
    for (const card of group) {
      const addedIn = roundOfCard.get(card.id);
      lines.push(
        `- ${oneLine(card.front)} → ${oneLine(card.back)}${addedIn ? ` [added in round ${addedIn}]` : ""}`
      );
    }
  }

  return lines.join("\n");
}
