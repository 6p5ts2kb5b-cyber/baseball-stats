// =====================================================================
//  印刷（views/print.js）
//  ・個人成績レポート（1人ずつ／全員まとめて、通算・直近5試合・大会別など）
//  ・試合レポート（スコア、投手成績とQS、打撃成績＋各選手の通算成績）
//  A4で印刷できます。PDFにしたいときは、印刷画面で「PDFに保存」を選びます。
// =====================================================================
import { state } from "../store.js";
import { esc, $, $$, player, numberOf, gradeText, activePlayers, filterBar, bindFilter, loadFilter, filteredGames, filterLabel, tname, HAND, liveGames, byDate, today, jpDate, sheet, closeSheet, toast } from "../ui.js";
import { renderPage, canvasToPdf, shareFile, shareText, canShareFile, lineUrl, isPhone, downloadFile, showImageViewer } from "../share.js";
import { gameState } from "../stats.js";
import { batting, pitching, pitcherLines, gameResult, seasonOf, filterGames, fmtAvg, fmtPct, fmtNum, R } from "../stats.js";
import { scoreboard, gameCells, gameHeads, oppTables } from "./game.js";

const F = loadFilter();
const opt = { who: "all", pitch: true, games: true, season: true, opp: true };
const rerender = () => window.dispatchEvent(new Event("hashchange"));
const team = () => esc(state.settings.teamName || "野球部");

// ---------------------------------------------------------------------
//  個人成績レポート
// ---------------------------------------------------------------------
export function viewReport() {
  const gs = filteredGames(F).sort(byDate);
  // 対象期間に記録がある選手（在籍中の選手を背番号順）
  const hasRec = (pid) => gs.some((g) => (g.log || []).some((i) => (i.side === "off" && i.batter === pid) || (i.side === "def" && i.pitcher === pid)));
  const pls = activePlayers();
  const targets = opt.who === "all" ? pls.filter((p) => hasRec(p.id)) : pls.filter((p) => p.id === opt.who);
  const html = `
    <div class="noprint">
      <h1>成績レポートの印刷</h1>
      ${filterBar(F)}
      <div class="card row" style="margin-top:8px">
        <label class="f" style="min-width:200px">選手
          <select id="who"><option value="all">記録のある全員（1人1ページ）</option>
          ${pls.map((p) => `<option value="${p.id}" ${opt.who === p.id ? "selected" : ""}>${numberOf(p) !== "" ? "#" + esc(numberOf(p)) + " " : ""}${esc(p.name)}</option>`).join("")}</select></label>
        <label class="row" style="gap:4px"><input type="checkbox" id="og" ${opt.games ? "checked" : ""}> 試合ごとの成績</label>
        <label class="row" style="gap:4px"><input type="checkbox" id="op" ${opt.pitch ? "checked" : ""}> 投手成績</label>
        <button class="btn primary big" id="print" style="margin-left:auto">🖨 印刷する（${targets.length}人）</button>
      </div>
      <p class="muted small">印刷画面で「送信先」を「PDFに保存」にすると、PDFファイルにできます。用紙はA4・縦です。</p>
    </div>
    ${targets.map((p) => playerPage(p, gs)).join("") || `<div class="card empty">この範囲に記録のある選手がいません。</div>`}`;
  return { html, after: (root) => {
    bindFilter(root, F, rerender);
    $("#who", root).onchange = (e) => { opt.who = e.target.value; rerender(); };
    $("#og", root).onchange = (e) => { opt.games = e.target.checked; rerender(); };
    $("#op", root).onchange = (e) => { opt.pitch = e.target.checked; rerender(); };
    $("#print", root).onclick = () => window.print();
  } };
}

