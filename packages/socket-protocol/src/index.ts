/**
 * @indian-rummy/socket-protocol
 *
 * Shared Socket.IO event types for client ↔ server communication.
 * The client never decides outcomes — it only sends intents.
 * The server validates via game-engine and broadcasts masked state.
 */

// ─── Card types (mirror game-engine, no import to keep pkg lean) ───────────

export type Suit = "Spades" | "Hearts" | "Diamonds" | "Clubs" | "Joker";
export type Rank =
  | "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10"
  | "J" | "Q" | "K" | "PrintedJoker";

export interface CardDTO {
  id: string;
  suit: Suit;
  rank: Rank;
}

// ─── Player views ───────────────────────────────────────────────────────────

/** Settings when creating a new room */
export interface CreateRoomSettings {
  roomName?: string;
  isPrivate?: boolean;
  maxPlayers?: number;
  maxRounds?: number;
}

/** Public room information for room browser / filtration */
export interface PublicRoomInfo {
  roomCode: string;
  name: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  maxRounds: number;
  phase: GamePhase;
  isPrivate: boolean;
}

/** What each player sees about an opponent (no hand contents) */
export interface OpponentView {
  playerId: string;
  name: string;
  cardCount: number;
  score: number;
  status: PlayerStatus;
  isCurrentTurn: boolean;
  isBot?: boolean;
}

export type PlayerStatus = "WAITING" | "ACTIVE" | "DROPPED" | "DECLARED" | "DISCONNECTED";
export type GamePhase = "LOBBY" | "DEALING" | "DRAW" | "DISCARD" | "ROUND_END" | "GAME_OVER";

/** Full masked game state sent to each individual player */
export interface MaskedGameState {
  roomCode: string;
  roomName?: string;
  phase: GamePhase;
  round: number;
  maxRounds: number;
  maxPlayers?: number;
  myHand: CardDTO[];           // Only the receiving player's actual cards
  myScore: number;
  myStatus: PlayerStatus;
  opponents: OpponentView[];
  discardTopCard: CardDTO | null;
  stockCount: number;
  wildJokerRank: Rank | null;
  currentTurnPlayerId: string | null;
  myPlayerId: string;
  turnDeadlineEpochMs: number | null; // for client-side timer sync
}

/** Round-end summary for score screen */
export interface RoundSummary {
  winnerId: string | null;
  winnerName: string | null;
  scores: { playerId: string; name: string; roundScore: number; totalScore: number }[];
  round: number;
  isGameOver: boolean;
}

// ─── Client → Server events ─────────────────────────────────────────────────

export interface ClientToServerEvents {
  /** Create or join a room */
  join_room: (
    payload: { roomCode: string; playerName: string; settings?: CreateRoomSettings },
    ack: (res: JoinRoomAck) => void
  ) => void;

  /** Query public rooms */
  get_public_rooms: (ack: (res: { success: boolean; rooms: PublicRoomInfo[]; error?: string }) => void) => void;

  /** Voluntary exit/leave from room or game */
  leave_room: (ack?: (res: { success: boolean; error?: string }) => void) => void;

  /** Mark self as ready in lobby */
  player_ready: () => void;

  /** Draw from stock pile */
  draw_stock: () => void;

  /** Draw the top card of the discard pile */
  draw_discard: () => void;

  /** Discard a card — must be in DISCARD phase */
  discard_card: (payload: { cardId: string }) => void;

  /** Attempt a declaration */
  declare: (payload: { groups: string[][] }) => void;

  /** First-turn drop or middle drop (before drawing) */
  drop: () => void;

  /** Proceed to the next round after round completion */
  next_round: () => void;

  /** Add an AI bot to the room (lobby only) */
  add_bot: () => void;

  /** Start the match — Room owner / host only */
  start_game: (ack?: (res: { success: boolean; error?: string }) => void) => void;
}

export interface LobbyPlayer {
  playerId: string;
  name: string;
  ready: boolean;
  isBot?: boolean;
  isHost?: boolean;
}

export interface JoinRoomAck {
  success: boolean;
  error?: string;
  playerId?: string;
  roomCode?: string;
  roomName?: string;
}

// ─── Server → Client events ─────────────────────────────────────────────────

export interface ServerToClientEvents {
  /** Full masked state refresh (after any action or on reconnect) */
  state_update: (state: MaskedGameState) => void;

  /** Broadcast when a player joins/leaves lobby */
  lobby_update: (players: LobbyPlayer[]) => void;

  /** Public rooms update notification */
  public_rooms_update?: (rooms: PublicRoomInfo[]) => void;

  /** Game is starting — deal animation trigger */
  game_started: (payload: { wildJokerRank: Rank }) => void;

  /** A round just ended */
  round_end: (summary: RoundSummary) => void;

  /** Entire game over */
  game_over: (summary: RoundSummary) => void;

  /** Server-side validation error for the client's last action */
  action_error: (payload: { message: string }) => void;
}

// ─── Internal socket data ────────────────────────────────────────────────────

export interface SocketData {
  playerId: string;
  roomCode: string;
  playerName: string;
}
