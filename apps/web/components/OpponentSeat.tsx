"use client";
import { motion } from "framer-motion";
import type { PlayerStatus } from "@indian-rummy/socket-protocol";
import { PlayingCard } from "./PlayingCard";

interface OpponentSeatProps {
  name: string;
  cardCount: number;
  score: number;
  isCurrentTurn: boolean;
  status: PlayerStatus;
  position?: "top" | "left" | "right";
  isBot?: boolean;
}

const AVATAR_COLORS = ["#7c3aed", "#0891b2", "#059669", "#d97706", "#dc2626", "#db2777"];

export function OpponentSeat({ name, cardCount, score, isCurrentTurn, status, isBot }: OpponentSeatProps) {
  const avatarColor = AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
  const initial = name.charAt(0).toUpperCase();
  const isActive = status === "ACTIVE";

  return (
    <motion.div
      animate={isCurrentTurn ? { scale: [1, 1.03, 1] } : {}}
      transition={{ duration: 1.2, repeat: isCurrentTurn ? Infinity : 0 }}
      className="glass-panel"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "0.75rem 1rem",
        gap: "0.5rem",
        minWidth: 100,
        border: isCurrentTurn
          ? "1px solid var(--gold)"
          : "1px solid var(--ui-border)",
        boxShadow: isCurrentTurn
          ? "0 0 20px rgba(212,175,55,0.25)"
          : undefined,
        opacity: status === "DROPPED" ? 0.5 : 1,
      }}
    >
      {/* Avatar */}
      <div style={{ position: "relative" }}>
        <div style={{
          width: 40, height: 40, borderRadius: "50%",
          background: avatarColor,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "1.1rem", fontWeight: 700, color: "#fff",
          border: isCurrentTurn ? "2px solid var(--gold)" : "2px solid transparent",
        }}>
          {initial}
        </div>
        {/* Status dot */}
        <div style={{
          position: "absolute", bottom: 0, right: 0,
          width: 10, height: 10, borderRadius: "50%",
          background: status === "DECLARED" ? "#10b981"
            : status === "DROPPED" ? "#ef4444"
              : status === "DISCONNECTED" ? "#6b7280"
                : isCurrentTurn ? "#d4af37"
                  : "#22c55e",
          border: "2px solid var(--felt)",
        }} />
      </div>

      {/* Name */}
      <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--ui-text)", maxWidth: 90, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "2px" }}>
        {isBot ? "🤖 " : ""}{name}
      </span>

      {/* Card count — face-down mini cards */}
      <div style={{ display: "flex", gap: -6 }}>
        {Array.from({ length: Math.min(cardCount, 6) }).map((_, i) => (
          <PlayingCard
            key={i}
            card={{ id: `opp-${i}`, suit: "Spades", rank: "A" }}
            faceDown
            small
            style={{ marginLeft: i === 0 ? 0 : -20, zIndex: i }}
          />
        ))}
        {cardCount > 6 && (
          <span style={{ color: "var(--ui-muted)", fontSize: "0.7rem", alignSelf: "center", marginLeft: 4 }}>
            +{cardCount - 6}
          </span>
        )}
      </div>

      {/* Score */}
      <div style={{
        background: "rgba(0,0,0,0.3)",
        borderRadius: "6px",
        padding: "2px 10px",
        fontSize: "0.8rem",
        fontWeight: 700,
        color: score >= 70 ? "#ef4444" : "var(--gold)",
      }}>
        {status === "DECLARED" ? "👑 Won" : `${score} pts`}
      </div>

      {isCurrentTurn && (
        <motion.div
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 0.9, repeat: Infinity }}
          style={{ fontSize: "0.65rem", color: "var(--gold)", letterSpacing: "0.05em" }}
        >
          ● THEIR TURN
        </motion.div>
      )}
    </motion.div>
  );
}
