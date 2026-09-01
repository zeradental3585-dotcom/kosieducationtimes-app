const fs=require('fs');
const gs=fs.readFileSync('../apps-script/Code.gs','utf8');
// extract statsFor_ and run it against a fake sheet
const body=gs.match(/function statsFor_\(testId, pct\)\{?[\s\S]*?\n\}/)[0];
let ROWS=[];
const sheet_=()=>({getDataRange:()=>({getValues:()=>ROWS})});
const MIN_SAMPLE=30;
eval(body);

function rows(list){ // list of [user,test,pct]
  return [['timestamp','user','test','score','total','pct','wrong','topics']]
    .concat(list.map(([u,t,p])=>[new Date(),u,t,0,0,p,'','']));
}
let f=0;
function check(label, got, want){
  const ok=JSON.stringify(got)===JSON.stringify(want);
  if(!ok) f++;
  console.log((ok?'PASS  ':'FAIL  ')+label+(ok?'':'\n        got '+JSON.stringify(got)+'\n        want '+JSON.stringify(want)));
}

// 1. one student, many attempts -> counted once, at their best
ROWS=rows([['A','t1',20],['A','t1',80],['A','t1',50]]);
let s=statsFor_('t1',50);
check('one student counted once, best attempt used', {n:s.n,enough:s.enough,best:s.best}, {n:1,enough:false,best:80});

// 2. small sample -> refuses a percentile but reports n
ROWS=rows(Array.from({length:12},(_,i)=>['u'+i,'t1',i*5]));
s=statsFor_('t1',30);
check('12 students -> enough=false, n reported', {n:s.n,enough:s.enough}, {n:12,enough:false});

// 3. 30 students -> switches on
ROWS=rows(Array.from({length:30},(_,i)=>['u'+i,'t1',i*3]));
s=statsFor_('t1',45);
check('30 students -> enough=true', s.enough, true);

// 4. mid-rank tie handling: 10 students all on 50, you scored 50
ROWS=rows(Array.from({length:40},(_,i)=>['u'+i,'t1',50]));
s=statsFor_('t1',50);
check('everyone tied -> 50% not 0%', s.better, 50);

// 5. top of the pile
ROWS=rows(Array.from({length:40},(_,i)=>['u'+i,'t1',i]));   // 0..39
s=statsFor_('t1',100);
check('score above all -> 100%', s.better, 100);

// 6. bottom
s=statsFor_('t1',-5);
check('score below all -> 0%', s.better, 0);

// 7. other tests ignored
ROWS=rows([['A','t1',10],['B','t2',90],['C','t2',95]]);
s=statsFor_('t1',10);
check('other tests excluded', s.n, 1);

// 8. mean / median
ROWS=rows([['a','t1',10],['b','t1',20],['c','t1',30],['d','t1',40]]);
s=statsFor_('t1',25);
check('mean and median', {mean:s.mean,median:s.median}, {mean:25,median:25});

// 9. empty
ROWS=rows([]); s=statsFor_('t1',50);
check('no attempts at all', {n:s.n,enough:s.enough}, {n:0,enough:false});

console.log('\n'+(f? f+' FAILING':'all passing'));
