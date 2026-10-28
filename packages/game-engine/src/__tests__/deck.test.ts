import { describe, it, expect } from 'vitest';
import { Deck } from '../cards/Deck';
import { isPrintedJoker } from '../cards/utils';

describe('Deck', () => {
  it('should initialize with 106 cards', () => {
    const deck = new Deck();
    expect(deck.remainingCount()).toBe(106);
  });

  it('should contain exactly 2 printed jokers', () => {
    const deck = new Deck();
    const cards = deck.drawMany(106);
    const jokers = cards.filter(isPrintedJoker);
    expect(jokers.length).toBe(2);
  });

  it('should shuffle cards', () => {
    const deck1 = new Deck();
    const deck2 = new Deck();
    deck2.shuffle();
    
    // Low probability that first 10 cards are exactly the same
    const top1 = deck1.drawMany(10);
    const top2 = deck2.drawMany(10);
    
    let allSame = true;
    for (let i = 0; i < 10; i++) {
      if (top1[i].id !== top2[i].id) {
        allSame = false;
        break;
      }
    }
    expect(allSame).toBe(false);
  });

  it('should draw correctly', () => {
    const deck = new Deck();
    deck.drawMany(10);
    expect(deck.remainingCount()).toBe(96);
  });
});
