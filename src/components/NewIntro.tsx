"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { confetti, PascalFace, Typed } from "./PascalFun";

const calm = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The curtain before a new website: a little site builds itself block by block (frame, menu bar, hero, cards,
 * footer), Pascal pops up and says hello, a burst of confetti, then everything lifts away and the first question
 * shows. About 2.5 s; a click or any key skips it; nothing plays when the visitor asked for reduced motion.
 */
export default function NewIntro({ first, onDone }: { first: boolean; onDone: () => void }) {
  const [phase, setPhase] = useState<"in" | "out">("in");
  const done = useRef(false);
  const onDoneRef = useRef(onDone);
  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);
  const finish = useCallback(() => {
    if (done.current) return;
    done.current = true;
    setPhase("out");
    setTimeout(() => onDoneRef.current(), 520);
  }, []);

  useEffect(() => {
    if (calm()) { done.current = true; onDoneRef.current(); return; }
    const pop = setTimeout(() => {
      const r = document.querySelector(".nx-site")?.getBoundingClientRect();
      if (r && !done.current) confetti(r.left + r.width / 2, r.top + r.height * 0.4, 38);
    }, 1550);
    const end = setTimeout(finish, 2500);
    const skip = () => finish();
    addEventListener("keydown", skip);
    return () => { clearTimeout(pop); clearTimeout(end); removeEventListener("keydown", skip); };
  }, [finish]);

  return (
    <div className={`nx ${phase}`} onClick={finish} role="presentation">
      <div className="nx-stage">
        <div className="nx-site" aria-hidden>
          <div className="nx-bar"><i /><i /><i /></div>
          <div className="nx-nav"><b /><span /><span /><span /><em /></div>
          <div className="nx-hero"><b /><span /><em /></div>
          <div className="nx-cards"><i /><i /><i /></div>
          <div className="nx-foot" />
          <span className="nx-cursor" />
        </div>
        <div className="nx-pascal">
          <span className="nx-face"><PascalFace mood="happy" size={56} /></span>
          <div className="nx-bubble" role="status">
            <Typed text={first ? "Hi, I'm Pascal! Let's build your first website. First, a little about you." : "Hi again! Let's build a new website."} />
          </div>
        </div>
      </div>
      <span className="nx-skip">Click or press any key to skip</span>
    </div>
  );
}
