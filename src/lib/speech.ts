// Read cards aloud with the browser's built-in voices (no API key, works offline
// on most phones and laptops).

const SPEECH_LOCALES: Record<string, string> = {
  en: "en-US",
  de: "de-DE",
  fr: "fr-FR",
  es: "es-ES",
  it: "it-IT",
  pt: "pt-BR",
  ja: "ja-JP",
  ko: "ko-KR",
  zh: "zh-CN",
};

export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

function pickVoice(locale: string): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  const language = locale.split("-")[0];
  return (
    voices.find((v) => v.lang.replace("_", "-") === locale) ||
    voices.find((v) => v.lang.toLowerCase().startsWith(language))
  );
}

export function speak(text: string, languageCode: string) {
  if (!canSpeak() || !text.trim()) return;
  const synth = window.speechSynthesis;
  const locale = SPEECH_LOCALES[languageCode] || languageCode;

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = locale;
  const voice = pickVoice(locale);
  if (voice) utterance.voice = voice;
  utterance.rate = 0.9;

  synth.cancel();
  synth.speak(utterance);
}

export function stopSpeaking() {
  if (canSpeak()) window.speechSynthesis.cancel();
}