function playerPage(p, gs) {
  const b = batting(gs, p.id, state.settings);
  const pit = pitching(gs, p.id, state.settings);
  const pitched = opt.pitch && (pit.bf > 0 || pit.outs > 0);
  const sit = (label, x) => `<tr><td class="l">${label}</td><td>${x.pa}</td><td>${x.ab}</td><td>${x.h}</td><td>${fmtAvg(x.avg)}</td><td>${x.k}</td><td>${fmtPct(x.kRate)}</td></tr>`;
  const lr = (label, x) => `<tr><td class="l">${label}</td><td>${x.pa}</td><td>${x.ab}</td><td>${x.h}</td><td>${x.k}</td><td>${fmtAvg(x.avg)}</td></tr>`;
  // 試合ごと（累計打率の推移も）
  let cumAB = 0, cumH = 0;
  const rows = [];
  for (const g of gs) {
    const pas = (g.log || []).filter((i) => i.k === "pa" && i.side === "off" && i.batter === p.id);
    if (!pas.length) continue;
    const gb = batting([g], p.id, state.settings);
    cumAB += gb.ab; cumH += gb.h;
    rows.push({ g, gb, res: pas.map((i) => R[i.res]?.short || "").join(" "), cum: cumAB ? cumH / cumAB : null });
  }
  const cnt = (b0, s0) => { const x = b.byCount[`${b0}-${s0}`]; return `<td><b>${fmtAvg(x.avg)}</b><br><span class="muted">${x.h}/${x.ab}</span></td>`; };
  return `<section class="page">
    <header class="phead"><div><div class="muted small">${team()}　個人成績レポート</div>
      <div class="pname">${esc(p.name)} <span>${numberOf(p) !== "" ? "#" + esc(numberOf(p)) : ""} ${esc(gradeText(p))} ${esc(p.pos || "")} ${HAND[p.throws] || ""}投${HAND[p.bats] || ""}打</span></div></div>
      <div class="small" style="text-align:right">${esc(filterLabel(F))}（${gs.length}試合）<br><span class="muted">${today()} 作成</span></div></header>
    <div class="ptiles">
      ${[["打率", fmtAvg(b.avg)], ["OPS", fmtAvg(b.ops)], ["安打", b.h], ["打点", b.rbi], ["本塁打", b.hr], ["盗塁", b.sb], ["得点圏打率", fmtAvg(b.risp.avg)]].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join("")}
    </div>
    <table class="pt"><thead><tr><th>試合</th><th>打席</th><th>打数</th><th>安打</th><th>二塁打</th><th>三塁打</th><th>本塁打</th><th>打点</th><th>三振</th><th>四球</th><th>死球</th><th>犠打</th><th>犠飛</th><th>進塁打</th><th>盗塁</th><th>失策</th><th>出塁率</th><th>長打率</th></tr></thead>
      <tbody><tr><td>${b.g}</td><td>${b.pa}</td><td>${b.ab}</td><td>${b.h}</td><td>${b.s2}</td><td>${b.s3}</td><td>${b.hr}</td><td>${b.rbi}</td><td>${b.k}</td><td>${b.bb}</td><td>${b.hbp}</td><td>${b.sac}</td><td>${b.sf}</td><td>${b.adv}</td><td>${b.sb}</td><td>${b.e}</td><td>${fmtAvg(b.obp)}</td><td>${fmtAvg(b.slg)}</td></tr></tbody></table>
    ${b.pb ? `<p class="tiny">捕逸：${b.pb}</p>` : ""}
    <div class="land">
    <div class="lcol">
      <div><h3>場面別</h3><table class="pt"><thead><tr><th class="l"></th><th>打席</th><th>打数</th><th>安打</th><th>打率</th><th>三振</th><th>三振率</th></tr></thead><tbody>
        ${sit("得点圏", b.risp)}${sit("初球", b.first)}${sit("追い込まれ後", b.two)}</tbody></table>
        <h3>対右投手・対左投手</h3><table class="pt"><thead><tr><th class="l"></th><th>打席</th><th>打数</th><th>安打</th><th>三振</th><th>打率</th></tr></thead><tbody>
        ${lr("対右投手", b.vsR)}${lr("対左投手", b.vsL)}</tbody></table></div>
      <div><h3>カウント別打率</h3><table class="pt cnt"><thead><tr><th></th><th>0ボール</th><th>1ボール</th><th>2ボール</th><th>3ボール</th></tr></thead><tbody>
        ${[0, 1, 2].map((s0) => `<tr><th>${s0}ストライク</th>${[0, 1, 2, 3].map((b0) => cnt(b0, s0)).join("")}</tr>`).join("")}</tbody></table>
        <p class="muted tiny">上＝打率、下＝安打/打数（最後の1球の直前のカウント）</p></div>
    </div>
    <div class="rcol">
    ${opt.games && rows.length ? `<h3>試合ごとの成績</h3>
      ${rows.length >= 2 ? trendSvg(rows) : ""}
      <table class="pt"><thead><tr><th class="l">日付</th><th class="l">相手</th><th class="l">結果</th><th>打数</th><th>安打</th><th>本塁打</th><th>打点</th><th>三振</th><th>四死球</th><th>犠打</th><th>進塁打</th><th>盗塁</th><th>失策</th><th>累計打率</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td class="l">${esc((r.g.date || "").slice(5).replace("-", "/"))}</td><td class="l">${esc(r.g.opponent || "")}</td><td class="l">${esc(r.res)}</td><td>${r.gb.ab}</td><td>${r.gb.h}</td><td>${r.gb.hr}</td><td>${r.gb.rbi}</td><td>${r.gb.k}</td><td>${r.gb.bb + r.gb.hbp}</td><td>${r.gb.sac}</td><td>${r.gb.adv}</td><td>${r.gb.sb}</td><td>${r.gb.e}</td><td>${fmtAvg(r.cum)}</td></tr>`).join("")}
      </tbody></table>` : ""}
    ${pitched ? pitcherPart(p.id, gs, pit) : ""}
    </div></div>
  </section>`;
}

// 累計打率の推移（折れ線）
function trendSvg(rows) {
  const W = 640, H = 120, L = 34, Rr = 8, T = 10, B = 22;
  const vals = rows.map((r) => r.cum ?? 0);
  const max = Math.max(0.4, Math.ceil(Math.max(...vals) * 10) / 10);
  const x = (i) => L + (i * (W - L - Rr)) / Math.max(1, rows.length - 1);
  const y = (v) => T + (1 - v / max) * (H - T - B);
  const ticks = [0, max / 2, max];
  const pts = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return `<svg class="trend" viewBox="0 0 ${W} ${H}" role="img" aria-label="累計打率の推移">
    ${ticks.map((t) => `<line x1="${L}" x2="${W - Rr}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${L - 4}" y="${y(t) + 4}" text-anchor="end" class="ax">${fmtAvg(t)}</text>`).join("")}
    <polyline points="${pts}" fill="none" class="line"/>
    ${vals.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="3" class="dot"/>`).join("")}
    <text x="${x(vals.length - 1)}" y="${y(vals[vals.length - 1]) - 7}" text-anchor="end" class="ax strong">${fmtAvg(vals[vals.length - 1])}</text>
    ${rows.map((r, i) => (rows.length <= 12 || i % Math.ceil(rows.length / 12) === 0 ? `<text x="${x(i)}" y="${H - 6}" text-anchor="middle" class="ax">${esc((r.g.date || "").slice(5).replace("-", "/"))}</text>` : "")).join("")}
  </svg><p class="muted tiny" style="margin-top:0">累計打率の推移</p>`;
}

