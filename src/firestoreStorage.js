import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebase.js";

const DOC_REF = doc(db, "produtora", "framesbr");

export async function loadFromFirestore() {
  const snap = await getDoc(DOC_REF);
  if (snap.exists()) return snap.data();
  return null;
}

export async function saveToFirestore(data) {
  await setDoc(DOC_REF, data, { merge: false });
}
