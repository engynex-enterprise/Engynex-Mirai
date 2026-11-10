"use client"

// Dictado por voz del chat, con las pausas naturales de una persona:
// - Con el dictado del navegador (Chrome, Edge, Safari): escucha continua; si el navegador corta la sesión en una pausa
//   (Android y Safari lo hacen), se reanuda sola y conserva lo dicho. Solo termina cuando la persona toca Detener o
//   cuando pasan SILENCIO_MS sin oír nada.
// - Sin dictado en el navegador (Firefox, algunas apps instaladas) o si el servicio falla: graba el audio, lo convierte a
//   WAV de 16 kHz y la IA lo pasa a texto (POST /v1/books/:b/chat/transcribe). También para con el silencio.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"

/** Silencio que da por terminado el dictado (una pausa natural dura 1 a 3 s). */
export const SILENCIO_MS = 7000
/** Tope de una grabación (la API acepta ~2 min en WAV de 16 kHz). */
const MAX_REC_MS = 115_000

type Result = { 0: { transcript: string }; isFinal: boolean }
type Rec = {
  lang: string; interimResults: boolean; continuous: boolean; start: () => void; stop: () => void; abort: () => void
  onresult: ((e: { results: ArrayLike<Result> }) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null
  onspeechstart?: (() => void) | null
}
type W = { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec }
const recCtor = () => (typeof window === "undefined" ? null : ((window as unknown as W).SpeechRecognition ?? (window as unknown as W).webkitSpeechRecognition ?? null))
const canRecord = () => typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined"
const noop = () => () => {}
const join = (a: string, b: string) => [a.trim(), b.trim()].filter(Boolean).join(" ")
// Android corta la escucha continua y repite resultados: allí se usa una sesión por frase y se reanuda sola.
const isAndroid = () => typeof navigator !== "undefined" && /android/i.test(navigator.userAgent)

export type VoiceState = "idle" | "listening" | "recording" | "transcribing"

/**
 * Dictado. `base()` = lo que ya había escrito; `onText(t)` recibe el texto completo (base + lo dictado) cada vez que
 * cambia; `transcribe(wav)` pasa el audio a texto con la IA cuando el navegador no dicta.
 */
export function useVoice(o: { base: () => string; onText: (t: string) => void; transcribe: (wav: Blob) => Promise<string>; onError: (msg: string) => void; onDone?: () => void }) {
  const [state, setState] = useState<VoiceState>("idle")
  const supported = useSyncExternalStore(noop, () => !!recCtor() || canRecord(), () => false)
  const opts = useRef(o)
  useEffect(() => { opts.current = o })
  const stopRef = useRef<() => void>(() => {})

  // ── Grabar y pasar a texto con la IA ──
  const record = useCallback(async () => {
    let stream: MediaStream
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }) } catch { opts.current.onError("Permite el micrófono en tu navegador para dictar."); setState("idle"); return }
    const chunks: Blob[] = []
    const mr = new MediaRecorder(stream)
    mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data) }
    // Silencio con un analizador de volumen.
    const ctx = new AudioContext()
    const an = ctx.createAnalyser()
    an.fftSize = 1024
    ctx.createMediaStreamSource(stream).connect(an)
    const buf = new Uint8Array(an.fftSize)
    const t0 = Date.now()
    let last = Date.now()
    const stop = () => { if (mr.state !== "inactive") mr.stop() }
    const tick = setInterval(() => {
      an.getByteTimeDomainData(buf)
      let peak = 0
      for (const v of buf) peak = Math.max(peak, Math.abs(v - 128))
      if (peak > 10) last = Date.now()
      if (Date.now() - last > SILENCIO_MS || Date.now() - t0 > MAX_REC_MS) stop()
    }, 200)
    mr.onstop = async () => {
      clearInterval(tick)
      stream.getTracks().forEach((t) => t.stop())
      void ctx.close()
      setState("transcribing")
      try {
        const wav = await toWav(new Blob(chunks, { type: mr.mimeType }))
        const text = await opts.current.transcribe(wav)
        if (text) opts.current.onText(join(opts.current.base(), text))
      } catch (e) { opts.current.onError((e as Error).message || "No pude pasar tu voz a texto.") }
      setState("idle")
      opts.current.onDone?.()
    }
    stopRef.current = stop
    mr.start(1000)
    setState("recording")
  }, [])

  // ── Dictado del navegador ──
  const listen = useCallback(() => {
    const C = recCtor()!
    let want = true
    let said = opts.current.base()
    let session = ""
    let last = Date.now()
    let r: Rec | null = null
    const tick = setInterval(() => { if (Date.now() - last > SILENCIO_MS) { want = false; r?.stop() } }, 500)
    const finish = () => {
      want = false
      clearInterval(tick)
      setState("idle")
      opts.current.onDone?.()
    }
    const start = () => {
      const x = new C()
      x.lang = "es-CO"; x.interimResults = true; x.continuous = !isAndroid()
      x.onresult = (e) => {
        let t = ""
        for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript
        session = t
        last = Date.now()
        opts.current.onText(join(said, session))
      }
      x.onspeechstart = () => { last = Date.now() }
      x.onerror = (e) => {
        if (e.error === "not-allowed" || e.error === "service-not-allowed") { want = false; opts.current.onError("Permite el micrófono en tu navegador para dictar.") }
        else if (e.error === "network" || e.error === "audio-capture") { want = false; if (canRecord()) { clearInterval(tick); r = null; void record(); return } opts.current.onError("No pude usar el dictado de tu navegador. Escribe tu mensaje.") }
        // "no-speech" y "aborted": onend decide si se reanuda.
      }
      x.onend = () => {
        said = join(said, session)
        session = ""
        if (r !== x) return
        if (want && Date.now() - last <= SILENCIO_MS) { try { start() } catch { finish() } }
        else finish()
      }
      r = x
      x.start()
    }
    stopRef.current = () => { want = false; r?.stop() }
    try { start(); setState("listening") } catch { finish() }
  }, [record])

  const toggle = useCallback(() => {
    if (state === "listening" || state === "recording") return stopRef.current()
    if (state === "transcribing") return
    if (recCtor()) listen()
    else if (canRecord()) void record()
  }, [state, listen, record])

  useEffect(() => () => stopRef.current(), [])
  return { state, supported, toggle, active: state !== "idle" }
}

/** Audio grabado (webm, ogg o mp4) → WAV mono de 16 kHz (lo entienden todos los modelos que oyen audio). */
export async function toWav(blob: Blob): Promise<Blob> {
  const ac = new AudioContext()
  const audio = await ac.decodeAudioData(await blob.arrayBuffer()).finally(() => void ac.close())
  const rate = 16000
  const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(audio.duration * rate)), rate)
  const src = off.createBufferSource()
  src.buffer = audio
  src.connect(off.destination)
  src.start()
  const pcm = (await off.startRendering()).getChannelData(0)
  const out = new DataView(new ArrayBuffer(44 + pcm.length * 2))
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)) }
  str(0, "RIFF"); out.setUint32(4, 36 + pcm.length * 2, true); str(8, "WAVE"); str(12, "fmt ")
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true); out.setUint32(24, rate, true)
  out.setUint32(28, rate * 2, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true); str(36, "data"); out.setUint32(40, pcm.length * 2, true)
  for (let i = 0; i < pcm.length; i++) out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i])) * 0x7fff, true)
  return new Blob([out.buffer], { type: "audio/wav" })
}
