// =====================================================================
//  1球入力画面（views/input.js）… 試合中にiPhoneで使う画面
//  1球 = 1タップ。四球・三振・死球は自動で打席が終わります。
// =====================================================================
import * as store from "../store.js";
import { state, newId } from "../store.js";
import { esc, $, $$, toast, sheet, closeSheet, player, activePlayers, numberOf, HAND, oppPlayers, thisSeason } from "../ui.js";
import { gameState, liveCount, autoResult, advance, R, RESULTS, DIRS, DIRNAME, fieldMap } from "../stats.js";
import { itemText } from "./game.js";

const PBTN = [["B", "ボール"], ["S", "見逃し"], ["K", "空振り"], ["F", "ファウル"], ["X", "打った！"], ["D", "死球"]];
const INPLAY = ["1B", "2B", "3B", "HR", "GO", "FO", "LO", "DP", "E", "FC", "SAC", "SF", "ADV", "K"];
// 「打った！」のあとの結果を選ぶキー
const RKEY = { "1B": "1", "2B": "2", "3B": "3", HR: "4", GO: "G", FO: "F", LO: "L", DP: "P", E: "E", FC: "C", SAC: "B", SF: "Y", ADV: "A", K: "K" };
let sheetKeys = null; // 開いている選択画面のキー操作
const EV = {
  sb: "盗塁", cs: "盗塁死", po: "牽制アウト", run: "走者生還", out: "アウト",
  e: "失策", wp: "暴投", pb: "捕逸",
};

// 打者の打席の左右（両打ちは投手の逆）
const handOf = (p, ph) => (p?.bats === "S" ? (ph === "R" ? "L" : "R") : p?.bats === "L" ? "L" : "R");
// 偵察試合（相手どうし）：先攻＝off（lineup・pitcher）、後攻＝def（oppLineup・oppPitcherId）
const teamOf = (g, side) => (g.scout ? (side === "off" ? g.top : g.bottom) : side === "off" ? null : g.opponent);
const fieldTeamOf = (g, side) => (g.scout ? (side === "off" ? g.bottom : g.top) : side === "off" ? g.opponent : null);
const pno = (p) => (numberOf(p) !== "" ? "#" + esc(numberOf(p)) + " " : "");

function ctx(g) {
  const st = gameState(g);
  const side = st.side;
  const sc = !!g.scout;
  const cur = g.cur && g.cur.inn === st.inn && g.cur.half === st.half ? g.cur : null;
  const p = cur?.p || "";
  const runners = cur?.runners || st.runners;
  const slot = cur?.slot || st.nextSlot[side];
  let batter = null, oppBatter = null, bh = "R", pitcher = null, oppPitcherId = null, ph = "R", bName, pName;
  if (side === "off") {
    batter = (g.lineup || [])[slot - 1] || null;
    const bp = player(batter);
    const op = player(g.oppPitcherId);
    oppPitcherId = op ? op.id : null;
    ph = op ? (op.throws === "L" ? "L" : "R") : g.oppPitcher?.hand === "L" ? "L" : "R";
    bh = handOf(bp, ph);
    bName = bp ? esc(bp.name) : "（打者を選択）";
    pName = sc ? (op ? esc(op.name) : "（投手を選択）") : "相手 " + esc(op?.name || g.oppPitcher?.name || "投手");
  } else {
    pitcher = g.pitcher || null;
    const pp = player(pitcher);
    ph = pp?.throws === "L" ? "L" : "R";
    oppBatter = (g.oppLineup || [])[slot - 1] || null;
    const ob = player(oppBatter);
    bh = ob ? handOf(ob, ph) : g.oppHands?.[slot] === "L" ? "L" : "R";
    bName = ob ? (sc ? "" : "相手 ") + esc(ob.name) : sc ? "（打者を選択）" : `相手 ${slot}番`;
    pName = pp ? esc(pp.name) : "（投手を選択）";
  }
  return { st, side, sc, cur, p, runners, slot, batter, oppBatter, bh, pitcher, oppPitcherId, ph, bName, pName };
}

