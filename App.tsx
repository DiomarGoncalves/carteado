import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GameState, GameStatus, Player, Card as CardModel, CardColor, ChatMessage, NetworkRole, PlayerAction } from './types';
import { createDeck, shuffleDeck, isCardValid, findBestMove, pickBestColor } from './services/gameLogic';
import { generateBotChat } from './services/geminiService';
import { AVATARS, BOT_NAMES } from './constants';
import { api } from './services/vercelService';

// UI Components
import Lobby from './components/Lobby';
import GameInterface from './components/GameInterface';

// Utility for simple unique IDs
const uuid = () => Math.random().toString(36).substr(2, 9);
const generateRoomCode = () => Math.floor(1000 + Math.random() * 9000).toString();

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
  const pollingRef = useRef<any>(null);

  // Helper to update role
  const updateNetworkRole = (role: NetworkRole) => {
      setNetworkRole(role);
      networkRoleRef.current = role;
  };

  // --- Chat Helper ---
  const addChatMessage = (senderId: string, senderName: string, text: string, isSystem = false) => {
    if (!roomCode) return;
    const msg: ChatMessage = { id: uuid(), senderId, senderName, text, timestamp: Date.now(), isSystem };
    
    // Optimistic Update
    setChatMessages(prev => [...prev, msg]);
    
    // Send to API Queue
    api.sendAction(roomCode, {
        actionType: 'CHAT',
        message: msg
    });
  };

  // --- Network Logic (Vercel API Polling) ---

  // Start Polling Loop
  useEffect(() => {
      if (networkRole === 'OFFLINE') return;

      const poll = async () => {
          if (!roomCode) return;
          
          const data = await api.getRoomState(roomCode);
          
          if (data && data.gameState) {
              // Sync State
              if (networkRole === 'CLIENT') {
                  setGameState(data.gameState);
                  setChatMessages(data.chatMessages || []);
                  
                  // Update Lobby UI if in lobby
                  if (data.gameState.status === GameStatus.LOBBY) {
                      const host = data.gameState.players.find((p: Player) => p.isHost);
                      setConnectedPeers(data.gameState.players.map((p: Player) => ({ id: p.id, name: p.name + (p.isHost ? ' (Host)' : '') })));
                  } else if (lobbyView === 'WAITING_CLIENT') {
                      setLobbyView('WAITING_CLIENT'); // Just to ensure view stays or switches
                  }
              }

              // HOST LOGIC: Process Pending Actions
              if (networkRole === 'HOST') {
                  // Only update local state from server if it's strictly newer or we need chat sync
                  // But usually Host is the source of truth for GameState.
                  // Host mainly checks for pendingActions.
                  
                  if (data.pendingActions && data.pendingActions.length > 0) {
                      let stateChanged = false;
                      const newChat = [...chatMessages]; // Start with local chat

                      data.pendingActions.forEach((action: any) => {
                           if (action.actionType === 'JOIN_REQUEST') {
                               if (stateRef.current.status === GameStatus.LOBBY) {
                                   handleAddPlayer(action.payload);
                                   stateChanged = true;
                               }
                           } else if (action.actionType === 'CHAT') {
                               // Avoid duplicates
                               if (!newChat.some(m => m.id === action.message.id)) {
                                   newChat.push(action.message);
                                   stateChanged = true; // Chat changed
                               }
                           } else {
                               // Game Actions
                               handleRemoteAction(action);
                               stateChanged = true;
                           }
                      });

                      // If we processed actions, we MUST push the new state immediately
                      if (stateChanged || data.pendingActions.length > 0) {
                          // Update Chat
                          setChatMessages(newChat.sort((a,b) => a.timestamp - b.timestamp));
                          
                          // Push calculated state back to server
                          // We use the Ref to ensure we have the very latest calculated state from handleRemoteAction
                          api.updateGameState(roomCode, stateRef.current, newChat);
                      }
                  }
              }
          } else if (data && data.status === 'NOT_FOUND' && networkRole === 'CLIENT') {
              setConnectionStatus('Sala encerrada ou não encontrada.');
              setNetworkRole('OFFLINE');
              setLobbyView('MENU');
          }
      };

      pollingRef.current = setInterval(poll, 1000); // Poll every 1 second
      return () => clearInterval(pollingRef.current);
  }, [networkRole, roomCode, lobbyView]); // Chat messages excluded to avoid reset loop, handled inside

  // 1. Setup Host
  const createRoom = async () => {
      const code = generateRoomCode();
      setRoomCode(code);
      setConnectionStatus('Criando sala...');
      updateNetworkRole('HOST');
      
      const newPlayerId = uuid();
      setMyPlayerId(newPlayerId);
      
      const hostPlayer: Player = {
          id: newPlayerId,
          name: playerName,
          avatar: AVATARS[0],
          isBot: false,
          hand: [],
          isUno: false,
          isHost: true
      };

      const initialGameState: GameState = {
          status: GameStatus.LOBBY,
          players: [hostPlayer],
          currentPlayerIndex: 0,
          direction: 1,
          drawPile: [],
          discardPile: [],
          currentColor: 'red',
          winner: null,
          turnCount: 0,
      };

      setGameState(initialGameState);
      setConnectedPeers([{ id: newPlayerId, name: playerName + " (Host)" }]);
      
      // Initialize Room on Vercel KV
      await api.updateGameState(code, initialGameState, []);
      setLobbyView('WAITING_HOST');
  };

  // 2. Setup Client
  const joinRoom = async () => {
      if (joinCode.length !== 4) return;
      
      const code = joinCode;
      setConnectionStatus('Conectando...');
      
      // Check if room exists first
      const data = await api.getRoomState(code);
      if (!data || data.status === 'NOT_FOUND') {
          setConnectionStatus('Sala não encontrada!');
          return;
      }

      setRoomCode(code);
      updateNetworkRole('CLIENT');
      
      const newPlayerId = uuid();
      setMyPlayerId(newPlayerId);
      setLobbyView('WAITING_CLIENT');

      // Send Join Request
      api.sendAction(code, {
          actionType: 'JOIN_REQUEST',
          payload: {
              id: newPlayerId,
              name: playerName,
              avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)],
              isBot: false,
              hand: [],
              isUno: false
          }
      });
  };

  // Host Logic to add player
  const handleAddPlayer = (player: Player) => {
      // Check for duplicates
      if (stateRef.current.players.some(p => p.id === player.id)) return;

      const newPlayers = [...stateRef.current.players, player];
      setGameState(prev => ({ ...prev, players: newPlayers }));
      setConnectedPeers(newPlayers.map(p => ({ id: p.id, name: p.name })));
      
      // Announce
      const msg = { id: uuid(), senderId: 'system', senderName: 'Sistema', text: `${player.name} entrou!`, timestamp: Date.now(), isSystem: true };
      setChatMessages(prev => [...prev, msg]);
  };

  // --- Game Control (Host Only) ---
  const startGameHost = (mode: GameMode) => {
      if (networkRoleRef.current !== 'HOST') return;
      const deck = createDeck();
      
      const currentPlayers = [...stateRef.current.players];
      
      // Reset hands
      currentPlayers.forEach((p, i) => {
          p.hand = deck.splice(0, 7);
          p.avatar = AVATARS[i % AVATARS.length]; // Ensure distinctive avatars
      });

      // Add Bots if needed
      let totalSlots = 4;
      if (mode === '1v1') totalSlots = 2;
      if (mode === '1v4') totalSlots = 5;

      const neededBots = Math.max(0, totalSlots - currentPlayers.length);
      for (let i = 0; i < neededBots; i++) {
           currentPlayers.push({
              id: `bot-${i}`,
              name: BOT_NAMES[i % BOT_NAMES.length],
              avatar: AVATARS[currentPlayers.length + i],
              isBot: true,
              hand: deck.splice(0, 7),
              isUno: false
          });
      }

      const firstCard = deck.shift()!;
      const initialColor = firstCard.color === 'black' ? 'red' : firstCard.color;

      const newState: GameState = {
          status: GameStatus.PLAYING,
          players: currentPlayers,
          currentPlayerIndex: 0,
          direction: 1,
          drawPile: deck,
          discardPile: [firstCard],
          currentColor: initialColor,
          winner: null,
          turnCount: 1
      };

      setGameState(newState);
      // Immediate push to start game for clients
      api.updateGameState(roomCode, newState, chatMessages);
  };

  const resetGame = () => {
      const newState: GameState = {
          status: GameStatus.LOBBY,
          players: stateRef.current.players.map(p => ({...p, hand: [], isUno: false})), 
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
      api.updateGameState(roomCode, newState, chatMessages);
  };

  // --- Core Game Logic (Runs on HOST) ---
  const handleRemoteAction = (action: PlayerAction) => {
      // Only host runs this logic
      if (networkRoleRef.current !== 'HOST') return;

      const playerIdx = stateRef.current.players.findIndex(p => p.id === action.playerId);
      if (playerIdx === -1) return;
      
      // Validate Turn (except for UNO calls)
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
           const msg = { id: uuid(), senderId: 'system', senderName: 'Sistema', text: `${stateRef.current.players[playerIdx].name} gritou UNO!`, timestamp: Date.now(), isSystem: true };
           setChatMessages(prev => [...prev, msg]);
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
    if (networkRoleRef.current !== 'HOST') return;

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
        
        // Host must sync after bot move manually if state didn't trigger via action queue
        // But since we use setGameState, the useEffect loop should catch and sync it eventually,
        // or we can force sync here:
        api.updateGameState(roomCode, stateRef.current, chatMessages);
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
          // If I am host, execute immediately locally
          handleRemoteAction(action);
          // And force a sync to server so clients see it immediately
          api.updateGameState(roomCode, stateRef.current, chatMessages);
      } else {
          // If I am client, send to API queue
          api.sendAction(roomCode, action);
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