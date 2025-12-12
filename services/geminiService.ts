import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.API_KEY || ''; // Ensure this is available
let ai: GoogleGenAI | null = null;

if (apiKey) {
  ai = new GoogleGenAI({ apiKey });
}

export const generateBotChat = async (
  botName: string,
  event: 'play_wild4' | 'play_skip' | 'uno' | 'win' | 'lose' | 'greeting',
  gameStateDescription: string
): Promise<string> => {
  if (!ai) {
    // Fallback if no API key
    const fallbacks = [
      "Esperem por mim...",
      "Vou ganhar essa!",
      "Bom jogo pessoal.",
      "Olha esse movimento!",
      "Uno!",
      "Toma essa!",
      "Não acredito...",
    ];
    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }

  try {
    const prompt = `
      Você está jogando um jogo de cartas estilo Uno. 
      Sua persona é ${botName}, um jogador de IA competitivo mas divertido.
      
      Evento Atual: ${event}.
      Contexto do Jogo: ${gameStateDescription}.
      
      Escreva uma mensagem de chat MUITO CURTA (máx 10 palavras) em PORTUGUÊS (Brasil) reagindo a isso. 
      Use emojis. Seja sarcástico se estiver ganhando, triste se estiver perdendo.
      Exemplos: "Toma esse +4! 😂", "Ah não, pulei de novo? 😭", "UNO! Peguem-me se puderem 🚀"
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    return response.text.trim();
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Vamos lá!";
  }
};