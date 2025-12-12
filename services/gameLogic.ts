import { Card, CardColor, CardType, GameState, Player } from "../types";
import { COLORS, POINTS } from "../constants";

// --- Deck Generation ---
export const createDeck = (): Card[] => {
  const deck: Card[] = [];
  let idCounter = 0;

  const addCard = (color: CardColor, type: CardType, value?: number, points: number = 0) => {
    deck.push({ id: `card-${idCounter++}`, color, type, value, points });
  };

  COLORS.forEach(color => {
    // One 0
    addCard(color, 'number', 0, POINTS.NUMBER);
    // Two of 1-9
    for (let i = 1; i <= 9; i++) {
      addCard(color, 'number', i, POINTS.NUMBER);
      addCard(color, 'number', i, POINTS.NUMBER);
    }
    // Two of each action
    ['skip', 'reverse', 'draw2'].forEach(action => {
      addCard(color, action as CardType, undefined, POINTS.ACTION);
      addCard(color, action as CardType, undefined, POINTS.ACTION);
    });
  });

  // Wilds (4 of each)
  for (let i = 0; i < 4; i++) {
    addCard('black', 'wild', undefined, POINTS.WILD);
    addCard('black', 'wild4', undefined, POINTS.WILD);
  }

  return shuffleDeck(deck);
};

export const shuffleDeck = (deck: Card[]): Card[] => {
  const newDeck = [...deck];
  for (let i = newDeck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newDeck[i], newDeck[j]] = [newDeck[j], newDeck[i]];
  }
  return newDeck;
};

// --- Validation ---
export const isCardValid = (card: Card, topCard: Card, activeColor: CardColor): boolean => {
  // Wilds are always valid
  if (card.color === 'black') return true;
  
  // Match Color (Active color takes precedence over card color for previously played wilds)
  if (card.color === activeColor) return true;

  // Match Value (Numbers)
  if (card.type === 'number' && topCard.type === 'number' && card.value === topCard.value) return true;

  // Match Symbol (Action cards)
  if (card.type !== 'number' && card.type === topCard.type) return true;

  return false;
};

// --- AI Helper ---
export const findBestMove = (hand: Card[], topCard: Card, activeColor: CardColor): Card | null => {
  const validCards = hand.filter(c => isCardValid(c, topCard, activeColor));
  
  if (validCards.length === 0) return null;

  // Simple Heuristic: 
  // 1. Play +2 or Skip if available to hurt next player
  // 2. Play matching color logic to save Wilds
  // 3. Play Wilds last

  const actions = validCards.filter(c => ['draw2', 'skip', 'reverse'].includes(c.type));
  if (actions.length > 0) return actions[0];

  const numbers = validCards.filter(c => c.color !== 'black');
  if (numbers.length > 0) return numbers[0];

  return validCards[0];
};

export const pickBestColor = (hand: Card[]): CardColor => {
  const counts: Record<string, number> = { red: 0, blue: 0, green: 0, yellow: 0 };
  hand.forEach(c => {
    if (c.color !== 'black') counts[c.color]++;
  });
  
  // Find key with max value
  return Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b) as CardColor;
};