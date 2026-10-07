// =====================================================================
//  アプリ本体（app.js）
//  画面の切り替え（#/games など）と、ログイン画面・ホーム画面を担当します。
// =====================================================================
import * as store from "./store.js";
import { state } from "./store.js";
import { esc, $, toast, liveGames, thisSeason, tname, pname, filteredGames, activePlayers } from "./ui.js";
import { gameResult, batting, pitching, filterGames, fmtAvg, fmtNum, fmtPct } from "./stats.js";
import { viewGames, viewGameEdit } from "./views/games.js";
import { viewInput } from "./views/input.js";
import { viewGame } from "./views/game.js";
import { viewBatting, viewPitching, viewPlayer } from "./views/statsview.js";
import { viewSettings } from "./views/settings.js";
import { viewAnalysis } from "./views/analysis.js";
import { viewReport, viewGamePrint, viewRanking, viewMembers } from "./views/print.js";

const app = document.getElementById("app");

// ---- 画面の一覧 ----
// live: データが変わったら自動で描き直すか（入力フォームは false）
const routes = [
  { re: /^#?\/?$/, view: viewHome, live: true, nav: "home" },
  { re: /^#\/games$/, view: viewGames, live: true, nav: "games" },
  { re: /^#\/game\/new$/, view: () => viewGameEdit(null), live: false, nav: "games" },
  { re: /^#\/game\/([\w-]+)\/edit$/, view: (id) => viewGameEdit(id), live: false, nav: "games" },
  { re: /^#\/game\/([\w-]+)\/input$/, view: viewInput, live: true, nav: "games", bare: true },
  { re: /^#\/game\/([\w-]+)\/print$/, view: viewGamePrint, live: true, nav: "games" },
  { re: /^#\/game\/([\w-]+)\/members$/, view: viewMembers, live: true, nav: "games" },
  { re: /^#\/game\/([\w-]+)$/, view: viewGame, live: true, nav: "games" },
  { re: /^#\/report$/, view: viewReport, live: true, nav: "report" },
  { re: /^#\/ranking$/, view: viewRanking, live: true, nav: "ranking" },
  { re: /^#\/analysis(?:\/([\w/-]+))?$/, view: viewAnalysis, live: true, nav: "analysis" },
  { re: /^#\/batting$/, view: viewBatting, live: true, nav: "batting" },
  { re: /^#\/pitching$/, view: viewPitching, live: true, nav: "pitching" },
  { re: /^#\/player\/([\w-]+)$/, view: viewPlayer, live: true, nav: "batting" },
  { re: /^#\/settings$/, view: viewSettings, live: true, nav: "settings" },
];

let lastHash = null, rafId = 0;
function schedule(force) {
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(() => render(force));
}
window.addEventListener("hashchange", () => { document.querySelector(".sheet-back")?.remove(); schedule(true); });
store.onChange(() => schedule(false));

function render(force) {
  const hash = location.hash || "#/";
  const changed = hash !== lastHash;
  if (!state.authChecked) return shell(`<div class="empty">読み込み中…</div>`);
  if (state.error && !state.user) return shell(`<div class="alert err">${esc(state.error)}</div>`);
  if (!state.user) { lastHash = null; return shell(loginView(), { nonav: true, after: bindLogin }); }
  if (!state.user.verified) return shell(verifyView(), { nonav: true, after: bindVerify });
  if (!state.ready) return shell(`<div class="empty">データを読み込み中…</div>`);
  if (!state.role) return shell(noAccessView(), { nonav: true, after: bindNoAccess });

  const r = routes.find((x) => x.re.test(hash)) || routes[0];
  if (!changed && !force && !r.live) { renderTop(r); return; }
  lastHash = hash;
  const m = hash.match(r.re);
  const out = r.view(m?.[1]);
  shell(out.html, { nav: r.nav, bare: r.bare, after: out.after, keepScroll: !changed });
}

// ---- 外枠（上部バー・メニュー） ----
function shell(html, opt = {}) {
  const y = window.scrollY;
  app.innerHTML = `${topbar()}${opt.nonav || opt.bare ? "" : navbar(opt.nav)}
    <main>${state.error && state.user ? `<div class="alert err noprint" style="margin-bottom:12px">${esc(state.error)} <button class="btn sm" id="errx">閉じる</button></div>` : ""}${html}</main>`;
  $("#errx")?.addEventListener("click", () => { state.error = null; schedule(true); });
  $("#logout")?.addEventListener("click", async () => {
    if (state.pendingWrites) { alert("まだ送信中の記録があります。電波のある所で「送信中…」が消えてから、ログアウトしてください。"); return; }
    if (confirm("ログアウトしますか？")) await store.signOut();
  });
  opt.after?.(app);
  if (opt.keepScroll) window.scrollTo(0, y);
}
function renderTop() {
  const n = document.querySelector(".topbar .net-wrap");
  if (n) n.innerHTML = netBadge();
}
function netBadge() {
  if (store.isDemo) return `<span class="net warn">お試しモード</span>`;
  if (!state.online) return `<span class="net warn">圏外：端末に保存中</span>`;
  if (state.pendingWrites) return `<span class="net">送信中…</span>`;
  return "";
}
function topbar() {
  const name = state.settings?.teamName || "野球部";
  return `<header class="topbar"><a href="#/" class="brand" style="color:inherit;text-decoration:none">⚾ ${esc(name)}<small>成績管理</small></a>
    <span class="sp"></span><span class="net-wrap">${netBadge()}</span>
    ${state.user ? `<button class="btn sm" id="logout" style="background:transparent;color:inherit;border-color:rgb(255 255 255 / .3)">ログアウト</button>` : ""}</header>`;
}
function navbar(cur) {
  const items = [["home", "#/", "ホーム"], ["games", "#/games", "試合"], ["batting", "#/batting", "打者成績"], ["pitching", "#/pitching", "投手成績"], ["ranking", "#/ranking", "ランキング"], ["analysis", "#/analysis", "分析"], ["report", "#/report", "印刷"], ["settings", "#/settings", "設定"]];
  return `<nav class="nav noprint">${items.map(([k, h, l]) => `<a href="${h}" class="${cur === k ? "on" : ""}">${l}</a>`).join("")}</nav>`;
}

// ---- ログイン ----
function loginView() {
  return `<div class="stack" style="max-width:420px;margin:24px auto">
    <h1>ログイン</h1>
    <p class="muted">登録された先生・スタッフだけが使えます。</p>
    <button class="btn primary big block" id="g">Googleでログイン</button>
    <div class="card stack">
      <strong>メールアドレスでログイン</strong>
      <p class="muted small" style="margin:0">iPhoneの「ホーム画面に追加」から開いたアプリでは、こちらがおすすめです。</p>
      <label class="f">メールアドレス<input type="email" id="em" autocomplete="username"></label>
      <label class="f">パスワード（6文字以上）<input type="password" id="pw" autocomplete="current-password"></label>
      <div class="row"><button class="btn primary grow" id="li">ログイン</button><button class="btn grow" id="su">新しく登録</button></div>
      <button class="btn sm" id="rp" style="justify-self:start">パスワードを忘れた</button>
    </div>
  </div>`;
}
function authMsg(e) {
  const m = {
    "auth/invalid-credential": "メールアドレスかパスワードが違います。",
    "auth/wrong-password": "パスワードが違います。",
    "auth/user-not-found": "このメールアドレスは登録されていません。「新しく登録」を押してください。",
    "auth/email-already-in-use": "このメールアドレスは登録済みです。「ログイン」を押してください。",
    "auth/weak-password": "パスワードは6文字以上にしてください。",
    "auth/invalid-email": "メールアドレスの形が正しくありません。",
    "auth/operation-not-allowed": "メールでのログインがまだ有効になっていません。管理者がFirebaseで「メール/パスワード」を有効にしてください。",
    "auth/popup-closed-by-user": "ログインが中断されました。",
    "auth/network-request-failed": "通信できませんでした。電波の良い場所でもう一度お試しください。",
    "auth/unauthorized-domain": "このアドレスはFirebaseで許可されていません（承認済みドメインを確認してください）。",
  };
  return m[e.code] || "ログインできませんでした：" + (e.message || e);
}
function bindLogin(root) {
  const em = () => $("#em", root).value, pw = () => $("#pw", root).value;
  const run = (fn) => async () => { try { await fn(); } catch (e) { alert(authMsg(e)); } };
  $("#g", root).onclick = run(() => store.signInGoogle());
  $("#li", root).onclick = run(() => store.signInEmail(em(), pw()));
  $("#su", root).onclick = run(async () => { await store.signUpEmail(em(), pw()); alert("確認メールを送りました。メールのリンクを押してから、この画面に戻ってください。"); });
  $("#rp", root).onclick = run(async () => { if (!em()) return alert("先にメールアドレスを入力してください。"); await store.resetPassword(em()); alert("パスワード再設定のメールを送りました。"); });
}
function verifyView() {
  return `<div class="stack" style="max-width:460px;margin:24px auto"><h1>メールの確認をしてください</h1>
    <p>${esc(state.user.email)} に確認メールを送りました。メールの中のリンクを押してから、下のボタンを押してください。</p>
    <button class="btn primary big" id="vr">確認したので進む</button>
    <button class="btn" id="vs">確認メールをもう一度送る</button>
    <button class="btn" id="vo">別のアカウントでログイン</button></div>`;
}
function bindVerify(root) {
  $("#vr", root).onclick = async () => { await store.reloadUser(); if (!state.user.verified) alert("まだ確認が済んでいません。メールのリンクを押してください。"); };
  $("#vs", root).onclick = async () => { await store.resendVerification(); toast("送りました"); };
  $("#vo", root).onclick = () => store.signOut();
}
function noAccessView() {
  return `<div class="stack" style="max-width:460px;margin:24px auto"><h1>まだ使う許可がありません</h1>
    <p>このアカウントは登録されていません。管理者（先生）に、次のメールアドレスを「設定 → 使える人」に追加してもらってください。</p>
    <div class="card"><strong style="font-size:18px">${esc(state.user.email)}</strong></div>
    <button class="btn" id="na">ログアウト</button></div>`;
}
function bindNoAccess(root) { $("#na", root).onclick = () => store.signOut(); }

// ---- ホーム ----
function viewHome() {
  const season = thisSeason();
  const gs = filterGames(liveGames(), { season }).sort((a, b) => (b.no ?? 0) - (a.no ?? 0));
  const live = gs.filter((g) => g.status !== "final");
  const team = batting(gs, null, state.settings);
  let w = 0, l = 0, d = 0;
  gs.filter((g) => g.status === "final").forEach((g) => { const r = gameResult(g).wl; r === "勝" ? w++ : r === "負" ? l++ : d++; });
  // 投手（チーム全体）
  let pit = { bf: 0, h: 0, ab: 0, k: 0, fpS: 0, fpN: 0 };
  const pitchers = new Set(gs.flatMap((g) => (g.log || []).filter((i) => i.side === "def" && i.pitcher).map((i) => i.pitcher)));
  const plines = [...pitchers].map((pid) => ({ pid, ...pitching(gs, pid, state.settings) }));
  plines.forEach((p) => { pit.bf += p.bf; pit.h += p.h; pit.ab += p.ab; pit.k += p.k; pit.fpS += p.fpS; pit.fpN += p.fpN; });
  // 打撃の上位3人（打率は規定打席：試合数×2 以上）
  const pls = activePlayers().map((p) => ({ p, b: batting(gs, p.id, state.settings) })).filter((x) => x.b.pa > 0);
  const qual = Math.max(1, gs.length * 2);
  const top = (arr, key, fmt) => arr.slice().sort((a, b) => (b.b[key] ?? -1) - (a.b[key] ?? -1)).slice(0, 3)
    .map((x, i) => `<div class="row"><span class="muted">${i + 1}</span><a class="grow" href="#/player/${x.p.id}">${esc(x.p.name)}</a><strong>${fmt(x.b[key])}</strong></div>`).join("") || `<div class="muted small">記録なし</div>`;
  const recent = gs.slice(0, 5);
  const html = `
    <div class="row" style="justify-content:space-between"><h1>${season}年度</h1>
      <a class="btn primary big" href="#/game/new">＋ 試合を始める</a></div>
    ${live.map((g) => `<a class="card row" href="#/game/${g.id}/input" style="text-decoration:none;color:inherit;border-color:var(--strike)">
        <span class="chip live">入力中</span><span class="grow">第${g.no}試合 vs ${esc(g.opponent)}</span><strong>入力を続ける ›</strong></a>`).join("")}
    <div class="tiles" style="margin-top:12px">
      <div class="tile"><div class="k">成績</div><div class="v">${w}勝${l}敗${d ? d + "分" : ""}</div></div>
      <div class="tile"><div class="k">チーム打率</div><div class="v">${fmtAvg(team.avg)}</div></div>
      <div class="tile"><div class="k">チームOPS</div><div class="v">${fmtAvg(team.ops)}</div></div>
      <div class="tile"><div class="k">被打率</div><div class="v">${fmtAvg(pit.ab ? pit.h / pit.ab : null)}</div></div>
      <div class="tile"><div class="k">初球ストライク率</div><div class="v">${fmtPct(pit.fpN ? pit.fpS / pit.fpN : null)}</div></div>
    </div>
    <h2>最近の試合</h2>
    <div class="gamelist">${recent.map(gameCard).join("") || `<div class="card empty">まだ試合がありません。「試合を始める」から記録しましょう。</div>`}</div>
    ${gs.length > 5 ? `<p><a href="#/games">すべての試合を見る ›</a></p>` : ""}
    <h2>チーム内ランキング（上位3人）</h2>
    <div class="grid2">
      <div class="card stack"><strong>打率 <span class="muted small">（${qual}打席以上）</span></strong>${top(pls.filter((x) => x.b.pa >= qual), "avg", fmtAvg)}</div>
      <div class="card stack"><strong>打点</strong>${top(pls, "rbi", (v) => v)}</div>
      <div class="card stack"><strong>OPS <span class="muted small">（${qual}打席以上）</span></strong>${top(pls.filter((x) => x.b.pa >= qual), "ops", fmtAvg)}</div>
      <div class="card stack"><strong>盗塁</strong>${top(pls, "sb", (v) => v)}</div>
    </div>`;
  return { html };
}
export function gameCard(g) {
  const r = gameResult(g);
  const fin = g.status === "final";
  return `<a class="card gameitem" href="#/game/${g.id}">
    <span class="gameno">${g.no ?? "-"}</span>
    <span style="min-width:0"><strong>vs ${esc(g.opponent || "")}</strong><br><span class="muted small">${esc(g.date || "")}・${esc(tname(g.tournamentId))}</span></span>
    <span style="text-align:right"><span class="score">${r.us}-${r.them}</span><br>${fin ? `<span class="chip ${r.wl === "勝" ? "win" : r.wl === "負" ? "lose" : ""}">${r.wl}</span>` : `<span class="chip live">入力中</span>`}</span></a>`;
}

// ---- 新しい版のお知らせ ----
// アプリを更新したら version.json の数字を変えます。開いたままの端末にも
// 「新しい版があります」と出して、読み込み直してもらいます（古い版のまま入力し続けないように）。
const APP_VERSION = "2026.10.06-2";
async function checkVersion() {
  if (store.isDemo || location.protocol !== "https:") return;
  try {
    const r = await fetch("./version.json?t=" + Date.now(), { cache: "no-store" });
    const v = (await r.json()).version;
    if (v && v !== APP_VERSION) showUpdateBar();
  } catch {}
}
function showUpdateBar() {
  if (document.getElementById("updbar")) return;
  const el = document.createElement("div");
  el.id = "updbar"; el.className = "updbar noprint";
  el.innerHTML = `<span>アプリの新しい版があります。読み込み直してください。</span><button class="btn sm" id="updgo">読み込み直す</button>`;
  document.body.append(el);
  el.querySelector("#updgo").onclick = () => {
    if (state.pendingWrites) { alert("まだ送信中の記録があります。画面上の「送信中…」が消えてから、もう一度押してください。"); return; }
    location.reload();
  };
}
setInterval(checkVersion, 3 * 60 * 1000);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") checkVersion(); });

// ---- 起動 ----
store.start();
checkVersion();
if ("serviceWorker" in navigator && !store.isDemo && location.protocol === "https:") {
  navigator.serviceWorker.register("./sw.js").catch((e) => console.warn("SW", e));
}
