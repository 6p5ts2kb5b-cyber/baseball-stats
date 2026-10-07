// =====================================================================
//  分析（views/analysis.js）… 比較・カウント別・打球方向・守備
// =====================================================================
import { state } from "../store.js";
import { esc, $, $$, player, activePlayers, numberOf, filterBar, bindFilter, loadFilter, filteredGames, filterLabel, sortableTable, HAND, POSFULL } from "../ui.js";
import { batting, pitching, spray, fielding, countGroup, COUNT_GROUPS, fmtAvg, fmtPct, fmtNum } from "../stats.js";
import { countPanel, bindCountPanels, sprayChart, pullBar, sprayTable, compareTable } from "./charts.js";

const F = loadFilter();
const rerender = () => window.dispatchEvent(new Event("hashchange"));
const nm = (pid) => (pid === "team" ? "チーム全体" : player(pid)?.name || "（削除済み）");
const TABS = [["compare", "比較"], ["count", "カウント別"], ["spray", "打球方向"], ["field", "守備"]];

function shell(tab, inner) {
  return `<div class="row" style="justify-content:space-between"><h1>分析</h1></div>
    <nav class="tabs noprint">${TABS.map(([k, l]) => `<a href="#/analysis/${k}" class="${tab === k ? "on" : ""}">${l}</a>`).join("")}</nav>${inner}`;
}
// 記録のある自チームの打者（打席の多い順）
function batters(gs) {
  const n = {};
  for (const g of gs) for (const it of g.log || []) if (it.k === "pa" && it.side === "off" && it.batter) n[it.batter] = (n[it.batter] || 0) + 1;
  return Object.keys(n).sort((a, b) => n[b] - n[a]);
}
function pitchers(gs) {
  const n = {};
  for (const g of gs) for (const it of g.log || []) if (it.k === "pa" && it.side === "def" && it.pitcher) n[it.pitcher] = (n[it.pitcher] || 0) + 1;
  return Object.keys(n).sort((a, b) => n[b] - n[a]);
}

export function viewAnalysis(tab = "compare") {
  const t = (tab || "compare").split("/");
  if (t[0] === "count") return viewCount();
  if (t[0] === "spray") return viewSpray(t[1]);
  if (t[0] === "field") return viewField();
  return viewCompare(t[1]);
}

// ---------------------------------------------------------------------
//  比較：2人の選手、または同じ選手の2つの期間
// ---------------------------------------------------------------------
const C = { mode: "bat", A: null, B: null };
function side(who) { return { who, f: { season: F.season, by: "all", value: "" } }; }
function ensureCompare(presetPid) {
  const all = batters(filteredGames({ season: F.season, by: "all" }));
  if (presetPid && player(presetPid)) {
    C.A = side(presetPid); C.B = side(presetPid); C.B.f.by = "last"; C.B.f.value = "5"; C.mode = "bat";
    if (!all.includes(presetPid) && pitchers(filteredGames({ season: F.season, by: "all" })).includes(presetPid)) C.mode = "pit";
  }
  if (!C.A) C.A = side(all[0] || activePlayers()[0]?.id || "team");
  if (!C.B) C.B = side(all[1] || "team");
}
function selCard(key, S) {
  const pool = C.mode === "pit" ? pitchers(filteredGames({ season: S.f.season, by: "all" })) : batters(filteredGames({ season: S.f.season, by: "all" }));
  const others = activePlayers().map((p) => p.id).filter((id) => !pool.includes(id));
  const opt = (id) => `<option value="${id}" ${S.who === id ? "selected" : ""}>${id === "team" ? "チーム全体" : (numberOf(player(id)) !== "" ? "#" + esc(numberOf(player(id))) + " " : "") + esc(nm(id))}</option>`;
  return `<div class="card stack ${key === "B" ? "b" : ""}" data-side="${key}">
    <div class="row"><strong><span class="sw ${key.toLowerCase()}"></span>${key === "A" ? "A" : "B"}</strong>
      <label class="f grow">${C.mode === "pit" ? "投手" : "選手"}<select data-who>${C.mode === "bat" ? opt("team") : ""}${pool.map(opt).join("")}${others.length ? `<optgroup label="記録のない選手">${others.map(opt).join("")}</optgroup>` : ""}</select></label></div>
    ${filterBar(S.f, "cf" + key)}
  </div>`;
}
function label(S) { return `${nm(S.who)}（${filterLabel(S.f)}）`; }

