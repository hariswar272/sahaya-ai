import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Bot, Loader2, Mic, Phone, PhoneOff, Send, Sparkles, Volume2 } from "lucide-react";
import { api, type VoiceLine, type VoiceReply } from "@/lib/api";
import { cn, accentClasses, type Accent } from "@/lib/utils";
import { useLang, VOICE_LANG, type Lang } from "@/lib/i18n";
import { Button, Card, Input } from "@/components/ui";

export type VoiceCallProps = {
  /** Call endpoint base, e.g. "/api/sos/call" (POST {base}/start and {base}/turn). */
  base: string;
  /** Extra body for /start (e.g. { patientId }). `lang` is always added. */
  startBody?: Record<string, unknown>;
  title?: string;
  /** Tappable sample lines; they start the call if needed and send as typed text. */
  samples?: string[];
  /** Samples shown when the UI language is English. */
  samplesEn?: string[];
  /** Per-language samples (wins over samples / samplesEn). */
  samplesByLang?: Partial<Record<Lang, string[]>>;
  /** Every server reply (start + each turn). */
  onUpdate?: (r: VoiceReply) => void;
  /** Final reply (done: true). */
  onDone?: (r: VoiceReply) => void;
  /** Right-hand panel (e.g. "What the AI understood"). */
  side?: ReactNode;
  accent?: Accent;
  startLabel?: string;
  /** Re-open the mic after each agent reply. Default true. */
  autoListen?: boolean;
  /** English subtitles under agent lines. Default true. */
  subtitles?: boolean;
  emptyHint?: ReactNode;
  className?: string;
};

type CallState = "ready" | "connecting" | "listening" | "thinking" | "speaking" | "waiting" | "ended";
type Msg = { id: number; who: "agent"; lines: VoiceLine[] } | { id: number; who: "caller"; said: string };

const STATUS: Record<CallState, [string, string]> = {
  ready: ["కాల్ మొదలుపెట్టడానికి Start నొక్కండి", "Press Start call and speak in Telugu."],
  connecting: ["కనెక్ట్ అవుతోంది…", "Connecting…"],
  listening: ["వింటున్నాను… మాట్లాడండి", "Listening. Speak now."],
  thinking: ["AI అర్థం చేసుకుంటోంది…", "AI is understanding…"],
  speaking: ["AI మాట్లాడుతోంది…", "AI is speaking…"],
  waiting: ["Speak నొక్కి మాట్లాడండి", "Tap Speak and talk, or type below."],
  ended: ["కాల్ ముగిసింది", "Call ended"],
};

/** 0.1 s of silence; playing it inside a tap unlocks audio on iOS Safari. */
const SILENT_WAV = (() => {
  if (typeof btoa === "undefined") return "";
  const n = 800;
  const view = new DataView(new ArrayBuffer(44 + n * 2));
  const w = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
  };
  w(0, "RIFF");
  view.setUint32(4, 36 + n * 2, true);
  w(8, "WAVE");
  w(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true);
  view.setUint32(28, 16000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  w(36, "data");
  view.setUint32(40, n * 2, true);
  const bytes = new Uint8Array(view.buffer);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return `data:audio/wav;base64,${btoa(s)}`;
})();

/** Decode any recorded blob and re-encode it as 16 kHz mono 16-bit WAV, base64. */
export async function toWav16k(blob: Blob, ctx: BaseAudioContext): Promise<string> {
  const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
  const length = Math.max(1, Math.ceil(decoded.duration * 16000));
  const off = new OfflineAudioContext(1, length, 16000);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start();
  const pcm = (await off.startRendering()).getChannelData(0);
  const view = new DataView(new ArrayBuffer(44 + pcm.length * 2));
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  view.setUint32(4, 36 + pcm.length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true);
  view.setUint32(28, 32000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  str(36, "data");
  view.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i])) * 0x7fff, true);
  const bytes = new Uint8Array(view.buffer);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
  return btoa(s);
}

