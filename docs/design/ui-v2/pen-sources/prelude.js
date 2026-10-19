const F="Inter";
const T=(p,c,o={})=>Insert(p,{type:"text",name:o.name||c.slice(0,28),content:c,fontFamily:F,fontSize:13,fill:"#18181b",...o});
const I=(p,ic,s=18,col="#71717a")=>Insert(p,{type:"icon",name:ic+" icon",library:"lucide",icon:ic,width:s,height:s,fill:col});
const Fr=(p,o)=>Insert(p,{type:"frame",name:"Frame",...o});
const Spacer=p=>Fr(p,{name:"Spacer",layout:"vertical",width:"fill_container",height:"fill_container"});
const Kbd=(p,k,dark)=>{const f=Fr(p,{name:"Kbd "+k,padding:[2,6],cornerRadius:4,fill:dark?"#ffffff1f":"#f4f4f5",stroke:dark?"#ffffff26":"#e4e4e7",strokeWidth:1});T(f,k,{fontSize:10.5,fontWeight:"500",fill:dark?"#e7ece8":"#71717a"});return f;};
const Avatar=(p,s=30,r=8)=>{const a=Fr(p,{name:"Avatar",width:s,height:s,cornerRadius:r,fill:"#3f6b52",justifyContent:"center",alignItems:"center"});T(a,"S",{fontSize:Math.round(s*0.42),fontWeight:"700",fill:"#ffffff"});return a;};
const Wrap=(x,title,desc,y=0,sh=800)=>{const w=Fr(document,{name:"Concept "+title,x,y,width:1344,layout:"vertical",gap:20,padding:32,fill:"#f1f1ef",cornerRadius:16});const h=Fr(w,{name:"Label",layout:"vertical",gap:6,width:"fill_container"});T(h,title,{fontSize:22,fontWeight:"700",letterSpacing:-0.4});T(h,desc,{fontSize:14,fill:"#52525b",textGrowth:"fixed-width",width:"fill_container",lineHeight:1.45});const s=Fr(w,{name:"Screen",width:1280,height:sh,clip:true,cornerRadius:12,fill:"#fafafa",stroke:"#e4e4e7",strokeWidth:1,effect:{type:"shadow",offset:{x:0,y:12},blur:32,color:"#18181b14"}});return [w,s];};
const Main=(p,o={})=>{
const m=Fr(p,{name:"Main",layout:"vertical",width:"fill_container",height:"fill_container",padding:[40,56],gap:22,fill:"#fafafa",...o});
const h=Fr(m,{name:"Header",layout:"vertical",gap:6,width:"fill_container"});
T(h,"YOUR ARCHIVE",{fontSize:10,fontWeight:"700",letterSpacing:1.4,fill:"#71717a"});
T(h,"Inbox",{fontSize:30,fontWeight:"700",letterSpacing:-0.8});
T(h,"The posts you chose to keep, ready when you need them.",{fontSize:14,fill:"#71717a"});
const tb=Fr(m,{name:"Toolbar",width:"fill_container",gap:10,alignItems:"center"});
const s=Fr(tb,{name:"Search",width:"fill_container",height:38,padding:[0,12],gap:8,alignItems:"center",cornerRadius:8,fill:"#ffffff",stroke:"#e4e4e7",strokeWidth:1});
I(s,"search",15,"#a1a1aa");T(s,"Search titles, notes, or creators",{fill:"#a1a1aa"});
for(const [ic,l] of [["list-filter","Add filter"],["arrow-down-wide-narrow","Newest"]]){const b=Fr(tb,{name:l,height:38,padding:[0,14],gap:7,alignItems:"center",cornerRadius:8,fill:"#ffffff",stroke:"#e4e4e7",strokeWidth:1});I(b,ic,15,"#52525b");T(b,l,{fontWeight:"500",fill:"#3f3f46"});}
const lh=Fr(m,{name:"List heading",width:"fill_container",gap:8,alignItems:"center"});
T(lh,"Captures",{fontSize:14,fontWeight:"600"});T(lh,"24",{fontSize:12,fill:"#a1a1aa"});
const list=Fr(m,{name:"List",layout:"vertical",width:"fill_container",cornerRadius:10,fill:"#ffffff",stroke:"#e4e4e7",strokeWidth:1,clip:true});
const rows=[["The 3 mistakes quietly ruining your deadlift","@coachmarta · Instagram reel · 2h ago","Strength Training","#e3ebe5"],["Pastel de nata: the bakery locals actually queue for","@lisbonfoodie · Instagram · 5h ago","Travel – Lisbon","#f1e6d6"],["One-pan miso salmon in 15 minutes","@weeknightkitchen · Facebook · Yesterday","Cooking","#f0e1e1"],["How I plan my whole week in 20 minutes","@calmproductive · Instagram reel · 2 days ago","Productivity","#e1e7f0"],["Zone 2 cardio, explained without the jargon","@drlenahart · Instagram reel · 3 days ago","Health","#e6e9df"]];
rows.forEach(([t,meta,topic,c],i)=>{const r=Fr(list,{name:"Row "+(i+1),width:"fill_container",padding:[14,18],gap:14,alignItems:"center",...(i<rows.length-1?{stroke:"#f0f0f1",strokeWidth:{bottom:1}}:{})});
Insert(r,{type:"rectangle",name:"Thumbnail",width:52,height:52,cornerRadius:6,fill:c});
const col=Fr(r,{name:"Text",layout:"vertical",gap:4,width:"fill_container"});T(col,t,{fontSize:14,fontWeight:"600"});T(col,meta,{fontSize:12,fill:"#71717a"});
const chip=Fr(r,{name:"Topic",padding:[4,10],cornerRadius:999,fill:"#f4f4f5"});T(chip,topic,{fontSize:12,fontWeight:"500",fill:"#52525b"});});
return m;};
