export class TurnManager {
  private playerIds: string[];
  private currentTurnIndex: number;
  private turnStartedAt: number;
  private timeLimitMs: number;

  constructor(playerIds: string[], timeLimitSeconds: number = 60) {
    if (playerIds.length === 0) throw new Error("Must have at least one player.");
    this.playerIds = playerIds;
    this.currentTurnIndex = 0;
    this.timeLimitMs = timeLimitSeconds * 1000;
    this.turnStartedAt = Date.now();
  }

  public getCurrentPlayer(): string {
    return this.playerIds[this.currentTurnIndex];
  }

  public nextTurn(): string {
    this.currentTurnIndex = (this.currentTurnIndex + 1) % this.playerIds.length;
    this.turnStartedAt = Date.now();
    return this.getCurrentPlayer();
  }

  public getTurnTimeRemainingMs(): number {
    const elapsed = Date.now() - this.turnStartedAt;
    return Math.max(0, this.timeLimitMs - elapsed);
  }

  public isTurnExpired(): boolean {
    return this.getTurnTimeRemainingMs() === 0;
  }

  public resetTimer(): void {
    this.turnStartedAt = Date.now();
  }
}
