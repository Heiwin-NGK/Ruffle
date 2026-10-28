import { describe, it, expect } from 'vitest';
import { GameState } from '../game/GameState';

describe('GameState', () => {
  it('should initialize correctly', () => {
    const gs = new GameState('g1', ['p1', 'p2']);
    expect(gs.status).toBe('WAITING');
    expect(gs.players.length).toBe(2);
  });

  it('should start game and deal cards', () => {
    const gs = new GameState('g1', ['p1', 'p2']);
    gs.startGame();
    expect(gs.status).toBe('DRAW_PHASE');
    expect(gs.players[0].hand.length).toBe(13);
    expect(gs.players[1].hand.length).toBe(13);
    expect(gs.discardPile.length).toBe(1);
    expect(gs.deck.remainingCount()).toBe(106 - 26 - 1 - 1); // 106 - (2*13) - 1 wild - 1 discard
    expect(gs.turnManager.getCurrentPlayer()).toBe('p1');
  });

  it('should handle draw and discard correctly', () => {
    const gs = new GameState('g1', ['p1', 'p2']);
    gs.startGame();
    
    const card = gs.drawCard('p1', 'STOCK');
    expect(gs.status).toBe('DISCARD_PHASE');
    expect(gs.players[0].hand.length).toBe(14);
    
    gs.discardCard('p1', card.id);
    expect(gs.players[0].hand.length).toBe(13);
    expect(gs.status).toBe('DRAW_PHASE');
    expect(gs.turnManager.getCurrentPlayer()).toBe('p2');
  });
});
