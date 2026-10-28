import { Deck } from "@indian-rummy/game-engine";
import { TurnManager } from "@indian-rummy/game-engine";
import { validateDeclaration } from "@indian-rummy/game-engine";
import { calculateDeadwoodScore } from "@indian-rummy/game-engine";
import { extractGroups, pickDiscardCard } from "@indian-rummy/game-engine";
import type {
  CardDTO,
  Rank,
  MaskedGameState,
  OpponentView,
  PlayerStatus,
  GamePhase,
  RoundSummary,
  CreateRoomSettings,
  PublicRoomInfo,
  LobbyPlayer,
} from "@indian-rummy/socket-protocol";
import type { DatabaseManager } from "./db/DatabaseManager";
import type { RedisStore } from "./redis/RedisStore";

// ─── Internal types ──────────────────────────────────────────────────────────

export interface RoomPlayer {
  playerId: string;
  name: string;
  socketId: string;
  hand: CardDTO[];
  score: number;       // cumulative across rounds
  roundScore: number;  // score for current round only
  status: PlayerStatus;
  ready: boolean;
  turnsTaken: number;  // 0 = first turn (first drop 20 pts), >0 = middle drop (40 pts)
  isBot?: boolean;
  reconnectDeadlineMs?: number | null;
  reconnectTimerHandle?: ReturnType<typeof setTimeout> | null;
}

export interface RoomState {
  roomCode: string;
  name: string;
  isPrivate: boolean;
  maxPlayers: number;
  hostPlayerId: string | null;
  phase: GamePhase;
  players: RoomPlayer[];
  round: number;
  maxRounds: number;
  stock: CardDTO[];
  discardPile: CardDTO[];
  wildJokerRank: Rank | null;
  currentTurnPlayerId: string | null;
  turnManager: TurnManager | null;
  turnDeadlineMs: number | null;
  turnTimerHandle: ReturnType<typeof setTimeout> | null;
}

export interface RoomManagerListener {
  onStateUpdate: (roomCode: string) => void;
  onRoundEnd: (roomCode: string, summary: RoundSummary) => void;
  onGameOver: (roomCode: string, summary: RoundSummary) => void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const TURN_DURATION_MS = 60_000; // 1 minute per turn
export const RECONNECT_GRACE_MS = 30_000; // 30s reconnection window

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function deckCardToDTO(card: { id: string; suit: string; rank: string }): CardDTO {
  return { id: card.id, suit: card.suit as CardDTO["suit"], rank: card.rank as Rank };
}

// ─── RoomManager ─────────────────────────────────────────────────────────────

export class RoomManager {
  private rooms = new Map<string, RoomState>();
  private listener: RoomManagerListener | null = null;
  private db: DatabaseManager | null = null;
  private redis: RedisStore | null = null;

  constructor(options?: { db?: DatabaseManager; redis?: RedisStore }) {
    if (options?.db) this.db = options.db;
    if (options?.redis) this.redis = options.redis;
  }

  public setListener(listener: RoomManagerListener): void {
    this.listener = listener;
  }

  /** Synchronize active room state with Redis and PostgreSQL */
  private async syncState(roomCode: string): Promise<void> {
    const room = this.rooms.get(roomCode);
    if (!room) return;

    if (this.redis) {
      // Create a clean serializable snapshot
      const snapshot = {
        roomCode: room.roomCode,
        phase: room.phase,
        round: room.round,
        maxRounds: room.maxRounds,
        wildJokerRank: room.wildJokerRank,
        currentTurnPlayerId: room.currentTurnPlayerId,
        turnDeadlineMs: room.turnDeadlineMs,
        stockCount: room.stock.length,
        discardPileCount: room.discardPile.length,
        players: room.players.map(p => ({
          playerId: p.playerId,
          name: p.name,
          score: p.score,
          roundScore: p.roundScore,
          status: p.status,
          ready: p.ready,
          isBot: p.isBot,
          cardCount: p.hand.length,
        })),
      };
      await this.redis.setRoomState(roomCode, snapshot);
    }

    if (this.db) {
      this.db.saveRoom(roomCode, room.phase, room.round, room.maxRounds);
    }
  }

