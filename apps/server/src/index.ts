import { Server, Socket } from "socket.io";
import { createServer } from "http";
import { RoomManager } from "./RoomManager";
import { DatabaseManager } from "./db/DatabaseManager";
import { RedisStore } from "./redis/RedisStore";
import {
  SocketRateLimiter,
  sanitizeAndValidateName,
  validateRoomCode,
  validateDeclareGroups,
} from "./middleware/rateLimiter";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
  RoundSummary,
} from "@indian-rummy/socket-protocol";

const PORT = process.env.PORT || 3001;

const httpServer = createServer();
const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(
  httpServer,
  {
    cors: { origin: "*", methods: ["GET", "POST"] },
    pingTimeout: 60_000,
    pingInterval: 25_000,
  }
);

// ─── Initialize Infrastructure with Graceful Fallback ───────────────────────
const db = new DatabaseManager();
const redis = new RedisStore();
const limiter = new SocketRateLimiter({ windowMs: 1000, maxRequestsPerWindow: 15 });
const rooms = new RoomManager({ db, redis });

// ─── Helper: broadcast masked state to every player in a room ───────────────
function broadcastState(roomCode: string): void {
  const room = rooms.getRoom(roomCode);
  if (!room) return;
  for (const player of room.players) {
    if (player.isBot) continue; // Bots don't have sockets
    try {
      const masked = rooms.buildMaskedState(roomCode, player.playerId);
      io.to(player.socketId).emit("state_update", masked);
    } catch {
      // player may have disconnected
    }
  }
}

// ─── Connect RoomManager listener for async events (timers, bot turns) ──────
rooms.setListener({
  onStateUpdate: (roomCode: string) => {
    broadcastState(roomCode);
  },
  onRoundEnd: (roomCode: string, summary: RoundSummary) => {
    io.to(roomCode).emit("round_end", summary);
  },
  onGameOver: (roomCode: string, summary: RoundSummary) => {
    io.to(roomCode).emit("game_over", summary);
  },
});

