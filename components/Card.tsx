import React from 'react';
import { Card as CardType } from '../types';

interface CardProps {
  card: CardType;
  onClick?: () => void;
  disabled?: boolean;
  isPlayable?: boolean;
  size?: 'sm' | 'md' | 'lg';
  hidden?: boolean;
}

const Card: React.FC<CardProps> = ({ 
  card, 
  onClick, 
  disabled = false, 
  isPlayable = false, 
  size = 'md',
  hidden = false
}) => {
  const baseClasses = "relative rounded-lg shadow-md border-2 select-none transition-transform duration-200 flex flex-col items-center justify-center font-bold font-mono";
  
  const sizeClasses = {
    sm: "w-12 h-16 text-xs border-2",
    md: "w-20 h-28 text-xl border-4",
    lg: "w-24 h-36 text-2xl border-4",
  };

  const colorClasses: Record<string, string> = {
    red: "bg-red-500 border-white text-white",
    blue: "bg-blue-500 border-white text-white",
    green: "bg-green-500 border-white text-white",
    yellow: "bg-yellow-400 border-white text-black",
    black: "bg-gray-900 border-white text-white bg-[conic-gradient(at_top_right,_var(--tw-gradient-stops))] from-red-500 via-yellow-400 to-blue-500", // Wild effect
  };

  const getCardContent = () => {
    if (hidden) return <div className="w-8 h-8 rounded-full bg-red-600 border-2 border-white opacity-80" />;

    switch (card.type) {
      case 'number': return <span className="drop-shadow-md">{card.value}</span>;
      case 'skip': return <span className="text-3xl">🚫</span>;
      case 'reverse': return <span className="text-3xl">🔁</span>;
      case 'draw2': return <span className="text-lg">+2</span>;
      case 'wild': return <span className="text-sm">COR</span>;
      case 'wild4': return <span className="text-sm text-center leading-tight">+4<br/>COR</span>;
      default: return null;
    }
  };

  const hoverClass = (!disabled && onClick && !hidden) ? "hover:-translate-y-4 hover:z-50 cursor-pointer hover:shadow-xl" : "";
  const playableClass = isPlayable ? "ring-4 ring-white ring-opacity-50 animate-pulse" : "";
  const bgClass = hidden ? "bg-slate-800 border-slate-600" : colorClasses[card.color];

  return (
    <div 
      onClick={!disabled ? onClick : undefined}
      className={`${baseClasses} ${sizeClasses[size]} ${bgClass} ${hoverClass} ${playableClass} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      {/* Small corner indicators */}
      {!hidden && (
        <>
          <div className="absolute top-1 left-1 text-[0.6rem] leading-none opacity-80">
            {card.type === 'number' ? card.value : (card.type === 'wild' || card.type === 'wild4' ? 'W' : card.type[0].toUpperCase())}
          </div>
          <div className="absolute bottom-1 right-1 text-[0.6rem] leading-none opacity-80 rotate-180">
             {card.type === 'number' ? card.value : (card.type === 'wild' || card.type === 'wild4' ? 'W' : card.type[0].toUpperCase())}
          </div>
        </>
      )}
      
      {getCardContent()}
    </div>
  );
};

export default Card;