"use client";

import { useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app-shell";
import { parseApkgFile, parseCsvContent } from "@/lib/anki-import";

export default function ImportPage() {
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [sourceLang, setSourceLang] = useState("en");
  const [targetLang, setTargetLang] = useState("de");
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const supabase = createClient();

  async function handleFileImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setError("");
    setStatus("Reading file...");

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not logged in");

      let deckName: string;
      let cards: { front: string; back: string }[];

      if (file.name.endsWith(".apkg")) {
        setStatus("Parsing Anki deck...");
        const result = await parseApkgFile(file);
        deckName = result.name;
        cards = result.cards;
      } else if (
        file.name.endsWith(".csv") ||
        file.name.endsWith(".tsv") ||
        file.name.endsWith(".txt")
      ) {
        setStatus("Parsing CSV...");
        const text = await file.text();
        cards = parseCsvContent(text);
        deckName = file.name.replace(/\.\w+$/, "");
      } else {
        throw new Error(
          "Unsupported file format. Use .apkg, .csv, .tsv, or .txt"
        );
      }

      setStatus(`Creating deck with ${cards.length} cards...`);

      // Create deck
      const { data: deck, error: deckError } = await supabase
        .from("decks")
        .insert({
          user_id: user.id,
          name: deckName,
          source_language: sourceLang,
          target_language: targetLang,
        })
        .select()
        .single();

      if (deckError) throw deckError;

      // Insert cards in batches
      const batchSize = 100;
      for (let i = 0; i < cards.length; i += batchSize) {
        const batch = cards.slice(i, i + batchSize).map((card) => ({
          deck_id: deck.id,
          user_id: user.id,
          front: card.front,
          back: card.back,
        }));

        setStatus(
          `Importing cards ${i + 1}-${Math.min(i + batchSize, cards.length)} of ${cards.length}...`
        );

        const { error: cardError } = await supabase
          .from("cards")
          .insert(batch);
        if (cardError) throw cardError;
      }

      setStatus(`Imported ${cards.length} cards!`);
      setTimeout(() => router.push("/dashboard"), 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  return (
    <AppShell>
      <h1 className="text-2xl font-bold mb-6">Import Deck</h1>

      <div className="max-w-lg">
        <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
          <div>
            <p className="text-sm text-gray-600 mb-4">
              Import an Anki .apkg file or a CSV/TSV file. CSV files should have
              two columns: front and back of card, separated by tab or comma.
            </p>
          </div>

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

          <input
            ref={fileRef}
            type="file"
            accept=".apkg,.csv,.tsv,.txt"
            onChange={handleFileImport}
            disabled={importing}
            className="hidden"
          />

          <button
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50"
          >
            {importing ? status : "Choose File to Import"}
          </button>

          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {status && !error && !importing && (
            <div className="bg-green-50 text-green-600 p-3 rounded-lg text-sm">
              {status}
            </div>
          )}
        </div>

        <div className="mt-8 bg-white border border-gray-200 rounded-xl p-6">
          <h2 className="font-semibold text-lg mb-3">Where to find Anki decks</h2>
          <div className="space-y-4 text-sm text-gray-600">
            <div>
              <h3 className="font-medium text-gray-900 mb-1">AnkiWeb Shared Decks</h3>
              <p className="mb-2">
                The largest free collection of community-made flashcard decks.
                Browse by language and topic.
              </p>
              <a
                href="https://ankiweb.net/shared/decks"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                ankiweb.net/shared/decks &rarr;
              </a>
            </div>

            <div>
              <h3 className="font-medium text-gray-900 mb-1">Export from Anki desktop</h3>
              <p>
                If you already use Anki, open it and go to <strong>File &rarr; Export</strong>.
                Choose &quot;Anki Deck Package (.apkg)&quot; and select the deck you want.
                Then upload that .apkg file here.
              </p>
            </div>

            <div>
              <h3 className="font-medium text-gray-900 mb-1">Create your own CSV</h3>
              <p>
                Make a spreadsheet with two columns: the word/phrase in your target
                language and its translation. Save as .csv or .tsv and import it here.
              </p>
              <div className="mt-2 bg-gray-50 rounded-lg p-3 font-mono text-xs">
                Guten Morgen, Good morning<br />
                Entschuldigung, Excuse me<br />
                Wie geht es Ihnen?, How are you?
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
