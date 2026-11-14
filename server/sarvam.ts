// Sarvam AI speech: Saaras for speech-to-text, Bulbul for text-to-speech.
// REST calls, one utterance at a time. Docs: https://docs.sarvam.ai
const BASE = "https://api.sarvam.ai";
const key = () => process.env.SARVAM_API_KEY || "";
export const sarvamReady = () => key().length > 0;

export const STT_MODEL = process.env.SARVAM_STT_MODEL || "saaras:v4";
// Bulbul v4 Flash is the cheaper voice model, used only if chosen in .env. Its voices are each tied to one
// language, so there is one per language; Bulbul v3 uses a single speaker.
export const TTS_MODEL = process.env.SARVAM_TTS_MODEL || "bulbul:v3";
const FLASH = TTS_MODEL.includes("v4");
const VOICES: Record<string, string> = FLASH
  ? { "ta-IN": process.env.SARVAM_TTS_SPEAKER_TA || "gokul_ta_narration", "hi-IN": process.env.SARVAM_TTS_SPEAKER_HI || "ritu_hi_customer", "en-IN": process.env.SARVAM_TTS_SPEAKER_EN || "simran_en_customer" }
  : {};
export const TTS_SPEAKER = FLASH ? Object.values(VOICES).join(", ") : process.env.SARVAM_TTS_SPEAKER || "kavitha";

export type Lang = "ta-IN" | "hi-IN" | "en-IN";
export const LANGS: Lang[] = ["ta-IN", "hi-IN", "en-IN"];

export class SpeechError extends Error {}

// Picks the reply language from the script the text is written in.
export function langOfText(text: string, fallback: Lang = "en-IN"): Lang {
  let ta = 0, hi = 0, en = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (c >= 0x0b80 && c <= 0x0bff) ta++;
    else if (c >= 0x0900 && c <= 0x097f) hi++;
    else if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) en++;
  }
  if (ta === 0 && hi === 0) return en > 0 ? "en-IN" : fallback;
  return ta >= hi ? "ta-IN" : "hi-IN";
}

export async function transcribe(audio: Blob, filename: string, opts: { hint?: Lang | "unknown"; keyterms?: string[] } = {}) {
  if (!sarvamReady()) throw new SpeechError("SARVAM_API_KEY is not set");
  const form = new FormData();
  form.append("file", audio, filename);
  form.append("model", STT_MODEL);
  form.append("language_code", opts.hint ?? "unknown");
  if (STT_MODEL === "saaras:v4" && opts.keyterms?.length) form.append("keyterms", JSON.stringify(opts.keyterms.slice(0, 50)));
  const t0 = performance.now();
  const res = await fetch(`${BASE}/speech-to-text`, { method: "POST", headers: { "api-subscription-key": key() }, body: form });
  if (!res.ok) throw new SpeechError(`Speech-to-text failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { transcript: string; language_code?: string | null };
  const code = (LANGS as string[]).includes(data.language_code ?? "") ? (data.language_code as Lang) : langOfText(data.transcript, "en-IN");
  return { text: (data.transcript || "").trim(), lang: code, ms: Math.round(performance.now() - t0) };
}

// Bulbul reads long numbers better with commas, and has no use for symbols.
function speakable(text: string) {
  return text.replace(/\*+|#+|`+/g, "").replace(/₹\s?([\d,]+(?:\.\d+)?)/g, "$1 rupees").replace(/\s+/g, " ").trim();
}

export async function speak(text: string, lang: Lang): Promise<{ b64: string; mime: string; ms: number }> {
  if (!sarvamReady()) throw new SpeechError("SARVAM_API_KEY is not set");
  const t0 = performance.now();
  const res = await fetch(`${BASE}/text-to-speech`, {
    method: "POST",
    headers: { "api-subscription-key": key(), "Content-Type": "application/json" },
    body: JSON.stringify({ text: speakable(text).slice(0, 2400), language_code: lang, model: TTS_MODEL, speaker: VOICES[lang] ?? TTS_SPEAKER,
      pace: 1.05, speech_sample_rate: 24000, output_audio_codec: "mp3" }),
  });
  if (!res.ok) throw new SpeechError(`Text-to-speech failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { audios: string[] };
  if (!data.audios?.[0]) throw new SpeechError("Text-to-speech returned no audio");
  return { b64: data.audios[0], mime: "audio/mpeg", ms: Math.round(performance.now() - t0) };
}

// Splits a reply into sentences so the first one can start playing sooner.
export function sentences(text: string): string[] {
  const parts = text.split(/(?<=[.!?।])\s+/u).map((s) => s.trim()).filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    if (out.length && (out[out.length - 1].length < 40 || p.length < 25)) out[out.length - 1] += " " + p;
    else out.push(p);
  }
  return out.length ? out : [text];
}
