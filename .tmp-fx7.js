const fs=require("fs");process.chdir("C:/PROJETOS/PROCEIT/distribuidora");
const f="lib/facturacion/alta-punto.casos.ts";let s=fs.readFileSync(f,"utf8");
const a="\{t && t\.emitible \? <button[^>]*alternarTipo\(f\)/";
if(!s.includes(a))throw new Error("a");
s=s.replace(a,()=>"\{t && t\.emitible \? <button[\s\S]{0,120}alternarTipo\(f\)/");
fs.writeFileSync(f,s);
