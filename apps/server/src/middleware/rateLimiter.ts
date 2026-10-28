export interface RateLimitOptions {
  windowMs?: number;
  maxRequestsPerWindow?: number;
}

export class SocketRateLimiter {
  private requests = new Map<string, number[]>();
  private windowMs: number;
  private maxRequests: number;

  constructor(options?: RateLimitOptions) {
    this.windowMs = options?.windowMs ?? 1000; // 1 second rolling window
    this.maxRequests = options?.maxRequestsPerWindow ?? 15; // 15 calls per second
  }

  /**
   * Check whether a socket ID is exceeding rate limit.
   * Returns true if allowed, false if blocked.
   */
  public checkLimit(socketId: string): { allowed: boolean; remaining: number } {
    const now = Date.now();
    const timestamps = this.requests.get(socketId) || [];

    // Filter out timestamps older than rolling window
    const recent = timestamps.filter(t => now - t < this.windowMs);

    if (recent.length >= this.maxRequests) {
      return { allowed: false, remaining: 0 };
    }

    recent.push(now);
    this.requests.set(socketId, recent);
    return { allowed: true, remaining: this.maxRequests - recent.length };
  }

  public cleanup(socketId: string): void {
    this.requests.delete(socketId);
  }
}

// ─── Input Validators ────────────────────────────────────────────────────────

export function sanitizeAndValidateName(name: unknown): { valid: boolean; cleanName: string; error?: string } {
  if (typeof name !== "string") {
    return { valid: false, cleanName: "", error: "Player name must be a string." };
  }
  const clean = name.trim().replace(/[<>/"'&]/g, ""); // strip HTML / injections
  if (clean.length < 1) {
    return { valid: false, cleanName: "", error: "Player name cannot be empty." };
  }
  if (clean.length > 20) {
    return { valid: false, cleanName: clean.slice(0, 20), error: "Player name cannot exceed 20 characters." };
  }
  return { valid: true, cleanName: clean };
}

export function validateRoomCode(code: unknown): boolean {
  if (typeof code !== "string") return false;
  const clean = code.trim().toUpperCase();
  return /^[A-Z0-9]{3,8}$/.test(clean);
}

export function validateDeclareGroups(groups: unknown): { valid: boolean; error?: string } {
  if (!Array.isArray(groups)) {
    return { valid: false, error: "Declare payload must be an array of card groups." };
  }
  if (groups.length === 0) {
    return { valid: false, error: "Groups cannot be empty." };
  }
  let totalCards = 0;
  for (const group of groups) {
    if (!Array.isArray(group) || group.some(c => typeof c !== "string")) {
      return { valid: false, error: "Each group must be an array of card IDs." };
    }
    totalCards += group.length;
  }
  if (totalCards !== 13) {
    return { valid: false, error: `Declaration must contain exactly 13 cards (got ${totalCards}).` };
  }
  return { valid: true };
}

