import React, { useEffect, useRef } from 'react';
import { ChatMessage } from '../types';

interface ChatProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
}

const Chat: React.FC<ChatProps> = ({ messages, onSendMessage }) => {
  const [input, setInput] = React.useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      onSendMessage(input);
      setInput('');
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-800/90 backdrop-blur-sm rounded-xl overflow-hidden border border-slate-700">
      <div className="p-3 bg-slate-900 border-b border-slate-700 font-bold text-sm">
        💬 Chat Ao Vivo
      </div>
      
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex flex-col ${msg.isSystem ? 'items-center' : 'items-start'}`}>
             {msg.isSystem ? (
                <span className="text-[10px] uppercase tracking-wider text-yellow-500 font-bold px-2 py-1 bg-yellow-500/10 rounded-full mb-1 text-center">
                  {msg.text}
                </span>
             ) : (
               <div className="bg-slate-700/50 p-2 rounded-lg max-w-[90%]">
                 <div className="flex items-baseline gap-2 mb-0.5">
                   <span className="text-xs font-bold text-blue-300">{msg.senderName}</span>
                   <span className="text-[10px] text-slate-500">{new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                 </div>
                 <p className="text-sm text-slate-200">{msg.text}</p>
               </div>
             )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="p-2 bg-slate-900 border-t border-slate-700">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Digite uma mensagem..."
          className="w-full bg-slate-800 text-sm text-white px-3 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </form>
    </div>
  );
};

export default Chat;