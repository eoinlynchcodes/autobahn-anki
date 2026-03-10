import JSZip from "jszip";
import initSqlJs, { type Database } from "sql.js";

export interface AnkiCard {
  front: string;
  back: string;
}

export interface AnkiDeck {
  name: string;
  cards: AnkiCard[];
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .trim();
}

export async function parseApkgFile(file: File): Promise<AnkiDeck> {
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  const collectionFile = zip.file("collection.anki2") || zip.file("collection.anki21");
  if (!collectionFile) {
    throw new Error("Invalid .apkg file: no collection database found");
  }

  const dbBuffer = await collectionFile.async("arraybuffer");
  const SQL = await initSqlJs({
    locateFile: (filename: string) => `https://sql.js.org/dist/${filename}`,
  });
  const db: Database = new SQL.Database(new Uint8Array(dbBuffer));

  // Get deck name
  let deckName = "Imported Deck";
  try {
    const colResult = db.exec("SELECT decks FROM col");
    if (colResult.length > 0 && colResult[0].values.length > 0) {
      const decksJson = JSON.parse(colResult[0].values[0][0] as string);
      const deckIds = Object.keys(decksJson);
      const mainDeck = deckIds.find((id) => id !== "1");
      if (mainDeck) {
        deckName = decksJson[mainDeck].name;
      }
    }
  } catch {
    // Use default name
  }

  // Get cards - notes table has the content, flds separated by \x1f
  const cards: AnkiCard[] = [];
  try {
    const notesResult = db.exec("SELECT flds FROM notes");
    if (notesResult.length > 0) {
      for (const row of notesResult[0].values) {
        const fields = (row[0] as string).split("\x1f");
        if (fields.length >= 2) {
          const front = stripHtml(fields[0]);
          const back = stripHtml(fields[1]);
          if (front && back) {
            cards.push({ front, back });
          }
        }
      }
    }
  } finally {
    db.close();
  }

  if (cards.length === 0) {
    throw new Error("No cards found in the .apkg file");
  }

  return { name: deckName, cards };
}

export interface CsvCard {
  front: string;
  back: string;
}

export function parseCsvContent(content: string): CsvCard[] {
  const lines = content.trim().split("\n");
  const cards: CsvCard[] = [];

  for (const line of lines) {
    // Support tab or comma separated
    const separator = line.includes("\t") ? "\t" : ",";
    const parts = line.split(separator).map((p) => p.trim().replace(/^"|"$/g, ""));
    if (parts.length >= 2 && parts[0] && parts[1]) {
      cards.push({ front: parts[0], back: parts[1] });
    }
  }

  return cards;
}