  /** Create a new room, returning the code */
  createRoom(options?: number | CreateRoomSettings): string {
    let maxRounds = 3;
    let roomName = "";
    let isPrivate = false;
    let maxPlayers = 6;

    if (typeof options === "number") {
      maxRounds = options;
    } else if (options) {
      if (options.maxRounds) maxRounds = Math.min(10, Math.max(1, options.maxRounds));
      if (options.roomName) roomName = options.roomName.trim();
      if (typeof options.isPrivate === "boolean") isPrivate = options.isPrivate;
      if (options.maxPlayers) maxPlayers = Math.min(6, Math.max(2, options.maxPlayers));
    }

    let code = generateRoomCode();
    while (this.rooms.has(code)) code = generateRoomCode();

    const room: RoomState = {
      roomCode: code,
      name: roomName || `${code} Table`,
      isPrivate,
      maxPlayers,
      hostPlayerId: null,
      phase: "LOBBY",
      players: [],
      round: 0,
      maxRounds,
      stock: [],
      discardPile: [],
      wildJokerRank: null,
      currentTurnPlayerId: null,
      turnManager: null,
      turnDeadlineMs: null,
      turnTimerHandle: null,
    };

    this.rooms.set(code, room);
    this.syncState(code);
    return code;
  }

  getRoom(code: string): RoomState | undefined {
    return this.rooms.get(code);
  }

  /** List all public discoverable rooms */
  listPublicRooms(): PublicRoomInfo[] {
    const list: PublicRoomInfo[] = [];
    for (const room of this.rooms.values()) {
      if (room.isPrivate) continue;
      const host = room.players.find(p => !p.isBot) || room.players[0];
      list.push({
        roomCode: room.roomCode,
        name: room.name,
        hostName: host ? host.name : "Host",
        playerCount: room.players.length,
        maxPlayers: room.maxPlayers,
        maxRounds: room.maxRounds,
        phase: room.phase,
        isPrivate: false,
      });
    }
    return list;
  }

