import { describe, it, expect, vi } from "vitest";
import { DatabaseManager } from "../db/DatabaseManager";
import { RedisStore } from "../redis/RedisStore";
import {
  SocketRateLimiter,
  sanitizeAndValidateName,
  validateRoomCode,
  validateDeclareGroups,
} from "../middleware/rateLimiter";
import { RoomManager } from "../RoomManager";

describe("Persistence & Reliability Suite", () => {
  describe("DatabaseManager", () => {
    it("should initialize in fallback mode without crashing when no connection string is provided", () => {
      const db = new DatabaseManager();
      expect(db.isHealthy()).toBe(false);
    });

    it("should enqueue operations without throwing exceptions in offline fallback", async () => {
      const db = new DatabaseManager();
      let executed = false;
      db.enqueue(async () => {
        executed = true;
      });
      // In offline fallback, it gracefully skips without unhandled rejection
      await db.saveRoom("ROOM1", "LOBBY", 1, 3);
      await db.logAction("ROOM1", 1, "p1", "DRAW_STOCK");
      expect(true).toBe(true);
    });
  });

  describe("RedisStore", () => {
    it("should use in-memory fallback when redis is offline or not configured", async () => {
      const redis = new RedisStore();
      expect(redis.isConnected()).toBe(false);

      await redis.setRoomState("TEST1", { code: "TEST1", round: 1 });
      const state = await redis.getRoomState<{ code: string; round: number }>("TEST1");
      expect(state).toEqual({ code: "TEST1", round: 1 });

      await redis.setPlayerSession("player_1", "TEST1");
      const session = await redis.getPlayerSession("player_1");
      expect(session).toBe("TEST1");

      await redis.deleteRoom("TEST1");
      const deleted = await redis.getRoomState("TEST1");
      expect(deleted).toBeNull();
    });
  });

  describe("SocketRateLimiter", () => {
    it("should permit actions under threshold and block rapid bursts", () => {
      const limiter = new SocketRateLimiter({ windowMs: 1000, maxRequestsPerWindow: 5 });
      const socketId = "sock_test_1";

      for (let i = 0; i < 5; i++) {
        const { allowed, remaining } = limiter.checkLimit(socketId);
        expect(allowed).toBe(true);
        expect(remaining).toBe(4 - i);
      }

      // 6th call should be blocked
      const blocked = limiter.checkLimit(socketId);
      expect(blocked.allowed).toBe(false);
      expect(blocked.remaining).toBe(0);

      // Cleanup
      limiter.cleanup(socketId);
      const afterCleanup = limiter.checkLimit(socketId);
      expect(afterCleanup.allowed).toBe(true);
    });
  });

  describe("Input Validation & Sanitization", () => {
    it("should sanitize and validate player names", () => {
      expect(sanitizeAndValidateName("   ").valid).toBe(false);
      expect(sanitizeAndValidateName("<script>Alice</script>").cleanName).toBe("scriptAlicescript");
      expect(sanitizeAndValidateName("ValidName_123").cleanName).toBe("ValidName_123");
      expect(sanitizeAndValidateName("A very long name that exceeds maximum allowed length").cleanName.length).toBe(20);
    });

    it("should validate room codes", () => {
      expect(validateRoomCode("K5L2N")).toBe(true);
      expect(validateRoomCode("abc")).toBe(true);
      expect(validateRoomCode("A")).toBe(false);
      expect(validateRoomCode("TOOLONGOFCODE")).toBe(false);
      expect(validateRoomCode("INVALID!@#")).toBe(false);
    });

    it("should validate declaration card groups structure", () => {
      expect(validateDeclareGroups(null).valid).toBe(false);
      expect(validateDeclareGroups([]).valid).toBe(false);
      // 12 cards total: invalid
      expect(validateDeclareGroups([["c1", "c2", "c3"], ["c4", "c5", "c6"], ["c7", "c8", "c9"], ["c10", "c11", "c12"]]).valid).toBe(false);
      // 13 cards total: valid
      expect(validateDeclareGroups([["c1", "c2", "c3"], ["c4", "c5", "c6"], ["c7", "c8", "c9"], ["c10", "c11", "c12", "c13"]]).valid).toBe(true);
    });
  });

  describe("30-Second Reconnection Logic", () => {
    it("should allow reconnection within grace period and restore status", () => {
      const db = new DatabaseManager();
      const redis = new RedisStore();
      const rooms = new RoomManager({ db, redis });

      const code = rooms.createRoom(3);
      const { playerId: p1 } = rooms.joinRoom(code, "sock_p1", "Player 1");
      const { playerId: p2 } = rooms.joinRoom(code, "sock_p2", "Player 2");

      rooms.setReady(code, p1);
      rooms.setReady(code, p2);
      rooms.startGame(code);

      const roomBefore = rooms.getRoom(code)!;
      expect(roomBefore.players[0].status).toBe("ACTIVE");

      // Player 1 disconnects
      rooms.markDisconnected("sock_p1");
      expect(roomBefore.players[0].status).toBe("DISCONNECTED");
      expect(roomBefore.players[0].reconnectDeadlineMs).toBeGreaterThan(Date.now());

      // Player 1 reconnects with new socket ID
      const reconnected = rooms.reconnect(code, p1, "sock_p1_new");
      expect(reconnected).toBe(true);
      expect(roomBefore.players[0].status).toBe("ACTIVE");
      expect(roomBefore.players[0].socketId).toBe("sock_p1_new");
      expect(roomBefore.players[0].reconnectDeadlineMs).toBeNull();
    });

    it("should auto-drop disconnected player when grace timer expires and award sole survivor", () => {
      vi.useFakeTimers();

      const db = new DatabaseManager();
      const redis = new RedisStore();
      const rooms = new RoomManager({ db, redis });

      let roundEndSummary: any = null;
      rooms.setListener({
        onStateUpdate: () => {},
        onRoundEnd: (_, summary) => {
          roundEndSummary = summary;
        },
        onGameOver: () => {},
      });

      const code = rooms.createRoom(3);
      const { playerId: p1 } = rooms.joinRoom(code, "sock_p1", "Player 1");
      const { playerId: p2 } = rooms.joinRoom(code, "sock_p2", "Player 2");

      rooms.setReady(code, p1);
      rooms.setReady(code, p2);
      rooms.startGame(code);

      // Player 1 disconnects
      rooms.markDisconnected("sock_p1");

      // Fast-forward 30 seconds
      vi.advanceTimersByTime(31_000);

      const roomAfter = rooms.getRoom(code)!;
      expect(roomAfter.players[0].status).toBe("DROPPED");
      expect(roomAfter.players[0].roundScore).toBe(20); // first drop 20 pts
      // Player 2 is sole survivor and declared winner
      expect(roomAfter.players[1].status).toBe("DECLARED");
      expect(roundEndSummary).not.toBeNull();
      expect(roundEndSummary.winnerId).toBe(p2);

      vi.useRealTimers();
    });
  });
});