function batRows(a, b) {
  const g = (x, k) => x.groups?.[k];
  return [
    { head: "基本" },
    { label: "試合", a: a.g, b: b.g, fmt: (v) => v ?? "-" },
    { label: "打席", a: a.pa, b: b.pa, fmt: (v) => v ?? "-" },
    { label: "安打", a: a.h, b: b.h, fmt: (v) => v ?? "-" },
    { label: "本塁打", a: a.hr, b: b.hr, fmt: (v) => v ?? "-" },
    { label: "打点", a: a.rbi, b: b.rbi, fmt: (v) => v ?? "-" },
    { label: "盗塁", a: a.sb, b: b.sb, fmt: (v) => v ?? "-" },
    { head: "率" },
    { label: "打率", a: a.avg, b: b.avg, fmt: fmtAvg },
    { label: "出塁率", a: a.obp, b: b.obp, fmt: fmtAvg },
    { label: "長打率", a: a.slg, b: b.slg, fmt: fmtAvg },
    { label: "OPS", a: a.ops, b: b.ops, fmt: fmtAvg },
    { label: "三振率", note: "低いほどよい", a: a.kRate, b: b.kRate, fmt: fmtPct, lowGood: true },
    { label: "四死球の割合", a: a.pa ? (a.bb + a.hbp) / a.pa : null, b: b.pa ? (b.bb + b.hbp) / b.pa : null, fmt: fmtPct },
    { head: "場面・カウント" },
    { label: "得点圏打率", a: a.risp.avg, b: b.risp.avg, fmt: fmtAvg },
    { label: "初球打率", a: a.first.avg, b: b.first.avg, fmt: fmtAvg },
    { label: "打者有利カウントの打率", a: g(a, "ahead").avg, b: g(b, "ahead").avg, fmt: fmtAvg },
    { label: "追い込まれてからの打率", a: a.two.avg, b: b.two.avg, fmt: fmtAvg },
    { label: "追い込まれてからの三振率", note: "低いほどよい", a: a.two.kRate, b: b.two.kRate, fmt: fmtPct, lowGood: true },
    { label: "3-2からの出塁率", a: a.full.obp, b: b.full.obp, fmt: fmtAvg },
    { head: "相手投手の左右" },
    { label: "対右投手の打率", a: a.vsR.avg, b: b.vsR.avg, fmt: fmtAvg },
    { label: "対左投手の打率", a: a.vsL.avg, b: b.vsL.avg, fmt: fmtAvg },
  ];
}
function pitRows(a, b) {
  const full = (x) => countGroup(x.byCount, ["3-2"]);
  return [
    { head: "基本" },
    { label: "登板", a: a.g, b: b.g, fmt: (v) => v ?? "-" },
    { label: "投球回", a: a.outs, b: b.outs, fmt: (v) => (v == null ? "-" : `${Math.floor(v / 3)}回${v % 3 ? (v % 3) + "/3" : ""}`) },
    { label: "奪三振", a: a.k, b: b.k, fmt: (v) => v ?? "-" },
    { label: "QS", a: a.qs, b: b.qs, fmt: (v) => v ?? "-" },
    { head: "率" },
    { label: "防御率（7回換算）", note: "低いほどよい", a: a.era7, b: b.era7, fmt: (v) => fmtNum(v), lowGood: true },
    { label: "被打率", note: "低いほどよい", a: a.oppAvg, b: b.oppAvg, fmt: fmtAvg, lowGood: true },
    { label: "奪三振率（7回換算）", a: a.k7, b: b.k7, fmt: (v) => fmtNum(v) },
    { label: "四死球の割合", note: "低いほどよい", a: a.bbPct, b: b.bbPct, fmt: fmtPct, lowGood: true },
    { label: "初球ストライク率", a: a.fpsPct, b: b.fpsPct, fmt: fmtPct },
    { label: "ストライク率", a: a.strikePct, b: b.strikePct, fmt: fmtPct },
    { label: "QS率", a: a.qsPct, b: b.qsPct, fmt: fmtPct },
    { head: "カウント・左右" },
    { label: "3-2からの被出塁率", note: "低いほどよい", a: full(a).obp, b: full(b).obp, fmt: fmtAvg, lowGood: true },
    { label: "対右打者の被打率", note: "低いほどよい", a: a.vsR.oppAvg, b: b.vsR.oppAvg, fmt: fmtAvg, lowGood: true },
    { label: "対左打者の被打率", note: "低いほどよい", a: a.vsL.oppAvg, b: b.vsL.oppAvg, fmt: fmtAvg, lowGood: true },
  ];
}

