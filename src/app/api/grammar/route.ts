import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { front, back, question, sourceLanguage, targetLanguage } =
    await request.json();

  const systemPrompt = `You are a language learning assistant. The user is learning ${targetLanguage} from ${sourceLanguage}.
They are studying flashcards and want to understand grammar, word choice, and usage patterns.
Keep explanations clear, concise, and practical. Use examples when helpful.
Respond in ${sourceLanguage} but include ${targetLanguage} examples.`;

  const userPrompt = question
    ? `Card front (${targetLanguage}): "${front}"
Card back (${sourceLanguage}): "${back}"

User's question: ${question}`
    : `Please explain the grammar and usage of this phrase:
${targetLanguage}: "${front}"
${sourceLanguage}: "${back}"

Break down any grammar rules, word order, conjugation, or interesting patterns. Explain why these specific words were chosen.`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const textContent = message.content.find((c) => c.type === "text");
    return NextResponse.json({
      explanation: textContent?.text || "No explanation available.",
    });
  } catch (error) {
    console.error("Claude API error:", error);
    return NextResponse.json(
      { error: "Failed to get explanation" },
      { status: 500 }
    );
  }
}
