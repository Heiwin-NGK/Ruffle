"use client";
import { motion } from "framer-motion";
import { PlayingCard, CardData } from "./PlayingCard";

interface DeckPileProps {
  count: number;
  onClick?: () => void;
  disabled?: boolean;
}

interface DiscardPileProps {
  topCard: CardData | null;
  onClick?: () => void;
  disabled?: boolean;
}

export function DeckPile({ count, onClick, disabled }: DeckPileProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem" }}>
      <motion.div
        onClick={!disabled ? onClick : undefined}
        whileHover={!disabled && onClick ? { scale: 1.06 } : {}}
        whileTap={!disabled && onClick ? { scale: 0.95 } : {}}
        style={{ position: "relative", cursor: !disabled && onClick ? "pointer" : "default" }}
      >
        {/* Stack effect — 3 fanned layers */}
        {[2, 1, 0].map((offset) => (
          <div
            key={offset}
            style={{
              position: offset === 0 ? "relative" : "absolute",
              top: offset === 0 ? 0 : -offset * 2,
              left: offset === 0 ? 0 : offset * 2,
              zIndex: 3 - offset,
            }}
          >
            <PlayingCard
              card={{ id: "back", suit: "Spades", rank: "A" }}
              faceDown
            />
          </div>
        ))}
        {!disabled && onClick && (
          <motion.div
            animate={{ opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 1.8, repeat: Infinity }}
            style={{
              position: "absolute", inset: 0, borderRadius: "var(--card-radius)",
              border: "2px solid var(--gold)",
              pointerEvents: "none",
            }}
          />
        )}
      </motion.div>
      <span style={{ color: "var(--ui-muted)", fontSize: "0.75rem" }}>{count} left</span>
    </div>
  );
}

export function DiscardPile({ topCard, onClick, disabled }: DiscardPileProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem" }}>
      <motion.div
        onClick={!disabled ? onClick : undefined}
        whileHover={!disabled && onClick ? { scale: 1.06 } : {}}
        whileTap={!disabled && onClick ? { scale: 0.95 } : {}}
        style={{ cursor: !disabled && onClick ? "pointer" : "default", position: "relative" }}
      >
        {topCard ? (
          <>
            <PlayingCard card={topCard} layoutId={`discard-${topCard.id}`} />
            {!disabled && onClick && (
              <motion.div
                animate={{ opacity: [0.6, 1, 0.6] }}
                transition={{ duration: 1.8, repeat: Infinity }}
                style={{
                  position: "absolute", inset: 0, borderRadius: "var(--card-radius)",
                  border: "2px solid var(--gold)",
                  pointerEvents: "none",
                }}
              />
            )}
          </>
        ) : (
          <div style={{
            width: 72, height: 104, borderRadius: "var(--card-radius)",
            border: "2px dashed rgba(212,175,55,0.3)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "rgba(212,175,55,0.3)", fontSize: "1.5rem",
          }}>
            ∅
          </div>
        )}
      </motion.div>
      <span style={{ color: "var(--ui-muted)", fontSize: "0.75rem" }}>Discard</span>
    </div>
  );
}
