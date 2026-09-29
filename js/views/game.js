// =====================================================================
//  試合の記録（views/game.js）… スコア表、投手成績(QS)、打席一覧の修正
// =====================================================================
import * as store from "../store.js";
import { state } from "../store.js";
import { esc, $, $$, toast, sheet, closeSheet, player, pname, tname, activePlayers, numberOf, HAND } from "../ui.js";
import { gameState, gameResult, pitcherLines, batting, R, RESULTS, itemOuts, fmtAvg } from "../stats.js";

const EVTEXT = { sb: "盗塁", cs: "盗塁死", po: "牽制アウト", run: "走者生還", out: "アウト" };

export function itemText(it, g) {
  const where = `${it.inn}回${it.half === "T" ? "表" : "裏"}`;
  if (it.k === "ev") {
    const who = it.runner ? esc(player(it.runner)?.name || "") + " " : "";
    const side = it.side === "def" ? "（相手）" : "";
    return `<span class="muted">${where}</span> ${who}${EVTEXT[it.type] || it.type}${side}${it.type === "run" && it.side === "def" && it.er === false ? "（非自責）" : ""}`;
  }
  const who = it.side === "off" ? esc(player(it.batter)?.name || "?") : `相手${it.slot}番`;
  const r = R[it.res]?.label || it.res;
  const extra = [(it.runs ? `${it.runs}点` : ""), (it.rbi ? `打点${it.rbi}` : "")].filter(Boolean).join("・");
  return `<span class="muted">${where}</span> ${it.slot}番 ${who}：<strong>${r}</strong>${extra ? `（${extra}）` : ""} <span class="muted small">${esc(it.p || "")}</span>`;
}

export function scoreboard(g) {
  const st = gameState(g);
  const n = Math.max(7, st.line.us.length, st.line.them.length);
  const us = state.settings.teamName || "自チーム", them = g.opponent || "相手";
  const rows = g.first !== false ? [["us", us], ["them", them]] : [["them", them], ["us", us]];
  const hits = { us: 0, them: 0 };
  (g.log || []).forEach((it) => { if (it.k === "pa" && R[it.res]?.hit) hits[it.side === "off" ? "us" : "them"]++; });
  return `<div class="board"><table><thead><tr><th></th>${Array.from({ length: n }, (_, i) => `<th>${i + 1}</th>`).join("")}<th>計</th><th>安</th></tr></thead><tbody>
    ${rows.map(([k, name]) => `<tr><td class="team">${esc(name)}</td>${Array.from({ length: n }, (_, i) => `<td>${st.line[k][i] ?? ""}</td>`).join("")}<td class="r">${st.score[k]}</td><td>${hits[k]}</td></tr>`).join("")}
  </tbody></table></div>`;
}

export function pitcherTable(g, editable) {
  const { lines } = pitcherLines(g, state.settings);
  const arr = Object.values(lines).sort((a, b) => (b.starter ? 1 : 0) - (a.starter ? 1 : 0));
  if (!arr.length) return `<p class="muted">守備の記録がまだありません。</p>`;
  return `<div class="tablewrap"><table><thead><tr><th class="l">投手</th><th>投球回</th><th>打者</th><th>球数</th><th>被安打</th><th>奪三振</th><th>四死球</th><th>失点</th><th>自責</th><th>QS</th></tr></thead><tbody>
    ${arr.map((L) => `<tr><td class="l">${pname(L.pid)}${L.starter ? ' <span class="muted small">先発</span>' : ""}</td><td>${L.ipText}</td><td>${L.bf}</td><td>${L.pitches}</td><td>${L.h}</td><td>${L.k}</td><td>${L.bb + L.hbp}</td>
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
  const bat = ids.map((pid) => ({ pid, b: batting([g], pid, state.settings), line: (g.log || []).filter((i) => i.k === "pa" && i.side === "off" && i.batter === pid).map((i) => R[i.res]?.short || "") }));
  const log = g.log || [];
  const html = `
    <div class="row noprint"><a href="#/games" class="btn sm">‹ 試合一覧</a></div>
    <h1>第${g.no}試合 vs ${esc(g.opponent)} ${fin ? `<span class="chip ${r.wl === "勝" ? "win" : r.wl === "負" ? "lose" : ""}">${r.wl}</span>` : `<span class="chip live">入力中</span>`}</h1>
    <p class="muted" style="margin-top:-8px">${esc(g.date)}・${esc(tname(g.tournamentId))}・${g.first !== false ? "先攻" : "後攻"}</p>
    ${canWrite ? `<div class="row noprint" style="margin-bottom:12px">
      <a class="btn primary big" href="#/game/${g.id}/input">${fin ? "入力画面を開く" : "入力を続ける"}</a>
      <a class="btn" href="#/game/${g.id}/edit">試合情報・スタメンを直す</a>
      ${fin ? `<button class="btn" id="reopen">入力中に戻す</button>` : `<button class="btn" id="finish">試合終了にする</button>`}
    </div>` : ""}
    ${scoreboard(g)}
    <h2>投手成績</h2>
    ${pitcherTable(g, canWrite)}
    <h2>打撃成績</h2>
    <div class="tablewrap"><table><thead><tr><th class="l">打順・選手</th><th class="l">結果</th><th>打席</th><th>打数</th><th>安打</th><th>打点</th><th>三振</th><th>四死球</th><th>盗塁</th></tr></thead><tbody>
      ${bat.map(({ pid, b, line }) => `<tr><td class="l">${(g.lineup || []).indexOf(pid) >= 0 ? (g.lineup.indexOf(pid) + 1) + ". " : ""}<a href="#/player/${pid}">${pname(pid)}</a></td><td class="l">${line.join(" ")}</td><td>${b.pa}</td><td>${b.ab}</td><td>${b.h}</td><td>${b.rbi}</td><td>${b.k}</td><td>${b.bb + b.hbp}</td><td>${b.sb}</td></tr>`).join("")}
    </tbody></table></div>
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
        <label class="f">打者の左右<select name="bh"><option value="R" ${it.bh !== "L" ? "selected" : ""}>右</option><option value="L" ${it.bh === "L" ? "selected" : ""}>左</option></select></label>
        <label class="f">投手の左右<select name="ph"><option value="R" ${it.ph !== "L" ? "selected" : ""}>右</option><option value="L" ${it.ph === "L" ? "selected" : ""}>左</option></select></label>
        <label class="f">入った点<input type="number" min="0" max="4" name="runs" value="${it.runs ?? 0}"></label>
        <label class="f">打点<input type="number" min="0" max="4" name="rbi" value="${it.rbi ?? 0}"></label>
        ${off ? "" : `<label class="f">うち自責点<input type="number" min="0" max="4" name="er" value="${it.er ?? it.runs ?? 0}"></label>`}
        <label class="f">この打席で増えたアウト<input type="number" min="0" max="3" name="outs" value="${itemOuts(it)}"></label>
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
      };
      if (off) patch.batter = f.batter.value; else { patch.pitcher = f.pitcher.value; patch.er = +f.er.value || 0; }
      save(patch);
    };
    $("#rm", el).onclick = () => { if (confirm("この打席を消しますか？")) save(null); };
    $("#cx", el).onclick = closeSheet;
  });
}
export { HAND, numberOf, fmtAvg };
