(function(){
  // ---------- Storage (falls back to memory if the browser blocks it) ----------
  var mem = {};
  function load(k,d){ try{ var v=localStorage.getItem(k); return v?JSON.parse(v):d; }catch(e){ return mem[k]!==undefined?mem[k]:d; } }
  function save(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){ mem[k]=v; } }
  var $=function(id){return document.getElementById(id);};
  var BASE=8, MIN_DAYS=7;
  var days=load('dl_days',[]);        // {date,bed,wake,quality,hours,study,subjects,focus}
  var sessions=load('dl_focus',[]);

  // ---------- Helpers ----------
  function ds(d){ d=d||new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  function hm(m){ m=((Math.round(m)%1440)+1440)%1440; return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0'); }
  function fmt(h){ var t=Math.round(h*60); return Math.floor(t/60)+'h '+String(t%60).padStart(2,'0')+'m'; }
  function mins(t){ var p=t.split(':'); return +p[0]*60+ +p[1]; }
  function nice(t){ var m=mins(t),h=Math.floor(m/60),a=h>=12?'PM':'AM'; return ((h%12)||12)+':'+String(m%60).padStart(2,'0')+' '+a; }
  // wake earlier than bed (e.g. 23:30 -> 07:00) means the next morning: add 24h
  function duration(bed,wake){ var m=mins(wake)-mins(bed); if(m<=0)m+=1440; return m/60; }
  function find(date){ return days.filter(function(x){return x.date===date;})[0]; }
  function upsert(date,patch){ var e=find(date); if(!e){ e={date:date}; days.push(e); } for(var k in patch)e[k]=patch[k]; days.sort(function(a,b){return a.date<b.date?1:-1;}); save('dl_days',days); }
  function esc(s){ var d=document.createElement('div'); d.textContent=s; return d.innerHTML; }

  // ---------- Sample data: 21 days of student logs ----------
  if(!load('dl_seeded',false) && !days.length){
    var H=[6.5,7.5,5.5,8,7,6,8.5,5,7.5,8,6.5,9,5.5,7,8,6,7.5,8.5,5.5,7,8];
    var N=[0,.4,-.3,.2,-.4,.3,0,.5,-.5,.2,.3,-.2,.4,-.3,.1,-.4,.3,0,.4,-.2,.1];
    var S=['Algorithms','Physics','Calculus','Databases','Statistics','Networks','Algorithms'];
    for(var i=0;i<21;i++){
      var d=new Date(); d.setDate(d.getDate()-i);
      var wake=420+(i%3)*15, h=H[i], f=Math.max(1,Math.min(5,Math.round(1+(h-5)*.95+N[i]*2)));
      days.push({date:ds(d),bed:hm(wake-h*60),wake:hm(wake),quality:Math.max(1,Math.min(5,Math.round(h-3.5))),hours:h,study:2+((i*3)%7),subjects:S[i%7],focus:f});
    }
    [25,25,50].forEach(function(m){ sessions.push({date:ds(),minutes:m}); });
    days.sort(function(a,b){return a.date<b.date?1:-1;});
    save('dl_days',days); save('dl_focus',sessions); save('dl_seeded',true);
  }

  // ---------- Tabs ----------
  var TABS=['log','insights','extras','reportTab','timer'];
  TABS.forEach(function(n){ $('t-'+n).addEventListener('click',function(){
    TABS.forEach(function(x){ $('t-'+x).setAttribute('aria-selected',x===n); $(x).hidden=x!==n; });
    if(n==='insights') renderInsights();
    if(n==='extras') renderExtras();
    if(n==='reportTab') renderReport();
  }); });

  // ---------- Star rating ----------
  var quality=4;
  function drawStars(){
    var box=$('sStars'); box.innerHTML='';
    for(var i=1;i<=5;i++){ (function(i){
      var b=document.createElement('button'); b.type='button'; b.textContent='★';
      b.className=i<=quality?'on':''; b.setAttribute('role','radio'); b.setAttribute('aria-checked',i===quality); b.setAttribute('aria-label',i+' star'+(i>1?'s':''));
      b.addEventListener('click',function(){ quality=i; drawStars(); });
      box.appendChild(b);
    })(i); }
  }
  drawStars();
  $('sDate').value=ds(); $('dDate').value=ds();

  function toast(id,msg){ $(id).textContent=msg; setTimeout(function(){ $(id).textContent=''; },2500); }

  $('sleepForm').addEventListener('submit',function(e){
    e.preventDefault();
    upsert($('sDate').value,{bed:$('bed').value,wake:$('wake').value,quality:quality,hours:duration($('bed').value,$('wake').value)});
    toast('sToast','Saved: '+fmt(duration($('bed').value,$('wake').value))+' of sleep'); renderAll();
  });
  $('studyForm').addEventListener('submit',function(e){
    e.preventDefault();
    upsert($('dDate').value,{study:+$('hrs').value,subjects:$('subj').value.trim(),focus:+$('focus').value});
    toast('dToast','Study day saved'); renderAll();
  });

  // ---------- Statistics: Pearson r + OLS regression ----------
  function pairs(){ return days.filter(function(x){return x.hours!=null && x.focus!=null;}); }
  function regress(p){
    var n=p.length; if(n<2) return null;
    var mx=0,my=0; p.forEach(function(q){mx+=q.hours;my+=q.focus;}); mx/=n; my/=n;
    var sxy=0,sxx=0,syy=0; p.forEach(function(q){ var a=q.hours-mx,b=q.focus-my; sxy+=a*b; sxx+=a*a; syy+=b*b; });
    if(!sxx||!syy) return null;
    var slope=sxy/sxx;
    return {r:sxy/Math.sqrt(sxx*syy),slope:slope,b:my-slope*mx};
  }
  function strength(r){ var a=Math.abs(r), s=a>=.7?'Strong':a>=.4?'Moderate':'Weak'; return s+(r>=0?' positive':' negative')+' correlation'; }

  // ---------- Render: log tab ----------
  function renderLog(){
    var last=days.filter(function(x){return x.hours!=null;})[0], C=553;
    if(last){ $('ringVal').textContent=fmt(last.hours); $('ringLbl').textContent='of '+BASE+'h goal · '+last.quality+'/5 stars'; $('ringFill').style.strokeDashoffset=C-C*Math.min(last.hours/BASE,1); }
    var ul=$('history'); ul.innerHTML='';
    if(!days.length){ ul.innerHTML='<p class="empty">Nothing yet. Save your first night above.</p>'; return; }
    days.slice(0,7).forEach(function(en){
      var li=document.createElement('li');
      var when=new Date(en.date+'T00:00:00').toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'});
      var sl=en.hours!=null?fmt(en.hours)+' sleep':'no sleep logged';
      var st=en.focus!=null?en.study+'h '+esc(en.subjects||'study')+' · focus '+en.focus+'/5':'no study logged';
      li.innerHTML='<div><strong>'+when+'</strong><small>'+sl+' · '+st+'</small></div><button aria-label="Delete '+when+'">Delete</button>';
      li.querySelector('button').addEventListener('click',function(){ days=days.filter(function(x){return x.date!==en.date;}); save('dl_days',days); renderAll(); });
      ul.appendChild(li);
    });
  }

  // ---------- Render: insights tab ----------
  var chart=null;
  function renderInsights(){
    var p=pairs(), g=regress(p);
    $('nVal').textContent=p.length;
    if(g){ $('rVal').textContent=(g.r>=0?'+':'')+g.r.toFixed(2); $('rLbl').textContent=strength(g.r); } else { $('rVal').textContent='–'; $('rLbl').textContent='Not enough data'; }
    $('conf').innerHTML=p.length<MIN_DAYS?'<span class="badge warn">Needs at least '+MIN_DAYS+' days of logs for statistical confidence</span>':'<span class="badge">'+p.length+' days: enough for a reliable read</span>';

    // scatter + trendline
    if(window.Chart){
      var latest=p.slice().sort(function(a,b){return a.date<b.date?1:-1;})[0];
      var pts=p.map(function(q){return {x:q.hours,y:q.focus};});
      var colors=p.map(function(q){return q===latest?'#f2b866':'#a3b0ff';});
      var radii=p.map(function(q){return q===latest?9:5;});
      var line=g?[{x:4.5,y:g.slope*4.5+g.b},{x:9.5,y:g.slope*9.5+g.b}]:[];
      var data={datasets:[
        {type:'scatter',label:'Days',data:pts,backgroundColor:colors,pointRadius:radii},
        {type:'line',label:'Trend',data:line,borderColor:'#7fd6b0',borderWidth:2,pointRadius:0,borderDash:[6,4]}
      ]};
      if(chart){ chart.data=data; chart.update(); }
      else chart=new Chart($('scatter'),{data:data,options:{maintainAspectRatio:false,animation:false,plugins:{legend:{display:false}},
        scales:{x:{min:4.5,max:9.5,title:{display:true,text:'Hours slept',color:'#93a4bf'},ticks:{color:'#93a4bf'},grid:{color:'#27385a'}},
                y:{min:0.5,max:5.5,title:{display:true,text:'Focus rating (1–5)',color:'#93a4bf'},ticks:{color:'#93a4bf',stepSize:1},grid:{color:'#27385a'}}}}});
    }

    // sleep debt: last 7 days vs 8h baseline
    var cut=new Date(); cut.setDate(cut.getDate()-6); var cutS=ds(cut);
    var wk=days.filter(function(x){return x.hours!=null && x.date>=cutS;});
    var debt=wk.reduce(function(a,x){return a+(BASE-x.hours);},0); debt=Math.max(0,debt);
    $('debtVal').textContent=fmt(debt); $('debtN').textContent=wk.length;
    $('debtBar').style.width=Math.min(debt/10*100,100)+'%';
    $('debtBar').style.background=debt>5?'#f08a7e':debt>2?'#f2b866':'#7fd6b0';
    $('debtNote').textContent=!wk.length?'Log a night this week to see your debt.':debt===0?'No sleep debt this week. Keep it up.':'Sleeping 8 hours tonight brings this down to '+fmt(Math.max(0,debt-(BASE-8)))+'. Each extra 30 minutes nightly clears it in about '+Math.ceil(debt/(0.5*7))+' week'+(debt>3.5?'s':'')+'.';

    // weekly insights
    var tips=[], hi=p.filter(function(x){return x.hours>=7.5;}), lo=p.filter(function(x){return x.hours<7.5;});
    function avg(a,k){ return a.reduce(function(s,x){return s+x[k];},0)/a.length; }
    if(hi.length&&lo.length){
      var pct=Math.round((avg(hi,'focus')/avg(lo,'focus')-1)*100);
      tips.push('Days after 7.5+ hours of sleep scored '+Math.abs(pct)+'% '+(pct>=0?'higher':'lower')+' study focus ('+avg(hi,'focus').toFixed(1)+' vs '+avg(lo,'focus').toFixed(1)+').');
      tips.push('On short-sleep nights (under 7.5h) you studied '+avg(lo,'study').toFixed(1)+'h a day at focus '+avg(lo,'focus').toFixed(1)+'/5. Rested days: '+avg(hi,'study').toFixed(1)+'h at '+avg(hi,'focus').toFixed(1)+'/5.');
    }
    if(g&&p.length>=MIN_DAYS) tips.push('Your trendline predicts a focus rating of '+Math.max(1,Math.min(5,g.slope*8+g.b)).toFixed(1)+'/5 after 8 hours of sleep, versus '+Math.max(1,Math.min(5,g.slope*6+g.b)).toFixed(1)+'/5 after 6 hours.');
    if(debt>3) tips.push('Your sleep debt is '+fmt(debt)+'. Before the next deadline, plan an earlier bedtime rather than a later study session.');
    if(!tips.length) tips.push('Log sleep and study focus for a few days to unlock personalized insights.');
    $('tips').innerHTML=tips.map(function(t){return '<li>'+esc(t)+'</li>';}).join('');

    renderBedtimes();
  }

  // ---------- Optimal bedtime (90-minute cycles) ----------
  function renderBedtimes(){
    var w=mins($('wakeAt').value||'07:00'), out='';
    [[6,'9h 15m'],[5,'7h 45m'],[4,'6h 15m']].forEach(function(c){
      out+='<div class="bed"><strong>'+nice(hm(w-(c[0]*90+15)))+'</strong><span class="lbl">'+c[0]+' cycles · '+(c[0]*1.5)+'h sleep'+(c[0]===5?' · best fit':'')+'</span></div>';
    });
    $('bedtimes').innerHTML=out;
  }
  $('wakeAt').addEventListener('input',renderBedtimes);

  // ---------- Caffeine tracker (half-life about 5 hours) ----------
  var caf=load('dl_caf',[]), cafChart=null;
  (function(){ var n=new Date(); $('cafTime').value=hm(n.getHours()*60+n.getMinutes()); var w=new Date(); w.setDate(w.getDate()+7); $('exDate').value=ds(w); })();
  $('cafForm').addEventListener('submit',function(e){
    e.preventDefault(); var p=$('cafType').value.split('|');
    caf.push({date:ds(),min:mins($('cafTime').value),mg:+p[0],name:p[1]}); save('dl_caf',caf); renderCaf();
  });
  function renderCaf(){
    var today=caf.filter(function(c){return c.date===ds();}).sort(function(a,b){return a.min-b.min;});
    var lb=days.filter(function(x){return x.bed;})[0], bm=lb?mins(lb.bed):1380; if(bm<360) bm+=1440;
    function at(m){ return today.reduce(function(s,c){ return m>=c.min?s+c.mg*Math.pow(.5,(m-c.min)/300):s; },0); }
    var pts=[],peak=0;
    for(var m=360;m<=1800;m+=30){ var v=at(m); peak=Math.max(peak,v); pts.push({x:m/60,y:Math.round(v)}); }
    var atBed=Math.round(at(bm));
    if(window.Chart){
      var data={datasets:[
        {label:'Caffeine in body (mg)',data:pts,borderColor:'#f2b866',backgroundColor:'rgba(242,184,102,.15)',fill:true,pointRadius:0,tension:.3},
        {label:'Bedtime',data:[{x:bm/60,y:0},{x:bm/60,y:Math.max(peak,100)}],borderColor:'#a3b0ff',borderDash:[6,4],pointRadius:0}
      ]};
      var opts={maintainAspectRatio:false,animation:false,plugins:{legend:{labels:{color:'#93a4bf'}}},scales:{
        x:{type:'linear',min:6,max:30,ticks:{color:'#93a4bf',stepSize:3,callback:function(v){return hm(v*60).slice(0,2)+':00';}},grid:{color:'#27385a'}},
        y:{min:0,title:{display:true,text:'mg',color:'#93a4bf'},ticks:{color:'#93a4bf'},grid:{color:'#27385a'}}}};
      if(cafChart){ cafChart.data=data; cafChart.update(); } else cafChart=new Chart($('cafChart'),{type:'line',data:data,options:opts});
    }
    $('cafNote').textContent=today.length?'At your usual bedtime ('+nice(hm(bm))+') about '+atBed+' mg is still active, roughly '+(atBed/95).toFixed(1)+' cups of coffee. Caffeine takes about 5 hours to halve, so a late drink is still working when you go to bed.':'Add a drink to see how much caffeine is still in your body at bedtime.';
    var ul=$('cafList'); ul.innerHTML='';
    today.forEach(function(c){
      var li=document.createElement('li');
      li.innerHTML='<div><strong>'+esc(c.name)+'</strong><small>'+nice(hm(c.min))+' · '+c.mg+' mg</small></div><button aria-label="Delete drink">Delete</button>';
      li.querySelector('button').addEventListener('click',function(){ caf.splice(caf.indexOf(c),1); save('dl_caf',caf); renderCaf(); });
      ul.appendChild(li);
    });
  }

  // ---------- Exam week sleep preserver ----------
  $('examForm').addEventListener('submit',function(e){ e.preventDefault(); buildExam(); });
  function buildExam(){
    var out=$('examOut'), ex=new Date($('exDate').value+'T00:00:00'), now=new Date(); now.setHours(0,0,0,0);
    var n=Math.round((ex-now)/86400000), total=+$('exHrs').value, wake=mins($('exWake').value||'07:00');
    if(!(n>=1)){ out.innerHTML='<p class="empty" style="margin-top:12px">Pick an exam date at least one day away.</p>'; return; }
    var per=Math.min(8,Math.ceil(total/n*2)/2), left=total, bed=hm(wake-450), rows='';
    for(var i=0;i<n;i++){
      var h=Math.min(per,left); left-=h;
      var d=new Date(now); d.setDate(d.getDate()+i);
      rows+='<div class="bed"><div><strong>'+d.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'})+'</strong><div class="lbl">Wake '+nice(hm(wake))+' · lights out '+nice(bed)+'</div></div><span>'+h.toFixed(1)+'h study</span></div>';
    }
    var note=left>0.01?'<p class="lbl" style="margin:10px 0;color:#f2b866">This plan is '+left.toFixed(1)+' hours short of your goal. Add days or trim topics instead of cutting sleep.</p>':'<p class="lbl" style="margin:10px 0">All '+total+' hours fit without touching your sleep.</p>';
    out.innerHTML='<p class="lbl" style="margin:14px 0 4px">Study is capped at 8 hours a day. Each night has a 7.5-hour window in bed, which guarantees at least 7 hours of sleep.</p>'+note+rows;
  }

  // ---------- Student wellness report ----------
  var exams=load('dl_exams',[]), prof=load('dl_prof',{name:'',course:''});
  $('stName').value=prof.name; $('stCourse').value=prof.course; $('erDate').value=ds();

  $('repForm').addEventListener('submit',function(e){
    e.preventDefault();
    prof={name:$('stName').value.trim(),course:$('stCourse').value.trim()};
    save('dl_prof',prof); renderReport();
  });

  $('examResForm').addEventListener('submit',function(e){
    e.preventDefault();
    exams.push({name:$('erName').value.trim(),date:$('erDate').value,score:+$('erScore').value});
    exams.sort(function(a,b){return a.date<b.date?1:-1;}); save('dl_exams',exams);
    $('erName').value=''; $('erScore').value=''; renderReport();
  });

  $('reportBody').addEventListener('click',function(e){
    var b=e.target.closest('button[data-i]'); if(!b) return;
    exams.splice(+b.dataset.i,1); save('dl_exams',exams); renderReport();
  });

  function renderReport(){
    var p=pairs(), g=regress(p), s=days.filter(function(x){return x.hours!=null;});
    function avg(a,k){ return a.length?a.reduce(function(t,x){return t+x[k];},0)/a.length:0; }
    var cut=new Date(); cut.setDate(cut.getDate()-6); var cs=ds(cut);
    var wk=s.filter(function(x){return x.date>=cs;});
    var debt=Math.max(0,wk.reduce(function(t,x){return t+(BASE-x.hours);},0));
    var good=s.filter(function(x){return x.hours>=7.5;}).length;
    var hi=p.filter(function(x){return x.hours>=7.5;}), lo=p.filter(function(x){return x.hours<7.5;});
    var cmp=(hi.length&&lo.length)
      ?'Days after 7.5+ hours of sleep averaged focus '+avg(hi,'focus').toFixed(1)+'/5, compared with '+avg(lo,'focus').toFixed(1)+'/5 after shorter nights.'
      :'Not enough data to compare long and short nights yet.';

    $('reportBody').innerHTML=
      (prof.name||prof.course?'<p><strong>'+esc(prof.name||'Student')+'</strong>'+(prof.course?' · '+esc(prof.course):'')+'</p>':'')+
      '<p class="lbl" style="margin-bottom:12px">Prepared '+new Date().toLocaleDateString()+' · '+s.length+' nights and '+p.length+' study days logged</p>'+
      '<div class="grid2">'+
        '<div class="metric"><span class="lbl">Average sleep</span><b>'+(s.length?fmt(avg(s,'hours')):'–')+'</b></div>'+
        '<div class="metric"><span class="lbl">Average study</span><b>'+(p.length?avg(p,'study').toFixed(1)+'h':'–')+'</b></div>'+
        '<div class="metric"><span class="lbl">Average focus</span><b>'+(p.length?avg(p,'focus').toFixed(1)+'/5':'–')+'</b></div>'+
        '<div class="metric"><span class="lbl">Correlation (r)</span><b>'+(g?(g.r>=0?'+':'')+g.r.toFixed(2):'–')+'</b></div>'+
      '</div>'+
      '<p style="margin-top:14px"><strong>Finding:</strong> '+(g?strength(g.r)+' between sleep hours and study focus. ':'')+cmp+'</p>'+
      '<p style="margin-top:8px"><strong>Sleep health:</strong> '+good+' of '+s.length+' nights reached 7.5 hours. Weekly sleep debt against an 8-hour baseline: '+fmt(debt)+'.</p>'+
      examHtml()+tableHtml();
  }

  // Exam performance vs the 3 nights of sleep up to each exam morning
  function examHtml(){
    var head='<h3 style="margin:16px 0 6px;font:500 1rem var(--serif)">Sleep and exam performance</h3>';
    if(!exams.length) return head+'<p class="lbl">No exam results added yet. Add one above to compare sleep with exam performance.</p>';
    var pairsX=[];
    var rows=exams.map(function(x,i){
      var d=new Date(x.date+'T00:00:00');
      var pre=days.filter(function(q){
        if(q.hours==null) return false;
        var diff=Math.round((d-new Date(q.date+'T00:00:00'))/86400000);
        return diff>=0&&diff<=2;
      });
      var a=pre.length?pre.reduce(function(s,q){return s+q.hours;},0)/pre.length:null;
      if(a!=null) pairsX.push({hours:a,focus:x.score});
      return '<div class="bed"><div><strong>'+esc(x.name)+'</strong><div class="lbl">'+d.toLocaleDateString(undefined,{month:'short',day:'numeric'})+' · '+
        (a==null?'no sleep logged before this exam':'avg '+fmt(a)+' sleep over the 3 nights before')+'</div></div>'+
        '<span>'+x.score+'% <button class="noprint" data-i="'+i+'" style="background:none;border:0;color:#93a4bf;cursor:pointer;margin-left:6px">Delete</button></span></div>';
    }).join('');
    var g=pairsX.length>=3?regress(pairsX):null;
    var note=g
      ?'<p style="margin-top:10px"><strong>Result:</strong> across '+pairsX.length+' exams, sleep before the exam and score have a correlation of '+(g.r>=0?'+':'')+g.r.toFixed(2)+' ('+strength(g.r).toLowerCase()+').</p>'
      :'<p class="lbl" style="margin-top:10px">Add at least 3 exams with sleep logged to see a correlation.</p>';
    return head+rows+note;
  }

  function tableHtml(){
    var rows=days.slice(0,14).map(function(x){
      return '<tr><td>'+x.date.slice(5)+'</td><td>'+(x.hours!=null?x.hours.toFixed(1)+'h':'–')+'</td><td>'+(x.study!=null?x.study+'h':'–')+'</td><td>'+(x.focus!=null?x.focus+'/5':'–')+'</td></tr>';
    }).join('');
    return '<h3 style="margin:16px 0 6px;font:500 1rem var(--serif)">Last 14 days</h3><table class="rt"><thead><tr><th>Date</th><th>Sleep</th><th>Study</th><th>Focus</th></tr></thead><tbody>'+rows+'</tbody></table>';
  }

  $('printBtn').addEventListener('click',function(){ try{ window.print(); }catch(e){} });

  // ---------- Render everything ----------
  function renderExtras(){ renderCaf(); buildExam(); }
  function renderAll(){
    renderLog();
    if(!$('insights').hidden) renderInsights();
    if(!$('extras').hidden) renderExtras();
    if(!$('reportTab').hidden) renderReport();
  }

  // ---------- Focus timer ----------
  var total=1500,left=total,tick=null;
  function draw(){ var m=Math.floor(left/60),s=left%60; $('time').textContent=String(m).padStart(2,'0')+':'+String(s).padStart(2,'0'); $('meter').style.width=((total-left)/total*100)+'%'; document.title=tick?$('time').textContent+' · DreamLog':'DreamLog — Sleep & Focus'; }
  function stats(){ var t=ds(),a=sessions.filter(function(s){return s.date===t;}); $('sessToday').textContent=a.length; $('minToday').textContent=a.reduce(function(x,s){return x+s.minutes;},0); }
  function stop(){ clearInterval(tick); tick=null; $('start').textContent='Start'; }
  $('start').addEventListener('click',function(){
    if(tick){ stop(); draw(); return; }
    if(left<=0) left=total;
    $('start').textContent='Pause';
    tick=setInterval(function(){
      left--;
      if(left<=0){ left=0; stop(); sessions.push({date:ds(),minutes:Math.round(total/60)}); save('dl_focus',sessions); stats(); $('start').textContent='Start again'; }
      draw();
    },1000);
  });
  $('reset').addEventListener('click',function(){ stop(); left=total; draw(); });
  $('presets').addEventListener('click',function(e){
    var b=e.target.closest('button'); if(!b) return;
    Array.prototype.forEach.call($('presets').children,function(x){ x.setAttribute('aria-pressed',x===b); });
    stop(); total=+b.dataset.m*60; left=total; draw();
  });

  // ---------- Start ----------
  renderAll(); stats(); draw();
})();