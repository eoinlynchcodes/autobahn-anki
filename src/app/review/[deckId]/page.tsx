"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import AppShell from "@/components/app-shell";
import type { Card, Deck } from "@/lib/types";
import {
  calculateNextReview,
  qualityFromButton,
} from "@/lib/spaced-repetition";
import {
  type StudyDirection,
  STUDY_DIRECTIONS,
  frontIsTargetLanguage,
  languageName,
  loadStudyPrefs,
  saveAutoSpeak,
  saveStudyDirection,
  showBackFirst,
} from "@/lib/card-direction";
import { canSpeak, speak, stopSpeaking } from "@/lib/speech";

type ReviewButton = "again" | "hard" | "good" | "easy";
// "review" works through due cards and updates their schedule.
// "practice" drills the least confident cards and leaves the schedule alone.
type SessionMode = "review" | "practice";

const PRACTICE_ROUND_SIZE = 20;
const GENERATE_COUNT = 10;
// Cards sampled to work out which side of the deck is in which language
const ORIENTATION_SAMPLE_SIZE = 50;

function SpeakerIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-4 h-4"
      aria-hidden="true"
    >
      <path d="M11 5 6 9H2v6h4l5 4V5z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M19 5a10 10 0 0 1 0 14" />
    </svg>
  );
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export default function ReviewPage() {
  const params = useParams();
  const router = useRouter();
  const deckId = params.deckId as string;
  const supabase = createClient();

  const [deck, setDeck] = useState<Deck | null>(null);
  const [mode, setMode] = useState<SessionMode>("review");
  const [cards, setCards] = useState<Card[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [totalCards, setTotalCards] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [grammarExplanation, setGrammarExplanation] = useState("");
  const [grammarLoading, setGrammarLoading] = useState(false);
  const [grammarQuestion, setGrammarQuestion] = useState("");
  const [showGrammar, setShowGrammar] = useState(false);
  const [done, setDone] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState("");
  const [direction, setDirection] = useState<StudyDirection>("target-first");
  const [frontIsTarget, setFrontIsTarget] = useState(true);
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [speechAvailable, setSpeechAvailable] = useState(false);
  // Varies "mixed" directions between sessions
  const [sessionSeed, setSessionSeed] = useState(0);

  const currentCard = cards[currentIndex] || null;

  // Which side to ask, and which language each side is in
  const backFirst = currentCard
    ? showBackFirst(direction, frontIsTarget, currentCard.id, currentIndex, sessionSeed)
    : false;
  const promptText = backFirst ? currentCard?.back : currentCard?.front;
  const answerText = backFirst ? currentCard?.front : currentCard?.back;
  const promptIsTarget = backFirst !== frontIsTarget;
  const targetText =
    (frontIsTarget ? currentCard?.front : currentCard?.back) || "";
  const sourceText =
    (frontIsTarget ? currentCard?.back : currentCard?.front) || "";
  const targetLanguage = deck?.target_language || "";
  const sourceLanguage = deck?.source_language || "";
  const promptLanguage = promptIsTarget ? targetLanguage : sourceLanguage;
  const answerLanguage = promptIsTarget ? sourceLanguage : targetLanguage;

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

      const prefs = loadStudyPrefs();
      setDirection(prefs.direction);
      setAutoSpeak(prefs.autoSpeak);
      setSpeechAvailable(canSpeak());
      setSessionSeed(Math.random());

      const { data: sample, count } = await supabase
        .from("cards")
        .select("front, back", { count: "exact" })
        .eq("deck_id", deckId)
        .limit(ORIENTATION_SAMPLE_SIZE);
      setTotalCards(count || 0);
      setFrontIsTarget(
        frontIsTargetLanguage(
          sample || [],
          deckData.target_language,
          deckData.source_language
        )
      );

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

      const update = {
        ease_factor: schedule.easeFactor,
        interval: schedule.interval,
        repetitions: schedule.repetitions,
        next_review: schedule.nextReview.toISOString(),
        last_reviewed: new Date().toISOString(),
      };
      await supabase.from("cards").update(update).eq("id", currentCard.id);

      // Missed cards come back at the end of this session until you get them,
      // carrying their new schedule so the next rating builds on it
      const missed = button === "again";
      const queue = missed ? [...cards, { ...currentCard, ...update }] : cards;
      if (missed) setCards(queue);

      resetCard();

      if (currentIndex + 1 >= queue.length) {
        setDone(true);
      } else {
        setCurrentIndex(currentIndex + 1);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentCard, currentIndex, cards]
  );

  const handlePractice = useCallback(
    (gotIt: boolean) => {
      if (!currentCard) return;

      // Missed cards go to the back of the queue so they come up again this round
      const queue = gotIt ? cards : [...cards, currentCard];
      if (!gotIt) setCards(queue);

      resetCard();

      if (currentIndex + 1 >= queue.length) {
        setDone(true);
      } else {
        setCurrentIndex(currentIndex + 1);
      }
    },
    [currentCard, currentIndex, cards]
  );

  function resetCard() {
    setShowAnswer(false);
    setShowGrammar(false);
    setGrammarExplanation("");
    setGrammarQuestion("");
  }

  function startSession(sessionMode: SessionMode, sessionCards: Card[]) {
    setMode(sessionMode);
    setCards(sessionCards);
    setCurrentIndex(0);
    resetCard();
    setDone(false);
  }

  async function startPractice() {
    setLoading(true);
    // Least confident first: shortest interval (just missed or barely known),
    // then lowest ease (struggled with most), then soonest due
    const { data: cardData } = await supabase
      .from("cards")
      .select("*")
      .eq("deck_id", deckId)
      .order("interval", { ascending: true })
      .order("ease_factor", { ascending: true })
      .order("next_review", { ascending: true })
      .limit(PRACTICE_ROUND_SIZE);

    if (cardData && cardData.length > 0) {
      startSession("practice", shuffle(cardData));
    }
    setLoading(false);
  }

  async function generateCards() {
    setGenerating(true);
    setGenerateError("");

    try {
      const res = await fetch("/api/generate-cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deckId, count: GENERATE_COUNT }),
      });
      const data = await res.json();
      if (res.ok) {
        setTotalCards((total) => total + data.cards.length);
        startSession("review", data.cards);
      } else {
        setGenerateError(data.error || "Could not generate cards.");
      }
    } catch {
      setGenerateError("Error generating cards. Check your API key.");
    }
    setGenerating(false);
  }

  async function saveToNotebook() {
    if (!currentCard || !deck) return;
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from("notebook").insert({
      user_id: user.id,
      term: targetText,
      translation: sourceText,
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
          front: targetText,
          back: sourceText,
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

  function chooseDirection(next: StudyDirection) {
    setDirection(next);
    saveStudyDirection(next);
  }

  function toggleAutoSpeak() {
    const next = !autoSpeak;
    setAutoSpeak(next);
    saveAutoSpeak(next);
    if (!next) stopSpeaking();
  }

  // Read the learned language aloud as soon as it's on screen: with the card
  // when it's the question, or on reveal when it's the answer
  const targetVisible = promptIsTarget || showAnswer;
  const targetJustAppeared = promptIsTarget ? !showAnswer : showAnswer;
  useEffect(() => {
    if (!autoSpeak || done || !targetText || !targetJustAppeared) return;
    speak(targetText, targetLanguage);
    // currentIndex: a re-queued card shown twice in a row is spoken again
  }, [autoSpeak, done, targetText, targetLanguage, targetJustAppeared, currentIndex]);

  useEffect(() => () => stopSpeaking(), []);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (done) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (!showAnswer && e.key === " ") {
        e.preventDefault();
        setShowAnswer(true);
      } else if (showAnswer && mode === "practice") {
        if (e.key === "1") {
          handlePractice(false);
        } else if (e.key === "2" || e.key === "3" || e.key === "4") {
          handlePractice(true);
        }
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
  }, [done, mode, showAnswer, handleReview, handlePractice]);

  if (loading) {
    return (
      <AppShell>
        <div className="text-center text-gray-500 py-12">Loading...</div>
      </AppShell>
    );
  }

  if (done) {
    const finishedPractice = mode === "practice";

    return (
      <AppShell>
        {/* Keyed so React doesn't recycle the practice buttons into this view (they flash red) */}
        <div key="done" className="max-w-xl mx-auto py-10">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold mb-2">
              {totalCards === 0
                ? "No cards yet"
                : finishedPractice
                  ? "Practice round complete!"
                  : "All caught up!"}
            </h1>
            <p className="text-gray-500">
              {totalCards === 0
                ? "Add some cards to start studying this deck."
                : finishedPractice
                  ? "Nice work. Go another round, or add some new cards."
                  : "Nothing else is due in this deck right now, but you can keep going."}
            </p>
          </div>

          <div className="space-y-4">
            {totalCards > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h2 className="font-semibold">Practice your weakest cards</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Go over the {Math.min(PRACTICE_ROUND_SIZE, totalCards)}{" "}
                  cards you&apos;re least confident in. Cards you miss come back
                  until you get them, and your review schedule stays the same.
                </p>
                <button
                  onClick={startPractice}
                  className="mt-4 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition"
                >
                  {finishedPractice ? "Practice again" : "Start practice"}
                </button>
              </div>
            )}

            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h2 className="font-semibold">Add more cards</h2>
              <p className="text-sm text-gray-500 mt-1">
                Have Claude write {GENERATE_COUNT} new cards that fit this deck,
                then study them right away.
              </p>
              <div className="mt-4 flex items-center gap-4">
                <button
                  onClick={generateCards}
                  disabled={generating}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50"
                >
                  {generating
                    ? "Generating..."
                    : `Generate ${GENERATE_COUNT} cards`}
                </button>
                <Link
                  href={`/deck/${deckId}?add=1`}
                  className="text-sm text-blue-600 hover:underline"
                >
                  Add your own
                </Link>
              </div>
              {generateError && (
                <div className="mt-3 bg-red-50 text-red-600 p-3 rounded-lg text-sm">
                  {generateError}
                </div>
              )}
            </div>
          </div>

          <div className="text-center mt-8">
            <button
              onClick={() => router.push("/dashboard")}
              className="text-sm text-gray-500 hover:text-gray-700 transition"
            >
              Back to Decks
            </button>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-semibold text-gray-700">
            {deck?.name}
            {mode === "practice" && (
              <span className="ml-2 align-middle text-xs font-medium bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                Practice
              </span>
            )}
          </h1>
          <span className="text-sm text-gray-400">
            {currentIndex + 1} / {cards.length}
          </span>
        </div>

        {/* Which language to ask first, and audio */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div
            role="radiogroup"
            aria-label="Show first"
            className="inline-flex rounded-lg bg-gray-100 p-0.5"
          >
            {STUDY_DIRECTIONS.map((option) => (
              <button
                key={option}
                role="radio"
                aria-checked={direction === option}
                onClick={() => chooseDirection(option)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                  direction === option
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {option === "target-first"
                  ? `${languageName(targetLanguage)} first`
                  : option === "source-first"
                    ? `${languageName(sourceLanguage)} first`
                    : "Mixed"}
              </button>
            ))}
          </div>
          {speechAvailable && (
            <button
              onClick={toggleAutoSpeak}
              aria-pressed={autoSpeak}
              title={`Read ${languageName(targetLanguage)} aloud automatically`}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                autoSpeak
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
              }`}
            >
              <SpeakerIcon />
              Auto
            </button>
          )}
        </div>

        {/* Card */}
        <div
          className="bg-white border border-gray-200 rounded-2xl p-8 text-center min-h-[200px] flex flex-col items-center justify-center cursor-pointer"
          onClick={() => !showAnswer && setShowAnswer(true)}
        >
          <p className="text-xs uppercase tracking-wide text-gray-400 mb-3">
            {languageName(promptLanguage)} &rarr; {languageName(answerLanguage)}
          </p>
          <p className="text-2xl font-medium mb-2">{promptText}</p>
          {showAnswer && (
            <>
              <hr className="w-16 my-4 border-gray-200" />
              <p className="text-xl text-gray-600">{answerText}</p>
            </>
          )}
          {speechAvailable && targetVisible && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                speak(targetText, targetLanguage);
              }}
              aria-label={`Play ${languageName(targetLanguage)} audio`}
              title={`Hear the ${languageName(targetLanguage)}`}
              className="mt-3 p-2 rounded-full text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition"
            >
              <SpeakerIcon />
            </button>
          )}
          {!showAnswer && (
            <p className="text-sm text-gray-400 mt-4">
              Tap to reveal &middot; Space
            </p>
          )}
        </div>

        {/* Practice buttons */}
        {showAnswer && mode === "practice" && (
          <div className="grid grid-cols-2 gap-2 mt-4">
            <button
              onClick={() => handlePractice(false)}
              className="bg-red-500 text-white py-3 rounded-xl font-medium text-sm hover:opacity-90 transition"
            >
              Again
            </button>
            <button
              onClick={() => handlePractice(true)}
              className="bg-green-500 text-white py-3 rounded-xl font-medium text-sm hover:opacity-90 transition"
            >
              Got it
            </button>
          </div>
        )}

        {/* Review buttons */}
        {showAnswer && mode === "review" && (
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
