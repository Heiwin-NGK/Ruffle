"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  Deck,
  TurnManager,
  validateDeclaration,
  calculateDeadwoodScore,
  extractGroups,
  pickDiscardCard,
} from "@indian-rummy/game-engine";
import type {
  MaskedGameState,
  CardDTO,
  Rank,
  RoundSummary,
  PlayerStatus,
  OpponentView,
  GamePhase,
} from "@indian-rummy/socket-protocol";

interface LocalPlayer {
  id: string;
  name: string;
  hand: CardDTO[];
  score: number;
  roundScore: number;
  status: PlayerStatus;
  turnsTaken: number;
  isBot: boolean;
}

export function useLocalPracticeGame(botCount = 1, maxRounds = 3) {
  const [phase, setPhase] = useState<GamePhase>("LOBBY");
  const [round, setRound] = useState(1);
  const [players, setPlayers] = useState<LocalPlayer[]>([]);
  const [stock, setStock] = useState<CardDTO[]>([]);
  const [discardPile, setDiscardPile] = useState<CardDTO[]>([]);
  const [wildJokerRank, setWildJokerRank] = useState<Rank | null>(null);
  const [currentTurnPlayerId, setCurrentTurnPlayerId] = useState<string | null>(null);
  const [roundSummary, setRoundSummary] = useState<RoundSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [turnDeadlineEpochMs, setTurnDeadlineEpochMs] = useState<number | null>(null);

  const turnManagerRef = useRef<TurnManager | null>(null);
  const botTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const myPlayerId = "human_player";

  // ── Start a new practice round ──
  const startRound = useCallback((currentPlayers: LocalPlayer[], roundNumber: number) => {
    const deck = new Deck();
    deck.shuffle();

    // Wild joker
    const wildCard = deck.draw()!;
    const jokerRank = wildCard.rank as Rank;
    setWildJokerRank(jokerRank);

    // Deal 13 cards to each player
    const dealtPlayers: LocalPlayer[] = currentPlayers.map(p => ({
      ...p,
      hand: deck.drawMany(13).map(c => ({ id: c.id, suit: c.suit as any, rank: c.rank as any })),
      roundScore: 0,
      turnsTaken: 0,
      status: "ACTIVE",
    }));

    // First discard
    const firstDiscard = deck.draw()!;
    const initialDiscard = [{ id: firstDiscard.id, suit: firstDiscard.suit as any, rank: firstDiscard.rank as any }];
    const remainingStock = deck.drawMany(deck.remainingCount()).map(c => ({ id: c.id, suit: c.suit as any, rank: c.rank as any }));

    const tm = new TurnManager(dealtPlayers.map(p => p.id), 999);
    turnManagerRef.current = tm;
    const firstTurnId = tm.getCurrentPlayer();

    setPlayers(dealtPlayers);
    setDiscardPile(initialDiscard);
    setStock(remainingStock);
    setRound(roundNumber);
    setPhase("DRAW");
    setCurrentTurnPlayerId(firstTurnId);
    setTurnDeadlineEpochMs(Date.now() + 60_000);
    setRoundSummary(null);
  }, []);

  // Initialize practice game on mount
  useEffect(() => {
    const initialPlayers: LocalPlayer[] = [
      { id: myPlayerId, name: "You", hand: [], score: 0, roundScore: 0, status: "ACTIVE", turnsTaken: 0, isBot: false },
    ];
    for (let i = 1; i <= botCount; i++) {
      initialPlayers.push({
        id: `local_bot_${i}`,
        name: `Bot ${i}`,
        hand: [],
        score: 0,
        roundScore: 0,
        status: "ACTIVE",
        turnsTaken: 0,
        isBot: true,
      });
    }
    startRound(initialPlayers, 1);
    return () => {
      if (botTimerRef.current) clearTimeout(botTimerRef.current);
    };
  }, [botCount, startRound]);

  // ── Advance turn ──
  const advanceTurn = useCallback((updatedPlayers: LocalPlayer[]): RoundSummary | undefined => {
    const active = updatedPlayers.filter(p => p.status === "ACTIVE");
    if (active.length <= 1) {
      const winner = active[0] || updatedPlayers[0];
      winner.roundScore = 0;
      winner.status = "DECLARED";

      const isGameOver = round >= maxRounds;
      const summary: RoundSummary = {
        winnerId: winner.id,
        winnerName: winner.name,
        scores: updatedPlayers.map(p => ({
          playerId: p.id,
          name: p.name,
          roundScore: p.roundScore,
          totalScore: p.score,
        })),
        round,
        isGameOver,
      };
      setRoundSummary(summary);
      setPhase(isGameOver ? "GAME_OVER" : "ROUND_END");
      return summary;
    }

    if (turnManagerRef.current) {
      turnManagerRef.current.nextTurn();
      let nextId = turnManagerRef.current.getCurrentPlayer();
      let safety = updatedPlayers.length;
      while (safety-- > 0) {
        const p = updatedPlayers.find(pl => pl.id === nextId);
        if (p && p.status === "ACTIVE") break;
        turnManagerRef.current.nextTurn();
        nextId = turnManagerRef.current.getCurrentPlayer();
      }
      setCurrentTurnPlayerId(nextId);
      setPhase("DRAW");
      setTurnDeadlineEpochMs(Date.now() + 60_000);
    }
    return undefined;
  }, [maxRounds, round]);

  // ── Bot AI turn trigger ──
  useEffect(() => {
    if (phase === "ROUND_END" || phase === "GAME_OVER") return;
    if (!currentTurnPlayerId || currentTurnPlayerId === myPlayerId) return;

    const bot = players.find(p => p.id === currentTurnPlayerId && p.isBot);
    if (!bot || bot.status !== "ACTIVE") return;

    botTimerRef.current = setTimeout(() => {
      // 1. Draw phase
      let drawnCard: CardDTO;
      const topDiscard = discardPile[discardPile.length - 1];
      let takeDiscard = false;

      if (topDiscard && wildJokerRank) {
        const testHand = [...bot.hand, topDiscard] as any;
        const [groupsWith] = extractGroups(testHand, wildJokerRank);
        const [groupsWithout] = extractGroups(bot.hand as any, wildJokerRank);
        if (groupsWith.length > groupsWithout.length) takeDiscard = true;
      }

      if (takeDiscard && topDiscard) {
        drawnCard = topDiscard;
        setDiscardPile(prev => prev.slice(0, -1));
      } else {
        if (stock.length === 0) {
          // reshuffle discard
          const top = discardPile[discardPile.length - 1];
          const reshuffled = discardPile.slice(0, -1).sort(() => Math.random() - 0.5);
          drawnCard = reshuffled.pop()!;
          setStock(reshuffled);
          setDiscardPile([top]);
        } else {
          drawnCard = stock[stock.length - 1];
          setStock(prev => prev.slice(0, -1));
        }
      }

      const botHandWithDrawn = [...bot.hand, drawnCard];

      // 2. Discard / Declare phase
      setTimeout(() => {
        const [groups, leftover] = extractGroups(botHandWithDrawn as any, wildJokerRank!);

        if (leftover.length === 1 && botHandWithDrawn.length === 14) {
          const toDiscard = leftover[0];
          const declareHand = botHandWithDrawn.filter(c => c.id !== toDiscard.id);
          const [candGroups] = extractGroups(declareHand as any, wildJokerRank!);
          const res = validateDeclaration(candGroups, wildJokerRank!);

          if (res.isValid) {
            // Bot declared!
            const finalPlayers = players.map(p => {
              if (p.id === bot.id) {
                return { ...p, hand: declareHand, roundScore: 0, status: "DECLARED" as PlayerStatus };
              }
              const otherGroups = p.hand.map(c => [c]);
              const penalty = Math.min(80, calculateDeadwoodScore(otherGroups as any, wildJokerRank!));
              return { ...p, roundScore: penalty, score: p.score + penalty, status: "DROPPED" as PlayerStatus };
            });
            setPlayers(finalPlayers);
            setDiscardPile(prev => [...prev, toDiscard]);
            advanceTurn(finalPlayers);
            return;
          }
        }

        // Standard discard
        const worst = pickDiscardCard(botHandWithDrawn as any, wildJokerRank!);
        const newBotHand = botHandWithDrawn.filter(c => c.id !== worst.id);
        setDiscardPile(prev => [...prev, worst]);

        const nextPlayers = players.map(p =>
          p.id === bot.id ? { ...p, hand: newBotHand, turnsTaken: p.turnsTaken + 1 } : p
        );
        setPlayers(nextPlayers);
        advanceTurn(nextPlayers);
      }, 700);
    }, 1000);

    return () => {
      if (botTimerRef.current) clearTimeout(botTimerRef.current);
    };
  }, [advanceTurn, currentTurnPlayerId, discardPile, phase, players, stock, wildJokerRank]);

  // ── Player Actions ──

  const drawStock = useCallback(() => {
    if (currentTurnPlayerId !== myPlayerId || phase !== "DRAW") return;
    let card: CardDTO;
    if (stock.length === 0) {
      if (discardPile.length <= 1) {
        setError("No cards left to draw.");
        return;
      }
      const top = discardPile[discardPile.length - 1];
      const reshuffled = discardPile.slice(0, -1).sort(() => Math.random() - 0.5);
      card = reshuffled.pop()!;
      setStock(reshuffled);
      setDiscardPile([top]);
    } else {
      card = stock[stock.length - 1];
      setStock(prev => prev.slice(0, -1));
    }

    setPlayers(prev => prev.map(p => p.id === myPlayerId ? { ...p, hand: [...p.hand, card] } : p));
    setPhase("DISCARD");
  }, [currentTurnPlayerId, discardPile, myPlayerId, phase, stock]);

  const drawDiscard = useCallback(() => {
    if (currentTurnPlayerId !== myPlayerId || phase !== "DRAW" || discardPile.length === 0) return;
    const card = discardPile[discardPile.length - 1];
    setDiscardPile(prev => prev.slice(0, -1));
    setPlayers(prev => prev.map(p => p.id === myPlayerId ? { ...p, hand: [...p.hand, card] } : p));
    setPhase("DISCARD");
  }, [currentTurnPlayerId, discardPile, myPlayerId, phase]);

  const discardCard = useCallback((cardId: string) => {
    if (currentTurnPlayerId !== myPlayerId || phase !== "DISCARD") return;
    const me = players.find(p => p.id === myPlayerId);
    if (!me) return;
    const card = me.hand.find(c => c.id === cardId);
    if (!card) return;

    const newHand = me.hand.filter(c => c.id !== cardId);
    setDiscardPile(prev => [...prev, card]);

    const nextPlayers = players.map(p =>
      p.id === myPlayerId ? { ...p, hand: newHand, turnsTaken: p.turnsTaken + 1 } : p
    );
    setPlayers(nextPlayers);
    advanceTurn(nextPlayers);
  }, [advanceTurn, currentTurnPlayerId, myPlayerId, phase, players]);

  const declare = useCallback((groups: string[][]) => {
    if (currentTurnPlayerId !== myPlayerId || phase !== "DISCARD") return;
    const me = players.find(p => p.id === myPlayerId)!;
    const cardMap = new Map(me.hand.map(c => [c.id, c]));

    try {
      const cardGroups = groups.map(g =>
        g.map(id => {
          const c = cardMap.get(id);
          if (!c) throw new Error("Card not found in hand");
          return { id: c.id, suit: c.suit, rank: c.rank };
        })
      );

      const result = validateDeclaration(cardGroups as any, wildJokerRank as Rank);
      if (!result.isValid) {
        // Wrong show penalty
        setError(result.error ?? "Invalid declaration! 80 penalty points added.");
        const nextPlayers = players.map(p =>
          p.id === myPlayerId ? { ...p, roundScore: 80, score: p.score + 80, status: "DROPPED" as PlayerStatus } : p
        );
        setPlayers(nextPlayers);
        advanceTurn(nextPlayers);
        return;
      }

      // Valid show
      const nextPlayers = players.map(p => {
        if (p.id === myPlayerId) {
          return { ...p, roundScore: 0, status: "DECLARED" as PlayerStatus };
        }
        const otherGroups = p.hand.map(c => [c]);
        const penalty = Math.min(80, calculateDeadwoodScore(otherGroups as any, wildJokerRank as Rank));
        return { ...p, roundScore: penalty, score: p.score + penalty, status: "DROPPED" as PlayerStatus };
      });
      setPlayers(nextPlayers);
      advanceTurn(nextPlayers);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [advanceTurn, currentTurnPlayerId, myPlayerId, phase, players, wildJokerRank]);

  const drop = useCallback(() => {
    if (currentTurnPlayerId !== myPlayerId || phase !== "DRAW") return;
    const me = players.find(p => p.id === myPlayerId)!;
    const penalty = me.turnsTaken === 0 ? 20 : 40;
    const nextPlayers = players.map(p =>
      p.id === myPlayerId ? { ...p, roundScore: penalty, score: p.score + penalty, status: "DROPPED" as PlayerStatus } : p
    );
    setPlayers(nextPlayers);
    advanceTurn(nextPlayers);
  }, [advanceTurn, currentTurnPlayerId, myPlayerId, phase, players]);

  const nextRound = useCallback(() => {
    if (phase !== "ROUND_END") return;
    startRound(players, round + 1);
  }, [phase, players, round, startRound]);

  // Construct MaskedGameState representation
  const me = players.find(p => p.id === myPlayerId);
  const opponents: OpponentView[] = players
    .filter(p => p.id !== myPlayerId)
    .map(p => ({
      playerId: p.id,
      name: p.name,
      cardCount: p.hand.length,
      score: p.score,
      status: p.status,
      isCurrentTurn: currentTurnPlayerId === p.id,
      isBot: p.isBot,
    }));

  const gameState: MaskedGameState | null = me
    ? {
        roomCode: "OFFLINE",
        phase,
        round,
        maxRounds,
        myHand: me.hand,
        myScore: me.score,
        myStatus: me.status,
        opponents,
        discardTopCard: discardPile.length > 0 ? discardPile[discardPile.length - 1] : null,
        stockCount: stock.length,
        wildJokerRank,
        currentTurnPlayerId,
        myPlayerId,
        turnDeadlineEpochMs,
      }
    : null;

  return {
    gameState,
    roundSummary,
    error,
    drawStock,
    drawDiscard,
    discardCard,
    declare,
    drop,
    nextRound,
    clearError: () => setError(null),
    clearRoundSummary: () => setRoundSummary(null),
  };
}

