export type Suit = "Spades" | "Hearts" | "Diamonds" | "Clubs" | "Joker";
export type Rank = 
  | "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K"
  | "PrintedJoker";

export interface Card {
  id: string; // Unique ID per card (e.g., 'S-A-1', 'Joker-1')
  suit: Suit;
  rank: Rank;
}
