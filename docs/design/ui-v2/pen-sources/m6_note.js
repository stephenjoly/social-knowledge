const [w,scr]=Wrap(PX,"07 · Capture note","A saved post reads like a well-edited article: the bottom line first, then takeaways and actions. Attribution and the original link are always at the top, and the details rail handles filing, topics, and places.",PY,880);
wM6=w;
SB(scr,"app","Inbox");
const m=Content(scr,{gap:18,padding:[28,48]});
const tb=Fr(m,{name:"Top bar",width:"fill_container",gap:10,alignItems:"center"});const bk=Fr(tb,{name:"Back",gap:6,alignItems:"center",width:"fill_container"});I(bk,"arrow-left",15,C.mut);T(bk,"Inbox",{fontSize:13,fontWeight:"500",fill:C.mut2});Btn(tb,"Ask about this",{icon:"sparkles",ghost:1});Btn(tb,"Open original",{icon:"external-link"});
const body=Fr(m,{name:"Body",width:"fill_container",gap:36});
const art=Fr(body,{name:"Article",layout:"vertical",width:"fill_container",gap:18});
T(art,"Pastel de nata: the bakery locals actually queue for",{fontSize:27,fontWeight:"700",letterSpacing:-0.8,lineHeight:1.2,textGrowth:"fixed-width",width:"fill_container"});
const at=Fr(art,{name:"Attribution",gap:10,alignItems:"center"});Av(at,26,"#b7791f","L");T(at,"@lisbonfoodie",{fontSize:13,fontWeight:"600"});T(at,"Instagram reel · 0:48 · saved today at 09:12",{fontSize:13,fill:C.mut});
const md=Fr(art,{name:"Media",width:"fill_container",height:150,cornerRadius:10,fill:{type:"gradient",gradientType:"linear",rotation:135,colors:[{color:"#f1e6d6",position:0},{color:"#e7d3b8",position:1}]},justifyContent:"center",alignItems:"center"});const pl=Fr(md,{name:"Play",width:44,height:44,cornerRadius:999,fill:"#ffffffd9",justifyContent:"center",alignItems:"center"});I(pl,"play",18,C.ink);
const S=(t)=>T(art,t,{fontSize:15,fontWeight:"600",letterSpacing:-0.2});
S("Bottom line");P(art,"Manteigaria in Chiado makes the pastel de nata locals rate above the famous Belém version. Go before 10am, eat it warm at the counter, and add cinnamon, not sugar.");
S("Key takeaways");
for(const t of ["Fresh batches come out every 20 to 30 minutes; ask for one from the newest tray.","The Chiado shop is faster than the Time Out Market branch.","€1.30 each; a box of six travels well for about a day."]){const r=Fr(art,{name:"Takeaway",width:"fill_container",gap:10});Bullet(r);P(r,t,{fontSize:13.5});}
S("Actions & recommendations");
for(const t of ["Add Manteigaria (Rua do Loreto 2) to the Lisbon trip list.","Compare with Pastéis de Belém on the same day if you have time."]){const r=Fr(art,{name:"Action",width:"fill_container",gap:10,alignItems:"center"});const cb=Fr(r,{name:"Checkbox",width:16,height:16,cornerRadius:4,stroke:"#d4d4d8",strokeWidth:1.5});P(r,t,{fontSize:13.5});}
const more=Fr(art,{name:"More",width:"fill_container",gap:8});for(const l of ["Transcript","Source description","Comments · 12"]){const c=Fr(more,{name:l,height:32,padding:[0,12],gap:6,alignItems:"center",cornerRadius:7,fill:"#ffffff",stroke:C.bd,strokeWidth:1});T(c,l,{fontSize:12.5,fontWeight:"500",fill:C.mut2});I(c,"chevron-down",13,"#a1a1aa");}
const rail=Fr(body,{name:"Details rail",layout:"vertical",width:270,gap:14});
const dc=Card(rail,{width:"fill_container"});
const D=(l,v,o={})=>{const r=Fr(dc,{name:l,layout:"vertical",width:"fill_container",padding:[11,16],gap:5,...(o.last?{}:{stroke:"#f0f0f1",strokeWidth:{bottom:1}})});const lr=Fr(r,{name:"Label row",width:"fill_container",justifyContent:"space_between"});T(lr,l,{fontSize:11,fontWeight:"700",letterSpacing:0.8,fill:"#a1a1aa"});if(o.act)T(lr,o.act,{fontSize:12,fontWeight:"500",fill:C.g});if(v)T(r,v,{fontSize:13,fill:C.ink,fontWeight:"500"});return r;};
D("FILED IN","Travel / Lisbon",{act:"Move"});
const tp=D("TOPICS",null);const tc=Fr(tp,{name:"Chips",gap:6});Chip(tc,"Restaurants",{size:11.5});Chip(tc,"Pastry",{size:11.5});
D("LANGUAGE","Portuguese · translated to English");
const pl2=D("PLACES MENTIONED",null,{last:1});for(const [n,s] of [["Manteigaria","Chiado, Lisbon"],["Pastéis de Belém","Belém, Lisbon"]]){const r=Fr(pl2,{name:n,gap:8,alignItems:"center"});I(r,"map-pin",13,"#b7791f");T(r,n,{fontSize:13,fontWeight:"500"});T(r,s,{fontSize:12,fill:C.mut});}
const vc=Fr(rail,{name:"Verify",layout:"vertical",width:"fill_container",padding:[12,14],gap:6,cornerRadius:10,fill:"#fffbf3",stroke:"#f1e2c4",strokeWidth:1});const vh=Fr(vc,{name:"Head",gap:6,alignItems:"center"});I(vh,"triangle-alert",13,"#b7791f");T(vh,"1 claim to verify",{fontSize:12.5,fontWeight:"600"});T(vc,"“Open until midnight every day.” Opening hours may have changed.",{fontSize:12,fill:C.mut2,textGrowth:"fixed-width",width:"fill_container",lineHeight:1.45});
