import { Card, Rank } from "./types";

export const isPrintedJoker = (card: Card): boolean => {
  return card.rank === "PrintedJoker";
};

export const isWildJoker = (card: Card, wildJokerRank: Rank): boolean => {
  return card.rank === wildJokerRank;
};

export const isAnyJoker = (card: Card, wildJokerRank: Rank): boolean => {
  return isPrintedJoker(card) || isWildJoker(card, wildJokerRank);
};

export const getCardValue = (card: Card, wildJokerRank: Rank): number => {
  if (isAnyJoker(card, wildJokerRank)) return 0;
  if (["J", "Q", "K", "A"].includes(card.rank)) return 10;
  return parseInt(card.rank, 10) || 0;
};
