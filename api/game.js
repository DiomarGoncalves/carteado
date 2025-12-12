import { kv } from '@vercel/kv';

export default async function handler(request, response) {
  try {
    const { method } = request;
    const { roomCode } = request.query;

    if (!roomCode) {
      return response.status(400).json({ error: 'Room code required' });
    }

    const key = `room:${roomCode}`;

    // --- GET: Ler o estado da sala ---
    if (method === 'GET') {
      const data = await kv.get(key);
      return response.status(200).json(data || { status: 'NOT_FOUND' });
    }

    // --- POST: Atualizar estado ou Enviar Ação ---
    if (method === 'POST') {
      const body = request.body;
      
      // Se for o HOST atualizando o estado completo do jogo
      if (body.type === 'UPDATE_STATE') {
        // Salva o estado e limpa ações pendentes antigas se necessário
        // Expira em 2 horas (7200 segundos) para não sujar a memória
        await kv.set(key, { ...body.payload, lastUpdated: Date.now() }, { ex: 7200 });
        return response.status(200).json({ success: true });
      }

      // Se for um CLIENT enviando uma ação (jogar carta, entrar, chat)
      if (body.type === 'SEND_ACTION') {
        const currentData = await kv.get(key);
        
        if (!currentData) {
           return response.status(404).json({ error: 'Room not found' });
        }

        // Adiciona a ação numa fila dentro do objeto do jogo
        const pendingActions = currentData.pendingActions || [];
        pendingActions.push({ ...body.payload, timestamp: Date.now() });
        
        // Salva de volta mantendo o estado atual, apenas adicionando a ação
        await kv.set(key, { ...currentData, pendingActions }, { ex: 7200 });
        
        return response.status(200).json({ success: true });
      }
    }

    return response.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error(error);
    return response.status(500).json({ error: 'Internal Server Error' });
  }
}