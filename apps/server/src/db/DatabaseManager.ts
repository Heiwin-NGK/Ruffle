import { Pool } from "pg";
import type { RoundSummary } from "@indian-rummy/socket-protocol";

export interface DatabaseConfig {
  connectionString?: string;
}

export class DatabaseManager {
  private pool: Pool | null = null;
  private isConnected = false;
  private writeQueue: Array<() => Promise<void>> = [];
  private isProcessingQueue = false;

  constructor(config?: DatabaseConfig) {
    const connectionString = config?.connectionString || process.env.DATABASE_URL;
    if (connectionString) {
      try {
        this.pool = new Pool({
          connectionString,
          connectionTimeoutMillis: 3000,
          idleTimeoutMillis: 10000,
        });

        this.pool.on("error", (err) => {
          console.warn("[DB] Pool background error:", err.message);
          this.isConnected = false;
        });

        // Test connection asynchronously
        this.pool.query("SELECT 1")
          .then(() => {
            this.isConnected = true;
            console.log("[DB] Connected to PostgreSQL database.");
          })
          .catch((err) => {
            console.warn("[DB] PostgreSQL unavailable, running in offline fallback mode:", err.message);
            this.isConnected = false;
          });
      } catch (err: unknown) {
        console.warn("[DB] Failed to initialize Pool, fallback mode active:", err);
      }
    } else {
      console.log("[DB] No DATABASE_URL specified. Running with in-memory persistence fallback.");
    }
  }

  public isHealthy(): boolean {
    return this.isConnected;
  }

  /** Queue an async database operation so the game loop is never blocked */
  public enqueue(operation: () => Promise<void>): void {
    this.writeQueue.push(operation);
    this.processQueue();
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.writeQueue.length === 0) return;
    this.isProcessingQueue = true;

    while (this.writeQueue.length > 0) {
      const nextOp = this.writeQueue.shift();
      if (nextOp && this.pool && this.isConnected) {
        try {
          await nextOp();
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn("[DB] Write error:", msg);
        }
      }
    }

    this.isProcessingQueue = false;
  }

  /** Upsert room metadata */
  public async saveRoom(roomCode: string, phase: string, round: number, maxRounds: number): Promise<void> {
    this.enqueue(async () => {
      if (!this.pool) return;
      const sql = `
        INSERT INTO rooms (room_code, phase, round, max_rounds, updated_at)
        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
        ON CONFLICT (room_code) DO UPDATE
        SET phase = EXCLUDED.phase, round = EXCLUDED.round, updated_at = CURRENT_TIMESTAMP;
      `;
      await this.pool.query(sql, [roomCode, phase, round, maxRounds]);
    });
  }

  /** Persist round summary and player scores */
  public async saveRoundSummary(roomCode: string, summary: RoundSummary, wildJoker: string): Promise<void> {
    this.enqueue(async () => {
      if (!this.pool) return;
      const roundSql = `
        INSERT INTO game_rounds (room_code, round_number, wild_joker, winner_id, winner_name, scores_json)
        VALUES ($1, $2, $3, $4, $5, $6);
      `;
      await this.pool.query(roundSql, [
        roomCode,
        summary.round,
        wildJoker,
        summary.winnerId,
        summary.winnerName,
        JSON.stringify(summary.scores),
      ]);

      for (const s of summary.scores) {
        const scoreSql = `
          INSERT INTO round_player_scores (room_code, round_number, player_id, player_name, round_score, total_score, status)
          VALUES ($1, $2, $3, $4, $5, $6, $7);
        `;
        await this.pool.query(scoreSql, [
          roomCode,
          summary.round,
          s.playerId,
          s.name,
          s.roundScore,
          s.totalScore,
          s.playerId === summary.winnerId ? "WINNER" : "SCORED",
        ]);
      }
    });
  }

  /** Audit log for actions (draw, discard, drop, declare) */
  public async logAction(roomCode: string, round: number, playerId: string, actionType: string, payload?: unknown): Promise<void> {
    this.enqueue(async () => {
      if (!this.pool) return;
      const sql = `
        INSERT INTO game_audit_log (room_code, round_number, player_id, action_type, payload_json)
        VALUES ($1, $2, $3, $4, $5);
      `;
      await this.pool.query(sql, [
        roomCode,
        round,
        playerId,
        actionType,
        payload ? JSON.stringify(payload) : null,
      ]);
    });
  }

  public async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.isConnected = false;
    }
  }
}