function viewCompare(presetPid) {
  if (presetPid) { C.A = null; C.B = null; }
  ensureCompare(presetPid);
  if (presetPid) history.replaceState(null, "", "#/analysis/compare");
  if (C.mode === "pit") { if (C.A.who === "team") C.A.who = pitchers(filteredGames(C.A.f))[0] || C.A.who; if (C.B.who === "team") C.B.who = pitchers(filteredGames(C.B.f))[1] || pitchers(filteredGames(C.B.f))[0] || C.B.who; }
  const ga = filteredGames(C.A.f), gb = filteredGames(C.B.f);
  const pa = C.A.who === "team" ? null : C.A.who, pb = C.B.who === "team" ? null : C.B.who;
  let rows, noData = false;
  if (C.mode === "bat") {
    const a = batting(ga, pa, state.settings), b = batting(gb, pb, state.settings);
    rows = batRows(a, b); noData = !a.pa && !b.pa;
  } else {
    const a = pitching(ga, pa, state.settings), b = pitching(gb, pb, state.settings);
    rows = pitRows(a, b); noData = !a.bf && !b.bf;
  }
  const inner = `
    <div class="row noprint" style="margin-bottom:10px">
      <div class="seg" id="cmode"><button type="button" data-v="bat" class="${C.mode === "bat" ? "on" : ""}">打撃でくらべる</button><button type="button" data-v="pit" class="${C.mode === "pit" ? "on" : ""}">投球でくらべる</button></div>
      <span class="grow"></span>
      <button class="btn sm" id="pPeriod" title="Aと同じ選手を、Bに入れて期間を変えます">同じ選手で期間をくらべる</button>
      <button class="btn sm" id="pSwap">AとBを入れかえる</button>
      <button class="btn sm" id="pPrint">🖨 印刷</button>
    </div>
    <div class="cmpsel noprint">${selCard("A", C.A)}${selCard("B", C.B)}</div>
    <section class="page" style="margin-top:12px">
      <header class="phead"><div><div class="muted small">${esc(state.settings.teamName || "野球部")}　比較</div>
        <div class="pname" style="font-size:18px"><span class="sw a"></span>${esc(label(C.A))}<br><span class="sw b"></span>${esc(label(C.B))}</div></div></header>
      ${noData ? `<div class="empty">この組み合わせでは、まだ記録がありません。選手や範囲を変えてください。</div>` : compareTable(rows, "A", "B")}
      <p class="muted small">太字がよいほう（「低いほどよい」の項目は、小さいほうが太字）。棒は2つのうち大きいほうを100%としています。打席の少ない期間は、率が大きくぶれます。</p>
    </section>`;
  return { html: shell("compare", inner), after: (root) => {
    $$("#cmode button", root).forEach((b) => b.onclick = () => {
      C.mode = b.dataset.v;
      const pool = C.mode === "pit" ? pitchers(filteredGames(C.A.f)) : batters(filteredGames(C.A.f));
      if (!pool.includes(C.A.who)) C.A.who = pool[0] || C.A.who;
      if (!pool.includes(C.B.who)) C.B.who = pool[1] || pool[0] || C.B.who;
      rerender();
    });
    for (const key of ["A", "B"]) {
      const card = root.querySelector(`[data-side="${key}"]`);
      card.querySelector("[data-who]").onchange = (e) => { C[key].who = e.target.value; rerender(); };
      // 比較の範囲は、ほかの画面の絞り込みとは別にしておく
      $$("[data-f]", card).forEach((el) => el.addEventListener("change", () => {
        const k = el.dataset.f, f = C[key].f;
        f[k] = k === "season" ? (el.value ? Number(el.value) : "") : el.value;
        if (k === "by" || k === "season") f.value = f.by === "last" ? "5" : "";
        rerender();
      }));
    }
    $("#pPeriod", root).onclick = () => { C.B = { who: C.A.who, f: { ...C.A.f } }; C.A.f = { season: C.A.f.season, by: "all", value: "" }; C.B.f.by = "last"; C.B.f.value = "5"; rerender(); };
    $("#pSwap", root).onclick = () => { [C.A, C.B] = [C.B, C.A]; rerender(); };
    $("#pPrint", root).onclick = () => window.print();
  } };
}

