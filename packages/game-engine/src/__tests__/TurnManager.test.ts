import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TurnManager } from '../turns/TurnManager';

describe('TurnManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should initialize with first player', () => {
    const tm = new TurnManager(['p1', 'p2', 'p3'], 30);
    expect(tm.getCurrentPlayer()).toBe('p1');
  });

  it('should cycle turns', () => {
    const tm = new TurnManager(['p1', 'p2'], 30);
    expect(tm.getCurrentPlayer()).toBe('p1');
    tm.nextTurn();
    expect(tm.getCurrentPlayer()).toBe('p2');
    tm.nextTurn();
    expect(tm.getCurrentPlayer()).toBe('p1');
  });

  it('should calculate remaining time', () => {
    const tm = new TurnManager(['p1', 'p2'], 30);
    expect(tm.getTurnTimeRemainingMs()).toBe(30000);
    
    vi.advanceTimersByTime(10000);
    expect(tm.getTurnTimeRemainingMs()).toBe(20000);
  });

  it('should default to 60 seconds time limit', () => {
    const tm = new TurnManager(['p1', 'p2']);
    expect(tm.getTurnTimeRemainingMs()).toBe(60000);
    vi.advanceTimersByTime(60000);
    expect(tm.isTurnExpired()).toBe(true);
  });
});
