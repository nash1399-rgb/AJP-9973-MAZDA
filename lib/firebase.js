import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  piKey: "AIzaSyAca0nmp4FyVnJUnmvp-Sl27DKCl7tdx7I",
  authDomain: "ajp-9973-mazda.firebaseapp.com",
  projectId: "ajp-9973-mazda",
  storageBucket: "ajp-9973-mazda.firebasestorage.app",
  messagingSenderId: "623753233138",
  appId: "1:623753233138:web:ec75f93adebe7e5ef4866b",
  measurementId: "G-K7Z0JHWVG5"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
