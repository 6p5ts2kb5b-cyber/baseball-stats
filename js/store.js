// =====================================================================
//  データ保存（store.js）
//  Firebase（Firestore）への保存・読み込み・ログインをまとめたファイルです。
//  画面側はこのファイルの関数だけを使います。
//  ?demo を付けて開くと、Firebaseを使わない「お試しモード」になります。
// =====================================================================
import { firebaseConfig, OWNER_EMAIL, FIREBASE_VERSION } from "./firebase-config.js";
import { mergeSettings } from "./stats.js";

const DEMO = new URLSearchParams(location.search).has("demo");
const CDN = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;

const listeners = new Set();
export const state = {
  ready: false,       // 最初のデータが届いたか
  mode: DEMO ? "demo" : "firebase",
  user: null,         // { email, name, uid }
  authChecked: false,
  role: null,         // "admin" | "scorer" | "viewer" | null(権限なし)
  settings: mergeSettings(null),
  players: [],
  games: [],
  members: [],
  online: navigator.onLine,
  pendingWrites: false,
  error: null,
};
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { for (const fn of listeners) try { fn(state); } catch (e) { console.error(e); } }

window.addEventListener("online", () => { state.online = true; emit(); });
window.addEventListener("offline", () => { state.online = false; emit(); });

export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clean = (o) => JSON.parse(JSON.stringify(o)); // undefined を取り除く

let fb = null; // Firebase の部品

// ---------------------------------------------------------------------
//  起動
// ---------------------------------------------------------------------
export async function start() {
  if (DEMO) return startDemo();
  try {
    const [appMod, authMod, fsMod] = await Promise.all([
      import(`${CDN}/firebase-app.js`),
      import(`${CDN}/firebase-auth.js`),
      import(`${CDN}/firebase-firestore.js`),
    ]);
    const app = appMod.initializeApp(firebaseConfig);
    const auth = authMod.getAuth(app);
    let db;
    try {
      // 端末内に保存（電波が切れても入力を続けられる）
      db = fsMod.initializeFirestore(app, {
        localCache: fsMod.persistentLocalCache({ tabManager: fsMod.persistentMultipleTabManager() }),
      });
    } catch (e) {
      console.warn("オフライン保存を使えません", e);
      db = fsMod.getFirestore(app);
    }
    fb = { app, auth, db, ...authMod, ...fsMod };
    authMod.onAuthStateChanged(auth, (u) => {
      state.authChecked = true;
      stopSubs();
      if (!u) { state.user = null; state.role = null; state.ready = false; emit(); return; }
      state.user = { uid: u.uid, email: (u.email || "").toLowerCase(), name: u.displayName || u.email, verified: u.emailVerified };
      emit();
      subscribe();
    });
  } catch (e) {
    console.error(e);
    state.error = "アプリの部品を読み込めませんでした。電波の良い場所で開き直してください。";
    state.authChecked = true;
    emit();
  }
}

// ---------------------------------------------------------------------
//  ログイン
// ---------------------------------------------------------------------
export async function signInGoogle() {
  const p = new fb.GoogleAuthProvider();
  p.setCustomParameters({ prompt: "select_account" });
  try {
    await fb.signInWithPopup(fb.auth, p);
  } catch (e) {
    if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") {
      await fb.signInWithRedirect(fb.auth, p);
    } else throw e;
  }
}
export async function signInEmail(email, pass) {
  await fb.signInWithEmailAndPassword(fb.auth, email.trim(), pass);
}
export async function signUpEmail(email, pass) {
  const cred = await fb.createUserWithEmailAndPassword(fb.auth, email.trim(), pass);
  await fb.sendEmailVerification(cred.user);
}
export async function resendVerification() {
  if (fb?.auth.currentUser) await fb.sendEmailVerification(fb.auth.currentUser);
}
export async function reloadUser() {
  if (!fb?.auth.currentUser) return;
  await fb.auth.currentUser.reload();
  await fb.auth.currentUser.getIdToken(true);
  const u = fb.auth.currentUser;
  state.user = { uid: u.uid, email: (u.email || "").toLowerCase(), name: u.displayName || u.email, verified: u.emailVerified };
  stopSubs(); subscribe(); emit();
}
export async function resetPassword(email) { await fb.sendPasswordResetEmail(fb.auth, email.trim()); }
export async function signOut() {
  if (DEMO) { location.href = location.pathname; return; }
  await fb.signOut(fb.auth);
}

// ---------------------------------------------------------------------
//  データの購読（変更があると自動で画面に反映）
// ---------------------------------------------------------------------
let subs = [];
function stopSubs() { subs.forEach((u) => u()); subs = []; }