function pitcherPart(pid, gs, pit) {
  const games = gs.filter((g) => pitcherLines(g, state.settings).lines[pid]);
  const lr = (label, x) => `<tr><td class="l">${label}</td><td>${x.bf}</td><td>${x.ab}</td><td>${x.h}</td><td>${x.k}</td><td>${x.bb + x.hbp}</td><td>${fmtAvg(x.oppAvg)}</td></tr>`;
  return `<h3>投手成績</h3>
    <div class="ptiles">
      ${[["投球回", pit.ipText], ["QS", `${pit.qs}/${pit.gs}`], ["被打率", fmtAvg(pit.oppAvg)], ["初球S率", fmtPct(pit.fpsPct)], [`奪三振率(${state.settings.innings}回)`, fmtNum(pit.k7)], ["自責点", pit.er], ["暴投", pit.wp]].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join("")}
    </div>
    <div class="pcols">
      <div><table class="pt"><thead><tr><th class="l"></th><th>打者</th><th>打数</th><th>被安打</th><th>奪三振</th><th>四死球</th><th>被打率</th></tr></thead><tbody>
        ${lr("対右打者", pit.vsR)}${lr("対左打者", pit.vsL)}</tbody></table></div>
      <div><table class="pt"><thead><tr><th class="l">試合</th><th>投球回</th><th>打者</th><th>球数</th><th>S率</th><th>被安打</th><th>奪三振</th><th>四死球</th><th>自責</th><th>QS</th></tr></thead><tbody>
        ${games.map((g) => { const L = pitcherLines(g, state.settings).lines[pid]; return `<tr><td class="l">${esc((g.date || "").slice(5).replace("-", "/"))} ${esc(g.opponent || "")}</td><td>${L.ipText}</td><td>${L.bf}</td><td><b>${L.pitches}</b></td><td>${fmtPct(L.strikePct)}</td><td>${L.h}</td><td>${L.k}</td><td>${L.bb + L.hbp}</td><td>${L.er}</td><td>${L.starter ? (L.qs ? "○" : "×") : "-"}</td></tr>`; }).join("")}
      </tbody></table></div>
    </div>`;
}

