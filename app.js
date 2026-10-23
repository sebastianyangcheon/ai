const KEY = "fpscoach_v2_history";

const state = {
  game: "valorant",
  history: loadHistory(),
  lastResult: null,
  valorantImport: []
};

function loadHistory() {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

const $ = (id) => document.getElementById(id);
const num = (id) => Number($(id)?.value) || 0;

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state.history.slice(0, 20)));
  } catch (e) {
    console.warn(e);
  }
}

function go(view) {
  const target = $(view);
  if (!target) return;

  document.querySelectorAll(".view").forEach((el) => el.classList.remove("active"));
  target.classList.add("active");

  document.querySelectorAll(".nav").forEach((el) => {
    el.classList.toggle("active", el.dataset.view === view);
  });

  if (view === "home") renderHome();
  if (view === "history") renderHistory();
  if (view === "result" && state.lastResult) {
    renderResult(state.lastResult, state.lastResult.ai || null, false);
  }

  // 모바일 브라우저에서도 화면 전환 후 확실하게 위로 이동
  requestAnimationFrame(() => window.scrollTo(0, 0));
}

function calculateMetrics(s) {
  const kd = s.kills / Math.max(1, s.deaths);
  return {
    combat: Math.round(clamp(kd * 50) * 0.55 + clamp(s.accuracy * 2) * 0.25 + clamp(s.impact) * 0.20),
    aim: Math.round(clamp(s.accuracy * 2) * 0.55 + clamp(s.headshot * 3.3) * 0.45),
    impact: Math.round(clamp(s.impact) * 0.65 + clamp(kd * 50) * 0.35),
    position: Math.round(clamp(s.position))
  };
}

function calculateTotal(s, m) {
  return Math.round(clamp(m.combat * .30 + m.aim * .30 + m.impact * .20 + m.position * .20 + (s.result === "win" ? 5 : 0)));
}

function getRank(score) {
  if (score >= 90) return "Master";
  if (score >= 80) return "Diamond";
  if (score >= 70) return "Platinum";
  if (score >= 60) return "Gold";
  if (score >= 50) return "Silver";
  return "Bronze";
}

function avg(list, key) {
  if (!list.length) return 0;
  return Math.round(list.reduce((sum, x) => sum + Number(key === "total" ? x.total || 0 : x.metrics?.[key] || 0), 0) / list.length);
}

function getRecentStats() {
  const recent = state.history.slice(0, 5);
  const previous = state.history.slice(5, 10);
  return {
    recent,
    previous,
    recentAverage: {
      total: avg(recent, "total"), aim: avg(recent, "aim"), combat: avg(recent, "combat"),
      impact: avg(recent, "impact"), position: avg(recent, "position")
    },
    previousAverage: {
      total: avg(previous, "total"), aim: avg(previous, "aim"), combat: avg(previous, "combat"),
      impact: avg(previous, "impact"), position: avg(previous, "position")
    }
  };
}

function trend(current, previous) {
  if (!previous) return "stable";
  if (current - previous >= 5) return "up";
  if (current - previous <= -5) return "down";
  return "stable";
}

function confidence(count) {
  if (count < 3) return { level: "low", label: "낮음", description: "경기 수가 적어 지속적인 패턴을 판단하기 어렵습니다." };
  if (count < 5) return { level: "medium", label: "보통", description: "간단한 최근 경기 비교가 가능합니다." };
  if (count < 10) return { level: "high", label: "높음", description: "최근 경기의 추세를 비교할 수 있습니다." };
  return { level: "very-high", label: "매우 높음", description: "충분한 경기 기록을 바탕으로 반복되는 패턴을 확인할 수 있습니다." };
}

function chooseWeakness(metrics, stats) {
  const names = { aim: "에임", combat: "교전 능력", impact: "임팩트", position: "포지셔닝" };
  return Object.entries(metrics)
    .map(([key, value]) => {
      const average = stats.recentAverage[key] || 0;
      const previous = stats.previousAverage[key] || 0;
      const low = Math.max(0, 70 - value);
      const below = Math.max(0, average - value);
      const down = trend(average, previous) === "down" ? 15 : 0;
      return { key, name: names[key], value, average, previous, priority: low * .35 + below * .4 + down * .25 };
    })
    .sort((a, b) => b.priority - a.priority)[0];
}

