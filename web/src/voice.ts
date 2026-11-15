// Voice engine for the browser. Captures microphone audio as 16 kHz PCM,
// detects when the speaker starts and stops, hands each utterance to the
// caller as a WAV file, and plays the assistant's reply through the same
// audio context so one tap unlocks both on iOS.

export type VoiceState = "off" | "listening" | "hearing" | "thinking" | "speaking";

type Handlers = {
  onState: (s: VoiceState) => void;
  onLevel: (level: number) => void;          // 0..1, mic while listening, output while speaking
  onUtterance: (wav: Blob, seconds: number) => void;
  onError: (message: string) => void;
  onDebug?: (event: string, data: Record<string, unknown>) => void;   // diagnostics, sent to the server log
};

const WORKLET = `
class Tap extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) this.port.postMessage(ch.slice(0));
    return true;
  }
}
registerProcessor('tap', Tap);`;

const TARGET_RATE = 16000;
const BLOCK_MS = 20;       // loudness is judged over blocks this long, not single audio frames
const START_MS = 140;      // speech must persist this long to count
const END_MS = 950;        // silence that ends an utterance
const PREROLL_MS = 350;    // audio kept from before speech was detected
const MAX_MS = 22000;
const MIN_MS = 380;

export class VoiceEngine {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  private src: MediaStreamAudioSourceNode | null = null;
  private tapReady = false;
  private tried = new Set<string>();
  private outAnalyser: AnalyserNode | null = null;
  private state: VoiceState = "off";
  private h: Handlers;

  private noise = 0.004;
  private blkSum = 0;
  private blkN = 0;
  private stat = { blocks: 0, loud: 0, max: 0, sum: 0 };
  private statTimer = 0;
  private pre: Float32Array[] = [];
  private preLen = 0;
  private cur: Float32Array[] = [];
  private curLen = 0;
  private aboveMs = 0;
  private belowMs = 0;
  private capturing = false;
  private holdToTalk = false;
  private frames = 0;
  private peak = 0;
  private micTimer = 0;

  private queue: AudioBuffer[] = [];
  private playing: AudioBufferSourceNode | null = null;
  private expectMore = false;
  private afterSpeech: (() => void) | null = null;
  private raf = 0;

  constructor(h: Handlers) { this.h = h; }

  get current() { return this.state; }
  get active() { return this.state !== "off"; }

  private set(s: VoiceState) { if (this.state !== s) { this.state = s; this.h.onState(s); } }

