import { describe, it, expect } from 'vitest';
import { isPureSequence, isImpureSequence, isSet } from '../rules/validators';
import { Card } from '../cards/types';

const c = (suit: string, rank: string): Card => ({ id: `${suit}-${rank}`, suit: suit as any, rank: rank as any });

describe('Validators', () => {
  describe('isPureSequence', () => {
    it('should validate a valid pure sequence (3 cards)', () => {
      const group = [c('Hearts', '3'), c('Hearts', '4'), c('Hearts', '5')];
      expect(isPureSequence(group)).toBe(true);
    });

    it('should validate A-2-3', () => {
      const group = [c('Spades', 'A'), c('Spades', '2'), c('Spades', '3')];
      expect(isPureSequence(group)).toBe(true);
    });

    it('should validate Q-K-A', () => {
      const group = [c('Diamonds', 'Q'), c('Diamonds', 'K'), c('Diamonds', 'A')];
      expect(isPureSequence(group)).toBe(true);
    });

    it('should validate out-of-order pure sequence (e.g. 5-3-4)', () => {
      const group = [c('Hearts', '5'), c('Hearts', '3'), c('Hearts', '4')];
      expect(isPureSequence(group)).toBe(true);
    });

    it('should reject different suits', () => {
      const group = [c('Hearts', '3'), c('Diamonds', '4'), c('Hearts', '5')];
      expect(isPureSequence(group)).toBe(false);
    });

    it('should reject non-consecutive', () => {
      const group = [c('Clubs', '3'), c('Clubs', '5'), c('Clubs', '6')];
      expect(isPureSequence(group)).toBe(false);
    });
  });

  describe('isImpureSequence', () => {
    it('should validate sequence with printed joker', () => {
      const group = [c('Hearts', '3'), c('Joker', 'PrintedJoker'), c('Hearts', '5')];
      expect(isImpureSequence(group, '8')).toBe(true);
    });

    it('should validate sequence with wild joker', () => {
      const group = [c('Spades', '10'), c('Hearts', '2'), c('Spades', 'Q')];
      // Here Hearts 2 is a wild joker. Wild joker rank is 2.
      expect(isImpureSequence(group, '2')).toBe(true);
    });

    it('should reject if too many gaps for jokers', () => {
      const group = [c('Spades', '10'), c('Joker', 'PrintedJoker'), c('Spades', 'A')];
      expect(isImpureSequence(group, '2')).toBe(false);
    });
  });

  describe('isSet', () => {
    it('should validate a pure set of 3', () => {
      const group = [c('Hearts', 'K'), c('Spades', 'K'), c('Diamonds', 'K')];
      expect(isSet(group, '2')).toBe(true);
    });

    it('should validate a pure set of 4', () => {
      const group = [c('Hearts', '5'), c('Spades', '5'), c('Diamonds', '5'), c('Clubs', '5')];
      expect(isSet(group, 'A')).toBe(true);
    });

    it('should reject duplicate suits in set', () => {
      const group = [c('Hearts', '5'), c('Hearts', '5'), c('Diamonds', '5')];
      expect(isSet(group, 'A')).toBe(false);
    });

    it('should validate set with joker', () => {
      const group = [c('Hearts', '7'), c('Joker', 'PrintedJoker'), c('Diamonds', '7')];
      expect(isSet(group, 'A')).toBe(true);
    });
  });
});
