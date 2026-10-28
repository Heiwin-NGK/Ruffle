"use client";
import { useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PlayerHand } from "./PlayerHand";
import { DeckPile, DiscardPile } from "./Piles";
import { OpponentSeat } from "./OpponentSeat";
import { TurnTimer } from "./TurnTimer";
import { CardData, PlayingCard } from "./PlayingCard";
import type { MaskedGameState, RoundSummary } from "@indian-rummy/socket-protocol";

interface GameTableProps {
  state: MaskedGameState;
  roundSummary: RoundSummary | null;
  error: string | null;
  onDrawStock: () => void;
  onDrawDiscard: () => void;
  onDiscard: (cardId: string) => void;
  onDeclare: (groups: string[][]) => void;
  onDrop: () => void;
  onClearError: () => void;
  onClearRoundSummary: () => void;
  onNextRound?: () => void;
  onExit?: () => void;
}

export function GameTable({
  state,
  roundSummary,
  error,
  onDrawStock,
  onDrawDiscard,
  onDiscard,
  onDeclare,
  onDrop,
  onClearError,
  onClearRoundSummary,
  onNextRound,
  onExit,
}: GameTableProps) {
  const [hand, setHand] = useState(state.myHand);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [groupBreaks, setGroupBreaks] = useState<Set<string>>(new Set());
  const [turnKey, setTurnKey] = useState(0);
  const [showExitModal, setShowExitModal] = useState(false);

  // Keep local hand in sync with server state (after draws)
  // We reconcile instead of replacing to preserve the user's manual sorting order
  useMemo(() => {
    setHand((prevHand) => {
      // 1. Keep existing cards in their current local order
      const serverIds = new Set(state.myHand.map(c => c.id));
      const keptCards = prevHand.filter(c => serverIds.has(c.id));
      
      // 2. Append any brand new cards drawn from the server
      const localIds = new Set(prevHand.map(c => c.id));
      const newCards = state.myHand.filter(c => !localIds.has(c.id));
      
      // If nothing changed in the composition, just return prevHand to avoid re-renders
      if (keptCards.length === prevHand.length && newCards.length === 0) {
        return prevHand;
      }
      
      return [...keptCards, ...newCards];
    });

    // Clean up selected cards if they were discarded
    setSelectedIds(prev => {
      const next = new Set(prev);
      const serverIds = new Set(state.myHand.map(c => c.id));
      let changed = false;
      for (const id of next) {
        if (!serverIds.has(id)) {
          next.delete(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });

    if (state.phase === "DRAW") setTurnKey(k => k + 1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.myHand, state.phase]);

  const isMyTurn = state.currentTurnPlayerId === state.myPlayerId;
  const isDrawPhase = state.phase === "DRAW";
  const isDiscardPhase = state.phase === "DISCARD";

  const toggleSelect = useCallback((id: string) => {
    if (!isDiscardPhase || !isMyTurn) return;
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, [isDiscardPhase, isMyTurn]);

  const handleDiscard = () => {
    if (selectedIds.size !== 1) return;
    const [id] = selectedIds;
    onDiscard(id);
    setSelectedIds(new Set());
  };

  const handleGroup = () => {
    if (selectedIds.size === 0) return;
    
    // Move all selected cards together, starting from the position of the first selected card
    const newHand = [...hand];
    const selectedCards = newHand.filter(c => selectedIds.has(c.id));
    const unselectedCards = newHand.filter(c => !selectedIds.has(c.id));
    
    // Find where to insert them (the index of the first selected card in the original hand)
    const firstIdx = newHand.findIndex(c => selectedIds.has(c.id));
    
    const finalHand = [
      ...unselectedCards.slice(0, firstIdx),
      ...selectedCards,
      ...unselectedCards.slice(firstIdx)
    ];

    setHand(finalHand);

    // Update gaps
    setGroupBreaks(prev => {
      const next = new Set(prev);
      // Remove gaps inside the newly formed group
      for (let i = 1; i < selectedCards.length; i++) {
        next.delete(selectedCards[i].id);
      }
      // Add gap at the start of the group
      if (firstIdx > 0) {
        next.add(selectedCards[0].id);
      } else {
        next.delete(selectedCards[0].id);
      }
      // Add gap at the start of the remaining cards, if any
      const afterGroupIdx = firstIdx + selectedCards.length;
      if (afterGroupIdx < finalHand.length) {
        next.add(finalHand[afterGroupIdx].id);
      }
      return next;
    });

    setSelectedIds(new Set());
  };

  const handleDeclare = () => {
    if (selectedIds.size !== 1) {
      alert("To declare, you must select exactly 1 card to discard to the finish slot!");
      return;
    }

    const discardId = Array.from(selectedIds)[0];
    
    // Reconstruct the 2D array of groups, omitting the finish discard card
    const groups: string[][] = [];
    let currentGroup: string[] = [];
    
    for (let i = 0; i < hand.length; i++) {
      const card = hand[i];
      if (card.id === discardId) continue; // Skip the finish discard
      
      // We start a new group if there's a group break AND we already have cards in the current group
      if (groupBreaks.has(card.id) && currentGroup.length > 0) {
        groups.push(currentGroup);
        currentGroup = [];
      }
      currentGroup.push(card.id);
    }
    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }
    
    onDeclare(groups);
  };

  const getReconstructedGroups = () => {
    const currentGroups: CardData[][] = [];
    let currentGroup: CardData[] = [];
    
    for (let i = 0; i < hand.length; i++) {
      const card = hand[i];
      if (i > 0 && groupBreaks.has(card.id)) {
        currentGroups.push(currentGroup);
        currentGroup = [];
      }
      currentGroup.push(card);
    }
    if (currentGroup.length > 0) {
      currentGroups.push(currentGroup);
    }
    return currentGroups;
  };

  const handleSortBySuit = () => {
    const suitOrder: Record<string, number> = { Spades: 1, Hearts: 2, Clubs: 3, Diamonds: 4, Joker: 5 };
    const rankOrder = ["A","2","3","4","5","6","7","8","9","10","J","Q","K","PrintedJoker"];
    
    const groups = getReconstructedGroups();
    
    // Sort each group internally
    for (const g of groups) {
      g.sort((a, b) =>
        suitOrder[a.suit] !== suitOrder[b.suit]
          ? suitOrder[a.suit] - suitOrder[b.suit]
          : rankOrder.indexOf(a.rank) - rankOrder.indexOf(b.rank)
      );
    }
    
    applyGroupedHand(groups);
  };

  const handleSortByRank = () => {
    const suitOrder: Record<string, number> = { Spades: 1, Hearts: 2, Clubs: 3, Diamonds: 4, Joker: 5 };
    const rankOrder = ["A","2","3","4","5","6","7","8","9","10","J","Q","K","PrintedJoker"];
    
    const groups = getReconstructedGroups();

    // Sort each group internally
    for (const g of groups) {
      g.sort((a, b) =>
        rankOrder.indexOf(a.rank) !== rankOrder.indexOf(b.rank)
          ? rankOrder.indexOf(a.rank) - rankOrder.indexOf(b.rank)
          : suitOrder[a.suit] - suitOrder[b.suit]
      );
    }
    
    applyGroupedHand(groups);
  };

  const applyGroupedHand = (groups: CardData[][]) => {
    const newHand: CardData[] = [];
    const newBreaks = new Set<string>();
    
    for (const g of groups) {
      if (newHand.length > 0 && g.length > 0) {
        newBreaks.add(g[0].id);
      }
      newHand.push(...g);
    }
    
    setHand(newHand);
    setGroupBreaks(newBreaks);
  };

  const turnDeadlineEpochMs = state.turnDeadlineEpochMs ?? (Date.now() + 60_000);

  return (
    <div className="table-felt" style={{ width:"100vw", height:"100dvh", display:"flex", flexDirection:"column", overflow:"hidden", position:"relative" }}>

      {/* ── Top bar ─────────────────────────────────────── */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0.6rem 1rem", background:"rgba(0,0,0,0.35)", borderBottom:"1px solid rgba(212,175,55,0.15)", flexShrink:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:"0.75rem" }}>
          <span style={{ color:"var(--gold)", fontFamily:"'Playfair Display', serif", fontWeight:700, fontSize:"1.1rem" }}>Ruffle</span>
          <span className="glass-panel" style={{ padding:"2px 10px", fontSize:"0.8rem", letterSpacing:"0.08em" }}>
            {state.roomName ? `${state.roomName} • ${state.roomCode}` : `Room: ${state.roomCode}`}
          </span>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:"1.2rem" }}>
          <span style={{ color:"var(--ui-muted)", fontSize:"0.85rem" }}>Round {state.round} / {state.maxRounds}</span>
          {isMyTurn && (
            <TurnTimer key={turnKey} deadlineEpochMs={turnDeadlineEpochMs} isMyTurn={isMyTurn} onExpire={() => { if (isDrawPhase) onDrop(); }} />
          )}
          {onExit && (
            <button
              onClick={() => setShowExitModal(true)}
              className="btn-ghost"
              style={{
                padding: "4px 10px",
                fontSize: "0.78rem",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                color: "#f87171",
                borderColor: "rgba(239, 68, 68, 0.4)",
                background: "rgba(239, 68, 68, 0.1)",
              }}
            >
              🚪 Leave
            </button>
          )}
        </div>
      </div>

      {/* ── Opponents ───────────────────────────────────── */}
      <div style={{ display:"flex", justifyContent:"center", alignItems:"flex-start", gap:"1rem", padding:"0.75rem 1rem", flexShrink:0 }}>
        {state.opponents.map(opp => (
          <OpponentSeat
            key={opp.playerId}
            name={opp.name}
            cardCount={opp.cardCount}
            score={opp.score}
            isCurrentTurn={opp.isCurrentTurn}
            status={opp.status}
            isBot={opp.isBot}
            position="top"
          />
        ))}
      </div>

      {/* ── Center: deck + discard + wild joker ─────────── */}
      <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:"2.5rem" }}>
        <div className="glass-panel" style={{ padding:"0.5rem 1rem", textAlign:"center" }}>
          <div style={{ fontSize:"0.65rem", color:"var(--ui-muted)", textTransform:"uppercase", letterSpacing:"0.1em" }}>Wild Joker</div>
          <div style={{ fontSize:"1.4rem", fontWeight:700, color:"var(--gold)" }}>{state.wildJokerRank ?? "?"}</div>
        </div>

        <DeckPile count={state.stockCount} onClick={isMyTurn && isDrawPhase ? onDrawStock : undefined} disabled={!isMyTurn || !isDrawPhase} />
        <DiscardPile topCard={state.discardTopCard as any} onClick={isMyTurn && isDrawPhase ? onDrawDiscard : undefined} disabled={!isMyTurn || !isDrawPhase || !state.discardTopCard} />

        {/* Finish Slot */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem" }}>
          <motion.div
            onClick={isMyTurn && isDiscardPhase && selectedIds.size === 1 ? handleDeclare : undefined}
            whileHover={isMyTurn && isDiscardPhase && selectedIds.size === 1 ? { scale: 1.06 } : {}}
            whileTap={isMyTurn && isDiscardPhase && selectedIds.size === 1 ? { scale: 0.95 } : {}}
            style={{
              width: 72,
              height: 104,
              borderRadius: "var(--card-radius)",
              border: (isMyTurn && isDiscardPhase && selectedIds.size === 1)
                ? "2px solid var(--gold)"
                : "2px dashed rgba(212,175,55,0.3)",
              background: (isMyTurn && isDiscardPhase && selectedIds.size === 1)
                ? "rgba(212,175,55,0.15)"
                : "rgba(0,0,0,0.2)",
              boxShadow: (isMyTurn && isDiscardPhase && selectedIds.size === 1)
                ? "0 0 16px rgba(212,175,55,0.4)"
                : undefined,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              cursor: (isMyTurn && isDiscardPhase && selectedIds.size === 1) ? "pointer" : "default",
              transition: "all 0.2s ease",
            }}
          >
            <span style={{ fontSize: "1.2rem", color: "var(--gold)" }}>✦</span>
            <span style={{ fontSize: "0.65rem", color: "var(--gold)", fontWeight: 700, letterSpacing: "0.05em", marginTop: 2 }}>FINISH</span>
          </motion.div>
          <span style={{ color: "var(--ui-muted)", fontSize: "0.75rem" }}>Finish</span>
        </div>

        <div className="glass-panel" style={{ padding:"0.5rem 1rem", textAlign:"center" }}>
          <div style={{ fontSize:"0.65rem", color:"var(--ui-muted)", textTransform:"uppercase", letterSpacing:"0.1em" }}>My Score</div>
          <div style={{ fontSize:"1.4rem", fontWeight:700, color: state.myScore >= 70 ? "#ef4444" : "var(--gold)" }}>{state.myScore}</div>
        </div>
      </div>

      {/* ── Player hand + actions ────────────────────────── */}
      <div style={{ flexShrink:0, background:"rgba(0,0,0,0.25)", borderTop:"1px solid rgba(212,175,55,0.12)", padding:"0.5rem 1rem 0.75rem" }}>
        <PlayerHand
          cards={hand as any}
          selectedIds={selectedIds}
          groupBreaks={groupBreaks}
          onCardClick={toggleSelect}
          onReorder={setHand as any}
          onSortBySuit={handleSortBySuit}
          onSortByRank={handleSortByRank}
          onGroup={handleGroup}
          wildJokerRank={state.wildJokerRank ?? undefined}
        />
        <div style={{ display:"flex", justifyContent:"center", gap:"0.75rem", marginTop:"0.5rem" }}>
          <button className="btn-ghost" onClick={onDrawStock} disabled={!isMyTurn || !isDrawPhase} style={{ padding:"0.5rem 1.2rem", fontSize:"0.9rem", opacity:(!isMyTurn || !isDrawPhase) ? 0.35 : 1 }}>↓ Draw Stock</button>
          <button className="btn-ghost" onClick={onDrawDiscard} disabled={!isMyTurn || !isDrawPhase || !state.discardTopCard} style={{ padding:"0.5rem 1.2rem", fontSize:"0.9rem", opacity:(!isMyTurn || !isDrawPhase || !state.discardTopCard) ? 0.35 : 1 }}>↑ Take Discard</button>
          <button className="btn-ghost" onClick={handleDiscard} disabled={!isMyTurn || !isDiscardPhase || selectedIds.size !== 1} style={{ padding:"0.5rem 1.2rem", fontSize:"0.9rem", opacity:(!isMyTurn || !isDiscardPhase || selectedIds.size !== 1) ? 0.35 : 1 }}>✕ Discard</button>
          <button className="btn-ghost" onClick={onDrop} disabled={!isMyTurn || !isDrawPhase} style={{ padding:"0.5rem 1.2rem", fontSize:"0.9rem", opacity:(!isMyTurn || !isDrawPhase) ? 0.35 : 1 }}>⬇ Drop</button>
          <button className="btn-gold" onClick={handleDeclare} disabled={!isMyTurn || !isDiscardPhase} style={{ padding:"0.5rem 1.5rem", fontSize:"0.9rem", opacity:(!isMyTurn || !isDiscardPhase) ? 0.35 : 1 }}>✦ Declare!</button>
        </div>
      </div>

      {/* ── Error toast ──────────────────────────────────── */}
      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity:0, y:20, x:"-50%" }} animate={{ opacity:1, y:0, x:"-50%" }} exit={{ opacity:0, y:20, x:"-50%" }}
            onClick={onClearError}
            style={{ position:"fixed", bottom:"6rem", left:"50%", background:"rgba(180,20,20,0.95)", border:"1px solid #ef4444", borderRadius:"10px", padding:"0.6rem 1.4rem", color:"#fff", fontSize:"0.9rem", zIndex:1000, cursor:"pointer", whiteSpace:"nowrap" }}>
            ⚠ {error} — tap to dismiss
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Round summary modal ──────────────────────────── */}
      <AnimatePresence>
        {roundSummary && (
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
            style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:2000 }}>
            <motion.div initial={{ scale:0.8, y:40 }} animate={{ scale:1, y:0 }} className="glass-panel"
              style={{ padding:"2rem", minWidth:"min(400px, 90vw)", textAlign:"center" }}>
              <div style={{ fontSize:"2.5rem", marginBottom:"0.5rem" }}>
                {roundSummary.isGameOver ? "🏆" : "🃏"}
              </div>
              <h2 style={{ fontFamily:"'Playfair Display', serif", color:"var(--gold)", fontSize:"1.5rem", marginBottom:"1rem" }}>
                {roundSummary.isGameOver ? "Game Over!" : `Round ${roundSummary.round} Complete`}
              </h2>
              <p style={{ color:"var(--ui-muted)", marginBottom:"1.5rem" }}>
                {roundSummary.winnerName} wins this round!
              </p>
              <div style={{ display:"flex", flexDirection:"column", gap:"0.4rem", marginBottom:"1.5rem" }}>
                {roundSummary.scores.map(s => (
                  <div key={s.playerId} style={{ display:"flex", justifyContent:"space-between", padding:"0.3rem 0.75rem", background:"rgba(0,0,0,0.3)", borderRadius:"6px" }}>
                    <span>{s.name}</span>
                    <span style={{ color:"var(--gold)", fontWeight:700 }}>+{s.roundScore} pts ({s.totalScore} total)</span>
                  </div>
                ))}
              </div>
              {!roundSummary.isGameOver && onNextRound && (
                <button className="btn-gold" onClick={() => { onClearRoundSummary(); onNextRound(); }} style={{ padding:"0.75rem 2rem", fontSize:"1rem" }}>
                  Next Round →
                </button>
              )}
              {roundSummary.isGameOver && (
                <button className="btn-ghost" onClick={() => window.location.href = "/"} style={{ padding:"0.75rem 2rem", fontSize:"1rem" }}>
                  Return to Lobby
                </button>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Exit Confirmation Modal ── */}
      <AnimatePresence>
        {showExitModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0, 0, 0, 0.78)",
              backdropFilter: "blur(6px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="glass-panel"
              style={{
                width: "min(380px, 92vw)",
                padding: "1.75rem",
                display: "flex",
                flexDirection: "column",
                gap: "1.2rem",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: "2.5rem" }}>🚪</div>
              <div>
                <h3 style={{ fontSize: "1.3rem", fontWeight: 700, color: "var(--ui-text)", marginBottom: "0.4rem" }}>
                  Leave Table?
                </h3>
                <p style={{ fontSize: "0.85rem", color: "var(--ui-muted)", lineHeight: 1.5 }}>
                  {state.phase === "DRAW" || state.phase === "DISCARD"
                    ? "You are currently in an active round. Exiting now will drop your hand with penalty points and return you to the lobby."
                    : "Are you sure you want to return to the lobby?"}
                </p>
              </div>

              <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.5rem" }}>
                <button
                  onClick={() => setShowExitModal(false)}
                  className="btn-ghost"
                  style={{ flex: 1, padding: "0.75rem" }}
                >
                  Resume Game
                </button>
                <button
                  onClick={() => {
                    setShowExitModal(false);
                    onExit?.();
                  }}
                  style={{
                    flex: 1,
                    padding: "0.75rem",
                    borderRadius: "10px",
                    background: "#ef4444",
                    color: "#fff",
                    fontWeight: 600,
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  Exit to Lobby
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
