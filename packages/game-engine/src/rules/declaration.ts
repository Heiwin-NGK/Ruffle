import { Card, Rank } from "../cards/types";
import { isPureSequence, isImpureSequence, isSet } from "./validators";

export type CardGroup = Card[];

export interface DeclarationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Validates a player's declaration.
 * 
 * Rules for a valid declaration in 13-card Indian Rummy:
 * 1. Must contain exactly 13 cards in total across all groups.
 * 2. Must contain at least one Pure Sequence.
 * 3. Must contain at least one other Sequence (Pure or Impure).
 * 4. All other groups must be valid Sequences or Sets.
 */
export const validateDeclaration = (groups: CardGroup[], wildJokerRank: Rank): DeclarationResult => {
  let totalCards = 0;
  let pureSequenceCount = 0;
  let impureSequenceCount = 0;
  
  for (const group of groups) {
    totalCards += group.length;

    if (isPureSequence(group)) {
      pureSequenceCount++;
    } else if (isImpureSequence(group, wildJokerRank)) {
      impureSequenceCount++;
    } else if (isSet(group, wildJokerRank)) {
      // Valid set
    } else {
      return { isValid: false, error: "Contains an invalid group (not a valid sequence or set)." };
    }
  }

  if (totalCards !== 13) {
    return { isValid: false, error: `Invalid number of cards: expected 13, got ${totalCards}.` };
  }

  if (pureSequenceCount === 0) {
    return { isValid: false, error: "Must contain at least one Pure Sequence." };
  }

  if (pureSequenceCount + impureSequenceCount < 2) {
    return { isValid: false, error: "Must contain at least two sequences (one must be pure)." };
  }

  return { isValid: true };
};
