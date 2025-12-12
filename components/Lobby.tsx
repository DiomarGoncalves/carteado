import React from 'react';
import { NetworkRole } from '../types';

interface LobbyProps {
  view: 'MENU' | 'CREATE' | 'JOIN' | 'WAITING_HOST' | 'WAITING_CLIENT';
  playerName: string;
  setPlayerName: (name: string) => void;
  joinCode: string;
  setJoinCode: (code: string) => void;
  roomCode: string;
  connectionStatus: string;
  connectedPeers: {id: string, name: string}[];
  networkRole: NetworkRole;
  
  // Actions
  onCreateRoom: () => void;
  onJoinRoom: () => void;
  onStartGame: (mode: '1v1' | '1v3' | '1v4') => void;
  setView: (view: any) => void;
}

const Lobby: React.FC<LobbyProps> = ({
  view,
  playerName,
  setPlayerName,
  joinCode,
  setJoinCode,
  roomCode,
  connectionStatus,
  connectedPeers,
  networkRole,
  onCreateRoom,
  onJoinRoom,
  onStartGame,
  setView
}) => {

  if (view === 'MENU') {
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
          <button onClick={onCreateRoom} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-xl shadow-lg active:scale-95 transition-transform">Criar Sala (Host)</button>
          <button onClick={() => setView('JOIN')} className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-4 rounded-xl shadow-lg active:scale-95 transition-transform">Entrar na Sala (Código)</button>
        </div>
      </div>
    );
  }

  if (view === 'JOIN') {
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
              <button onClick={onJoinRoom} className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-4 rounded-xl shadow-lg mb-4">Conectar</button>
              <button onClick={() => setView('MENU')} className="w-full text-slate-400 hover:text-white">Voltar</button>
          </div>
       </div>
    );
  }

  if (view === 'WAITING_HOST' || view === 'WAITING_CLIENT') {
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
                      <button onClick={() => onStartGame('1v1')} className="w-full bg-blue-600 hover:bg-blue-500 py-3 rounded-lg font-bold text-sm shadow-lg flex justify-between px-4">
                          <span>Duelo 1v1</span>
                          <span className="text-blue-200">{connectedPeers.length > 1 ? 'Vs Humano' : 'Vs Bot'}</span>
                      </button>
                      <button onClick={() => onStartGame('1v3')} className="w-full bg-blue-600 hover:bg-blue-500 py-3 rounded-lg font-bold text-sm shadow-lg flex justify-between px-4">
                          <span>4 Jogadores</span>
                          <span className="text-blue-200">{connectedPeers.length}/4 Humanos</span>
                      </button>
                      <button onClick={() => onStartGame('1v4')} className="w-full bg-blue-600 hover:bg-blue-500 py-3 rounded-lg font-bold text-sm shadow-lg flex justify-between px-4">
                          <span>5 Jogadores</span>
                          <span className="text-blue-200">{connectedPeers.length}/5 Humanos</span>
                      </button>
                   </div>
               )}
               {networkRole === 'CLIENT' && (
                  <div className="mt-4 text-slate-400 animate-pulse">Aguardando o host iniciar a partida...</div>
               )}
           </div>
       </div>
    );
  }

  return null;
};

export default Lobby;