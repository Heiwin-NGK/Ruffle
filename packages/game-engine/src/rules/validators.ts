import { Card, Rank, Suit } from "../cards/types";
import { isAnyJoker, isPrintedJoker } from "../cards/utils";

const RANK_ORDER: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

/**
 * Checks if a group of cards is a valid Pure Sequence.
 * - Same suit
 * - Consecutive ranks (order-independent)
 * - No jokers used as substitutes
 */
export const isPureSequence = (cards: Card[]): boolean => {
  if (cards.length < 3) return false;

  // A pure sequence cannot contain any printed jokers
  if (cards.some(isPrintedJoker)) return false;

  const suit = cards[0].suit;
  if (cards.some((c) => c.suit !== suit)) return false;

  const length = cards.length;
  if (length > 13) return false;

  // Check if cards can form a consecutive sequence along RANK_ORDER
  for (let startVal = 0; startVal <= RANK_ORDER.length - length; startVal++) {
    const targetRanks = RANK_ORDER.slice(startVal, startVal + length);
    // Check if cards' ranks match targetRanks multiset
    if (matchesRankMultiset(cards.map(c => c.rank), targetRanks)) {
      return true;
    }
  }

  return false;
};

/**
 * Checks if a group of cards is a valid Impure Sequence.
 * - Same suit for non-joker cards
 * - Consecutive ranks, with jokers filling in the gaps (order-independent)
 */
export const isImpureSequence = (cards: Card[], wildJokerRank: Rank): boolean => {
  if (cards.length < 3) return false;

  const nonJokers = cards.filter((c) => !isAnyJoker(c, wildJokerRank));
  if (nonJokers.length === 0) return true; // All jokers is a valid impure sequence

  const suit = nonJokers[0].suit;
  if (nonJokers.some((c) => c.suit !== suit)) return false;

  const length = cards.length;
  if (length > 13) return false;

  // Check if non-jokers can fit into any valid sequence window of length
  for (let startVal = 0; startVal <= RANK_ORDER.length - length; startVal++) {
    const targetRanks = [...RANK_ORDER.slice(startVal, startVal + length)];
    let canFit = true;

    for (const nj of nonJokers) {
      const idx = targetRanks.indexOf(nj.rank);
      if (idx === -1) {
        canFit = false;
        break;
      }
      // Consume the matched target rank slot
      targetRanks.splice(idx, 1);
    }

    if (canFit) return true;
  }

  return false;
};

/**
 * Checks if a group of cards is a valid Set.
 * - 3 or 4 cards
 * - Same rank for non-joker cards
 * - Different suits for non-joker cards
 */
export const isSet = (cards: Card[], wildJokerRank: Rank): boolean => {
  if (cards.length < 3 || cards.length > 4) return false;

  const nonJokers = cards.filter((c) => !isAnyJoker(c, wildJokerRank));
  if (nonJokers.length === 0) return true;

  const rank = nonJokers[0].rank;
  if (nonJokers.some((c) => c.rank !== rank)) return false;

  const suits = new Set<Suit>();
  for (const card of nonJokers) {
    if (suits.has(card.suit)) return false; // Duplicate suits are not allowed in a set
    suits.add(card.suit);
  }

  return true;
};

function matchesRankMultiset(actual: Rank[], target: Rank[]): boolean {
  if (actual.length !== target.length) return false;
  const remaining = [...target];
  for (const r of actual) {
    const idx = remaining.indexOf(r);
    if (idx === -1) return false;
    remaining.splice(idx, 1);
  }
  return true;
}
