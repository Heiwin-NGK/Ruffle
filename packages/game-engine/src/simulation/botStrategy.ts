import { Card, Rank, Suit } from "../cards/types";
import { isPureSequence, isImpureSequence, isSet } from "../rules/validators";
import { isAnyJoker } from "../cards/utils";
import { CardGroup } from "../rules/declaration";

const RANK_ORDER = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const RANK_VALUE: Record<string, number> = {
  A: 10, J: 10, Q: 10, K: 10,
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "10": 10,
};

/**
 * Fast greedy grouper — O(n log n), no exponential combinations.
 * Groups cards into valid sequences / sets in a single pass.
 * Returns [validGroups, leftoverCards].
 */
export function extractGroups(hand: Card[], wildJokerRank: Rank): [CardGroup[], Card[]] {
  const used = new Set<string>();
  const groups: CardGroup[] = [];
  const jokers = hand.filter(c => isAnyJoker(c, wildJokerRank));
  const normals = hand.filter(c => !isAnyJoker(c, wildJokerRank));

  // --- Pass 1: find pure sequences ---
  const bySuit: Record<string, Card[]> = {};
  for (const card of normals) {
    (bySuit[card.suit] ??= []).push(card);
  }
  for (const suitCards of Object.values(bySuit)) {
    suitCards.sort((a, b) => RANK_ORDER.indexOf(a.rank) - RANK_ORDER.indexOf(b.rank));
    const group: Card[] = [];
    for (const card of suitCards) {
      if (used.has(card.id)) continue;
      if (group.length === 0) {
        group.push(card);
      } else {
        const lastRank = RANK_ORDER.indexOf(group[group.length - 1].rank);
        const thisRank = RANK_ORDER.indexOf(card.rank);
        if (thisRank === lastRank + 1) {
          group.push(card);
          if (group.length >= 3) {
            // Snapshot a valid pure sequence of exactly 3 or 4
            const snapshot = group.slice(-Math.min(group.length, 4));
            if (isPureSequence(snapshot)) {
              for (const c of snapshot) used.add(c.id);
              groups.push(snapshot);
              group.splice(0, group.length); // clear
            }
          }
        } else if (thisRank > lastRank + 1) {
          group.splice(0, group.length);
          group.push(card);
        }
        // duplicate rank: skip
      }
    }
  }

  // --- Pass 2: find sets (same rank, different suits) ---
  const byRank: Record<string, Card[]> = {};
  for (const card of normals) {
    if (!used.has(card.id)) {
      (byRank[card.rank] ??= []).push(card);
    }
  }
  for (const rankCards of Object.values(byRank)) {
    const distinctSuit: Card[] = [];
    const seen = new Set<Suit>();
    for (const c of rankCards) {
      if (!seen.has(c.suit) && !used.has(c.id)) {
        distinctSuit.push(c);
        seen.add(c.suit);
      }
    }
    if (distinctSuit.length >= 3) {
      const setGroup = distinctSuit.slice(0, Math.min(distinctSuit.length, 4));
      if (isSet(setGroup, wildJokerRank)) {
        for (const c of setGroup) used.add(c.id);
        groups.push(setGroup);
      }
    }
  }

  // --- Pass 3: fill remaining suit-runs with jokers ---
  const availableJokers = jokers.filter(c => !used.has(c.id));
  for (const suitCards of Object.values(bySuit)) {
    const unused = suitCards.filter(c => !used.has(c.id));
    if (unused.length < 2 || availableJokers.length === 0) continue;
    // Try to form impure seq: take 2 consecutive + 1 joker
    for (let i = 0; i < unused.length - 1 && availableJokers.length > 0; i++) {
      const a = unused[i];
      const b = unused[i + 1];
      const ri = RANK_ORDER.indexOf(a.rank);
      const rj = RANK_ORDER.indexOf(b.rank);
      if (rj - ri <= 2) {
        const joker = availableJokers.pop()!;
        const candidate = [a, joker, b];
        if (isImpureSequence(candidate, wildJokerRank)) {
          used.add(a.id);
          used.add(b.id);
          used.add(joker.id);
          groups.push(candidate);
        } else {
          availableJokers.push(joker); // return it
        }
      }
    }
  }

  const leftover = hand.filter(c => !used.has(c.id));
  return [groups, leftover];
}

/**
 * Pick a card to discard — highest value isolated card first.
 */
export function pickDiscardCard(hand: Card[], wildJokerRank: Rank): Card {
  const nonJokers = hand.filter(c => !isAnyJoker(c, wildJokerRank));
  if (nonJokers.length === 0) return hand[0];

  let worst = nonJokers[0];
  let worstScore = -1;

  for (const card of nonJokers) {
    const val = RANK_VALUE[card.rank] ?? 0;
    const others = hand.filter(c => c.id !== card.id && !isAnyJoker(c, wildJokerRank));
    let inNearMeld = false;
    for (const other of others) {
      if (other.suit === card.suit) {
        const diff = Math.abs(RANK_ORDER.indexOf(card.rank) - RANK_ORDER.indexOf(other.rank));
        if (diff <= 2) { inNearMeld = true; break; }
      }
      if (other.rank === card.rank) { inNearMeld = true; break; }
    }
    const score = val + (inNearMeld ? 0 : 5);
    if (score > worstScore) { worstScore = score; worst = card; }
  }
  return worst;
}
