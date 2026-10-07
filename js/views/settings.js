// =====================================================================
//  設定（views/settings.js）
//  選手・大会区分・集計ルール・使える人・バックアップ・ゴミ箱
// =====================================================================
import * as store from "../store.js";
import { state } from "../store.js";
import { esc, $, $$, toast, sheet, closeSheet, numberOf, gradeText, thisSeason, tournaments, download, HAND } from "../ui.js";
import { RESULTS, R } from "../stats.js";

export function viewSettings() {
  const S = state.settings;
  const admin = state.role === "admin";
  const canWrite = state.role !== "viewer";
  const players = [...state.players].filter((p) => !p.deleted && !p.opp).sort((a, b) => (b.active !== false) - (a.active !== false) || (Number(numberOf(a)) || 999) - (Number(numberOf(b)) || 999));
  const trash = state.games.filter((g) => g.deleted);
  const html = `<h1>設定</h1>
    <h2>選手</h2>
    <p class="muted small">本名でなくても、背番号や呼び名だけで登録できます。卒業した選手は「在籍していない」にすると、成績は残したまま選択肢から消えます。</p>
    ${canWrite ? `<button class="btn primary" id="addp">＋ 選手を追加</button>` : ""}
    <div class="tablewrap" style="margin-top:8px"><table><thead><tr><th class="l">表示名</th><th>背番号(${thisSeason()})</th><th>学年</th><th>投</th><th>打</th><th class="l">守備</th><th class="l">状態</th><th></th></tr></thead><tbody>
      ${players.map((p) => `<tr><td class="l">${esc(p.name)}</td><td>${esc(numberOf(p))}</td><td>${esc(gradeText(p))}</td><td>${HAND[p.throws] || ""}</td><td>${HAND[p.bats] || ""}</td><td class="l">${esc(p.pos || "")}</td><td class="l">${p.active === false ? '<span class="muted">在籍していない</span>' : "在籍"}</td><td>${canWrite ? `<button class="btn sm" data-editp="${p.id}">直す</button>` : ""}</td></tr>`).join("") || `<tr><td class="l" colspan="8">まだ選手がいません</td></tr>`}
    </tbody></table></div>

    <h2>チーム名</h2>
    <div class="row"><input type="text" id="team" value="${esc(S.teamName)}" ${admin ? "" : "disabled"} style="max-width:320px">${admin ? `<button class="btn" id="saveteam">保存</button>` : ""}</div>

    <h2>スタッフ（メンバー表に載ります）</h2>
    <div class="card"><div class="grid2">
      ${[["manager", "監督"], ["director", "部長"], ["coach", "コーチ"], ["scorer", "スコアラー"]].map(([k, n]) => `<label class="f">${n}<input type="text" data-staff="${k}" value="${esc(S.staff?.[k] || "")}" ${admin ? "" : "disabled"}></label>`).join("")}
    </div>${admin ? `<div class="row" style="margin-top:10px"><button class="btn" id="savestaff">保存</button></div>` : ""}</div>

    <h2>大会区分</h2>
    <p class="muted small">名前を変えても、過去の試合の区分はそのまま引き継がれます。使わなくなった区分は「隠す」にしてください。</p>
    <div class="card stack" style="gap:6px">
      ${tournaments(true).map((t, i, arr) => `<div class="row"><span class="grow" style="${t.active === false ? "opacity:.5" : ""}">${esc(t.name)}${t.active === false ? "（隠し中）" : ""}</span>
        ${admin ? `<button class="btn sm" data-tup="${t.id}" ${i === 0 ? "disabled" : ""}>↑</button><button class="btn sm" data-tdown="${t.id}" ${i === arr.length - 1 ? "disabled" : ""}>↓</button>
        <button class="btn sm" data-tren="${t.id}">名前変更</button><button class="btn sm" data-thide="${t.id}">${t.active === false ? "表示する" : "隠す"}</button>` : ""}</div>`).join("")}
      ${admin ? `<div class="row"><input type="text" id="newt" placeholder="新しい大会区分の名前" class="grow" style="max-width:320px"><button class="btn" id="addt">追加</button></div>` : ""}
    </div>

    <h2>集計ルール</h2>
    <div class="card stack">
      <strong>打数に含める結果</strong>
      <p class="muted small" style="margin:0">チームのルール：犠飛・進塁打は打数に含めません。チェックを変えると、過去の試合もすべて新しいルールで計算し直します。</p>
      <div class="row">${RESULTS.map((r) => `<label class="row" style="gap:4px;min-width:110px"><input type="checkbox" data-ab="${r.c}" ${S.abRules[r.c] ? "checked" : ""} ${admin ? "" : "disabled"}> ${r.label}</label>`).join("")}</div>
      <div class="grid2">
        <label class="f">奪三振率・防御率の換算イニング<input type="number" id="inn" min="1" max="9" value="${S.innings}" ${admin ? "" : "disabled"}></label>
        <label class="f">QSの条件：投球回（○回以上）<input type="number" id="qsinn" min="1" max="9" value="${Math.floor(S.qs.minOuts / 3)}" ${admin ? "" : "disabled"}></label>
        <label class="f">QSの条件：自責点（○点以下）<input type="number" id="qser" min="0" max="9" value="${S.qs.maxER}" ${admin ? "" : "disabled"}></label>
        <label class="f">ランキングの規定打席（試合数 × ○）<input type="number" id="qpa" min="0" max="5" step="0.1" value="${S.qual.paPerGame}" ${admin ? "" : "disabled"}></label>
        <label class="f">ランキングの規定投球回（試合数 × ○回）<input type="number" id="qip" min="0" max="7" step="0.1" value="${S.qual.ipPerGame}" ${admin ? "" : "disabled"}></label>
      </div>
      ${admin ? `<button class="btn primary" id="saverules" style="justify-self:start">ルールを保存</button>` : ""}
    </div>

    ${admin ? `<h2>使える人</h2>
    <p class="muted small">ここに登録したメールアドレスの人だけがログインして使えます。<br>管理者＝すべて操作できる／入力者＝試合と選手を入力できる／閲覧者＝見るだけ</p>
    <div class="card stack" style="gap:6px">
      ${state.members.sort((a, b) => a.email.localeCompare(b.email)).map((m) => `<div class="row"><span class="grow">${esc(m.email)}</span>
        <select data-role="${esc(m.email)}" style="width:auto">${[["admin", "管理者"], ["scorer", "入力者"], ["viewer", "閲覧者"]].map(([v, l]) => `<option value="${v}" ${m.role === v ? "selected" : ""}>${l}</option>`).join("")}</select>
        <button class="btn sm danger" data-rmm="${esc(m.email)}">外す</button></div>`).join("") || `<span class="muted">まだ誰も登録されていません（持ち主のあなたは最初から管理者です）</span>`}
      <div class="row"><input type="email" id="newm" placeholder="メールアドレス" class="grow" style="max-width:320px">
        <select id="newr" style="width:auto"><option value="scorer">入力者</option><option value="viewer">閲覧者</option><option value="admin">管理者</option></select>
        <button class="btn" id="addm">追加</button></div>
    </div>` : ""}

    <h2>バックアップ</h2>
    <div class="card stack">
      <p class="muted small" style="margin:0">全データを1つのファイルに保存します。月に1回、USBメモリやGoogleドライブに保存しておくと安心です。</p>
      <div class="row"><button class="btn primary" id="bk">全データをバックアップ</button>
      ${admin ? `<label class="btn">バックアップから復元<input type="file" id="rs" accept=".json,application/json" hidden></label>` : ""}</div>
    </div>

    ${admin ? `<h2>ゴミ箱（削除した試合）</h2>
    <div class="card stack" style="gap:6px">
      ${trash.map((g) => `<div class="row"><span class="grow">${g.scout ? `相手分析 ${esc(g.date)} ${esc(g.top)} 対 ${esc(g.bottom)}` : `第${g.no}試合 ${esc(g.date)} vs ${esc(g.opponent)}`}</span><button class="btn sm" data-restore="${g.id}">元に戻す</button><button class="btn sm danger" data-purge="${g.id}">完全に消す</button></div>`).join("") || `<span class="muted">空です</span>`}
    </div>` : ""}
    <p class="muted small" style="margin-top:24px">ログイン中：${esc(state.user?.email)}（${({ admin: "管理者", scorer: "入力者", viewer: "閲覧者" })[state.role]}）</p>`;

  const after = (root) => {
    $("#addp", root)?.addEventListener("click", () => playerSheet(null));
    $$("[data-editp]", root).forEach((b) => b.onclick = () => playerSheet(b.dataset.editp));
    $("#saveteam", root)?.addEventListener("click", () => { saveS({ teamName: $("#team", root).value.trim() || "野球部" }); toast("保存しました"); });
    $("#savestaff", root)?.addEventListener("click", () => { saveS({ staff: Object.fromEntries($$("[data-staff]", root).map((i) => [i.dataset.staff, i.value.trim()])) }); toast("保存しました"); });
    // 大会区分
    const tl = () => tournaments(true).map((t) => ({ ...t }));
    const saveT = (arr) => saveS({ tournaments: arr.map((t, i) => ({ ...t, order: i })) });
    $$("[data-tup],[data-tdown]", root).forEach((b) => b.onclick = () => {
      const arr = tl(); const id = b.dataset.tup || b.dataset.tdown; const i = arr.findIndex((t) => t.id === id);
      const j = b.dataset.tup ? i - 1 : i + 1; [arr[i], arr[j]] = [arr[j], arr[i]]; saveT(arr);
    });
    $$("[data-tren]", root).forEach((b) => b.onclick = () => {
      const arr = tl(); const t = arr.find((x) => x.id === b.dataset.tren);
      const n = prompt("新しい名前", t.name); if (!n) return; t.name = n.trim(); saveT(arr);
    });
    $$("[data-thide]", root).forEach((b) => b.onclick = () => {
      const arr = tl(); const t = arr.find((x) => x.id === b.dataset.thide); t.active = t.active === false; saveT(arr);
    });
    $("#addt", root)?.addEventListener("click", () => {
      const n = $("#newt", root).value.trim(); if (!n) return;
      const arr = tl(); arr.push({ id: "t" + store.newId(), name: n, active: true }); saveT(arr); toast("追加しました");
    });
    // ルール
    $("#saverules", root)?.addEventListener("click", () => {
      const abRules = {}; $$("[data-ab]", root).forEach((c) => (abRules[c.dataset.ab] = c.checked));
      const innings = Math.max(1, +$("#inn", root).value || 7);
      saveS({ abRules, innings, qs: { minOuts: Math.max(1, +$("#qsinn", root).value || 5) * 3, maxER: Math.max(0, +$("#qser", root).value) },
        qual: { paPerGame: Math.max(0, +$("#qpa", root).value), ipPerGame: Math.max(0, +$("#qip", root).value) } });
      toast("ルールを保存しました");
    });
    // メンバー
    $$("[data-role]", root).forEach((s) => s.onchange = () => { store.setMember(s.dataset.role, s.value); toast("変更しました"); });
    $$("[data-rmm]", root).forEach((b) => b.onclick = () => { if (confirm(`${b.dataset.rmm} を外しますか？`)) store.removeMember(b.dataset.rmm); });
    $("#addm", root)?.addEventListener("click", () => {
      const e = $("#newm", root).value.trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return alert("メールアドレスを正しく入力してください。");
      store.setMember(e, $("#newr", root).value); toast("追加しました");
    });
    // バックアップ
    $("#bk", root).onclick = () => {
      const d = new Date(); const z = (n) => String(n).padStart(2, "0");
      download(`野球成績バックアップ_${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}.json`, JSON.stringify(store.exportAll(), null, 1), "application/json");
    };
    $("#rs", root)?.addEventListener("change", async (e) => {
      const file = e.target.files[0]; if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        const plan = store.importPlan(data);
        if (!plan.games.length && !plan.players.length && !plan.settings) {
          alert(`バックアップ（${data.exportedAt?.slice(0, 10) || "日付不明"}）の内容は、すべて今のアプリに入っています。戻すものはありません。`);
          return;
        }
        if (!confirm(`バックアップ（${data.exportedAt?.slice(0, 10) || "日付不明"}）から、なくなっている分だけを戻します。\n\n・戻す：試合${plan.games.length}件、選手${plan.players.length}人\n・今のまま残す：試合${plan.keepGames}件、選手${plan.keepPlayers}人\n\n今入っている記録は上書きしません。戻しますか？`)) return;
        await store.importAll(data); toast(`試合${plan.games.length}件・選手${plan.players.length}人を戻しました`);
      } catch (err) { alert("復元できませんでした：" + err.message); }
      e.target.value = "";
    });
    // ゴミ箱
    $$("[data-restore]", root).forEach((b) => b.onclick = () => { store.patchGame(b.dataset.restore, { deleted: false }); toast("元に戻しました"); });
    $$("[data-purge]", root).forEach((b) => b.onclick = () => { if (confirm("完全に消すと元に戻せません。消しますか？")) store.hardDeleteGame(b.dataset.purge); });
  };
  return { html, after };
}

