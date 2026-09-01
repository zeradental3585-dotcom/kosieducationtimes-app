const {JSDOM}=require('jsdom'), fs=require('fs');
const REPO='..';
const quizSrc=fs.readFileSync(REPO+'/js/quiz.js','utf8');

const QUESTIONS=Array.from({length:25},(_,i)=>({topic:'गणित',q:'Q'+i,options:['a','b','c','d'],answer:i%4,explain:'e'}));

function boot(store){
  const dom=new JSDOM(`<body>
    <div id="authbar"><div id="whoami"></div><div id="gsi"></div><div id="keybox"></div></div>
    <div id="intro"><button id="startBtn">start</button></div>
    <div id="quizWrap" class="hidden"><p class="timerbar"><span id="timer">20:00</span></p><form id="quizForm"></form><button id="submitBtn">submit</button></div>
    <div id="resultWrap" class="hidden"></div><div id="historyWrap"></div>
  </body>`,{url:'https://www.kosieducationtimes.com/mock/x.html'});
  const w=dom.window;
  w.KET={getKey:()=>'KET-AAAA-BBBB',ensureKey:()=>'KET-AAAA-BBBB',profile:()=>null,enabled:()=>true,
         ENDPOINT:'',setKey(){},isValidCode:()=>true,mountSignIn(){return true;},signOut(){},inAppBrowser:()=>false};
  Object.defineProperty(w,'localStorage',{value:{
    getItem:k=>(k in store?store[k]:null), setItem:(k,v)=>{store[k]=String(v);}, removeItem:k=>{delete store[k];}
  },configurable:true});
  w.fetch=()=>Promise.reject(new Error('offline'));
  w.Element.prototype.scrollIntoView=function(){};
  // controllable clock so we can fast-forward the timer deterministically
  let cbs=[];
  w.__advance=(secs)=>{ for(let i=0;i<secs;i++) cbs.forEach(f=>f()); };
  const realSI=w.setInterval;
  w.setInterval=(f,ms)=>{ if(ms===1000){ cbs.push(f); return 999; } return realSI(f,ms); };
  w.clearInterval=(id)=>{ if(id===999) cbs=[]; };
  w.KET_TEST={id:'t1',duration:1200,marks:2,negative:0.25,questions:QUESTIONS};
  w.window=w;
  const run=new w.Function('window','document','localStorage','KET','KET_TEST','fetch','setInterval','clearInterval','setTimeout','clearTimeout',quizSrc);
  run.call(w, w, w.document, w.localStorage, w.KET, w.KET_TEST, w.fetch, w.setInterval.bind(w), w.clearInterval.bind(w), w.setTimeout.bind(w), w.clearTimeout.bind(w));
  return {dom,w,doc:dom.window.document};
}

let store={};
// --- 1. take a test partway, then "close the page"
let {w,doc}=boot(store);
doc.getElementById('startBtn').click();
[0,1,2,3,4].forEach(i=>{
  const el=doc.querySelector(`input[name="q${i}"][value="${QUESTIONS[i].answer}"]`);
  el.checked=true; el.dispatchEvent(new w.Event('change',{bubbles:true}));
});
// simulate 5 minutes elapsed by advancing the interval clock
w.__advance(300);
doc.getElementById('quizForm').dispatchEvent(new w.Event('change',{bubbles:true}));
const saved=JSON.parse(store['ket_progress_t1']||'{}');
console.log('1. progress saved            ->', Object.keys(saved.answers||{}).length===5 && saved.remaining===900 ? 'PASS 5 answers, 900s left' : 'FAIL '+JSON.stringify(saved).slice(0,120));

// --- 2. reload: is a resume offer shown?
let b2=boot(store);
const offer=b2.doc.querySelector('#resumeBtn');
console.log('2. resume offered on reload  ->', offer? 'PASS ('+b2.doc.querySelector('#intro .callout').textContent.replace(/\s+/g,' ').trim().slice(0,58)+'…)' : 'FAIL none');

// --- 3. resuming restores answers AND the clock
offer.click();
const restored=[0,1,2,3,4].every(i=>b2.doc.querySelector(`input[name="q${i}"][value="${QUESTIONS[i].answer}"]`).checked);
const clock=b2.doc.getElementById('timer').textContent;
console.log('3. resume restores state     ->', restored && clock==='15:00' ? 'PASS answers + clock at 15:00' : `FAIL restored=${restored} clock=${clock}`);

// --- 4. finishing clears it, so it is not offered again
b2.doc.getElementById('submitBtn').click();
const guard=b2.doc.getElementById('blankWarn');
console.log('4a. blanks warned before submit ->', guard ? 'PASS ('+guard.textContent.replace(/\s+/g,' ').trim().slice(0,46)+'…)' : 'FAIL no guard');
b2.doc.getElementById('submitAnyway').click();
console.log('4b. cleared after real submit   ->', !store['ket_progress_t1'] ? 'PASS' : 'FAIL still stored');
let b4=boot(store);
console.log('   not offered again         ->', !b4.doc.querySelector('#resumeBtn') ? 'PASS' : 'FAIL');

// --- 5. "start fresh" discards it
store={}; let b5=boot(store); b5.doc.getElementById('startBtn').click();
const el=b5.doc.querySelector('input[name="q0"][value="1"]'); el.checked=true;
el.dispatchEvent(new b5.w.Event('change',{bubbles:true}));
let b6=boot(store); b6.doc.querySelector('#freshBtn').click();
const after=JSON.parse(store['ket_progress_t1']||'{}');
const freshEmpty=Object.keys(after.answers||{}).length===0;
const radioClear=!b6.doc.querySelector('input[name="q0"][value="1"]').checked;
console.log('5. start fresh discards old  ->', freshEmpty && radioClear ? 'PASS (new attempt, 0 answers carried over)' : `FAIL answers=${JSON.stringify(after.answers)} radio=${!radioClear}`);

// --- 6. stale progress (>24h) is ignored
store={'ket_progress_t1':JSON.stringify({at:Date.now()-25*3600*1000,remaining:900,answers:{0:1},n:25})};
console.log('6. >24h old ignored          ->', !boot(store).doc.querySelector('#resumeBtn') ? 'PASS' : 'FAIL');

// --- 7. expired clock is ignored
store={'ket_progress_t1':JSON.stringify({at:Date.now(),remaining:0,answers:{0:1},n:25})};
console.log('7. no time left ignored      ->', !boot(store).doc.querySelector('#resumeBtn') ? 'PASS' : 'FAIL');

// --- 8. bank changed since (different length) is ignored
store={'ket_progress_t1':JSON.stringify({at:Date.now(),remaining:900,answers:{0:1},n:30})};
console.log('8. question bank changed     ->', !boot(store).doc.querySelector('#resumeBtn') ? 'PASS' : 'FAIL');
