// =====================================================================
//  成績画面（views/statsview.js）… 打者成績・投手成績・選手ページ
// =====================================================================
import { state } from "../store.js";
import { esc, $, player, numberOf, gradeText, activePlayers, filterBar, bindFilter, loadFilter, filteredGames, filterLabel, sortableTable, download, toCSV, HAND, liveGames } from "../ui.js";
import { batting, pitching, pitcherLines, fmtAvg, fmtPct, fmtNum, COUNT_KEYS, R } from "../stats.js";

const F = loadFilter();
let bSort = { k: "avg", asc: false }, pSort = { k: "outs", asc: false };
const rerender = () => window.dispatchEvent(new Event("hashchange"));

// 対象期間に記録がある選手（在籍していない選手も記録があれば表示）
function involved(gs, side) {
  const ids = new Set();
  for (const g of gs) for (const it of g.log || []) {
    if (side === "off" && it.side === "off" && it.batter) ids.add(it.batter);
    if (side === "def" && it.side === "def" && it.pitcher) ids.add(it.pitcher);
  }
  if (side === "off") for (const g of gs) for (const pid of Object.keys(g.extras || {})) ids.add(pid);
  return [...ids];
}
const nm = (pid) => { const p = player(pid); return p ? p.name : "（削除済み）"; };

const BCOLS = [
  { k: "name", label: "選手", l: true, stick: true, fmt: (v, r) => `<a href="#/player/${r.pid}">${esc(v)}</a>` },
  { k: "g", label: "試合" }, { k: "pa", label: "打席" }, { k: "ab", label: "打数" }, { k: "h", label: "安打" },
  { k: "s1", label: "単打" }, { k: "s2", label: "二塁打" }, { k: "s3", label: "三塁打" }, { k: "hr", label: "本塁打" },
  { k: "rbi", label: "打点" }, { k: "k", label: "三振" }, { k: "bb", label: "四球" }, { k: "hbp", label: "死球" },
  { k: "sac", label: "犠打" }, { k: "sf", label: "犠飛" }, { k: "adv", label: "進塁打" }, { k: "sb", label: "盗塁" }, { k: "sbPct", label: "盗塁成功率", fmt: fmtPct }, { k: "e", label: "失策" }, { k: "pb", label: "捕逸" },
  { k: "avg", label: "打率", fmt: fmtAvg }, { k: "obp", label: "出塁率", fmt: fmtAvg }, { k: "slg", label: "長打率", fmt: fmtAvg }, { k: "ops", label: "OPS", fmt: fmtAvg },
  { k: "rispAvg", label: "得点圏打率", fmt: fmtAvg }, { k: "firstAvg", label: "初球打率", fmt: fmtAvg }, { k: "twoAvg", label: "追込後打率", fmt: fmtAvg }, { k: "twoK", label: "追込後三振率", fmt: fmtPct },
];
function batRow(pid, b) {
  return { pid, name: pid ? nm(pid) : "チーム合計", _href: pid ? `#/player/${pid}` : null, ...b,
    rispAvg: b.risp.avg, firstAvg: b.first.avg, twoAvg: b.two.avg, twoK: b.two.kRate };
}

export function viewBatting() {
  const gs = filteredGames(F);
  const rows = involved(gs, "off").map((pid) => batRow(pid, batting(gs, pid, state.settings)));
  const team = batRow(null, batting(gs, null, state.settings));
  const html = `<h1>打者成績</h1>${filterBar(F)}
    <div class="row" style="margin:12px 0"><strong class="grow">${esc(filterLabel(F))}（${gs.length}試合）</strong>
      <button class="btn sm noprint" id="csv">CSVで保存</button></div>
    ${sortableTable("bt", BCOLS, rows, bSort, (s) => { bSort = s; rerender(); }, team)}
    <p class="muted small">見出しを押すと並べ替えできます。打数に含めないもの：${Object.entries(state.settings.abRules).filter(([, v]) => !v).map(([k]) => R[k]?.label).join("・")}（設定で変更できます）。</p>`;
  return { html, after: (root) => {
    bindFilter(root, F, rerender);
    $("#csv", root).onclick = () => download(`打者成績_${filterLabel(F)}.csv`, toCSV([BCOLS.map((c) => c.label), ...[...rows, team].map((r) => BCOLS.map((c) => (c.fmt && c.k !== "name" ? c.fmt(r[c.k]) : r[c.k])))]), "text/csv");
  } };
}