export function VoiceCall({
  base,
  startBody,
  title = "AI voice call",
  samples,
  samplesEn,
  samplesByLang,
  onUpdate,
  onDone,
  side,
  accent = "primary",
  startLabel,
  autoListen = true,
  subtitles = true,
  emptyHint,
  className,
}: VoiceCallProps) {
  const [state, setStateRaw] = useState<CallState>("ready");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [timing, setTiming] = useState("");
  const [typedMode, setTypedMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");

  const { lang, t, tr } = useLang();

  // Props in a ref so long-lived callbacks always see the latest values.
  const props = useRef({ base, startBody, onUpdate, onDone, autoListen, lang });
  props.current = { base, startBody, onUpdate, onDone, autoListen, lang };

  const stateRef = useRef<CallState>("ready");
  const sessionRef = useRef<string | null>(null);
  const endedRef = useRef(true);
  const busyRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const recMeta = useRef({ spoke: false, discard: false });
  const chunksRef = useRef<Blob[]>([]);
  const vadRef = useRef<number | undefined>(undefined);
  const srcRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const unlockedRef = useRef(false);
  const pendingTap = useRef<(() => void) | null>(null);
  const [needTap, setNeedTap] = useState(false);
  const [noRecorder, setNoRecorder] = useState(false);
  const playDone = useRef<(() => void) | null>(null);
  const levelRef = useRef<HTMLDivElement | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);
  const msgId = useRef(0);

  const setState = useCallback((s: CallState) => {
    stateRef.current = s;
    setStateRaw(s);
  }, []);

  const addMsg = useCallback((m: { who: "agent"; lines: VoiceLine[] } | { who: "caller"; said: string }) => {
    setMsgs((prev) => [...prev, { ...m, id: ++msgId.current } as Msg]);
  }, []);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, state]);

  /** One persistent player, so iOS/Chrome autoplay rules see the user's tap. */
  const player = useCallback((): HTMLAudioElement => {
    if (!audioRef.current) {
      const el = new Audio();
      el.preload = "auto";
      el.setAttribute("playsinline", "");
      audioRef.current = el;
    }
    return audioRef.current;
  }, []);

  /**
   * Must run synchronously inside a click/tap handler. Plays a silent clip on the persistent
   * element and resumes the AudioContext, which unlocks audio for later async replies.
   */
  const unlockAudio = useCallback(() => {
    try {
      const el = player();
      if (!unlockedRef.current) {
        el.src = SILENT_WAV;
        const p = el.play();
        if (p) p.then(() => (unlockedRef.current = true)).catch(() => {});
      }
    } catch {
      /* ignore */
    }
    try {
      if (!ctxRef.current && typeof AudioContext !== "undefined") ctxRef.current = new AudioContext();
      if (ctxRef.current?.state === "suspended") void ctxRef.current.resume();
    } catch {
      /* ignore */
    }
  }, [player]);

  const stopAudio = useCallback(() => {
    audioRef.current?.pause();
    pendingTap.current = null;
    setNeedTap(false);
    playDone.current?.();
    playDone.current = null;
  }, []);

  const play = useCallback(
    (b64: string) =>
      new Promise<void>((resolve) => {
        const el = player();
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          el.onended = null;
          el.onerror = null;
          playDone.current = null;
          pendingTap.current = null;
          setNeedTap(false);
          resolve();
        };
        playDone.current = done;
        el.onended = done;
        el.onerror = done;
        el.src = `data:audio/wav;base64,${b64}`;
        const p = el.play();
        if (p)
          p.catch((err: unknown) => {
            // Autoplay blocked (iOS Safari): ask for one tap instead of silently skipping the reply.
            if (err && (err as { name?: string }).name === "NotAllowedError" && !endedRef.current) {
              pendingTap.current = () => {
                el.play().catch(done);
              };
              setNeedTap(true);
            } else done();
          });
      }),
    [player],
  );

  /** "Tap to hear the reply": runs inside the tap, so play() is allowed. */
  const hearPending = useCallback(() => {
    unlockAudio();
    setNeedTap(false);
    pendingTap.current?.();
  }, [unlockAudio]);

  const cleanupVad = useCallback(() => {
    window.clearInterval(vadRef.current);
    vadRef.current = undefined;
    try {
      srcRef.current?.disconnect();
    } catch {
      /* already disconnected */
    }
    srcRef.current = null;
    if (levelRef.current) levelRef.current.style.transform = "";
  }, []);

  const releaseMic = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const stopListening = useCallback(
    (discard: boolean) => {
      const rec = recRef.current;
      if (rec && rec.state === "recording") {
        recMeta.current.discard = discard;
        rec.stop();
      } else cleanupVad();
    },
    [cleanupVad],
  );

  const speak = useCallback(
    async (r: VoiceReply) => {
      const lines = r.reply ?? [];
      if (lines.length) addMsg({ who: "agent", lines });
      const audios = (r.audios ?? []).filter((a): a is string => !!a);
      if (!audios.length) return;
      setState("speaking");
      for (const a of audios) {
        if (endedRef.current) break;
        await play(a);
      }
    },
    [addMsg, play, setState],
  );

  const finish = useCallback(
    (r: VoiceReply) => {
      endedRef.current = true;
      stopListening(true);
      releaseMic();
      setState("ended");
      props.current.onDone?.(r);
    },
    [releaseMic, setState, stopListening],
  );

  // Declared via refs so listen <-> turn can call each other.
  const listenRef = useRef<() => void>(() => {});
  const turnRef = useRef<(payload: { audio?: string; text?: string }) => Promise<void>>(async () => {});

  const onRecorded = useCallback(
    async (rec: MediaRecorder, meta: { spoke: boolean; discard: boolean }) => {
      if (endedRef.current) return;
      if (!meta.spoke) {
        setState("waiting");
        return;
      }
      setState("thinking");
      try {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        const audio = await toWav16k(blob, ctxRef.current!);
        await turnRef.current({ audio });
      } catch {
        setError("Couldn't process that audio. Please try again or type your reply.");
        setState("waiting");
      }
    },
    [setState],
  );

  const listen = useCallback(() => {
    if (endedRef.current || busyRef.current) return;
    if (recRef.current?.state === "recording") return;
    const stream = streamRef.current;
    const ctx = ctxRef.current;
    if (typeof MediaRecorder === "undefined") {
      setNoRecorder(true);
      setTypedMode(true);
      setState("waiting");
      return;
    }
    if (!stream || !ctx) {
      setState("waiting");
      return;
    }
    chunksRef.current = [];
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream);
    } catch {
      setTypedMode(true);
      setState("waiting");
      return;
    }
    const meta = { spoke: false, discard: false };
    recRef.current = rec;
    recMeta.current = meta;
    rec.ondataavailable = (e) => {
      if (e.data.size) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      cleanupVad();
      if (!meta.discard) void onRecorded(rec, meta);
    };
    rec.start();
    setState("listening");

    // If the AudioContext is still suspended (some WebViews), the level meter reads silence:
    // try to resume it, and fall back to a fixed 8 s turn so the caller is still heard.
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
    const src = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser();
    an.fftSize = 1024;
    src.connect(an);
    srcRef.current = src;
    const buf = new Float32Array(an.fftSize);
    const t0 = performance.now();
    let last = t0;
    window.clearInterval(vadRef.current);
    vadRef.current = window.setInterval(() => {
      an.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      if (levelRef.current) levelRef.current.style.transform = `scale(${1 + Math.min(rms * 14, 0.7)})`;
      const now = performance.now();
      if (rms > 0.02) {
        meta.spoke = true;
        last = now;
      }
      if (ctx.state !== "running") {
        if (now - t0 > 8000) {
          meta.spoke = true;
          stopListening(false);
        }
        return;
      }
      if ((meta.spoke && now - last > 1300) || now - t0 > 15000) stopListening(false);
    }, 80);
  }, [cleanupVad, onRecorded, setState, stopListening]);
  listenRef.current = listen;

  const turn = useCallback(
    async (payload: { audio?: string; text?: string }) => {
      if (busyRef.current || !sessionRef.current || endedRef.current) return;
      busyRef.current = true;
      setBusy(true);
      setError(null);
      if (payload.text) addMsg({ who: "caller", said: payload.text });
      setState("thinking");
      let done = false;
      try {
        const r = await api<VoiceReply>(`${props.current.base}/turn`, { ...payload, sessionId: sessionRef.current, lang: VOICE_LANG });
        if (endedRef.current) return;
        if (r.said && !payload.text) addMsg({ who: "caller", said: r.said });
        props.current.onUpdate?.(r);
        if (r.timing) {
          const parts = [];
          if (r.timing.sttMs != null) parts.push(`Speech-to-text ${r.timing.sttMs} ms`);
          if (r.timing.aiMs != null) parts.push(`AI ${r.timing.aiMs} ms`);
          if (r.engine) parts.push(`engine: ${r.engine}`);
          setTiming(parts.join(" · "));
        }
        await speak(r);
        if (r.done) {
          done = true;
          finish(r);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
      if (!done && !endedRef.current) {
        if (props.current.autoListen) listenRef.current();
        else setState("waiting");
      }
    },
    [addMsg, finish, setState, speak],
  );
  turnRef.current = turn;

  const startCall = useCallback(async () => {
    if (!endedRef.current && stateRef.current !== "ready") return;
    endedRef.current = false;
    sessionRef.current = null;
    setMsgs([]);
    setError(null);
    setTiming("");
    setState("connecting");

    if (!streamRef.current) {
      try {
        streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
        setTypedMode(false);
      } catch {
        streamRef.current = null;
        setTypedMode(true);
      }
    }
    try {
      const ctx = ctxRef.current ?? new AudioContext();
      ctxRef.current = ctx;
      // Some WebViews never settle resume() outside a tap; never let it block the call.
      if (ctx.state === "suspended") await Promise.race([ctx.resume().catch(() => {}), new Promise((r) => window.setTimeout(r, 700))]);
    } catch {
      setTypedMode(true);
    }

    try {
      // The voice language always wins over any lang a module passes.
      const r = await api<VoiceReply>(`${props.current.base}/start`, { ...(props.current.startBody ?? {}), lang: VOICE_LANG });
      if (endedRef.current) return;
      sessionRef.current = r.sessionId ?? null;
      props.current.onUpdate?.(r);
      await speak(r);
      if (r.done) {
        finish(r);
        return;
      }
      if (!endedRef.current) listenRef.current();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the call");
      endedRef.current = true;
      releaseMic();
      setState("ended");
    }
  }, [finish, releaseMic, setState, speak]);

  const endCall = useCallback(() => {
    endedRef.current = true;
    stopListening(true);
    stopAudio();
    releaseMic();
    setState("ended");
  }, [releaseMic, setState, stopAudio, stopListening]);

  const submitText = useCallback(
    async (value: string) => {
      const t = value.trim();
      if (!t) return;
      if (endedRef.current || !sessionRef.current) {
        if (stateRef.current === "connecting") return;
        await startCall();
        if (!sessionRef.current || endedRef.current) return;
      }
      if (busyRef.current) return;
      stopListening(true);
      stopAudio();
      setText("");
      await turn({ text: t });
    },
    [startCall, stopAudio, stopListening, turn],
  );

  const onMic = useCallback(() => {
    if (stateRef.current === "listening") {
      recMeta.current.spoke = true;
      stopListening(false);
      return;
    }
    if (busyRef.current || endedRef.current) return;
    stopAudio();
    listenRef.current();
  }, [stopAudio, stopListening]);

  useEffect(
    () => () => {
      endedRef.current = true;
      const rec = recRef.current;
      if (rec && rec.state === "recording") {
        recMeta.current.discard = true;
        try {
          rec.stop();
        } catch {
          /* ignore */
        }
      }
      window.clearInterval(vadRef.current);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.removeAttribute("src");
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      ctxRef.current?.close().catch(() => {});
    },
    [],
  );

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    unlockAudio();
    void submitText(text);
  };

  const a = accentClasses[accent];
  const inCall = state !== "ready" && state !== "ended";
  const [statusTe, statusEn] =
    state === "waiting" && typedMode
      ? noRecorder
        ? ["మీ సమాధానం టైప్ చేయండి", "This browser can't record voice. Type your reply below."]
        : ["మీ సమాధానం టైప్ చేయండి", "Microphone unavailable. Type your reply below."]
      : STATUS[state];
  const statusMain = t(statusTe, statusEn);
  const statusSub = lang === "en" ? "" : statusEn;
  // Samples are Telugu sentences (the voice language) with a small English gloss when given.
  const chips = samplesByLang?.te ?? samples ?? samplesEn ?? [];
  const gloss = samplesEn && samplesEn.length === chips.length && chips !== samplesEn ? samplesEn : undefined;
  // Conversation content: the Telugu line, with the English subtitle under it.
  const lineText = (l: VoiceLine) => l.text || l.te || l.en;
  void lang;
  void tr;

  return (
    <div className={cn("grid gap-4", side ? "lg:grid-cols-[minmax(0,1.3fr)_minmax(0,.7fr)]" : "", className)}>
      <Card className="flex min-w-0 flex-col overflow-hidden">
        {/* Header: state ring, status, controls */}
        <div className="flex flex-wrap items-center gap-4 border-b border-slate-100 p-4 sm:p-5">
          <div className="relative grid h-16 w-16 shrink-0 place-items-center">
            <div
              ref={levelRef}
              className={cn(
                "absolute inset-0 rounded-full transition-transform duration-75",
                state === "listening" ? "bg-green-100" : state === "speaking" ? a.bgSoft : state === "thinking" ? "bg-primary-50" : "bg-slate-100",
              )}
            />
            {state === "thinking" && <div className="absolute inset-0 animate-spin rounded-full border-2 border-primary-200 border-t-primary" />}
            <div
              className={cn(
                "relative grid h-12 w-12 place-items-center rounded-full text-white shadow-sm transition-colors",
                state === "listening" ? "animate-ring-pulse bg-green-600" : state === "speaking" ? a.bg : state === "thinking" ? "bg-primary" : inCall ? "bg-slate-700" : "bg-slate-400",
              )}
            >
              {state === "listening" ? (
                <Mic className="h-5 w-5" />
              ) : state === "speaking" ? (
                <Volume2 className="h-5 w-5" />
              ) : state === "thinking" || state === "connecting" ? (
                <Sparkles className="h-5 w-5" />
              ) : (
                <Bot className="h-5 w-5" />
              )}
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <div className={cn("text-xs font-bold uppercase tracking-wider", a.text)}>{title}</div>
            <div className="te text-lg font-bold leading-snug text-ink">{statusMain}</div>
            {statusSub && statusSub !== statusMain && <div className="text-sm text-slate-500">{statusSub}</div>}
          </div>
          <div className="flex w-full shrink-0 gap-2 sm:w-auto">
            {!inCall ? (
              <Button size="lg" accent={accent} icon={<Phone className="h-4 w-4" />} onClick={() => {
                  unlockAudio();
                  void startCall();
                }} className="flex-1 sm:flex-none">
                {startLabel ?? (state === "ended" ? t("మళ్ళీ కాల్ చేయండి", "Call again") : t("కాల్ ప్రారంభించండి", "Start call"))}
              </Button>
            ) : (
              <>
                {!typedMode && (
                  <Button
                    size="lg"
                    variant={state === "listening" ? "success" : "secondary"}
                    icon={state === "listening" ? <Send className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                    onClick={() => {
                      unlockAudio();
                      onMic();
                    }}
                    disabled={busy || state === "connecting"}
                    className="flex-1 sm:flex-none"
                  >
                    {state === "listening" ? t("పంపండి", "Send") : t("మాట్లాడండి", "Speak")}
                  </Button>
                )}
                <Button size="lg" variant="danger" icon={<PhoneOff className="h-4 w-4" />} onClick={endCall} className="flex-1 sm:flex-none">
                  {t("ముగించు", "End")}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Conversation */}
        <div ref={logRef} className="scrollbar-thin flex max-h-[52vh] min-h-[260px] flex-1 flex-col gap-3 overflow-y-auto bg-slate-50/70 p-4">
          {msgs.length === 0 && state !== "connecting" ? (
            <div className="m-auto max-w-sm text-center text-sm leading-relaxed text-slate-500">
              {emptyHint ?? (
                <>
                  <div className="te mb-1 text-base font-semibold text-slate-600">{t("మీ భాషలో మాట్లాడండి, AI వింటుంది", "Speak in Telugu. The AI is listening.")}</div>
                  {t(
                    "కాల్ మొదలుపెట్టి సహజంగా మాట్లాడండి. AI తెలియాల్సినవి మాత్రమే అడుగుతుంది.",
                    "Start the call and speak naturally in Telugu or a Telugu–English mix. The AI asks only for what's missing.",
                  )}
                </>
              )}
            </div>
          ) : (
            msgs.map((m) => {
              if (m.who === "agent") {
                const main = m.lines.map(lineText).join(" ");
                const en = m.lines.map((l) => l.en).join(" ");
                return (
                  <div key={m.id} className="flex max-w-[90%] animate-fade-up items-start gap-2 self-start">
                    <div className={cn("mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full text-white", a.bg)}>
                      <Bot className="h-4 w-4" />
                    </div>
                    <div className="rounded-2xl rounded-tl-md border border-slate-200 bg-white px-3.5 py-2.5 shadow-sm">
                      <div className="te text-[15px] leading-relaxed text-ink">{main}</div>
                      {subtitles && en && en !== main && <div className="mt-1 text-xs leading-relaxed text-slate-500">{en}</div>}
                    </div>
                  </div>
                );
              }
              return (
                <div key={m.id} className={cn("max-w-[85%] animate-fade-up self-end rounded-2xl rounded-tr-md border px-3.5 py-2.5", a.bgSoft, a.border)}>
                  <div className="te text-[15px] leading-relaxed text-ink">{m.said}</div>
                </div>
              );
            })
          )}
          {(state === "thinking" || state === "connecting") && (
            <div className="flex items-center gap-2 self-start rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500 shadow-sm">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {state === "connecting" ? t("కనెక్ట్ అవుతోంది…", "Connecting…") : t("AI ఆలోచిస్తోంది…", "AI is thinking…")}
            </div>
          )}
          {needTap && (
            <button
              type="button"
              onClick={hearPending}
              className="focus-ring mx-auto flex animate-scale-in items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-lift transition hover:bg-primary-700 active:scale-95"
            >
              <Volume2 className="h-4 w-4" />
              Tap to hear the reply 🔊
            </button>
          )}
        </div>

        {/* Typed fallback */}
        <form onSubmit={onSubmit} className="flex gap-2 border-t border-slate-100 p-3">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={typedMode ? tr("Type your reply…") : tr("Or type instead…")}
            disabled={busy || state === "connecting"}
            className="te"
            aria-label="Type your reply"
          />
          <Button
            type="submit"
            accent={accent}
            aria-label={t("పంపండి", "Send")}
            disabled={!text.trim() || busy || state === "connecting"}
            icon={<Send className="h-4 w-4" />}
            className="h-11"
          >
            <span className="hidden sm:inline">{t("పంపండి", "Send")}</span>
          </Button>
        </form>

        {chips && chips.length > 0 && (
          <div className="border-t border-slate-100 px-3 pb-3 pt-2">
            <div className="mb-1.5 text-xs font-medium text-slate-500">Don't speak Telugu? Tap a sample line:</div>
            <div className="flex flex-wrap gap-1.5">
              {chips.map((s, i) => (
                <button
                  key={s}
                  type="button"
                  disabled={busy || state === "connecting"}
                  onClick={() => {
                    unlockAudio();
                    void submitText(s);
                  }}
                  className="max-w-full rounded-2xl border border-dashed border-slate-300 bg-white px-3 py-1.5 text-left transition hover:border-solid hover:border-slate-400 active:scale-[.98] disabled:opacity-50"
                  title={gloss?.[i] ?? s}
                >
                  <span className="te block truncate text-[13px] text-slate-800">{s}</span>
                  {gloss?.[i] && <span className="block truncate text-[11px] text-slate-500">{gloss[i]}</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {(timing || error) && (
          <div className="px-4 pb-3 text-xs">{error ? <span className="font-medium text-red-600">{error}</span> : <span className="text-slate-400">{timing}</span>}</div>
        )}
      </Card>
      {side && <div className="flex min-w-0 flex-col gap-4">{side}</div>}
    </div>
  );
}

export default VoiceCall;
