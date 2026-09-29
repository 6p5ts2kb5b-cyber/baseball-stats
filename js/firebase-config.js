// Firebase の接続設定（アプリの「住所」です。パスワードではありません）
// データはFirestoreのセキュリティルール（firestore.rules）で守ります。
export const firebaseConfig = {
  apiKey: "AIzaSyCbAeQbhr-UuxRRIrT58ceuWPXhkLGm29s",
  authDomain: "baseball-stats-cf358.firebaseapp.com",
  projectId: "baseball-stats-cf358",
  storageBucket: "baseball-stats-cf358.firebasestorage.app",
  messagingSenderId: "903075386435",
  appId: "1:903075386435:web:115d3af12049e08b5970f6",
};

// 最初の管理者（このアプリの持ち主）。firestore.rules にも同じアドレスを書いています。
export const OWNER_EMAIL = "barkatthesun2002@gmail.com";

// Firebase の部品のバージョン（更新するときはここだけ変えます）
export const FIREBASE_VERSION = "12.19.0";