  // Must be called from a tap. Unlocks audio output even if the mic is refused.
  async unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AC({ latencyHint: "interactive" });
      this.outAnalyser = this.ctx.createAnalyser();
      this.outAnalyser.fftSize = 512;
      this.outAnalyser.connect(this.ctx.destination);
    }
    if (this.ctx.state !== "running") await this.ctx.resume();
    return this.ctx;
  }

  async start() {
    try {
      const ctx = await this.unlock();
      if (!this.stream) {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("This browser cannot use the microphone here. Open the app over HTTPS.");
        this.tried.clear();
        await this.open(ctx);
      }
      this.resetCapture();
      this.frames = 0; this.peak = 0;
      const track = this.stream!.getAudioTracks()[0];
      this.h.onDebug?.("mic-open", { label: track?.label, muted: track?.muted, settings: track?.getSettings?.(), rate: ctx.sampleRate, ctx: ctx.state });
      this.set("listening");
      this.watchMic(); this.report();
    } catch (err: any) {
      const denied = err?.name === "NotAllowedError" || err?.name === "SecurityError";
      this.h.onDebug?.("mic-error", { name: err?.name, message: err?.message });
      this.h.onError(denied ? "Microphone access was blocked. Allow it in the browser settings, or type instead." : err?.message || "Could not start the microphone.");
      this.set("off");
    }
  }

  // Opens a microphone (the browser's default, or a named one) and taps its audio.
  private async open(ctx: AudioContext, deviceId?: string) {
    this.closeMic();
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { ...(deviceId ? { deviceId: { exact: deviceId } } : {}), echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    if (!this.tapReady) {
      const url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
      await ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      this.tapReady = true;
    }
    this.src = ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(ctx, "tap", { numberOfInputs: 1, numberOfOutputs: 1 });
    this.node.port.onmessage = (e) => this.onFrame(e.data as Float32Array, ctx.sampleRate);
    this.src.connect(this.node);
    // Some browsers (Safari) only run nodes that lead to the speakers, so the tap
    // is wired to the output through a silent gain.
    const mute = ctx.createGain(); mute.gain.value = 0;
    this.node.connect(mute); mute.connect(ctx.destination);
    const id = this.stream.getAudioTracks()[0]?.getSettings?.().deviceId; if (id) this.tried.add(id);
  }

  private closeMic() {
    this.stream?.getTracks().forEach((t) => t.stop());
    if (this.node) { this.node.port.onmessage = null; this.node.disconnect(); }
    this.src?.disconnect();
    this.stream = null; this.node = null; this.src = null;
  }

  // Some laptops put a virtual "noise-cancelling" microphone first, and it can hand
  // the browser pure silence. When that happens, move on to the next real microphone.
  private async nextMic(): Promise<boolean> {
    try {
      const all = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput" && d.deviceId && d.deviceId !== "default" && d.deviceId !== "communications");
      const next = all.find((d) => !this.tried.has(d.deviceId));
      this.h.onDebug?.("mic-silent", { tried: this.tried.size, available: all.map((d) => d.label), next: next?.label ?? null });
      if (!next || !this.ctx) return false;
      this.tried.add(next.deviceId);
      await this.open(this.ctx, next.deviceId);
      this.frames = 0; this.peak = 0; this.resetCapture();
      const track = this.stream!.getAudioTracks()[0];
      this.h.onDebug?.("mic-open", { label: track?.label, muted: track?.muted, settings: track?.getSettings?.(), rate: this.ctx.sampleRate, ctx: this.ctx.state, switched: true });
      this.watchMic();
      return true;
    } catch (err: any) { this.h.onDebug?.("mic-error", { name: err?.name, message: err?.message, during: "switch" }); return false; }
  }

  // Says so when the microphone is open but nothing is coming through, instead of
  // sitting on "Listening" for ever.
  private watchMic() {
    clearTimeout(this.micTimer);
    this.micTimer = window.setTimeout(async () => {
      if (!this.stream || this.state === "off") return;
      if (this.frames > 0 && this.peak >= 0.0005) return;                // sound is arriving
      // Levels are only measured while listening; during a reply, check again afterwards.
      if (this.state !== "listening" && this.state !== "hearing") { this.watchMic(); return; }
      const label = this.stream.getAudioTracks()[0]?.label;
      if (await this.nextMic()) return;
      this.h.onError(this.frames === 0 ? "The microphone is open but no sound is reaching the app. Reload the page, or type instead."
        : `${label ? `"${label}"` : "The microphone"} is sending silence. Pick another microphone in the browser's site settings, check it is not muted in Windows, or type instead.`);
    }, 2500);
  }

  // Ends the conversation and releases the microphone.
  stop() {
    clearTimeout(this.micTimer); clearInterval(this.statTimer);
    this.stopSpeaking();
    this.closeMic();
    this.resetCapture();
    this.set("off");
    this.h.onLevel(0);
  }

  // Hold-to-talk: capture from press to release, ignoring silence detection.
  pressStart() { if (this.state === "speaking") this.stopSpeaking(); this.holdToTalk = true; this.resetCapture(); this.capturing = true; this.set("hearing"); }
  pressEnd() { if (this.holdToTalk) { this.holdToTalk = false; this.finish(); } }

  private resetCapture() { this.blkSum = 0; this.blkN = 0; this.cur = []; this.curLen = 0; this.pre = []; this.preLen = 0; this.aboveMs = 0; this.belowMs = 0; this.capturing = false; }

  private onFrame(frame: Float32Array, rate: number) {
    this.frames++;
    if (this.state !== "listening" && this.state !== "hearing") return;
    let sum = 0;
    for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
    const rms = Math.sqrt(sum / frame.length);
    const ms = (frame.length / rate) * 1000;
    if (rms > this.peak) this.peak = rms;
    this.h.onLevel(Math.min(1, rms * 9));

    if (this.holdToTalk) { this.cur.push(frame); this.curLen += frame.length; if ((this.curLen / rate) * 1000 > MAX_MS) this.pressEnd(); return; }

    // Keep the audio itself frame by frame.
    if (this.capturing) { this.cur.push(frame); this.curLen += frame.length; }
    else {
      this.pre.push(frame); this.preLen += frame.length;
      while (this.pre.length > 1 && ((this.preLen - this.pre[0].length) / rate) * 1000 >= PREROLL_MS) this.preLen -= this.pre.shift()!.length;
    }
    // Judge loudness over 20 ms blocks. A single 3 ms frame swings too much within
    // one syllable, and a quiet laptop microphone never held above the old fixed floor.
    this.blkSum += sum; this.blkN += frame.length;
    if ((this.blkN / rate) * 1000 < BLOCK_MS) return;
    const level = Math.sqrt(this.blkSum / this.blkN), span = (this.blkN / rate) * 1000;
    this.blkSum = 0; this.blkN = 0;
    // The room's own level: falls quickly, rises slowly, and never learns from speech.
    const startAt = Math.max(0.0035, this.noise * 3), endAt = Math.max(0.0028, this.noise * 2);
    const loud = level > (this.capturing ? endAt : startAt);
    if (level < this.noise) this.noise = this.noise * 0.7 + level * 0.3;
    else if (!this.capturing && !loud) this.noise = Math.min(0.05, this.noise * 0.97 + level * 0.03);
    this.stat.blocks++; this.stat.sum += level; if (loud) this.stat.loud++; if (level > this.stat.max) this.stat.max = level;

    if (!this.capturing) {
      this.aboveMs = loud ? this.aboveMs + span : Math.max(0, this.aboveMs - span * 0.5);
      if (this.aboveMs >= START_MS) {
        this.capturing = true; this.belowMs = 0;
        this.cur = this.pre; this.curLen = this.preLen; this.pre = []; this.preLen = 0;
        this.h.onDebug?.("speech-start", { level: +level.toFixed(4), noise: +this.noise.toFixed(4), startAt: +startAt.toFixed(4) });
        this.set("hearing");
      }
      return;
    }
    this.belowMs = loud ? 0 : this.belowMs + span;
    if (this.belowMs >= END_MS || (this.curLen / rate) * 1000 >= MAX_MS) this.finish(rate);
  }

  // Every two seconds while the microphone is live: what it is actually hearing.
  private report() {
    clearInterval(this.statTimer);
    this.statTimer = window.setInterval(() => {
      if (!this.stream) { clearInterval(this.statTimer); return; }
      const s = this.stat; this.stat = { blocks: 0, loud: 0, max: 0, sum: 0 };
      this.h.onDebug?.("level", { state: this.state, frames: this.frames, blocks: s.blocks, loud: s.loud, max: +s.max.toFixed(4), avg: +(s.blocks ? s.sum / s.blocks : 0).toFixed(4),
        noise: +this.noise.toFixed(4), ctx: this.ctx?.state });
    }, 2000);
  }

  private finish(rate = this.ctx?.sampleRate ?? 48000) {
    const chunks = this.cur, len = this.curLen;
    const spokenMs = (len / rate) * 1000 - (this.holdToTalk ? 0 : this.belowMs);
    this.resetCapture();
    if (spokenMs < MIN_MS) { this.h.onDebug?.("too-short", { spokenMs: Math.round(spokenMs) }); this.set("listening"); return; }
    const pcm = new Float32Array(len);
    let o = 0; for (const c of chunks) { pcm.set(c, o); o += c.length; }
    this.set("thinking");
    this.h.onLevel(0);
    this.h.onDebug?.("utterance", { seconds: +(len / rate).toFixed(2), spokenMs: Math.round(spokenMs) });
    this.h.onUtterance(encodeWav(downsample(pcm, rate, TARGET_RATE), TARGET_RATE), len / rate);
  }

  // ----- playback -----
  // Call once per assistant turn before queueing audio.
  beginReply(onDone: () => void) { this.expectMore = true; this.afterSpeech = onDone; }

  async enqueue(b64: string, last: boolean) {
    // The person has started talking over a reply that is still arriving: they win.
    if (this.state === "hearing") { if (last) this.expectMore = false; return; }
    const ctx = await this.unlock();
    const bin = atob(b64); const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    try {
      const buf = await ctx.decodeAudioData(bytes.buffer);
      this.queue.push(buf);
    } catch { /* skip a chunk that will not decode */ }
    if (last) this.expectMore = false;
    if (!this.playing) this.playNext();
  }

  // Marks the reply as complete when no audio is coming (text only, or an error).
  endReply() { this.expectMore = false; if (!this.playing && !this.queue.length) this.replyDone(); }

  private playNext() {
    const ctx = this.ctx!;
    const buf = this.queue.shift();
    if (!buf) { if (!this.expectMore) this.replyDone(); return; }
    const src = ctx.createBufferSource();
    src.buffer = buf; src.connect(this.outAnalyser!);
    src.onended = () => { if (this.playing === src) { this.playing = null; this.playNext(); } };
    this.playing = src;
    if (this.state !== "off" || true) this.set("speaking");
    src.start();
    this.pumpOutLevel();
  }

  private pumpOutLevel() {
    cancelAnimationFrame(this.raf);
    const data = new Uint8Array(this.outAnalyser!.fftSize);
    const tick = () => {
      if (!this.playing) { this.h.onLevel(0); return; }
      this.outAnalyser!.getByteTimeDomainData(data);
      let s = 0; for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; s += v * v; }
      this.h.onLevel(Math.min(1, Math.sqrt(s / data.length) * 5));
      this.raf = requestAnimationFrame(tick);
    };
    tick();
  }

  private replyDone() {
    const cb = this.afterSpeech; this.afterSpeech = null;
    cb?.();
  }

  stopSpeaking() {
    this.queue = []; this.expectMore = false;
    const p = this.playing; this.playing = null;
    try { p?.stop(); } catch {}
    cancelAnimationFrame(this.raf);
  }

  // After a reply: keep listening if the mic is live, otherwise go quiet.
  // If the person is already mid-sentence, leave their words alone.
  resume() {
    if (!this.stream) { this.set("off"); return; }
    if (this.state === "hearing" || this.state === "listening") return;
    this.resetCapture(); this.set("listening");
  }
  setThinking() { this.set("thinking"); }

  // One-off sound outside a conversation (a new-order announcement).
  async playOnce(b64: string) {
    if (this.state === "hearing" || this.state === "thinking" || this.state === "speaking") return;
    const wasListening = this.state === "listening";
    this.beginReply(() => (wasListening ? this.resume() : this.set("off")));
    await this.enqueue(b64, true);
  }
}

function downsample(input: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return input;
  const ratio = from / to; const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const start = Math.floor(i * ratio), end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let s = 0; for (let j = start; j < end; j++) s += input[j];
    out[i] = s / Math.max(1, end - start);
  }
  return out;
}

function encodeWav(samples: Float32Array, rate: number): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2); const v = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF"); v.setUint32(4, 36 + samples.length * 2, true); str(8, "WAVE"); str(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, "data"); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) { const s = Math.max(-1, Math.min(1, samples[i])); v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
  return new Blob([buf], { type: "audio/wav" });
}
