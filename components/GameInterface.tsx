import React, { useState } from 'react';
import { GameState, GameStatus, Card as CardModel, CardColor, ChatMessage, Player, NetworkRole } from '../types';
import { isCardValid } from '../services/gameLogic';
import Card from './Card';
import Chat from './Chat';

interface GameInterfaceProps {
  gameState: GameState;
  myPlayerId: string;
  playerName: string;
  roomCode: string;
  chatMessages: ChatMessage[];
  lastAction: string;
  networkRole: NetworkRole;
  
  // Actions
  onPlayCard: (card: CardModel) => void;
  onDrawCard: () => void;
  onCallUno: () => void;
  onSendMessage: (text: string) => void;
  onWildColorSelect: (color: CardColor) => void;
  onResetGame: () => void;
  
  // Wild State passed from parent to keep sync or handled here
  wildColorSelector: { isOpen: boolean, cardToPlay: CardModel | null };
}

const GameInterface: React.FC<GameInterfaceProps> = ({
  gameState,
  myPlayerId,
  playerName,
  roomCode,
  chatMessages,
  lastAction,
  networkRole,
  onPlayCard,
  onDrawCard,
  onCallUno,
  onSendMessage,
  onWildColorSelect,
  onResetGame,
  wildColorSelector
}) => {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);

  // Helper to handle chat count
  const handleChatOpen = () => {
    setIsChatOpen(!isChatOpen);
    if (!isChatOpen) setUnreadMessages(0);
  };

  // Update unread count when messages come in (if chat closed)
  React.useEffect(() => {
    if (!isChatOpen && chatMessages.length > 0) {
      setUnreadMessages(prev => prev + 1);
    }
  }, [chatMessages, isChatOpen]);

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
                onClick={handleChatOpen}
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
                  <div onClick={isMyTurn ? onDrawCard : undefined} className={`relative w-20 h-28 md:w-28 md:h-40 bg-slate-800 rounded-xl border-4 border-slate-600 flex items-center justify-center shadow-2xl ${isMyTurn ? 'cursor-pointer hover:scale-105 hover:border-blue-400 ring-2 ring-blue-500/50' : ''} transition-all`}>
                      <div className="absolute w-16 h-24 md:w-24 md:h-36 bg-slate-700 rounded-lg border-2 border-slate-500" style={{ transform: 'rotate(-5deg)'}}></div>
                      <div className="absolute w-16 h-24 md:w-24 md:h-36 bg-slate-700 rounded-lg border-2 border-slate-500" style={{ transform: 'rotate(3deg)'}}></div>
                      <div className="z-10 font-black text-2xl md:text-4xl text-slate-600 select-none">UNO</div>
                  </div>
                  <div className="relative w-24 h-32 md:w-32 md:h-44 flex items-center justify-center">
                      {gameState.discardPile.slice(-3).map((card, i) => (
                          <div key={card.id} className="absolute transition-all" style={{ transform: `rotate(${i * 5 - 10}deg) translateY(${i * -2}px)` }}>
                               <Card card={card} size="md" /> 
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
              <Chat messages={chatMessages} onSendMessage={onSendMessage} />
          </div>

          {/* Mobile Chat Overlay */}
          {isChatOpen && (
              <div className="absolute inset-0 z-40 bg-slate-900/95 lg:hidden flex flex-col p-4">
                  <div className="flex justify-between items-center mb-4">
                      <h3 className="font-bold text-lg">Chat</h3>
                      <button onClick={() => setIsChatOpen(false)} className="text-slate-400 text-2xl">✕</button>
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <Chat messages={chatMessages} onSendMessage={onSendMessage} />
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
                      <Card 
                        card={card} 
                        isPlayable={isMyTurn && isCardValid(card, topCard, gameState.currentColor)} 
                        onClick={() => onPlayCard(card)} 
                        disabled={!isMyTurn} 
                        size="md" 
                      />
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
                        <button onClick={onResetGame} className="bg-blue-600 hover:bg-blue-500 px-6 py-3 rounded-full font-bold text-lg transition-transform hover:scale-110 shadow-lg">
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

export default GameInterface;