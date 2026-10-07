// =====================================================================
//  相手分析（views/scout.js）
//  ・自チームとの試合での相手の成績
//  ・相手チームどうしの試合（偵察）
//  を相手チームごとにまとめます。自チームの成績・ランキング・印刷には入りません。
// =====================================================================
import * as store from "../store.js";
import { state } from "../store.js";
import { esc, $, $$, player, numberOf, HAND, oppPlayers, oppTeams, scoutGames, liveGames, tournaments, tname, today, thisSeason, seasons, sortableTable, toast, byDate } from "../ui.js";
import { countGroup, batting, pitching, spray, teamView, teamViews, teamRole, teamRunsByInning, gameState, fmtAvg, fmtPct, fmtNum, R, playNote, seasonOf } from "../stats.js";
import { countPanel, bindCountPanels, sprayChart, pullBar } from "./charts.js";
import { itemText, editItemSheet } from "./game.js";

const rerender = () => window.dispatchEvent(new Event("hashchange"));
const enc = encodeURIComponent;
const teamHref = (t, tab = "") => `#/scout/team/${enc(t)}${tab ? "/" + tab : ""}`;
const SF = { season: thisSeason(), last: "" }; // 相手分析の絞り込み（年度・直近）
const pno = (p) => (numberOf(p) !== "" ? "#" + esc(numberOf(p)) + " " : "");
const pnm = (pid) => { const p = player(pid); return p ? pno(p) + esc(p.name) : "（名前なし）"; };
const canWrite = () => state.role !== "viewer";

// そのチームが出た試合（古い順）
function gamesFor(team) {
  let gs = [...liveGames(), ...scoutGames()].filter((g) => teamRole(g, team));
  if (SF.season) gs = gs.filter((g) => seasonOf(g.date) === Number(SF.season));
  gs.sort(byDate);
  if (SF.last) gs = gs.slice(-Number(SF.last));
  return gs;
}
function filterRow() {
  return `<div class="card row noprint" id="sf">
    <label class="f" style="min-width:110px">年度<select data-sf="season">${seasons().map((s) => `<option value="${s}" ${Number(SF.season) === s ? "selected" : ""}>${s}年度</option>`).join("")}<option value="" ${!SF.season ? "selected" : ""}>全年度</option></select></label>
    <label class="f" style="min-width:130px">範囲<select data-sf="last"><option value="">すべての試合</option>${[1, 3, 5, 10].map((n) => `<option value="${n}" ${String(SF.last) === String(n) ? "selected" : ""}>${n === 1 ? "最新の1試合" : `直近${n}試合`}</option>`).join("")}</select></label>
  </div>`;
}
function bindFilterRow(root) {
  $$("[data-sf]", root).forEach((el) => el.onchange = () => { SF[el.dataset.sf] = el.value === "" ? "" : el.dataset.sf === "season" ? Number(el.value) : el.value; rerender(); });
}
// 試合のスコア（そのチームから見て）
function scoreFor(g, team) {
  const st = gameState(g), role = teamRole(g, team);
  const mine = role === "top" ? st.score.us : st.score.them, theirs = role === "top" ? st.score.them : st.score.us;
  return { mine, theirs, wl: mine > theirs ? "勝" : mine < theirs ? "負" : "分" };
}
const ipText = (outs) => { const w = Math.floor(outs / 3), f = outs % 3; return f ? (w ? w + "回" : "") + f + "/3" : w + "回"; };

// ---------------------------------------------------------------------
//  一覧
// ---------------------------------------------------------------------
export function viewScout() {
  const teams = oppTeams();
  const cards = teams.map((t) => {
    const gs = gamesFor(t);
    const vs = gs.filter((g) => !g.scout).length, sc = gs.length - vs;
    const T = batting(teamViews(gs, t), null, state.settings);
    return `<a class="card gameitem" href="${teamHref(t)}" style="grid-template-columns:1fr auto">
      <span style="min-width:0"><strong>${esc(t)}</strong><br><span class="muted small">試合 ${gs.length}（対戦 ${vs}・偵察 ${sc}）　登録選手 ${oppPlayers(t).length}人</span></span>
      <span style="text-align:right"><span class="muted small">チーム打率</span><br><b>${T.pa ? fmtAvg(T.avg) : "-"}</b></span></a>`;
  }).join("");
  const html = `<div class="row" style="justify-content:space-between"><h1>相手分析</h1>
      ${canWrite() ? `<a class="btn primary" href="#/scout/game/new">＋ 相手どうしの試合を記録</a>` : ""}</div>
    <p class="muted small" style="margin-top:-6px">自チームとの試合での相手の成績と、相手チームどうしの試合（偵察）をチームごとにまとめます。ここの記録は、<b>自チームの成績・ランキング・印刷には入りません</b>。</p>
    ${filterRow()}
    ${canWrite() ? `<form class="row noprint" id="newteam" style="margin:12px 0"><label class="f grow">新しい相手チームを追加（先に選手を登録するとき）<input type="text" id="tn" placeholder="例：〇〇中" list="tlist"></label><datalist id="tlist">${teams.map((t) => `<option value="${esc(t)}">`).join("")}</datalist><button class="btn" style="align-self:end">開く</button></form>` : ""}
    <div class="gamelist">${cards || `<div class="card empty">まだ相手チームがありません。試合を入力するか、上でチームを追加してください。</div>`}</div>`;
  return { html, after: (root) => {
    bindFilterRow(root);
    const f = $("#newteam", root);
    if (f) f.onsubmit = (e) => { e.preventDefault(); const t = $("#tn", root).value.trim(); if (t) location.hash = teamHref(t, "roster"); };
  } };
}

