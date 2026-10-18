import { readFileSync, writeFileSync } from "node:fs";
const prelude = ["prelude.js","sprelude.js","mprelude.js"].map(f=>readFileSync(f,"utf8")).join("");
const files = process.argv.slice(2);
const lines = [];
files.forEach((f,i)=>{
  const PX=(i%3)*1424, PY=Math.floor(i/3)*1160;
  const code=`const PX=${PX},PY=${PY};`+prelude+readFileSync(f,"utf8")+`\nwDeck${i}=w;`;
  lines.push(`execute({ input: ${JSON.stringify(code)} })`);
});
const ids=files.map((_,i)=>`wDeck${i}`).join(",");
lines.push(`execute({ input: ${JSON.stringify(`Print([${ids}].join(","));Export([${ids}],"png","/tmp/sidebar-mock/out3",{scale:1.5});Export([${ids}],"pdf","/tmp/sidebar-mock/pdf3")`)} })`);
lines.push("save()","exit()");
writeFileSync("cmds.txt",lines.join("\n")+"\n");
