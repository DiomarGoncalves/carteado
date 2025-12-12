import { GameState, PlayerAction, ChatMessage } from "../types";

// URL da API na Vercel (ou local)
const API_URL = '/api/game';

export const api = {
  // Ler estado da sala
  getRoomState: async (roomCode: string) => {
    try {
      const res = await fetch(`${API_URL}?roomCode=${roomCode}`);
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      console.error("Erro ao buscar sala:", e);
      return null;
    }
  },

  // (Host) Salvar estado completo do jogo e limpar ações processadas
  updateGameState: async (roomCode: string, gameState: GameState, chatMessages: ChatMessage[]) => {
    try {
      await fetch(API_URL + `?roomCode=${roomCode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'UPDATE_STATE',
          payload: { gameState, chatMessages, pendingActions: [] } // Limpa ações pois o host já processou
        })
      });
    } catch (e) {
      console.error("Erro ao salvar estado:", e);
    }
  },

  // (Client/Host) Enviar uma ação para a fila (Jogar carta, Chat, Entrar)
  sendAction: async (roomCode: string, action: any) => {
    try {
      await fetch(API_URL + `?roomCode=${roomCode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'SEND_ACTION',
          payload: action
        })
      });
    } catch (e) {
      console.error("Erro ao enviar ação:", e);
    }
  }
};