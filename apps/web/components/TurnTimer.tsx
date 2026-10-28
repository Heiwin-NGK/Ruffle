"use client";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";

interface TurnTimerProps {
  deadlineEpochMs: number;  // absolute epoch ms when this turn expires
  isMyTurn: boolean;
  onExpire?: () => void;
}

export function TurnTimer({ deadlineEpochMs, isMyTurn, onExpire }: TurnTimerProps) {
  const calcRemaining = () => Math.max(0, Math.round((deadlineEpochMs - Date.now()) / 1000));
  const [remaining, setRemaining] = useState(calcRemaining);

  useEffect(() => {
    // Only resets when deadlineEpochMs changes (i.e., new turn)
    setRemaining(calcRemaining());
    const interval = setInterval(() => {
      const r = calcRemaining();
      setRemaining(r);
      if (r <= 0) {
        clearInterval(interval);
        onExpire?.();
      }
    }, 500); // 500ms tick for smooth display without jitter
    return () => clearInterval(interval);
  }, [deadlineEpochMs]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalSecs = 60; // 1 minute turn duration for the visual bar
  const pct = Math.min(1, Math.max(0, remaining / totalSecs));
  const isUrgent = remaining <= 10;
  const barColor = pct > 0.4 ? "#22c55e" : pct > 0.18 ? "#d97706" : "#ef4444";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
      {/* Countdown number */}
      <AnimatePresence mode="popLayout">
        <motion.div
          key={remaining}
          initial={{ opacity: 0, y: -8, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.8 }}
          transition={{ duration: 0.15 }}
          style={{
            fontSize: isUrgent ? "1.6rem" : "1.3rem",
            fontWeight: 800,
            color: isUrgent ? "#ef4444" : isMyTurn ? "var(--gold)" : "var(--ui-muted)",
            fontVariantNumeric: "tabular-nums",
            minWidth: "2.5ch",
            textAlign: "center",
            filter: isUrgent ? "drop-shadow(0 0 8px rgba(239,68,68,0.8))" : undefined,
          }}
        >
          {remaining}s
        </motion.div>
      </AnimatePresence>

      {/* Timer bar */}
      <div style={{
        width: 80,
        height: 4,
        background: "rgba(255,255,255,0.1)",
        borderRadius: 2,
        overflow: "hidden",
      }}>
        <motion.div
          animate={{ width: `${pct * 100}%` }}
          transition={{ duration: 0.9, ease: "linear" }}
          style={{ height: "100%", background: barColor, borderRadius: 2 }}
        />
      </div>

      {isMyTurn && (
        <span style={{ fontSize: "0.65rem", color: "var(--gold)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Your Turn
        </span>
      )}
    </div>
  );
}
