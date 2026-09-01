const {JSDOM}=require('jsdom'), fs=require('fs');
const REPO='..';
const quizSrc=fs.readFileSync(REPO+'/js/quiz.js','utf8');
function boot(n, negative){
  const Q=Array.from({length:n},(_,i)=>({topic:'गणित',q:'Q'+i,options:['a','b','c','d'],answer:i%4,explain:'e'}));
  const dom=new JSDOM(`<body>
    <div id="authbar"><div id="whoami"></div><div id="gsi"></div><div id="keybox"></div></div>
    <div id="intro"><button id="startBtn">s</button></div>
    <div id="quizWrap" class="hidden"><p class="timerbar"><span id="timer">0</span> <span id="answered"></span></p>
      <div id="palette"></div><form id="quizForm"></form><p><button id="submitBtn">go</button></p></div>
    <div id="resultWrap" class="hidden"></div><div id="historyWrap"></div></body>`,
    {url:'https://www.kosieducationtimes.com/mock/x.html',runScripts:'outside-only'});
  const w=dom.window; w.window=w;
  w.Element.prototype.scrollIntoView=function(){};
  w.KET={getKey:()=>'KET-AAAA-BBBB',ensureKey:()=>'KET-AAAA-BBBB',profile:()=>null,enabled:()=>true,
         ENDPOINT:'',setKey(){},isValidCode:()=>true,mountSignIn(){return true;},signOut(){},inAppBrowser:()=>false};
  Object.defineProperty(w,'localStorage',{value:{getItem:()=>null,setItem(){},removeItem(){}},configurable:true});
  w.fetch=()=>Promise.reject(new Error('x'));
  w.KET_TEST={id:'t'+n,duration:600,marks:1,negative:negative,questions:Q};
  const run=new w.Function('window','document','localStorage','KET','KET_TEST','fetch','setInterval','clearInterval','setTimeout','clearTimeout',quizSrc);
  run.call(w,w,w.document,w.localStorage,w.KET,w.KET_TEST,w.fetch,w.setInterval.bind(w),w.clearInterval.bind(w),w.setTimeout.bind(w),w.clearTimeout.bind(w));
  return {w,doc:dom.window.document,Q};
}
let a=boot(25,0); a.doc.getElementById('startBtn').click();
console.log('palette hidden at 25 q      ->', a.doc.querySelectorAll('#palette .pcell').length===0?'PASS':'FAIL');
let b=boot(100,0); b.doc.getElementById('startBtn').click();
console.log('palette drawn at 100 q      ->', b.doc.querySelectorAll('#palette .pcell').length===100?'PASS':'FAIL '+b.doc.querySelectorAll('#palette .pcell').length);
console.log('counter starts at 0 / 100   ->', b.doc.getElementById('answered').textContent==='0 / 100'?'PASS':'FAIL '+b.doc.getElementById('answered').textContent);
const el=b.doc.querySelector('input[name="q3"][value="1"]'); el.checked=true; el.dispatchEvent(new b.w.Event('change',{bubbles:true}));
console.log('counter updates on answer   ->', b.doc.getElementById('answered').textContent==='1 / 100'?'PASS':'FAIL '+b.doc.getElementById('answered').textContent);
console.log('answered cell marked done   ->', b.doc.querySelectorAll('#palette .pcell')[3].className==='pcell done'?'PASS':'FAIL');
b.doc.getElementById('submitBtn').click();
const g=b.doc.getElementById('blankWarn');
console.log('guard fires with blanks     ->', g?'PASS':'FAIL');
console.log('guard wording (no negative) ->', g && /नेगेटिव मार्किंग नहीं है/.test(g.textContent)?'PASS':'FAIL');
b.doc.getElementById('submitAnyway').click();
console.log('submit anyway grades        ->', !b.doc.getElementById('resultWrap').classList.contains('hidden')?'PASS':'FAIL');
let c=boot(100,0.25); c.doc.getElementById('startBtn').click(); c.doc.getElementById('submitBtn').click();
const g2=c.doc.getElementById('blankWarn');
console.log('guard wording (negative)    ->', g2 && /छोड़ना ठीक है/.test(g2.textContent)?'PASS':'FAIL');
let d=boot(100,0); d.doc.getElementById('startBtn').click();
d.Q.forEach((q,i)=>{const e=d.doc.querySelector(`input[name="q${i}"][value="0"]`); e.checked=true;});
d.doc.getElementById('quizForm').dispatchEvent(new d.w.Event('change',{bubbles:true}));
d.doc.getElementById('submitBtn').click();
console.log('no guard when none blank    ->', !d.doc.getElementById('blankWarn') && !d.doc.getElementById('resultWrap').classList.contains('hidden')?'PASS':'FAIL');

setTimeout(()=>process.exit(0), 100);