function saveS(patch) {
  const S = state.settings;
  store.saveSettings({ teamName: S.teamName, innings: S.innings, qs: S.qs, qual: S.qual, abRules: S.abRules, tournaments: S.tournaments, staff: S.staff || {}, ...patch });
}

function playerSheet(id) {
  const p = id ? state.players.find((x) => x.id === id) : { name: "", entryYear: thisSeason(), throws: "R", bats: "R", pos: "", numbers: {}, active: true };
  const season = thisSeason();
  sheet(`<h2>${id ? "選手を直す" : "選手を追加"}</h2>
    <form id="pf" class="stack">
      <label class="f">表示名（本名でなくてもOK）<input type="text" name="name" value="${esc(p.name)}" required></label>
      <div class="grid2">
        <label class="f">背番号（${season}年度）<input type="text" name="num" value="${esc((p.numbers || {})[season] ?? "")}" inputmode="numeric"></label>
        <label class="f">入学年度（学年の自動計算用）<input type="number" name="entryYear" value="${esc(p.entryYear ?? "")}" min="2000" max="2100"></label>
        <label class="f">投げる手<select name="throws"><option value="R" ${p.throws !== "L" ? "selected" : ""}>右投げ</option><option value="L" ${p.throws === "L" ? "selected" : ""}>左投げ</option></select></label>
        <label class="f">打つ側<select name="bats"><option value="R" ${p.bats === "R" || !p.bats ? "selected" : ""}>右打ち</option><option value="L" ${p.bats === "L" ? "selected" : ""}>左打ち</option><option value="S" ${p.bats === "S" ? "selected" : ""}>両打ち</option></select></label>
        <label class="f">主な守備位置<input type="text" name="pos" value="${esc(p.pos || "")}" placeholder="例：投・遊"></label>
        <label class="f">状態<select name="active"><option value="1" ${p.active !== false ? "selected" : ""}>在籍</option><option value="0" ${p.active === false ? "selected" : ""}>在籍していない（卒業・退部）</option></select></label>
      </div>
      <div class="row"><button class="btn primary grow" type="submit">保存</button><button class="btn" type="button" id="cx">やめる</button></div>
    </form>`, (el) => {
    const f = $("#pf", el);
    f.onsubmit = (e) => {
      e.preventDefault();
      const numbers = { ...(p.numbers || {}) };
      if (f.num.value.trim() === "") delete numbers[season]; else numbers[season] = f.num.value.trim();
      store.savePlayer({ ...p, id, name: f.name.value.trim(), numbers, entryYear: f.entryYear.value ? Number(f.entryYear.value) : null,
        throws: f.throws.value, bats: f.bats.value, pos: f.pos.value.trim(), active: f.active.value === "1" });
      closeSheet(); toast("保存しました");
    };
    $("#cx", el).onclick = closeSheet;
  });
}
export { R };