// ---------------------------------------------------------------------
//  試合レポート
// ---------------------------------------------------------------------
export function viewGamePrint(id) {
  const g = state.games.find((x) => x.id === id);
  if (!g) return { html: `<div class="empty">試合が見つかりません。</div>` };
  const r = gameResult(g);
  // その試合までの、同じ年度の試合（通算成績用）
  const season = seasonOf(g.date);
  const upto = filterGames(liveGames(), { season }).sort(byDate).filter((x) => byDate(x, g) <= 0);
  const ids = [...new Set([...(g.lineup || []).filter(Boolean), ...(g.log || []).filter((i) => i.side === "off" && i.batter).map((i) => i.batter)])];
  const { lines } = pitcherLines(g, state.settings);
  const plist = Object.values(lines).sort((a, b) => (b.starter ? 1 : 0) - (a.starter ? 1 : 0));
  const html = `
    <div class="noprint">
      <div class="row"><a href="#/game/${g.id}" class="btn sm">‹ 試合の記録</a></div>
      <h1>試合レポート（印刷・共有）</h1>
      <div class="card stack">
        <label class="row" style="gap:6px"><input type="checkbox" id="os" ${opt.season ? "checked" : ""}> 各選手の${season}年度の通算成績（この試合まで）も載せる</label>
        <label class="row" style="gap:6px"><input type="checkbox" id="oo" ${opt.opp ? "checked" : ""}> 相手チームの成績（打順別の打撃・投手）も載せる</label>
        <div class="sharebar">
          <button class="btn primary big" id="share">📤 共有する（LINEなど）</button>
          <button class="btn big" id="print">🖨 印刷する</button>
        </div>
        <p class="muted small" style="margin:0">「共有する」から、画像・PDF・テキストを選んでLINEなどで送れます。下の内容がそのまま画像やPDFになります。</p>
      </div>
    </div>
    <section class="page">
      <header class="phead"><div><div class="muted small">${team()}　試合レポート</div>
        <div class="pname">${team()} ${r.us} - ${r.them} ${esc(g.opponent)} <span>${g.status === "final" ? ({ 勝: "勝ち", 負: "負け", 分: "引き分け" })[r.wl] : "（試合途中）"}</span></div></div>
        <div class="small" style="text-align:right">${esc(jpDate(g.date))}　第${g.no}試合<br>${esc(tname(g.tournamentId))}・${g.first !== false ? "先攻" : "後攻"}${g.venue ? `<br>会場：${esc(g.venue)}` : ""}</div></header>
      ${scoreboard(g)}
      <h3>投手成績</h3>
      <table class="pt"><thead><tr><th class="l">投手</th><th>投球回</th><th>打者</th><th>球数</th><th>S率</th><th>初球S率</th><th>被安打</th><th>奪三振</th><th>四死球</th><th>暴投</th><th>捕逸</th><th>被盗塁</th><th>失点</th><th>自責</th><th>QS</th>${opt.season ? `<th>通算QS</th><th>通算被打率</th>` : ""}</tr></thead><tbody>
        ${plist.map((L) => { const s = opt.season ? pitching(upto, L.pid, state.settings) : null; return `<tr><td class="l">${esc(player(L.pid)?.name || "?")}${L.starter ? "（先発）" : ""}</td><td>${L.ipText}</td><td>${L.bf}</td><td><b>${L.pitches}</b></td><td>${fmtPct(L.strikePct)}</td><td>${fmtPct(L.fpsPct)}</td><td>${L.h}</td><td>${L.k}</td><td>${L.bb + L.hbp}</td><td>${L.wp}</td><td>${L.pb}</td><td>${L.sbA}</td><td>${L.runs}</td><td>${L.er}</td><td>${L.starter ? (L.qs ? "<b>QS ○</b>" : "×") : "-"}</td>${s ? `<td>${s.qs}/${s.gs}</td><td>${fmtAvg(s.oppAvg)}</td>` : ""}</tr>`; }).join("") || `<tr><td class="l" colspan="10">記録なし</td></tr>`}
      </tbody></table>
      <p class="muted tiny">QS：先発で${Math.floor(state.settings.qs.minOuts / 3)}回以上・自責点${state.settings.qs.maxER}以下　相手投手：${esc(g.oppPitcher?.name || "")}（${HAND[g.oppPitcher?.hand] || "右"}投）</p>
      <h3>打撃成績</h3>
      <table class="pt wide"><thead><tr><th class="l">打順</th><th class="l">選手</th><th class="l">結果</th>${gameHeads()}
        ${opt.season ? `<th class="sep">通算打率</th><th>通算OPS</th><th>通算安打</th><th>通算打点</th><th>通算本塁打</th>` : ""}</tr></thead><tbody>
        ${ids.map((pid) => {
          const b = batting([g], pid, state.settings);
          const s = opt.season ? batting(upto, pid, state.settings) : null;
          const res = (g.log || []).filter((i) => i.k === "pa" && i.side === "off" && i.batter === pid).map((i) => R[i.res]?.short || "").join(" ");
          const slot = (g.lineup || []).indexOf(pid);
          return `<tr><td class="l">${slot >= 0 ? slot + 1 : ""}</td><td class="l">${esc(player(pid)?.name || "?")}</td><td class="l">${esc(res)}</td>${gameCells(b)}
            ${s ? `<td class="sep">${fmtAvg(s.avg)}</td><td>${fmtAvg(s.ops)}</td><td>${s.h}</td><td>${s.rbi}</td><td>${s.hr}</td>` : ""}</tr>`;
        }).join("")}
        <tr class="total"><td class="l"></td><td class="l">チーム計</td><td></td>${gameCells(batting([g], null, state.settings))}${opt.season ? `<td class="sep" colspan="5"></td>` : ""}</tr>
      </tbody></table>
      <p class="muted tiny">結果の記号：安＝単打 二＝二塁打 三＝三塁打 本＝本塁打 ゴ＝ゴロ 飛＝フライ 直＝ライナー 併＝併殺打 振＝三振 失＝失策 野＝野選 四＝四球 死＝死球 犠＝犠打 犠飛＝犠飛 進＝進塁打</p>
      ${opt.opp ? oppTables(g, "h3") : ""}
    </section>`;
  return { html, after: (root) => {
    $("#os", root).onchange = (e) => { opt.season = e.target.checked; rerender(); };
    $("#oo", root).onchange = (e) => { opt.opp = e.target.checked; rerender(); };
    $("#share", root).onclick = () => shareSheet(g, root.querySelector("section.page"));
    $("#print", root).onclick = () => window.print();
  } };
}
export { $$ };

