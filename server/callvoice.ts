// Voices for the supplier call screen. Each spoken line is generated once with
// OpenAI's speech model and kept on disk, so replaying a call costs nothing.
// Without OPENAI_API_KEY the call screen plays silently.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const DIR = path.join(import.meta.dir, "..", "data", "voice");
const MODEL = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";

const VOICES = {
  saajhedar: { voice: "coral", instructions: "You are a friendly young assistant phoning a wholesale supplier on behalf of a small grocery shop in Chennai. Warm, pleasant, unhurried and conversational, with a light Indian English accent. Sound like a polite person on a phone call, not an announcer. Say rupee amounts naturally." },
  supplier: { voice: "onyx", instructions: "You are a gruff, busy, middle-aged wholesale supplier in Chennai answering the phone at a noisy godown. Low, rough, slightly impatient voice with an Indian English accent. Short and matter-of-fact, a little tired, but not rude. Say rupee amounts naturally." },
} as const;

export const callVoiceReady = () => Boolean(process.env.OPENAI_API_KEY);

export async function callVoice(who: string, text: string): Promise<Uint8Array | null> {
  const v = who === "supplier" ? VOICES.supplier : VOICES.saajhedar;
  const line = text.trim().slice(0, 600);
  if (!line) return null;
  const file = path.join(DIR, createHash("sha1").update(`${MODEL}|${v.voice}|${line}`).digest("hex") + ".mp3");
  if (fs.existsSync(file)) return new Uint8Array(fs.readFileSync(file));
  if (!callVoiceReady()) return null;
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, voice: v.voice, input: line, instructions: v.instructions, response_format: "mp3" }),
  });
  if (!res.ok) { console.error("call voice failed", res.status, (await res.text()).slice(0, 200)); return null; }
  const bytes = new Uint8Array(await res.arrayBuffer());
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(file, bytes);
  return bytes;
}
