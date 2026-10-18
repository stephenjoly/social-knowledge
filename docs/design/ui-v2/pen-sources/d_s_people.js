const [w,scr]=Wrap(PX,"15 · Settings: People & access (admins only)","One table for members, one list for open invitations. Roles change inline, and invite links show who made them and when they expire.",PY,880);
wS6=w;
SB(scr,"settings","People & access");
const col=Page(scr,"SETTINGS  /  ADMINISTRATION","People & access","Manage who can sign in and what they can administer. Every archive stays private to its owner.",h=>Btn(h,"Invite someone",{primary:1,icon:"user-plus"}));
const m=Section(col,"Members","3 people",h=>Input(h,"Search people…",220,{icon:"search",muted:1}));
const hd=Fr(m,{name:"Table head",width:"fill_container",padding:[10,18],gap:14,fill:"#fafafa",stroke:"#f0f0f1",strokeWidth:{bottom:1}});
for(const [l,wd] of [["NAME","fill_container"],["ROLE",130],["LAST ACTIVE",120],["",32]]){const c=Fr(hd,{name:"Col "+(l||"actions"),width:wd});if(l)T(c,l,{fontSize:10.5,fontWeight:"700",letterSpacing:1,fill:"#a1a1aa"});}
const people=[["Stephen","@stephen · you","#3f6b52","S","Admin","Active now"],["Maya Chen","@maya","#4f6fa8","M","Member","2 days ago"],["João Ribeiro","@joao","#c08a3e","J","Member","3 weeks ago"]];
people.forEach(([n,u,c,l,role,last],i)=>{const r=Fr(m,{name:n,width:"fill_container",padding:[12,18],gap:14,alignItems:"center",...(i<people.length-1?{stroke:"#f0f0f1",strokeWidth:{bottom:1}}:{})});
const nm=Fr(r,{name:"Name cell",width:"fill_container",gap:12,alignItems:"center"});Av(nm,32,c,l);const t=Fr(nm,{name:"Text",layout:"vertical",gap:2});T(t,n,{fontSize:13.5,fontWeight:"600"});T(t,u,{fontSize:12,fill:C.mut});
const rc=Fr(r,{name:"Role cell",width:130});if(i===0){const b=Fr(rc,{name:"Role",padding:[3,9],cornerRadius:999,fill:"#e8f0ea"});T(b,"Admin",{fontSize:12,fontWeight:"600",fill:"#2f5d40"});}else Select(rc,role,116);
const lc=Fr(r,{name:"Last cell",width:120});T(lc,last,{fontSize:12.5,fill:C.mut});
const ac=Fr(r,{name:"Actions",width:32,height:32,cornerRadius:7,justifyContent:"center",alignItems:"center"});if(i>0)I(ac,"ellipsis",16,C.mut);});
const inv=Section(col,"Open invitations","Links expire after 7 days. Anyone with the link can create one account.");
let r=Row(inv,"Member invite","Created by Stephen · expires in 6 days",{lead:x=>IconBox(x,"link",C.sub,C.mut2,30)});Btn(r,"Copy link",{icon:"copy"});Btn(r,"Revoke",{danger:1});
r=Row(inv,"Admin invite","Created by Stephen · expires tomorrow",{last:1,lead:x=>IconBox(x,"shield",C.sub,C.mut2,30)});Status(r,"Admin","warn");Btn(r,"Copy link",{icon:"copy"});Btn(r,"Revoke",{danger:1});
