import type { SupabaseClient } from "@supabase/supabase-js";

// Everything we track, with the label shown on the admin page.
// Add new events here so they show up with a readable name.
export const ACTIVITY_EVENTS = {
  page_view: "Visited a page",
  deck_created: "Created a deck",
  deck_deleted: "Deleted a deck",
  deck_imported: "Imported a deck",
  card_added: "Added a card by hand",
  card_deleted: "Deleted a card",
  card_reviewed: "Reviewed a card",
  practice_started: "Started a practice round",
  card_practiced: "Practiced a card",
  cards_generated: "Generated cards with AI",
  grammar_asked: "Asked for a grammar explanation",
  notebook_saved_from_card: "Saved a card to the notebook",
  notebook_entry_added: "Added a notebook entry",
  notebook_entry_deleted: "Deleted a notebook entry",
} as const;

export type ActivityEvent = keyof typeof ACTIVITY_EVENTS;

export function activityLabel(event: string): string {
  return ACTIVITY_EVENTS[event as ActivityEvent] ?? event;
}

// Collapse ids out of paths so /review/<id> and /review/<other id> count as the same page
export function normalizePath(pathname: string): string {
  return pathname.replace(
    /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    "/[id]"
  );
}

// Never throws: tracking must not break the app. Client code can fire and
// forget; server routes should await it so it finishes before the response.
// user_id defaults to auth.uid() in the database.
export async function logActivity(
  supabase: SupabaseClient,
  event: ActivityEvent,
  details: { path?: string; metadata?: Record<string, unknown> } = {}
) {
  await supabase
    .from("activity_events")
    .insert({
      event,
      path: details.path ?? null,
      metadata: details.metadata ?? null,
    })
    .then(
      ({ error }) => {
        if (error) console.warn("Activity log failed:", error.message);
      },
      (err) => console.warn("Activity log failed:", err)
    );
}