export function viewInput(id) {
  const g = state.games.find((x) => x.id === id);
  if (!g) return { html: `<div class="empty">試合が見つかりません。<a href="#/games">試合一覧へ</a></div>` };
  const c = ctx(g);
  const { st } = c;
  const cnt = liveCount(c.p);
  const lamps = (n, max, cls) => Array.from({ length: max }, (_, i) => `<span class="lamp ${i < n ? cls : ""}"></span>`).join("");
  const risp = c.runners[1] || c.runners[2];
  const recent = (g.log || []).slice(-5).reverse();
  const final = g.status === "final";
  const html = `<div class="inp">
    <div class="row"><a href="#/game/${g.id}" class="btn sm">‹ 試合の記録</a><span class="grow muted small" style="text-align:right">${g.scout ? `相手分析　${esc(g.top)} 対 ${esc(g.bottom)}` : `第${g.no}試合 vs ${esc(g.opponent)}`}</span></div>
    ${final ? `<div class="alert">この試合は「終了」になっています。続きを入力すると記録は追加されます。</div>` : ""}
    <div class="sit">
      <div>
        <div class="inning">${st.inn}回${st.half === "T" ? "表" : "裏"} <span style="font-size:14px;font-weight:700;opacity:.8">${c.sc ? esc(teamOf(g, c.side)) + "の攻撃" : c.side === "off" ? "攻撃" : "守備"}</span></div>
        <div class="lamps" aria-label="カウント">
          <div>B ${lamps(cnt.b, 3, "b")}</div><div>S ${lamps(cnt.s, 2, "s")}</div><div>O ${lamps(st.outs, 2, "o")}</div>
        </div>
      </div>
      <div style="display:grid;gap:6px;justify-items:end">
        <div class="sc">${st.score.us}<small>${c.sc ? `${esc(g.top)} - ${esc(g.bottom)}` : "自 - 相"}</small>${st.score.them}</div>
        <div class="diamond" aria-label="走者（タップで切り替え）">
          <button class="base b2 ${c.runners[1] ? "on" : ""}" data-base="1" aria-label="2塁"></button>
          <button class="base b3 ${c.runners[2] ? "on" : ""}" data-base="2" aria-label="3塁"></button>
          <button class="base b1 ${c.runners[0] ? "on" : ""}" data-base="0" aria-label="1塁"></button>
          <span class="home"></span>
        </div>
        ${risp ? `<span class="risp">得点圏</span>` : `<span class="small" style="opacity:.6">走者は塁をタップ</span>`}
      </div>
    </div>
    <div class="who">
      <div class="card" id="whoB"><div class="lbl">打者　${c.slot}番</div>
        <div class="nm">${c.bName}<span class="hand">${HAND[c.bh]}</span></div></div>
      <div class="card" id="whoP"><div class="lbl">投手</div>
        <div class="nm">${c.pName}<span class="hand">${HAND[c.ph]}</span></div></div>
    </div>
    <div class="seq" aria-label="この打席の投球">${c.p ? [...c.p].map((ch, i) => `<span class="pc ${ch}">${i + 1}${({ B: "ボ", S: "見", K: "空", F: "フ", X: "打", D: "死" })[ch]}</span>`).join("") : `<span class="muted small">この打席の投球がここに並びます</span>`}</div>
    <div class="pad">${PBTN.map(([k, l]) => `<button class="pbtn ${k}" data-p="${k}">${l}<span class="key">${k}</span></button>`).join("")}</div>
    <p class="muted small keyhelp">キーボード：<b>B</b> ボール ／ <b>S</b> 見逃し ／ <b>K</b> 空振り ／ <b>F</b> ファウル ／ <b>X</b> 打った ／ <b>D</b> 死球 ／ <b>Backspace</b> 1球戻す</p>
    <div class="tools">
      <button class="btn big" id="undo">↶ 1球戻す</button>
      <button class="btn big" id="more">走者・その他</button>
      <button class="btn big" id="order">打順・交代</button>
    </div>
    <div class="card small stack" style="gap:4px"><strong>直近の記録</strong>
      ${recent.map((it) => `<div class="row"><span class="grow">${itemText(it, g)}</span>${it.k === "pa" && it.id ? `<button class="btn sm" data-fix="${it.id}">直す</button>` : ""}</div>`).join("") || `<span class="muted">まだありません</span>`}
    </div>
  </div>`;
  return { html, after: (root) => bind(root, g.id) };
}