// ---------------------------------------------------------------------
//  カウント別：チーム全体の表と、選手ごとの一覧
// ---------------------------------------------------------------------
let cWho = "bat", cSort = { k: "fullObp", asc: false };
function viewCount() {
  const gs = filteredGames(F);
  const isP = cWho === "pit";
  const ids = isP ? pitchers(gs) : batters(gs);
  const team = isP ? null : batting(gs, null, state.settings);
  const rows = ids.map((pid) => {
    const x = isP ? pitching(gs, pid, state.settings) : batting(gs, pid, state.settings);
    const G = Object.fromEntries(COUNT_GROUPS.map((g) => [g.k, countGroup(x.byCount, g.keys)]));
    const two = countGroup(x.byCount, ["0-2", "1-2", "2-2", "3-2"]);
    return { pid, name: nm(pid), _href: `#/player/${pid}`, pa: isP ? x.bf : x.pa,
      firstAvg: G.first.avg, aheadAvg: G.ahead.avg, behindAvg: G.behind.avg, twoAvg: two.avg, twoK: two.kRate,
      fullPa: G.full.pa, fullAvg: G.full.avg, fullObp: G.full.obp };
  });
  const P = isP ? "被" : "";
  const cols = [
    { k: "name", label: isP ? "投手" : "選手", l: true, stick: true, fmt: (v, r) => `<a href="#/player/${r.pid}">${esc(v)}</a>` },
    { k: "pa", label: isP ? "打者" : "打席" },
    { k: "firstAvg", label: `初球${P}打率`, fmt: fmtAvg },
    { k: "aheadAvg", label: `打者有利${P}打率`, fmt: fmtAvg },
    { k: "behindAvg", label: `投手有利${P}打率`, fmt: fmtAvg },
    { k: "twoAvg", label: `2ストライク後${P}打率`, fmt: fmtAvg },
    { k: "twoK", label: "2ストライク後三振率", fmt: fmtPct },
    { k: "fullPa", label: "3-2の打席" },
    { k: "fullAvg", label: `3-2から${P}打率`, fmt: fmtAvg },
    { k: "fullObp", label: `3-2から${P}出塁率`, fmt: fmtAvg, hl: () => true },
  ];
  // 投手のときは、全投手を合わせた表（相手打者の成績）
  let panel;
  if (isP) {
    const all = ids.map((pid) => pitching(gs, pid, state.settings));
    const byCount = {};
    for (const x of all) for (const [k, v] of Object.entries(x.byCount)) { const b = (byCount[k] = byCount[k] || { pa: 0, ab: 0, h: 0, k: 0, bb: 0, hbp: 0, sf: 0, tb: 0 }); for (const f of Object.keys(b)) b[f] += v[f] || 0; }
    for (const k of Object.keys(byCount)) byCount[k] = countGroup(byCount, [k]);
    const groups = Object.fromEntries(COUNT_GROUPS.map((g) => [g.k, countGroup(byCount, g.keys)]));
    panel = Object.keys(byCount).length ? countPanel(byCount, groups, { id: "teamP", pitcher: true }) : `<div class="card empty">投手の記録がありません。</div>`;
  } else panel = countPanel(team.byCount, team.groups, { id: "teamB" });
  const inner = `${filterBar(F)}
    <div class="row noprint" style="margin:10px 0"><div class="seg" id="cwho"><button type="button" data-v="bat" class="${!isP ? "on" : ""}">自チームの打者</button><button type="button" data-v="pit" class="${isP ? "on" : ""}">自チームの投手（相手打者）</button></div>
      <span class="muted small grow">${esc(filterLabel(F))}（${gs.length}試合）</span></div>
    <h2>${isP ? "チーム全体（投手陣）" : "チーム全体"}</h2>
    ${panel}
    <h2>${isP ? "投手ごと" : "選手ごと"}</h2>
    ${sortableTable("ct", cols, rows, cSort, (s) => { cSort = s; rerender(); })}
    <p class="muted small">打者有利＝1-0・2-0・3-0・2-1・3-1、投手有利＝0-1・0-2・1-2。名前を押すと、その選手のカウント別の表が見られます。</p>`;
  return { html: shell("count", inner), after: (root) => {
    bindFilter(root, F, rerender); bindCountPanels(root, rerender);
    $$("#cwho button", root).forEach((b) => b.onclick = () => { cWho = b.dataset.v; rerender(); });
  } };
}

