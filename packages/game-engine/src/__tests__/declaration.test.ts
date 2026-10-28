import { describe, it, expect } from 'vitest';
import { validateDeclaration } from '../rules/declaration';
import { Card } from '../cards/types';

const c = (suit: string, rank: string): Card => ({ id: `${suit}-${rank}`, suit: suit as any, rank: rank as any });

describe('Declaration Validation', () => {
  it('should validate a correct declaration', () => {
    const groups = [
      [c('Hearts', '3'), c('Hearts', '4'), c('Hearts', '5')], // Pure Seq (3)
      [c('Spades', '10'), c('Joker', 'PrintedJoker'), c('Spades', 'Q')], // Impure Seq (3)
      [c('Diamonds', 'K'), c('Clubs', 'K'), c('Hearts', 'K')], // Set (3)
      [c('Spades', '2'), c('Hearts', '2'), c('Diamonds', '2'), c('Clubs', '2')] // Set (4)
    ];
    // Total cards = 3 + 3 + 3 + 4 = 13
    
    const result = validateDeclaration(groups, 'A');
    expect(result.isValid).toBe(true);
  });

  it('should reject if missing pure sequence', () => {
    const groups = [
      [c('Hearts', '3'), c('Hearts', '4'), c('Joker', 'PrintedJoker')], // Impure Seq
      [c('Spades', '10'), c('Joker', 'PrintedJoker'), c('Spades', 'Q')], // Impure Seq
      [c('Diamonds', 'K'), c('Clubs', 'K'), c('Hearts', 'K')], // Set
      [c('Spades', '2'), c('Hearts', '2'), c('Diamonds', '2'), c('Clubs', '2')] // Set
    ];
    
    const result = validateDeclaration(groups, 'A');
    expect(result.isValid).toBe(false);
    expect(result.error).toMatch(/Pure Sequence/);
  });

  it('should reject if wrong number of cards', () => {
    const groups = [
      [c('Hearts', '3'), c('Hearts', '4'), c('Hearts', '5')] // Only 3 cards
    ];
    
    const result = validateDeclaration(groups, 'A');
    expect(result.isValid).toBe(false);
  });
});