// ---------------------------------------------------------------------
function bind(root, id) {
  const G = () => state.games.find((x) => x.id === id);
  $$("[data-p]", root).forEach((b) => b.onclick = () => pitch(G(), b.dataset.p));
  $$("[data-base]", root).forEach((b) => b.onclick = () => {
    const g = G(), c = ctx(g);
    const rs = c.runners.slice(); rs[+b.dataset.base] = rs[+b.dataset.base] ? 0 : 1;
    store.patchGame(g.id, { cur: { inn: c.st.inn, half: c.st.half, p: c.p, runners: rs, slot: c.cur?.slot || null } });
  });
  $("#undo", root).onclick = () => undo(G());
  $("#more", root).onclick = () => moreSheet(G());
  $("#order", root).onclick = () => orderSheet(G());
  $("#whoB", root).onclick = () => orderSheet(G());
  $("#whoP", root).onclick = () => pitcherSheet(G());
  $$("[data-fix]", root).forEach((b) => b.onclick = () => import("./game.js").then((m) => m.editItemSheet(G(), b.dataset.fix)));
}

function setCur(g, c, patch) {
  store.patchGame(g.id, { cur: { inn: c.st.inn, half: c.st.half, p: c.p, runners: c.runners, slot: c.cur?.slot || null, ...patch } });
}

function pitch(g, ch) {
  const c = ctx(g);
  if (c.side === "off" && !c.batter) return orderSheet(g);
  if (c.side === "def" && !c.pitcher) return pitcherSheet(g);
  const np = c.p + ch;
  if (ch === "X") return resultSheet(g, np);
  const auto = autoResult(np);
  if (auto) {
    const it = commit(g, np, auto, {});
    toast(`${R[auto].label}を記録しました`, "直す", () => import("./game.js").then((m) => m.editItemSheet(state.games.find((x) => x.id === g.id), it.id)));
    return;
  }
  setCur(g, c, { p: np });
}

// 打席を確定して記録に追加
function commit(g, p, res, o) {
  const c = ctx(g);
  const adv = advance(c.runners, res, c.st.outs);
  const runs = o.runs ?? adv.runs;
  const it = {
    k: "pa", id: newId(), inn: c.st.inn, half: c.st.half, side: c.side, slot: c.slot,
    batter: c.batter, bh: c.bh, pitcher: c.pitcher, ph: c.ph,
    oppPitcher: c.side === "off" && !c.sc ? (g.oppPitcher?.name || player(c.oppPitcherId)?.name || "") : null,
    oppBatter: c.oppBatter || undefined, oppPitcherId: c.oppPitcherId || undefined,
    outsBefore: c.st.outs, runners: c.runners, p, res,
    runs, rbi: o.rbi ?? adv.rbi, outs: o.outs ?? R[res].outs, ra: adv.ra,
    ts: new Date().toISOString(),
  };
  if (c.side === "def") { it.er = o.er ?? runs; it.fp = fieldMap(g, c.pitcher); } // そのとき守っていた選手（守備の成績用）
  if (o.fielder) it.fielder = o.fielder;
  if (o.dir) it.dir = o.dir;
  const outsAfter = c.st.outs + it.outs;
  store.appendLog(g.id, [it], { cur: null, status: g.status === "final" ? "final" : "live" });
  if (outsAfter >= 3) setTimeout(() => toast("3アウト：攻守交代"), 50);
  return it;
}

