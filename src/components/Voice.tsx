"use client";
import { useEffect, useRef, useState } from "react";

/** the four languages of the Swiss market; Chrome and Edge recognise all of them */
export const VOICE_LANGS = [["de-CH", "DE"], ["fr-CH", "FR"], ["it-CH", "IT"], ["en-GB", "EN"]] as const;

/* eslint-disable @typescript-eslint/no-explicit-any */
const Recognition = (): any => (typeof window === "undefined" ? null : (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition ?? null);

/**
 * Hold-to-talk (or click to start / stop) speech input. The browser turns speech into text, the text goes into the field,
 * where the person can correct it before anything is sent. Nothing is recorded or uploaded by this app.
 */
export default function Voice({ onText, lang, onLang }: { onText: (t: string) => void; lang: string; onLang: (l: string) => void }) {
  const [on, setOn] = useState(false);
  const [interim, setInterim] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const rec = useRef<any>(null);
  const supported = !!Recognition();
  useEffect(() => () => rec.current?.abort?.(), []);

  const start = () => {
    const R = Recognition();
    if (!R) return;
    const r = new R();
    r.lang = lang;
    r.interimResults = true;
    r.continuous = true;
    r.onresult = (e: any) => {
      let fin = "", mid = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) fin += e.results[i][0].transcript;
        else mid += e.results[i][0].transcript;
      }
      if (fin) onText(fin.trim());
      setInterim(mid);
    };
    r.onerror = (e: any) => { setErr(e.error === "not-allowed" ? "Microphone access was blocked. Allow it in the address bar." : e.error === "no-speech" ? "Nothing heard. Try again a little closer." : `Speech input stopped (${e.error}).`); setOn(false); };
    r.onend = () => { setOn(false); setInterim(""); };
    rec.current = r;
    setErr(null);
    r.start();
    setOn(true);
  };
  const stop = () => rec.current?.stop();

  if (!supported) return <p className="voice-note">Speech input works in Chrome, Edge and Safari.</p>;
  return (
    <div className="voice">
      <button type="button" className={`voice-btn ${on ? "on" : ""}`} onClick={() => (on ? stop() : start())} aria-pressed={on} aria-label={on ? "Stop speaking" : "Speak instead of typing"}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
        {on ? "Listening … click to stop" : "Speak"}
      </button>
      <div className="voice-langs" role="group" aria-label="Spoken language">
        {VOICE_LANGS.map(([code, label]) => <button key={code} type="button" aria-pressed={lang === code} disabled={on} onClick={() => onLang(code)}>{label}</button>)}
      </div>
      {interim ? <span className="voice-interim">{interim}</span> : null}
      {err ? <span className="voice-err" role="alert">{err}</span> : null}
    </div>
  );
}
