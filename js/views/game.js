// =====================================================================
//  試合の記録（views/game.js）… スコア表、投手成績(QS)、打席一覧の修正
// =====================================================================
import * as store from "../store.js";
import { state } from "../store.js";
import { esc, $, $$, toast, sheet, closeSheet, player, pname, tname, activePlayers, numberOf, HAND } from "../ui.js";
import { gameState, gameResult, gameMisc, pitcherLines, batting, oppLines, R, RESULTS, DIRS, playNote, playText, countInfo, itemOuts, fmtAvg, fmtPct } from "../stats.js";

const EVTEXT = { sb: "盗塁", cs: "盗塁死", po: "牽制アウト", run: "走者生還", out: "アウト", e: "失策", wp: "暴投", pb: "捕逸" };

// 1試合の打撃成績の列（画面と印刷で共通）
export const GAME_COLS = [
  ["打席", (b) => b.pa], ["打数", (b) => b.ab], ["安打", (b) => b.h], ["二塁打", (b) => b.s2], ["三塁打", (b) => b.s3], ["本塁打", (b) => b.hr],
  ["打点", (b) => b.rbi], ["三振", (b) => b.k], ["四球", (b) => b.bb], ["死球", (b) => b.hbp],
  ["犠打", (b) => b.sac], ["犠飛", (b) => b.sf], ["進塁打", (b) => b.adv], ["盗塁", (b) => b.sb], ["盗塁死", (b) => b.cs], ["失策", (b) => b.e],
];
const zero = (v) => (v ? v : `<span class="z">0</span>`);
export const gameCells = (b) => GAME_COLS.map(([, f]) => `<td>${zero(f(b))}</td>`).join("");
export const gameHeads = () => GAME_COLS.map(([l]) => `<th>${l}</th>`).join("");

// この試合のチーム打撃（打率・出塁率・長打率・OPS）… 自チームと相手
function teamBatTable(g, rows) {
  const us = batting([g], null, state.settings);
  const them = oppLines(g, state.settings).team;
  // 得点圏（2塁か3塁に走者がいた打席）の 安打/打数
  const risp = (side) => {
    let ab = 0, h = 0;
    for (const it of g.log || []) {
      if (it.k !== "pa" || it.side !== side || !R[it.res]) continue;
      const rs = it.runners || [];
      if (!(rs[1] || rs[2])) continue;
      if (state.settings.abRules[it.res]) ab++;
      if (R[it.res].hit) h++;
    }
    return { ab, h, avg: ab ? h / ab : null };
  };
  const line = { us: { ...us, rsp: risp("off") }, them: { ...them, rsp: risp("def") } };
  return `<div class="tablewrap misc-wrap"><table class="pt misc teambat"><thead><tr><th class="l">チーム打撃</th><th>打率</th><th>出塁率</th><th>長打率</th><th>OPS</th><th>打席</th><th>打数</th><th>安打</th><th>本塁打</th><th>三振</th><th>四死球</th><th>得点圏</th></tr></thead><tbody>
    ${rows.map(([k, name]) => { const x = line[k]; return `<tr><td class="l">${esc(name)}</td><td><b>${fmtAvg(x.avg)}</b></td><td><b>${fmtAvg(x.obp)}</b></td><td><b>${fmtAvg(x.slg)}</b></td><td>${fmtAvg(x.ops)}</td><td>${x.pa}</td><td>${x.ab}</td><td>${x.h}</td><td>${x.hr}</td><td>${x.k}</td><td>${x.bb + x.hbp}</td><td>${x.rsp.h}/${x.rsp.ab}（${fmtAvg(x.rsp.avg)}）</td></tr>`; }).join("")}
  </tbody></table></div>`;
}