// ---------------------------------------------------------------------
//  ランキング（画面で見て、そのままA4で印刷）
// ---------------------------------------------------------------------
const RF = loadFilter();
export function viewRanking() {
  const S = state.settings;
  const gs = filteredGames(RF);
  const n = gs.length;
  const qualPA = Math.ceil(n * S.qual.paPerGame);
  const qualOuts = Math.ceil(n * S.qual.ipPerGame * 3);
  const ids = new Set(), pids = new Set();
  for (const g of gs) for (const it of g.log || []) {
    if (it.side === "off" && it.batter) ids.add(it.batter);
    if (it.side === "def" && it.pitcher) pids.add(it.pitcher);
    if (it.side === "def" && it.fielder) ids.add(it.fielder);
    if (it.side === "def" && it.catcher) ids.add(it.catcher);
    if (it.side === "off" && it.runner) ids.add(it.runner);
  }
  for (const g of gs) Object.keys(g.extras || {}).forEach((k) => ids.add(k));
  const bat = [...ids].map((pid) => { const b = batting(gs, pid, S); return { pid, ...b, rispAvg: b.risp.avg }; });
  const pit = [...pids].map((pid) => ({ pid, ...pitching(gs, pid, S) }));
  const nm = (pid) => esc(player(pid)?.name || "（削除済み）");
  // 上位5人（同じ数字は同順位。0や記録なしは載せない）
  const rank = (arr, key, fmt, { asc = false, min = (x) => true, note = "" } = {}) => {
    const list = arr.filter((x) => x[key] != null && min(x) && (asc || x[key] > 0))
      .sort((a, b) => (asc ? a[key] - b[key] : b[key] - a[key]));
    let prev = null, place = 0;
    const rows = [];
    list.forEach((x, i) => { if (x[key] !== prev) place = i + 1; prev = x[key]; if (place <= 5) rows.push({ place, x }); });
    return { rows, fmt, note };
  };
  const box = (title, r) => `<div class="rk ${r.noCrown ? "plain" : ""}"><h3>${title}${r.note ? ` <span class="muted tiny">${r.note}</span>` : ""}</h3>
    ${r.rows.length ? `<table class="pt"><tbody>${r.rows.map(({ place, x }) => `<tr class="${place === 1 ? "top" : ""}"><td style="width:2.2em">${place}位</td><td class="l">${place === 1 && !r.noCrown ? "👑 " : ""}${nm(x.pid)}</td><td><b>${r.fmt(x[r.key0])}</b></td></tr>`).join("")}</tbody></table>` : `<p class="muted tiny">該当者なし</p>`}</div>`;
  const B = (title, key, fmt, o = {}) => { const r = rank(bat, key, fmt, o); r.key0 = key; r.noCrown = o.noCrown; return box(title, r); };
  const P = (title, key, fmt, o = {}) => { const r = rank(pit, key, fmt, o); r.key0 = key; r.noCrown = o.noCrown; return box(title, r); };
  const num = (v) => v;
  const qa = { min: (x) => x.pa >= qualPA, note: `（${qualPA}打席以上）` };
  const qp = { min: (x) => x.outs >= qualOuts, note: `（${Math.floor(qualOuts / 3)}回${qualOuts % 3 ? (qualOuts % 3) + "/3" : ""}以上）` };
  const html = `
    <div class="noprint">
      <h1>ランキング</h1>
      ${filterBar(RF, "rflt")}
      <div class="row" style="margin:8px 0"><span class="muted small grow">規定打席・規定投球回は「設定 → 集計ルール」で変えられます。</span>
        <button class="btn primary big" id="print">🖨 印刷する</button></div>
    </div>
    <section class="page">
      <header class="phead"><div><div class="muted small">${team()}　ランキング</div>
        <div class="pname">${esc(filterLabel(RF))} <span>${n}試合</span></div></div>
        <div class="small muted">${today()} 作成</div></header>
      <h3 class="rksec">打撃部門</h3>
      <div class="rkgrid">
        ${B("首位打者（打率）", "avg", fmtAvg, qa)}
        ${B("OPS王", "ops", fmtAvg, qa)}
        ${B("最多安打", "h", num)}
        ${B("本塁打王", "hr", num)}
        ${B("打点王", "rbi", num)}
        ${B("盗塁王", "sb", num)}
        ${B("進塁打王", "adv", num)}
        ${B("犠打王", "sac", num)}
        ${B("得点圏打率", "rispAvg", fmtAvg, { min: (x) => x.risp.ab >= Math.max(3, Math.ceil(n / 2)), note: `（得点圏${Math.max(3, Math.ceil(n / 2))}打数以上）` })}
        ${B("出塁率", "obp", fmtAvg, qa)}
      </div>
      <h3 class="rksec">投手部門</h3>
      <div class="rkgrid">
        ${P("奪三振", "k", num)}
        ${P("QS", "qs", num)}
        ${P("投球回", "outs", (v) => `${Math.floor(v / 3)}回${v % 3 ? (v % 3) + "/3" : ""}`)}
        ${P("被打率（低い順）", "oppAvg", fmtAvg, { ...qp, asc: true })}
        ${P("防御率（低い順・7回換算）", "era7", (v) => fmtNum(v), { ...qp, asc: true })}
        ${P("初球ストライク率", "fpsPct", fmtPct, qp)}
      </div>
      <h3 class="rksec">守備・バッテリー（記録された数）</h3>
      <div class="rkgrid">
        ${B("失策", "e", num, { noCrown: true })}
        ${B("捕逸", "pb", num, { noCrown: true })}
        ${P("暴投", "wp", num, { noCrown: true })}
      </div>
    </section>`;
  return { html: html, after: (root) => {
    bindFilter(root, RF, rerender);
    $("#print", root).onclick = () => window.print();
  } };
}


