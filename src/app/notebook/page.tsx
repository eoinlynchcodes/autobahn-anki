"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import AppShell from "@/components/app-shell";
import type { NotebookEntry } from "@/lib/types";

export default function NotebookPage() {
  const [entries, setEntries] = useState<NotebookEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [term, setTerm] = useState("");
  const [translation, setTranslation] = useState("");
  const [notes, setNotes] = useState("");
  const [langFrom, setLangFrom] = useState("en");
  const [langTo, setLangTo] = useState("de");
  const [search, setSearch] = useState("");
  const supabase = createClient();

  async function loadEntries() {
    const { data } = await supabase
      .from("notebook")
      .select("*")
      .order("created_at", { ascending: false });

    setEntries(data || []);
    setLoading(false);
  }

  useEffect(() => {
    loadEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addEntry(e: React.FormEvent) {
    e.preventDefault();
    if (!term.trim() || !translation.trim()) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from("notebook").insert({
      user_id: user.id,
      term: term.trim(),
      translation: translation.trim(),
      notes: notes.trim() || null,
      language_from: langFrom,
      language_to: langTo,
    });

    setTerm("");
    setTranslation("");
    setNotes("");
    setShowAdd(false);
    loadEntries();
  }

  async function deleteEntry(id: string) {
    await supabase.from("notebook").delete().eq("id", id);
    loadEntries();
  }

  const filtered = search
    ? entries.filter(
        (e) =>
          e.term.toLowerCase().includes(search.toLowerCase()) ||
          e.translation.toLowerCase().includes(search.toLowerCase()) ||
          (e.notes && e.notes.toLowerCase().includes(search.toLowerCase()))
      )
    : entries;

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Notebook</h1>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition"
        >
          {showAdd ? "Cancel" : "Add Word"}
        </button>
      </div>

      {showAdd && (
        <form
          onSubmit={addEntry}
          className="bg-white border border-gray-200 rounded-xl p-4 mb-6 space-y-3"
        >
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">Term</label>
              <input
                type="text"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="e.g. Entschuldigung"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">
                Translation
              </label>
              <input
                type="text"
                value={translation}
                onChange={(e) => setTranslation(e.target.value)}
                placeholder="e.g. Excuse me"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <select
                value={langFrom}
                onChange={(e) => setLangFrom(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="en">English</option>
                <option value="de">German</option>
                <option value="fr">French</option>
                <option value="es">Spanish</option>
                <option value="it">Italian</option>
              </select>
            </div>
            <div className="flex-1">
              <select
                value={langTo}
                onChange={(e) => setLangTo(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="de">German</option>
                <option value="en">English</option>
                <option value="fr">French</option>
                <option value="es">Spanish</option>
                <option value="it">Italian</option>
              </select>
            </div>
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition"
          >
            Save
          </button>
        </form>
      )}

      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search notebook..."
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {loading ? (
        <div className="text-center text-gray-500 py-12">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-500">
            {search ? "No matches found." : "Your notebook is empty."}
          </p>
          <p className="text-gray-400 text-sm mt-2">
            Save words during reviews or add them manually above.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((entry) => (
            <div
              key={entry.id}
              className="bg-white border border-gray-200 rounded-xl p-4 flex items-start justify-between"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{entry.term}</span>
                  <span className="text-gray-400">&mdash;</span>
                  <span className="text-gray-600">{entry.translation}</span>
                </div>
                {entry.notes && (
                  <p className="text-sm text-gray-400 mt-1">{entry.notes}</p>
                )}
                <p className="text-xs text-gray-300 mt-1">
                  {new Date(entry.created_at).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={() => deleteEntry(entry.id)}
                className="text-gray-400 hover:text-red-500 text-sm transition ml-4"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