const PCOLS = [
  { k: "name", label: "投手", l: true, stick: true, fmt: (v, r) => `<a href="#/player/${r.pid}">${esc(v)}</a>` },
  { k: "g", label: "登板" }, { k: "gs", label: "先発" }, { k: "qs", label: "QS" }, { k: "qsPct", label: "QS率", fmt: fmtPct },
  { k: "outs", label: "投球回", fmt: (v, r) => r.ipText }, { k: "bf", label: "打者" }, { k: "pitches", label: "球数" },
  { k: "h", label: "被安打" }, { k: "hr", label: "被本塁打" }, { k: "k", label: "奪三振" }, { k: "bb", label: "与四球" }, { k: "hbp", label: "与死球" },
  { k: "wp", label: "暴投" }, { k: "runs", label: "失点" }, { k: "er", label: "自責点" },
  { k: "oppAvg", label: "被打率", fmt: fmtAvg }, { k: "fpsPct", label: "初球S率", fmt: fmtPct }, { k: "strikePct", label: "S率", fmt: fmtPct },
  { k: "k7", label: "奪三振率", fmt: (v) => fmtNum(v) }, { k: "era7", label: "防御率", fmt: (v) => fmtNum(v) },
];
export function viewPitching() {
  const gs = filteredGames(F);
  const rows = involved(gs, "def").map((pid) => ({ pid, name: nm(pid), _href: `#/player/${pid}`, ...pitching(gs, pid, state.settings) }));
  const html = `<h1>投手成績</h1>${filterBar(F)}
    <div class="row" style="margin:12px 0"><strong class="grow">${esc(filterLabel(F))}（${gs.length}試合）</strong>
      <button class="btn sm noprint" id="csv">CSVで保存</button></div>
    ${sortableTable("pt", PCOLS, rows, pSort, (s) => { pSort = s; rerender(); })}
    <p class="muted small">奪三振率・防御率は${state.settings.innings}イニング換算。QS：先発で${Math.floor(state.settings.qs.minOuts / 3)}回以上・自責点${state.settings.qs.maxER}以下。</p>`;
  return { html, after: (root) => {
    bindFilter(root, F, rerender);
    $("#csv", root).onclick = () => download(`投手成績_${filterLabel(F)}.csv`, toCSV([PCOLS.map((c) => c.label), ...rows.map((r) => PCOLS.map((c) => (c.k === "outs" ? r.ipText : c.fmt && c.k !== "name" ? c.fmt(r[c.k]) : r[c.k])))]), "text/csv");
  } };
}

// ---- 選手ページ ----
function countGrid(byCount, label) {
  const cell = (b, s) => { const x = byCount[`${b}-${s}`]; return `<div class="c"><b>${fmtAvg(x.avg)}</b><span>${x.h}/${x.ab}</span></div>`; };
  return `<div class="cgrid" aria-label="${label}">
    <div></div>${[0, 1, 2, 3].map((b) => `<div class="h">${b}ボール</div>`).join("")}
    ${[0, 1, 2].map((s) => `<div class="h">${s}ストライク</div>${[0, 1, 2, 3].map((b) => cell(b, s)).join("")}`).join("")}
  </div><p class="muted small">上の数字＝${label}、下＝安打/打数。最後の1球を投げる直前のカウントで集計。</p>`;
}
const sitRow = (label, x) => `<tr><td class="l">${label}</td><td>${x.pa}</td><td>${x.ab}</td><td>${x.h}</td><td>${fmtAvg(x.avg)}</td><td>${x.k}</td><td>${fmtPct(x.kRate)}</td></tr>`;