// ---------------------------------------------------------------------
//  チームのページ
// ---------------------------------------------------------------------
const TTABS = [["sum", "まとめ"], ["bat", "打者"], ["pit", "投手"], ["games", "試合"], ["roster", "選手登録"]];
let batSort = { k: "ops", asc: false }, pitSort = { k: "outs", asc: false };

export function viewScoutTeam(teamEnc, tab = "sum") {
  const team = decodeURIComponent(teamEnc || "");
  tab = tab || "sum";
  const gs = gamesFor(team);
  const views = teamViews(gs, team);
  const S = state.settings;
  const head = `<div class="row noprint"><a href="#/scout" class="btn sm">‹ 相手分析</a><span class="grow"></span>${canWrite() ? `<a class="btn sm" href="#/scout/game/new?t=${enc(team)}">＋ ${esc(team)}の試合を記録</a>` : ""}</div>
    <h1>${esc(team)} <span class="muted" style="font-size:15px">相手分析</span></h1>
    <nav class="tabs noprint">${TTABS.map(([k, l]) => `<a href="${teamHref(team, k)}" class="${tab === k ? "on" : ""}">${l}</a>`).join("")}</nav>
    ${tab !== "roster" ? filterRow() : ""}
    ${tab !== "roster" ? `<p class="muted small">${SF.season ? SF.season + "年度" : "全年度"}・${SF.last ? (SF.last === "1" ? "最新の1試合" : `直近${SF.last}試合`) : "すべての試合"}（${gs.length}試合）</p>` : ""}`;
  let body = "", after = () => {};
  const batIds = [...new Set(views.flatMap((v) => (v.log || []).filter((i) => i.k === "pa" && i.side === "off" && i.batter).map((i) => i.batter)))];
  const pitIds = [...new Set(views.flatMap((v) => (v.log || []).filter((i) => i.k === "pa" && i.side === "def" && i.pitcher).map((i) => i.pitcher)))];

  if (tab === "sum") {
    const T = batting(views, null, S);
    const runs = teamRunsByInning(views);
    const n = views.length || 1;
    const pas = views.flatMap((v) => (v.log || []).filter((i) => i.k === "pa" && i.side === "off" && R[i.res] && i.p));
    const swing1 = pas.filter((i) => /^[XKF]/.test(i.p.toUpperCase())).length;
    const sacs = pas.filter((i) => i.res === "SAC").length;
    const xbh = T.s2 + T.s3 + T.hr;
    const rows = batIds.map((pid) => ({ pid, b: batting(views, pid, S) })).filter((x) => x.b.pa >= 3).sort((a, b) => (b.b.ops ?? -1) - (a.b.ops ?? -1)).slice(0, 3);
    const pits = pitIds.map((pid) => ({ pid, p: pitching(views, pid, S) })).sort((a, b) => b.p.outs - a.p.outs).slice(0, 3);
    const maxInn = Math.max(7, ...Object.keys(runs.by).map(Number));
    const maxRun = Math.max(1, ...Object.values(runs.by));
    const tile = (k, v, sub = "") => `<div class="tile"><div class="k">${k}</div><div class="v">${v}</div>${sub ? `<div class="muted small">${sub}</div>` : ""}</div>`;
    body = !views.length ? `<div class="card empty">この範囲には、${esc(team)}の試合がありません。</div>` : `
      <h2>チームの打撃</h2>
      <div class="tiles">
        ${tile("試合", views.length)}${tile("チーム打率", fmtAvg(T.avg))}${tile("出塁率", fmtAvg(T.obp))}${tile("OPS", fmtAvg(T.ops))}
        ${tile("1試合の平均得点", (runs.total / n).toFixed(1))}${tile("1試合の三振", (T.k / n).toFixed(1))}${tile("1試合の四死球", ((T.bb + T.hbp) / n).toFixed(1))}${tile("盗塁", T.sb, `1試合 ${(T.sb / n).toFixed(1)}`)}
      </div>
      <h2>打席の傾向</h2>
      <div class="tiles">
        ${tile("初球から振ってくる", fmtPct(pas.length ? swing1 / pas.length : null), "初球をスイング（空振り・ファウル・打った）")}
        ${tile("初球打率", fmtAvg(T.first.avg), `${T.first.h}/${T.first.ab}`)}
        ${tile("追い込まれてからの打率", fmtAvg(T.two.avg), `三振率 ${fmtPct(T.two.kRate)}`)}
        ${tile("3-2からの出塁率", fmtAvg(T.full.obp), `${T.full.on}/${T.full.pa}打席`)}
        ${tile("長打", xbh, `二塁打${T.s2}・三塁打${T.s3}・本塁打${T.hr}`)}
        ${tile("犠打", sacs)}
      </div>
      <h2>要注意打者</h2>
      ${rows.length ? `<div class="spraygrid" style="grid-template-columns:repeat(auto-fill,minmax(230px,1fr))">${rows.map(({ pid, b }) => { const sp = spray(views, pid, S); return `<a href="#/scout/player/${pid}"><span class="nm">${pnm(pid)} <span class="hand">${HAND[player(pid)?.bats] || ""}打</span></span>
        <span class="small">打率 <b>${fmtAvg(b.avg)}</b>　OPS <b>${fmtAvg(b.ops)}</b>　本塁打 ${b.hr}　打点 ${b.rbi}</span>
        <span class="small muted">得点圏 ${fmtAvg(b.risp.avg)}・初球 ${fmtAvg(b.first.avg)}・追い込まれて ${fmtAvg(b.two.avg)}・${b.pa}打席</span>
        ${sp.T.withDir ? sprayChart(sp, { mini: true }) : `<span class="muted small">打球方向の記録なし</span>`}</a>`; }).join("")}</div>
        <p class="muted small">3打席以上の打者のうち、OPSが高い順に3人。</p>` : `<p class="muted">打者の名前を入れた打席が、まだ少ないです（3打席以上の打者がいません）。</p>`}
      <h2>おもな投手</h2>
      ${pits.length ? `<div class="tablewrap"><table><thead><tr><th class="l">投手</th><th>登板</th><th>投球回</th><th>球数</th><th>被打率</th><th>奪三振</th><th>四死球</th><th>初球S率</th><th>失点</th></tr></thead><tbody>
        ${pits.map(({ pid, p }) => `<tr><td class="l"><a href="#/scout/player/${pid}">${pnm(pid)}</a> <span class="hand">${HAND[player(pid)?.throws] || ""}投</span></td><td>${p.g}</td><td>${p.ipText}</td><td>${p.pitches}</td><td>${fmtAvg(p.oppAvg)}</td><td>${p.k}</td><td>${p.bb + p.hbp}</td><td>${fmtPct(p.fpsPct)}</td><td>${p.runs}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">投手の名前を入れた記録がまだありません。</p>`}
      <h2>得点のパターン（回ごとの得点の合計）</h2>
      <div class="card stack" style="gap:4px">${Array.from({ length: maxInn }, (_, i) => i + 1).map((inn) => { const r = runs.by[inn] || 0; return `<div class="row" style="gap:8px;flex-wrap:nowrap"><span style="width:34px;text-align:right" class="small"><b>${inn}回</b></span><span class="grow" style="background:var(--surface-2);border-radius:4px;height:16px;position:relative"><i style="position:absolute;inset:0 auto 0 0;width:${(r / maxRun) * 100}%;background:var(--ser-b);border-radius:4px"></i></span><span style="width:42px" class="small">${r}点</span></div>`; }).join("")}
        <p class="muted small" style="margin:6px 0 0">合計 ${runs.total}点（${views.length}試合）</p></div>
      <h2>カウント別の成績</h2>
      ${countPanel(T.byCount, T.groups, { id: "scT" })}
      <h2>打球方向</h2>
      ${(() => { const sp = spray(views, null, S); return sp.T.withDir ? `<div class="two-col"><div class="card">${sprayChart(sp, { title: team + "の打球方向" })}</div><div class="card stack"><strong>左・中・右の割合</strong>${pullBar(sp.T)}</div></div>` : `<p class="muted">打球方向の記録がまだありません。</p>`; })()}`;
    after = (root) => bindCountPanels(root, rerender);
  }

  if (tab === "bat") {
    const T = batting(views, null, S);
    const rows = batIds.map((pid) => { const b = batting(views, pid, S); const p = player(pid); return {
      pid, _href: `#/scout/player/${pid}`, no: Number(numberOf(p)) || 999, name: p?.name || "?", bats: HAND[p?.bats] || "",
      g: b.g, pa: b.pa, ab: b.ab, h: b.h, hr: b.hr, rbi: b.rbi, k: b.k, bbhbp: b.bb + b.hbp, sb: b.sb,
      avg: b.avg, obp: b.obp, slg: b.slg, ops: b.ops, kRate: b.kRate, risp: b.risp.avg, first: b.first.avg, two: b.two.avg, full: b.full.pa ? b.full.obp : null }; });
    const named = rows.reduce((a, r) => a + r.pa, 0);
    const cols = [
      { k: "no", label: "背番号", fmt: (v) => (v === 999 ? "-" : v) },
      { k: "name", label: "選手", l: true, stick: true, fmt: (v, r) => `<a href="#/scout/player/${r.pid}">${esc(v)}</a> <span class="muted small">${r.bats}</span>` },
      { k: "g", label: "試合" }, { k: "pa", label: "打席" }, { k: "ab", label: "打数" }, { k: "h", label: "安打" }, { k: "hr", label: "本塁打" }, { k: "rbi", label: "打点" },
      { k: "k", label: "三振" }, { k: "bbhbp", label: "四死球" }, { k: "sb", label: "盗塁" },
      { k: "avg", label: "打率", fmt: fmtAvg, hl: () => true }, { k: "obp", label: "出塁率", fmt: fmtAvg }, { k: "slg", label: "長打率", fmt: fmtAvg }, { k: "ops", label: "OPS", fmt: fmtAvg },
      { k: "kRate", label: "三振率", fmt: fmtPct }, { k: "risp", label: "得点圏", fmt: fmtAvg }, { k: "first", label: "初球打率", fmt: fmtAvg }, { k: "two", label: "追込後打率", fmt: fmtAvg }, { k: "full", label: "3-2出塁率", fmt: fmtAvg },
    ];
    body = sortableTable("sbat", cols, rows, batSort, (s) => { batSort = s; rerender(); }) +
      (T.pa > named ? `<p class="muted small">名前を入れていない打席が ${T.pa - named} あります（チーム全体の数には入っています）。</p>` : "") +
      `<p class="muted small">見出しを押すと並べ替え、名前を押すとその選手のくわしい成績が見られます。</p>`;
  }

  if (tab === "pit") {
    const rows = pitIds.map((pid) => { const x = pitching(views, pid, S); const p = player(pid); return {
      pid, _href: `#/scout/player/${pid}`, name: p?.name || "?", thr: HAND[p?.throws] || "", g: x.g, gs: x.gs, outs: x.outs, ipText: x.ipText, pitches: x.pitches, bf: x.bf, h: x.h, k: x.k, bbhbp: x.bb + x.hbp, runs: x.runs,
      oppAvg: x.oppAvg, fps: x.fpsPct, str: x.strikePct, k7: x.k7, bbPct: x.bbPct, ppi: x.outs ? (x.pitches / x.outs) * 3 : null }; });
    const cols = [
      { k: "name", label: "投手", l: true, stick: true, fmt: (v, r) => `<a href="#/scout/player/${r.pid}">${esc(v)}</a> <span class="muted small">${r.thr}投</span>` },
      { k: "g", label: "登板" }, { k: "gs", label: "先発" }, { k: "outs", label: "投球回", fmt: (v, r) => r.ipText }, { k: "pitches", label: "球数" }, { k: "ppi", label: "1回の球数", fmt: (v) => fmtNum(v, 1) },
      { k: "bf", label: "打者" }, { k: "h", label: "被安打" }, { k: "k", label: "奪三振" }, { k: "bbhbp", label: "四死球" }, { k: "runs", label: "失点" },
      { k: "oppAvg", label: "被打率", fmt: fmtAvg, hl: () => true }, { k: "k7", label: `奪三振率(${S.innings}回)`, fmt: (v) => fmtNum(v) }, { k: "bbPct", label: "四死球の割合", fmt: fmtPct },
      { k: "fps", label: "初球S率", fmt: fmtPct }, { k: "str", label: "S率", fmt: fmtPct },
    ];
    body = sortableTable("spit", cols, rows, pitSort, (s) => { pitSort = s; rerender(); }) + `<p class="muted small">失点は、その投手が投げているあいだに入った点です（自責点は分からないため出していません）。</p>`;
  }

  if (tab === "games") {
    const list = [...gs].reverse();
    body = `<div class="gamelist">${list.map((g) => { const s = scoreFor(g, team), v = teamView(g, team); return `<a class="card gameitem" href="#/game/${g.id}">
      <span class="gameno" style="font-size:12px">${g.scout ? "偵察" : "対戦"}</span>
      <span style="min-width:0"><strong>${esc(team)} 対 ${esc(v.vs === "自チーム" ? state.settings.teamName || "自チーム" : v.vs)}</strong><br><span class="muted small">${esc(g.date || "")}・${esc(tname(g.tournamentId))}${g.venue ? "・" + esc(g.venue) : ""}</span></span>
      <span style="text-align:right"><span class="score">${s.mine}-${s.theirs}</span><br><span class="chip ${s.wl === "勝" ? "win" : s.wl === "負" ? "lose" : ""}">${esc(team)}の${s.wl}</span></span></a>`; }).join("") || `<div class="card empty">試合がありません。</div>`}</div>`;
  }

  if (tab === "roster") {
    const pls = oppPlayers(team);
    const w = canWrite();
    const row = (p) => `<tr data-row="${p.id}">
      <td style="width:72px"><input data-k="no" value="${esc(numberOf(p))}" ${w ? "" : "disabled"}></td>
      <td class="l"><input data-k="name" value="${esc(p.name)}" style="min-width:140px" ${w ? "" : "disabled"}></td>
      <td><select data-k="throws" ${w ? "" : "disabled"}>${[["R", "右"], ["L", "左"]].map(([v, l]) => `<option value="${v}" ${(p.throws || "R") === v ? "selected" : ""}>${l}</option>`).join("")}</select></td>
      <td><select data-k="bats" ${w ? "" : "disabled"}>${[["R", "右"], ["L", "左"], ["S", "両"]].map(([v, l]) => `<option value="${v}" ${(p.bats || "R") === v ? "selected" : ""}>${l}</option>`).join("")}</select></td>
      <td style="width:80px"><input data-k="pos" value="${esc(p.pos || "")}" placeholder="例：投" ${w ? "" : "disabled"}></td>
      <td class="l"><input data-k="memo" value="${esc(p.memo || "")}" style="min-width:160px" placeholder="例：足が速い・初球から振る" ${w ? "" : "disabled"}></td>
      <td>${w ? `<button class="btn sm" data-del="${p.id}">削除</button>` : ""}</td></tr>`;
    body = `<p class="muted small">背番号・名前・投げ方・打ち方を登録すると、試合の入力で選べるようになります（入力画面からもその場で登録できます）。変更は自動で保存されます。</p>
      <div class="tablewrap"><table id="roster"><thead><tr><th>背番号</th><th class="l">名前</th><th>投</th><th>打</th><th>守備</th><th class="l">メモ</th><th></th></tr></thead><tbody>
      ${pls.map(row).join("") || `<tr><td class="l" colspan="7">まだ登録されていません。</td></tr>`}</tbody></table></div>
      ${w ? `<form class="card row" id="addp" style="margin-top:12px;align-items:end">
        <label class="f" style="width:80px">背番号<input type="text" name="no" inputmode="numeric"></label>
        <label class="f grow">名前<input type="text" name="name" placeholder="例：山田"></label>
        <label class="f">投<select name="throws"><option value="R">右</option><option value="L">左</option></select></label>
        <label class="f">打<select name="bats"><option value="R">右</option><option value="L">左</option><option value="S">両</option></select></label>
        <label class="f" style="width:80px">守備<input type="text" name="pos" placeholder="例：遊"></label>
        <button class="btn primary">＋ 追加</button></form>` : ""}`;
    after = (root) => {
      $$("[data-row]", root).forEach((tr) => $$("[data-k]", tr).forEach((el) => el.onchange = () => {
        const p = player(tr.dataset.row); if (!p) return;
        const k = el.dataset.k, v = el.value.trim();
        const np = { ...p };
        if (k === "no") np.numbers = { ...(p.numbers || {}), [thisSeason()]: v };
        else if (k === "name") { if (!v) return toast("名前は空にできません"); np.name = v; }
        else np[k] = v;
        store.savePlayer(np); toast("保存しました");
      }));
      $$("[data-del]", root).forEach((b) => b.onclick = () => {
        const p = player(b.dataset.del);
        if (!p || !confirm(`${p.name} を削除しますか？（入力済みの打席の記録は残ります）`)) return;
        store.savePlayer({ ...p, deleted: true });
      });
      const f = $("#addp", root);
      if (f) f.onsubmit = (e) => {
        e.preventDefault();
        const name = f.name.value.trim(), no = f.no.value.trim();
        if (!name && !no) return toast("名前か背番号を入れてください");
        store.savePlayer({ name: name || `#${no}`, opp: team, numbers: no ? { [thisSeason()]: no } : {}, throws: f.throws.value, bats: f.bats.value, pos: f.pos.value.trim(), active: true });
        toast("追加しました");
        setTimeout(() => root.querySelector("#addp [name=no]")?.focus(), 50);
      };
    };
  }
  return { html: head + body, after: (root) => { bindFilterRow(root); after(root); } };
}

