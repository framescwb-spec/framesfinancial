// ════════════════════════════════════════════════════
// COLE AQUI SUAS CREDENCIAIS DO FIREBASE
// Firebase Console → Configurações → Seus apps → </>
// ════════════════════════════════════════════════════
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "COLE_AQUI_SUA_API_KEY",
  authDomain: "COLE_AQUI.firebaseapp.com",
  projectId: "COLE_AQUI_SEU_PROJECT_ID",
  storageBucket: "COLE_AQUI.appspot.com",
  messagingSenderId: "COLE_AQUI",
  appId: "COLE_AQUI_SEU_APP_ID",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
