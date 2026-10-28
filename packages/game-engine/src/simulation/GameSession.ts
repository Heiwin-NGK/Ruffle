import { Deck } from "../cards/Deck";
import { Card, Rank } from "../cards/types";
import { TurnManager } from "../turns/TurnManager";
import { validateDeclaration, CardGroup } from "../rules/declaration";
import { calculateDeadwoodScore } from "../scoring/calculator";
import { extractGroups, pickDiscardCard } from "./botStrategy";

export interface BotPlayer {
  id: string;
  hand: Card[];
  roundScore: number;
  status: "ACTIVE" | "DECLARED" | "DROPPED";
}

export interface GameResult {
  winnerId: string;
  scores: Record<string, number>;
  rounds: number;
  totalTurns: number;
}

export interface RoundResult {
  winnerId: string | null;
  scores: Record<string, number>;
  turns: number;
}

const MAX_TURNS_PER_ROUND = 500; // Safety valve against infinite loops

/**
 * Runs a single round of headless Indian Rummy.
 * Bots make valid pseudo-random decisions guided by botStrategy.ts.
 */
export function runRound(playerIds: string[], wildJokerRank?: Rank): RoundResult {
  const deck = new Deck();
  deck.shuffle();

  const players: BotPlayer[] = playerIds.map(id => ({
    id,
    hand: deck.drawMany(13),
    roundScore: 0,
    status: "ACTIVE",
  }));

  // Draw and set wild joker
  const jokerCard = deck.draw();
  if (!jokerCard) throw new Error("Deck empty when drawing wild joker");
  const resolvedWildJokerRank: Rank = wildJokerRank ?? jokerCard.rank;

  const discardPile: Card[] = [];
  const firstDiscard = deck.draw();
  if (!firstDiscard) throw new Error("Deck empty when drawing first discard");
  discardPile.push(firstDiscard);

  const tm = new TurnManager(playerIds, 999);
  let totalTurns = 0;
  let winnerId: string | null = null;

  while (totalTurns < MAX_TURNS_PER_ROUND) {
    const currentId = tm.getCurrentPlayer();
    const player = players.find(p => p.id === currentId)!;

    if (player.status !== "ACTIVE") {
      tm.nextTurn();
      continue;
    }

    totalTurns++;

    // --- DRAW PHASE ---
    // Replenish stock from discard pile if needed (minus top card)
    if (deck.remainingCount() === 0) {
      if (discardPile.length <= 1) {
        // Genuine deadlock — no cards left, treat as draw
        break;
      }
      const topCard = discardPile.pop()!;
      const reshuffled = discardPile.splice(0, discardPile.length);
      reshuffled.sort(() => Math.random() - 0.5);
      for (const c of reshuffled) {
        // Push back into the deck by recreating it isn't possible directly,
        // so we'll use a workaround: push into a temp pile which we track
        discardPile.unshift(c);
      }
      discardPile.push(topCard);
      // Actually the deck is empty; treat all remaining discard (except top) as available draws
      // Since our Deck class doesn't support re-adding, we simulate by drawing from discard
    }

    let drawnCard: Card | undefined;
    const topDiscard = discardPile[discardPile.length - 1];

    // Decide: draw from stock or discard?
    // Take from discard if it helps form a meld with current hand
    let takeDiscard = false;
    if (topDiscard) {
      const testHand = [...player.hand, topDiscard];
      const [groupsWithDiscard] = extractGroups(testHand, resolvedWildJokerRank);
      const [groupsWithout] = extractGroups(player.hand, resolvedWildJokerRank);
      if (groupsWithDiscard.length > groupsWithout.length) {
        takeDiscard = true;
      }
    }

    if (takeDiscard && topDiscard) {
      drawnCard = discardPile.pop()!;
    } else {
      drawnCard = deck.draw();
      if (!drawnCard) {
        // Stock exhausted, must take from discard
        if (discardPile.length > 0) {
          drawnCard = discardPile.pop()!;
        } else {
          break; // Genuine stalemate
        }
      }
    }

    player.hand.push(drawnCard);

    // --- TRY TO DECLARE ---
    // After some turns, try grouping and declaring
    const [groups, leftover] = extractGroups(player.hand, resolvedWildJokerRank);

    // Build full grouping: valid groups + leftover as individual "groups"
    const fullGrouping: CardGroup[] = [...groups];
    if (leftover.length > 0) {
      // Put leftover into one group to check declare feasibility
      fullGrouping.push(leftover);
    }

    // Check if the hand can form a valid declaration
    if (leftover.length === 0 && player.hand.length === 14) {
      // All 14 cards formed valid groups of 3 or 4... unlikely but check
    }

    // Attempt declare only when leftover is small (0–1 card before discard)
    const willDeclare = leftover.length <= 1 && player.hand.length === 14;

    if (willDeclare) {
      // Discard the leftover card first if there is one
      let declareGroups: CardGroup[];
      if (leftover.length === 1) {
        const toDiscard = leftover[0];
        player.hand = player.hand.filter(c => c.id !== toDiscard.id);
        discardPile.push(toDiscard);
        // Re-extract to get final grouping of 13 cards
        const [finalGroups] = extractGroups(player.hand, resolvedWildJokerRank);
        declareGroups = finalGroups;
      } else {
        declareGroups = groups;
      }

      const result = validateDeclaration(declareGroups, resolvedWildJokerRank);
      if (result.isValid) {
        player.status = "DECLARED";
        player.roundScore = 0;
        winnerId = player.id;

        // Score all other players
        for (const other of players) {
          if (other.status === "ACTIVE") {
            const [otherGroups, otherLeftover] = extractGroups(other.hand, resolvedWildJokerRank);
            const allGroups: CardGroup[] = [...otherGroups, ...(otherLeftover.map(c => [c]))];
            other.roundScore = calculateDeadwoodScore(allGroups, resolvedWildJokerRank);
            other.status = "DROPPED";
          }
        }
        break;
      }
    }

    // --- DISCARD PHASE ---
    const toDiscard = pickDiscardCard(player.hand, resolvedWildJokerRank);
    player.hand = player.hand.filter(c => c.id !== toDiscard.id);
    discardPile.push(toDiscard);

    tm.nextTurn();
  }

  if (!winnerId) {
    // No winner found (stalemate / too many turns). Assign scores based on current hands.
    for (const player of players) {
      if (player.status === "ACTIVE") {
        const [groups, leftover] = extractGroups(player.hand, resolvedWildJokerRank);
        const allGroups: CardGroup[] = [...groups, ...(leftover.map(c => [c]))];
        player.roundScore = calculateDeadwoodScore(allGroups, resolvedWildJokerRank);
      }
    }
  }

  const scores: Record<string, number> = {};
  for (const p of players) scores[p.id] = p.roundScore;

  return { winnerId, scores, turns: totalTurns };
}

/**
 * Runs a complete multi-round game session headlessly.
 */
export class GameSession {
  private playerIds: string[];
  private maxRounds: number;
  private cumulativeScores: Record<string, number> = {};

  constructor(playerIds: string[], maxRounds: number = 3) {
    this.playerIds = playerIds;
    this.maxRounds = maxRounds;
    for (const id of playerIds) this.cumulativeScores[id] = 0;
  }

  public run(): GameResult {
    let totalTurns = 0;

    for (let round = 0; round < this.maxRounds; round++) {
      const roundResult = runRound(this.playerIds);
      totalTurns += roundResult.turns;

      for (const [id, score] of Object.entries(roundResult.scores)) {
        this.cumulativeScores[id] += score;
      }
    }

    // Player with lowest cumulative score wins
    let winnerId = this.playerIds[0];
    let bestScore = Infinity;
    for (const [id, score] of Object.entries(this.cumulativeScores)) {
      if (score < bestScore) {
        bestScore = score;
        winnerId = id;
      }
    }

    return {
      winnerId,
      scores: { ...this.cumulativeScores },
      rounds: this.maxRounds,
      totalTurns,
    };
  }
}
