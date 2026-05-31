import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart } from 'lucide-react';
import { ref, push, onValue, query, limitToLast, get, remove } from 'firebase/database';
import { db } from '../lib/firebase';

// --- TUNABLES (kept here so they're easy to tweak) ---
const REACTION_COOLDOWN_MS = 500;          // 1-sec cooldown between taps per user
const REACTION_ANIMATION_MS = 2000;         // 2 sec float duration (longer hold before fade)
const REACTION_DB_LIMIT = 10;               // max 10 hearts read at once from DB
const REACTION_STALE_MS = 5000;             // don't animate hearts older than 5 sec (covers reconnects)
const REACTION_DB_TTL_MS = 30000;           // auto-clean DB entries older than 30 sec
const REACTION_CLEANUP_INTERVAL_MS = 10000; // run cleanup every 10 sec

export const HeartReactionLayer = ({ roomId, canReact = true }) => {
  const [floatingHearts, setFloatingHearts] = useState([]);
  const [cooldownActive, setCooldownActive] = useState(false);
  const lastTapAtRef = useRef(0);
  const seenIdsRef = useRef(new Set());
  const isPrimedRef = useRef(false);

  // --- SUBSCRIBE TO REACTIONS (limit 10) ---
  useEffect(() => {
    if (!roomId) return;
    const reactionsQuery = query(
      ref(db, `rooms/${roomId}/reactions`),
      limitToLast(REACTION_DB_LIMIT)
    );

    const unsub = onValue(reactionsQuery, (snapshot) => {
      const data = snapshot.val() || {};
      const entries = Object.entries(data);

      // First load: mark everything seen but DON'T animate
      // (prevents old hearts from animating when a viewer joins late)
      if (!isPrimedRef.current) {
        entries.forEach(([id]) => seenIdsRef.current.add(id));
        isPrimedRef.current = true;
        return;
      }

      // For each new entry, queue a floating heart
      entries.forEach(([id, value]) => {
        if (seenIdsRef.current.has(id)) return;
        seenIdsRef.current.add(id);

        const ts = Number(value?.timestamp) || 0;
        // Skip stale ones (clock skew or reconnect catch-up)
        if (Date.now() - ts > REACTION_STALE_MS) return;

        const heart = {
          id,
          emoji: typeof value?.emoji === 'string' ? value.emoji : '❤️',
          startX: Math.random() * 30 - 15,        // ±15px horizontal start offset
          driftX: (Math.random() - 0.5) * 40,     // ±20px lateral drift
          scale: 0.9 + Math.random() * 0.2,        // 0.9-1.1
          rotation: (Math.random() - 0.5) * 30,   // ±15°
          delay: Math.random() * 100,             // 0-100ms stagger
        };

        setFloatingHearts((prev) => [...prev, heart]);

        // Remove from local queue after animation completes
        window.setTimeout(() => {
          setFloatingHearts((prev) => prev.filter((h) => h.id !== id));
        }, REACTION_ANIMATION_MS + 250);
      });
    });

    return () => unsub();
  }, [roomId]);

  // --- PERIODIC CLEANUP OF OLD DB ENTRIES ---
  useEffect(() => {
    if (!roomId) return;
    const interval = setInterval(async () => {
      try {
        const snap = await get(ref(db, `rooms/${roomId}/reactions`));
        const data = snap.val() || {};
        const now = Date.now();
        const expired = Object.entries(data).filter(
          ([, value]) => now - (Number(value?.timestamp) || 0) > REACTION_DB_TTL_MS
        );
        await Promise.all(
          expired.map(([id]) => remove(ref(db, `rooms/${roomId}/reactions/${id}`)))
        );
      } catch {
        // ignore cleanup errors silently
      }
    }, REACTION_CLEANUP_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [roomId]);

  // --- SEND A HEART ---
  const sendHeart = () => {
    if (!canReact) return;
    const now = Date.now();
    if (now - lastTapAtRef.current < REACTION_COOLDOWN_MS) return;
    lastTapAtRef.current = now;

    setCooldownActive(true);
    window.setTimeout(() => setCooldownActive(false), REACTION_COOLDOWN_MS);

    push(ref(db, `rooms/${roomId}/reactions`), {
      emoji: '❤️',
      timestamp: now,
    }).catch(() => {
      // Silent fail (offline, etc.)
    });

    // Light tactile feedback
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(15);
      }
    } catch {}
  };

  const buttonDisabled = !canReact || cooldownActive;

  return (
    <>
      {/* FLOATING HEARTS LAYER */}
      <div className="absolute inset-0 z-[55] pointer-events-none overflow-hidden">
        <AnimatePresence>
          {floatingHearts.map((heart) => (
            <motion.div
              key={heart.id}
              className="absolute right-7 text-3xl select-none"
              style={{ bottom: 'calc(17rem + env(safe-area-inset-bottom))' }}
              initial={{
                opacity: 0,
                y: 0,
                x: heart.startX,
                scale: heart.scale,
                rotate: heart.rotation,
              }}
              animate={{
                opacity: [0, 1, 1, 0],
                y: -500,
                x: heart.startX + heart.driftX,
                rotate: heart.rotation + heart.driftX * 0.6,
              }}
              transition={{
                duration: REACTION_ANIMATION_MS / 1000,
                ease: 'easeOut',
                opacity: { times: [0, 0.1, 0.85, 1] },
                delay: heart.delay / 1000,
              }}
            >
              {heart.emoji}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* HEART BUTTON (above bid controls) — no background, icon-only */}
      <button
        type="button"
        onClick={sendHeart}
        disabled={buttonDisabled}
        aria-label="Send a heart"
        className={`
          absolute right-4 z-[65] pointer-events-auto
          p-3
          ${!canReact ? 'opacity-40 cursor-not-allowed' : ''}
        `}
        style={{ bottom: 'calc(16rem + env(safe-area-inset-bottom))' }}
      >
        <motion.div
          animate={{ scale: cooldownActive ? [1, 1.45, 1] : 1 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
        >
          <Heart
            strokeWidth={1.5}
            className={`w-6 h-6 transition-colors duration-200 drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)] ${
              cooldownActive
                ? 'text-red-500 fill-red-500'
                : 'text-zinc-400'
            }`}
          />
        </motion.div>
      </button>
    </>
  );
};
