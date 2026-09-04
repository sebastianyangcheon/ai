const KEY="fpscoach_v2_history";
const state={game:"valorant",history:JSON.parse(localStorage.getItem(KEY)||"[]")};
const $=id=>document.getElementById(id);
const n=id=>Number($(id).value)||0;

function save(){try{localStorage.setItem(KEY,JSON.stringify(state.history.slice(0,20)))}catch(e){alert("브라우저 저장 공간을 사용할 수 없습니다.")}}
function go(view){
 document.querySelectorAll(".view").forEach(x=>x.classList.remove("active"));
 $(view).classList.add("active");
 document.querySelectorAll(".nav").forEach(x=>x.classList.toggle("active",x.dataset.view===view));
 window.scrollTo({top:0,behavior:"smooth"});
 if(view==="home")renderHome();
 if(view==="history")renderHistory();
}
document.querySelectorAll("[data-view]").forEach(b=>b.addEventListener("click",e=>{e.preventDefault();go(b.dataset.view)}));
document.querySelectorAll("[data-go]").forEach(b=>b.addEventListener("click",()=>go(b.dataset.go)));

document.querySelectorAll(".game").forEach(b=>b.addEventListener("click",()=>{
 state.game=b.dataset.game;
 document.querySelectorAll(".game").forEach(x=>x.classList.toggle("active",x===b));
 $("gameName").textContent=state.game==="valorant"?"VALORANT":"OVERWATCH 2";
}));