function subscribe() {
  const { db, collection, doc, onSnapshot } = fb;
  const email = state.user.email;
  const got = { settings: false, players: false, games: false, me: false };
  const markReady = (k) => { got[k] = true; if (Object.values(got).every(Boolean)) state.ready = true; };
  const onErr = (k) => (e) => {
    console.warn(k, e);
    if (e.code === "permission-denied") { state.role = null; state.ready = true; emit(); }
  };

  // 自分の権限
  subs.push(onSnapshot(doc(db, "members", email), (s) => {
    const owner = email === OWNER_EMAIL.toLowerCase();
    state.role = owner ? "admin" : s.exists() ? s.data().role : null;
    markReady("me"); emit();
  }, (e) => { state.role = email === OWNER_EMAIL.toLowerCase() ? "admin" : null; markReady("me"); onErr("me")(e); }));

  subs.push(onSnapshot(doc(db, "settings", "main"), (s) => {
    state.settings = mergeSettings(s.exists() ? s.data() : null);
    markReady("settings"); emit();
  }, onErr("settings")));

  subs.push(onSnapshot(collection(db, "players"), (qs) => {
    state.players = qs.docs.map((d) => ({ id: d.id, ...d.data() }));
    markReady("players"); emit();
  }, onErr("players")));

  subs.push(onSnapshot(collection(db, "games"), { includeMetadataChanges: true }, (qs) => {
    state.games = qs.docs.map((d) => ({ id: d.id, ...d.data() }));
    state.pendingWrites = qs.metadata.hasPendingWrites;
    markReady("games"); emit();
  }, onErr("games")));

  subs.push(onSnapshot(collection(db, "members"), (qs) => {
    state.members = qs.docs.map((d) => ({ email: d.id, ...d.data() }));
    emit();
  }, () => {}));
}

// ---------------------------------------------------------------------
//  書き込み
//  ※ 電波がなくても端末内に保存され、つながったときに自動で送られます。
//    そのため完了を待たずに画面を進めます（待つと圏外で止まってしまうため）。
// ---------------------------------------------------------------------
function stamp(o) {
  return { ...o, updatedAt: new Date().toISOString(), updatedBy: state.user?.email || "" };
}
function report(p) {
  p.catch((e) => {
    console.error(e);
    state.error = e.code === "permission-denied"
      ? "保存する権限がありません。管理者に権限を付けてもらってください。"
      : "保存に失敗しました：" + (e.message || e);
    emit();
  });
}

export function savePlayer(p) {
  const id = p.id || newId();
  const data = clean(stamp({ ...p, id: undefined }));
  if (DEMO) return demoSet("players", id, data);
  report(fb.setDoc(fb.doc(fb.db, "players", id), data));
  return id;
}

export function saveGame(g) {
  const id = g.id || newId();
  const data = clean(stamp({ ...g, id: undefined }));
  if (DEMO) return demoSet("games", id, data);
  report(fb.setDoc(fb.doc(fb.db, "games", id), data));
  return id;
}

// 試合の一部だけ更新（1球ごとの入力など）
export function patchGame(id, patch) {
  const data = clean(stamp(patch));
  if (DEMO) return demoPatch("games", id, data);
  report(fb.setDoc(fb.doc(fb.db, "games", id), data, { merge: true }));
}

export function saveSettings(s) {
  const data = clean(stamp(s));
  if (DEMO) { state.settings = mergeSettings(data); emit(); return; }
  report(fb.setDoc(fb.doc(fb.db, "settings", "main"), data));
}

export function setMember(email, role, name = "") {
  email = email.trim().toLowerCase();
  if (DEMO) { state.members = [...state.members.filter((m) => m.email !== email), { email, role, name }]; emit(); return; }
  report(fb.setDoc(fb.doc(fb.db, "members", email), stamp({ role, name })));
}
export function removeMember(email) {
  if (DEMO) { state.members = state.members.filter((m) => m.email !== email); emit(); return; }
  report(fb.deleteDoc(fb.doc(fb.db, "members", email)));
}

// 完全削除（ゴミ箱から消すときだけ使う）
export function hardDeleteGame(id) {
  if (DEMO) { state.games = state.games.filter((g) => g.id !== id); emit(); return; }
  report(fb.deleteDoc(fb.doc(fb.db, "games", id)));
}

// ---------------------------------------------------------------------
//  バックアップ（全データを1つのファイルに）と復元
// ---------------------------------------------------------------------
export function exportAll() {
  return {
    app: "baseball-stats", version: 1, exportedAt: new Date().toISOString(),
    settings: state.settings, players: state.players, games: state.games, members: state.members,
  };
}
export async function importAll(data) {
  if (!data || data.app !== "baseball-stats") throw new Error("このアプリのバックアップファイルではありません");
  saveSettings(data.settings || {});
  for (const p of data.players || []) savePlayer(p);
  for (const g of data.games || []) saveGame(g);
}

// ---------------------------------------------------------------------
//  お試しモード（?demo）：Firebaseを使わず、見本データで動きます
// ---------------------------------------------------------------------
function demoSet(col, id, data) {
  const arr = state[col].filter((x) => x.id !== id);
  arr.push({ id, ...data });
  state[col] = arr; emit(); return id;
}
function demoPatch(col, id, data) {
  state[col] = state[col].map((x) => (x.id === id ? { ...x, ...data } : x)); emit();
}
async function startDemo() {
  const { demoData } = await import("./demo-data.js");
  const d = demoData();
  state.user = { email: "demo@example.com", name: "お試し", uid: "demo", verified: true };
  state.role = "admin";
  state.players = d.players; state.games = d.games;
  state.settings = mergeSettings(null);
  state.authChecked = true; state.ready = true;
  emit();
}
export const isDemo = DEMO;
