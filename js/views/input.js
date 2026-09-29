// =====================================================================
//  1球入力画面（views/input.js）… 試合中にiPhoneで使う画面
//  1球 = 1タップ。四球・三振・死球は自動で打席が終わります。
// =====================================================================
import * as store from "../store.js";
import { state, newId } from "../store.js";
import { esc, $, $$, toast, sheet, closeSheet, player, activePlayers, numberOf, HAND } from "../ui.js";
import { gameState, liveCount, autoResult, advance, R, RESULTS } from "../stats.js";
import { itemText } from "./game.js";

const PBTN = [["B", "ボール"], ["S", "見逃し"], ["K", "空振り"], ["F", "ファウル"], ["X", "打った！"], ["D", "死球"]];
const INPLAY = ["1B", "2B", "3B", "HR", "GO", "FO", "LO", "DP", "E", "FC", "SAC", "SF", "ADV", "K"];
// 「打った！」のあとの結果を選ぶキー
const RKEY = { "1B": "1", "2B": "2", "3B": "3", HR: "4", GO: "G", FO: "F", LO: "L", DP: "P", E: "E", FC: "C", SAC: "B", SF: "Y", ADV: "A", K: "K" };
let sheetKeys = null; // 開いている選択画面のキー操作
const EV = {
  sb: "盗塁", cs: "盗塁死", po: "牽制アウト", run: "走者生還", out: "アウト",
};

function ctx(g) {
  const st = gameState(g);
  const side = st.side;
  const cur = g.cur && g.cur.inn === st.inn && g.cur.half === st.half ? g.cur : null;
  const p = cur?.p || "";
  const runners = cur?.runners || st.runners;
  const slot = cur?.slot || st.nextSlot[side];
  let batter = null, bh = "R", pitcher = null, ph = "R", bName, pName;
  if (side === "off") {
    batter = (g.lineup || [])[slot - 1] || null;
    const bp = player(batter);
    ph = g.oppPitcher?.hand === "L" ? "L" : "R";
    bh = bp?.bats === "S" ? (ph === "R" ? "L" : "R") : bp?.bats === "L" ? "L" : "R";
    bName = bp ? esc(bp.name) : "（打者を選択）";
    pName = "相手 " + esc(g.oppPitcher?.name || "投手");
  } else {
    pitcher = g.pitcher || null;
    const pp = player(pitcher);
    ph = pp?.throws === "L" ? "L" : "R";
    bh = g.oppHands?.[slot] === "L" ? "L" : "R";
    bName = `相手 ${slot}番`;
    pName = pp ? esc(pp.name) : "（投手を選択）";
  }
  return { st, side, cur, p, runners, slot, batter, bh, pitcher, ph, bName, pName };
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
    <div class="row"><a href="#/game/${g.id}" class="btn sm">‹ 試合の記録</a><span class="grow muted small" style="text-align:right">第${g.no}試合 vs ${esc(g.opponent)}</span></div>
    ${final ? `<div class="alert">この試合は「終了」になっています。続きを入力すると記録は追加されます。</div>` : ""}
    <div class="sit">
      <div>
        <div class="inning">${st.inn}回${st.half === "T" ? "表" : "裏"} <span style="font-size:14px;font-weight:700;opacity:.8">${c.side === "off" ? "攻撃" : "守備"}</span></div>
        <div class="lamps" aria-label="カウント">
          <div>B ${lamps(cnt.b, 3, "b")}</div><div>S ${lamps(cnt.s, 2, "s")}</div><div>O ${lamps(st.outs, 2, "o")}</div>
        </div>
      </div>
      <div style="display:grid;gap:6px;justify-items:end">
        <div class="sc">${st.score.us}<small>自 - 相</small>${st.score.them}</div>
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
    oppPitcher: c.side === "off" ? (g.oppPitcher?.name || "") : null,
    outsBefore: c.st.outs, runners: c.runners, p, res,
    runs, rbi: o.rbi ?? adv.rbi, outs: o.outs ?? R[res].outs, ra: adv.ra,
    ts: new Date().toISOString(),
  };
  if (c.side === "def") it.er = o.er ?? runs;
  const outsAfter = c.st.outs + it.outs;
  store.patchGame(g.id, { log: [...(g.log || []), it], cur: null, status: g.status === "final" ? "final" : "live" });
  if (outsAfter >= 3) setTimeout(() => toast("3アウト：攻守交代"), 50);
  return it;
}

