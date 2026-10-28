"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  MaskedGameState,
  RoundSummary,
  CreateRoomSettings,
  PublicRoomInfo,
  LobbyPlayer,
} from "@indian-rummy/socket-protocol";

function getServerUrl(): string {
  if (process.env.NEXT_PUBLIC_SERVER_URL) {
    return process.env.NEXT_PUBLIC_SERVER_URL;
  }
  if (typeof window !== "undefined" && window.location.hostname) {
    return `http://${window.location.hostname}:3001`;
  }
  return "http://localhost:3001";
}

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

// ── Module-level state cache — survives page navigation ────────────────────
let _cachedGameState: MaskedGameState | null = null;
let _cachedLobbyPlayers: LobbyPlayer[] = [];
let _cachedRoundSummary: RoundSummary | null = null;

// ── Singleton socket — created ONCE per browser tab, never recreated ─────────
let _socket: GameSocket | null = null;
function getSocket(): GameSocket {
  if (!_socket) {
    _socket = io(getServerUrl(), {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 4000,
    });
  }
  return _socket;
}

export interface UseSocketReturn {
  isConnected: boolean;
  gameState: MaskedGameState | null;
  lobbyPlayers: LobbyPlayer[];
  roundSummary: RoundSummary | null;
  error: string | null;
  myPlayerId: string | null;
  roomCode: string | null;
  roomName: string | null;
  publicRooms: PublicRoomInfo[];

  joinRoom: (
    roomCode: string,
    playerName: string,
    settings?: CreateRoomSettings
  ) => Promise<{ success: boolean; error?: string; roomCode?: string; roomName?: string }>;
  fetchPublicRooms: () => Promise<PublicRoomInfo[]>;
  leaveRoom: () => Promise<boolean>;
  setReady: () => void;
  startGame: () => Promise<{ success: boolean; error?: string }>;
  drawStock: () => void;
  drawDiscard: () => void;
  discardCard: (cardId: string) => void;
  declare: (groups: string[][]) => void;
  drop: () => void;
  nextRound: () => void;
  addBot: () => void;
  clearError: () => void;
  clearRoundSummary: () => void;
}

// Persisted across renders — survives reconnections
export const session = {
  playerId: null as string | null,
  roomCode: null as string | null,
  playerName: null as string | null,
  roomName: null as string | null,
};