// 打席ごとの経過（スコアブック風）… 打順×回の表に「3-2 / 左飛」
export function playGrid(g, side, H = "h2") {
  const log = (g.log || []).filter((i) => i.k === "pa" && i.side === side && R[i.res]);
  if (!log.length) return "";
  const n = Math.max(7, ...log.map((i) => i.inn || 0));
  const title = side === "off" ? `${esc(state.settings.teamName || "自チーム")}の打席経過` : `${esc(g.opponent || "相手")}の打席経過`;
  const rows = [];
  for (let slot = 1; slot <= 9; slot++) {
    const pas = log.filter((i) => Number(i.slot) === slot);
    let name;
    if (side === "off") {
      const ids = [...new Set([...(g.lineup?.[slot - 1] ? [g.lineup[slot - 1]] : []), ...pas.map((i) => i.batter)].filter(Boolean))];
      const inLog = [...new Set(pas.map((i) => i.batter))];
      name = (inLog.length ? inLog : ids).map((id) => esc(player(id)?.name || "?")).join("<br>→");
    } else {
      const h = pas.map((i) => i.bh).filter(Boolean).pop();
      name = `${slot}番${h ? `（${HAND[h]}）` : ""}`;
    }
    const cells = Array.from({ length: n }, (_, k) => {
      const inInn = pas.filter((i) => i.inn === k + 1);
      return `<td class="pg">${inInn.map((i) => {
        const cnt = (i.p || "").length ? countInfo(i.p).key : "";
        const note = playNote(i);
        const hit = R[i.res]?.hit ? " hitc" : "";
        return `${cnt ? `<span class="muted">${cnt}</span> ` : ""}<b class="${hit}">${esc(note)}</b>${i.rbi ? `<span class="rbi">(${i.rbi})</span>` : ""}`;
      }).join("<br>")}</td>`;
    }).join("");
    rows.push(`<tr><td class="l">${slot}</td><td class="l">${name}</td>${cells}</tr>`);
  }
  return `<${H}>${title}</${H}>
    <div class="tablewrap"><table class="pt grid"><thead><tr><th class="l">打順</th><th class="l">${side === "off" ? "選手" : "打者"}</th>${Array.from({ length: n }, (_, k) => `<th>${k + 1}回</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>
    <p class="muted small">「3-2 左飛」＝ボール3・ストライク2から、レフトフライ。（ ）内は打点。中二＝センターへの二塁打、遊ゴ＝ショートゴロ、見三振＝見逃し三振。</p>`;
}

// 相手チームの成績（打順別の打撃・投手別の投球）… 画面と印刷で共通
export function oppTables(g, H = "h2") {
  const o = oppLines(g, state.settings);
  const name = esc(g.opponent || "相手");
  if (!o.bat.length && !o.pit.length) return "";
  const cols = [["打席", "pa"], ["打数", "ab"], ["安打", "h"], ["二塁打", "s2"], ["三塁打", "s3"], ["本塁打", "hr"], ["打点", "rbi"], ["三振", "k"], ["四球", "bb"], ["死球", "hbp"], ["犠打", "sac"], ["犠飛", "sf"], ["進塁打", "adv"]];
  const cells = (b) => cols.map(([, k]) => `<td>${zero(b[k])}</td>`).join("");
  return `<${H}>${name}の打撃成績（打順別）</${H}>
    <div class="tablewrap"><table class="pt wide"><thead><tr><th class="l">打順</th><th class="l">打</th><th class="l">結果</th>${cols.map(([l]) => `<th>${l}</th>`).join("")}<th>打率</th></tr></thead><tbody>
      ${o.bat.map((b) => `<tr><td class="l">${b.slot}番</td><td class="l">${HAND[b.hand] || ""}</td><td class="l">${esc(b.res.join(" "))}</td>${cells(b)}<td>${fmtAvg(b.avg)}</td></tr>`).join("")}
      <tr class="total"><td class="l"></td><td class="l">計</td><td></td>${cells(o.team)}<td>${fmtAvg(o.team.avg)}</td></tr>
    </tbody></table></div>
    <${H}>${name}の投手成績</${H}>
    <div class="tablewrap"><table class="pt"><thead><tr><th class="l">投手</th><th>投球回</th><th>打者</th><th>球数</th><th>S率</th><th>被安打</th><th>奪三振</th><th>四死球</th><th>暴投</th><th>失点</th></tr></thead><tbody>
      ${o.pit.map((p) => `<tr><td class="l">${esc(p.name)}（${HAND[p.hand] || "右"}投）</td><td>${p.ipText}</td><td>${p.bf}</td><td><b>${p.pitches}</b></td><td>${fmtPct(p.strikePct)}</td><td>${p.h}</td><td>${p.k}</td><td>${p.bb + p.hbp}</td><td>${p.wp}</td><td>${p.runs}</td></tr>`).join("")}
    </tbody></table></div>
    <p class="muted small">相手の打者は名前を記録していないため、打順ごとにまとめています（代打なども同じ打順に入ります）。</p>`;
}

export function itemText(it, g) {
  const where = `${it.inn}回${it.half === "T" ? "表" : "裏"}`;
  if (it.k === "ev") {
    const pid = it.runner || it.fielder || it.catcher || (it.type === "wp" ? it.pitcher : null);
    const who = pid ? esc(player(pid)?.name || "") + " " : "";
    const misc = ["e", "wp", "pb"].includes(it.type);
    // 盗塁などは守備中なら相手の走者、失策・暴投・捕逸は攻撃中なら相手のミス
    const side = misc ? (it.side === "off" ? "（相手）" : "") : it.side === "def" ? "（相手）" : "";
    return `<span class="muted">${where}</span> ${who}${EVTEXT[it.type] || it.type}${side}${it.type === "run" && it.side === "def" && it.er === false ? "（非自責）" : ""}`;
  }
  const who = it.side === "off" ? esc(player(it.batter)?.name || "?") : `相手${it.slot}番`;
  const r = playText(it) || R[it.res]?.label || it.res;
  const extra = [(it.runs ? `${it.runs}点` : ""), (it.rbi ? `打点${it.rbi}` : "")].filter(Boolean).join("・");
  const fd = it.res === "E" && it.fielder ? `（${esc(player(it.fielder)?.name || "")}の失策）` : "";
  return `<span class="muted">${where}</span> ${it.slot}番 ${who}：<strong>${esc(r)}</strong>${fd}${extra ? `（${extra}）` : ""} <span class="muted small">${esc(it.p || "")}</span>`;
}

export function scoreboard(g) {
  const st = gameState(g);
  const n = Math.max(7, st.line.us.length, st.line.them.length);
  const us = state.settings.teamName || "自チーム", them = g.opponent || "相手";
  const rows = g.first !== false ? [["us", us], ["them", them]] : [["them", them], ["us", us]];
  const hits = { us: 0, them: 0 };
  (g.log || []).forEach((it) => { if (it.k === "pa" && R[it.res]?.hit) hits[it.side === "off" ? "us" : "them"]++; });
  const misc = gameMisc(g);
  return `<div class="board"><table><thead><tr><th></th>${Array.from({ length: n }, (_, i) => `<th>${i + 1}</th>`).join("")}<th>計</th><th>安</th><th>失</th></tr></thead><tbody>
    ${rows.map(([k, name]) => `<tr><td class="team">${esc(name)}</td>${Array.from({ length: n }, (_, i) => `<td>${st.line[k][i] ?? ""}</td>`).join("")}<td class="r">${st.score[k]}</td><td>${hits[k]}</td><td>${misc[k].e}</td></tr>`).join("")}
  </tbody></table></div>
  ${teamBatTable(g, rows)}
  <div class="tablewrap misc-wrap"><table class="pt misc"><thead><tr><th class="l">守備・走塁</th><th>失策</th><th>暴投</th><th>捕逸</th><th>盗塁された</th><th>盗塁を刺した</th><th>盗塁</th><th>盗塁死</th></tr></thead><tbody>
    ${rows.map(([k, name]) => { const x = misc[k]; return `<tr><td class="l">${esc(name)}</td><td>${x.e}</td><td>${x.wp}</td><td>${x.pb}</td><td>${x.sbA}</td><td>${x.csA}</td><td>${x.sb}</td><td>${x.cs}</td></tr>`; }).join("")}
  </tbody></table></div>`;
}

export function pitcherTable(g, editable) {
  const { lines } = pitcherLines(g, state.settings);
  const arr = Object.values(lines).sort((a, b) => (b.starter ? 1 : 0) - (a.starter ? 1 : 0));
  if (!arr.length) return `<p class="muted">守備の記録がまだありません。</p>`;
  return `<div class="tablewrap"><table><thead><tr><th class="l">投手</th><th>投球回</th><th>打者</th><th>球数</th><th>ストライク率</th><th>初球S率</th><th>被安打</th><th>奪三振</th><th>四死球</th><th>暴投</th><th>捕逸</th><th>被盗塁</th><th>失点</th><th>自責</th><th>QS</th></tr></thead><tbody>
    ${arr.map((L) => `<tr><td class="l">${pname(L.pid)}${L.starter ? ' <span class="muted small">先発</span>' : ""}</td><td>${L.ipText}</td><td>${L.bf}</td><td><b>${L.pitches}</b></td><td>${fmtPct(L.strikePct)}</td><td>${fmtPct(L.fpsPct)}</td><td>${L.h}</td><td>${L.k}</td><td>${L.bb + L.hbp}</td><td>${L.wp}</td><td>${L.pb}</td><td>${L.sbA}</td>
      <td>${editable ? `<input type="number" min="0" style="width:64px;min-height:34px;padding:4px" data-adj="runs" data-pid="${L.pid}" value="${L.runs}">` : L.runs}</td>
      <td>${editable ? `<input type="number" min="0" style="width:64px;min-height:34px;padding:4px" data-adj="er" data-pid="${L.pid}" value="${L.er}">` : L.er}</td>
      <td>${L.starter ? (L.qs ? '<span class="chip qs">QS ○</span>' : '<span class="chip">×</span>') : "-"}</td></tr>`).join("")}
  </tbody></table></div>
  <p class="muted small">QS：先発で${Math.floor(state.settings.qs.minOuts / 3)}回以上・自責点${state.settings.qs.maxER}以下。${editable ? "失点・自責点は自動計算です。継投などで違うときは数字を直してください。" : ""}</p>`;
}

export function viewGame(id) {
  const g = state.games.find((x) => x.id === id);
  if (!g) return { html: `<div class="empty">試合が見つかりません。<a href="#/games">試合一覧へ</a></div>` };
  const r = gameResult(g);
  const fin = g.status === "final";
  const canWrite = state.role !== "viewer";
  // 打者ごとの今日の成績
  const ids = [...new Set([...(g.lineup || []).filter(Boolean), ...(g.log || []).filter((i) => i.side === "off" && i.batter).map((i) => i.batter)])];
  const bat = ids.map((pid) => ({ pid, b: batting([g], pid, state.settings), line: (g.log || []).filter((i) => i.k === "pa" && i.side === "off" && i.batter === pid).map((i) => playNote(i)) }));
  const log = g.log || [];
  const html = `
    <div class="row noprint"><a href="#/games" class="btn sm">‹ 試合一覧</a></div>
    <h1>第${g.no}試合 vs ${esc(g.opponent)} ${fin ? `<span class="chip ${r.wl === "勝" ? "win" : r.wl === "負" ? "lose" : ""}">${r.wl}</span>` : `<span class="chip live">入力中</span>`}</h1>
    <p class="muted" style="margin-top:-8px">${esc(g.date)}・${esc(tname(g.tournamentId))}・${g.first !== false ? "先攻" : "後攻"}</p>
    ${canWrite ? `<div class="row noprint" style="margin-bottom:12px">
      <a class="btn primary big" href="#/game/${g.id}/input">${fin ? "入力画面を開く" : "入力を続ける"}</a>
      <a class="btn" href="#/game/${g.id}/edit">試合情報・スタメンを直す</a>
      <a class="btn" href="#/game/${g.id}/print">🖨 印刷</a>
      ${fin ? `<button class="btn" id="reopen">入力中に戻す</button>` : `<button class="btn" id="finish">試合終了にする</button>`}
    </div>` : ""}
    ${scoreboard(g)}
    <h2>投手成績</h2>
    ${pitcherTable(g, canWrite)}
    <h2>打撃成績</h2>
    <div class="tablewrap"><table><thead><tr><th class="l">打順・選手</th><th class="l">結果</th>${gameHeads()}</tr></thead><tbody>
      ${bat.map(({ pid, b, line }) => `<tr><td class="l">${(g.lineup || []).indexOf(pid) >= 0 ? (g.lineup.indexOf(pid) + 1) + ". " : ""}<a href="#/player/${pid}">${pname(pid)}</a></td><td class="l">${line.join(" ")}</td>${gameCells(b)}</tr>`).join("")}
      <tr class="total"><td class="l">チーム計</td><td></td>${gameCells(batting([g], null, state.settings))}</tr>
    </tbody></table></div>
    ${playGrid(g, "off")}
    ${oppTables(g)}
    ${playGrid(g, "def")}
    ${canWrite ? `<h2>試合後に入れる記録（盗塁・失策）</h2>
    <p class="muted small">試合中に入れられなかった盗塁や、守備の失策数を選手ごとに足せます。</p>
    <div class="tablewrap"><table><thead><tr><th class="l">選手</th><th>盗塁</th><th>盗塁死</th><th>得点</th><th>失策</th></tr></thead><tbody>
      ${ids.map((pid) => { const x = (g.extras || {})[pid] || {}; return `<tr><td class="l">${pname(pid)}</td>${["sb", "cs", "r", "e"].map((k) => `<td><input type="number" min="0" style="width:64px;min-height:34px;padding:4px" data-ex="${k}" data-pid="${pid}" value="${x[k] ?? ""}" placeholder="0"></td>`).join("")}</tr>`; }).join("")}
    </tbody></table></div>` : ""}
    <h2>打席の記録（${log.filter((i) => i.k === "pa").length}打席）</h2>
    <details ${fin ? "" : "open"}><summary class="btn sm noprint" style="margin-bottom:8px">表示する／しまう</summary>
    <div class="card stack small" style="gap:6px">
      ${log.map((it) => `<div class="row"><span class="grow">${itemText(it, g)}</span>${canWrite ? `<button class="btn sm" data-edit="${it.id}">直す</button>` : ""}</div>`).join("") || `<span class="muted">まだありません</span>`}
    </div></details>
    ${state.role === "admin" ? `<h2>この試合を削除</h2><p class="muted small">削除した試合は「設定 → ゴミ箱」から元に戻せます。</p><button class="btn danger noprint" id="del">この試合を削除する</button>` : ""}`;
  const after = (root) => {
    const G = () => state.games.find((x) => x.id === id);
    $("#finish", root)?.addEventListener("click", () => { store.patchGame(id, { status: "final", cur: null }); toast("試合終了にしました"); });
    $("#reopen", root)?.addEventListener("click", () => store.patchGame(id, { status: "live" }));
    $("#del", root)?.addEventListener("click", () => {
      if (!confirm(`第${g.no}試合 vs ${g.opponent} を削除しますか？（ゴミ箱から戻せます）`)) return;
      store.patchGame(id, { deleted: true, deletedAt: new Date().toISOString() });
      location.hash = "#/games"; toast("ゴミ箱に移しました");
    });
    $$("[data-adj]", root).forEach((el) => el.onchange = () => {
      const adj = { ...(G().pitcherAdj || {}) };
      adj[el.dataset.pid] = { ...(adj[el.dataset.pid] || {}), [el.dataset.adj]: el.value === "" ? null : Number(el.value) };
      store.patchGame(id, { pitcherAdj: adj }); toast("保存しました");
    });
    $$("[data-ex]", root).forEach((el) => el.onchange = () => {
      const ex = { ...(G().extras || {}) };
      ex[el.dataset.pid] = { ...(ex[el.dataset.pid] || {}), [el.dataset.ex]: el.value === "" ? 0 : Number(el.value) };
      store.patchGame(id, { extras: ex }); toast("保存しました");
    });
    $$("[data-edit]", root).forEach((b) => b.onclick = () => editItemSheet(G(), b.dataset.edit));
  };
  return { html, after };
}

// ---- 1つの記録を直す・消す ----
export function editItemSheet(g, itemId) {
  const log = g.log || [];
  const idx = log.findIndex((i) => i.id === itemId);
  if (idx < 0) return toast("記録が見つかりません");
  const it = { ...log[idx] };
  const save = (patch) => {
    const gg = state.games.find((x) => x.id === g.id);
    const l2 = [...(gg.log || [])];
    const j = l2.findIndex((i) => i.id === itemId);
    if (j < 0) return;
    if (patch === null) l2.splice(j, 1); else l2[j] = { ...l2[j], ...patch };
    store.patchGame(g.id, { log: l2 });
    closeSheet(); toast(patch === null ? "削除しました" : "直しました");
  };
  if (it.k === "ev") {
    sheet(`<h2>記録を直す</h2><p>${itemText(it, g)}</p>
      <div class="row"><button class="btn danger grow" id="rm">この記録を消す</button><button class="btn" id="cx">閉じる</button></div>`, (el) => {
      $("#rm", el).onclick = () => { if (confirm("この記録を消しますか？")) save(null); };
      $("#cx", el).onclick = closeSheet;
    });
    return;
  }
  const off = it.side === "off";
  const pls = activePlayers();
  const runners = it.runners || [0, 0, 0];
  sheet(`<h2>打席を直す</h2>
    <form id="ef" class="stack">
      <p class="muted small" style="margin:0">${it.inn}回${it.half === "T" ? "表" : "裏"}・${it.slot}番</p>
      ${off ? `<label class="f">打者<select name="batter">${pls.map((p) => `<option value="${p.id}" ${it.batter === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label>`
            : `<label class="f">投手<select name="pitcher">${pls.map((p) => `<option value="${p.id}" ${it.pitcher === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label>`}
      <div class="grid2">
        <label class="f">打撃結果<select name="res">${RESULTS.map((r) => `<option value="${r.c}" ${it.res === r.c ? "selected" : ""}>${r.label}</option>`).join("")}</select></label>
        <label class="f">投球（B=ボール S=見逃し K=空振り F=ファウル X=打った D=死球）<input type="text" name="p" value="${esc(it.p || "")}" pattern="[BSKFXDbskfxd]*" autocapitalize="characters"></label>
        <label class="f">打球方向<select name="dir"><option value="">（なし・不明）</option>${DIRS.map(([k, l]) => `<option value="${k}" ${it.dir === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        <label class="f">打者の左右<select name="bh"><option value="R" ${it.bh !== "L" ? "selected" : ""}>右</option><option value="L" ${it.bh === "L" ? "selected" : ""}>左</option></select></label>
        <label class="f">投手の左右<select name="ph"><option value="R" ${it.ph !== "L" ? "selected" : ""}>右</option><option value="L" ${it.ph === "L" ? "selected" : ""}>左</option></select></label>
        <label class="f">入った点<input type="number" min="0" max="4" name="runs" value="${it.runs ?? 0}"></label>
        <label class="f">打点<input type="number" min="0" max="4" name="rbi" value="${it.rbi ?? 0}"></label>
        ${off ? "" : `<label class="f">うち自責点<input type="number" min="0" max="4" name="er" value="${it.er ?? it.runs ?? 0}"></label>`}
        <label class="f">この打席で増えたアウト<input type="number" min="0" max="3" name="outs" value="${itemOuts(it)}"></label>
        ${off ? "" : `<label class="f">失策出塁のとき：エラーした選手<select name="fielder"><option value="">（なし・不明）</option>${pls.map((p) => `<option value="${p.id}" ${it.fielder === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label>`}
      </div>
      <div><div class="muted small" style="font-weight:700">打席に入ったときの走者（得点圏の判定に使います）</div>
        <div class="row">${["1塁", "2塁", "3塁"].map((l, i) => `<label class="row" style="gap:4px"><input type="checkbox" name="r${i}" ${runners[i] ? "checked" : ""}> ${l}</label>`).join("")}</div></div>
      <div class="row"><button class="btn primary grow" type="submit">保存</button><button class="btn danger" type="button" id="rm">この打席を消す</button><button class="btn" type="button" id="cx">閉じる</button></div>
    </form>`, (el) => {
    const f = $("#ef", el);
    f.onsubmit = (e) => {
      e.preventDefault();
      const patch = {
        res: f.res.value, p: f.p.value.toUpperCase().replace(/[^BSKFXD]/g, ""), bh: f.bh.value, ph: f.ph.value,
        runs: +f.runs.value || 0, rbi: +f.rbi.value || 0, outs: +f.outs.value || 0,
        runners: [0, 1, 2].map((i) => (f["r" + i].checked ? 1 : 0)),
        dir: f.dir.value || null,
      };
      if (off) patch.batter = f.batter.value; else { patch.pitcher = f.pitcher.value; patch.er = +f.er.value || 0; patch.fielder = f.res.value === "E" ? f.fielder.value || null : null; }
      save(patch);
    };
    $("#rm", el).onclick = () => { if (confirm("この打席を消しますか？")) save(null); };
    $("#cx", el).onclick = closeSheet;
  });
}
export { HAND, numberOf, fmtAvg };
