import { describe, it, expect } from 'vitest';
import { calculateDeadwoodScore } from '../scoring/calculator';
import { Card } from '../cards/types';

const c = (suit: string, rank: string): Card => ({ id: `${suit}-${rank}`, suit: suit as any, rank: rank as any });

describe('Scoring Calculator', () => {
  it('should calculate 0 for a winning hand', () => {
    const groups = [
      [c('Hearts', '3'), c('Hearts', '4'), c('Hearts', '5')], // Pure
      [c('Spades', '10'), c('Joker', 'PrintedJoker'), c('Spades', 'Q')], // Impure
      [c('Diamonds', 'K'), c('Clubs', 'K'), c('Hearts', 'K')], // Set
      [c('Spades', '2'), c('Hearts', '2'), c('Diamonds', '2'), c('Clubs', '2')] // Set
    ];
    
    expect(calculateDeadwoodScore(groups, 'A')).toBe(0);
  });

  it('should calculate full penalty if no pure sequence (capped at 80)', () => {
    // Let's use sets only
    const invalidGroups = [
      [c('Hearts', 'K'), c('Spades', 'K'), c('Diamonds', 'K')],
      [c('Hearts', 'Q'), c('Spades', 'Q'), c('Diamonds', 'Q')],
      [c('Hearts', 'J'), c('Spades', 'J'), c('Diamonds', 'J')],
      [c('Hearts', '10'), c('Spades', '10'), c('Diamonds', '10'), c('Clubs', '10')]
    ];
    // K=10, Q=10, J=10, 10=10. Total > 80.
    
    expect(calculateDeadwoodScore(invalidGroups, 'A')).toBe(80);
  });

  it('should calculate partial penalty for unmelded cards', () => {
    const groups = [
      [c('Hearts', '3'), c('Hearts', '4'), c('Hearts', '5')], // Pure Seq
      [c('Spades', '3'), c('Spades', '4'), c('Spades', '5')], // Pure Seq
      [c('Diamonds', 'K')], // Unmelded (10 pts)
      [c('Clubs', '5')], // Unmelded (5 pts)
      [c('Hearts', 'A'), c('Spades', '2'), c('Clubs', '8')] // Invalid group (10 + 2 + 8 = 20 pts)
    ];
    // Total = 10 + 5 + 20 = 35
    
    expect(calculateDeadwoodScore(groups, '10')).toBe(35);
  });
});
