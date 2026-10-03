"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  AddedCard,
  GrowDeckResponse,
  PreviousRound,
} from "@/lib/deck-growth";

interface Round {
  number: number;
  reflection: string;
  added: AddedCard[];
  duplicates: number;
  removedIds: string[];
}

export default function GrowDeckPanel({
  deckId,
  onCardsChanged,
}: {
  deckId: string;
  onCardsChanged: () => void;
}) {
  const supabase = createClient();
  const [focus, setFocus] = useState("");
  const [count, setCount] = useState(10);
  const [depth, setDepth] = useState(2);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [activeRound, setActiveRound] = useState<number | null>(null);
  const [stopping, setStopping] = useState(false);
  const [outcome, setOutcome] = useState<"covered" | "stopped" | null>(null);
  const [error, setError] = useState("");
  const stopRequested = useRef(false);

  // Closing the panel ends the run after the round in flight.
  useEffect(() => {
    return () => {
      stopRequested.current = true;
    };
  }, []);

  const running = activeRound !== null;

  async function requestRound(
    previousRounds: PreviousRound[]
  ): Promise<GrowDeckResponse> {
    const res = await fetch("/api/grow-deck", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deckId, focus, count, previousRounds }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data) {
      throw new Error(data?.error || "Couldn't reach Claude. Try again.");
    }
    return data;
  }

  // Runs one round, then recurses into the next with this round's
  // reflection and cards as context. Base cases: the requested depth is
  // reached, Claude has nothing more to add, or the learner stops the run.
  async function grow(
    number: number,
    lastRound: number,
    previousRounds: PreviousRound[]
  ): Promise<void> {
    if (number > lastRound) return;
    if (stopRequested.current) {
      setOutcome("stopped");
      return;
    }

    setActiveRound(number);
    const result = await requestRound(previousRounds);
    setRounds((prev) => [
      ...prev,
      {
        number,
        reflection: result.reflection,
        added: result.added,
        duplicates: result.duplicates,
        removedIds: [],
      },
    ]);

    if (result.added.length === 0) {
      setOutcome("covered");
      return;
    }
    onCardsChanged();

    await grow(number + 1, lastRound, [
      ...previousRounds,
      {
        reflection: result.reflection,
        cardIds: result.added.map(({ card }) => card.id),
      },
    ]);
  }

  async function run(
    firstRound: number,
    lastRound: number,
    previousRounds: PreviousRound[]
  ) {
    stopRequested.current = false;
    setStopping(false);
    setOutcome(null);
    setError("");
    try {
      await grow(firstRound, lastRound, previousRounds);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setActiveRound(null);
    }
  }

  function start(e: React.FormEvent) {
    e.preventDefault();
    setRounds([]);
    run(1, depth, []);
  }

  // One more level on top of the rounds so far.
  function goDeeper() {
    const next = rounds.length + 1;
    run(
      next,
      next,
      rounds.map((round) => ({
        reflection: round.reflection,
        cardIds: round.added
          .map(({ card }) => card.id)
          .filter((id) => !round.removedIds.includes(id)),
      }))
    );
  }

  function stop() {
    stopRequested.current = true;
    setStopping(true);
  }

  async function removeCards(roundNumber: number, cardIds: string[]) {
    const { error: deleteError } = await supabase
      .from("cards")
      .delete()
      .in("id", cardIds);
    if (deleteError) {
      setError("Couldn't remove the card. Try again.");
      return;
    }
    setRounds((prev) =>
      prev.map((round) =>
        round.number === roundNumber
          ? { ...round, removedIds: [...round.removedIds, ...cardIds] }
          : round
      )
    );
    onCardsChanged();
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6 space-y-4">
      <div>
        <h2 className="font-semibold text-gray-900">
          Grow this deck with Claude
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Claude looks at your cards and how your reviews are going, reflects
          on what you need to learn next, and adds cards for it. Each round
          builds on the one before: it breaks down what you&apos;re struggling
          with and builds on what you know.
        </p>
      </div>

      <form onSubmit={start} className="space-y-3">
        <div>
          <label
            htmlFor="grow-focus"
            className="block text-xs text-gray-500 mb-1"
          >
            Focus (optional)
          </label>
          <input
            id="grow-focus"
            type="text"
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            maxLength={200}
            disabled={running}
            placeholder="e.g. ordering at a restaurant, separable verbs"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
          />
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label
              htmlFor="grow-count"
              className="block text-xs text-gray-500 mb-1"
            >
              Cards per round
            </label>
            <select
              id="grow-count"
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              disabled={running}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
            >
              {[5, 10, 15, 20].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="grow-depth"
              className="block text-xs text-gray-500 mb-1"
            >
              Depth
            </label>
            <select
              id="grow-depth"
              value={depth}
              onChange={(e) => setDepth(Number(e.target.value))}
              disabled={running}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
            >
              {[1, 2, 3].map((n) => (
                <option key={n} value={n}>
                  {n === 1 ? "1 round" : `${n} rounds`}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={running}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50"
          >
            Reflect and add cards
          </button>
        </div>
      </form>

      {rounds.map((round) => (
        <RoundResult
          key={round.number}
          round={round}
          onRemove={(cardIds) => removeCards(round.number, cardIds)}
        />
      ))}

      <div aria-live="polite" className="space-y-3">
        {running && (
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <p className="text-blue-700 animate-pulse">
              Round {activeRound}: Claude is reflecting on your deck&hellip;
            </p>
            <button
              type="button"
              onClick={stop}
              disabled={stopping}
              className="text-gray-500 hover:text-gray-700 transition disabled:opacity-50"
            >
              {stopping ? "Stopping after this round…" : "Stop after this round"}
            </button>
          </div>
        )}
        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">
            {error}
          </div>
        )}
        {!running && outcome === "covered" && (
          <p className="text-sm text-gray-500">
            Claude has nothing more to add at this depth.
          </p>
        )}
        {!running && outcome === "stopped" && (
          <p className="text-sm text-gray-500">
            Stopped after round {rounds.length}.
          </p>
        )}
        {!running && rounds.length > 0 && outcome !== "covered" && (
          <button
            type="button"
            onClick={goDeeper}
            className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 transition"
          >
            {error
              ? `Retry round ${rounds.length + 1}`
              : "Go a level deeper"}
          </button>
        )}
      </div>
    </div>
  );
}

function RoundResult({
  round,
  onRemove,
}: {
  round: Round;
  onRemove: (cardIds: string[]) => void;
}) {
  const remainingIds = round.added
    .map(({ card }) => card.id)
    .filter((id) => !round.removedIds.includes(id));

  return (
    <section className="border-t border-gray-100 pt-4">
      <div className="flex items-center justify-between gap-3 mb-2">
        <h3 className="text-sm font-semibold text-gray-700">
          Round {round.number} &middot; {round.added.length}{" "}
          {round.added.length === 1 ? "card" : "cards"} added
          {round.duplicates > 0 && (
            <span className="font-normal text-gray-400">
              {" "}
              &middot; {round.duplicates} already in the deck
            </span>
          )}
        </h3>
        {remainingIds.length > 1 && (
          <button
            type="button"
            onClick={() => onRemove(remainingIds)}
            className="text-xs text-gray-400 hover:text-red-500 transition shrink-0"
          >
            Undo round
          </button>
        )}
      </div>
      <p className="text-sm text-blue-900 bg-blue-50 border border-blue-100 rounded-lg p-3 whitespace-pre-wrap">
        {round.reflection}
      </p>
      {round.added.length > 0 && (
        <ul className="mt-2 divide-y divide-gray-100">
          {round.added.map(({ card, reason }) => {
            const removed = round.removedIds.includes(card.id);
            return (
              <li
                key={card.id}
                className="py-2 flex items-start justify-between gap-3"
              >
                <div className={removed ? "opacity-40 line-through" : ""}>
                  <p className="text-sm text-gray-900">
                    <span className="font-medium">{card.front}</span>
                    <span className="text-gray-400"> &mdash; </span>
                    <span className="text-gray-600">{card.back}</span>
                  </p>
                  {card.notes && (
                    <p className="text-xs text-gray-400 mt-0.5">{card.notes}</p>
                  )}
                  {reason && (
                    <p className="text-xs text-gray-500 italic mt-0.5">
                      {reason}
                    </p>
                  )}
                </div>
                {removed ? (
                  <span className="text-xs text-gray-400 shrink-0">
                    Removed
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onRemove([card.id])}
                    className="text-xs text-gray-400 hover:text-red-500 transition shrink-0"
                  >
                    Remove
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