// ---------------------------------------------------------------------
//  相手選手のページ
// ---------------------------------------------------------------------
export function viewScoutPlayer(pid) {
  const p = player(pid);
  if (!p || !p.opp) return { html: `<div class="empty">選手が見つかりません。<a href="#/scout">相手分析へ</a></div>` };
  const team = p.opp, S = state.settings;
  const gs = gamesFor(team), views = teamViews(gs, team);
  const b = batting(views, pid, S), pit = pitching(views, pid, S);
  const sp = spray(views, pid, S);
  const sit = (l, x) => `<tr><td class="l">${l}</td><td>${x.pa}</td><td>${x.ab}</td><td>${x.h}</td><td>${fmtAvg(x.avg)}</td><td>${fmtAvg(x.obp)}</td><td>${x.k}</td><td>${fmtPct(x.kRate)}</td></tr>`;
  const games = views.map((v) => ({ v, pas: (v.log || []).filter((i) => i.k === "pa" && i.side === "off" && i.batter === pid) })).filter((x) => x.pas.length);
  const html = `<div class="row noprint"><a href="${teamHref(team, "bat")}" class="btn sm">‹ ${esc(team)}</a></div>
    <h1>${pno(p)}${esc(p.name)} <span class="muted" style="font-size:15px">${esc(team)}　${esc(p.pos || "")} ${HAND[p.throws] || ""}投${HAND[p.bats] || ""}打</span></h1>
    ${p.memo ? `<p class="alert">${esc(p.memo)}</p>` : ""}
    ${filterRow()}
    ${b.pa ? `<div class="tiles">
      <div class="tile"><div class="k">打率</div><div class="v">${fmtAvg(b.avg)}</div></div>
      <div class="tile"><div class="k">出塁率</div><div class="v">${fmtAvg(b.obp)}</div></div>
      <div class="tile"><div class="k">OPS</div><div class="v">${fmtAvg(b.ops)}</div></div>
      <div class="tile"><div class="k">安打</div><div class="v">${b.h}</div></div>
      <div class="tile"><div class="k">本塁打</div><div class="v">${b.hr}</div></div>
      <div class="tile"><div class="k">三振</div><div class="v">${b.k}</div></div>
      <div class="tile"><div class="k">盗塁</div><div class="v">${b.sb}</div></div>
    </div>
    <h2>場面・カウント</h2>
    <div class="tablewrap"><table><thead><tr><th class="l">場面</th><th>打席</th><th>打数</th><th>安打</th><th>打率</th><th>出塁率</th><th>三振</th><th>三振率</th></tr></thead><tbody>
      ${sit("すべて", b)}${sit("得点圏（2塁か3塁に走者）", b.risp)}${sit("初球を打った", b.first)}${sit("追い込まれてから（2ストライク）", b.two)}${sit("3-2（フルカウント）から", b.full)}
    </tbody></table></div>
    <h2>カウント別の成績</h2>
    ${countPanel(b.byCount, b.groups, { id: "spb" })}
    <h2>打球方向</h2>
    ${sp.T.withDir ? `<div class="two-col"><div class="card">${sprayChart(sp, { title: p.name + "の打球方向" })}</div><div class="card stack"><strong>左・中・右の割合</strong>${pullBar(sp.T)}</div></div>` : `<p class="muted">打球方向の記録がまだありません。</p>`}
    <h2>試合ごとの打席</h2>
    <div class="tablewrap"><table><thead><tr><th class="l">試合</th><th class="l">打席の結果</th></tr></thead><tbody>
      ${games.map(({ v, pas }) => `<tr><td class="l"><a href="#/game/${v.id}">${esc(v.date || "")} 対 ${esc(v.vs === "自チーム" ? state.settings.teamName || "自チーム" : v.vs)}</a></td><td class="l">${pas.map((i) => `${esc(playNote(i))}<span class="muted small">(${esc(i.p || "")})</span>`).join("　")}</td></tr>`).join("")}
    </tbody></table></div>` : `<p class="muted">この範囲では、打者としての記録がありません。</p>`}
    ${pit.bf ? `<h2>投手成績</h2>
      <div class="tiles">
        <div class="tile"><div class="k">登板</div><div class="v">${pit.g}</div></div>
        <div class="tile"><div class="k">投球回</div><div class="v">${pit.ipText}</div></div>
        <div class="tile"><div class="k">球数</div><div class="v">${pit.pitches}</div></div>
        <div class="tile"><div class="k">被打率</div><div class="v">${fmtAvg(pit.oppAvg)}</div></div>
        <div class="tile"><div class="k">奪三振</div><div class="v">${pit.k}</div></div>
        <div class="tile"><div class="k">四死球</div><div class="v">${pit.bb + pit.hbp}</div></div>
        <div class="tile"><div class="k">初球ストライク率</div><div class="v">${fmtPct(pit.fpsPct)}</div></div>
        <div class="tile"><div class="k">失点</div><div class="v">${pit.runs}</div></div>
      </div>
      <h3>カウント別の被打率</h3>
      ${countPanel(pit.byCount, Object.fromEntries([["first", ["0-0"]], ["ahead", ["1-0", "2-0", "3-0", "2-1", "3-1"]], ["even", ["1-1", "2-2"]], ["behind", ["0-1", "0-2", "1-2"]], ["full", ["3-2"]]].map(([k, keys]) => [k, groupOf(pit.byCount, keys)])), { id: "spp", pitcher: true })}` : ""}`;
  return { html, after: (root) => { bindFilterRow(root); bindCountPanels(root, rerender); } };
}
const groupOf = (byCount, keys) => countGroup(byCount, keys);

