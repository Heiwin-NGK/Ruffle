import { CardGroup } from "../rules/declaration";
import { Rank } from "../cards/types";
import { isPureSequence, isImpureSequence, isSet } from "../rules/validators";
import { getCardValue } from "../cards/utils";

export const MAX_PENALTY = 80;
export const INVALID_DECLARATION_PENALTY = 80;
export const DROP_PENALTY = 20; // Example initial drop penalty
export const MIDDLE_DROP_PENALTY = 40; // Example middle drop penalty

/**
 * Calculates the deadwood score for a player's hand based on their card groupings.
 * 
 * Scoring rules:
 * - J, Q, K, A = 10 points
 * - Jokers = 0 points
 * - Others = face value
 * - Max score = 80 points
 * 
 * Validation logic for deadwood:
 * - If NO pure sequence exists: all cards are counted.
 * - If 1 pure seq exists but NO second sequence exists: only the pure sequence is exempt, all others counted.
 * - If 1 pure seq and 1 other seq exist: all valid sequences and sets are exempt, only invalid groups are counted.
 */
export const calculateDeadwoodScore = (groups: CardGroup[], wildJokerRank: Rank): number => {
  let pureSequenceCount = 0;
  let impureSequenceCount = 0;

  // Evaluate groups
  const groupStatuses = groups.map(group => {
    if (isPureSequence(group)) {
      pureSequenceCount++;
      return { group, isValid: true, type: "PURE_SEQ" };
    } else if (isImpureSequence(group, wildJokerRank)) {
      impureSequenceCount++;
      return { group, isValid: true, type: "IMPURE_SEQ" };
    } else if (isSet(group, wildJokerRank)) {
      return { group, isValid: true, type: "SET" };
    }
    return { group, isValid: false, type: "INVALID" };
  });

  const hasPure = pureSequenceCount > 0;
  const hasTwoSequences = pureSequenceCount + impureSequenceCount >= 2;

  let totalScore = 0;

  for (const status of groupStatuses) {
    let countThisGroup = false;

    if (!hasPure) {
      // Rule 1: No pure sequence, count EVERYTHING
      countThisGroup = true;
    } else if (!hasTwoSequences) {
      // Rule 2: Has pure, but no second sequence. Only pure sequences are exempt.
      if (status.type !== "PURE_SEQ") {
        countThisGroup = true;
      }
    } else {
      // Rule 3: Valid baseline. Only count invalid groups.
      if (!status.isValid) {
        countThisGroup = true;
      }
    }

    if (countThisGroup) {
      for (const card of status.group) {
        totalScore += getCardValue(card, wildJokerRank);
      }
    }
  }

  return Math.min(totalScore, MAX_PENALTY);
};
