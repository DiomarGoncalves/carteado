import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

// ⚠️ ATENÇÃO: VOCÊ PRECISA SUBSTITUIR ISSO PELAS SUAS CHAVES DO FIREBASE ⚠️
// 1. Vá em console.firebase.google.com
// 2. Crie um projeto novo
// 3. Adicione um Web App
// 4. Copie a configuração "const firebaseConfig = {...}"
// 5. Vá em "Criação" > "Realtime Database" e crie um banco no modo TESTE (ou configure regras de leitura/escrita true)

const firebaseConfig = {
  // COLE SUAS CHAVES AQUI (Exemplo abaixo, substitua pelo seu real)
  apiKey: "AIzaSy...",
  authDomain: "seu-projeto.firebaseapp.com",
  databaseURL: "https://seu-projeto-default-rtdb.firebaseio.com",
  projectId: "seu-projeto",
  storageBucket: "seu-projeto.appspot.com",
  messagingSenderId: "...",
  appId: "..."
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);