function addEvent(g, type, extra = {}) {
  const c = ctx(g);
  const ev = { k: "ev", id: newId(), inn: c.st.inn, half: c.st.half, side: c.side, type, ts: new Date().toISOString(), ...extra };
  if (c.side === "def") { ev.pitcher = c.pitcher; ev.fp = fieldMap(g, c.pitcher); }
  const rs = c.runners.slice();
  if (type === "run") rs[2] = 0;
  const outsAfter = c.st.outs + (["cs", "po", "out"].includes(type) ? 1 : 0);
  store.appendLog(g.id, [ev], {
    cur: outsAfter >= 3 ? null : { inn: c.st.inn, half: c.st.half, p: c.p, runners: rs, slot: c.cur?.slot || null },
  });
  closeSheet();
  toast(`${EV[type]}を記録しました`);
}

function undo(g) {
  const c = ctx(g);
  if (c.p) { setCur(g, c, { p: c.p.slice(0, -1) }); return toast("1球戻しました"); }
  const log = g.log || [];
  if (!log.length) return toast("戻せる記録がありません");
  const last = log[log.length - 1];
  const cur = last.k === "pa"
    ? { inn: last.inn, half: last.half, p: (last.p || "").slice(0, -1), runners: last.runners || [0, 0, 0], slot: last.slot }
    : null;
  store.removeLogItem(g.id, last, { cur });
  toast(last.k === "pa" ? "前の打席の最後の1球を戻しました" : `${EV[last.type] || "記録"}を取り消しました`);
}

// ---- 打った！のあとの結果選択 ----
function resultSheet(g, np) {
  const c = ctx(g);
  let sel = null, runs = 0, rbi = 0, er = 0, outs = 0, fielder = null, dir = null;
  const draw = (el) => {
    el.innerHTML = `<h2>結果を選んでください</h2>
      <div class="rgrid">${INPLAY.map((k) => `<button class="rbtn ${R[k].hit ? "hit" : ""} ${sel === k ? "on" : ""}" data-r="${k}">${R[k].label}<span class="key">${RKEY[k]}</span></button>`).join("")}</div>
      <p class="muted small keyhelp" style="margin:6px 0 0">キーで結果を選び、続けて数字キーで打球方向、<b>Enter</b> で確定、<b>Esc</b> でやめる</p>
      ${sel ? `<div class="stack" style="margin-top:14px">
        ${sel !== "K" ? `<div><div class="muted small" style="font-weight:700;margin-bottom:4px">打球方向（分かれば）<span class="keyhelp">　キー：1投 2捕 3一 4二 5三 6遊 7左 8中 9右</span></div>
          <div class="nums dirs">${DIRS.map(([k, l]) => `<button data-dir="${k}" class="${dir === k ? "on" : ""}">${l}</button>`).join("")}</div></div>` : ""}
        ${numsRow("入った点", "runs", runs, 4)}
        ${numsRow("打点", "rbi", rbi, 4)}
        ${c.side === "def" ? numsRow("うち自責点", "er", er, runs) : ""}
        ${numsRow("この打席で増えたアウト", "outs", outs, 3)}
        ${sel === "E" && c.side === "def" ? `<div><div class="muted small" style="font-weight:700;margin-bottom:4px">エラーした選手（分かれば）</div>
          <div class="nums">${fielders(g).map((pid) => `<button data-fd="${pid}" class="${fielder === pid ? "on" : ""}" style="padding:0 10px">${esc(player(pid)?.name || "?")}</button>`).join("")}</div></div>` : ""}
        <p class="muted small" style="margin:0">点数とアウトは自動で入っています。違うときだけ押して直してください。</p>
      </div>` : ""}
      <div class="row" style="margin-top:14px"><button class="btn primary big grow" id="ok" ${sel ? "" : "disabled"}>確定</button><button class="btn big" id="cx">やめる</button></div>`;
    $$("[data-r]", el).forEach((b) => b.onclick = () => {
      sel = b.dataset.r;
      const a = advance(c.runners, sel, c.st.outs);
      runs = a.runs; rbi = a.rbi; er = a.runs; outs = R[sel].outs;
      draw(el);
    });
    $$("[data-fd]", el).forEach((b) => b.onclick = () => { fielder = fielder === b.dataset.fd ? null : b.dataset.fd; draw(el); });
    $$("[data-dir]", el).forEach((b) => b.onclick = () => { dir = dir === b.dataset.dir ? null : b.dataset.dir; draw(el); });
    $$("[data-n]", el).forEach((b) => b.onclick = () => {
      const k = b.dataset.n, v = +b.dataset.v;
      if (k === "runs") { runs = v; rbi = Math.min(rbi, v) || (sel === "E" || sel === "DP" ? 0 : v); er = v; }
      if (k === "rbi") rbi = v; if (k === "er") er = v; if (k === "outs") outs = v;
      draw(el);
    });
    $("#ok", el).onclick = () => { closeSheet(); commit(g, np, sel, { runs, rbi, er, outs, fielder: sel === "E" ? fielder : null, dir: sel === "K" ? null : dir }); };
    $("#cx", el).onclick = closeSheet;
  };
  sheet("", (el) => {
    draw(el);
    sheetKeys = (e) => {
      const k = e.key.toUpperCase();
      // 結果を選んだあとの数字キーは打球方向（守備位置の番号）
      if (sel && /^[1-9]$/.test(k) && sel !== "K") { e.preventDefault(); el.querySelector(`[data-dir="${k}"]`)?.click(); return; }
      const hit = Object.entries(RKEY).find(([, v]) => v === k);
      if (hit) { e.preventDefault(); el.querySelector(`[data-r="${hit[0]}"]`)?.click(); return; }
      if (e.key === "Enter" && sel) { e.preventDefault(); el.querySelector("#ok")?.click(); }
    };
  });
}
function numsRow(label, key, val, max) {
  return `<div><div class="muted small" style="font-weight:700;margin-bottom:4px">${label}</div><div class="nums">${Array.from({ length: max + 1 }, (_, i) => `<button data-n="${key}" data-v="${i}" class="${val === i ? "on" : ""}">${i}</button>`).join("")}</div></div>`;
}