function addEvent(g, type, extra = {}) {
  const c = ctx(g);
  const ev = { k: "ev", id: newId(), inn: c.st.inn, half: c.st.half, side: c.side, type, ts: new Date().toISOString(), ...extra };
  if (c.side === "def") ev.pitcher = c.pitcher;
  const rs = c.runners.slice();
  if (type === "run") rs[2] = 0;
  const outsAfter = c.st.outs + (["cs", "po", "out"].includes(type) ? 1 : 0);
  store.patchGame(g.id, {
    log: [...(g.log || []), ev],
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
  store.patchGame(g.id, { log: log.slice(0, -1), cur });
  toast(last.k === "pa" ? "前の打席の最後の1球を戻しました" : `${EV[last.type] || "記録"}を取り消しました`);
}

// ---- 打った！のあとの結果選択 ----
function resultSheet(g, np) {
  const c = ctx(g);
  let sel = null, runs = 0, rbi = 0, er = 0, outs = 0;
  const draw = (el) => {
    el.innerHTML = `<h2>結果を選んでください</h2>
      <div class="rgrid">${INPLAY.map((k) => `<button class="rbtn ${R[k].hit ? "hit" : ""} ${sel === k ? "on" : ""}" data-r="${k}">${R[k].label}<span class="key">${RKEY[k]}</span></button>`).join("")}</div>
      <p class="muted small keyhelp" style="margin:6px 0 0">キーで選んで <b>Enter</b> で確定、<b>Esc</b> でやめる</p>
      ${sel ? `<div class="stack" style="margin-top:14px">
        ${numsRow("入った点", "runs", runs, 4)}
        ${numsRow("打点", "rbi", rbi, 4)}
        ${c.side === "def" ? numsRow("うち自責点", "er", er, runs) : ""}
        ${numsRow("この打席で増えたアウト", "outs", outs, 3)}
        <p class="muted small" style="margin:0">点数とアウトは自動で入っています。違うときだけ押して直してください。</p>
      </div>` : ""}
      <div class="row" style="margin-top:14px"><button class="btn primary big grow" id="ok" ${sel ? "" : "disabled"}>確定</button><button class="btn big" id="cx">やめる</button></div>`;
    $$("[data-r]", el).forEach((b) => b.onclick = () => {
      sel = b.dataset.r;
      const a = advance(c.runners, sel, c.st.outs);
      runs = a.runs; rbi = a.rbi; er = a.runs; outs = R[sel].outs;
      draw(el);
    });
    $$("[data-n]", el).forEach((b) => b.onclick = () => {
      const k = b.dataset.n, v = +b.dataset.v;
      if (k === "runs") { runs = v; rbi = Math.min(rbi, v) || (sel === "E" || sel === "DP" ? 0 : v); er = v; }
      if (k === "rbi") rbi = v; if (k === "er") er = v; if (k === "outs") outs = v;
      draw(el);
    });
    $("#ok", el).onclick = () => { closeSheet(); commit(g, np, sel, { runs, rbi, er, outs }); };
    $("#cx", el).onclick = closeSheet;
  };
  sheet("", (el) => {
    draw(el);
    sheetKeys = (e) => {
      const k = e.key.toUpperCase();
      const hit = Object.entries(RKEY).find(([, v]) => v === k);
      if (hit) { e.preventDefault(); el.querySelector(`[data-r="${hit[0]}"]`)?.click(); return; }
      if (e.key === "Enter" && sel) { e.preventDefault(); el.querySelector("#ok")?.click(); }
    };
  });
}
function numsRow(label, key, val, max) {
  return `<div><div class="muted small" style="font-weight:700;margin-bottom:4px">${label}</div><div class="nums">${Array.from({ length: max + 1 }, (_, i) => `<button data-n="${key}" data-v="${i}" class="${val === i ? "on" : ""}">${i}</button>`).join("")}</div></div>`;
}

// ---- 走者・その他 ----
function moreSheet(g) {
  const c = ctx(g);
  const off = c.side === "off";
  const lineup = (g.lineup || []).filter(Boolean);
  const runnerPick = (type) => `<div class="plist">${lineup.map((pid) => `<button class="btn" data-ev="${type}" data-runner="${pid}">${esc(player(pid)?.name || "?")}</button>`).join("")}<button class="btn" data-ev="${type}">（選ばずに記録）</button></div>`;
  sheet(`<h2>走者・その他</h2>
    <div class="stack">
      ${off ? `
        <details><summary class="btn block">盗塁（成功）</summary>${runnerPick("sb")}</details>
        <details><summary class="btn block">盗塁死（アウト）</summary>${runnerPick("cs")}</details>
        <details><summary class="btn block">牽制でアウト</summary>${runnerPick("po")}</details>
        <details><summary class="btn block">走者がホームイン（暴投・捕逸など）</summary>${runnerPick("run")}</details>
      ` : `
        <button class="btn block" data-ev="sb">盗塁された</button>
        <button class="btn block" data-ev="cs">盗塁を刺した（アウト）</button>
        <button class="btn block" data-ev="po">牽制で刺した（アウト）</button>
        <div class="row"><button class="btn grow" data-ev="run" data-er="1">走者ホームイン（自責）</button><button class="btn grow" data-ev="run" data-er="0">走者ホームイン（エラーで・非自責）</button></div>
      `}
      <button class="btn block" data-ev="out">アウトを1つ追加（その他のアウト）</button>
      <button class="btn block" id="chg">この回を終わりにする（攻守交代）</button>
      <hr style="border:0;border-top:1px solid var(--line);width:100%">
      <button class="btn block danger" id="fin">試合終了にする</button>
      <button class="btn block" id="cx">閉じる</button>
    </div>
    <p class="muted small">盗塁などで走者が動いたら、画面上の塁をタップして直してください。</p>`, (el) => {
    $$("[data-ev]", el).forEach((b) => b.onclick = () => {
      const extra = {};
      if (b.dataset.runner) extra.runner = b.dataset.runner;
      if (b.dataset.er) extra.er = b.dataset.er === "1";
      addEvent(state.games.find((x) => x.id === g.id), b.dataset.ev, extra);
    });
    $("#chg", el).onclick = () => {
      const gg = state.games.find((x) => x.id === g.id), cc = ctx(gg);
      const need = 3 - cc.st.outs;
      const evs = Array.from({ length: need }, () => ({ k: "ev", id: newId(), inn: cc.st.inn, half: cc.st.half, side: cc.side, type: "out", pitcher: cc.side === "def" ? cc.pitcher : undefined, ts: new Date().toISOString() }));
      store.patchGame(gg.id, { log: [...(gg.log || []), ...evs], cur: null });
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

// ---- 打順・選手交代 ----
function orderSheet(g) {
  const c = ctx(g);
  const off = c.side === "off";
  const pls = activePlayers();
  sheet(`<h2>${off ? "打順・選手交代" : "相手の打者"}</h2>
    <div class="stack">
      <div><div class="muted small" style="font-weight:700;margin-bottom:4px">打順（ずれていたら直せます）</div>
        <div class="nums">${Array.from({ length: 9 }, (_, i) => `<button data-slot="${i + 1}" class="${c.slot === i + 1 ? "on" : ""}">${i + 1}</button>`).join("")}</div></div>
      ${off ? `<div><div class="muted small" style="font-weight:700;margin-bottom:4px">${c.slot}番の打者（代打・交代はここで選ぶ）</div>
        <div class="plist">${pls.map((p) => `<button class="btn ${c.batter === p.id ? "primary" : ""}" data-pid="${p.id}">${numberOf(p) !== "" ? "#" + esc(numberOf(p)) + " " : ""}${esc(p.name)} <span class="hand">${HAND[p.bats] || "右"}打</span></button>`).join("")}</div></div>`
      : `<div><div class="muted small" style="font-weight:700;margin-bottom:4px">相手${c.slot}番の打者は</div>
        <div class="seg"><button data-hand="R" class="${c.bh === "R" ? "on" : ""}">右打ち</button><button data-hand="L" class="${c.bh === "L" ? "on" : ""}">左打ち</button></div>
        <p class="muted small">一度選ぶと、同じ打順では次から自動で入ります。</p></div>`}
      <button class="btn block" id="cx">閉じる</button>
    </div>`, (el) => {
    const G = () => state.games.find((x) => x.id === g.id);
    $$("[data-slot]", el).forEach((b) => b.onclick = () => {
      const gg = G(), cc = ctx(gg);
      setCur(gg, cc, { slot: +b.dataset.slot }); closeSheet();
    });
    $$("[data-pid]", el).forEach((b) => b.onclick = () => {
      const gg = G(), cc = ctx(gg);
      const lineup = [...(gg.lineup || [])]; while (lineup.length < 9) lineup.push(null);
      lineup[cc.slot - 1] = b.dataset.pid;
      store.patchGame(gg.id, { lineup }); closeSheet();
    });
    $$("[data-hand]", el).forEach((b) => b.onclick = () => {
      const gg = G(), cc = ctx(gg);
      store.patchGame(gg.id, { oppHands: { ...(gg.oppHands || {}), [cc.slot]: b.dataset.hand } }); closeSheet();
    });
    $("#cx", el).onclick = closeSheet;
  });
}

// ---- 投手交代 ----
function pitcherSheet(g) {
  const c = ctx(g);
  if (c.side === "def") {
    const pls = activePlayers();
    sheet(`<h2>自チームの投手</h2><div class="plist">${pls.map((p) => `<button class="btn ${c.pitcher === p.id ? "primary" : ""}" data-pid="${p.id}">${numberOf(p) !== "" ? "#" + esc(numberOf(p)) + " " : ""}${esc(p.name)} <span class="hand">${HAND[p.throws] || "右"}投</span></button>`).join("")}</div>
      <button class="btn block" id="cx" style="margin-top:10px">閉じる</button>`, (el) => {
      $$("[data-pid]", el).forEach((b) => b.onclick = () => { store.patchGame(g.id, { pitcher: b.dataset.pid }); closeSheet(); toast("投手を交代しました"); });
      $("#cx", el).onclick = closeSheet;
    });
  } else {
    let hand = g.oppPitcher?.hand === "L" ? "L" : "R";
    sheet(`<h2>相手の投手</h2><div class="stack">
      <label class="f">名前や背番号<input type="text" id="on" value="${esc(g.oppPitcher?.name || "")}"></label>
      <div class="seg" id="oh"><button data-v="R" class="${hand === "R" ? "on" : ""}">右投げ</button><button data-v="L" class="${hand === "L" ? "on" : ""}">左投げ</button></div>
      <div class="row"><button class="btn primary grow" id="ok">保存（投手交代）</button><button class="btn" id="cx">閉じる</button></div></div>`, (el) => {
      $$("#oh button", el).forEach((b) => b.onclick = () => { hand = b.dataset.v; $$("#oh button", el).forEach((x) => x.classList.toggle("on", x === b)); });
      $("#ok", el).onclick = () => { store.patchGame(g.id, { oppPitcher: { name: $("#on", el).value.trim(), hand } }); closeSheet(); };
      $("#cx", el).onclick = closeSheet;
    });
  }
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