// ---------------------------------------------------------------------
//  打球方向：選手ごとの図（または相手打者を投手ごとに）
// ---------------------------------------------------------------------
let sSide = "off", sSel = "";
function viewSpray(pre) {
  if (pre) { sSel = pre; sSide = "off"; history.replaceState(null, "", "#/analysis/spray"); }
  const gs = filteredGames(F);
  const ids = sSide === "off" ? batters(gs) : pitchers(gs);
  if (sSel && !ids.includes(sSel)) sSel = "";
  const sp = spray(gs, sSel || null, state.settings, sSide);
  const who = sSel ? nm(sSel) : sSide === "off" ? "チーム全体" : "相手打者（全投手）";
  const bats = sSel && sSide === "off" ? player(sSel)?.bats : null;
  const minis = ids.map((pid) => { const s = spray(gs, pid, state.settings, sSide); return { pid, s }; }).filter((x) => x.s.T.withDir > 0);
  const inner = `${filterBar(F)}
    <div class="row noprint" style="margin:10px 0"><div class="seg" id="sside"><button type="button" data-v="off" class="${sSide === "off" ? "on" : ""}">自チームの打者</button><button type="button" data-v="def" class="${sSide === "def" ? "on" : ""}">相手の打者（投手別）</button></div>
      <span class="muted small grow">${esc(filterLabel(F))}（${gs.length}試合）</span></div>
    <div class="two-col">
      <div class="card">
        <div class="row" style="justify-content:space-between"><h2 style="margin:0">${esc(who)}${bats ? ` <span class="hand">${HAND[bats]}打</span>` : ""}</h2>
          <span class="muted small">打球 ${sp.T.n}・安打 ${sp.T.h}</span></div>
        ${sprayChart(sp, { title: who + "の打球方向" })}
        <p class="muted small" style="text-align:center;margin:0">数字＝打球の数、下＝そのうち安打。色が濃いほど打球が多い方向。</p>
      </div>
      <div class="stack">
        <div class="card stack"><strong>左・中・右の割合</strong>${pullBar(sp.T)}
          <p class="muted small" style="margin:0">右打者は左方向、左打者は右方向が「引っ張り」です（両打ちは打席ごとに判断）。</p></div>
        <div class="card stack"><strong>打球の種類</strong>
          <div class="tiles"><div class="tile"><div class="k">ゴロ</div><div class="v">${sp.T.go}</div></div><div class="tile"><div class="k">フライ</div><div class="v">${sp.T.fo}</div></div><div class="tile"><div class="k">ライナー</div><div class="v">${sp.T.lo}</div></div></div></div>
      </div>
    </div>
    <h2>方向ごとの内訳</h2>
    ${sprayTable(sp)}
    <h2>${sSide === "off" ? "選手ごと" : "投手ごと"}</h2>
    <div class="spraygrid">
      <a href="#/analysis/spray" data-pick="" class="${sSel === "" ? "on" : ""}"><span class="nm">${sSide === "off" ? "チーム全体" : "全投手"}</span>${sprayChart(spray(gs, null, state.settings, sSide), { mini: true })}</a>
      ${minis.map(({ pid, s }) => `<a href="#/analysis/spray" data-pick="${pid}" class="${sSel === pid ? "on" : ""}"><span class="nm">${esc(nm(pid))}</span><span class="muted small">打球 ${s.T.withDir}</span>${sprayChart(s, { mini: true })}</a>`).join("")}
    </div>
    ${minis.length === 0 ? `<p class="muted">打球方向を記録した打球がまだありません。入力画面で「打った！」のあとに方向を選ぶと、ここに出ます。</p>` : ""}`;
  return { html: shell("spray", inner), after: (root) => {
    bindFilter(root, F, rerender);
    $$("#sside button", root).forEach((b) => b.onclick = () => { sSide = b.dataset.v; sSel = ""; rerender(); });
    $$("[data-pick]", root).forEach((a) => a.onclick = (e) => { e.preventDefault(); sSel = a.dataset.pick; rerender(); window.scrollTo({ top: 0, behavior: "smooth" }); });
  } };
}

