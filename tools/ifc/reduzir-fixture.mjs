// Gera o fixture de teste a partir de um IFC real: mantém só o subconjunto de entidades
// que o importador lê (elementos de fluxo, portas, relações, placements, extrusões,
// Pset de comprimento, sistemas, pavimentos, unidades) e poda a geometria de malha.
// Remove PII do header (autor/CREA/e-mail) e zera as coordenadas do terreno (IFCSITE).
// Uso: node reduzir-fixture.mjs <entrada.ifc> <saida.ifc>
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
const [entrada, saida] = process.argv.slice(2);
if (!entrada || !saida) throw new Error('uso: node reduzir-fixture.mjs <entrada.ifc> <saida.ifc>');
const src = readFileSync(entrada, 'latin1');
const ent = new Map(); const ordem = [];
const re = /^#(\d+)=([A-Z0-9]+)\(([\s\S]*?)\);\r?$/gm;
let m; while ((m = re.exec(src))) { ent.set(+m[1], { tipo: m[2], args: m[3] }); ordem.push(+m[1]); }
const R = (s) => [...s.matchAll(/#(\d+)/g)].map((x) => +x[1]);
function split(s) { const out = []; let d = 0, cur = '', q = false; for (const c of s) { if (q) { cur += c; if (c === "'") q = false; continue; } if (c === "'") { q = true; cur += c; continue; } if (c === '(') d++; if (c === ')') d--; if (c === ',' && d === 0) { out.push(cur.trim()); cur = ''; continue; } cur += c; } out.push(cur.trim()); return out; }
const strs = (s) => [...s.matchAll(/'((?:[^']|'')*)'/g)].map((x) => x[1]);
const RAIZES = new Set(['IFCPROJECT','IFCSITE','IFCBUILDING','IFCBUILDINGSTOREY','IFCUNITASSIGNMENT','IFCFLOWSEGMENT','IFCFLOWFITTING','IFCFLOWCONTROLLER','IFCFLOWTERMINAL','IFCBUILDINGELEMENTPROXY','IFCDISTRIBUTIONPORT','IFCRELCONNECTSPORTTOELEMENT','IFCRELCONNECTSPORTS','IFCRELASSIGNSTOGROUP','IFCSYSTEM','IFCRELCONTAINEDINSPATIALSTRUCTURE','IFCRELAGGREGATES']);
const PODAR = new Set(['IFCFACETEDBREP','IFCMAPPEDITEM','IFCSTYLEDITEM','IFCPRESENTATIONLAYERASSIGNMENT','IFCRELASSOCIATESMATERIAL','IFCMATERIALDEFINITIONREPRESENTATION','IFCOWNERHISTORY','IFCPERSONANDORGANIZATION','IFCPERSON','IFCORGANIZATION','IFCAPPLICATION','IFCRELDEFINESBYTYPE','IFCREPRESENTATIONMAP']);
// psets: so o Length do tubo
const keepRoots = new Set();
for (const [id, e] of ent) if (e.tipo === 'IFCRELDEFINESBYPROPERTIES') { const ps = ent.get(R(e.args).at(-1)); if (ps?.tipo === 'IFCPROPERTYSET' && strs(ps.args)[1] === 'Pset_FlowSegmentPipeSegment') RAIZES_add(id); }
function RAIZES_add(id) { keepRoots.add(id); }
const keep = new Set(); const fila = [];
for (const [id, e] of ent) if (RAIZES.has(e.tipo) || keepRoots.has(id)) { keep.add(id); fila.push(id); }
while (fila.length) { const id = fila.pop(); const e = ent.get(id); for (const r of R(e.args)) { const t = ent.get(r); if (!t || keep.has(r) || PODAR.has(t.tipo)) continue; keep.add(r); fila.push(r); } }
let out = "ISO-10303-21;\r\nHEADER;\r\nFILE_DESCRIPTION(('ViewDefinition [CoordinationView_V2.0]'),'2;1');\r\nFILE_NAME('fixture-reduzido.ifc','2026-09-13T00:00:00',(''),(''),'','Autodesk Revit 2027','');\r\nFILE_SCHEMA(('IFC2X3'));\r\nENDSEC;\r\nDATA;\r\n";
let n = 0;
for (const id of ordem) { if (!keep.has(id)) continue; const e = ent.get(id); // mantém a aridade: escalar podado vira $, lista podada perde só os itens podados
  const args = split(e.args).map((a) => a.startsWith('(') ? '(' + a.slice(1, -1).split(',').filter((x) => !(x.trim().startsWith('#') && !keep.has(+x.trim().slice(1)))).join(',') + ')' : (a.startsWith('#') && !keep.has(+a.slice(1)) ? '$' : a)).join(',');
  const argsSemSitio = e.tipo === 'IFCSITE' ? args.replace(/\(-?\d+,-?\d+,-?\d+,-?\d+\)/g, '$') : args;
  out += `#${id}=${e.tipo}(${argsSemSitio});\r\n`; n++; }
out += 'ENDSEC;\r\nEND-ISO-10303-21;\r\n';
writeFileSync(saida, out, 'latin1');
console.log('entidades mantidas:', n, '| kB:', (out.length / 1024).toFixed(0), '| gzip kB:', (gzipSync(Buffer.from(out, 'latin1')).length / 1024).toFixed(0));
