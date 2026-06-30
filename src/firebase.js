// ════════════════════════════════════════════════════
// COLE AQUI SUAS CREDENCIAIS DO FIREBASE
// Firebase Console → Configurações → Seus apps → </>
// ════════════════════════════════════════════════════
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCLpFlkp4vwKG4TUwqnaCAF-z3YqXa-4s8",
  authDomain: "frames-system.firebaseapp.com",
  projectId: "frames-system",
  storageBucket: "frames-system.firebasestorage.app",
  messagingSenderId: "488046203697",
  appId: "1:488046203697:web:2f3ddda7b333d96c6c5610"
};

baseConfig);
export const db = getFirestore(app);
