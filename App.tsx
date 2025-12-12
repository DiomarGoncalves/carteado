import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GameState, GameStatus, Player, Card as CardModel, CardColor, ChatMessage, NetworkRole, PlayerAction, NetworkPacket } from './types';
import { createDeck, shuffleDeck, isCardValid, findBestMove, pickBestColor } from './services/gameLogic';
import { generateBotChat } from './services/geminiService';
import { AVATARS, BOT_NAMES } from './constants';
import Card from './components/Card';
import Chat from './components/Chat';

// Globals for PeerJS (window.Peer)
declare global {
  interface Window {
    Peer: any;
  }
}

// Configuration for PeerJS with Google's public STUN servers
// This enables connections between different networks (WiFi vs 4G)
const PEER_CONFIG = {
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
    ]
  }
};

// Utility for simple unique IDs
const uuid = () => Math.random().toString(36).substr(2, 9);
const generateRoomCode = () => Math.random().toString(36).substring(2, 6).toUpperCase();

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
  const [playerName, setPlayerName] = useState('Jogador 1');
  const [lobbyView, setLobbyView] = useState<LobbyView>('MENU');
  const [roomCode, setRoomCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [connectionStatus, setConnectionStatus] = useState('');
  
  // Mobile UI States
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);

  // --- Network State ---
  const [networkRole, setNetworkRole] = useState<NetworkRole>('OFFLINE');
  const networkRoleRef = useRef<NetworkRole>('OFFLINE'); 

  const [myPlayerId, setMyPlayerId] = useState<string>(''); 
  const [connectedPeers, setConnectedPeers] = useState<{id: string, name: string, conn: any, peerId?: string}[]>([]);
  const connectedPeersRef = useRef<{id: string, name: string, conn: any, peerId?: string}[]>([]);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  
  // --- Interaction State ---
  const [wildColorSelector, setWildColorSelector] = useState<{ isOpen: boolean, cardToPlay: CardModel | null }>({ isOpen: false, cardToPlay: null });
  const [lastAction, setLastAction] = useState<string>('');

  // Refs
  const stateRef = useRef(gameState);
  stateRef.current = gameState; 
  const peerRef = useRef<any>(null);
  const connectionsRef = useRef<any[]>([]); 
  const hostConnRef = useRef<any>(null); 
  const botTimeoutRef = useRef<any>(null);

  // Helper to update role
  const updateNetworkRole = (role: NetworkRole) => {
      setNetworkRole(role);
      networkRoleRef.current = role;
  };

  const updateConnectedPeers = (updater: (prev: typeof connectedPeersRef.current) => typeof connectedPeersRef.current) => {
      setConnectedPeers(prev => {
          const next = updater(prev);
          connectedPeersRef.current = next;
          return next;
      });
  };

  // --- Helpers ---
  const addSystemMessage = (text: string) => {
    const msg = { id: uuid(), senderId: 'system', senderName: 'Sistema', text, timestamp: Date.now(), isSystem: true };
    setChatMessages(prev => {
        if (prev.length > 0 && prev[prev.length -1].text === text && Date.now() - prev[prev.length-1].timestamp < 1000) return prev;
        return [...prev, msg];
    });
    if (networkRoleRef.current === 'HOST') broadcast({ type: 'CHAT', payload: msg });
  };

  const addChatMessage = (senderId: string, senderName: string, text: string) => {
    const msg = { id: uuid(), senderId, senderName, text, timestamp: Date.now() };
    setChatMessages(prev => {
        if (!isChatOpen) setUnreadMessages(c => c + 1);
        return [...prev, msg];
    });
    
    if (networkRoleRef.current === 'HOST') {
        broadcast({ type: 'CHAT', payload: msg });
    } else if (networkRoleRef.current === 'CLIENT' && hostConnRef.current) {
        hostConnRef.current.send({ type: 'CHAT', payload: msg });
    }
  };

  // --- Network Logic (PeerJS) ---
  const cleanupNetwork = () => {
      if (peerRef.current) {
          peerRef.current.destroy();
          peerRef.current = null;
      }
      connectionsRef.current = [];
      hostConnRef.current = null;
      updateConnectedPeers(() => []);
      updateNetworkRole('OFFLINE');
      setConnectionStatus('');
  };

  // 1. Setup Host
  const createRoom = () => {
      if (peerRef.current) cleanupNetwork(); 

      const code = generateRoomCode();
      setRoomCode(code);
      setConnectionStatus('Iniciando servidor...');
      setLobbyView('WAITING_HOST');
      updateNetworkRole('HOST');
      
      const peerId = `cc-game-${code}`; 
      // Initialize Peer with STUN config
      const peer = new window.Peer(peerId, PEER_CONFIG);
      peerRef.current = peer;

      peer.on('open', (id: string) => {
          console.log('Host initialized:', id);
          setConnectionStatus('Sala Pronta');
          const hostPlayerId = uuid();
          setMyPlayerId(hostPlayerId);
          updateConnectedPeers(() => [{ id: hostPlayerId, name: playerName + " (Host)", conn: null, peerId: 'HOST' }]);
      });

      peer.on('connection', (conn: any) => {
          conn.on('data', (data: NetworkPacket) => {
             handleNetworkMessage(data, conn);
          });
          
          conn.on('close', () => {
              updateConnectedPeers(prev => {
                  const remaining = prev.filter(p => p.conn !== conn);
                  const list = remaining.map(p => ({name: p.name}));
                  broadcast({ type: 'LOBBY_UPDATE', payload: { players: list } });
                  return remaining;
              });
              addSystemMessage("Um jogador desconectou.");
          });
      });

      peer.on('error', (err: any) => {
          if (err.type === 'unavailable-id') {
              alert("Colisão de código de sala. Tente novamente.");
              cleanupNetwork();
              setLobbyView('MENU');
          } else {
             setConnectionStatus('Erro de Conexão: ' + err.type);
          }
      });
  };

  // 2. Setup Client
  const joinRoom = () => {
      if (joinCode.length !== 4) return;
      if (peerRef.current) cleanupNetwork();

      const code = joinCode.toUpperCase();
      setLobbyView('WAITING_CLIENT');
      setRoomCode(code);
      updateNetworkRole('CLIENT');
      setConnectionStatus('Conectando ao servidor...');

      // Initialize Peer with STUN config
      const peer = new window.Peer(undefined, PEER_CONFIG); 
      peerRef.current = peer;

      peer.on('open', (id: string) => {
          const hostId = `cc-game-${code}`;
          const conn = peer.connect(hostId, { reliable: true }); 
          hostConnRef.current = conn;

          conn.on('open', () => {
              setConnectionStatus('Conectado! Verificando...');
              setTimeout(() => {
                  conn.send({ 
                      type: 'JOIN_REQUEST', 
                      payload: { name: playerName } 
                  });
              }, 500);
          });

          conn.on('data', (data: NetworkPacket) => {
              handleNetworkMessage(data, conn);
          });
          
          conn.on('close', () => {
              alert("Host desconectou ou Sala Fechada");
              cleanupNetwork();
              setLobbyView('MENU');
          });
      });
      
      peer.on('error', (err: any) => {
          setConnectionStatus('Erro: Não foi possível encontrar sala ' + code);
          setTimeout(() => {
              cleanupNetwork();
              setLobbyView('MENU');
          }, 2000);
      });
  };

  // 3. Message Handling
  const handleNetworkMessage = (packet: NetworkPacket, conn?: any) => {
      const currentRole = networkRoleRef.current;

      try {
          if (currentRole === 'HOST') {
              switch (packet.type) {
                  case 'JOIN_REQUEST':
                      const newPlayerId = uuid();
                      const newPeer = { 
                          id: newPlayerId, 
                          name: packet.payload.name, 
                          conn: conn,
                          peerId: conn.peer 
                      };
                      connectionsRef.current.push(conn);
                      updateConnectedPeers(prev => {
                          if (prev.some(p => p.peerId === conn.peer || p.conn === conn)) return prev;
                          const newList = [...prev, newPeer];
                          const playerListForClient = newList.map(p => ({name: p.name}));
                          broadcast({ type: 'LOBBY_UPDATE', payload: { players: playerListForClient } });
                          broadcast({ type: 'CHAT', payload: { id: uuid(), text: `${packet.payload.name} entrou!`, isSystem: true } });
                          if (conn && conn.open) conn.send({ type: 'JOIN_ACCEPT', payload: { playerId: newPlayerId, players: playerListForClient } });
                          return newList;
                      });
                      break;
                  case 'PLAYER_ACTION': handleRemoteAction(packet.payload); break;
                  case 'CHAT': 
                      setChatMessages(prev => {
                          if (!isChatOpen) setUnreadMessages(c => c + 1);
                          return [...prev, packet.payload]
                      });
                      broadcast(packet); 
                      break;
              }
          } else if (currentRole === 'CLIENT') {
              switch (packet.type) {
                  case 'JOIN_ACCEPT':
                      setMyPlayerId(packet.payload.playerId);
                      setConnectionStatus('Entrou na Sala!');
                      updateConnectedPeers(() => packet.payload.players.map((p: any, i: number) => ({ id: `p-${i}`, name: p.name, conn: null })));
                      addSystemMessage("Entrou na sala! Aguardando o host...");
                      break;
                  case 'LOBBY_UPDATE':
                      updateConnectedPeers(() => packet.payload.players.map((p: any, i: number) => ({ id: `p-${i}`, name: p.name, conn: null })));
                      break;
                  case 'GAME_STATE':
                      setGameState(packet.payload);
                      if (packet.payload.status === GameStatus.LOBBY) setLobbyView('WAITING_CLIENT');
                      break;
                  case 'CHAT': 
                      setChatMessages(prev => {
                          if (!isChatOpen) setUnreadMessages(c => c + 1);
                          return [...prev, packet.payload]
                      });
                      break;
              }
          }
      } catch (error) {
          console.error("Error handling packet:", error, packet);
      }
  };

  const broadcast = (packet: NetworkPacket) => {
      const peers = connectedPeersRef.current;
      peers.forEach(p => {
          if (p.conn && p.conn.open) p.conn.send(packet);
      });
  };

  // --- Game Control (Host Only) ---
  useEffect(() => {
      if (networkRoleRef.current === 'HOST' && gameState.status !== GameStatus.LOBBY) {
          broadcast({ type: 'GAME_STATE', payload: gameState });
      }
      if (networkRoleRef.current === 'HOST' && gameState.status === GameStatus.LOBBY && lobbyView === 'WAITING_HOST') {
          broadcast({ type: 'GAME_STATE', payload: gameState });
      }
  }, [gameState]);

  const resetGame = () => {
      const newState: GameState = {
          status: GameStatus.LOBBY,
          players: [],
          currentPlayerIndex: 0,
          direction: 1,
          drawPile: [],
          discardPile: [],
          currentColor: 'red',
          winner: null,
          turnCount: 0,
      };
      setGameState(newState);
      setLobbyView('WAITING_HOST');
      setLastAction('');
  };

  const startGameHost = (mode: GameMode) => {
      if (networkRoleRef.current !== 'HOST' && networkRoleRef.current !== 'OFFLINE') return;
      const deck = createDeck();
      const currentPeers = connectedPeersRef.current;
      
      const hostPeer = currentPeers.find(p => p.conn === null); 
      const hostPlayer: Player = {
          id: myPlayerId || (hostPeer ? hostPeer.id : 'host'),
          name: playerName,
          avatar: AVATARS[0],
          isBot: false,
          hand: deck.splice(0, 7),
          isUno: false,
          isHost: true
      };
      
      const players: Player[] = [hostPlayer];
      const realClients = currentPeers.filter(p => p.conn !== null);
      realClients.forEach((client, i) => {
          players.push({
              id: client.id,
              name: client.name,
              avatar: AVATARS[(i + 1) % AVATARS.length], 
              isBot: false,
              hand: deck.splice(0, 7),
              isUno: false
          });
      });

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
      if (networkRoleRef.current === 'OFFLINE') setMyPlayerId('host');
  };

  // --- Core Game Logic ---
  const handleRemoteAction = (action: PlayerAction) => {
      const playerIdx = stateRef.current.players.findIndex(p => p.id === action.playerId);
      if (playerIdx === -1) return;
      if (playerIdx !== stateRef.current.currentPlayerIndex) return; 

      if (action.actionType === 'DRAW_CARD') {
          performDraw(playerIdx, 1);
          passTurn(playerIdx); 
      } else if (action.actionType === 'PLAY_CARD' && action.cardId) {
          const player = stateRef.current.players[playerIdx];
          const card = player.hand.find(c => c.id === action.cardId);
          if (card) {
              performPlayCard(playerIdx, card, action.wildColor);
          }
      } else if (action.actionType === 'CALL_UNO') {
          addSystemMessage(`${stateRef.current.players[playerIdx].name} gritou UNO!`);
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
    if (networkRoleRef.current === 'CLIENT') return; 

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
        if (bot.hand.length === 2 && Math.random() > 0.3) addSystemMessage(`${bot.name} gritou UNO!`);
    } else {
        performDraw(botIndex, 1);
        passTurn(botIndex);
        setLastAction(`${bot.name} comprou.`);
    }
  }, [gameState.currentPlayerIndex, gameState.status]);

  useEffect(() => {
      if (gameState.status === GameStatus.PLAYING && (networkRole === 'HOST' || networkRole === 'OFFLINE')) {
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
  };

  const submitAction = (action: PlayerAction) => {
      if (networkRoleRef.current === 'HOST' || networkRoleRef.current === 'OFFLINE') {
          handleRemoteAction(action);
      } else {
          if (hostConnRef.current) hostConnRef.current.send({ type: 'PLAYER_ACTION', payload: action });
      }
  };

  // --- View Helpers ---
  const getMyIndex = () => gameState.players.findIndex(p => p.id === myPlayerId);
  const myPlayer = gameState.players.find(p => p.id === myPlayerId);
  
  const getRelativePlayers = () => {
      const myIdx = getMyIndex();
      if (myIdx === -1) return gameState.players; 
      const count = gameState.players.length;
      const ordered = [];
      for (let i = 1; i < count; i++) {
          ordered.push(gameState.players[(myIdx + i) % count]);
      }
      return ordered;
  };

  const getOpponentStyle = (index: number, totalOpponents: number) => {
       // Mobile-First optimized positioning
       if (totalOpponents === 1) return "top-8 left-1/2 -translate-x-1/2 scale-110";
       if (totalOpponents === 2) return index === 0 ? "top-20 left-4 md:top-24 md:left-12" : "top-20 right-4 md:top-24 md:right-12";
       if (totalOpponents === 3) {
           if (index === 0) return "left-2 top-1/2 -translate-y-1/2 scale-90 md:scale-100 md:left-4";
           if (index === 1) return "top-4 left-1/2 -translate-x-1/2";
           if (index === 2) return "right-2 top-1/2 -translate-y-1/2 scale-90 md:scale-100 md:right-4";
       }
       if (totalOpponents >= 4) {
           if (index === 0) return "left-2 bottom-40 scale-75 md:scale-100 md:left-4 md:bottom-32";
           if (index === 1) return "top-12 left-8 md:top-12 md:left-16";
           if (index === 2) return "top-12 right-8 md:top-12 md:right-16";
           if (index === 3) return "right-2 bottom-40 scale-75 md:scale-100 md:right-4 md:bottom-32";
       }
       return "top-0";
  };

  // --- Render ---
  const renderLobby = () => {
      if (lobbyView === 'MENU') {
          return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 p-4">
              <div className="flex justify-center mb-6">
                 <img src="logo.svg" alt="Logo" className="w-24 h-24 drop-shadow-2xl animate-bounce" />
              </div>
              <div className="text-4xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-yellow-400 to-blue-500 mb-8 animate-pulse text-center">
                CARD CLASH
                <span className="block text-lg md:text-xl text-slate-400 mt-2 font-normal tracking-widest uppercase">Multiplayer Online</span>
              </div>
              <div className="bg-slate-800 p-6 md:p-8 rounded-2xl shadow-2xl w-full max-w-md border border-slate-700 space-y-4">
                <input 
                    className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    placeholder="Digite seu apelido"
                    maxLength={12}
                />
                <button onClick={createRoom} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-xl shadow-lg active:scale-95 transition-transform">Criar Sala (Host)</button>
                <button onClick={() => setLobbyView('JOIN')} className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-4 rounded-xl shadow-lg active:scale-95 transition-transform">Entrar na Sala (Código)</button>
              </div>
            </div>
          );
      }
      if (lobbyView === 'JOIN') {
          return (
             <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 p-4">
                <div className="bg-slate-800 p-8 rounded-2xl shadow-2xl w-full max-w-md border border-slate-700">
                    <h2 className="text-2xl font-bold mb-6 text-center">Entrar na Sala</h2>
                    <input 
                        className="w-full bg-slate-900 border border-slate-600 rounded-lg p-4 text-center text-2xl tracking-[0.5em] font-mono text-white mb-6 uppercase focus:ring-2 focus:ring-green-500 outline-none"
                        value={joinCode}
                        onChange={(e) => setJoinCode(e.target.value.substring(0,4))}
                        placeholder="CÓDIGO"
                        maxLength={4}
                    />
                    <div className="text-center text-sm text-yellow-400 mb-4 h-6">{connectionStatus}</div>
                    <button onClick={joinRoom} className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-4 rounded-xl shadow-lg mb-4">Conectar</button>
                    <button onClick={() => setLobbyView('MENU')} className="w-full text-slate-400 hover:text-white">Voltar</button>
                </div>
             </div>
          );
      }
      if (lobbyView === 'WAITING_HOST' || lobbyView === 'WAITING_CLIENT') {
          return (
             <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 p-4">
                 <div className="text-center w-full max-w-md">
                     <h2 className="text-xl md:text-2xl font-bold mb-2">Código da Sala: <span className="text-green-400 font-mono text-3xl mx-2 tracking-widest">{roomCode}</span></h2>
                     
                     <div className="bg-slate-800/50 p-4 rounded-lg w-full mx-auto mb-6 min-h-[150px] border border-slate-700">
                        <h3 className="text-xs font-bold text-slate-500 mb-3 uppercase tracking-wider border-b border-slate-700 pb-2">Jogadores Conectados</h3>
                        <div className="flex flex-col gap-2">
                            {connectedPeers.length === 0 && networkRole === 'CLIENT' && (
                                <div className="text-slate-500 italic animate-pulse">Conectando...</div>
                            )}
                            {connectedPeers.map(p => (
                                 <div key={p.id} className="text-white font-bold flex items-center justify-between bg-slate-700/50 px-3 py-2 rounded">
                                     <span>{p.name}</span>
                                     <span className="text-xs bg-green-500 text-black px-2 py-0.5 rounded-full font-bold">PRONTO</span>
                                 </div>
                            ))}
                        </div>
                     </div>

                     {networkRole === 'HOST' && (
                         <div className="w-full space-y-3">
                            <button onClick={() => startGameHost('1v1')} className="w-full bg-blue-600 hover:bg-blue-500 py-3 rounded-lg font-bold text-sm shadow-lg flex justify-between px-4">
                                <span>Duelo 1v1</span>
                                <span className="text-blue-200">{connectedPeers.length > 1 ? 'Vs Humano' : 'Vs Bot'}</span>
                            </button>
                            <button onClick={() => startGameHost('1v3')} className="w-full bg-blue-600 hover:bg-blue-500 py-3 rounded-lg font-bold text-sm shadow-lg flex justify-between px-4">
                                <span>4 Jogadores</span>
                                <span className="text-blue-200">{connectedPeers.length}/4 Humanos</span>
                            </button>
                            <button onClick={() => startGameHost('1v4')} className="w-full bg-blue-600 hover:bg-blue-500 py-3 rounded-lg font-bold text-sm shadow-lg flex justify-between px-4">
                                <span>5 Jogadores</span>
                                <span className="text-blue-200">{connectedPeers.length}/5 Humanos</span>
                            </button>
                         </div>
                     )}
                 </div>
             </div>
          );
      }
      return null;
  }
  
  // Game UI
  const renderGame = () => {
    const relativeOpponents = getRelativePlayers();
    const isMyTurn = gameState.currentPlayerIndex === getMyIndex();
    const topCard = gameState.discardPile[gameState.discardPile.length - 1];

    return (
    <div className="relative w-full h-screen flex flex-col bg-gradient-to-br from-slate-900 to-slate-800 overflow-hidden select-none">
      {wildColorSelector.isOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-slate-800 p-6 rounded-xl border-2 border-slate-600 animate-bounce shadow-2xl">
                <h3 className="text-xl font-bold mb-4 text-center">Escolher Cor</h3>
                <div className="grid grid-cols-2 gap-4">
                    {(['red', 'blue', 'green', 'yellow'] as CardColor[]).map(c => (
                        <button key={c} onClick={() => onWildColorSelect(c)} className={`w-20 h-20 md:w-24 md:h-24 rounded-lg bg-${c === 'yellow' ? 'yellow-400' : c + '-500'} hover:opacity-80 transition-all transform hover:scale-105 shadow-lg`}/>
                    ))}
                </div>
            </div>
          </div>
      )}

      {/* Top Bar */}
      <div className="h-14 md:h-16 flex items-center justify-between px-4 md:px-6 bg-slate-900/50 backdrop-blur border-b border-slate-700 z-50">
          <div className="flex items-center gap-2">
            <img src="logo.svg" className="w-6 h-6 md:w-8 md:h-8" />
            <span className="font-black text-lg md:text-xl tracking-tighter text-white hidden md:block">CARD CLASH</span>
            <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase bg-${gameState.currentColor === 'yellow' ? 'yellow-400' : gameState.currentColor + '-500'} text-${gameState.currentColor === 'yellow' ? 'black' : 'white'} shadow-sm`}>
                Cor: {gameState.currentColor === 'red' ? 'Vermelho' : gameState.currentColor === 'blue' ? 'Azul' : gameState.currentColor === 'green' ? 'Verde' : 'Amarelo'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-xs md:text-sm text-slate-400 font-mono bg-slate-800 px-2 py-1 rounded border border-slate-700">{roomCode}</div>
            
            {/* Mobile Chat Toggle */}
            <button 
                onClick={() => { setIsChatOpen(!isChatOpen); setUnreadMessages(0); }}
                className="lg:hidden relative p-2 bg-slate-700 rounded-full hover:bg-slate-600 transition-colors"
            >
                💬
                {unreadMessages > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center animate-pulse">
                        {unreadMessages}
                    </span>
                )}
            </button>
          </div>
      </div>

      <div className="flex-1 relative overflow-hidden flex">
          <div className="flex-1 relative flex flex-col items-center justify-center p-4">
              {/* Opponents */}
              {relativeOpponents.map((opp, i) => {
                  const actualIdx = gameState.players.findIndex(p => p.id === opp.id);
                  const isTurn = gameState.currentPlayerIndex === actualIdx;
                  return (
                    <div key={opp.id} className={`absolute transition-all duration-500 ${getOpponentStyle(i, relativeOpponents.length)} ${isTurn ? 'z-20 scale-110' : 'z-10 opacity-90'}`}>
                        <div className="flex flex-col items-center group">
                            <div className={`w-12 h-12 md:w-16 md:h-16 rounded-full bg-slate-700 border-2 ${isTurn ? 'border-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.5)]' : 'border-slate-500'} flex items-center justify-center text-2xl md:text-3xl mb-1 md:mb-2 relative transition-all`}>
                                {opp.avatar}
                                <div className="absolute -top-1 -right-1 md:-top-2 md:-right-2 w-5 h-5 md:w-6 md:h-6 bg-red-600 rounded-full text-[10px] md:text-xs flex items-center justify-center text-white font-bold border-2 border-slate-800 shadow">
                                    {opp.hand.length}
                                </div>
                                {opp.hand.length === 1 && <div className="absolute -bottom-2 bg-yellow-500 text-black text-[10px] font-black px-1.5 rounded animate-bounce">UNO</div>}
                            </div>
                            <span className={`text-[10px] md:text-xs font-bold px-2 py-0.5 rounded ${isTurn ? 'bg-yellow-500/20 text-yellow-200' : 'bg-slate-800/80 text-slate-300'}`}>{opp.name}</span>
                        </div>
                    </div>
                  );
              })}

              {/* Table Center */}
              <div className="flex items-center gap-4 md:gap-8 z-10 scale-90 md:scale-100 transition-transform mt-[-40px] md:mt-0">
                  <div onClick={isMyTurn ? onHumanDraw : undefined} className={`relative w-20 h-28 md:w-28 md:h-40 bg-slate-800 rounded-xl border-4 border-slate-600 flex items-center justify-center shadow-2xl ${isMyTurn ? 'cursor-pointer hover:scale-105 hover:border-blue-400 ring-2 ring-blue-500/50' : ''} transition-all`}>
                      <div className="absolute w-16 h-24 md:w-24 md:h-36 bg-slate-700 rounded-lg border-2 border-slate-500" style={{ transform: 'rotate(-5deg)'}}></div>
                      <div className="absolute w-16 h-24 md:w-24 md:h-36 bg-slate-700 rounded-lg border-2 border-slate-500" style={{ transform: 'rotate(3deg)'}}></div>
                      <div className="z-10 font-black text-2xl md:text-4xl text-slate-600 select-none">UNO</div>
                  </div>
                  <div className="relative w-24 h-32 md:w-32 md:h-44 flex items-center justify-center">
                      {gameState.discardPile.slice(-3).map((card, i) => (
                          <div key={card.id} className="absolute transition-all" style={{ transform: `rotate(${i * 5 - 10}deg) translateY(${i * -2}px)` }}>
                               <Card card={card} size="md" /> {/* Force MD size mostly, adjust logic inside Card if needed */}
                          </div>
                      ))}
                  </div>
              </div>
               <div className="absolute bottom-32 md:bottom-20 w-full text-center">
                   <span className="text-yellow-400 font-bold animate-pulse text-sm md:text-lg drop-shadow-md bg-black/50 px-3 py-1 rounded-full">{lastAction}</span>
               </div>
          </div>
          
          {/* Desktop Chat */}
          <div className="w-72 border-l border-slate-700 p-2 hidden lg:block bg-slate-900/50">
              <Chat messages={chatMessages} onSendMessage={(text) => addChatMessage(myPlayerId, playerName, text)} />
          </div>

          {/* Mobile Chat Overlay */}
          {isChatOpen && (
              <div className="absolute inset-0 z-40 bg-slate-900/95 lg:hidden flex flex-col p-4">
                  <div className="flex justify-between items-center mb-4">
                      <h3 className="font-bold text-lg">Chat</h3>
                      <button onClick={() => setIsChatOpen(false)} className="text-slate-400 text-2xl">✕</button>
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <Chat messages={chatMessages} onSendMessage={(text) => addChatMessage(myPlayerId, playerName, text)} />
                  </div>
              </div>
          )}
      </div>

      {/* Hand */}
      <div className={`h-40 md:h-48 w-full bg-slate-900 border-t border-slate-700 relative flex flex-col items-center justify-end pb-2 md:pb-4 transition-colors ${isMyTurn ? 'bg-slate-800/90 shadow-[0_-4px_30px_rgba(59,130,246,0.2)]' : ''}`}>
          {isMyTurn && <div className="absolute -top-8 md:-top-12 bg-blue-600 text-white px-4 md:px-8 py-1 md:py-2 rounded-full font-bold shadow-lg animate-bounce z-20 border-2 border-blue-400 pointer-events-none text-xs md:text-base">SUA VEZ</div>}
          
          <button onClick={onCallUno} className="absolute right-2 md:right-8 top-2 md:top-4 bg-gradient-to-br from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-black italic rounded-full w-12 h-12 md:w-16 md:h-16 shadow-lg border-2 md:border-4 border-white transition-transform active:scale-95 z-30 text-xs md:text-base">UNO!</button>
          
          <div className="flex items-end justify-start md:justify-center space-x-[-2rem] md:-space-x-8 hover:space-x-[-1rem] md:hover:space-x-1 transition-all duration-300 px-4 w-full overflow-x-auto overflow-y-hidden py-4 min-h-[130px] md:min-h-[140px] scrollbar-thin scrollbar-thumb-slate-700">
              {myPlayer?.hand.map((card, index) => (
                  <div key={card.id} className="transform transition-transform hover:-translate-y-6 md:hover:-translate-y-10 hover:z-50 origin-bottom duration-200 min-w-[3rem] md:min-w-auto" style={{ zIndex: index }}>
                      <Card card={card} isPlayable={isMyTurn && isCardValid(card, topCard, gameState.currentColor)} onClick={() => onHumanPlayCard(card)} disabled={!isMyTurn} size="md" />
                  </div>
              ))}
          </div>
      </div>
      
      {gameState.status === GameStatus.GAME_OVER && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
            <div className="bg-slate-800 p-6 md:p-10 rounded-2xl text-center border-4 border-yellow-500 shadow-2xl w-full max-w-lg">
                <h2 className="text-3xl md:text-5xl font-black text-white mb-4">{gameState.winner?.id === myPlayerId ? 'VITÓRIA! 🏆' : 'FIM DE JOGO 💀'}</h2>
                <p className="text-lg md:text-xl text-slate-300 mb-8">{gameState.winner?.name} venceu!</p>
                
                <div className="flex flex-col md:flex-row gap-4 justify-center">
                    {(networkRole === 'HOST' || networkRole === 'OFFLINE') ? (
                        <button onClick={resetGame} className="bg-blue-600 hover:bg-blue-500 px-6 py-3 rounded-full font-bold text-lg transition-transform hover:scale-110 shadow-lg">
                            Jogar Novamente
                        </button>
                    ) : (
                        <div className="text-sm text-slate-400 flex items-center justify-center">
                             Aguardando host...
                        </div>
                    )}

                    <button onClick={() => window.location.reload()} className="bg-red-600 hover:bg-red-500 px-6 py-3 rounded-full font-bold text-lg transition-transform hover:scale-110 shadow-lg">
                        Sair
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
    );
  };

  return gameState.status === GameStatus.LOBBY ? renderLobby() : renderGame();
};

export default App;