// ─── Connection ─────────────────────────────────────────────────────────────
io.on("connection", (socket: Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>) => {
  console.log(`[+] Connected: ${socket.id}`);

  // Rate limit check helper
  const isAllowed = (): boolean => {
    const { allowed } = limiter.checkLimit(socket.id);
    if (!allowed) {
      socket.emit("action_error", { message: "Too many actions! Please slow down." });
      return false;
    }
    return true;
  };

  // ── get_public_rooms ─────────────────────────────────────────────────────
  socket.on("get_public_rooms", (ack) => {
    try {
      const list = rooms.listPublicRooms();
      ack({ success: true, rooms: list });
    } catch (err: unknown) {
      ack({ success: false, error: (err as Error).message, rooms: [] });
    }
  });

  // ── leave_room ────────────────────────────────────────────────────────────
  socket.on("leave_room", (ack) => {
    const { roomCode, playerId, playerName } = socket.data;
    if (!roomCode || !playerId) {
      if (ack) ack({ success: true });
      return;
    }

    try {
      const res = rooms.leaveRoom(roomCode, playerId);
      socket.leave(roomCode);
      delete (socket.data as any).roomCode;
      delete (socket.data as any).playerId;

      if (res.roomDeleted) {
        console.log(`[leave] Room ${roomCode} deleted (empty)`);
      } else {
        const room = rooms.getRoom(roomCode);
        if (room) {
          if (room.phase === "LOBBY") {
            io.to(roomCode).emit("lobby_update", rooms.getLobbyPlayers(roomCode));
          } else {
            broadcastState(roomCode);
            if (res.summary) {
              io.to(roomCode).emit("round_end", res.summary);
              if (res.summary.isGameOver) {
                io.to(roomCode).emit("game_over", res.summary);
              }
            }
          }
        }
      }
      console.log(`[leave] ${playerName} (${playerId}) left room ${roomCode}`);
      if (ack) ack({ success: true });
    } catch (err: unknown) {
      if (ack) ack({ success: false, error: (err as Error).message });
    }
  });

  // ── join_room ────────────────────────────────────────────────────────────
  socket.on("join_room", ({ roomCode, playerName, settings }, ack) => {
    if (!isAllowed()) {
      ack({ success: false, error: "Rate limit exceeded" });
      return;
    }

    try {
      const nameVal = sanitizeAndValidateName(playerName);
      if (!nameVal.valid) {
        ack({ success: false, error: nameVal.error });
        return;
      }
      const safeName = nameVal.cleanName;

      let code = roomCode;
      if (roomCode === "NEW") {
        code = rooms.createRoom(settings ?? 3);
      } else {
        if (!validateRoomCode(roomCode)) {
          ack({ success: false, error: "Invalid room code format (3-8 alphanumeric characters)." });
          return;
        }
        code = roomCode.trim().toUpperCase();
      }

      // Check if this is a reconnecting player (same name, room in progress)
      const existingRoom = rooms.getRoom(code);
      if (existingRoom && existingRoom.phase !== "LOBBY") {
        const existingPlayer = existingRoom.players.find(p => p.name.toLowerCase() === safeName.toLowerCase());
        if (existingPlayer) {
          // Reconnect: update socket id, re-subscribe to room within 30s window
          rooms.reconnect(code, existingPlayer.playerId, socket.id);
          socket.data.playerId = existingPlayer.playerId;
          socket.data.roomCode = code;
          socket.data.playerName = safeName;
          socket.join(code);
          ack({ success: true, playerId: existingPlayer.playerId, roomCode: code, roomName: existingRoom.name });

          // Resend current state
          const masked = rooms.buildMaskedState(code, existingPlayer.playerId);
          socket.emit("state_update", masked);
          broadcastState(code);
          console.log(`[reconnect] ${safeName} → room ${code}`);
          return;
        }
      }

      const { playerId } = rooms.joinRoom(code, socket.id, safeName);
      socket.data.playerId = playerId;
      socket.data.roomCode = code;
      socket.data.playerName = safeName;
      socket.join(code);
      const room = rooms.getRoom(code)!;
      ack({ success: true, playerId, roomCode: code, roomName: room.name });

      io.to(code).emit("lobby_update", rooms.getLobbyPlayers(code));
      console.log(`[join] ${safeName} (${playerId}) → room ${code} ("${room.name}")`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      ack({ success: false, error: msg });
    }
  });

  // ── add_bot ──────────────────────────────────────────────────────────────
  socket.on("add_bot", () => {
    if (!isAllowed()) return;
    const { roomCode } = socket.data;
    if (!roomCode) return;
    try {
      const bot = rooms.addBot(roomCode);
      io.to(roomCode).emit("lobby_update", rooms.getLobbyPlayers(roomCode));
      console.log(`[add_bot] Added ${bot.name} (${bot.playerId}) to room ${roomCode}`);
    } catch (err: unknown) {
      socket.emit("action_error", { message: (err as Error).message });
    }
  });

  // ── player_ready ─────────────────────────────────────────────────────────
  socket.on("player_ready", () => {
    if (!isAllowed()) return;
    const { playerId, roomCode } = socket.data;
    if (!playerId || !roomCode) return;

    rooms.setReady(roomCode, playerId);

    // Broadcast updated lobby with ready states. Do NOT auto-start — wait for owner!
    io.to(roomCode).emit("lobby_update", rooms.getLobbyPlayers(roomCode));
  });

  // ── start_game (Room Owner Only) ──────────────────────────────────────────
  socket.on("start_game", (ack) => {
    if (!isAllowed()) {
      if (ack) ack({ success: false, error: "Rate limit exceeded" });
      return;
    }
    const { playerId, roomCode } = socket.data;
    if (!playerId || !roomCode) {
      if (ack) ack({ success: false, error: "Not in a room" });
      return;
    }

    const room = rooms.getRoom(roomCode);
    if (!room) {
      if (ack) ack({ success: false, error: "Room not found" });
      return;
    }

    // Owner check
    if (room.hostPlayerId && room.hostPlayerId !== playerId) {
      const msg = "Only the room owner can start the match.";
      socket.emit("action_error", { message: msg });
      if (ack) ack({ success: false, error: msg });
      return;
    }

    const check = rooms.canStartGame(roomCode);
    if (!check.canStart) {
      const msg = check.reason ?? "Cannot start game yet.";
      socket.emit("action_error", { message: msg });
      if (ack) ack({ success: false, error: msg });
      return;
    }

    try {
      const started = rooms.startGame(roomCode);
      io.to(roomCode).emit("game_started", { wildJokerRank: started.wildJokerRank! });
      setTimeout(() => broadcastState(roomCode), 100);
      if (ack) ack({ success: true });
      console.log(`[start_game] Owner ${socket.data.playerName} (${playerId}) started room ${roomCode}`);
    } catch (err: unknown) {
      const msg = (err as Error).message;
      socket.emit("action_error", { message: msg });
      if (ack) ack({ success: false, error: msg });
    }
  });

  // ── draw_stock ────────────────────────────────────────────────────────────
  socket.on("draw_stock", () => {
    if (!isAllowed()) return;
    const { playerId, roomCode } = socket.data;
    if (!playerId || !roomCode) return;
    try {
      rooms.drawStock(roomCode, playerId);
      broadcastState(roomCode);
    } catch (err: unknown) {
      socket.emit("action_error", { message: (err as Error).message });
    }
  });

  // ── draw_discard ──────────────────────────────────────────────────────────
  socket.on("draw_discard", () => {
    if (!isAllowed()) return;
    const { playerId, roomCode } = socket.data;
    if (!playerId || !roomCode) return;
    try {
      rooms.drawDiscard(roomCode, playerId);
      broadcastState(roomCode);
    } catch (err: unknown) {
      socket.emit("action_error", { message: (err as Error).message });
    }
  });

  // ── discard_card ──────────────────────────────────────────────────────────
  socket.on("discard_card", ({ cardId }) => {
    if (!isAllowed()) return;
    const { playerId, roomCode } = socket.data;
    if (!playerId || !roomCode) return;
    try {
      if (typeof cardId !== "string" || !cardId.trim()) {
        throw new Error("Invalid card ID provided.");
      }
      const { summary } = rooms.discardCard(roomCode, playerId, cardId);
      broadcastState(roomCode);
      if (summary) {
        io.to(roomCode).emit("round_end", summary);
        if (summary.isGameOver) {
          io.to(roomCode).emit("game_over", summary);
        }
      }
    } catch (err: unknown) {
      socket.emit("action_error", { message: (err as Error).message });
    }
  });

  // ── declare ───────────────────────────────────────────────────────────────
  socket.on("declare", ({ groups }) => {
    if (!isAllowed()) return;
    const { playerId, roomCode } = socket.data;
    if (!playerId || !roomCode) return;
    try {
      const val = validateDeclareGroups(groups);
      if (!val.valid) {
        throw new Error(val.error);
      }

      const res = rooms.declare(roomCode, playerId, groups);
      broadcastState(roomCode);

      if (!res.valid) {
        socket.emit("action_error", { message: res.error ?? "Invalid declaration! 80 penalty points added." });
      }

      if (res.summary) {
        io.to(roomCode).emit("round_end", res.summary);
        if (res.summary.isGameOver) {
          io.to(roomCode).emit("game_over", res.summary);
        }
      }
    } catch (err: unknown) {
      socket.emit("action_error", { message: (err as Error).message });
    }
  });

  // ── drop ──────────────────────────────────────────────────────────────────
  socket.on("drop", () => {
    if (!isAllowed()) return;
    const { playerId, roomCode } = socket.data;
    if (!playerId || !roomCode) return;
    try {
      const { summary } = rooms.drop(roomCode, playerId);
      broadcastState(roomCode);
      if (summary) {
        io.to(roomCode).emit("round_end", summary);
        if (summary.isGameOver) {
          io.to(roomCode).emit("game_over", summary);
        }
      }
    } catch (err: unknown) {
      socket.emit("action_error", { message: (err as Error).message });
    }
  });

  // ── next_round ────────────────────────────────────────────────────────────
  socket.on("next_round", () => {
    if (!isAllowed()) return;
    const { roomCode } = socket.data;
    if (!roomCode) return;
    try {
      const room = rooms.nextRound(roomCode);
      if (room.phase === "GAME_OVER") {
        // Game is over
      } else {
        io.to(roomCode).emit("game_started", { wildJokerRank: room.wildJokerRank! });
        setTimeout(() => broadcastState(roomCode), 100);
      }
    } catch (err: unknown) {
      socket.emit("action_error", { message: (err as Error).message });
    }
  });

  // ── disconnect ────────────────────────────────────────────────────────────
  socket.on("disconnect", (reason) => {
    console.log(`[-] Disconnected: ${socket.id} (${reason})`);
    limiter.cleanup(socket.id);
    const roomCode = rooms.markDisconnected(socket.id);
    if (roomCode) broadcastState(roomCode);
  });
});

httpServer.listen(PORT, () => {
  console.log(`\n🃏 Ruffle server running on port ${PORT}\n`);
});

export { httpServer, io, rooms, db, redis };