  /** Join an existing room. Returns { playerId } or throws. */
  joinRoom(roomCode: string, socketId: string, playerName: string, isBot = false): { playerId: string } {
    const room = this.rooms.get(roomCode);
    if (!room) throw new Error("Room not found");
    if (room.phase !== "LOBBY") throw new Error("Game already in progress");
    if (room.players.length >= room.maxPlayers) {
      throw new Error(`Room is full (max ${room.maxPlayers} players)`);
    }

    const playerId = isBot
      ? `bot_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`
      : `player_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    // First human player becomes room host/owner
    if (!room.hostPlayerId && !isBot) {
      room.hostPlayerId = playerId;
    }

    room.players.push({
      playerId,
      name: playerName,
      socketId,
      hand: [],
      score: 0,
      roundScore: 0,
      status: "WAITING",
      ready: isBot || playerId === room.hostPlayerId, // Host & bots are ready by default
      turnsTaken: 0,
      isBot,
      reconnectDeadlineMs: null,
      reconnectTimerHandle: null,
    });

    if (this.redis) this.redis.setPlayerSession(playerId, roomCode);
    this.syncState(roomCode);
    return { playerId };
  }

  /** Voluntary exit/leave from room or active match */
  leaveRoom(roomCode: string, playerId: string): { summary?: RoundSummary; roomDeleted?: boolean } {
    const room = this.rooms.get(roomCode);
    if (!room) return { roomDeleted: true };

    const playerIndex = room.players.findIndex(p => p.playerId === playerId);
    if (playerIndex === -1) return { roomDeleted: false };
    const player = room.players[playerIndex];

    if (player.reconnectTimerHandle) {
      clearTimeout(player.reconnectTimerHandle);
      player.reconnectTimerHandle = null;
    }

    if (room.phase === "LOBBY") {
      room.players.splice(playerIndex, 1);
      if (room.players.length === 0) {
        if (room.turnTimerHandle) clearTimeout(room.turnTimerHandle);
        this.rooms.delete(roomCode);
        return { roomDeleted: true };
      }
      // Reassign host if owner left
      if (room.hostPlayerId === playerId) {
        const nextHost = room.players.find(p => !p.isBot);
        room.hostPlayerId = nextHost ? nextHost.playerId : null;
        if (nextHost) nextHost.ready = true;
      }
      this.syncState(roomCode);
      return { roomDeleted: false };
    }

    // In active game: leaving forfeits the hand (drop penalty)
    if (player.status === "ACTIVE") {
      const penalty = player.turnsTaken === 0 ? 20 : 40;
      player.roundScore = penalty;
      player.score += penalty;
      player.status = "DROPPED";
    }

    let summary: RoundSummary | undefined;
    if (room.currentTurnPlayerId === playerId) {
      summary = this._advanceTurn(room);
    } else {
      const active = room.players.filter(p => p.status === "ACTIVE");
      if (active.length <= 1 && (room.phase === "DRAW" || room.phase === "DISCARD")) {
        summary = this._advanceTurn(room);
      }
    }

    this.syncState(roomCode);
    return { summary, roomDeleted: false };
  }

  /** Add an AI bot to the room */
  addBot(roomCode: string): { playerId: string; name: string } {
    const room = this.rooms.get(roomCode);
    if (!room) throw new Error("Room not found");
    if (room.phase !== "LOBBY") throw new Error("Cannot add bot while game is in progress");
    if (room.players.length >= room.maxPlayers) {
      throw new Error(`Room is full (max ${room.maxPlayers} players)`);
    }

    const botNumber = room.players.filter(p => p.isBot).length + 1;
    const botName = `Bot ${botNumber}`;
    const { playerId } = this.joinRoom(roomCode, `bot_sock_${Date.now()}`, botName, true);
    return { playerId, name: botName };
  }

  /** Mark a player as ready. Returns true if all players are ready (≥2). */
  setReady(roomCode: string, playerId: string, isReady = true): boolean {
    const room = this.rooms.get(roomCode);
    if (!room) return false;
    const player = room.players.find(p => p.playerId === playerId);
    if (player) player.ready = isReady;
    this.syncState(roomCode);
    const readyCount = room.players.filter(p => p.ready).length;
    return readyCount >= 2 && readyCount === room.players.length;
  }

  /** Retrieve lobby player views with host indicator */
  getLobbyPlayers(roomCode: string): LobbyPlayer[] {
    const room = this.rooms.get(roomCode);
    if (!room) return [];
    return room.players.map(p => ({
      playerId: p.playerId,
      name: p.name,
      ready: p.playerId === room.hostPlayerId ? true : p.ready,
      isBot: p.isBot,
      isHost: p.playerId === room.hostPlayerId,
    }));
  }

  /** Check if the room owner can start the game */
  canStartGame(roomCode: string): { canStart: boolean; reason?: string } {
    const room = this.rooms.get(roomCode);
    if (!room) return { canStart: false, reason: "Room not found" };
    if (room.phase !== "LOBBY") return { canStart: false, reason: "Game already started" };
    if (room.players.length < 2) {
      return { canStart: false, reason: "Waiting for at least 1 more player or bot to join" };
    }

    const nonHostPlayers = room.players.filter(p => p.playerId !== room.hostPlayerId);
    const unready = nonHostPlayers.filter(p => !p.ready);
    if (unready.length > 0) {
      return {
        canStart: false,
        reason: `Waiting for ${unready.map(p => p.name).join(", ")} to get ready`,
      };
    }
    return { canStart: true };
  }

  /** Deal cards and start round 1. */
  startGame(roomCode: string): RoomState {
    const room = this.rooms.get(roomCode)!;
    room.round = 1;
    this._dealRound(room);
    this.syncState(roomCode);
    return room;
  }

  private _dealRound(room: RoomState): void {
    room.phase = "DEALING";

    const deck = new Deck();
    deck.shuffle();

    // Draw wild joker card
    const jokerCard = deck.draw()!;
    room.wildJokerRank = jokerCard.rank as Rank;

    // Deal 13 cards to each player
    for (const player of room.players) {
      player.hand = deck.drawMany(13).map(deckCardToDTO);
      player.roundScore = 0;
      player.turnsTaken = 0;
      player.status = "ACTIVE";
    }

    // First discard
    const firstDiscard = deck.draw()!;
    room.discardPile = [deckCardToDTO(firstDiscard)];
    // Put remaining cards into stock
    const stockCount = deck.remainingCount();
    room.stock = deck.drawMany(stockCount).map(deckCardToDTO);

    // Turn manager
    const playerIds = room.players.map(p => p.playerId);
    room.turnManager = new TurnManager(playerIds, 999);
    room.currentTurnPlayerId = room.turnManager.getCurrentPlayer();
    room.phase = "DRAW";

    this._scheduleTurn(room);
  }

  /** Draw from stock. Returns drawn card or throws. */
  drawStock(roomCode: string, playerId: string): CardDTO {
    const room = this._assertTurn(roomCode, playerId, "DRAW");
    if (room.stock.length === 0) this._reshuffleDiscard(room);
    const card = room.stock.pop()!;
    const player = room.players.find(p => p.playerId === playerId)!;
    player.hand.push(card);
    room.phase = "DISCARD";

    this.db?.logAction(roomCode, room.round, playerId, "DRAW_STOCK");
    this.syncState(roomCode);
    this._scheduleTurn(room);
    return card;
  }

  /** Draw top of discard. Returns drawn card or throws. */
  drawDiscard(roomCode: string, playerId: string): CardDTO {
    const room = this._assertTurn(roomCode, playerId, "DRAW");
    if (room.discardPile.length === 0) throw new Error("Discard pile is empty");
    const card = room.discardPile.pop()!;
    const player = room.players.find(p => p.playerId === playerId)!;
    player.hand.push(card);
    room.phase = "DISCARD";

    this.db?.logAction(roomCode, room.round, playerId, "DRAW_DISCARD", { cardId: card.id });
    this.syncState(roomCode);
    this._scheduleTurn(room);
    return card;
  }

  /** Discard a card. Returns the discarded card and optional RoundSummary (if sole survivor) or throws. */
  discardCard(roomCode: string, playerId: string, cardId: string): { card: CardDTO; summary?: RoundSummary } {
    const room = this._assertTurn(roomCode, playerId, "DISCARD");
    const player = room.players.find(p => p.playerId === playerId)!;
    const idx = player.hand.findIndex(c => c.id === cardId);
    if (idx === -1) throw new Error("Card not in hand");
    const [card] = player.hand.splice(idx, 1);
    room.discardPile.push(card);
    player.turnsTaken += 1;

    this.db?.logAction(roomCode, room.round, playerId, "DISCARD", { cardId });
    this.syncState(roomCode);
    const summary = this._advanceTurn(room);
    return { card, summary };
  }

  /** Attempt a declaration. Returns valid flag, error, and RoundSummary */
  declare(roomCode: string, playerId: string, groups: string[][]): { valid: boolean; summary?: RoundSummary; error?: string } {
    const room = this._assertTurn(roomCode, playerId, "DISCARD");
    const player = room.players.find(p => p.playerId === playerId)!;

    // Map group ids back to CardDTOs
    const cardMap = new Map(player.hand.map(c => [c.id, c]));
    const cardGroups = groups.map(g =>
      g.map(id => {
        const card = cardMap.get(id);
        if (!card) throw new Error(`Card ${id} not in hand`);
        return { id: card.id, suit: card.suit, rank: card.rank };
      })
    );

    const result = validateDeclaration(cardGroups, room.wildJokerRank as Rank);
    this.db?.logAction(roomCode, room.round, playerId, "DECLARE", { isValid: result.isValid, error: result.error });

    if (!result.isValid) {
      // WRONG SHOW (Invalid declaration): 80 penalty points
      player.roundScore = 80;
      player.score += 80;
      player.status = "DROPPED";

      // Check if only 1 active player remains
      const activePlayers = room.players.filter(p => p.status === "ACTIVE");
      if (activePlayers.length === 1) {
        const soleWinner = activePlayers[0];
        soleWinner.roundScore = 0;
        soleWinner.status = "DECLARED";
        const summary = this._buildRoundSummary(room, soleWinner.playerId);
        this.syncState(roomCode);
        return { valid: false, error: result.error ?? "Invalid declaration (80 pt penalty)", summary };
      }

      const summary = this._advanceTurn(room);
      this.syncState(roomCode);
      return { valid: false, error: result.error ?? "Invalid declaration (80 pt penalty incurred)", summary };
    }

    // VALID DECLARATION
    player.status = "DECLARED";
    player.roundScore = 0;

    for (const other of room.players) {
      if (other.playerId === playerId) continue;
      if (other.status === "ACTIVE") {
        const otherGroups = other.hand.map(c => [c]);
        other.roundScore = Math.min(80, calculateDeadwoodScore(otherGroups, room.wildJokerRank as Rank));
        other.score += other.roundScore;
        other.status = "DROPPED";
      }
    }

    const summary = this._buildRoundSummary(room, playerId);
    this.syncState(roomCode);
    return { valid: true, summary };
  }

  /** Drop (First drop = 20 pts, Middle drop = 40 pts). Returns RoundSummary if sole survivor. */
  drop(roomCode: string, playerId: string): { summary?: RoundSummary } {
    const room = this._assertTurn(roomCode, playerId, "DRAW");
    const player = room.players.find(p => p.playerId === playerId)!;

    // First turn drop = 20 pts; Middle drop = 40 pts
    const penalty = player.turnsTaken === 0 ? 20 : 40;
    player.roundScore = penalty;
    player.score += penalty;
    player.status = "DROPPED";

    this.db?.logAction(roomCode, room.round, playerId, "DROP", { penalty });

    // Check sole survivor
    const activePlayers = room.players.filter(p => p.status === "ACTIVE");
    if (activePlayers.length === 1) {
      const soleWinner = activePlayers[0];
      soleWinner.roundScore = 0;
      soleWinner.status = "DECLARED";
      const summary = this._buildRoundSummary(room, soleWinner.playerId);
      this.syncState(roomCode);
      return { summary };
    }

    const summary = this._advanceTurn(room);
    this.syncState(roomCode);
    return { summary };
  }

  /** Start next round or transition to GAME_OVER. */
  nextRound(roomCode: string): RoomState {
    const room = this.rooms.get(roomCode);
    if (!room) throw new Error("Room not found");
    if (room.phase !== "ROUND_END") throw new Error("Round is not over yet");

    room.round += 1;
    if (room.round > room.maxRounds) {
      room.phase = "GAME_OVER";
    } else {
      for (const p of room.players) {
        p.ready = true;
        p.status = "ACTIVE";
        p.hand = [];
        p.roundScore = 0;
        p.turnsTaken = 0;
      }
      this._dealRound(room);
    }

    this.syncState(roomCode);
    return room;
  }

  /** Build a masked state view for a specific player. */
  buildMaskedState(roomCode: string, forPlayerId: string): MaskedGameState {
    const room = this.rooms.get(roomCode)!;
    const me = room.players.find(p => p.playerId === forPlayerId);
    if (!me) throw new Error(`Player ${forPlayerId} not found in room`);

    const opponents: OpponentView[] = room.players
      .filter(p => p.playerId !== forPlayerId)
      .map(p => ({
        playerId: p.playerId,
        name: p.name,
        cardCount: p.hand.length,
        score: p.score,
        status: p.status,
        isCurrentTurn: room.currentTurnPlayerId === p.playerId,
        isBot: p.isBot,
      }));

    return {
      roomCode,
      roomName: room.name,
      phase: room.phase,
      round: room.round,
      maxRounds: room.maxRounds,
      maxPlayers: room.maxPlayers,
      myHand: me.hand,
      myScore: me.score,
      myStatus: me.status,
      opponents,
      discardTopCard: room.discardPile.length > 0 ? room.discardPile[room.discardPile.length - 1] : null,
      stockCount: room.stock.length,
      wildJokerRank: room.wildJokerRank,
      currentTurnPlayerId: room.currentTurnPlayerId,
      myPlayerId: forPlayerId,
      turnDeadlineEpochMs: room.turnDeadlineMs,
    };
  }

  /** Reconnect: update socket id for a player within the 30-second window */
  reconnect(roomCode: string, playerId: string, newSocketId: string): boolean {
    const room = this.rooms.get(roomCode);
    if (!room) return false;
    const player = room.players.find(p => p.playerId === playerId);
    if (!player) return false;

    player.socketId = newSocketId;
    if (player.reconnectTimerHandle) {
      clearTimeout(player.reconnectTimerHandle);
      player.reconnectTimerHandle = null;
    }
    player.reconnectDeadlineMs = null;

    if (player.status === "DISCONNECTED") {
      player.status = "ACTIVE";
      console.log(`[reconnect-success] ${player.name} (${playerId}) reconnected to room ${roomCode} within 30s window.`);
    }

    this.syncState(roomCode);
    return true;
  }

  /** Mark player as disconnected and start 30-second reconnection grace timer */
  markDisconnected(socketId: string): string | null {
    for (const room of this.rooms.values()) {
      const player = room.players.find(p => p.socketId === socketId);
      if (player && !player.isBot) {
        if (room.phase !== "LOBBY" && player.status === "ACTIVE") {
          player.status = "DISCONNECTED";
          player.reconnectDeadlineMs = Date.now() + 30_000;

          if (player.reconnectTimerHandle) clearTimeout(player.reconnectTimerHandle);
          player.reconnectTimerHandle = setTimeout(() => {
            this._handleReconnectTimeout(room.roomCode, player.playerId);
          }, 30_000);

          console.log(`[disconnect-grace] ${player.name} (${player.playerId}) disconnected. 30s reconnect window started.`);
          this.syncState(room.roomCode);
          return room.roomCode;
        } else if (room.phase === "LOBBY") {
          const idx = room.players.findIndex(p => p.playerId === player.playerId);
          if (idx !== -1) room.players.splice(idx, 1);
          this.syncState(room.roomCode);
          return room.roomCode;
        }
      }
    }
    return null;
  }

  /** Handle expiration of the 30-second reconnection timer */
  private _handleReconnectTimeout(roomCode: string, playerId: string): void {
    const room = this.rooms.get(roomCode);
    if (!room || room.phase === "ROUND_END" || room.phase === "GAME_OVER") return;

    const player = room.players.find(p => p.playerId === playerId);
    if (!player || player.status !== "DISCONNECTED") return;

    console.log(`[reconnect-timeout] 30s expired for ${player.name} (${playerId}) in ${roomCode}. Auto-dropping.`);
    player.reconnectDeadlineMs = null;
    player.reconnectTimerHandle = null;

    // Apply drop penalty
    const penalty = player.turnsTaken === 0 ? 20 : 40;
    player.roundScore = penalty;
    player.score += penalty;
    player.status = "DROPPED";

    let summary: RoundSummary | undefined;
    if (room.currentTurnPlayerId === playerId) {
      summary = this._advanceTurn(room);
    } else {
      const activePlayers = room.players.filter(p => p.status === "ACTIVE");
      if (activePlayers.length === 1) {
        const soleWinner = activePlayers[0];
        soleWinner.roundScore = 0;
        soleWinner.status = "DECLARED";
        summary = this._buildRoundSummary(room, soleWinner.playerId);
      }
    }

    this.syncState(roomCode);
    if (this.listener) {
      this.listener.onStateUpdate(roomCode);
      if (summary) {
        this.listener.onRoundEnd(roomCode, summary);
        if (summary.isGameOver) {
          this.listener.onGameOver(roomCode, summary);
        }
      }
    }
  }

  /** Find room by socket id. */
  findRoomBySocket(socketId: string): { room: RoomState; player: RoomPlayer } | null {
    for (const room of this.rooms.values()) {
      const player = room.players.find(p => p.socketId === socketId);
      if (player) return { room, player };
    }
    return null;
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private _assertTurn(roomCode: string, playerId: string, phase: GamePhase): RoomState {
    const room = this.rooms.get(roomCode);
    if (!room) throw new Error("Room not found");
    if (room.phase !== phase) throw new Error(`Expected phase ${phase}, got ${room.phase}`);
    if (room.currentTurnPlayerId !== playerId) throw new Error("Not your turn");
    return room;
  }

  private _advanceTurn(room: RoomState): RoundSummary | undefined {
    if (room.turnTimerHandle) {
      clearTimeout(room.turnTimerHandle);
      room.turnTimerHandle = null;
    }

    const activePlayers = room.players.filter(p => p.status === "ACTIVE");
    if (activePlayers.length <= 1) {
      if (activePlayers.length === 1) {
        const soleWinner = activePlayers[0];
        soleWinner.roundScore = 0;
        soleWinner.status = "DECLARED";
        return this._buildRoundSummary(room, soleWinner.playerId);
      }
    }

    room.turnManager!.nextTurn();
    let next = room.turnManager!.getCurrentPlayer();
    let safety = room.players.length;
    while (safety-- > 0) {
      const p = room.players.find(pl => pl.playerId === next)!;
      if (p.status === "ACTIVE") break;
      room.turnManager!.nextTurn();
      next = room.turnManager!.getCurrentPlayer();
    }
    room.currentTurnPlayerId = next;
    room.phase = "DRAW";

    this._scheduleTurn(room);
    return undefined;
  }

  private _scheduleTurn(room: RoomState): void {
    if (room.turnTimerHandle) {
      clearTimeout(room.turnTimerHandle);
      room.turnTimerHandle = null;
    }

    if (room.phase === "ROUND_END" || room.phase === "GAME_OVER") return;

    room.turnDeadlineMs = Date.now() + TURN_DURATION_MS;
    const currentId = room.currentTurnPlayerId;
    if (!currentId) return;

    const currentPlayer = room.players.find(p => p.playerId === currentId);
    if (!currentPlayer) return;

    if (currentPlayer.isBot) {
      // Execute bot move after short realistic delay
      room.turnTimerHandle = setTimeout(() => {
        this._executeBotMove(room.roomCode, currentId);
      }, 1000);
    } else {
      // 1 minute timeout for human player
      room.turnTimerHandle = setTimeout(() => {
        this._handleTurnTimeout(room.roomCode, currentId);
      }, TURN_DURATION_MS);
    }
  }

  private _handleTurnTimeout(roomCode: string, playerId: string): void {
    const room = this.rooms.get(roomCode);
    if (!room || room.currentTurnPlayerId !== playerId) return;

    console.log(`[timeout] Auto-action for ${playerId} in room ${roomCode} (${room.phase})`);

    let summary: RoundSummary | undefined;
    if (room.phase === "DRAW") {
      // Auto-drop on timeout in draw phase
      const res = this.drop(roomCode, playerId);
      summary = res.summary;
    } else if (room.phase === "DISCARD") {
      // Auto-discard last card in hand
      const player = room.players.find(p => p.playerId === playerId);
      if (player && player.hand.length > 0) {
        const lastCard = player.hand[player.hand.length - 1];
        const res = this.discardCard(roomCode, playerId, lastCard.id);
        summary = res.summary;
      }
    }

    if (this.listener) {
      this.listener.onStateUpdate(roomCode);
      if (summary) {
        this.listener.onRoundEnd(roomCode, summary);
        if (summary.isGameOver) {
          this.listener.onGameOver(roomCode, summary);
        }
      }
    }
  }

  private _executeBotMove(roomCode: string, botId: string): void {
    const room = this.rooms.get(roomCode);
    if (!room || room.currentTurnPlayerId !== botId) return;

    const bot = room.players.find(p => p.playerId === botId);
    if (!bot || bot.status !== "ACTIVE") return;

    try {
      if (room.phase === "DRAW") {
        const topDiscard = room.discardPile[room.discardPile.length - 1];
        let takeDiscard = false;

        if (topDiscard && room.wildJokerRank) {
          const testHand = [...bot.hand, topDiscard] as any;
          const [groupsWith] = extractGroups(testHand, room.wildJokerRank);
          const [groupsWithout] = extractGroups(bot.hand as any, room.wildJokerRank);
          if (groupsWith.length > groupsWithout.length) {
            takeDiscard = true;
          }
        }

        if (takeDiscard) {
          this.drawDiscard(roomCode, botId);
        } else {
          this.drawStock(roomCode, botId);
        }

        if (this.listener) this.listener.onStateUpdate(roomCode);

        // Schedule discard/declare
        setTimeout(() => {
          this._executeBotMove(roomCode, botId);
        }, 700);
        return;
      }

      if (room.phase === "DISCARD") {
        const [groups, leftover] = extractGroups(bot.hand as any, room.wildJokerRank!);

        if (leftover.length === 1 && bot.hand.length === 14) {
          const toDiscard = leftover[0];
          const declareCandidateHand = bot.hand.filter(c => c.id !== toDiscard.id);
          const [candidateGroups] = extractGroups(declareCandidateHand as any, room.wildJokerRank!);
          const res = validateDeclaration(candidateGroups, room.wildJokerRank!);

          if (res.isValid) {
            const stringGroups = candidateGroups.map(g => g.map(c => c.id));
            const decResult = this.declare(roomCode, botId, stringGroups);

            if (this.listener) {
              this.listener.onStateUpdate(roomCode);
              if (decResult.summary) {
                this.listener.onRoundEnd(roomCode, decResult.summary);
                if (decResult.summary.isGameOver) {
                  this.listener.onGameOver(roomCode, decResult.summary);
                }
              }
            }
            return;
          }
        }

        const worst = pickDiscardCard(bot.hand as any, room.wildJokerRank!);
        const discardRes = this.discardCard(roomCode, botId, worst.id);

        if (this.listener) {
          this.listener.onStateUpdate(roomCode);
          if (discardRes.summary) {
            this.listener.onRoundEnd(roomCode, discardRes.summary);
            if (discardRes.summary.isGameOver) {
              this.listener.onGameOver(roomCode, discardRes.summary);
            }
          }
        }
      }
    } catch (err) {
      console.error("[bot] Error during bot turn:", err);
    }
  }

  private _reshuffleDiscard(room: RoomState): void {
    if (room.discardPile.length <= 1) throw new Error("No cards available");
    const top = room.discardPile.pop()!;
    const reshuffled = room.discardPile.splice(0);
    reshuffled.sort(() => Math.random() - 0.5);
    room.stock = reshuffled;
    room.discardPile = [top];
  }

  private _buildRoundSummary(room: RoomState, winnerId: string): RoundSummary {
    if (room.turnTimerHandle) {
      clearTimeout(room.turnTimerHandle);
      room.turnTimerHandle = null;
    }

    const isGameOver = room.round >= room.maxRounds;
    if (isGameOver) room.phase = "GAME_OVER";
    else room.phase = "ROUND_END";

    const winner = room.players.find(p => p.playerId === winnerId)!;
    const summary: RoundSummary = {
      winnerId,
      winnerName: winner.name,
      scores: room.players.map(p => ({
        playerId: p.playerId,
        name: p.name,
        roundScore: p.roundScore,
        totalScore: p.score,
      })),
      round: room.round,
      isGameOver,
    };

    if (this.db) {
      this.db.saveRoundSummary(room.roomCode, summary, room.wildJokerRank ?? "Joker");
    }

    return summary;
  }
}
