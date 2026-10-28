"use client";
import { use, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSocket } from "../../../hooks/useSocket";
import { GameTable } from "../../../components/GameTable";

export default function GameRoomPage({ params }: { params: Promise<{ roomCode: string }> }) {
  const { roomCode } = use(params);
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
    leaveRoom,
    clearError,
    clearRoundSummary,
  } = useSocket();

  // If no game state yet, redirect to lobby (e.g. direct URL navigation)
  useEffect(() => {
    if (!gameState && !roundSummary) {
      const timer = setTimeout(() => router.push("/lobby"), 3000);
      return () => clearTimeout(timer);
    }
  }, [gameState, roundSummary, router]);

  if (!gameState) {
    return (
      <main className="table-felt" style={{ height:"100dvh", display:"flex", alignItems:"center", justifyContent:"center" }}>
        <div style={{ textAlign:"center", color:"var(--ui-muted)" }}>
          <div style={{ fontSize:"2rem", marginBottom:"1rem" }}>🃏</div>
          <p>Reconnecting to room <strong style={{ color:"var(--gold)" }}>{roomCode}</strong>…</p>
          <p style={{ fontSize:"0.8rem", marginTop:"0.5rem" }}>Redirecting to lobby if not found.</p>
        </div>
      </main>
    );
  }

  return (
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
      onExit={() => {
        leaveRoom();
        router.push("/lobby");
      }}
    />
  );
}
