import Anthropic from "@anthropic-ai/sdk";
import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";
import { createClient } from "@/lib/supabase/server";
import {
  GROWTH_OUTPUT_SCHEMA,
  GROWTH_SYSTEM_PROMPT,
  buildGrowthPrompt,
  parseGrowDeckRequest,
  selectNewCards,
  type AddedCard,
  type DeckCard,
  type GrowDeckResponse,
} from "@/lib/deck-growth";
import { NextRequest, NextResponse } from "next/server";

// A round is one Claude call, and reflecting on a big deck can take a minute
// or two.
export const maxDuration = 300;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const growthFormat = jsonSchemaOutputFormat(GROWTH_OUTPUT_SCHEMA);

// Supabase returns at most 1000 rows per request.
const PAGE_SIZE = 1000;

async function loadDeckCards(
  supabase: Awaited<ReturnType<typeof createClient>>,
  deckId: string
): Promise<DeckCard[] | null> {
  const cards: DeckCard[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("cards")
      .select("id, front, back, ease_factor, interval, repetitions, last_reviewed")
      .eq("deck_id", deckId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) return null;
    cards.push(...data);
    if (data.length < PAGE_SIZE) return cards;
  }
}

function claudeErrorMessage(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) {
    return "Claude isn't set up on the server. Check ANTHROPIC_API_KEY.";
  }
  if (
    error instanceof Anthropic.RateLimitError ||
    error instanceof Anthropic.InternalServerError
  ) {
    return "Claude is busy right now. Try again in a minute.";
  }
  return "Claude couldn't reflect on this deck. Try again.";
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const params = parseGrowDeckRequest(body);
  if (!params) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { data: deck } = await supabase
    .from("decks")
    .select("id, name, description, source_language, target_language")
    .eq("id", params.deckId)
    .maybeSingle();
  if (!deck) {
    return NextResponse.json({ error: "Deck not found" }, { status: 404 });
  }

  const cards = await loadDeckCards(supabase, deck.id);
  if (!cards) {
    return NextResponse.json(
      { error: "Couldn't load the deck's cards" },
      { status: 500 }
    );
  }

  let message;
  try {
    message = await anthropic.beta.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      // If a safety classifier declines, retry on Anthropic's recommended
      // fallback model instead of failing the round.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: growthFormat },
      system: GROWTH_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: buildGrowthPrompt({ deck, cards, ...params }),
        },
      ],
    });
  } catch (error) {
    console.error("Claude API error:", error);
    return NextResponse.json(
      { error: claudeErrorMessage(error) },
      { status: 502 }
    );
  }

  if (message.stop_reason === "refusal") {
    return NextResponse.json(
      { error: "Claude declined to suggest cards for this deck." },
      { status: 422 }
    );
  }
  const output = message.parsed_output;
  if (!output) {
    console.error("Claude returned no structured output:", message.stop_reason);
    return NextResponse.json(
      { error: "Claude couldn't reflect on this deck. Try again." },
      { status: 502 }
    );
  }

  const { cards: newCards, duplicates } = selectNewCards(
    output.cards,
    cards,
    params.count
  );

  let added: AddedCard[] = [];
  if (newCards.length > 0) {
    const { data: inserted, error } = await supabase
      .from("cards")
      .insert(
        newCards.map((card) => ({
          deck_id: deck.id,
          user_id: user.id,
          front: card.front,
          back: card.back,
          notes: card.notes || null,
        }))
      )
      .select();
    if (error || !inserted) {
      console.error("Failed to insert cards:", error);
      return NextResponse.json(
        { error: "Couldn't save the new cards" },
        { status: 500 }
      );
    }
    const reasons = new Map(newCards.map((card) => [card.front, card.reason]));
    added = inserted.map((card) => ({
      card,
      reason: reasons.get(card.front) ?? "",
    }));
  }

  return NextResponse.json<GrowDeckResponse>({
    reflection: output.reflection,
    added,
    duplicates,
  });
}
