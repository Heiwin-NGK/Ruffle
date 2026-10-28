import { Card, Rank, Suit } from "./types";

const SUITS: Suit[] = ["Spades", "Hearts", "Diamonds", "Clubs"];
const RANKS: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

export class Deck {
  private cards: Card[] = [];

  constructor() {
    this.initializeDeck();
  }

  /**
   * Initializes a 106-card Indian Rummy deck.
   * 2 standard decks (52 x 2) + 2 Printed Jokers.
   */
  private initializeDeck() {
    this.cards = [];
    
    // Two standard decks
    for (let deckNum = 1; deckNum <= 2; deckNum++) {
      for (const suit of SUITS) {
        for (const rank of RANKS) {
          this.cards.push({
            id: `${suit.charAt(0)}-${rank}-${deckNum}`,
            suit,
            rank,
          });
        }
      }
    }

    // Two printed jokers
    this.cards.push({ id: "Joker-1", suit: "Joker", rank: "PrintedJoker" });
    this.cards.push({ id: "Joker-2", suit: "Joker", rank: "PrintedJoker" });
  }

  /**
   * Fisher-Yates shuffle algorithm.
   */
  public shuffle(): void {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }

  public draw(): Card | undefined {
    return this.cards.pop();
  }

  public drawMany(count: number): Card[] {
    const drawn: Card[] = [];
    for (let i = 0; i < count; i++) {
      const card = this.draw();
      if (card) drawn.push(card);
    }
    return drawn;
  }

  public remainingCount(): number {
    return this.cards.length;
  }
}
