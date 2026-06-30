import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
 
const firebaseConfig = {
  apiKey: "AIzaSyClpflkp4vwKG4TUwgnaCAF-z3YqXa-4s8",
  authDomain: "frames-system.firebaseapp.com",
  projectId: "frames-system",
  storageBucket: "frames-system.firebasestorage.app",
  messagingSenderId: "488046203697",
  appId: "1:488046203697:web:2f3ddda7b333d96c6c5610",
};
 
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
 