export function viewPlayer(pid) {
  const p = player(pid);
  if (!p) return { html: `<div class="empty">選手が見つかりません。</div>` };
  const gs = filteredGames(F);
  const b = batting(gs, pid, state.settings);
  const pit = pitching(gs, pid, state.settings);
  const pitched = pit.bf > 0 || pit.outs > 0;
  const lr = (x) => `<td>${x.pa}</td><td>${x.ab}</td><td>${x.h}</td><td>${x.hr}</td><td>${x.k}</td><td>${fmtAvg(x.avg)}</td><td>${fmtAvg(x.ops)}</td>`;
  const plr = (x) => `<td>${x.bf}</td><td>${x.ab}</td><td>${x.h}</td><td>${x.k}</td><td>${x.bb + x.hbp}</td><td>${fmtAvg(x.oppAvg)}</td><td>${fmtPct(x.fpsPct)}</td>`;
  // 試合ごとの投球（QS表示）
  const pgames = pitched ? gs.filter((g) => pitcherLines(g, state.settings).lines[pid]).sort((a, c) => (a.no ?? 0) - (c.no ?? 0)) : [];
  const html = `
    <div class="row noprint"><a href="#/batting" class="btn sm">‹ 成績一覧</a></div>
    <h1>${esc(p.name)} <span class="muted" style="font-size:15px">${numberOf(p) !== "" ? "#" + esc(numberOf(p)) : ""} ${esc(gradeText(p))} ${esc(p.pos || "")} ${HAND[p.throws] || ""}投${HAND[p.bats] || ""}打</span></h1>
    ${filterBar(F)}
    <p><strong>${esc(filterLabel(F))}</strong></p>
    <div class="tiles">
      <div class="tile"><div class="k">打率</div><div class="v">${fmtAvg(b.avg)}</div></div>
      <div class="tile"><div class="k">OPS</div><div class="v">${fmtAvg(b.ops)}</div></div>
      <div class="tile"><div class="k">安打</div><div class="v">${b.h}</div></div>
      <div class="tile"><div class="k">打点</div><div class="v">${b.rbi}</div></div>
      <div class="tile"><div class="k">本塁打</div><div class="v">${b.hr}</div></div>
      <div class="tile"><div class="k">盗塁</div><div class="v">${b.sb}</div></div>
    </div>
    <h2>基本成績</h2>
    <div class="tablewrap"><table><thead><tr><th>試合</th><th>打席</th><th>打数</th><th>安打</th><th>二塁打</th><th>三塁打</th><th>本塁打</th><th>打点</th><th>三振</th><th>四球</th><th>死球</th><th>犠打</th><th>犠飛</th><th>進塁打</th><th>盗塁</th><th>盗塁死</th><th>盗塁成功率</th><th>失策</th><th>捕逸</th><th>出塁率</th><th>長打率</th></tr></thead>
      <tbody><tr><td>${b.g}</td><td>${b.pa}</td><td>${b.ab}</td><td>${b.h}</td><td>${b.s2}</td><td>${b.s3}</td><td>${b.hr}</td><td>${b.rbi}</td><td>${b.k}</td><td>${b.bb}</td><td>${b.hbp}</td><td>${b.sac}</td><td>${b.sf}</td><td>${b.adv}</td><td>${b.sb}</td><td>${b.cs}</td><td>${fmtPct(b.sbPct)}</td><td>${b.e}</td><td>${b.pb}</td><td>${fmtAvg(b.obp)}</td><td>${fmtAvg(b.slg)}</td></tr></tbody></table></div>
    <h2>場面別</h2>
    <div class="tablewrap"><table><thead><tr><th class="l">場面</th><th>打席</th><th>打数</th><th>安打</th><th>打率</th><th>三振</th><th>三振率</th></tr></thead><tbody>
      ${sitRow("得点圏（2塁か3塁に走者）", b.risp)}${sitRow("初球を打った", b.first)}${sitRow("追い込まれてから（2ストライク）", b.two)}
    </tbody></table></div>
    <h2>対右投手・対左投手</h2>
    <div class="tablewrap"><table><thead><tr><th class="l"></th><th>打席</th><th>打数</th><th>安打</th><th>本塁打</th><th>三振</th><th>打率</th><th>OPS</th></tr></thead><tbody>
      <tr><td class="l">対右投手</td>${lr(b.vsR)}</tr><tr><td class="l">対左投手</td>${lr(b.vsL)}</tr></tbody></table></div>
    <h2>カウント別打率</h2>
    ${countGrid(b.byCount, "打率")}
    ${pitched ? `
      <h2>投手成績</h2>
      <div class="tiles">
        <div class="tile"><div class="k">投球回</div><div class="v">${pit.ipText}</div></div>
        <div class="tile"><div class="k">QS</div><div class="v">${pit.qs}/${pit.gs}</div></div>
        <div class="tile"><div class="k">被打率</div><div class="v">${fmtAvg(pit.oppAvg)}</div></div>
        <div class="tile"><div class="k">初球ストライク率</div><div class="v">${fmtPct(pit.fpsPct)}</div></div>
        <div class="tile"><div class="k">奪三振率(${state.settings.innings}回)</div><div class="v">${fmtNum(pit.k7)}</div></div>
        <div class="tile"><div class="k">自責点</div><div class="v">${pit.er}</div></div>
        <div class="tile"><div class="k">暴投</div><div class="v">${pit.wp}</div></div>
      </div>
      <h3>対右打者・対左打者</h3>
      <div class="tablewrap"><table><thead><tr><th class="l"></th><th>打者</th><th>打数</th><th>被安打</th><th>奪三振</th><th>四死球</th><th>被打率</th><th>初球S率</th></tr></thead><tbody>
        <tr><td class="l">対右打者</td>${plr(pit.vsR)}</tr><tr><td class="l">対左打者</td>${plr(pit.vsL)}</tr></tbody></table></div>
      <h3>カウント別被打率</h3>
      ${countGrid(pit.byCount, "被打率")}
      <h3>登板した試合</h3>
      <div class="tablewrap"><table><thead><tr><th class="l">試合</th><th>投球回</th><th>打者</th><th>球数</th><th>S率</th><th>初球S率</th><th>被安打</th><th>奪三振</th><th>失点</th><th>自責</th><th>QS</th></tr></thead><tbody>
        ${pgames.map((g) => { const L = pitcherLines(g, state.settings).lines[pid]; return `<tr><td class="l"><a href="#/game/${g.id}">第${g.no}試合 vs ${esc(g.opponent)}</a>${L.starter ? ' <span class="muted small">先発</span>' : ""}</td><td>${L.ipText}</td><td>${L.bf}</td><td><b>${L.pitches}</b></td><td>${fmtPct(L.strikePct)}</td><td>${fmtPct(L.fpsPct)}</td><td>${L.h}</td><td>${L.k}</td><td>${L.runs}</td><td>${L.er}</td><td>${L.starter ? (L.qs ? '<span class="chip qs">QS ○</span>' : "×") : "-"}</td></tr>`; }).join("")}
      </tbody></table></div>` : ""}`;
  return { html, after: (root) => bindFilter(root, F, rerender) };
}
export { activePlayers, liveGames, COUNT_KEYS };