// ---------------------------------------------------------------------
//  共有（画像・PDF・テキスト）… 印刷画面（section.page）をそのまま使う
// ---------------------------------------------------------------------
const CKEY = "bs-share-comment";
function loadComment() { try { return localStorage.getItem(CKEY) ?? "応援ありがとうございました。"; } catch { return "応援ありがとうございました。"; } }
function saveComment(v) { try { localStorage.setItem(CKEY, v); } catch {} }

export function resultText(g, { line = true, comment = "" } = {}) {
  const r = gameResult(g);
  const st = gameState(g);
  const us = state.settings.teamName || "野球部";
  const wl = g.status === "final" ? `（${({ 勝: "勝ち", 負: "負け", 分: "引き分け" })[r.wl]}）` : "（試合途中）";
  const rows = [`【試合結果】`, `${us} ${r.us} - ${r.them} ${g.opponent || ""}${wl}`, `日時：${jpDate(g.date)}`];
  rows.push(`大会：${tname(g.tournamentId)}`);
  if (g.venue) rows.push(`会場：${g.venue}`);
  if (line) {
    const fmt = (arr) => arr.map((v) => (v == null ? "x" : v)).join(" ");
    const order = g.first !== false ? [[us, "us"], [g.opponent || "相手", "them"]] : [[g.opponent || "相手", "them"], [us, "us"]];
    rows.push("", "［回ごとの得点］");
    for (const [name, k] of order) rows.push(`${name}：${fmt(st.line[k])}　計${st.score[k]}`);
  }
  if (comment.trim()) rows.push("", comment.trim());
  return rows.join("\n");
}

