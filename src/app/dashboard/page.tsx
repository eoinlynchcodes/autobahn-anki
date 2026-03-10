"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import AppShell from "@/components/app-shell";
import Link from "next/link";
import type { Deck } from "@/lib/types";

export default function DashboardPage() {
  const [decks, setDecks] = useState<(Deck & { card_count: number; due_count: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newDeckName, setNewDeckName] = useState("");
  const [sourceLang, setSourceLang] = useState("en");
  const [targetLang, setTargetLang] = useState("de");
  const supabase = createClient();

  async function loadDecks() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: deckRows } = await supabase
      .from("decks")
      .select("*")
      .order("updated_at", { ascending: false });

    if (!deckRows) {
      setLoading(false);
      return;
    }

    const now = new Date().toISOString();
    const decksWithCounts = await Promise.all(
      deckRows.map(async (deck) => {
        const { count: cardCount } = await supabase
          .from("cards")
          .select("*", { count: "exact", head: true })
          .eq("deck_id", deck.id);

        const { count: dueCount } = await supabase
          .from("cards")
          .select("*", { count: "exact", head: true })
          .eq("deck_id", deck.id)
          .lte("next_review", now);

        return {
          ...deck,
          card_count: cardCount || 0,
          due_count: dueCount || 0,
        };
      })
    );

    setDecks(decksWithCounts);
    setLoading(false);
  }

  useEffect(() => {
    loadDecks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createDeck(e: React.FormEvent) {
    e.preventDefault();
    if (!newDeckName.trim()) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from("decks").insert({
      user_id: user.id,
      name: newDeckName.trim(),
      source_language: sourceLang,
      target_language: targetLang,
    });

    setNewDeckName("");
    setShowCreate(false);
    loadDecks();
  }

  async function deleteDeck(deckId: string) {
    if (!confirm("Delete this deck and all its cards?")) return;
    await supabase.from("decks").delete().eq("id", deckId);
    loadDecks();
  }

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Your Decks</h1>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition"
        >
          {showCreate ? "Cancel" : "New Deck"}
        </button>
      </div>

      {showCreate && (
        <form
          onSubmit={createDeck}
          className="bg-white border border-gray-200 rounded-xl p-4 mb-6 space-y-3"
        >
          <input
            type="text"
            value={newDeckName}
            onChange={(e) => setNewDeckName(e.target.value)}
            placeholder="Deck name"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">
                I speak
              </label>
              <select
                value={sourceLang}
                onChange={(e) => setSourceLang(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="en">English</option>
                <option value="de">German</option>
                <option value="fr">French</option>
                <option value="es">Spanish</option>
                <option value="it">Italian</option>
                <option value="pt">Portuguese</option>
                <option value="ja">Japanese</option>
                <option value="ko">Korean</option>
                <option value="zh">Chinese</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">
                I&apos;m learning
              </label>
              <select
                value={targetLang}
                onChange={(e) => setTargetLang(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="de">German</option>
                <option value="en">English</option>
                <option value="fr">French</option>
                <option value="es">Spanish</option>
                <option value="it">Italian</option>
                <option value="pt">Portuguese</option>
                <option value="ja">Japanese</option>
                <option value="ko">Korean</option>
                <option value="zh">Chinese</option>
              </select>
            </div>
          </div>
          <button
            type="submit"
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition"
          >
            Create Deck
          </button>
        </form>
      )}

      {loading ? (
        <div className="text-center text-gray-500 py-12">Loading...</div>
      ) : decks.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-500 mb-4">No decks yet.</p>
          <p className="text-gray-400 text-sm">
            Create a deck above or{" "}
            <Link href="/import" className="text-blue-600 hover:underline">
              import an Anki deck
            </Link>
            .
          </p>
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
          {decks.map((deck) => (
            <div
              key={deck.id}
              className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-sm transition"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-semibold text-lg">{deck.name}</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    {deck.card_count} cards &middot; {deck.due_count} due
                  </p>
                </div>
                <button
                  onClick={() => deleteDeck(deck.id)}
                  className="text-gray-400 hover:text-red-500 text-sm transition"
                  title="Delete deck"
                >
                  Delete
                </button>
              </div>
              <div className="mt-4 flex gap-2">
                <Link
                  href={`/review/${deck.id}`}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                    deck.due_count > 0
                      ? "bg-blue-600 text-white hover:bg-blue-700"
                      : "bg-gray-100 text-gray-400 cursor-default"
                  }`}
                >
                  {deck.due_count > 0
                    ? `Review (${deck.due_count})`
                    : "All caught up"}
                </Link>
                <Link
                  href={`/deck/${deck.id}`}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition"
                >
                  Browse
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
