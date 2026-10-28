"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocalPracticeGame } from "../../hooks/useLocalPracticeGame";
import { GameTable } from "../../components/GameTable";

export default function PracticeGamePage() {
  const router = useRouter();
  const {
    gameState,
    roundSummary,
    error,
    drawStock,
    drawDiscard,
    discardCard,
    declare,
    drop,
    nextRound,
    clearError,
    clearRoundSummary,
  } = useLocalPracticeGame(1, 3); // 1 bot opponent, 3 rounds

  if (!gameState) {
    return (
      <main className="table-felt" style={{ height: "100dvh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", color: "var(--ui-muted)" }}>
          <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>🃏</div>
          <p>Initializing offline practice game…</p>
        </div>
      </main>
    );
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* Offline Mode Banner */}
      <div style={{
        position: "absolute",
        top: 8,
        left: "50%",
        transform: "translateX(-50%)",
        background: "rgba(34, 197, 94, 0.2)",
        border: "1px solid rgba(34, 197, 94, 0.5)",
        color: "#86efac",
        padding: "2px 12px",
        borderRadius: "12px",
        fontSize: "0.7rem",
        fontWeight: 600,
        zIndex: 100,
        pointerEvents: "none",
        letterSpacing: "0.05em",
      }}>
        ● OFFLINE PRACTICE MODE (No Server Required)
      </div>

      <GameTable
        state={gameState}
        roundSummary={roundSummary}
        error={error}
        onDrawStock={drawStock}
        onDrawDiscard={drawDiscard}
        onDiscard={discardCard}
        onDeclare={declare}
        onDrop={drop}
        onNextRound={nextRound}
        onClearError={clearError}
        onClearRoundSummary={clearRoundSummary}
        onExit={() => router.push("/lobby")}
      />
    </div>
  );
}