function shareSheet(g, pageEl) {
  const base = `試合結果_${(g.date || "").replace(/-/g, "")}_vs${(g.opponent || "").replace(/[\\/:*?"<>|\s]/g, "")}`;
  let img = null, pdf = null;
  const el = sheet(`<h2>共有する</h2>
    <p class="muted small" style="margin-top:-6px">スマホでは、ボタンを押すと共有メニューが開きます。そこで「LINE」を選んでください。</p>
    <div class="alert small" id="noShare" hidden style="margin-bottom:8px">今の開き方では、スマホの共有メニューが使えません（アプリの中のブラウザで開いている場合など）。<br>
      <b>Safari</b>（またはホーム画面に追加したアプリ）で開き直すと、共有ボタンからLINEを選べます。このままでも、画像を長押しすれば共有できます。</div>
    <div class="shareprev" id="prev"><span class="muted">画像を作っています…</span></div>
    <div class="stack" style="margin-top:12px">
      <button class="btn primary big block" id="sImg" disabled>📷 画像で共有</button>
      <button class="btn big block" id="sPdf" disabled>📄 PDFで共有（印刷にも使えます）</button>
      <button class="btn big block" id="sTxt">💬 テキストで共有</button>
      <div id="txtBox" hidden class="stack">
        <label class="row" style="gap:6px"><input type="checkbox" id="tLine" checked> 回ごとの得点も入れる</label>
        <label class="f">ひとこと（最後に付きます）<input type="text" id="tCom" value="${esc(loadComment())}"></label>
        <label class="f">送る文章（直せます）<textarea id="tTxt" rows="9" style="font-size:15px"></textarea></label>
        <div class="row">
          <button class="btn primary grow" id="tShare">共有メニューで送る</button>
          <a class="btn grow" id="tLineApp" href="#" target="_blank" rel="noopener">LINEで送る</a>
          <button class="btn grow" id="tCopy">コピー</button>
        </div>
      </div>
      <button class="btn block" id="cx">閉じる</button>
    </div>`);
  const $s = (q) => el.querySelector(q);
  // 画像とPDFを先に作っておく（共有ボタンを押したらすぐ共有メニューが開くように）
  setTimeout(async () => {
    try {
      const cImg = renderPage(pageEl, 1080, 2);
      const blob = await new Promise((res) => cImg.toBlob(res, "image/png"));
      img = new File([blob], base + ".png", { type: "image/png" });
      const cPdf = renderPage(pageEl, 1400, 2);
      pdf = new File([await canvasToPdf(cPdf)], base + ".pdf", { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      $s("#prev").innerHTML = `<img src="${url}" alt="共有する画像のプレビュー">`;
      $s("#sImg").disabled = false; $s("#sPdf").disabled = false;
      if (!canShareFile(img)) {
        if (isPhone()) { $s("#noShare").hidden = false; $s("#sImg").textContent = "📷 画像を表示（長押しで共有）"; $s("#sPdf").textContent = "📄 PDFを開く"; }
        else { $s("#sImg").textContent = "📷 画像を保存"; $s("#sPdf").textContent = "📄 PDFを保存（印刷にも使えます）"; }
      }
    } catch (e) {
      console.error(e);
      $s("#prev").innerHTML = `<span class="muted">画像を作れませんでした。テキストで共有してください。</span>`;
    }
  }, 30);
  const done = (r) => { if (r === "saved") toast("保存しました"); if (r === "copied") toast("コピーしました。LINEに貼り付けてください"); };
  // 共有メニューが使えないとき：スマホは画像を大きく表示（長押しで共有）、PCは保存
  $s("#sImg").onclick = async () => {
    const r = await shareFile(img);
    if (r !== "unsupported") return;
    if (isPhone()) { $s("#noShare").hidden = false; showImageViewer(img); } else { downloadFile(img); toast("保存しました"); }
  };
  $s("#sPdf").onclick = async () => {
    const r = await shareFile(pdf);
    if (r !== "unsupported") return;
    if (isPhone()) { $s("#noShare").hidden = false; window.open(URL.createObjectURL(pdf), "_blank") || downloadFile(pdf); } else { downloadFile(pdf); toast("保存しました"); }
  };
  const refresh = () => {
    saveComment($s("#tCom").value);
    $s("#tTxt").value = resultText(g, { line: $s("#tLine").checked, comment: $s("#tCom").value });
    $s("#tLineApp").href = lineUrl($s("#tTxt").value);
  };
  $s("#sTxt").onclick = () => { $s("#txtBox").hidden = false; refresh(); $s("#tTxt").scrollIntoView({ block: "nearest" }); };
  $s("#tLine").onchange = refresh; $s("#tCom").oninput = refresh;
  $s("#tTxt").oninput = () => { $s("#tLineApp").href = lineUrl($s("#tTxt").value); };
  $s("#tShare").onclick = async () => done(await shareText($s("#tTxt").value));
  $s("#tCopy").onclick = async () => { try { await navigator.clipboard.writeText($s("#tTxt").value); toast("コピーしました"); } catch { $s("#tTxt").select(); } };
  $s("#cx").onclick = closeSheet;
}