// ---------------------------------------------------------------------
//  相手どうしの試合：作成・情報の修正
// ---------------------------------------------------------------------
export function viewScoutGameEdit(id) {
  const orig = id ? state.games.find((g) => g.id === id && g.scout) : null;
  if (id && !orig) return { html: `<div class="empty">試合が見つかりません。</div>` };
  const preset = decodeURIComponent((location.hash.split("?t=")[1] || ""));
  const g = orig || { date: today(), tournamentId: tournaments()[tournaments().length - 1]?.id || "", venue: "", top: preset, bottom: "", lineup: [], pitcher: "", oppLineup: [], oppPitcherId: "" };
  const teams = oppTeams();
  const opts = (team, sel) => `<option value="">（選択）</option>` + oppPlayers(team).map((p) => `<option value="${p.id}" ${sel === p.id ? "selected" : ""}>${pno(p)}${esc(p.name)}</option>`).join("");
  const col = (key, label, team, line, pit) => `<div class="card stack" data-col="${key}">
      <label class="f">${label}<input type="text" name="${key}" value="${esc(team)}" list="tlist" required placeholder="例：〇〇中"></label>
      <div class="stack" style="gap:6px">${Array.from({ length: 9 }, (_, i) => `<div class="row lrow"><span class="lno">${i + 1}番</span><select class="grow" data-l="${i}">${opts(team, line?.[i])}</select></div>`).join("")}</div>
      <label class="f">先発投手<select data-pit>${opts(team, pit)}</select></label>
      <p class="muted small" style="margin:0" data-hint>${team && !oppPlayers(team).length ? `${esc(team)}の選手はまだ登録されていません。打順は空のままでも始められます（入力画面でその場で登録できます）。` : ""}</p>
    </div>`;
  const html = `<h1>${orig ? "試合情報を直す（相手どうしの試合）" : "相手どうしの試合を記録"}</h1>
    <p class="muted small" style="margin-top:-6px">この試合は相手分析だけに使います。自チームの成績には入りません。</p>
    <form id="sg" class="stack">
      <div class="card grid2">
        <label class="f">日付<input type="date" name="date" value="${esc(g.date)}" required></label>
        <label class="f">大会区分<select name="tournamentId">${tournaments().map((t) => `<option value="${t.id}" ${g.tournamentId === t.id ? "selected" : ""}>${esc(t.name)}</option>`).join("")}</select></label>
        <label class="f">会場（任意）<input type="text" name="venue" value="${esc(g.venue || "")}"></label>
      </div>
      <datalist id="tlist">${teams.map((t) => `<option value="${esc(t)}">`).join("")}</datalist>
      <div class="grid2">${col("top", "先攻（表）のチーム", g.top, g.lineup, g.pitcher)}${col("bottom", "後攻（裏）のチーム", g.bottom, g.oppLineup, g.oppPitcherId)}</div>
      <p class="small" id="sgw" hidden style="color:var(--out)"></p>
      <div class="row"><button class="btn primary big grow">${orig ? "保存する" : "保存して入力を始める"}</button><a class="btn big" href="${orig ? "#/game/" + orig.id : "#/scout"}">やめる</a></div>
    </form>`;
  const after = (root) => {
    const f = $("#sg", root);
    // チーム名を変えたら、選手の選択肢を入れかえる
    for (const key of ["top", "bottom"]) {
      const c = root.querySelector(`[data-col="${key}"]`);
      f[key].addEventListener("change", () => {
        const t = f[key].value.trim();
        $$("select", c).forEach((s) => { s.innerHTML = opts(t, s.value); });
        c.querySelector("[data-hint]").textContent = t && !oppPlayers(t).length ? `${t}の選手はまだ登録されていません。打順は空のままでも始められます（入力画面でその場で登録できます）。` : "";
      });
    }
    f.onsubmit = (e) => {
      e.preventDefault();
      const top = f.top.value.trim(), bottom = f.bottom.value.trim();
      const w = $("#sgw", root);
      if (!top || !bottom || top === bottom) { w.hidden = false; w.textContent = "⚠ 先攻と後攻に、ちがうチーム名を入れてください。"; return; }
      const read = (key) => { const c = root.querySelector(`[data-col="${key}"]`); return { line: $$("[data-l]", c).map((s) => s.value || null), pit: c.querySelector("[data-pit]").value || null }; };
      const T = read("top"), B = read("bottom");
      const info = { date: f.date.value, tournamentId: f.tournamentId.value, venue: f.venue.value.trim(), top, bottom, lineup: T.line, pitcher: T.pit, oppLineup: B.line, oppPitcherId: B.pit };
      if (orig) { store.saveGameInfo(orig.id, info); location.hash = `#/game/${orig.id}`; return; }
      const nid = store.saveGame({ ...info, scout: true, first: true, opponent: "", no: 0, positions: [], oppHands: {}, log: [], status: "live" });
      location.hash = `#/game/${nid}/input`;
    };
  };
  return { html, after };
}

