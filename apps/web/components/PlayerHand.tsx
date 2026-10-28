"use client";
import { motion, AnimatePresence, Reorder } from "framer-motion";
import { PlayingCard, CardData } from "./PlayingCard";

interface PlayerHandProps {
  cards: CardData[];
  selectedIds: Set<string>;
  groupBreaks: Set<string>;
  onCardClick: (id: string) => void;
  onReorder?: (cards: CardData[]) => void;
  onSortBySuit?: () => void;
  onSortByRank?: () => void;
  onGroup?: () => void;
  wildJokerRank?: string;
}

export function PlayerHand({ cards, selectedIds, groupBreaks, onCardClick, onReorder, onSortBySuit, onSortByRank, onGroup, wildJokerRank }: PlayerHandProps) {
  const overlap = Math.max(4, 56 - cards.length * 2); // tighten overlap as hand grows

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "0.5rem",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", width: "100%", padding: "0 1rem", alignItems: "center" }}>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button className="btn-ghost" style={{ padding: "4px 10px", fontSize: "0.75rem", borderRadius: "6px" }} onClick={onSortBySuit}>Sort by Suit</button>
          <button className="btn-ghost" style={{ padding: "4px 10px", fontSize: "0.75rem", borderRadius: "6px" }} onClick={onSortByRank}>Sort by Rank</button>
        </div>
        <p style={{ color: "var(--ui-muted)", fontSize: "0.75rem", letterSpacing: "0.1em", textTransform: "uppercase", margin: 0 }}>
          Your Hand ({cards.length} cards)
        </p>
        <button 
          className="btn-gold" 
          disabled={selectedIds.size < 2}
          style={{ padding: "4px 14px", fontSize: "0.8rem", borderRadius: "6px", opacity: selectedIds.size < 2 ? 0.4 : 1 }} 
          onClick={onGroup}
        >
          Group
        </button>
      </div>

        <Reorder.Group
          axis="x"
          values={cards}
          onReorder={onReorder || (() => {})}
          className="hand-scroll"
          style={{
            display: "flex",
            alignItems: "flex-end",
            paddingBottom: "16px",
            paddingTop: "16px",
            paddingLeft: "8px",
            paddingRight: "8px",
            position: "relative",
            listStyle: "none",
          }}
        >
          <AnimatePresence>
          {cards.map((card, i) => {
            const isWild = wildJokerRank && card.rank === wildJokerRank && card.suit !== "Joker";
            const isGroupStart = i !== 0 && groupBreaks.has(card.id);
            const mLeft = i === 0 ? 0 : (isGroupStart ? 16 : -overlap);

            return (
              <Reorder.Item
                value={card}
                key={card.id}
                initial={{ opacity: 0, y: 40, scale: 0.8 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.15 } }}
                transition={{ duration: 0.3, type: "spring", stiffness: 300, damping: 25 }}
                style={{ marginLeft: mLeft, zIndex: selectedIds.has(card.id) ? 100 : i }}
              >
                <div style={{ position: "relative" }}>
                  <PlayingCard
                    card={card}
                    selected={selectedIds.has(card.id)}
                    onClick={() => onCardClick(card.id)}
                    layoutId={`hand-${card.id}`}
                  />
                  {/* Wild joker indicator */}
                  {isWild && (
                    <div style={{
                      position: "absolute",
                      top: -8,
                      left: "50%",
                      transform: "translateX(-50%)",
                      background: "var(--gold)",
                      color: "#1a1200",
                      fontSize: "0.55rem",
                      fontWeight: 800,
                      padding: "1px 5px",
                      borderRadius: "4px",
                      letterSpacing: "0.05em",
                      whiteSpace: "nowrap",
                      zIndex: 200,
                    }}>
                      WILD
                    </div>
                  )}
                </div>
              </Reorder.Item>
            );
          })}
        </AnimatePresence>
      </Reorder.Group>
    </div>
  );
}
