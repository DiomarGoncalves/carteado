export type CardColor = 'red' | 'blue' | 'green' | 'yellow' | 'black';
export type CardType = 'number' | 'skip' | 'reverse' | 'draw2' | 'wild' | 'wild4';

export interface Card {
  id: string;
  color: CardColor;
  type: CardType;
  value?: number; // 0-9 for number cards
  points: number;
}

export interface Player {
  id: string;
  name: string;
  avatar: string; // URL or emoji
  isBot: boolean;
  hand: Card[];
  isUno: boolean; // Has declared UNO
  isHost?: boolean;
}

export enum GameStatus {
  LOBBY = 'LOBBY',
  PLAYING = 'PLAYING',
  GAME_OVER = 'GAME_OVER',
}

export interface GameState {
  status: GameStatus;
  players: Player[];
  currentPlayerIndex: number;
  direction: 1 | -1; // 1 = clockwise, -1 = counter-clockwise
  drawPile: Card[];
  discardPile: Card[];
  currentColor: CardColor; // Tracks active color (important for Wilds)
  winner: Player | null;
  turnCount: number;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
  isSystem?: boolean;
}

// Network Types
export type NetworkRole = 'HOST' | 'CLIENT' | 'OFFLINE';

export interface NetworkPacket {
  type: 'GAME_STATE' | 'PLAYER_ACTION' | 'JOIN_REQUEST' | 'JOIN_ACCEPT' | 'LOBBY_UPDATE' | 'CHAT';
  payload: any;
}

export interface PlayerAction {
  actionType: 'PLAY_CARD' | 'DRAW_CARD' | 'CALL_UNO';
  cardId?: string;
  wildColor?: CardColor;
  playerId: string;
}