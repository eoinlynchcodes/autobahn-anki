"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AppShell from "@/components/app-shell";
import type { Card, Deck } from "@/lib/types";

export default function DeckBrowsePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const deckId = params.deckId as string;
  const supabase = createClient();

  const [deck, setDeck] = useState<Deck | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(searchParams.get("add") === "1");
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");

  async function loadCards() {
    const { data: deckData } = await supabase
      .from("decks")
      .select("*")
      .eq("id", deckId)
      .single();

    if (!deckData) {
      router.push("/dashboard");
      return;
    }
    setDeck(deckData);

    const { data: cardData } = await supabase
      .from("cards")
      .select("*")
      .eq("deck_id", deckId)
      .order("created_at", { ascending: true });

    setCards(cardData || []);
    setLoading(false);
  }

  useEffect(() => {
    loadCards();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId]);

  async function addCard(e: React.FormEvent) {
    e.preventDefault();
    if (!front.trim() || !back.trim()) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from("cards").insert({
      deck_id: deckId,
      user_id: user.id,
      front: front.trim(),
      back: back.trim(),
    });

    setFront("");
    setBack("");
    loadCards();
  }

  async function deleteCard(cardId: string) {
    await supabase.from("cards").delete().eq("id", cardId);
    loadCards();
  }

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-6">
        <div>
          <button
            onClick={() => router.push("/dashboard")}
            className="text-sm text-gray-400 hover:text-gray-600 mb-1"
          >
            &larr; Back to Decks
          </button>
          <h1 className="text-2xl font-bold">{deck?.name || "..."}</h1>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition"
        >
          {showAdd ? "Cancel" : "Add Card"}
        </button>
      </div>

      {showAdd && (
        <form
          onSubmit={addCard}
          className="bg-white border border-gray-200 rounded-xl p-4 mb-6 space-y-3"
        >
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">
                Front ({deck?.target_language})
              </label>
              <input
                type="text"
                value={front}
                onChange={(e) => setFront(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">
                Back ({deck?.source_language})
              </label>
              <input
                type="text"
                value={back}
                onChange={(e) => setBack(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <button
            type="submit"
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition"
          >
            Add Card
          </button>
        </form>
      )}

      {loading ? (
        <div className="text-center text-gray-500 py-12">Loading...</div>
      ) : cards.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          No cards in this deck yet. Add some above.
        </div>
      ) : (
        <div className="space-y-2">
          {cards.map((card, i) => (
            <div
              key={card.id}
              className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between"
            >
              <div className="flex items-center gap-4">
                <span className="text-xs text-gray-300 w-6">{i + 1}</span>
                <span className="font-medium">{card.front}</span>
                <span className="text-gray-400">&mdash;</span>
                <span className="text-gray-600">{card.back}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400">
                  {card.repetitions > 0
                    ? `${card.interval}d interval`
                    : "New"}
                </span>
                <button
                  onClick={() => deleteCard(card.id)}
                  className="text-gray-400 hover:text-red-500 text-sm transition"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