function analyze(s){
 const kd=s.kills/Math.max(1,s.deaths);
 const combat=Math.round(Math.min(100,kd*50)*.55+Math.min(100,s.accuracy*2)*.25+Math.min(100,s.impact)*.2);
 const aim=Math.round(Math.min(100,s.accuracy*2)*.55+Math.min(100,s.headshot*3.3)*.45);
 const impact=Math.round(Math.min(100,s.impact)*.65+Math.min(100,kd*50)*.35);
 const position=Math.round(Math.min(100,s.position));
 const total=Math.min(100,Math.round(combat*.3+aim*.3+impact*.2+position*.2+(s.result==="win"?5:0)));
 const metrics={combat,aim,impact,position};
 const labels={combat:"교전 효율",aim:"에임",impact:"임팩트",position:"포지셔닝"};
 const weakest=Object.entries(metrics).sort((a,b)=>a[1]-b[1])[0][0];
 const focus={
  aim:"다음 경기에서는 교전 전에 크로스헤어 위치를 먼저 맞추는 것을 하나의 목표로 잡아보세요.",
  combat:"다음 경기에서는 불리한 1:1 교전을 한 번 줄이는 것을 목표로 잡아보세요.",
  impact:"다음 경기에서는 팀과 함께 유리한 타이밍에 교전을 시작하는 것을 의식해보세요.",
  position:"다음 경기에서는 엄폐물에서 벗어나 있는 시간을 줄여보세요."
 }[weakest];
 const strengths=[];
 if(aim>=75)strengths.push("에임 지표가 안정적입니다. 명중률을 유지하면서 교전 상황별 일관성을 높여보세요.");
 if(combat>=75)strengths.push("교전 효율이 좋습니다. 유리한 상황에서 먼저 이득을 만드는 플레이를 유지해보세요.");
 if(position>=75)strengths.push("포지셔닝이 강점입니다. 엄폐와 각도 관리 습관을 계속 유지해보세요.");
 if(!strengths.length)strengths.push("이번 경기의 데이터를 기준점으로 만들었습니다. 다음 경기와 비교하면 강점이 더 분명해집니다.");
 const notes=[];
 if(s.accuracy<25)notes.push("정확도가 낮은 편입니다. 급하게 쏘기보다 크로스헤어를 먼저 적절한 위치에 두는 습관을 추천합니다.");
 if(s.headshot<15)notes.push("헤드샷 비율이 낮습니다. 교전 전에 크로스헤어 높이를 맞추는 연습을 해보세요.");
 if(kd<.9)notes.push("K/D가 낮습니다. 킬을 늘리는 것보다 불리한 상황에서 한 번 더 생존하는 판단을 우선해보세요.");
 if(s.position<60)notes.push("포지셔닝 점수가 낮습니다. 교전 중 노출 시간이 길었는지 확인해보세요.");
 if(s.impact<60)notes.push("임팩트를 높이려면 팀과 함께 교전을 시작하거나 유리한 타이밍을 기다리는 것을 의식해보세요.");
 if(!notes.length)notes.push("전체적으로 균형 잡힌 경기입니다. 다음 목표는 가장 낮은 지표를 5~10점 올리는 것입니다.");
 return {...s,metrics,total,focus,strengths,notes,rank:total>=90?"Master":total>=80?"Diamond":total>=70?"Platinum":total>=60?"Gold":total>=50?"Silver":"Bronze",date:new Date().toLocaleString("ko-KR",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"})};
}

$("form").addEventListener("submit",e=>{
 e.preventDefault();
 const r=analyze({game:state.game,result:$("result").value,kills:n("kills"),deaths:n("deaths"),assists:n("assists"),accuracy:n("accuracy"),headshot:n("headshot"),impact:n("impact"),position:n("position")});
 state.history.unshift(r);state.history=state.history.slice(0,20);save();renderResult(r);go("result");
});

function renderResult(r){
 $("resultTitle").textContent=(r.game==="valorant"?"VALORANT":"OVERWATCH 2")+" 분석 결과";
 $("resultMeta").textContent=`${r.date} · ${r.result==="win"?"승리":"패배"} · K/D/A ${r.kills}/${r.deaths}/${r.assists}`;
 $("score").textContent=r.total;$("rank").textContent=r.rank;$("scoreCircle").style.setProperty("--deg",`${r.total*3.6}deg`);
 const names={combat:"교전 효율",aim:"에임",impact:"임팩트",position:"포지셔닝"};
 $("metrics").innerHTML=Object.entries(r.metrics).map(([k,v])=>`<div class="metric"><div class="metric-head"><span>${names[k]}</span><strong>${v}</strong></div><div class="meter"><i style="width:${v}%"></i></div></div>`).join("");
 $("strengths").innerHTML=r.strengths.map(x=>`<div class="bullet">✓ ${x}</div>`).join("");
 $("focus").textContent="🎯 "+r.focus;
 $("feedback").innerHTML=r.notes.map(x=>`<div class="bullet">• ${x}</div>`).join("");
}

function renderHome(){
 const h=state.history;
 if(!h.length){
  $("heroScore").textContent="—";$("heroRank").textContent="첫 경기를 분석해보세요";
  $("summary").innerHTML=["종합 점수","에임","교전 효율","포지셔닝"].map(x=>`<div class="stat"><small>${x}</small><strong>—</strong><small>데이터 없음</small></div>`).join("");
  $("trend").innerHTML=`<div class="goal-empty">경기 기록이 쌓이면 최근 10경기 추세가 표시됩니다.</div>`;
  $("nextGoal").innerHTML=`<div class="goal-empty">아직 분석 기록이 없습니다.<br>첫 경기를 입력하면 목표가 생깁니다.</div>`;return;
 }
 const r=h[0];$("heroScore").textContent=r.total;$("heroRank").textContent=r.rank;
 const avg=(key)=>Math.round(h.slice(0,10).reduce((a,x)=>a+x.metrics[key],0)/Math.min(10,h.length));
 const cards=[["최근 점수",r.total],["평균 에임",avg("aim")],["평균 교전",avg("combat")],["평균 포지션",avg("position")]];
 $("summary").innerHTML=cards.map(([x,v],i)=>`<div class="stat"><small>${x}</small><strong>${v}</strong><span class="trend-up">${i===0&&h.length>1?(r.total-h[1].total>=0?"▲":"▼")+" 최근 경기":"/ 100"}</span></div>`).join("");
 const data=h.slice(0,10).reverse();const max=Math.max(...data.map(x=>x.total),100);
 $("trend").innerHTML=data.map((x,i)=>`<div class="barcol"><i style="height:${Math.max(12,x.total/max*125)}px" title="${x.total}"></i><small>${i+1}</small></div>`).join("");
 $("nextGoal").innerHTML=`<div class="goal"><b>${r.rank} · ${r.total}점</b><br><br>${r.focus}</div>`;
}

function renderHistory(){
 const h=state.history;
 if(!h.length){$("historyTable").innerHTML=`<div class="panel goal-empty">아직 기록이 없습니다.</div>`;return}
 $("historyTable").innerHTML=`<div class="history-row head"><span>게임 / 날짜</span><span>결과</span><span>K/D/A</span><span>등급</span><span>점수</span></div>`+
 h.map(r=>`<div class="history-row"><span><b>${r.game==="valorant"?"VALORANT":"OVERWATCH 2"}</b><br><small>${r.date}</small></span><span class="${r.result}">${r.result==="win"?"승리":"패배"}</span><span>${r.kills}/${r.deaths}/${r.assists}</span><span>${r.rank}</span><span class="score-big">${r.total}</span></div>`).join("");
}
function clearAll(){
 if(confirm("모든 경기 기록을 삭제할까요?")){
  state.history=[];localStorage.removeItem(KEY);renderHome();renderHistory();go("home");
 }
}
$("clearAll").addEventListener("click",clearAll);$("deleteHistory").addEventListener("click",clearAll);
renderHome();
