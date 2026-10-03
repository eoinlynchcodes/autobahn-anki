"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AppShell from "@/components/app-shell";
import type { Card, Deck } from "@/lib/types";
import {
  calculateNextReview,
  qualityFromButton,
} from "@/lib/spaced-repetition";

type ReviewButton = "again" | "hard" | "good" | "easy";

export default function ReviewPage() {
  const params = useParams();
  const router = useRouter();
  const deckId = params.deckId as string;
  const supabase = createClient();

  const [deck, setDeck] = useState<Deck | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [grammarExplanation, setGrammarExplanation] = useState("");
  const [grammarLoading, setGrammarLoading] = useState(false);
  const [grammarQuestion, setGrammarQuestion] = useState("");
  const [showGrammar, setShowGrammar] = useState(false);
  const [done, setDone] = useState(false);

  const currentCard = cards[currentIndex] || null;

  useEffect(() => {
    async function load() {
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

      const now = new Date().toISOString();
      const { data: cardData } = await supabase
        .from("cards")
        .select("*")
        .eq("deck_id", deckId)
        .lte("next_review", now)
        .order("next_review", { ascending: true });

      if (!cardData || cardData.length === 0) {
        setDone(true);
      } else {
        setCards(cardData);
      }
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId]);

  const handleReview = useCallback(
    async (button: ReviewButton) => {
      if (!currentCard) return;

      const quality = qualityFromButton(button);
      const schedule = calculateNextReview(
        quality,
        currentCard.ease_factor,
        currentCard.interval,
        currentCard.repetitions
      );

      await supabase
        .from("cards")
        .update({
          ease_factor: schedule.easeFactor,
          interval: schedule.interval,
          repetitions: schedule.repetitions,
          next_review: schedule.nextReview.toISOString(),
          last_reviewed: new Date().toISOString(),
        })
        .eq("id", currentCard.id);

      setShowAnswer(false);
      setShowGrammar(false);
      setGrammarExplanation("");
      setGrammarQuestion("");

      if (currentIndex + 1 >= cards.length) {
        setDone(true);
      } else {
        setCurrentIndex(currentIndex + 1);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentCard, currentIndex, cards.length]
  );

  async function saveToNotebook() {
    if (!currentCard || !deck) return;
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from("notebook").insert({
      user_id: user.id,
      term: currentCard.front,
      translation: currentCard.back,
      language_from: deck.source_language,
      language_to: deck.target_language,
      source_card_id: currentCard.id,
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function askGrammar(customQuestion?: string) {
    if (!currentCard || !deck) return;
    setGrammarLoading(true);
    setShowGrammar(true);

    try {
      const res = await fetch("/api/grammar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          front: currentCard.front,
          back: currentCard.back,
          question: customQuestion || "",
          sourceLanguage: deck.source_language,
          targetLanguage: deck.target_language,
        }),
      });
      const data = await res.json();
      setGrammarExplanation(
        data.explanation || "Could not get explanation."
      );
    } catch {
      setGrammarExplanation("Error getting explanation. Check your API key.");
    }
    setGrammarLoading(false);
  }

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (!showAnswer && e.key === " ") {
        e.preventDefault();
        setShowAnswer(true);
      } else if (showAnswer) {
        switch (e.key) {
          case "1":
            handleReview("again");
            break;
          case "2":
            handleReview("hard");
            break;
          case "3":
            handleReview("good");
            break;
          case "4":
            handleReview("easy");
            break;
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showAnswer, handleReview]);

  if (loading) {
    return (
      <AppShell>
        <div className="text-center text-gray-500 py-12">Loading...</div>
      </AppShell>
    );
  }

  if (done) {
    return (
      <AppShell>
        <div className="text-center py-16">
          <h1 className="text-2xl font-bold mb-2">All done!</h1>
          <p className="text-gray-500 mb-6">
            No more cards due for review in this deck.
          </p>
          <button
            onClick={() => router.push("/dashboard")}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 transition"
          >
            Back to Decks
          </button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-semibold text-gray-700">{deck?.name}</h1>
          <span className="text-sm text-gray-400">
            {currentIndex + 1} / {cards.length}
          </span>
        </div>

        {/* Card */}
        <div
          className="bg-white border border-gray-200 rounded-2xl p-8 text-center min-h-[200px] flex flex-col items-center justify-center cursor-pointer"
          onClick={() => !showAnswer && setShowAnswer(true)}
        >
          <p className="text-2xl font-medium mb-2">{currentCard?.front}</p>
          {showAnswer && (
            <>
              <hr className="w-16 my-4 border-gray-200" />
              <p className="text-xl text-gray-600">{currentCard?.back}</p>
              {currentCard?.notes && (
                <p className="text-sm text-gray-400 mt-3">
                  {currentCard.notes}
                </p>
              )}
            </>
          )}
          {!showAnswer && (
            <p className="text-sm text-gray-400 mt-4">
              Tap to reveal &middot; Space
            </p>
          )}
        </div>

        {/* Review buttons */}
        {showAnswer && (
          <div className="grid grid-cols-4 gap-2 mt-4">
            {(
              [
                { key: "again", label: "Again", color: "bg-red-500" },
                { key: "hard", label: "Hard", color: "bg-orange-500" },
                { key: "good", label: "Good", color: "bg-green-500" },
                { key: "easy", label: "Easy", color: "bg-blue-500" },
              ] as const
            ).map(({ key, label, color }) => (
              <button
                key={key}
                onClick={() => handleReview(key)}
                className={`${color} text-white py-3 rounded-xl font-medium text-sm hover:opacity-90 transition`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Action buttons */}
        {showAnswer && (
          <div className="flex gap-2 mt-3">
            <button
              onClick={saveToNotebook}
              disabled={saving || saved}
              className="flex-1 bg-gray-100 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 transition disabled:opacity-50"
            >
              {saved ? "Saved!" : saving ? "Saving..." : "Save to Notebook"}
            </button>
            <button
              onClick={() => askGrammar()}
              disabled={grammarLoading}
              className="flex-1 bg-gray-100 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 transition disabled:opacity-50"
            >
              {grammarLoading ? "Asking..." : "Explain Grammar"}
            </button>
          </div>
        )}

        {/* Grammar explanation */}
        {showGrammar && (
          <div className="mt-4 bg-blue-50 border border-blue-100 rounded-xl p-4">
            <h3 className="font-semibold text-sm text-blue-800 mb-2">
              Grammar Explanation
            </h3>
            {grammarLoading ? (
              <p className="text-sm text-blue-600">Thinking...</p>
            ) : (
              <div className="text-sm text-blue-900 whitespace-pre-wrap">
                {grammarExplanation}
              </div>
            )}
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                value={grammarQuestion}
                onChange={(e) => setGrammarQuestion(e.target.value)}
                placeholder="Ask a follow-up..."
                className="flex-1 px-3 py-1.5 border border-blue-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && grammarQuestion.trim()) {
                    askGrammar(grammarQuestion);
                    setGrammarQuestion("");
                  }
                }}
              />
              <button
                onClick={() => {
                  if (grammarQuestion.trim()) {
                    askGrammar(grammarQuestion);
                    setGrammarQuestion("");
                  }
                }}
                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition"
              >
                Ask
              </button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