function analyze(input) {
  const metrics = calculateMetrics(input);
  const total = calculateTotal(input, metrics);
  const stats = getRecentStats();
  const count = state.history.length;
  const conf = confidence(count);
  const weakness = chooseWeakness(metrics, stats);
  const difference = weakness.value - weakness.average;

  let evidence;
  if (count === 0) {
    evidence = `현재 ${weakness.name} 지표는 ${weakness.value}점입니다. 첫 경기라 개인 평균과 비교할 기록이 없습니다.`;
  } else {
    evidence = `현재 ${weakness.name} 지표는 ${weakness.value}점이며 최근 경기 평균은 ${weakness.average}점입니다.`;
    if (difference < 0) evidence += ` 평균보다 ${Math.abs(difference)}점 낮습니다.`;
    if (count >= 3 && trend(weakness.average, weakness.previous) === "down") evidence += " 최근 구간에서도 하락 추세가 확인됩니다.";
  }

  const goal = {
    aim: "다음 경기에서는 에임 관련 지표를 안정적으로 유지해보세요.",
    combat: "다음 경기에서는 교전에서 안정적인 결과를 만드는 데 집중해보세요.",
    impact: "다음 경기에서는 팀 승리에 기여하는 임팩트를 높이는 데 집중해보세요.",
    position: "다음 경기에서는 포지셔닝 지표를 안정적으로 유지해보세요."
  }[weakness.key];

  const strength = Object.entries(metrics).sort((a, b) => b[1] - a[1])[0];
  const strengthNames = { aim: "에임", combat: "교전 능력", impact: "임팩트", position: "포지셔닝" };

  const notes = [];
  if (input.accuracy < 25) notes.push("정확도 지표가 낮은 편입니다.");
  if (input.headshot < 15) notes.push("헤드샷 비율이 낮은 편입니다.");
  if (input.kills / Math.max(1, input.deaths) < .9) notes.push("K/D 비율이 낮은 편입니다.");
  if (input.impact < 60) notes.push("임팩트 지표가 낮은 편입니다.");
  if (input.position < 60) notes.push("포지셔닝 지표가 낮은 편입니다.");
  if (!notes.length) notes.push("현재 경기에서는 특별히 낮은 지표가 두드러지지 않습니다. 기록을 더 쌓아 추세를 확인해보세요.");

  const trends = {};
  if (count >= 3) {
    ["aim", "combat", "impact", "position"].forEach(k => trends[k] = trend(stats.recentAverage[k], stats.previousAverage[k]));
  }

  return {
    ...input,
    id: Date.now(),
    metrics,
    total,
    rank: getRank(total),
    focus: goal,
    evidence,
    strengths: [`${strengthNames[strength[0]]} 지표가 ${strength[1]}점으로 현재 경기에서 가장 높습니다.`],
    notes,
    confidence: conf,
    matchCount: count,
    primaryWeakness: weakness,
    recentAverage: stats.recentAverage,
    previousAverage: stats.previousAverage,
    trends,
    date: new Date().toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
  };
}

async function getAICoaching(r) {
  const response = await fetch("/.netlify/functions/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      game: r.game,
      result: r.result,
      current: { total: r.total, metrics: r.metrics, kills: r.kills, deaths: r.deaths, assists: r.assists, accuracy: r.accuracy, headshot: r.headshot, impact: r.impact, positioning: r.position },
      recent: { count: r.matchCount, average: r.recentAverage, previousAverage: r.previousAverage, trends: r.trends },
      confidence: r.confidence,
      primaryWeakness: r.primaryWeakness
    })
  });
  if (!response.ok) throw new Error(`AI 서버 ${response.status}`);
  const data = await response.json();
  if (!data?.summary || !data?.improvement || !data?.nextGoal) throw new Error("AI 응답 형식 오류");
  return data;
}