// 守っている自チームの選手（スタメン＋今の投手）
function fielders(g) {
  const ids = [...(g.lineup || []).filter(Boolean)];
  if (g.pitcher && !ids.includes(g.pitcher)) ids.push(g.pitcher);
  return ids;
}
// 捕手らしい選手（守備位置に「捕」がある人）を先頭に
function catcherFirst(ids) {
  return [...ids].sort((a, b) => ((player(b)?.pos || "").includes("捕") ? 1 : 0) - ((player(a)?.pos || "").includes("捕") ? 1 : 0));
}

// ---- 走者・その他 ----
function moreSheet(g) {
  const c = ctx(g);
  const off = c.side === "off";
  const lineup = ((g.scout && !off ? g.oppLineup : g.lineup) || []).filter(Boolean);
  const runnerPick = (type) => `<div class="plist">${lineup.map((pid) => `<button class="btn" data-ev="${type}" data-runner="${pid}">${esc(player(pid)?.name || "?")}</button>`).join("")}<button class="btn" data-ev="${type}">（選ばずに記録）</button></div>`;
  sheet(`<h2>走者・その他</h2>
    <div class="stack">
      ${off ? `
        <details><summary class="btn block">盗塁（成功）</summary>${runnerPick("sb")}</details>
        <details><summary class="btn block">盗塁死（アウト）</summary>${runnerPick("cs")}</details>
        <details><summary class="btn block">牽制でアウト</summary>${runnerPick("po")}</details>
        <details><summary class="btn block">走者がホームイン（暴投・捕逸など）</summary>${runnerPick("run")}</details>
        <div class="row"><button class="btn grow" data-ev="e">相手の失策</button><button class="btn grow" data-ev="wp">相手の暴投</button><button class="btn grow" data-ev="pb">相手の捕逸</button></div>
      ` : `
        <button class="btn block" data-ev="sb">盗塁された</button>
        <button class="btn block" data-ev="cs">盗塁を刺した（アウト）</button>
        <button class="btn block" data-ev="po">牽制で刺した（アウト）</button>
        <div class="row"><button class="btn grow" data-ev="run" data-er="1">走者ホームイン（自責）</button><button class="btn grow" data-ev="run" data-er="0">走者ホームイン（エラーで・非自責）</button></div>
        <details><summary class="btn block">失策（エラー）</summary><div class="plist">${fielders(g).map((pid) => `<button class="btn" data-ev="e" data-fielder="${pid}">${esc(player(pid)?.name || "?")}${player(pid)?.pos ? ` <span class="muted small">${esc(player(pid).pos)}</span>` : ""}</button>`).join("")}<button class="btn" data-ev="e">（選ばずに記録）</button></div></details>
        <button class="btn block" data-ev="wp">暴投（ワイルドピッチ）… 今の投手に記録</button>
        <details><summary class="btn block">捕逸（パスボール）</summary><div class="plist">${catcherFirst(fielders(g)).map((pid) => `<button class="btn" data-ev="pb" data-catcher="${pid}">${esc(player(pid)?.name || "?")}${player(pid)?.pos ? ` <span class="muted small">${esc(player(pid).pos)}</span>` : ""}</button>`).join("")}<button class="btn" data-ev="pb">（選ばずに記録）</button></div></details>
      `}
      <button class="btn block" data-ev="out">アウトを1つ追加（その他のアウト）</button>
      <button class="btn block" id="chg">この回を終わりにする（攻守交代）</button>
      <hr style="border:0;border-top:1px solid var(--line);width:100%">
      <button class="btn block danger" id="fin">試合終了にする</button>
      <button class="btn block" id="cx">閉じる</button>
    </div>
    <p class="muted small">盗塁・暴投・捕逸・失策で走者が動いたら、画面上の塁をタップして直してください。点が入ったときは「走者がホームイン」も押してください。</p>`, (el) => {
    $$("[data-ev]", el).forEach((b) => b.onclick = () => {
      const extra = {};
      if (b.dataset.runner) extra.runner = b.dataset.runner;
      if (b.dataset.er) extra.er = b.dataset.er === "1";
      if (b.dataset.fielder) extra.fielder = b.dataset.fielder;
      if (b.dataset.catcher) extra.catcher = b.dataset.catcher;
      addEvent(state.games.find((x) => x.id === g.id), b.dataset.ev, extra);
    });
    $("#chg", el).onclick = () => {
      const gg = state.games.find((x) => x.id === g.id), cc = ctx(gg);
      const need = 3 - cc.st.outs;
      const evs = Array.from({ length: need }, () => ({ k: "ev", id: newId(), inn: cc.st.inn, half: cc.st.half, side: cc.side, type: "out", pitcher: cc.side === "def" ? cc.pitcher : undefined, ts: new Date().toISOString() }));
      store.appendLog(gg.id, evs, { cur: null });
      closeSheet(); toast("攻守交代しました");
    };
    $("#fin", el).onclick = () => {
      if (!confirm("試合終了にしますか？（あとで入力を続けることもできます）")) return;
      store.patchGame(g.id, { status: "final", cur: null });
      closeSheet(); location.hash = `#/game/${g.id}`;
    };
    $("#cx", el).onclick = closeSheet;
  });
}

