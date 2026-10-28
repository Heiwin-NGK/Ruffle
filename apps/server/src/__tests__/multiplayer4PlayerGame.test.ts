import { describe, it, expect, vi } from "vitest";
import { RoomManager } from "../RoomManager";
import { DatabaseManager } from "../db/DatabaseManager";
import { RedisStore } from "../redis/RedisStore";
import type { RoundSummary } from "@indian-rummy/socket-protocol";

describe("4-Player 3-Round Full Game End-to-End Simulation", () => {
  it("should successfully orchestrate a 4-player match through all 3 rounds to GAME_OVER", () => {
    const db = new DatabaseManager();
    const redis = new RedisStore();
    const rooms = new RoomManager({ db, redis });

    let latestRoundEnd: RoundSummary | null = null;
    let latestGameOver: RoundSummary | null = null;

    rooms.setListener({
      onStateUpdate: () => {},
      onRoundEnd: (_, summary) => {
        latestRoundEnd = summary;
      },
      onGameOver: (_, summary) => {
        latestGameOver = summary;
      },
    });

    // ── Lobby Setup (4 Players) ──
    const code = rooms.createRoom(3); // 3 rounds max
    const { playerId: p1 } = rooms.joinRoom(code, "sock_p1", "Alice");
    const { playerId: p2 } = rooms.joinRoom(code, "sock_p2", "Bob");
    const { playerId: p3 } = rooms.joinRoom(code, "sock_p3", "Charlie");
    const { playerId: p4 } = rooms.joinRoom(code, "sock_p4", "David");

    // All players ready
    expect(rooms.setReady(code, p1)).toBe(false);
    expect(rooms.setReady(code, p2)).toBe(false);
    expect(rooms.setReady(code, p3)).toBe(false);
    expect(rooms.setReady(code, p4)).toBe(true); // all ready!

    // ── ROUND 1 ──
    const r1State = rooms.startGame(code);
    expect(r1State.round).toBe(1);
    expect(r1State.phase).toBe("DRAW");
    expect(r1State.players.length).toBe(4);
    for (const p of r1State.players) {
      expect(p.hand.length).toBe(13);
      expect(p.status).toBe("ACTIVE");
    }

    // Current player draws from stock
    const currTurn = r1State.currentTurnPlayerId!;
    expect(currTurn).toBe(p1);
    rooms.drawStock(code, p1);
    expect(r1State.phase).toBe("DISCARD");
    expect(r1State.players.find(p => p.playerId === p1)!.hand.length).toBe(14);

    // Discard a card
    const discardCardId = r1State.players.find(p => p.playerId === p1)!.hand[0].id;
    rooms.discardCard(code, p1, discardCardId);
    expect(r1State.phase).toBe("DRAW");
    expect(r1State.currentTurnPlayerId).toBe(p2);

    // Other players drop in round 1 to complete the round
    rooms.drop(code, p2); // First drop: 20 pts
    expect(r1State.players.find(p => p.playerId === p2)!.roundScore).toBe(20);

    rooms.drop(code, p3); // First drop: 20 pts
    expect(r1State.players.find(p => p.playerId === p3)!.roundScore).toBe(20);

    // When p4 drops, p1 is the sole survivor!
    const dropRes = rooms.drop(code, p4);
    expect(dropRes.summary).toBeDefined();
    expect(dropRes.summary!.winnerId).toBe(p1);
    expect(dropRes.summary!.isGameOver).toBe(false);
    expect(r1State.phase).toBe("ROUND_END");

    // ── ROUND 2 ──
    const r2State = rooms.nextRound(code);
    expect(r2State.round).toBe(2);
    expect(r2State.phase).toBe("DRAW");
    for (const p of r2State.players) {
      expect(p.hand.length).toBe(13);
      expect(p.status).toBe("ACTIVE");
    }

    // p1 takes a turn: draw and discard
    rooms.drawStock(code, p1);
    const p1Card2 = r2State.players.find(p => p.playerId === p1)!.hand[0].id;
    rooms.discardCard(code, p1, p1Card2);

    // p2 draws and discards (p2 turnsTaken becomes 1)
    rooms.drawStock(code, p2);
    const p2Card = r2State.players.find(p => p.playerId === p2)!.hand[0].id;
    rooms.discardCard(code, p2, p2Card);

    // p3 drops (first drop = 20 pts)
    rooms.drop(code, p3);
    expect(r2State.players.find(p => p.playerId === p3)!.roundScore).toBe(20);

    // p4 drops (first drop = 20 pts)
    rooms.drop(code, p4);

    // Next round arrives back at p2 after p1 turn:
    // p1 takes another turn
    rooms.drawStock(code, p1);
    const p1Card3 = r2State.players.find(p => p.playerId === p1)!.hand[0].id;
    rooms.discardCard(code, p1, p1Card3);

    // Now p2 has turnsTaken > 0 and drops -> Middle drop = 40 pts!
    const r2Drop = rooms.drop(code, p2);
    expect(r2State.players.find(p => p.playerId === p2)!.roundScore).toBe(40);
    expect(r2Drop.summary).toBeDefined();
    expect(r2Drop.summary!.winnerId).toBe(p1); // p1 wins round 2
    expect(r2Drop.summary!.round).toBe(2);
    expect(r2State.phase).toBe("ROUND_END");

    // ── ROUND 3 ──
    const r3State = rooms.nextRound(code);
    expect(r3State.round).toBe(3);
    expect(r3State.phase).toBe("DRAW");

    // Players 2, 3, 4 drop in Round 3 to conclude the 3-round match
    rooms.drawStock(code, p1);
    const p1Card4 = r3State.players.find(p => p.playerId === p1)!.hand[0].id;
    rooms.discardCard(code, p1, p1Card4);

    rooms.drop(code, p2);
    rooms.drop(code, p3);
    const r3Drop = rooms.drop(code, p4);

    // Assert GAME_OVER trigger!
    expect(r3Drop.summary).toBeDefined();
    expect(r3Drop.summary!.isGameOver).toBe(true);
    expect(r3State.phase).toBe("GAME_OVER");

    // Verify cumulative scores
    const alice = r3State.players.find(p => p.playerId === p1)!;
    const bob = r3State.players.find(p => p.playerId === p2)!;
    expect(alice.score).toBe(0); // Won all 3 rounds with 0
    expect(bob.score).toBe(20 + 40 + 20); // 80 total
  });

  it("should set per-turn timer to 1 minute (60 seconds) and auto-drop on timeout", () => {
    vi.useFakeTimers();

    const db = new DatabaseManager();
    const redis = new RedisStore();
    const rooms = new RoomManager({ db, redis });

    const code = rooms.createRoom(1);
    const { playerId: p1 } = rooms.joinRoom(code, "sock_p1", "Alice");
    const { playerId: p2 } = rooms.joinRoom(code, "sock_p2", "Bob");

    rooms.setReady(code, p1);
    rooms.setReady(code, p2);
    const roomState = rooms.startGame(code);

    // Turn deadline should be 60,000 ms (1 minute) from now
    const now = Date.now();
    expect(roomState.turnDeadlineMs).toBe(now + 60_000);
    expect(roomState.currentTurnPlayerId).toBe(p1);
    expect(roomState.phase).toBe("DRAW");

    // Advance 60 seconds (1 minute)
    vi.advanceTimersByTime(60_000);

    // Alice timed out during DRAW phase -> auto-dropped with 20 points
    const updatedRoom = rooms.getRoom(code)!;
    const alice = updatedRoom.players.find(p => p.playerId === p1)!;
    expect(alice.status).toBe("DROPPED");
    expect(alice.roundScore).toBe(20);

    // Sole survivor Bob is declared winner
    const bob = updatedRoom.players.find(p => p.playerId === p2)!;
    expect(bob.status).toBe("DECLARED");
    expect(updatedRoom.phase).toBe("GAME_OVER");

    vi.useRealTimers();
  });

  describe("Room Settings, Public Listing & Voluntary Exit", () => {
    it("should create room with custom settings (name, privacy, maxPlayers, maxRounds)", () => {
      const rooms = new RoomManager();
      const code = rooms.createRoom({
        roomName: "High Stakes Club",
        isPrivate: false,
        maxPlayers: 4,
        maxRounds: 2,
      });

      const room = rooms.getRoom(code)!;
      expect(room.name).toBe("High Stakes Club");
      expect(room.isPrivate).toBe(false);
      expect(room.maxPlayers).toBe(4);
      expect(room.maxRounds).toBe(2);

      // Join up to maxPlayers
      rooms.joinRoom(code, "s1", "P1");
      rooms.joinRoom(code, "s2", "P2");
      rooms.joinRoom(code, "s3", "P3");
      rooms.joinRoom(code, "s4", "P4");

      // 5th player should be rejected
      expect(() => rooms.joinRoom(code, "s5", "P5")).toThrow("Room is full (max 4 players)");
    });

    it("should list public rooms and exclude private rooms", () => {
      const rooms = new RoomManager();
      const pubCode = rooms.createRoom({
        roomName: "Public Lounge",
        isPrivate: false,
        maxPlayers: 6,
      });
      const privCode = rooms.createRoom({
        roomName: "Secret Clan",
        isPrivate: true,
        maxPlayers: 2,
      });

      rooms.joinRoom(pubCode, "s1", "Alice");
      rooms.joinRoom(privCode, "s2", "Bob");

      const publicRooms = rooms.listPublicRooms();
      expect(publicRooms.some(r => r.roomCode === pubCode)).toBe(true);
      expect(publicRooms.some(r => r.roomCode === privCode)).toBe(false);

      const pubInfo = publicRooms.find(r => r.roomCode === pubCode)!;
      expect(pubInfo.name).toBe("Public Lounge");
      expect(pubInfo.hostName).toBe("Alice");
      expect(pubInfo.playerCount).toBe(1);
    });

    it("should handle voluntary exit (leaveRoom) in lobby and in game", () => {
      const rooms = new RoomManager();
      const code = rooms.createRoom({ roomName: "Exit Test", isPrivate: false, maxPlayers: 4 });
      const { playerId: p1 } = rooms.joinRoom(code, "s1", "Alice");
      const { playerId: p2 } = rooms.joinRoom(code, "s2", "Bob");

      // Alice leaves in lobby -> removed from players
      const lobbyLeave = rooms.leaveRoom(code, p1);
      expect(lobbyLeave.roomDeleted).toBe(false);
      expect(rooms.getRoom(code)!.players.length).toBe(1);

      // Bob starts game with Bot
      const { playerId: botId } = rooms.addBot(code);
      rooms.setReady(code, p2);
      rooms.startGame(code);

      // Bob leaves during active match -> treated as drop, sole survivor (bot) declared
      const gameLeave = rooms.leaveRoom(code, p2);
      expect(gameLeave.summary).toBeDefined();
      expect(gameLeave.summary!.winnerId).toBe(botId);
    });

    it("should allow room owner to wait for all guests to get ready and start match", () => {
      const rooms = new RoomManager();
      const code = rooms.createRoom({ roomName: "Owner Start Test", maxPlayers: 3 });

      // p1 creates/joins first -> p1 is host
      const { playerId: hostId } = rooms.joinRoom(code, "s_host", "HostPlayer");
      const room = rooms.getRoom(code)!;
      expect(room.hostPlayerId).toBe(hostId);

      // Only host in room -> cannot start
      const check1 = rooms.canStartGame(code);
      expect(check1.canStart).toBe(false);
      expect(check1.reason).toContain("Waiting for at least 1 more player");

      // Guest 1 joins
      const { playerId: g1 } = rooms.joinRoom(code, "s_g1", "Guest1");
      // Guest 1 is not ready yet -> host cannot start
      const check2 = rooms.canStartGame(code);
      expect(check2.canStart).toBe(false);
      expect(check2.reason).toContain("Waiting for Guest1 to get ready");

      // Guest 1 readies up
      rooms.setReady(code, g1);
      // Now all guests are ready -> host can start!
      const check3 = rooms.canStartGame(code);
      expect(check3.canStart).toBe(true);

      // Verify lobby player views indicate host and ready statuses
      const lobbyPlayers = rooms.getLobbyPlayers(code);
      expect(lobbyPlayers.find(p => p.playerId === hostId)!.isHost).toBe(true);
      expect(lobbyPlayers.find(p => p.playerId === g1)!.isHost).toBe(false);
      expect(lobbyPlayers.find(p => p.playerId === g1)!.ready).toBe(true);

      // Host starts game
      const started = rooms.startGame(code);
      expect(started.phase).toBe("DRAW");
      expect(started.round).toBe(1);
    });
  });
});