function renderResult(r, ai = null, loading = false) {
  const names = { combat: "교전 능력", aim: "에임", impact: "임팩트", position: "포지셔닝" };
  const title = r.game === "valorant" ? "VALORANT" : "OVERWATCH 2";

  if ($("resultTitle")) $("resultTitle").textContent = `${title} 분석 결과`;
  if ($("resultMeta")) $("resultMeta").textContent = `${r.date} · ${r.result === "win" ? "승리" : "패배"} · K/D/A ${r.kills}/${r.deaths}/${r.assists}`;
  if ($("score")) $("score").textContent = r.total;
  if ($("rank")) $("rank").textContent = r.rank;
  if ($("scoreCircle")) $("scoreCircle").style.setProperty("--deg", `${r.total * 3.6}deg`);

  if ($("metrics")) {
    $("metrics").innerHTML = Object.entries(r.metrics).map(([key, value]) => `
      <div class="metric"><div class="metric-head"><span>${names[key]}</span><strong>${value}</strong></div>
      <div class="meter"><i style="width:${clamp(value)}%"></i></div></div>`).join("");
  }

  if ($("strengths")) $("strengths").innerHTML = (r.strengths || []).map(x => `<div class="bullet">✓ ${x}</div>`).join("");

  if ($("focus")) {
    $("focus").innerHTML = loading
      ? "🤖 AI가 통계 분석 결과를 바탕으로 코칭을 정리하고 있습니다..."
      : `🎯 ${ai?.nextGoal || r.focus}`;
  }

  if ($("feedback")) {
    const items = ai
      ? [`요약: ${ai.summary}`, `강점: ${ai.strength || r.strengths?.[0] || "-"}`, `개선점: ${ai.improvement}`, `근거: ${ai.evidence || r.evidence}`]
      : [`${r.evidence}`, ...(r.notes || [])];
    $("feedback").innerHTML = items.map(x => `<div class="bullet">• ${x}</div>`).join("");
    if (loading) $("feedback").innerHTML += `<div class="bullet">• AI 조언을 불러오는 중입니다. 통계 분석은 이미 완료되었습니다.</div>`;
  }
}