// ---- 相手チームの選手をその場で登録する欄 ----
function addOppForm(team, kind) {
  return `<details class="addopp"><summary class="btn sm">＋ ${esc(team)}の選手を登録</summary>
    <div class="row" style="margin-top:8px;align-items:end">
      <label class="f" style="width:80px">背番号<input type="text" inputmode="numeric" data-ao="no"></label>
      <label class="f grow">名前<input type="text" data-ao="name" placeholder="例：山田（名字だけでも可）"></label>
      <label class="f" style="width:90px">${kind === "p" ? "投げ方" : "打ち方"}<select data-ao="hand">${kind === "p" ? `<option value="R">右投</option><option value="L">左投</option>` : `<option value="R">右打</option><option value="L">左打</option><option value="S">両打</option>`}</select></label>
      <button type="button" class="btn primary" data-ao="ok">登録して選ぶ</button>
    </div></details>`;
}
function bindAddOpp(el, team, kind, onPick) {
  const ok = el.querySelector('[data-ao="ok"]'); if (!ok) return;
  ok.onclick = () => {
    const name = el.querySelector('[data-ao="name"]').value.trim();
    const no = el.querySelector('[data-ao="no"]').value.trim();
    if (!name && !no) return toast("名前か背番号を入れてください");
    const hand = el.querySelector('[data-ao="hand"]').value;
    const pdata = { name: name || `#${no}`, opp: team, numbers: no ? { [thisSeason()]: no } : {}, active: true, pos: kind === "p" ? "投" : "" };
    if (kind === "p") pdata.throws = hand; else pdata.bats = hand;
    const id = store.savePlayer(pdata);
    onPick(id);
  };
}
const oppBtn = (p, on, kind) => `<button class="btn ${on ? "primary" : ""}" data-pid="${p.id}">${pno(p)}${esc(p.name)} <span class="hand">${kind === "p" ? (HAND[p.throws] || "右") + "投" : (HAND[p.bats] || "右") + "打"}</span></button>`;