export function useSocket(): UseSocketReturn {
  const socket = getSocket();
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [gameState, setGameState] = useState<MaskedGameState | null>(_cachedGameState);
  const [lobbyPlayers, setLobbyPlayers] = useState<LobbyPlayer[]>(_cachedLobbyPlayers);
  const [roundSummary, setRoundSummary] = useState<RoundSummary | null>(_cachedRoundSummary);
  const [error, setError] = useState<string | null>(null);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(session.playerId);
  const [roomCode, setRoomCode] = useState<string | null>(session.roomCode);
  const [roomName, setRoomName] = useState<string | null>(session.roomName);
  const [publicRooms, setPublicRooms] = useState<PublicRoomInfo[]>([]);

  useEffect(() => {
    const onConnect = () => {
      setIsConnected(true);
      // Auto-rejoin if we have a saved session (reconnect scenario)
      if (session.playerId && session.roomCode && session.playerName) {
        socket.emit("join_room", { roomCode: session.roomCode, playerName: session.playerName }, () => {});
      }
    };
    const onDisconnect = () => setIsConnected(false);
    const onStateUpdate = (state: MaskedGameState) => {
      _cachedGameState = state;
      setGameState(state);
    };
    const onLobbyUpdate = (players: LobbyPlayer[]) => {
      _cachedLobbyPlayers = players;
      setLobbyPlayers(players);
    };
    const onRoundEnd = (summary: RoundSummary) => {
      _cachedRoundSummary = summary;
      setRoundSummary(summary);
    };
    const onGameOver = (summary: RoundSummary) => {
      _cachedRoundSummary = summary;
      setRoundSummary(summary);
    };
    const onActionError = ({ message }: { message: string }) => setError(message);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("state_update", onStateUpdate);
    socket.on("lobby_update", onLobbyUpdate);
    socket.on("round_end", onRoundEnd);
    socket.on("game_over", onGameOver);
    socket.on("action_error", onActionError);

    // Sync connected state immediately
    setIsConnected(socket.connected);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("state_update", onStateUpdate);
      socket.off("lobby_update", onLobbyUpdate);
      socket.off("round_end", onRoundEnd);
      socket.off("game_over", onGameOver);
      socket.off("action_error", onActionError);
      // NOTE: do NOT disconnect socket here — it's a singleton
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const joinRoom = useCallback(
    (code: string, playerName: string, settings?: CreateRoomSettings): Promise<{ success: boolean; error?: string; roomCode?: string; roomName?: string }> => {
      return new Promise((resolve) => {
        socket.emit("join_room", { roomCode: code, playerName, settings }, (ack) => {
          if (ack.success && ack.playerId && ack.roomCode) {
            // Save to module-level session so it survives reconnects
            session.playerId = ack.playerId;
            session.roomCode = ack.roomCode;
            session.playerName = playerName;
            session.roomName = ack.roomName ?? null;
            setMyPlayerId(ack.playerId);
            setRoomCode(ack.roomCode);
            setRoomName(ack.roomName ?? null);
          }
          resolve(ack);
        });
      });
    },
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const fetchPublicRooms = useCallback((): Promise<PublicRoomInfo[]> => {
    return new Promise((resolve) => {
      socket.emit("get_public_rooms", (res) => {
        if (res.success && res.rooms) {
          setPublicRooms(res.rooms);
          resolve(res.rooms);
        } else {
          resolve([]);
        }
      });
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const leaveRoom = useCallback((): Promise<boolean> => {
    return new Promise((resolve) => {
      socket.emit("leave_room", () => {
        session.playerId = null;
        session.roomCode = null;
        session.playerName = null;
        session.roomName = null;
        _cachedGameState = null;
        _cachedLobbyPlayers = [];
        _cachedRoundSummary = null;
        setGameState(null);
        setLobbyPlayers([]);
        setRoundSummary(null);
        setMyPlayerId(null);
        setRoomCode(null);
        setRoomName(null);
        resolve(true);
      });
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setReady = useCallback(() => socket.emit("player_ready"), []); // eslint-disable-line react-hooks/exhaustive-deps
  const startGame = useCallback((): Promise<{ success: boolean; error?: string }> => {
    return new Promise((resolve) => {
      socket.emit("start_game", (ack) => {
        resolve(ack || { success: true });
      });
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const drawStock = useCallback(() => socket.emit("draw_stock"), []); // eslint-disable-line react-hooks/exhaustive-deps
  const drawDiscard = useCallback(() => socket.emit("draw_discard"), []); // eslint-disable-line react-hooks/exhaustive-deps
  const discardCard = useCallback((cardId: string) => socket.emit("discard_card", { cardId }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const declare = useCallback((groups: string[][]) => socket.emit("declare", { groups }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const drop = useCallback(() => socket.emit("drop"), []); // eslint-disable-line react-hooks/exhaustive-deps
  const nextRound = useCallback(() => socket.emit("next_round"), []); // eslint-disable-line react-hooks/exhaustive-deps
  const addBot = useCallback(() => socket.emit("add_bot"), []); // eslint-disable-line react-hooks/exhaustive-deps
  const clearError = useCallback(() => setError(null), []);
  const clearRoundSummary = useCallback(() => {
    _cachedRoundSummary = null;
    setRoundSummary(null);
  }, []);

  return {
    isConnected, gameState, lobbyPlayers, roundSummary,
    error, myPlayerId, roomCode, roomName, publicRooms,
    joinRoom, fetchPublicRooms, leaveRoom, setReady, startGame, drawStock, drawDiscard,
    discardCard, declare, drop, nextRound, addBot, clearError, clearRoundSummary,
  };
}
