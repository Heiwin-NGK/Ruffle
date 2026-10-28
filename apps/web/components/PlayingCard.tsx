"use client";
import { motion } from "framer-motion";
import type { CardDTO } from "@indian-rummy/socket-protocol";

export type CardData = CardDTO;

interface CardProps {
  card: CardData;
  selected?: boolean;
  faceDown?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
  layoutId?: string;
  small?: boolean;
}

const SUIT_SYMBOL: Record<string, string> = {
  Spades: "♠", Hearts: "♥", Diamonds: "♦", Clubs: "♣", Joker: "★",
};
const SUIT_COLOR: Record<string, string> = {
  Spades: "#1a1a1a", Hearts: "#c0392b", Diamonds: "#c0392b", Clubs: "#1a1a1a", Joker: "#7c3aed",
};

export function PlayingCard({ card, selected, faceDown, onClick, style, layoutId, small }: CardProps) {
  const symbol = SUIT_SYMBOL[card.suit] ?? "?";
  const color = SUIT_COLOR[card.suit] ?? "#1a1a1a";
  const w = small ? 48 : 72;
  const h = small ? 68 : 104;
  const fontSize = small ? "0.6rem" : "0.85rem";
  const rankSize = small ? "1rem" : "1.45rem";

  return (
    <motion.div
      layoutId={layoutId}
      onClick={onClick}
      whileHover={onClick ? { y: -8, scale: 1.04 } : {}}
      whileTap={onClick ? { scale: 0.96 } : {}}
      style={{
        width: w,
        height: h,
        borderRadius: "var(--card-radius)",
        background: faceDown
          ? "linear-gradient(135deg, #0d3320 0%, #14472e 50%, #0d3320 100%)"
          : "var(--card-bg)",
        border: faceDown
          ? "2px solid rgba(212,175,55,0.4)"
          : "1.5px solid rgba(0,0,0,0.15)",
        boxShadow: selected
          ? "0 0 0 3px var(--gold), 0 0 20px rgba(212,175,55,0.5), 0 8px 24px rgba(0,0,0,0.5)"
          : "0 4px 14px rgba(0,0,0,0.5)",
        cursor: onClick ? "pointer" : "default",
        userSelect: "none",
        flexShrink: 0,
        position: "relative",
        overflow: "hidden",
        transform: selected ? "translateY(-12px)" : undefined,
        ...style,
      }}
    >
      {faceDown ? (
        <div style={{
          width: "100%", height: "100%",
          display: "flex", alignItems: "center", justifyContent: "center",
          opacity: 0.5,
        }}>
          <span style={{ color: "var(--gold)", fontSize: small ? "1.2rem" : "1.8rem" }}>♦</span>
        </div>
      ) : (
        <>
          {/* Top-left rank + suit */}
          <div style={{
            position: "absolute", top: small ? 3 : 5, left: small ? 4 : 6,
            display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 1,
            color,
          }}>
            <span style={{ fontSize: rankSize, fontWeight: 700, fontFamily: "'Outfit', sans-serif" }}>
              {card.rank === "PrintedJoker" ? "JK" : card.rank}
            </span>
            <span style={{ fontSize }}>{symbol}</span>
          </div>

          {/* Center suit */}
          {!small && (
            <div style={{
              position: "absolute", inset: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "2rem", color, opacity: 0.15,
            }}>
              {symbol}
            </div>
          )}

          {/* Bottom-right (rotated) */}
          <div style={{
            position: "absolute", bottom: small ? 3 : 5, right: small ? 4 : 6,
            display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 1,
            color, transform: "rotate(180deg)",
          }}>
            <span style={{ fontSize: rankSize, fontWeight: 700, fontFamily: "'Outfit', sans-serif" }}>
              {card.rank === "PrintedJoker" ? "JK" : card.rank}
            </span>
            <span style={{ fontSize }}>{symbol}</span>
          </div>
        </>
      )}
    </motion.div>
  );
}