// ---------------------------------------------------------------------
//  相手どうしの試合のページ
// ---------------------------------------------------------------------
export function viewScoutGame(id) {
  const g = state.games.find((x) => x.id === id);
  const S = state.settings;
  const st = gameState(g);
  const fin = g.status === "final";
  const n = Math.max(7, st.line.us.length, st.line.them.length);
  const lineRow = (name, arr, total, hits) => `<tr><td class="l"><b>${esc(name)}</b></td>${Array.from({ length: n }, (_, i) => `<td>${arr[i] ?? ""}</td>`).join("")}<td><b>${total}</b></td><td>${hits}</td></tr>`;
  const side = (team) => {
    const v = teamView(g, team);
    const ids = [...new Set((v.log || []).filter((i) => i.k === "pa" && i.side === "off").map((i) => i.batter || ""))];
    const pids = [...new Set((v.log || []).filter((i) => i.k === "pa" && i.side === "def" && i.pitcher).map((i) => i.pitcher))];
    const T = batting([v], null, S);
    return `<h2>${esc(team)}</h2>
      <div class="tablewrap"><table><thead><tr><th class="l">打者</th><th class="l">結果</th><th>打席</th><th>打数</th><th>安打</th><th>打点</th><th>三振</th><th>四死球</th></tr></thead><tbody>
      ${ids.map((pid) => { const pas = (v.log || []).filter((i) => i.k === "pa" && i.side === "off" && (i.batter || "") === pid); const b = batting([{ ...v, log: pas }], null, S);
        return `<tr><td class="l">${pid ? `<a href="#/scout/player/${pid}">${pnm(pid)}</a>` : `<span class="muted">名前なし</span>`}</td><td class="l">${pas.map((i) => esc(playNote(i))).join(" ")}</td><td>${b.pa}</td><td>${b.ab}</td><td>${b.h}</td><td>${b.rbi}</td><td>${b.k}</td><td>${b.bb + b.hbp}</td></tr>`; }).join("")}
      <tr class="total"><td class="l">チーム計</td><td></td><td>${T.pa}</td><td>${T.ab}</td><td>${T.h}</td><td>${T.rbi}</td><td>${T.k}</td><td>${T.bb + T.hbp}</td></tr></tbody></table></div>
      ${pids.length ? `<div class="tablewrap" style="margin-top:8px"><table><thead><tr><th class="l">投手</th><th>投球回</th><th>球数</th><th>打者</th><th>被安打</th><th>奪三振</th><th>四死球</th><th>失点</th></tr></thead><tbody>
        ${pids.map((pid) => { const x = pitching([v], pid, S); return `<tr><td class="l"><a href="#/scout/player/${pid}">${pnm(pid)}</a></td><td>${x.ipText}</td><td>${x.pitches}</td><td>${x.bf}</td><td>${x.h}</td><td>${x.k}</td><td>${x.bb + x.hbp}</td><td>${x.runs}</td></tr>`; }).join("")}</tbody></table></div>` : ""}`;
  };
  const log = g.log || [];
  const w = canWrite();
  const html = `<div class="row noprint"><a href="${teamHref(g.top, "games")}" class="btn sm">‹ ${esc(g.top)}</a><a href="${teamHref(g.bottom, "games")}" class="btn sm">‹ ${esc(g.bottom)}</a></div>
    <h1>${esc(g.top)} 対 ${esc(g.bottom)} <span class="chip ${fin ? "" : "live"}">${fin ? "終了" : "入力中"}</span></h1>
    <p class="muted" style="margin-top:-8px">相手どうしの試合（偵察）・${esc(g.date || "")}・${esc(tname(g.tournamentId))}${g.venue ? "・" + esc(g.venue) : ""}</p>
    ${w ? `<div class="row noprint" style="margin-bottom:12px">
      <a class="btn primary big" href="#/game/${g.id}/input">${fin ? "入力画面を開く" : "入力を続ける"}</a>
      <a class="btn" href="#/scout/game/${g.id}/edit">試合情報・打順を直す</a>
      ${fin ? `<button class="btn" id="reopen">入力中に戻す</button>` : `<button class="btn" id="finish">試合終了にする</button>`}</div>` : ""}
    <div class="tablewrap"><table class="scoreboard"><thead><tr><th class="l"></th>${Array.from({ length: n }, (_, i) => `<th>${i + 1}</th>`).join("")}<th>計</th><th>安</th></tr></thead><tbody>
      ${lineRow(g.top, st.line.us, st.score.us, st.hits.us)}${lineRow(g.bottom, st.line.them, st.score.them, st.hits.them)}</tbody></table></div>
    ${side(g.top)}${side(g.bottom)}
    <h2>打席の記録（${log.filter((i) => i.k === "pa").length}打席）</h2>
    <div class="card stack small" style="gap:6px">${log.map((it) => `<div class="row"><span class="grow">${itemText(it, g)}</span>${w ? `<button class="btn sm" data-edit="${it.id}">直す</button>` : ""}</div>`).join("") || `<span class="muted">まだありません</span>`}</div>
    ${state.role === "admin" ? `<h2>この試合を削除</h2><button class="btn danger noprint" id="del">この試合を削除する</button><p class="muted small">削除した試合は「設定 → ゴミ箱」から元に戻せます。</p>` : ""}`;
  return { html, after: (root) => {
    $("#finish", root)?.addEventListener("click", () => { store.patchGame(id, { status: "final", cur: null }); toast("試合終了にしました"); });
    $("#reopen", root)?.addEventListener("click", () => store.patchGame(id, { status: "live" }));
    $("#del", root)?.addEventListener("click", () => {
      if (!confirm(`${g.top} 対 ${g.bottom} を削除しますか？（ゴミ箱から戻せます）`)) return;
      store.patchGame(id, { deleted: true, deletedAt: new Date().toISOString() });
      location.hash = "#/scout"; toast("ゴミ箱に移しました");
    });
    $$("[data-edit]", root).forEach((b) => b.onclick = () => editItemSheet(state.games.find((x) => x.id === id), b.dataset.edit));
  } };
}
