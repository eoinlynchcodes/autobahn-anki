export interface Deck {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  source_language: string;
  target_language: string;
  created_at: string;
  updated_at: string;
}

export interface Card {
  id: string;
  deck_id: string;
  user_id: string;
  front: string;
  back: string;
  notes: string | null;
  ease_factor: number;
  interval: number;
  repetitions: number;
  next_review: string;
  last_reviewed: string | null;
  created_at: string;
}

export interface NotebookEntry {
  id: string;
  user_id: string;
  term: string;
  translation: string;
  language_from: string;
  language_to: string;
  notes: string | null;
  source_card_id: string | null;
  created_at: string;
}