// ---------------------------------------------------------------------
//  守備：守備位置ごと・選手ごと
// ---------------------------------------------------------------------
let fSort = { k: "outs", asc: false };
function viewField() {
  const gs = filteredGames(F);
  const fd = fielding(gs);
  const posRows = ["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((pos) => {
    const x = fd.positions[pos] || { outs: 0, e: 0, fpct: null, players: {} };
    const ps = Object.entries(x.players || {}).sort((a, b) => b[1] - a[1]);
    return `<tr><td class="l"><b>${pos}</b> ${POSFULL[pos]}</td><td class="l">${ps.map(([pid, n]) => `${esc(nm(pid))}<span class="muted small">（${n}）</span>`).join("、") || "-"}</td><td>${x.outs}</td><td>${x.e}</td><td><b>${x.fpct == null ? "-" : fmtAvg(x.fpct)}</b></td></tr>`;
  }).join("");
  const rows = Object.values(fd.players).filter((x) => x.g || x.outs || x.e || x.sbA || x.csC || x.pb).map((x) => ({
    pid: x.pid, name: nm(x.pid), _href: `#/player/${x.pid}`, g: x.g,
    posText: Object.entries(x.games).sort((a, b) => b[1] - a[1]).map(([p, n]) => `${POSFULL[p] || p}${n}`).join("・"),
    outs: x.outs, e: x.e, fpct: x.fpct, csPct: x.csC + x.sbA ? x.csPct : null, cs: x.csC, sbA: x.sbA, pb: x.pb,
  }));
  const cols = [
    { k: "name", label: "選手", l: true, stick: true, fmt: (v, r) => `<a href="#/player/${r.pid}">${esc(v)}</a>` },
    { k: "posText", label: "守った位置（先発の試合数）", l: true },
    { k: "outs", label: "打球の処理" }, { k: "e", label: "失策" }, { k: "fpct", label: "守備率（簡易）", fmt: (v) => (v == null ? "-" : fmtAvg(v)), hl: () => true },
    { k: "cs", label: "盗塁を刺した" }, { k: "sbA", label: "盗塁された" }, { k: "csPct", label: "盗塁阻止率", fmt: fmtPct }, { k: "pb", label: "捕逸" },
  ];
  const T = fd.team;
  const inner = `${filterBar(F)}
    <p class="muted small" style="margin:10px 0">${esc(filterLabel(F))}（${gs.length}試合）</p>
    <div class="tiles">
      <div class="tile"><div class="k">守備率（簡易）</div><div class="v">${T.fpct == null ? "-" : fmtAvg(T.fpct)}</div></div>
      <div class="tile"><div class="k">失策</div><div class="v">${T.e}</div></div>
      <div class="tile"><div class="k">1試合あたりの失策</div><div class="v">${gs.length ? (T.e / gs.length).toFixed(1) : "-"}</div></div>
      <div class="tile"><div class="k">盗塁阻止率</div><div class="v">${fmtPct(T.csPct)}</div></div>
      <div class="tile"><div class="k">捕逸</div><div class="v">${T.pb}</div></div>
    </div>
    <h2>守備位置ごと</h2>
    <div class="tablewrap"><table><thead><tr><th class="l">守備位置</th><th class="l">守った選手（先発の試合数）</th><th>打球の処理</th><th>失策</th><th>守備率（簡易）</th></tr></thead><tbody>${posRows}</tbody></table></div>
    <h2>選手ごと</h2>
    ${sortableTable("ft", cols, rows, fSort, (s) => { fSort = s; rerender(); })}
    <div class="alert" style="margin-top:12px"><b>守備率（簡易）について</b>：打球の処理 ÷（打球の処理＋失策）。<b>打球の処理</b>は、相手の打球のうち、記録した<b>打球方向の守備位置</b>でアウトにした数です（ゴロ・フライ・ライナー・併殺・犠打・犠飛・進塁打・野選）。送球を受けた一塁手や、三振を取った捕手の分は入らないため、公式の守備率とは少し違います。打球方向を入れていない打席は数えません。
    ${T.eNoName ? `<br>選手を選ばずに記録した失策が ${T.eNoName} あります（チーム全体の数には入っています）。` : ""}</div>`;
  return { html: shell("field", inner), after: (root) => bindFilter(root, F, rerender) };
}