function formatMatchDate(value) {
  if (!value) return "시간 정보 없음";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function matchToInput(match) {
  return {
    game: "valorant",
    result: match.result === "win" ? "win" : "loss",
    kills: Number(match.kills) || 0,
    deaths: Number(match.deaths) || 0,
    assists: Number(match.assists) || 0,
    accuracy: Number(match.accuracy) || 0,
    headshot: Number(match.headshot) || 0,
    impact: Number(match.impact) || 0,
    position: Number(match.position) || 60,
    source: "henrikdev",
    matchId: match.id || null,
    map: match.map || "Unknown",
    mode: match.mode || "Unknown",
    agent: match.agent || null,
    startedAt: match.startedAt || null
  };
}

function renderValorantMatches(matches) {
  const box = $("valorantMatches");
  if (!box) return;
  if (!matches.length) {
    box.innerHTML = '<div class="goal-empty">최근 경쟁전 데이터를 찾지 못했습니다.</div>';
    return;
  }

  box.innerHTML = `
    <div class="import-actions">
      <button type="button" class="secondary" id="importAllValorant">최근 ${matches.length}경기 전체 분석</button>
      <span class="import-hint">전체 분석을 하면 최근 경기 추세와 반복되는 약점을 함께 계산합니다.</span>
    </div>
    <div class="auto-match-list">
      ${matches.map((m, i) => `
        <div class="auto-match">
          <div class="auto-match-main">
            <strong>${m.result === "win" ? "승리" : "패배"}</strong>
            <span>${m.map || "Unknown"} · ${m.agent || "요원 정보 없음"}</span>
            <small>${formatMatchDate(m.startedAt)} · ${m.mode || "경쟁전"}</small>
          </div>
          <div class="auto-match-stats"><b>${m.kills}/${m.deaths}/${m.assists}</b><span>HS ${m.headshot}%</span></div>
          <button type="button" class="secondary use-match" data-index="${i}">이 경기 사용</button>
        </div>`).join("")}
    </div>`;

  $("importAllValorant")?.addEventListener("click", () => analyzeImportedMatches(matches));
  box.querySelectorAll(".use-match").forEach(btn => btn.addEventListener("click", () => {
    const match = matches[Number(btn.dataset.index)];
    applyValorantMatch(match);
  }));
}

function applyValorantMatch(match) {
  const input = matchToInput(match);
  $("result").value = input.result;
  $("kills").value = input.kills;
  $("deaths").value = input.deaths;
  $("assists").value = input.assists;
  $("accuracy").value = input.accuracy;
  $("headshot").value = input.headshot;
  $("impact").value = input.impact;
  $("position").value = input.position;
  const status = $("valorantStatus");
  if (status) status.textContent = `선택한 경기 ${input.kills}/${input.deaths}/${input.assists} 데이터를 입력폼에 적용했습니다.`;
  go("input");
  requestAnimationFrame(() => $("form")?.scrollIntoView({ behavior: "smooth", block: "start" }));
}

async function loadValorantMatches() {
  const consent = $("valorantConsent")?.checked;
  const name = $("riotName")?.value.trim();
  const tag = $("riotTag")?.value.trim();
  const region = $("valorantRegion")?.value || "kr";
  const status = $("valorantStatus");
  const box = $("valorantMatches");
  const button = $("loadValorant");

  if (!consent) {
    if (status) status.textContent = "본인 또는 사용 허가를 받은 계정에 대한 조회 동의를 먼저 체크해주세요.";
    return;
  }
  if (!name || !tag) {
    if (status) status.textContent = "Riot ID의 닉네임과 태그를 입력해주세요.";
    return;
  }

  if (button) { button.disabled = true; button.textContent = "불러오는 중…"; }
  if (status) status.textContent = "최근 경쟁전 데이터를 조회하고 있습니다.";
  if (box) box.innerHTML = "";

  try {
    const response = await fetch("/.netlify/functions/valorant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, tag, region, size: 5, platform: "pc" })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `서버 오류 ${response.status}`);
    state.valorantImport = data.matches || [];
    if (status) status.textContent = `${data.name}#${data.tag}의 최근 경쟁전 ${state.valorantImport.length}경기를 불러왔습니다.`;
    renderValorantMatches(state.valorantImport);
  } catch (error) {
    state.valorantImport = [];
    if (status) status.textContent = error.message || "전적을 불러오지 못했습니다.";
  } finally {
    if (button) { button.disabled = false; button.textContent = "최근 전적 불러오기"; }
  }
}

function buildBatchResult(matches) {
  const inputs = matches.map(matchToInput);
  const analyses = inputs.map(analyze);
  const avgField = key => Math.round(analyses.reduce((sum, x) => sum + Number(x[key] || 0), 0) / Math.max(1, analyses.length) * 10) / 10;
  const avgMetric = key => Math.round(analyses.reduce((sum, x) => sum + Number(x.metrics?.[key] || 0), 0) / Math.max(1, analyses.length));
  const wins = inputs.filter(x => x.result === "win").length;
  const totalKills = inputs.reduce((s, x) => s + x.kills, 0);
  const totalDeaths = inputs.reduce((s, x) => s + x.deaths, 0);
  const totalAssists = inputs.reduce((s, x) => s + x.assists, 0);
  const metrics = { combat: avgMetric("combat"), aim: avgMetric("aim"), impact: avgMetric("impact"), position: avgMetric("position") };
  const total = Math.round(avgMetric("total"));
  const sorted = Object.entries(metrics).sort((a,b) => a[1]-b[1]);
  const weaknessNames = { aim: "에임", combat: "교전 능력", impact: "임팩트", position: "포지셔닝" };
  const strengthNames = { aim: "에임", combat: "교전 능력", impact: "임팩트", position: "포지셔닝" };
  const weakest = sorted[0];
  const strongest = sorted[sorted.length - 1];
  const batch = {
    game: "valorant", result: wins >= Math.ceil(inputs.length / 2) ? "win" : "loss",
    kills: Math.round(avgField("kills")), deaths: Math.round(avgField("deaths")), assists: Math.round(avgField("assists")),
    accuracy: avgField("accuracy"), headshot: avgField("headshot"), impact: avgField("impact"), position: avgField("position"),
    id: Date.now(), total, rank: getRank(total), metrics,
    focus: `최근 ${inputs.length}경기에서 ${weaknessNames[weakest[0]]}을 가장 먼저 안정화해보세요.`,
    evidence: `최근 ${inputs.length}경기 평균 ${totalKills}/${totalDeaths}/${totalAssists} K/D/A, 승률 ${Math.round(wins / inputs.length * 100)}%, 헤드샷 ${avgField("headshot")}%입니다.`,
    strengths: [`${strengthNames[strongest[0]]} 평균 지표가 ${strongest[1]}점으로 가장 높습니다.`],
    notes: [`가장 낮은 평균 지표는 ${weaknessNames[weakest[0]]} ${weakest[1]}점입니다.`, `최근 ${inputs.length}경기의 반복 패턴을 기준으로 계산한 요약입니다.`],
    confidence: confidence(inputs.length), matchCount: inputs.length,
    primaryWeakness: { key: weakest[0], name: weaknessNames[weakest[0]], value: weakest[1], average: weakest[1], previous: weakest[1] },
    recentAverage: metrics, previousAverage: {}, trends: {},
    date: new Date().toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }),
    batch: true, batchMatches: inputs.map(x => ({ kills:x.kills, deaths:x.deaths, assists:x.assists, result:x.result, headshot:x.headshot, accuracy:x.accuracy, impact:x.impact, position:x.position, map:x.map, agent:x.agent, startedAt:x.startedAt }))
  };
  return batch;
}

