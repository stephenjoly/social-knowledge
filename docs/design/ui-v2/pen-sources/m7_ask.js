const [w,scr]=Wrap(PX,"08 · Ask","Ask starts as one inviting question box with suggestions drawn from your own archive, and your recent conversations just below. Answers can cover everything or one category.",PY,880);
wM7=w;
SB(scr,"app","Ask");
const m=Content(scr,{justifyContent:"center",alignItems:"center",gap:22,padding:[40,80]});
IconBox(m,"sparkles","#e8f0ea",C.g,44);
const ht=Fr(m,{name:"Heading",layout:"vertical",gap:6,alignItems:"center"});T(ht,"Ask what you've saved",{fontSize:28,fontWeight:"700",letterSpacing:-0.8});T(ht,"Answers come only from your saved posts, with sources you can open.",{fontSize:14,fill:C.mut});
const cp=Fr(m,{name:"Composer",layout:"vertical",width:640,padding:[14,14,10,16],gap:14,cornerRadius:14,fill:"#ffffff",stroke:C.bd,strokeWidth:1,effect:{type:"shadow",offset:{x:0,y:8},blur:24,color:"#18181b0d"}});
T(cp,"Ask anything about your archive…",{fontSize:15,fill:"#a1a1aa"});
const cb=Fr(cp,{name:"Composer bar",width:"fill_container",gap:8,alignItems:"center"});Chip(cb,"Whole archive",{icon:"library-big",stroke:1,fill:"#ffffff"});Chip(cb,"Thinking: Medium",{icon:"brain",stroke:1,fill:"#ffffff"});Fr(cb,{name:"Flex",width:"fill_container",height:1});const sd=Fr(cb,{name:"Send",width:32,height:32,cornerRadius:8,fill:C.acc,justifyContent:"center",alignItems:"center"});I(sd,"arrow-up",16,"#ffffff");
const sg=Fr(m,{name:"Suggestions",layout:"vertical",width:640,gap:8});
for(const pair of [["Summarise my saved Portugal recommendations","What did I save about deadlift form?"],["Plan three weeknight dinners from my recipes","Which productivity tips came up more than once?"]]){const r=Fr(sg,{name:"Suggestion row",width:"fill_container",gap:8});for(const s of pair){const c=Fr(r,{name:s,width:"fill_container",padding:[10,12],gap:8,alignItems:"center",cornerRadius:10,fill:"#ffffff",stroke:C.bd,strokeWidth:1});I(c,"corner-down-right",13,"#a1a1aa");T(c,s,{fontSize:12.5,fill:C.mut2,textGrowth:"fixed-width",width:"fill_container"});}}
const rc=Fr(m,{name:"Recent",layout:"vertical",width:640,gap:4,padding:[10,0,0,0]});T(rc,"RECENT CONVERSATIONS",{fontSize:10.5,fontWeight:"700",letterSpacing:1,fill:"#a1a1aa"});
for(const [t,tm] of [["Lisbon food recommendations","Today"],["Zone 2 vs. HIIT, from my saves","Tuesday"],["Gift ideas from cooking reels","12 Oct"]]){const r=Fr(rc,{name:t,width:"fill_container",height:34,gap:10,alignItems:"center"});I(r,"message-square",14,"#a1a1aa");T(r,t,{fontSize:13,fontWeight:"500",fill:C.mut2,textGrowth:"fixed-width",width:"fill_container"});T(r,tm,{fontSize:12,fill:"#a1a1aa"});}
