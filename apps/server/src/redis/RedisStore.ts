import Redis from "ioredis";

export interface RedisStoreConfig {
  redisUrl?: string;
  defaultTtlSeconds?: number;
}

export class RedisStore {
  private client: Redis | null = null;
  private isAvailable = false;
  private inMemoryFallback = new Map<string, string>();
  private defaultTtl: number;

  constructor(config?: RedisStoreConfig) {
    this.defaultTtl = config?.defaultTtlSeconds ?? 86400; // 24 hours
    const url = config?.redisUrl || process.env.REDIS_URL;

    if (url) {
      try {
        this.client = new Redis(url, {
          maxRetriesPerRequest: 1,
          connectTimeout: 2000,
          retryStrategy: (times) => {
            if (times > 3) return null; // stop retrying and fall back to in-memory
            return Math.min(times * 500, 2000);
          },
        });

        this.client.on("connect", () => {
          this.isAvailable = true;
          console.log("[Redis] Connected to Redis active state store.");
        });

        this.client.on("error", (err) => {
          this.isAvailable = false;
          // Log only once or cleanly without flooding
          if (err.message.includes("ECONNREFUSED")) {
            // Redis offline, using in-memory store
          } else {
            console.warn("[Redis] Client error:", err.message);
          }
        });
      } catch (err: unknown) {
        console.warn("[Redis] Failed to initialize Redis client, using in-memory store:", err);
        this.isAvailable = false;
      }
    } else {
      console.log("[Redis] No REDIS_URL provided. Running with in-memory state store.");
    }
  }

  public isConnected(): boolean {
    return this.isAvailable;
  }

  /** Cache active room state */
  public async setRoomState(roomCode: string, state: unknown): Promise<void> {
    const serialized = JSON.stringify(state);
    if (this.client && this.isAvailable) {
      try {
        await this.client.setex(`room:${roomCode}`, this.defaultTtl, serialized);
        return;
      } catch {
        this.isAvailable = false;
      }
    }
    this.inMemoryFallback.set(`room:${roomCode}`, serialized);
  }

  /** Retrieve active room state */
  public async getRoomState<T>(roomCode: string): Promise<T | null> {
    if (this.client && this.isAvailable) {
      try {
        const val = await this.client.get(`room:${roomCode}`);
        if (val) return JSON.parse(val) as T;
      } catch {
        this.isAvailable = false;
      }
    }
    const fallback = this.inMemoryFallback.get(`room:${roomCode}`);
    return fallback ? (JSON.parse(fallback) as T) : null;
  }

  /** Delete room state */
  public async deleteRoom(roomCode: string): Promise<void> {
    if (this.client && this.isAvailable) {
      try {
        await this.client.del(`room:${roomCode}`);
      } catch {
        this.isAvailable = false;
      }
    }
    this.inMemoryFallback.delete(`room:${roomCode}`);
  }

  /** Associate player ID to room for instant lookup */
  public async setPlayerSession(playerId: string, roomCode: string): Promise<void> {
    if (this.client && this.isAvailable) {
      try {
        await this.client.setex(`session:${playerId}`, this.defaultTtl, roomCode);
        return;
      } catch {
        this.isAvailable = false;
      }
    }
    this.inMemoryFallback.set(`session:${playerId}`, roomCode);
  }

  public async getPlayerSession(playerId: string): Promise<string | null> {
    if (this.client && this.isAvailable) {
      try {
        const res = await this.client.get(`session:${playerId}`);
        if (res) return res;
      } catch {
        this.isAvailable = false;
      }
    }
    return this.inMemoryFallback.get(`session:${playerId}`) || null;
  }

  public async close(): Promise<void> {
    if (this.client) {
      try {
        await this.client.quit();
      } catch {
        this.client.disconnect();
      }
      this.isAvailable = false;
    }
  }
}