// ---- 打順・選手交代 ----
function orderSheet(g) {
  const c = ctx(g);
  const off = c.side === "off";
  const team = teamOf(g, c.side); // 相手（または偵察チーム）の打者なら、そのチーム名
  const pls = team ? oppPlayers(team) : activePlayers();
  const cur = off ? c.batter : c.oppBatter;
  const lineKey = off ? "lineup" : "oppLineup";
  sheet(`<h2>${team ? esc(team) + "の打者" : "打順・選手交代"}</h2>
    <div class="stack">
      <div><div class="muted small" style="font-weight:700;margin-bottom:4px">打順（ずれていたら直せます）</div>
        <div class="nums">${Array.from({ length: 9 }, (_, i) => `<button data-slot="${i + 1}" class="${c.slot === i + 1 ? "on" : ""}">${i + 1}</button>`).join("")}</div></div>
      <div><div class="muted small" style="font-weight:700;margin-bottom:4px">${c.slot}番の打者${team ? "" : "（代打・交代はここで選ぶ）"}</div>
        <div class="plist">${pls.map((p) => oppBtn(p, cur === p.id, "b")).join("")}${team && !pls.length ? `<span class="muted small">${esc(team)}の選手はまだ登録されていません。</span>` : ""}</div>
        ${team ? addOppForm(team, "b") : ""}</div>
      ${!off && !g.scout ? `<div><div class="muted small" style="font-weight:700;margin-bottom:4px">名前が分からないときは、打ち方だけ（相手${c.slot}番）</div>
        <div class="seg"><button data-hand="R" class="${!cur && c.bh === "R" ? "on" : ""}">右打ち</button><button data-hand="L" class="${!cur && c.bh === "L" ? "on" : ""}">左打ち</button></div>
        <p class="muted small">一度選ぶと、同じ打順では次から自動で入ります。</p></div>` : ""}
      <button class="btn block" id="cx">閉じる</button>
    </div>`, (el) => {
    const G = () => state.games.find((x) => x.id === g.id);
    const pick = (pid) => {
      const gg = G(), cc = ctx(gg);
      const line = [...(gg[lineKey] || [])]; while (line.length < 9) line.push(null);
      line[cc.slot - 1] = pid;
      store.patchGame(gg.id, { [lineKey]: line }); closeSheet();
    };
    $$("[data-slot]", el).forEach((b) => b.onclick = () => {
      const gg = G(), cc = ctx(gg);
      setCur(gg, cc, { slot: +b.dataset.slot }); closeSheet();
    });
    $$("[data-pid]", el).forEach((b) => b.onclick = () => pick(b.dataset.pid));
    $$("[data-hand]", el).forEach((b) => b.onclick = () => {
      const gg = G(), cc = ctx(gg);
      const line = [...(gg.oppLineup || [])]; while (line.length < 9) line.push(null);
      line[cc.slot - 1] = null;
      store.patchGame(gg.id, { oppHands: { ...(gg.oppHands || {}), [cc.slot]: b.dataset.hand }, oppLineup: line }); closeSheet();
    });
    if (team) bindAddOpp(el, team, "b", pick);
    $("#cx", el).onclick = closeSheet;
  });
}