async function analyzeImportedMatches(matches) {
  if (!matches?.length) return;
  const result = buildBatchResult(matches);
  state.history = [...matches.map(matchToInput).map(x => ({ ...analyze(x), source: "henrikdev", matchId: x.matchId, map: x.map, agent: x.agent, startedAt: x.startedAt })), ...state.history].slice(0, 20);
  state.lastResult = result;
  save();
  go("result");
  renderResult(result, null, true);
  await new Promise(requestAnimationFrame);
  try {
    const ai = await getAICoaching(result);
    result.ai = ai;
    renderResult(result, ai, false);
  } catch (error) {
    console.warn("Batch AI 코칭 연결 실패:", error);
    renderResult(result, null, false);
    if ($("feedback")) $("feedback").innerHTML += `<div class="bullet">• AI 연결에 실패했습니다. 최근 ${matches.length}경기 통계 분석은 정상적으로 확인할 수 있습니다.</div>`;
  }
}

async function handleSubmit(e) {
  e.preventDefault();

  const input = {
    game: state.game,
    result: $("result").value,
    kills: num("kills"), deaths: num("deaths"), assists: num("assists"),
    accuracy: num("accuracy"), headshot: num("headshot"), impact: num("impact"), position: num("position")
  };

  const result = analyze(input);
  state.history.unshift(result);
  state.history = state.history.slice(0, 20);
  state.lastResult = result;
  save();

  // 핵심 수정: 결과 화면을 먼저 활성화하고, 같은 이벤트 안에서 즉시 그립니다.
  const resultView = $("result");
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  resultView?.classList.add("active");
  document.querySelectorAll(".nav").forEach(v => v.classList.toggle("active", v.dataset.view === "result"));
  window.scrollTo(0, 0);
  renderResult(result, null, true);

  // 브라우저가 화면을 그린 뒤 AI 요청을 시작합니다.
  await new Promise(requestAnimationFrame);

  try {
    const ai = await getAICoaching(result);
    result.ai = ai;
    const stored = state.history.find(x => x.id === result.id);
    if (stored) stored.ai = ai;
    save();
    renderResult(result, ai, false);
  } catch (error) {
    console.warn("AI 코칭 연결 실패:", error);
    renderResult(result, null, false);
    if ($("feedback")) $("feedback").innerHTML += `<div class="bullet">• AI 연결에 실패했습니다. 위의 통계 기반 코칭은 정상적으로 확인할 수 있습니다.</div>`;
  }
}

