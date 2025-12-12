import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GameState, GameStatus, Player, Card as CardModel, CardColor, ChatMessage, NetworkRole, PlayerAction } from './types';
import { createDeck, shuffleDeck, isCardValid, findBestMove, pickBestColor } from './services/gameLogic';
import { generateBotChat } from './services/geminiService';
import { AVATARS, BOT_NAMES } from './constants';
import { db } from './services/firebaseConfig';
import { ref, set, onValue, update, push, remove, onDisconnect, get } from "firebase/database";

// UI Components
import Lobby from './components/Lobby';
import GameInterface from './components/GameInterface';

// Utility for simple unique IDs
const uuid = () => Math.random().toString(36).substr(2, 9);
const generateRoomCode = () => Math.floor(1000 + Math.random() * 9000).toString(); // Simple 4 digit numeric code

// Lobby States
type LobbyView = 'MENU' | 'CREATE' | 'JOIN' | 'WAITING_HOST' | 'WAITING_CLIENT';
type GameMode = '1v1' | '1v3' | '1v4'; 

const App: React.FC = () => {
  // --- Game State ---
  const [gameState, setGameState] = useState<GameState>({
    status: GameStatus.LOBBY,
    players: [],
    currentPlayerIndex: 0,
    direction: 1,
    drawPile: [],
    discardPile: [],
    currentColor: 'red',
    winner: null,
    turnCount: 0,
  });

  // --- UI State ---
  const [playerName, setPlayerName] = useState('Jogador');
  const [lobbyView, setLobbyView] = useState<LobbyView>('MENU');
  const [roomCode, setRoomCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [connectionStatus, setConnectionStatus] = useState('');
  
  // --- Network State ---
  const [networkRole, setNetworkRole] = useState<NetworkRole>('OFFLINE');
  const networkRoleRef = useRef<NetworkRole>('OFFLINE'); 

  const [myPlayerId, setMyPlayerId] = useState<string>(''); 
  const [connectedPeers, setConnectedPeers] = useState<{id: string, name: string}[]>([]);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  
  // --- Interaction State ---
  const [wildColorSelector, setWildColorSelector] = useState<{ isOpen: boolean, cardToPlay: CardModel | null }>({ isOpen: false, cardToPlay: null });
  const [lastAction, setLastAction] = useState<string>('');

  // Refs
  const stateRef = useRef(gameState);
  stateRef.current = gameState; 
  const botTimeoutRef = useRef<any>(null);

  // Helper to update role
  const updateNetworkRole = (role: NetworkRole) => {
      setNetworkRole(role);
      networkRoleRef.current = role;
  };

  // --- Chat Helper ---
  const addChatMessage = (senderId: string, senderName: string, text: string, isSystem = false) => {
    if (!roomCode) return;
    const msg: ChatMessage = { id: uuid(), senderId, senderName, text, timestamp: Date.now(), isSystem };
    
    // Send to Firebase
    const chatRef = ref(db, `rooms/${roomCode}/chat`);
    push(chatRef, msg);
  };

  // --- Network Logic (Firebase) ---

  // 1. Setup Host
  const createRoom = async () => {
      const code = generateRoomCode();
      setRoomCode(code);
      setConnectionStatus('Criando sala...');
      updateNetworkRole('HOST');
      
      const newPlayerId = uuid();
      setMyPlayerId(newPlayerId);
      
      const initialGameState: GameState = {
          status: GameStatus.LOBBY,
          players: [], // Will be populated by joiners logic
          currentPlayerIndex: 0,
          direction: 1,
          drawPile: [],
          discardPile: [],
          currentColor: 'red',
          winner: null,
          turnCount: 0,
      };

      const roomRef = ref(db, `rooms/${code}`);
      
      // Initialize Room
      await set(roomRef, {
          createdAt: Date.now(),
          hostId: newPlayerId,
          gameState: initialGameState
      });

      // Add Host as Player
      addPlayerToRoom(code, newPlayerId, playerName, true);
      
      subscribeToRoom(code);
      setLobbyView('WAITING_HOST');
  };

  // 2. Setup Client
  const joinRoom = async () => {
      if (joinCode.length !== 4) return;
      
      const code = joinCode;
      setConnectionStatus('Verificando sala...');
      
      const roomRef = ref(db, `rooms/${code}`);
      const snapshot = await get(roomRef);

      if (!snapshot.exists()) {
          setConnectionStatus('Sala não encontrada!');
          return;
      }
      
      const roomData = snapshot.val();
      if (roomData.gameState.status !== GameStatus.LOBBY) {
           setConnectionStatus('Jogo já começou!');
           return;
      }

      setRoomCode(code);
      updateNetworkRole('CLIENT');
      
      const newPlayerId = uuid();
      setMyPlayerId(newPlayerId);

      await addPlayerToRoom(code, newPlayerId, playerName, false);
      subscribeToRoom(code);
      setLobbyView('WAITING_CLIENT');
  };

  const addPlayerToRoom = async (code: string, id: string, name: string, isHost: boolean) => {
      const playerRef = ref(db, `rooms/${code}/players/${id}`);
      const playerData = {
          id,
          name,
          isHost,
          joinedAt: Date.now()
      };
      
      await set(playerRef, playerData);
      onDisconnect(playerRef).remove(); // Remove player if they disconnect
      
      // Also announce in chat
      const chatRef = ref(db, `rooms/${code}/chat`);
      push(chatRef, {
          id: uuid(),
          senderId: 'system',
          senderName: 'Sistema',
          text: `${name} entrou na sala!`,
          timestamp: Date.now(),
          isSystem: true
      });
  };

  const subscribeToRoom = (code: string) => {
      // Listen for Player Changes (Lobby)
      const playersRef = ref(db, `rooms/${code}/players`);
      onValue(playersRef, (snapshot) => {
          const data = snapshot.val();
          if (data) {
              const playerList = Object.values(data).map((p: any) => ({ id: p.id, name: p.name }));
              setConnectedPeers(playerList);
              
              // Sync lobby player list to GameState if host
              if (networkRoleRef.current === 'HOST' && stateRef.current.status === GameStatus.LOBBY) {
                   const currentPlayers = Object.values(data).map((p: any) => ({
                       id: p.id,
                       name: p.name,
                       avatar: AVATARS[0], // Placeholder
                       isBot: false,
                       hand: [],
                       isUno: false,
                       isHost: p.isHost
                   }));
                   // Use a timeout to avoid rapid re-renders/writes
                   setGameState(prev => ({ ...prev, players: currentPlayers }));
              }
          } else {
              setConnectedPeers([]);
          }
      });

      // Listen for Game State Changes
      const gameStateRef = ref(db, `rooms/${code}/gameState`);
      onValue(gameStateRef, (snapshot) => {
          const data = snapshot.val();
          if (data) {
              setGameState(data);
              if (data.status === GameStatus.PLAYING) {
                  setLobbyView(networkRoleRef.current === 'HOST' ? 'WAITING_HOST' : 'WAITING_CLIENT');
              }
          }
      });

      // Listen for Chat
      const chatRef = ref(db, `rooms/${code}/chat`);
      onValue(chatRef, (snapshot) => {
          const data = snapshot.val();
          if (data) {
              const msgs = Object.values(data) as ChatMessage[];
              msgs.sort((a, b) => a.timestamp - b.timestamp);
              setChatMessages(msgs);
          }
      });

      // HOST ONLY: Listen for Actions from Clients
      if (networkRoleRef.current === 'HOST') {
          const actionsRef = ref(db, `rooms/${code}/actions`);
          onValue(actionsRef, (snapshot) => {
              const data = snapshot.val();
              if (data) {
                  // Process actions in order
                  const actionKeys = Object.keys(data);
                  actionKeys.forEach(key => {
                      const actionPacket = data[key];
                      handleRemoteAction(actionPacket);
                      // Remove action after processing
                      remove(ref(db, `rooms/${code}/actions/${key}`));
                  });
              }
          });
      }
  };

  // --- Game Control (Host Only) ---
  
  // Sync GameState to Firebase whenever it changes (only if Host)
  useEffect(() => {
      if (networkRoleRef.current === 'HOST' && roomCode) {
          // Debounce slightly or check for critical updates
          // For simplicity, we write on every state change. In production, optimize this.
          update(ref(db, `rooms/${roomCode}`), { gameState });
      }
  }, [gameState, roomCode]);

  const resetGame = () => {
      const newState: GameState = {
          status: GameStatus.LOBBY,
          players: stateRef.current.players.map(p => ({...p, hand: [], isUno: false})), // Keep players
          currentPlayerIndex: 0,
          direction: 1,
          drawPile: [],
          discardPile: [],
          currentColor: 'red',
          winner: null,
          turnCount: 0,
      };
      setGameState(newState);
      setLastAction('Novo jogo iniciado!');
  };

  const startGameHost = (mode: GameMode) => {
      if (networkRoleRef.current !== 'HOST') return;
      const deck = createDeck();
      
      // Get current connected human players from the 'players' node sync
      // We need to map them to Game Players with Avatars and Hands
      const playersRef = ref(db, `rooms/${roomCode}/players`);
      get(playersRef).then((snapshot) => {
          const connectedData = snapshot.val() || {};
          const connectedList = Object.values(connectedData) as any[];
          
          const players: Player[] = [];
          
          // Add Humans
          connectedList.forEach((p, i) => {
              players.push({
                  id: p.id,
                  name: p.name,
                  avatar: AVATARS[i % AVATARS.length],
                  isBot: false,
                  hand: deck.splice(0, 7),
                  isUno: false,
                  isHost: p.isHost
              });
          });

          // Add Bots if needed
          let totalSlots = 4;
          if (mode === '1v1') totalSlots = 2;
          if (mode === '1v4') totalSlots = 5;

          const neededBots = Math.max(0, totalSlots - players.length);
          for (let i = 0; i < neededBots; i++) {
               players.push({
                  id: `bot-${i}`,
                  name: BOT_NAMES[i % BOT_NAMES.length],
                  avatar: AVATARS[players.length + i],
                  isBot: true,
                  hand: deck.splice(0, 7),
                  isUno: false
              });
          }

          const firstCard = deck.shift()!;
          const initialColor = firstCard.color === 'black' ? 'red' : firstCard.color;

          const newState: GameState = {
              status: GameStatus.PLAYING,
              players,
              currentPlayerIndex: 0,
              direction: 1,
              drawPile: deck,
              discardPile: [firstCard],
              currentColor: initialColor,
              winner: null,
              turnCount: 1
          };

          setGameState(newState);
      });
  };

  // --- Core Game Logic (Runs on HOST) ---
  const handleRemoteAction = (action: PlayerAction) => {
      // Security check: ensure it's the player's turn
      const playerIdx = stateRef.current.players.findIndex(p => p.id === action.playerId);
      if (playerIdx === -1) return;
      if (playerIdx !== stateRef.current.currentPlayerIndex && action.actionType !== 'CALL_UNO') return; 

      if (action.actionType === 'DRAW_CARD') {
          performDraw(playerIdx, 1);
          passTurn(playerIdx); 
          setLastAction(`${stateRef.current.players[playerIdx].name} comprou.`);
      } else if (action.actionType === 'PLAY_CARD' && action.cardId) {
          const player = stateRef.current.players[playerIdx];
          const card = player.hand.find(c => c.id === action.cardId);
          if (card) {
              performPlayCard(playerIdx, card, action.wildColor);
          }
      } else if (action.actionType === 'CALL_UNO') {
           // Handle UNO call (visual only for now in this simplified logic)
           // In full logic, we'd check if they actually have 1 card.
      }
  };

  const getNextPlayerIndex = (current: number, direction: 1 | -1, numPlayers: number) => {
    return (current + direction + numPlayers) % numPlayers;
  };

  const performDraw = (playerIndex: number, count: number) => {
      setGameState(prev => {
          const newDrawPile = [...prev.drawPile];
          const newDiscardPile = [...prev.discardPile];
          const newPlayers = [...prev.players];
          const player = { ...newPlayers[playerIndex] };

          if (newDrawPile.length < count) {
              if (newDiscardPile.length > 0) {
                   const discardTop = newDiscardPile.pop()!;
                   const recycled = shuffleDeck(newDiscardPile);
                   newDrawPile.unshift(...recycled);
                   newDiscardPile.length = 0;
                   newDiscardPile.push(discardTop);
              } else {
                  return prev; 
              }
          }
          const drawn = newDrawPile.splice(0, count);
          player.hand = [...player.hand, ...drawn];
          player.isUno = false;
          newPlayers[playerIndex] = player;
          
          return { ...prev, drawPile: newDrawPile, discardPile: newDiscardPile, players: newPlayers };
      });
  };

  const passTurn = (currentIndex: number) => {
      setGameState(prev => ({
          ...prev,
          currentPlayerIndex: getNextPlayerIndex(currentIndex, prev.direction, prev.players.length),
          turnCount: prev.turnCount + 1
      }));
  };

  const performPlayCard = async (playerIndex: number, card: CardModel, selectedWildColor?: CardColor) => {
      let colorToSet = card.color;
      if (card.color === 'black' && selectedWildColor) colorToSet = selectedWildColor;

      setGameState(prev => {
          const newPlayers = [...prev.players];
          const p = { ...newPlayers[playerIndex] };
          p.hand = p.hand.filter(c => c.id !== card.id);
          newPlayers[playerIndex] = p;
          
          return {
              ...prev,
              discardPile: [...prev.discardPile, card],
              currentColor: colorToSet,
              players: newPlayers
          };
      });

      const player = stateRef.current.players[playerIndex];
      
      if (player.hand.length === 1) { 
          const winner = { ...player, hand: [] }; 
          const winState = { ...stateRef.current, status: GameStatus.GAME_OVER, winner };
          setGameState(winState);
          if(player.isBot) {
               const chat = await generateBotChat(player.name, 'win', 'Ganhei!');
               addChatMessage(player.id, player.name, chat);
          }
          return;
      }

      let skipTurn = false;
      let nextDirection = stateRef.current.direction;

      if (card.type === 'reverse') {
          nextDirection = (nextDirection * -1) as 1 | -1;
          setGameState(prev => ({ ...prev, direction: nextDirection }));
          if (stateRef.current.players.length === 2) skipTurn = true;
      } else if (card.type === 'skip') {
          skipTurn = true;
          if (player.isBot) {
              const chat = await generateBotChat(player.name, 'play_skip', 'Bloqueado!');
              addChatMessage(player.id, player.name, chat);
          }
      } else if (card.type === 'draw2') {
          const victim = getNextPlayerIndex(playerIndex, nextDirection, stateRef.current.players.length);
          performDraw(victim, 2);
          skipTurn = true;
      } else if (card.type === 'wild4') {
          const victim = getNextPlayerIndex(playerIndex, nextDirection, stateRef.current.players.length);
          performDraw(victim, 4);
          skipTurn = true;
          if (player.isBot) {
              const chat = await generateBotChat(player.name, 'play_wild4', '+4 pra você!');
              addChatMessage(player.id, player.name, chat);
          }
      }

      setGameState(prev => {
          let nextIndex = getNextPlayerIndex(playerIndex, nextDirection, prev.players.length);
          if (skipTurn) nextIndex = getNextPlayerIndex(nextIndex, nextDirection, prev.players.length);
          const newState = { ...prev, currentPlayerIndex: nextIndex, turnCount: prev.turnCount + 1 };
          setLastAction(`${player.name} jogou ${card.type === 'number' ? card.value : card.type}`);
          return newState;
      });
  };

  const processBotTurn = useCallback(async () => {
    if (gameState.status !== GameStatus.PLAYING) return;
    if (networkRoleRef.current !== 'HOST') return; // Only Host processes bots

    const botIndex = gameState.currentPlayerIndex;
    const bot = gameState.players[botIndex];
    if (!bot || !bot.isBot) return;

    await new Promise(r => setTimeout(r, 1500));
    if (stateRef.current.status !== GameStatus.PLAYING) return;

    const top = stateRef.current.discardPile[stateRef.current.discardPile.length - 1];
    const col = stateRef.current.currentColor;

    const bestMove = findBestMove(bot.hand, top, col);
    if (bestMove) {
        let wildColor: CardColor | undefined;
        if (bestMove.color === 'black') wildColor = pickBestColor(bot.hand);
        await performPlayCard(botIndex, bestMove, wildColor);
        if (bot.hand.length === 2 && Math.random() > 0.3) addChatMessage(bot.id, bot.name, "UNO!", true);
    } else {
        performDraw(botIndex, 1);
        passTurn(botIndex);
        setLastAction(`${bot.name} comprou.`);
    }
  }, [gameState.currentPlayerIndex, gameState.status]);

  useEffect(() => {
      if (gameState.status === GameStatus.PLAYING && networkRole === 'HOST') {
          const current = gameState.players[gameState.currentPlayerIndex];
          if (current?.isBot) {
              if (botTimeoutRef.current) clearTimeout(botTimeoutRef.current);
              botTimeoutRef.current = setTimeout(processBotTurn, 100);
          }
      }
      return () => { if (botTimeoutRef.current) clearTimeout(botTimeoutRef.current); }
  }, [gameState.currentPlayerIndex, gameState.status, networkRole, processBotTurn]);

  // --- Human Interactions ---
  const onHumanPlayCard = (card: CardModel) => {
      if (gameState.currentPlayerIndex !== getMyIndex()) return; 
      const topCard = gameState.discardPile[gameState.discardPile.length - 1];
      if (!isCardValid(card, topCard, gameState.currentColor)) return;

      if (card.color === 'black') setWildColorSelector({ isOpen: true, cardToPlay: card });
      else submitAction({ actionType: 'PLAY_CARD', cardId: card.id, playerId: myPlayerId });
  };

  const onWildColorSelect = (color: CardColor) => {
      if (wildColorSelector.cardToPlay) {
          submitAction({ actionType: 'PLAY_CARD', cardId: wildColorSelector.cardToPlay.id, wildColor: color, playerId: myPlayerId });
          setWildColorSelector({ isOpen: false, cardToPlay: null });
      }
  };

  const onHumanDraw = () => {
       if (gameState.currentPlayerIndex !== getMyIndex()) return;
       submitAction({ actionType: 'DRAW_CARD', playerId: myPlayerId });
  };

  const onCallUno = () => {
      submitAction({ actionType: 'CALL_UNO', playerId: myPlayerId });
      addChatMessage(myPlayerId, playerName, "UNO!", true);
  };

  const submitAction = (action: PlayerAction) => {
      if (networkRoleRef.current === 'HOST') {
          // If I am host, execute immediately
          handleRemoteAction(action);
      } else {
          // If I am client, push to actions queue
          const actionsRef = ref(db, `rooms/${roomCode}/actions`);
          push(actionsRef, action);
      }
  };

  const getMyIndex = () => gameState.players.findIndex(p => p.id === myPlayerId);

  return gameState.status === GameStatus.LOBBY ? (
      <Lobby
         view={lobbyView}
         setView={setLobbyView}
         playerName={playerName}
         setPlayerName={setPlayerName}
         joinCode={joinCode}
         setJoinCode={setJoinCode}
         roomCode={roomCode}
         connectionStatus={connectionStatus}
         connectedPeers={connectedPeers}
         networkRole={networkRole}
         onCreateRoom={createRoom}
         onJoinRoom={joinRoom}
         onStartGame={startGameHost}
      />
  ) : (
      <GameInterface 
          gameState={gameState}
          myPlayerId={myPlayerId}
          playerName={playerName}
          roomCode={roomCode}
          chatMessages={chatMessages}
          lastAction={lastAction}
          networkRole={networkRole}
          onPlayCard={onHumanPlayCard}
          onDrawCard={onHumanDraw}
          onCallUno={onCallUno}
          onSendMessage={(text) => addChatMessage(myPlayerId, playerName, text)}
          onWildColorSelect={onWildColorSelect}
          onResetGame={resetGame}
          wildColorSelector={wildColorSelector}
      />
  );
};

export default App;