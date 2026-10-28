import { Card } from "../cards/types";
import { Deck } from "../cards/Deck";
import { TurnManager } from "../turns/TurnManager";
import { Rank } from "../cards/types";
import { CardGroup, validateDeclaration } from "../rules/declaration";
import { INVALID_DECLARATION_PENALTY } from "../scoring/calculator";

export type GameStatus = "WAITING" | "STARTING" | "DEALING" | "DRAW_PHASE" | "DISCARD_PHASE" | "NEXT_PLAYER" | "DECLARATION" | "ROUND_END" | "GAME_END";

export interface Player {
  id: string;
  name: string;
  seat: number;
  hand: Card[]; // Server keeps this hidden from others during broadcast
  score: number;
  hasDropped: boolean;
  status: "ACTIVE" | "DROPPED" | "DECLARED";
}

export class GameState {
  public gameId: string;
  public status: GameStatus;
  public players: Player[];
  public deck: Deck;
  public discardPile: Card[];
  public wildJokerRank!: Rank;
  public turnManager!: TurnManager;

  constructor(gameId: string, playerIds: string[]) {
    this.gameId = gameId;
    this.status = "WAITING";
    this.deck = new Deck();
    this.discardPile = [];
    this.players = playerIds.map((id, index) => ({
      id,
      name: `Player ${index + 1}`,
      seat: index,
      hand: [],
      score: 0,
      hasDropped: false,
      status: "ACTIVE",
    }));
  }

  public startGame(timeLimitSeconds: number = 60) {
    if (this.players.length < 2) throw new Error("Not enough players");
    this.status = "STARTING";
    this.deck.shuffle();
    this.status = "DEALING";
    
    // Deal 13 cards to each player
    for (const player of this.players) {
      player.hand = this.deck.drawMany(13);
    }

    // Draw wild joker
    const jokerCard = this.deck.draw();
    if (!jokerCard) throw new Error("Deck is empty while drawing joker");
    this.wildJokerRank = jokerCard.rank;
    
    // Place it back at the bottom or keep it visible. (Indian Rummy typically keeps it under the deck, but face up)
    // We'll just store the rank.

    // Draw first card for discard pile
    const firstDiscard = this.deck.draw();
    if (!firstDiscard) throw new Error("Deck is empty while drawing first discard");
    this.discardPile.push(firstDiscard);

    this.turnManager = new TurnManager(this.players.map(p => p.id), timeLimitSeconds);
    this.status = "DRAW_PHASE";
  }

  public drawCard(playerId: string, source: "STOCK" | "DISCARD"): Card {
    if (this.status !== "DRAW_PHASE") throw new Error("Not the draw phase");
    if (this.turnManager.getCurrentPlayer() !== playerId) throw new Error("Not your turn");

    let card: Card | undefined;
    if (source === "STOCK") {
      card = this.deck.draw();
    } else {
      card = this.discardPile.pop();
    }

    if (!card) throw new Error("Source is empty");

    const player = this.players.find(p => p.id === playerId)!;
    player.hand.push(card);
    
    this.status = "DISCARD_PHASE";
    return card;
  }

  public discardCard(playerId: string, cardId: string): void {
    if (this.status !== "DISCARD_PHASE") throw new Error("Not the discard phase");
    if (this.turnManager.getCurrentPlayer() !== playerId) throw new Error("Not your turn");

    const player = this.players.find(p => p.id === playerId)!;
    const cardIndex = player.hand.findIndex(c => c.id === cardId);
    if (cardIndex === -1) throw new Error("Card not in hand");

    const card = player.hand.splice(cardIndex, 1)[0];
    this.discardPile.push(card);

    this.status = "NEXT_PLAYER";
    this.turnManager.nextTurn();
    this.status = "DRAW_PHASE";
  }

  public declare(playerId: string, groups: CardGroup[]): void {
    if (this.status !== "DISCARD_PHASE") throw new Error("Can only declare instead of discarding");
    if (this.turnManager.getCurrentPlayer() !== playerId) throw new Error("Not your turn");

    this.status = "DECLARATION";
    const player = this.players.find(p => p.id === playerId)!;
    
    const result = validateDeclaration(groups, this.wildJokerRank);
    if (result.isValid) {
      player.status = "DECLARED";
      player.score = 0; // Winner of the round
      this.status = "ROUND_END";
    } else {
      // Invalid declaration penalty
      player.score = INVALID_DECLARATION_PENALTY;
      player.status = "DROPPED";
      // The game continues, player is essentially out of this round with 80 points
      this.status = "NEXT_PLAYER";
      this.turnManager.nextTurn();
      this.status = "DRAW_PHASE";
    }
  }
}