// ---- 投手交代 ----
function pitcherSheet(g) {
  const c = ctx(g);
  const team = fieldTeamOf(g, c.side); // 投げているのが相手（偵察チーム）なら、そのチーム名
  if (!team) {
    const pls = activePlayers();
    sheet(`<h2>自チームの投手</h2><div class="plist">${pls.map((p) => oppBtn(p, c.pitcher === p.id, "p")).join("")}</div>
      <button class="btn block" id="cx" style="margin-top:10px">閉じる</button>`, (el) => {
      $$("[data-pid]", el).forEach((b) => b.onclick = () => { store.patchGame(g.id, { pitcher: b.dataset.pid }); closeSheet(); toast("投手を交代しました"); });
      $("#cx", el).onclick = closeSheet;
    });
    return;
  }
  const key = c.side === "off" ? "oppPitcherId" : "pitcher"; // 偵察試合の先攻チームの投手は pitcher
  const curId = c.side === "off" ? c.oppPitcherId : c.pitcher;
  const pls = oppPlayers(team);
  let hand = g.oppPitcher?.hand === "L" ? "L" : "R";
  sheet(`<h2>${esc(team)}の投手</h2><div class="stack">
    <div class="plist">${pls.map((p) => oppBtn(p, curId === p.id, "p")).join("")}${!pls.length ? `<span class="muted small">${esc(team)}の選手はまだ登録されていません。</span>` : ""}</div>
    ${addOppForm(team, "p")}
    ${!g.scout ? `<hr style="border:0;border-top:1px solid var(--line);width:100%">
      <div class="muted small" style="font-weight:700">登録しないで、名前と投げ方だけ入れる</div>
      <label class="f">名前や背番号<input type="text" id="on" value="${esc(curId ? "" : g.oppPitcher?.name || "")}"></label>
      <div class="seg" id="oh"><button data-v="R" class="${hand === "R" ? "on" : ""}">右投げ</button><button data-v="L" class="${hand === "L" ? "on" : ""}">左投げ</button></div>
      <button class="btn" id="ok">これで保存（投手交代）</button>` : ""}
    <button class="btn block" id="cx">閉じる</button></div>`, (el) => {
    const pick = (pid) => {
      const p = player(pid) || {};
      const patch = { [key]: pid };
      if (!g.scout) patch.oppPitcher = { name: p.name || "", hand: p.throws === "L" ? "L" : "R" };
      store.patchGame(g.id, patch); closeSheet(); toast("投手を交代しました");
    };
    $$("[data-pid]", el).forEach((b) => b.onclick = () => pick(b.dataset.pid));
    bindAddOpp(el, team, "p", pick);
    $$("#oh button", el).forEach((b) => b.onclick = () => { hand = b.dataset.v; $$("#oh button", el).forEach((x) => x.classList.toggle("on", x === b)); });
    const ok = $("#ok", el);
    if (ok) ok.onclick = () => { store.patchGame(g.id, { oppPitcher: { name: $("#on", el).value.trim(), hand }, oppPitcherId: null }); closeSheet(); };
    $("#cx", el).onclick = closeSheet;
  });
}
export { RESULTS };

// ---- キーボード入力（学校PCで試合後にまとめて入力するとき用） ----
document.addEventListener("keydown", (e) => {
  const m = location.hash.match(/^#\/game\/([\w-]+)\/input$/);
  if (!m || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
  const tag = document.activeElement?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  const openSheet = document.querySelector(".sheet-back");
  if (openSheet) {
    if (e.key === "Escape") { e.preventDefault(); closeSheet(); return; }
    if (sheetKeys && openSheet.querySelector("[data-r]")) sheetKeys(e);
    return;
  }
  sheetKeys = null;
  const g = state.games.find((x) => x.id === m[1]);
  if (!g) return;
  const k = e.key.toUpperCase();
  if (["B", "S", "K", "F", "X", "D"].includes(k)) { e.preventDefault(); pitch(g, k); }
  else if (e.key === "Backspace") { e.preventDefault(); undo(g); }
});
