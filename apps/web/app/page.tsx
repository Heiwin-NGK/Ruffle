"use client";
import { motion } from "framer-motion";
import Link from "next/link";

const suits = ["♠", "♥", "♦", "♣"];

export default function HomePage() {
  return (
    <main
      style={{
        height: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        overflow: "hidden",
      }}
      className="table-felt"
    >
      {/* Ambient floating suits */}
      {suits.map((s, i) => (
        <motion.div
          key={i}
          style={{
            position: "absolute",
            fontSize: "clamp(4rem, 10vw, 9rem)",
            opacity: 0.04,
            color: i % 2 === 0 ? "#c0392b" : "#e8e0c8",
            userSelect: "none",
            top: `${[15, 60, 25, 70][i]}%`,
            left: `${[10, 75, 55, 20][i]}%`,
          }}
          animate={{ y: [0, -20, 0], rotate: [0, 5, 0] }}
          transition={{ duration: 6 + i * 1.5, repeat: Infinity, ease: "easeInOut" }}
        >
          {s}
        </motion.div>
      ))}

      {/* Logo */}
      <motion.div
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7 }}
        style={{ textAlign: "center", marginBottom: "3rem" }}
      >
        <div style={{ fontSize: "clamp(3rem, 8vw, 5.5rem)", lineHeight: 1, marginBottom: "0.5rem" }}>
          <span style={{ color: "var(--gold)", fontFamily: "'Playfair Display', serif", fontWeight: 700 }}>
            Ruffle
          </span>
        </div>
        <p style={{ color: "var(--ui-muted)", fontSize: "1.1rem", letterSpacing: "0.2em", textTransform: "uppercase" }}>
          Indian Rummy — Friends &amp; Fun
        </p>
      </motion.div>

      {/* Action buttons */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.2 }}
        style={{ display: "flex", flexDirection: "column", gap: "1rem", width: "min(340px, 90vw)" }}
      >
        <Link href="/lobby" style={{ textDecoration: "none" }}>
          <button
            className="btn-gold"
            style={{ width: "100%", padding: "1rem 2rem", fontSize: "1.1rem", borderRadius: "12px" }}
          >
            ✦ Create Room
          </button>
        </Link>
        <Link href="/lobby" style={{ textDecoration: "none" }}>
          <button
            className="btn-ghost"
            style={{ width: "100%", padding: "1rem 2rem", fontSize: "1.1rem", borderRadius: "12px" }}
          >
            Enter Room Code
          </button>
        </Link>
        <Link href="/practice" style={{ textDecoration: "none" }}>
          <button
            className="btn-ghost"
            style={{ width: "100%", padding: "0.85rem 2rem", fontSize: "1rem", borderRadius: "12px", borderStyle: "dashed" }}
          >
            🤖 Play Offline (Solo Practice)
          </button>
        </Link>
      </motion.div>

      {/* Footer hint */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        style={{ position: "absolute", bottom: "2rem", color: "var(--ui-muted)", fontSize: "0.85rem" }}
      >
        No sign-up needed — just share the code with friends
      </motion.p>
    </main>
  );
}