function renderHome() {
  const h = state.history;
  if (!h.length) {
    if ($("heroScore")) $("heroScore").textContent = "—";
    if ($("heroRank")) $("heroRank").textContent = "첫 경기를 분석해보세요";
    if ($("summary")) $("summary").innerHTML = ["종합 점수", "에임", "교전 능력", "포지셔닝"].map(x => `<div class="stat"><small>${x}</small><strong>—</strong><small>데이터 없음</small></div>`).join("");
    if ($("trend")) $("trend").innerHTML = '<div class="goal-empty">경기 기록이 쌓이면 최근 10경기의 추세가 표시됩니다.</div>';
    if ($("nextGoal")) $("nextGoal").innerHTML = '<div class="goal-empty">아직 분석 기록이 없습니다.<br>첫 경기를 입력하면 개선 목표가 표시됩니다.</div>';
    return;
  }

  const latest = h[0];
  if ($("heroScore")) $("heroScore").textContent = latest.total;
  if ($("heroRank")) $("heroRank").textContent = latest.rank;

  const recent = h.slice(0, 10);
  if ($("summary")) $("summary").innerHTML = [
    ["종합 점수", avg(recent, "total")], ["에임", avg(recent, "aim")], ["교전 능력", avg(recent, "combat")], ["포지셔닝", avg(recent, "position")]
  ].map(([label, value]) => `<div class="stat"><small>${label}</small><strong>${value}</strong><small>최근 ${recent.length}경기 평균</small></div>`).join("");

  if ($("trend")) $("trend").innerHTML = recent.slice().reverse().map((item, i) => `<div class="barcol"><i style="height:${clamp(item.total)}%"></i><small>${i + 1}</small></div>`).join("");
  if ($("nextGoal")) $("nextGoal").innerHTML = `<div class="goal">🎯 ${latest.ai?.nextGoal || latest.focus}</div>`;
}

function renderHistory() {
  const box = $("historyTable");
  if (!box) return;
  if (!state.history.length) {
    box.innerHTML = '<div class="panel"><p class="goal-empty">아직 경기 기록이 없습니다.</p></div>';
    return;
  }
  box.innerHTML = `<div class="history-row head"><span>경기</span><span>결과</span><span>점수</span><span>K/D</span><span>일시</span></div>` +
    state.history.map(r => `<div class="history-row"><span>${r.game === "valorant" ? "VALORANT" : "OVERWATCH 2"}</span><span class="${r.result === "win" ? "win" : "loss"}">${r.result === "win" ? "승리" : "패배"}</span><span class="score-big">${r.total}</span><span>${r.kills}/${r.deaths}</span><span>${r.date || "-"}</span></div>`).join("");
}

function clearAll() {
  if (!state.history.length) return;
  if (!confirm("모든 경기 기록을 삭제할까요?")) return;
  state.history = [];
  state.lastResult = null;
  save();
  go("home");
}

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-view]").forEach(el => el.addEventListener("click", e => { e.preventDefault(); go(el.dataset.view); }));
  document.querySelectorAll("[data-go]").forEach(el => el.addEventListener("click", () => go(el.dataset.go)));
  document.querySelectorAll(".game").forEach(el => el.addEventListener("click", () => {
    state.game = el.dataset.game;
    document.querySelectorAll(".game").forEach(x => x.classList.toggle("active", x === el));
    if ($("gameName")) $("gameName").textContent = state.game === "valorant" ? "VALORANT" : "OVERWATCH 2";
    if ($("valorantAuto")) $("valorantAuto").style.display = state.game === "valorant" ? "" : "none";
  }));
  $("form")?.addEventListener("submit", handleSubmit);
  $("loadValorant")?.addEventListener("click", loadValorantMatches);
  if ($("valorantAuto")) $("valorantAuto").style.display = state.game === "valorant" ? "" : "none";
  $("clearAll")?.addEventListener("click", clearAll);
  $("deleteHistory")?.addEventListener("click", clearAll);
  renderHome();
});
