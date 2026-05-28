import { useEffect, useRef, useSyncExternalStore, useCallback } from "react";

/**
 * Smoothly reveals text character-by-character at a constant rate,
 * creating a fluid typewriter effect regardless of how tokens arrive from SSE.
 * 
 * Key insight: SSE tokens arrive in bursts. Instead of chasing the target,
 * we maintain a constant reveal rate and let the buffer absorb bursts.
 */
export function useSmoothReveal(targetText: string | undefined, isStreaming: boolean): string {
  const target = targetText ?? "";
  const revealedRef = useRef(0); // character index
  const rafRef = useRef<number>(0);
  const listenersRef = useRef(new Set<() => void>());
  const streamingRef = useRef(isStreaming);
  const targetRef = useRef(target);
  const lastTimeRef = useRef(0);

  streamingRef.current = isStreaming;
  targetRef.current = target;

  // Reset when text clears (new chat)
  if (!target && revealedRef.current !== 0) {
    revealedRef.current = 0;
    lastTimeRef.current = 0;
  }

  const subscribe = useCallback((cb: () => void) => {
    listenersRef.current.add(cb);
    return () => { listenersRef.current.delete(cb); };
  }, []);

  const getSnapshot = useCallback(() => revealedRef.current, []);

  const revealed = useSyncExternalStore(subscribe, getSnapshot);

  useEffect(() => {
    if (!target) return;

    const notify = () => listenersRef.current.forEach(cb => cb());

    // Characters per second — tuned for readable typing feel
    const BASE_CPS = 120; // ~120 chars/sec = fast but readable
    const CATCHUP_CPS = 600; // when buffer is very large, speed up
    const FINISH_CPS = 1200; // post-stream: finish quickly

    const animate = (timestamp: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = timestamp;
      const deltaMs = timestamp - lastTimeRef.current;
      lastTimeRef.current = timestamp;

      const totalChars = targetRef.current.length;
      const prev = revealedRef.current;

      if (prev < totalChars) {
        const buffered = totalChars - prev;
        let cps: number;

        if (!streamingRef.current) {
          // Stream ended: finish revealing quickly
          cps = FINISH_CPS;
        } else if (buffered > 500) {
          // Large buffer accumulated: catch up faster
          cps = CATCHUP_CPS;
        } else if (buffered > 200) {
          // Medium buffer: slightly faster
          cps = BASE_CPS * 2.5;
        } else {
          // Normal streaming: steady pace
          // Slow down slightly when buffer is small to avoid stuttering
          cps = buffered < 20 ? BASE_CPS * 0.6 : BASE_CPS;
        }

        // Calculate chars to reveal this frame
        const charsThisFrame = Math.max(1, Math.round((cps * deltaMs) / 1000));

        // Advance to next word/token boundary to avoid cutting markdown mid-syntax
        let newPos = Math.min(prev + charsThisFrame, totalChars);
        
        // If streaming and buffer is very small (< 5 chars), hold back slightly
        // to avoid revealing partial tokens that cause markdown flicker
        if (streamingRef.current && buffered < 5 && buffered > 0) {
          // Wait for more content — skip this frame
          rafRef.current = requestAnimationFrame(animate);
          return;
        }

        // Snap forward to whitespace boundary to avoid cutting words
        if (newPos < totalChars) {
          const nextSpace = targetRef.current.indexOf(" ", newPos);
          const nextNewline = targetRef.current.indexOf("\n", newPos);
          const nextBoundary = Math.min(
            nextSpace === -1 ? totalChars : nextSpace,
            nextNewline === -1 ? totalChars : nextNewline
          );
          // Only snap if it's close (within 15 chars) to avoid big jumps
          if (nextBoundary - newPos < 15) {
            newPos = nextBoundary + 1;
          }
        }

        revealedRef.current = Math.min(newPos, totalChars);
        notify();
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(rafRef.current);
      lastTimeRef.current = 0;
    };
  }, [target]);

  return target.slice(0, revealed);
}
