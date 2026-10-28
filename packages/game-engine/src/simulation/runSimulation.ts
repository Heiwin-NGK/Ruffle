import { GameSession } from "./GameSession";

const TOTAL_GAMES = 10_000;
const PLAYER_CONFIGS = [
  ["p1", "p2"],
  ["p1", "p2", "p3"],
  ["p1", "p2", "p3", "p4"],
  ["p1", "p2", "p3", "p4", "p5"],
  ["p1", "p2", "p3", "p4", "p5", "p6"],
];

interface SimulationStats {
  totalGames: number;
  deadlocks: number;
  errors: string[];
  avgTurnsPerGame: number;
  durationMs: number;
  minTurns: number;
  maxTurns: number;
}

function runSimulation(): SimulationStats {
  const stats: SimulationStats = {
    totalGames: 0,
    deadlocks: 0,
    errors: [],
    avgTurnsPerGame: 0,
    durationMs: 0,
    minTurns: Infinity,
    maxTurns: 0,
  };

  let totalTurns = 0;
  const start = Date.now();

  for (let i = 0; i < TOTAL_GAMES; i++) {
    // Cycle through different player counts
    const playerIds = PLAYER_CONFIGS[i % PLAYER_CONFIGS.length];
    const rounds = 1 + (i % 3); // 1–3 rounds

    try {
      const session = new GameSession(playerIds, rounds);
      const result = session.run();

      stats.totalGames++;
      totalTurns += result.totalTurns;
      if (result.totalTurns < stats.minTurns) stats.minTurns = result.totalTurns;
      if (result.totalTurns > stats.maxTurns) stats.maxTurns = result.totalTurns;

      // Progress log every 1000 games
      if (stats.totalGames % 1000 === 0) {
        const elapsed = Date.now() - start;
        const pct = Math.round((stats.totalGames / TOTAL_GAMES) * 100);
        process.stdout.write(`   [${pct}%] ${stats.totalGames.toLocaleString()} / ${TOTAL_GAMES.toLocaleString()} games — ${elapsed}ms elapsed\n`);
      }

      // Validate: scores must all be non-negative and ≤ 80 * rounds
      for (const [id, score] of Object.entries(result.scores)) {
        if (score < 0) {
          stats.errors.push(`Game ${i}: Player ${id} has negative score ${score}`);
        }
        if (score > 80 * rounds) {
          stats.errors.push(`Game ${i}: Player ${id} score ${score} exceeds max ${80 * rounds}`);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      stats.errors.push(`Game ${i}: EXCEPTION: ${msg}`);
    }
  }

  stats.durationMs = Date.now() - start;
  stats.avgTurnsPerGame = Math.round(totalTurns / stats.totalGames);

  return stats;
}

// --- MAIN ---
console.log(`\n🃏 Indian Rummy Simulation Harness`);
console.log(`   Running ${TOTAL_GAMES.toLocaleString()} games...\n`);

const stats = runSimulation();

console.log(`✅ Simulation complete!`);
console.log(`   Total games:     ${stats.totalGames.toLocaleString()}`);
console.log(`   Duration:        ${stats.durationMs}ms`);
console.log(`   Avg turns/game:  ${stats.avgTurnsPerGame}`);
console.log(`   Min turns/game:  ${stats.minTurns}`);
console.log(`   Max turns/game:  ${stats.maxTurns}`);
console.log(`   Errors/deadlocks: ${stats.errors.length}`);

if (stats.errors.length > 0) {
  console.log(`\n❌ Errors detected (first 20):`);
  for (const err of stats.errors.slice(0, 20)) {
    console.log(`   - ${err}`);
  }
  process.exit(1);
} else {
  console.log(`\n🎉 GATE PASSED: Zero errors across ${TOTAL_GAMES.toLocaleString()} games!`);
  process.exit(0);
}
