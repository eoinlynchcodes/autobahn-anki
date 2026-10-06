import Anthropic from "@anthropic-ai/sdk";
import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// Writing a batch of cards can outlast the default function timeout
export const maxDuration = 60;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Most recent cards shown to Claude so new ones fit the deck without repeating it
const EXISTING_CARDS_LIMIT = 500;

const cardsFormat = jsonSchemaOutputFormat({
  type: "object",
  properties: {
    cards: {
      type: "array",
      items: {
        type: "object",
        properties: {
          front: { type: "string" },
          back: { type: "string" },
        },
        required: ["front", "back"],
        additionalProperties: false,
      },
    },
  },
  required: ["cards"],
  additionalProperties: false,
});

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { deckId, count } = await request.json();
  const cardCount = Math.min(Math.max(Math.floor(Number(count)) || 10, 1), 25);

  const { data: deck } = await supabase
    .from("decks")
    .select("*")
    .eq("id", deckId)
    .single();

  if (!deck) {
    return NextResponse.json({ error: "Deck not found" }, { status: 404 });
  }

  const { data: existingCards } = await supabase
    .from("cards")
    .select("front, back")
    .eq("deck_id", deck.id)
    .order("created_at", { ascending: false })
    .limit(EXISTING_CARDS_LIMIT);
  const existing: { front: string; back: string }[] = existingCards || [];

  const systemPrompt = `You write flashcards for a language learner. The user is learning ${deck.target_language} from ${deck.source_language}.
Cards should be accurate, natural, and worth studying.`;

  const userPrompt =
    existing.length > 0
      ? `Deck: ${deck.name}

These cards are already in the deck (front → back):
<existing_cards>
${existing.map((card) => `${card.front} → ${card.back}`).join("\n")}
</existing_cards>

Write ${cardCount} new cards for this deck. Match the existing cards' topic, difficulty, length, and style, including which language goes on the front. Don't repeat or lightly reword any existing card.`
      : `Deck: ${deck.name}

The deck has no cards yet. Write ${cardCount} cards that fit its name, with ${deck.target_language} on the front and ${deck.source_language} on the back.`;

  let generated: { front: string; back: string }[];
  try {
    const message = await anthropic.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      output_config: { effort: "low", format: cardsFormat },
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    if (message.stop_reason === "refusal" || !message.parsed_output) {
      return NextResponse.json(
        { error: "Claude couldn't write cards for this deck." },
        { status: 502 }
      );
    }
    generated = message.parsed_output.cards;
  } catch (error) {
    console.error("Claude API error:", error);
    if (error instanceof Anthropic.RateLimitError) {
      return NextResponse.json(
        { error: "Claude is busy right now. Try again in a minute." },
        { status: 429 }
      );
    }
    return NextResponse.json(
      { error: "Couldn't generate cards. Check your API key and try again." },
      { status: 500 }
    );
  }

  // Skip blanks and repeats of the cards Claude was shown (or of each other)
  const seen = new Set(existing.map((card) => card.front.trim().toLowerCase()));
  const newCards = [];
  for (const card of generated) {
    const front = card.front.trim();
    const back = card.back.trim();
    const key = front.toLowerCase();
    if (!front || !back || seen.has(key)) continue;
    seen.add(key);
    newCards.push({ deck_id: deck.id, user_id: user.id, front, back });
  }

  if (newCards.length === 0) {
    return NextResponse.json(
      { error: "Claude didn't come up with any new cards. Try again." },
      { status: 502 }
    );
  }

  const { data: inserted, error: insertError } = await supabase
    .from("cards")
    .insert(newCards)
    .select();

  if (insertError) {
    console.error("Card insert error:", insertError);
    return NextResponse.json({ error: "Failed to save cards" }, { status: 500 });
  }

  return NextResponse.json({ cards: inserted });
}
