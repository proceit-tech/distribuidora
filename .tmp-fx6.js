const fs=require("fs");process.chdir("C:/PROJETOS/PROCEIT/distribuidora");
let s=fs.readFileSync("lib/facturacion/series.casos.ts","utf8");
const a=' && (rev.match(/LOCK TABLE/g) ?? []).length === 3 && !/\bFROM public\.fe_punto_secuencias\b[^;]*;\s*\n\s*LOCK TABLE/.test(rev));';
if(!s.includes(a))throw new Error("a");
s=s.replace(a,()=>' && (rev.match(/^\s*LOCK TABLE/gm) ?? []).length === 3);');
fs.writeFileSync("lib/facturacion/series.casos.ts",s);
