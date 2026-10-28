"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSocket, session } from "../../hooks/useSocket";
import type { PublicRoomInfo } from "@indian-rummy/socket-protocol";

export default function LobbyPage() {
  const router = useRouter();
  const {
    isConnected,
    joinRoom,
    fetchPublicRooms,
    leaveRoom,
    setReady,
    startGame,
    addBot,
    myPlayerId,
    gameState,
    lobbyPlayers,
    roomName: socketRoomName,
    error,
    clearError,
  } = useSocket();

  const [playerName, setPlayerName] = useState("");
  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<"home" | "create" | "browse" | "join" | "waiting">(
    session.roomCode ? "waiting" : "home"
  );
  const [myRoomCode, setMyRoomCode] = useState<string | null>(session.roomCode);
  const [joining, setJoining] = useState(false);
  const [starting, setStarting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  // ── Create Room Settings State ──
  const [customRoomName, setCustomRoomName] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [maxRounds, setMaxRounds] = useState(3);

  // ── Browse Public Rooms State ──
  const [publicRoomsList, setPublicRoomsList] = useState<PublicRoomInfo[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterSeats, setFilterSeats] = useState<"all" | "open">("all");
  const [filterSize, setFilterSize] = useState<"all" | number>("all");

  // ── Direct Join Code ──
  const [roomCodeInput, setRoomCodeInput] = useState("");

  // Prevent SSR/client hydration mismatch for isConnected
  useEffect(() => {
    setMounted(true);
  }, []);

  // Navigate to game when state arrives and game is in progress
  useEffect(() => {
    if (gameState && (gameState.phase === "DRAW" || gameState.phase === "DISCARD")) {
      router.push(`/game/${gameState.roomCode}`);
    }
  }, [gameState, router]);

  // If already in a room but lobby re-mounted, re-register
  useEffect(() => {
    if (session.roomCode && (session.playerId || myPlayerId)) {
      setMyRoomCode(session.roomCode);
    }
  }, [myPlayerId]);

  // Load public rooms when entering browse mode
  const refreshRooms = useCallback(async () => {
    setLoadingRooms(true);
    try {
      const rooms = await fetchPublicRooms();
      setPublicRoomsList(rooms);
    } catch {
      // fallback
    } finally {
      setLoadingRooms(false);
    }
  }, [fetchPublicRooms]);

  useEffect(() => {
    if (mode === "browse") {
      refreshRooms();
    }
  }, [mode, refreshRooms]);

  // ── Handlers ──

  const handleOpenCreateSettings = () => {
    if (!playerName.trim()) {
      setLocalError("Please enter your name first");
      return;
    }
    setCustomRoomName(`${playerName.trim()}'s Table`);
    setMode("create");
  };

  const handleCreateRoomSubmit = async () => {
    if (!playerName.trim()) {
      setLocalError("Please enter your name first");
      return;
    }
    setJoining(true);
    const res = await joinRoom("NEW", playerName.trim(), {
      roomName: customRoomName.trim() || `${playerName.trim()}'s Table`,
      isPrivate,
      maxPlayers,
      maxRounds,
    });
    setJoining(false);
    if (!res.success) {
      setLocalError(res.error ?? "Failed to create room");
      return;
    }
    setMyRoomCode(res.roomCode!);
    setMode("waiting");
    setIsReady(false);
  };

  const handleJoinByCode = async (codeToJoin?: string) => {
    const targetCode = (codeToJoin || roomCodeInput).trim().toUpperCase();
    if (!playerName.trim()) {
      setLocalError("Please enter your name first");
      return;
    }
    if (!targetCode) {
      setLocalError("Please enter a room code");
      return;
    }
    setJoining(true);
    const res = await joinRoom(targetCode, playerName.trim());
    setJoining(false);
    if (!res.success) {
      setLocalError(res.error ?? "Failed to join room");
      return;
    }
    setMyRoomCode(res.roomCode!);
    setMode("waiting");
    setIsReady(false);
  };

  const handleLeaveLobby = async () => {
    await leaveRoom();
    setMyRoomCode(null);
    setIsReady(false);
    setMode("home");
  };

  const handleReady = () => {
    setReady();
    setIsReady(true);
  };

  const handleStartGame = async () => {
    setStarting(true);
    const res = await startGame();
    setStarting(false);
    if (!res.success) {
      setLocalError(res.error ?? "Failed to start match");
    }
  };

  // ── Waiting room host & readiness calculations ──
  const isHost = useMemo(() => {
    const me = lobbyPlayers.find((p) => p.playerId === myPlayerId);
    if (me && typeof me.isHost === "boolean") return me.isHost;
    return lobbyPlayers.length > 0 ? lobbyPlayers[0].playerId === myPlayerId : true;
  }, [lobbyPlayers, myPlayerId]);

  const allOthersReady = useMemo(() => {
    const others = lobbyPlayers.filter((p) => p.playerId !== myPlayerId);
    return others.length > 0 && others.every((p) => p.ready);
  }, [lobbyPlayers, myPlayerId]);

  const readyGuestsCount = useMemo(() => {
    const others = lobbyPlayers.filter((p) => p.playerId !== myPlayerId);
    return others.filter((p) => p.ready).length;
  }, [lobbyPlayers, myPlayerId]);

  const totalOthersCount = useMemo(() => {
    return lobbyPlayers.filter((p) => p.playerId !== myPlayerId).length;
  }, [lobbyPlayers, myPlayerId]);

  const canHostStart = lobbyPlayers.length >= 2 && allOthersReady;

  const isMyPlayerReady = useMemo(() => {
    const me = lobbyPlayers.find((p) => p.playerId === myPlayerId);
    return me ? me.ready : isReady;
  }, [lobbyPlayers, myPlayerId, isReady]);

  // ── Filtered Public Rooms ──
  const filteredRooms = useMemo(() => {
    return publicRoomsList.filter((r) => {
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = r.name.toLowerCase().includes(q);
        const matchesHost = r.hostName.toLowerCase().includes(q);
        const matchesCode = r.roomCode.toLowerCase().includes(q);
        if (!matchesName && !matchesHost && !matchesCode) return false;
      }
      // Open seats filter
      if (filterSeats === "open" && r.playerCount >= r.maxPlayers) {
        return false;
      }
      // Max players size filter
      if (filterSize !== "all" && r.maxPlayers !== filterSize) {
        return false;
      }
      return true;
    });
  }, [publicRoomsList, searchQuery, filterSeats, filterSize]);

  const displayError = localError || error;

  return (
    <main
      className="table-felt"
      style={{
        height: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Ambient suits */}
      {["♠", "♥", "♦", "♣"].map((s, i) => (
        <motion.div
          key={i}
          style={{
            position: "absolute",
            fontSize: "clamp(4rem,10vw,9rem)",
            opacity: 0.04,
            color: i % 2 === 0 ? "#c0392b" : "#e8e0c8",
            userSelect: "none",
            top: `${[15, 60, 25, 70][i]}%`,
            left: `${[10, 75, 55, 20][i]}%`,
          }}
          animate={{ y: [0, -20, 0], rotate: [0, 5, 0] }}
          transition={{ duration: 6 + i * 1.5, repeat: Infinity, ease: "easeInOut" }}
        >
          {s}
        </motion.div>
      ))}

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ textAlign: "center", marginBottom: mode === "browse" ? "1rem" : "2rem" }}
      >
        <div
          style={{
            fontSize: "clamp(2.2rem, 6vw, 4rem)",
            fontFamily: "'Playfair Display', serif",
            fontWeight: 700,
            color: "var(--gold)",
          }}
        >
          Ruffle
        </div>
        <p
          style={{
            color: "var(--ui-muted)",
            fontSize: "0.85rem",
            letterSpacing: "0.2em",
            textTransform: "uppercase",
          }}
        >
          Indian Rummy — Multiplayer Lobby
        </p>
      </motion.div>

      {/* Connection status */}
      {mounted && (
        <div
          style={{
            position: "absolute",
            top: "1rem",
            right: "1rem",
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
            fontSize: "0.75rem",
            color: "var(--ui-muted)",
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: isConnected ? "#22c55e" : "#ef4444",
            }}
          />
          {isConnected ? "Connected" : "Connecting…"}
        </div>
      )}

      <AnimatePresence mode="wait">
        {/* ── 1. HOME SCREEN ── */}
        {mode === "home" && (
          <motion.div
            key="home"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.9rem",
              width: "min(360px, 92vw)",
            }}
          >
            <input
              value={playerName}
              onChange={(e) => {
                setPlayerName(e.target.value);
                setLocalError(null);
              }}
              placeholder="Enter your name"
              maxLength={20}
              style={{
                padding: "0.9rem 1.2rem",
                borderRadius: "10px",
                border: "1px solid var(--ui-border)",
                background: "rgba(0,0,0,0.45)",
                color: "var(--ui-text)",
                fontSize: "1rem",
                fontFamily: "'Outfit', sans-serif",
                outline: "none",
              }}
            />

            <button
              className="btn-gold"
              onClick={handleOpenCreateSettings}
              style={{ padding: "0.95rem", fontSize: "1rem", borderRadius: "12px" }}
            >
              ✦ Create Room (Settings)
            </button>

            <button
              className="btn-ghost"
              onClick={() => {
                if (!playerName.trim()) {
                  setLocalError("Please enter your name first");
                  return;
                }
                setMode("browse");
              }}
              style={{
                padding: "0.9rem",
                fontSize: "0.95rem",
                borderRadius: "12px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem",
              }}
            >
              🌐 Browse Public Rooms
            </button>

            <button
              className="btn-ghost"
              onClick={() => {
                if (!playerName.trim()) {
                  setLocalError("Please enter your name first");
                  return;
                }
                setMode("join");
              }}
              style={{ padding: "0.85rem", fontSize: "0.95rem", borderRadius: "12px" }}
            >
              🔑 Enter Room Code
            </button>

            <Link href="/practice" style={{ textDecoration: "none" }}>
              <button
                className="btn-ghost"
                style={{
                  width: "100%",
                  padding: "0.85rem",
                  fontSize: "0.95rem",
                  borderRadius: "12px",
                  borderStyle: "dashed",
                  color: "#86efac",
                }}
              >
                🤖 Play Offline (Solo Practice)
              </button>
            </Link>
          </motion.div>
        )}

        {/* ── 2. CREATE ROOM SETTINGS MENU ── */}
        {mode === "create" && (
          <motion.div
            key="create"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="glass-panel"
            style={{
              width: "min(420px, 92vw)",
              padding: "1.75rem",
              display: "flex",
              flexDirection: "column",
              gap: "1.2rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <button
                className="btn-ghost"
                onClick={() => setMode("home")}
                style={{ padding: "0.35rem 0.8rem", fontSize: "0.8rem" }}
              >
                ← Back
              </button>
              <h3 style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--gold)" }}>Room Settings</h3>
              <div style={{ width: 48 }} />
            </div>

            {/* Room Name */}
            <div>
              <label style={{ display: "block", fontSize: "0.8rem", color: "var(--ui-muted)", marginBottom: "0.4rem" }}>
                Room Name
              </label>
              <input
                value={customRoomName}
                onChange={(e) => setCustomRoomName(e.target.value)}
                placeholder="e.g. Royal Table, Weekend Rummy"
                maxLength={30}
                style={{
                  width: "100%",
                  padding: "0.75rem 1rem",
                  borderRadius: "8px",
                  border: "1px solid var(--ui-border)",
                  background: "rgba(0,0,0,0.4)",
                  color: "var(--ui-text)",
                  fontSize: "0.95rem",
                  outline: "none",
                }}
              />
            </div>

            {/* Privacy: Public vs Private */}
            <div>
              <label style={{ display: "block", fontSize: "0.8rem", color: "var(--ui-muted)", marginBottom: "0.4rem" }}>
                Room Privacy
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                <button
                  type="button"
                  onClick={() => setIsPrivate(false)}
                  style={{
                    padding: "0.75rem 0.5rem",
                    borderRadius: "8px",
                    border: !isPrivate ? "1px solid var(--gold)" : "1px solid var(--ui-border)",
                    background: !isPrivate ? "rgba(212,175,55,0.2)" : "rgba(0,0,0,0.3)",
                    color: !isPrivate ? "var(--gold)" : "var(--ui-muted)",
                    fontWeight: !isPrivate ? 700 : 500,
                    cursor: "pointer",
                    fontSize: "0.85rem",
                  }}
                >
                  🌐 Public
                  <div style={{ fontSize: "0.7rem", opacity: 0.8, marginTop: 2 }}>Listed for everyone</div>
                </button>

                <button
                  type="button"
                  onClick={() => setIsPrivate(true)}
                  style={{
                    padding: "0.75rem 0.5rem",
                    borderRadius: "8px",
                    border: isPrivate ? "1px solid var(--gold)" : "1px solid var(--ui-border)",
                    background: isPrivate ? "rgba(212,175,55,0.2)" : "rgba(0,0,0,0.3)",
                    color: isPrivate ? "var(--gold)" : "var(--ui-muted)",
                    fontWeight: isPrivate ? 700 : 500,
                    cursor: "pointer",
                    fontSize: "0.85rem",
                  }}
                >
                  🔒 Private
                  <div style={{ fontSize: "0.7rem", opacity: 0.8, marginTop: 2 }}>Room code required</div>
                </button>
              </div>
            </div>

            {/* Max Players (2 to 6) */}
            <div>
              <label style={{ display: "block", fontSize: "0.8rem", color: "var(--ui-muted)", marginBottom: "0.4rem" }}>
                Max Players: <strong style={{ color: "var(--gold)" }}>{maxPlayers} Players</strong>
              </label>
              <div style={{ display: "flex", gap: "0.4rem", justifyContent: "space-between" }}>
                {[2, 3, 4, 5, 6].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setMaxPlayers(num)}
                    style={{
                      flex: 1,
                      padding: "0.6rem 0",
                      borderRadius: "8px",
                      border: maxPlayers === num ? "1px solid var(--gold)" : "1px solid var(--ui-border)",
                      background: maxPlayers === num ? "rgba(212,175,55,0.25)" : "rgba(0,0,0,0.3)",
                      color: maxPlayers === num ? "var(--gold)" : "var(--ui-muted)",
                      fontWeight: maxPlayers === num ? 700 : 500,
                      cursor: "pointer",
                      fontSize: "0.85rem",
                    }}
                  >
                    {num}P
                  </button>
                ))}
              </div>
            </div>

            {/* Rounds */}
            <div>
              <label style={{ display: "block", fontSize: "0.8rem", color: "var(--ui-muted)", marginBottom: "0.4rem" }}>
                Game Length: <strong style={{ color: "var(--gold)" }}>{maxRounds} Round{maxRounds > 1 ? "s" : ""}</strong>
              </label>
              <div style={{ display: "flex", gap: "0.4rem" }}>
                {[
                  { r: 1, label: "1 Rd" },
                  { r: 2, label: "2 Rds" },
                  { r: 3, label: "3 Rds" },
                  { r: 5, label: "5 Rds" },
                ].map(({ r, label }) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setMaxRounds(r)}
                    style={{
                      flex: 1,
                      padding: "0.6rem 0",
                      borderRadius: "8px",
                      border: maxRounds === r ? "1px solid var(--gold)" : "1px solid var(--ui-border)",
                      background: maxRounds === r ? "rgba(212,175,55,0.25)" : "rgba(0,0,0,0.3)",
                      color: maxRounds === r ? "var(--gold)" : "var(--ui-muted)",
                      fontWeight: maxRounds === r ? 700 : 500,
                      cursor: "pointer",
                      fontSize: "0.85rem",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <button
              className="btn-gold"
              onClick={handleCreateRoomSubmit}
              disabled={joining}
              style={{ padding: "0.95rem", fontSize: "1rem", borderRadius: "10px", marginTop: "0.5rem" }}
            >
              {joining ? "Creating…" : "✦ Create & Host Table"}
            </button>
          </motion.div>
        )}

        {/* ── 3. BROWSE PUBLIC ROOMS WITH FILTRATION ── */}
        {mode === "browse" && (
          <motion.div
            key="browse"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="glass-panel"
            style={{
              width: "min(560px, 94vw)",
              maxHeight: "82dvh",
              padding: "1.5rem",
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <button
                className="btn-ghost"
                onClick={() => setMode("home")}
                style={{ padding: "0.35rem 0.8rem", fontSize: "0.8rem" }}
              >
                ← Back
              </button>
              <h3 style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--gold)" }}>
                🌐 Public Tables ({filteredRooms.length})
              </h3>
              <button
                className="btn-ghost"
                onClick={refreshRooms}
                disabled={loadingRooms}
                style={{ padding: "0.35rem 0.8rem", fontSize: "0.8rem" }}
              >
                {loadingRooms ? "…" : "🔄 Refresh"}
              </button>
            </div>

            {/* Filtration Settings Bar */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.6rem",
                background: "rgba(0,0,0,0.3)",
                padding: "0.75rem",
                borderRadius: "10px",
              }}
            >
              {/* Search text filter */}
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="🔍 Filter by table name, host or code..."
                style={{
                  padding: "0.6rem 0.9rem",
                  borderRadius: "8px",
                  border: "1px solid var(--ui-border)",
                  background: "rgba(0,0,0,0.35)",
                  color: "var(--ui-text)",
                  fontSize: "0.85rem",
                  outline: "none",
                }}
              />

              {/* Quick Filter Pills */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
                <span style={{ fontSize: "0.75rem", color: "var(--ui-muted)" }}>Seats:</span>
                <button
                  type="button"
                  onClick={() => setFilterSeats("all")}
                  style={{
                    padding: "3px 9px",
                    borderRadius: "6px",
                    fontSize: "0.75rem",
                    border: "1px solid",
                    borderColor: filterSeats === "all" ? "var(--gold)" : "var(--ui-border)",
                    background: filterSeats === "all" ? "rgba(212,175,55,0.2)" : "transparent",
                    color: filterSeats === "all" ? "var(--gold)" : "var(--ui-muted)",
                    cursor: "pointer",
                  }}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setFilterSeats("open")}
                  style={{
                    padding: "3px 9px",
                    borderRadius: "6px",
                    fontSize: "0.75rem",
                    border: "1px solid",
                    borderColor: filterSeats === "open" ? "#22c55e" : "var(--ui-border)",
                    background: filterSeats === "open" ? "rgba(34,197,94,0.2)" : "transparent",
                    color: filterSeats === "open" ? "#22c55e" : "var(--ui-muted)",
                    cursor: "pointer",
                  }}
                >
                  Open Seats Only
                </button>

                <span style={{ fontSize: "0.75rem", color: "var(--ui-muted)", marginLeft: "0.5rem" }}>Size:</span>
                {(["all", 2, 4, 6] as const).map((sz) => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => setFilterSize(sz)}
                    style={{
                      padding: "3px 9px",
                      borderRadius: "6px",
                      fontSize: "0.75rem",
                      border: "1px solid",
                      borderColor: filterSize === sz ? "var(--gold)" : "var(--ui-border)",
                      background: filterSize === sz ? "rgba(212,175,55,0.2)" : "transparent",
                      color: filterSize === sz ? "var(--gold)" : "var(--ui-muted)",
                      cursor: "pointer",
                    }}
                  >
                    {sz === "all" ? "Any Size" : `${sz}P`}
                  </button>
                ))}
              </div>
            </div>

            {/* Room List */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: "0.6rem",
                paddingRight: "4px",
              }}
            >
              {filteredRooms.length === 0 ? (
                <div style={{ textAlign: "center", padding: "2.5rem 1rem", color: "var(--ui-muted)" }}>
                  <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>📭</div>
                  <p style={{ fontSize: "0.9rem" }}>No public tables match your filters.</p>
                  <button
                    className="btn-gold"
                    onClick={() => setMode("create")}
                    style={{ marginTop: "1rem", padding: "0.6rem 1.2rem", fontSize: "0.85rem" }}
                  >
                    ✦ Create Your Own
                  </button>
                </div>
              ) : (
                filteredRooms.map((r) => {
                  const isFull = r.playerCount >= r.maxPlayers;
                  const isPlaying = r.phase !== "LOBBY";

                  return (
                    <div
                      key={r.roomCode}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "0.8rem 1rem",
                        background: "rgba(0,0,0,0.35)",
                        borderRadius: "10px",
                        border: "1px solid rgba(212,175,55,0.12)",
                      }}
                    >
                      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--ui-text)" }}>
                            {r.name}
                          </span>
                          <span
                            style={{
                              fontSize: "0.7rem",
                              padding: "1px 6px",
                              borderRadius: "4px",
                              background: isPlaying ? "rgba(234,179,8,0.2)" : "rgba(34,197,94,0.2)",
                              color: isPlaying ? "#eab308" : "#22c55e",
                              fontWeight: 600,
                            }}
                          >
                            {isPlaying ? "In Progress" : "Lobby"}
                          </span>
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "var(--ui-muted)" }}>
                          Host: <span style={{ color: "var(--ui-text)" }}>{r.hostName}</span> • Code:{" "}
                          <span style={{ color: "var(--gold)", fontWeight: 600 }}>{r.roomCode}</span> • {r.maxRounds} Rds
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                        <div
                          style={{
                            fontSize: "0.8rem",
                            fontWeight: 700,
                            color: isFull ? "#ef4444" : "#22c55e",
                          }}
                        >
                          {r.playerCount} / {r.maxPlayers}
                        </div>

                        <button
                          className="btn-gold"
                          onClick={() => handleJoinByCode(r.roomCode)}
                          disabled={isFull || isPlaying || joining}
                          style={{
                            padding: "0.45rem 0.9rem",
                            fontSize: "0.8rem",
                            borderRadius: "8px",
                            opacity: isFull || isPlaying ? 0.4 : 1,
                          }}
                        >
                          {isFull ? "Full" : isPlaying ? "Playing" : "Join Table"}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        )}

        {/* ── 4. JOIN ROOM VIA CODE ── */}
        {mode === "join" && (
          <motion.div
            key="join"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
              width: "min(340px, 90vw)",
            }}
          >
            <button
              className="btn-ghost"
              onClick={() => setMode("home")}
              style={{ padding: "0.4rem 1rem", fontSize: "0.85rem", alignSelf: "flex-start" }}
            >
              ← Back
            </button>
            <input
              value={playerName}
              onChange={(e) => {
                setPlayerName(e.target.value);
                setLocalError(null);
              }}
              placeholder="Your name"
              maxLength={20}
              style={{
                padding: "0.9rem 1.2rem",
                borderRadius: "10px",
                border: "1px solid var(--ui-border)",
                background: "rgba(0,0,0,0.4)",
                color: "var(--ui-text)",
                fontSize: "1rem",
                outline: "none",
              }}
            />
            <input
              value={roomCodeInput}
              onChange={(e) => {
                setRoomCodeInput(e.target.value.toUpperCase());
                setLocalError(null);
              }}
              placeholder="5-Char Code (e.g. K7P92)"
              maxLength={5}
              style={{
                padding: "0.9rem 1.2rem",
                borderRadius: "10px",
                border: "1px solid var(--ui-border)",
                background: "rgba(0,0,0,0.4)",
                color: "var(--gold)",
                fontSize: "1.2rem",
                outline: "none",
                letterSpacing: "0.2em",
                textTransform: "uppercase",
              }}
            />
            <button
              className="btn-gold"
              onClick={() => handleJoinByCode()}
              disabled={joining}
              style={{ padding: "1rem", fontSize: "1rem", borderRadius: "12px" }}
            >
              {joining ? "Joining…" : "→ Join Room"}
            </button>
          </motion.div>
        )}

        {/* ── 5. WAITING LOBBY ── */}
        {mode === "waiting" && (
          <motion.div
            key="waiting"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="glass-panel"
            style={{
              padding: "2rem",
              width: "min(440px, 92vw)",
              display: "flex",
              flexDirection: "column",
              gap: "1.2rem",
            }}
          >
            <div style={{ textAlign: "center" }}>
              {socketRoomName && (
                <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--ui-text)", marginBottom: "0.2rem" }}>
                  {socketRoomName}
                </div>
              )}
              <p
                style={{
                  color: "var(--ui-muted)",
                  fontSize: "0.75rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.15em",
                }}
              >
                Room Code
              </p>
              <div
                style={{
                  fontSize: "2.4rem",
                  fontWeight: 800,
                  color: "var(--gold)",
                  letterSpacing: "0.25em",
                  margin: "0.2rem 0",
                }}
              >
                {myRoomCode}
              </div>
              <p style={{ color: "var(--ui-muted)", fontSize: "0.8rem" }}>
                Share this 5-letter code with players on your Wi-Fi
              </p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <p
                  style={{
                    color: "var(--ui-muted)",
                    fontSize: "0.75rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                  }}
                >
                  Players ({lobbyPlayers.length}/{maxPlayers})
                </p>
                {lobbyPlayers.length < maxPlayers && (
                  <button
                    className="btn-ghost"
                    onClick={addBot}
                    style={{ padding: "2px 8px", fontSize: "0.75rem", borderRadius: "6px" }}
                  >
                    + Add Bot 🤖
                  </button>
                )}
              </div>
              {lobbyPlayers.map((p) => (
                <div
                  key={p.playerId}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "0.5rem 0.75rem",
                    background: "rgba(0,0,0,0.3)",
                    borderRadius: "8px",
                    border: p.isHost ? "1px solid rgba(212,175,55,0.25)" : "1px solid transparent",
                  }}
                >
                  <span style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    {p.isBot ? "🤖 " : p.isHost ? "👑 " : ""}
                    {p.name}
                    {p.playerId === myPlayerId && (
                      <span style={{ fontSize: "0.7rem", color: "var(--ui-muted)" }}>(You)</span>
                    )}
                    {p.isHost && (
                      <span
                        style={{
                          fontSize: "0.65rem",
                          padding: "1px 5px",
                          borderRadius: "4px",
                          background: "rgba(212,175,55,0.2)",
                          color: "var(--gold)",
                          fontWeight: 700,
                        }}
                      >
                        HOST
                      </span>
                    )}
                  </span>
                  <span
                    style={{
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      color: p.ready ? "#22c55e" : "var(--ui-muted)",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.3rem",
                    }}
                  >
                    {p.ready ? (
                      <>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e" }} />
                        Ready
                      </>
                    ) : (
                      <>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#71717a" }} />
                        Waiting…
                      </>
                    )}
                  </span>
                </div>
              ))}
            </div>

            {/* Action Buttons: Host vs Guest */}
            {isHost ? (
              <div style={{ display: "flex", gap: "0.6rem" }}>
                <button
                  className="btn-ghost"
                  onClick={handleLeaveLobby}
                  style={{
                    padding: "0.9rem",
                    fontSize: "0.9rem",
                    borderRadius: "12px",
                    color: "#f87171",
                    borderColor: "rgba(239, 68, 68, 0.4)",
                  }}
                >
                  🚪 Close
                </button>
                <button
                  className="btn-gold"
                  onClick={handleStartGame}
                  disabled={!canHostStart || starting}
                  style={{
                    flex: 1,
                    padding: "0.9rem",
                    fontSize: "0.95rem",
                    borderRadius: "12px",
                    opacity: canHostStart ? 1 : 0.5,
                    cursor: canHostStart ? "pointer" : "not-allowed",
                    boxShadow: canHostStart ? "0 0 15px rgba(212,175,55,0.4)" : "none",
                  }}
                >
                  {starting
                    ? "Starting Match…"
                    : lobbyPlayers.length < 2
                    ? "Waiting for players to join…"
                    : !allOthersReady
                    ? `Waiting for others to get ready (${readyGuestsCount}/${totalOthersCount})`
                    : "✦ Start Game"}
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", gap: "0.6rem" }}>
                <button
                  className="btn-ghost"
                  onClick={handleLeaveLobby}
                  style={{
                    padding: "0.9rem",
                    fontSize: "0.9rem",
                    borderRadius: "12px",
                    color: "#f87171",
                    borderColor: "rgba(239, 68, 68, 0.4)",
                  }}
                >
                  🚪 Leave
                </button>
                <button
                  className="btn-gold"
                  onClick={handleReady}
                  disabled={isMyPlayerReady}
                  style={{
                    flex: 1,
                    padding: "0.9rem",
                    fontSize: "1rem",
                    borderRadius: "12px",
                    opacity: isMyPlayerReady ? 0.75 : 1,
                    background: isMyPlayerReady ? "rgba(34, 197, 94, 0.2)" : undefined,
                    borderColor: isMyPlayerReady ? "#22c55e" : undefined,
                    color: isMyPlayerReady ? "#86efac" : undefined,
                  }}
                >
                  {isMyPlayerReady ? "✓ Ready — Waiting for Host" : "I'm Ready"}
                </button>
              </div>
            )}

            {lobbyPlayers.length < 2 && (
              <p style={{ textAlign: "center", color: "var(--ui-muted)", fontSize: "0.8rem" }}>
                Waiting for at least 1 more player or click &quot;+ Add Bot&quot; above to play…
              </p>
            )}
            {lobbyPlayers.length >= 2 && !allOthersReady && isHost && (
              <p style={{ textAlign: "center", color: "var(--ui-muted)", fontSize: "0.8rem" }}>
                Waiting for all guests to tap &quot;I&apos;m Ready&quot; before starting…
              </p>
            )}
            {lobbyPlayers.length >= 2 && allOthersReady && isHost && (
              <p style={{ textAlign: "center", color: "var(--gold)", fontSize: "0.85rem", fontWeight: 600 }}>
                ✓ Everyone is ready! Click &quot;Start Game&quot; to begin.
              </p>
            )}
            {lobbyPlayers.length >= 2 && !isHost && isMyPlayerReady && (
              <p style={{ textAlign: "center", color: "#86efac", fontSize: "0.8rem" }}>
                ✓ You are ready! Waiting for the room host to start the game…
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error toast */}
      <AnimatePresence>
        {displayError && (
          <motion.div
            initial={{ opacity: 0, y: 20, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0 }}
            onClick={() => {
              setLocalError(null);
              clearError();
            }}
            style={{
              position: "fixed",
              bottom: "2rem",
              left: "50%",
              background: "rgba(180,20,20,0.95)",
              border: "1px solid #ef4444",
              borderRadius: "10px",
              padding: "0.6rem 1.4rem",
              color: "#fff",
              fontSize: "0.9rem",
              zIndex: 1000,
              cursor: "pointer",
            }}
          >
            ⚠ {displayError}
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
