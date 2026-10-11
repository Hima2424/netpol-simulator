const $ = id => document.getElementById(id);
const NS = "network-policy-lab";

function pol(){
  return { denyAll:$("denyAll").checked, fb:$("fb").checked, bd:$("bd").checked, ob:$("ob").checked };
}

// Same rules as NetworkPolicy: a pod is open until selected; then only allowed sources connect
function isAllowed(p, src, dst){
  const selected = p.denyAll ||
    (dst==="backend" && (p.fb || p.ob)) ||
    (dst==="database" && p.bd);
  if(!selected) return true;
  if(dst==="backend" && p.fb && src==="frontend") return true;
  if(dst==="backend" && p.ob && src==="outsider") return true;
  if(dst==="database" && p.bd && src==="backend") return true;
  return false;
}

const REPLY = {backend:"BACKEND: request received", database:"DATABASE: request received", frontend:"FRONTEND: request received"};

function podName(src){
  return src==="frontend" ? "deploy/frontend" : (src==="backend" ? "backend-test" : src);
}
function cmd(src,dst){
  if(src==="outsider") return `$ kubectl exec -n other-ns outsider -- curl -m 5 -s http://${dst}.${NS}`;
  return `$ kubectl exec ${podName(src)} -- curl -m 5 -s http://${dst}`;
}
function outputFor(p,src,dst){
  return isAllowed(p,src,dst)
    ? REPLY[dst]
    : "command terminated with exit code 28\nBLOCKED";
}

const PAIRS = [["frontend","backend"],["frontend","database"],["backend","database"],
               ["test-client","backend"],["test-client","database"],["outsider","backend"]];

function resultsText(p, pairs=PAIRS){
  let t = "=== RESULTS ===\n";
  pairs.forEach(([s,d])=>{
    t += `${s} -> ${d}:\n${outputFor(p,s,d)}\n`;
  });
  return t.trimEnd();
}

function policiesText(p){
  const rows=[];
  if(p.bd) rows.push(["allow-backend-to-database","app=database"]);
  if(p.fb) rows.push(["allow-frontend-to-backend","app=backend"]);
  if(p.ob) rows.push(["allow-other-namespace-to-backend","app=backend"]);
  if(p.denyAll) rows.push(["default-deny-ingress","<none>"]);
  if(!rows.length) return `$ kubectl get networkpolicy\nNo resources found in ${NS} namespace.`;
  const w = Math.max(...rows.map(r=>r[0].length))+3;
  let t = `$ kubectl get networkpolicy\n${"NAME".padEnd(w)}POD-SELECTOR\n`;
  rows.forEach(r=>{ t += r[0].padEnd(w)+r[1]+"\n"; });
  return t.trimEnd();
}

function podsText(){
  return `$ kubectl get pods --show-labels
NAME                        READY  STATUS   LABELS
backend-77fbc647f7-p554q    1/1    Running  app=backend
backend-test                1/1    Running  app=backend
database-6b55fc59bb-kvn8x   1/1    Running  app=database
frontend-5667bf75d5-5vwv8   1/1    Running  app=frontend
test-client                 1/1    Running  app=test-client
outsider (ns: other-ns)     1/1    Running  (no app label)`;
}

function describeText(p){
  if(!p.fb && !p.bd && !p.denyAll && !p.ob) return "Tick a policy first to describe it.";
  let t="";
  if(p.denyAll) t+=`$ kubectl describe networkpolicy default-deny-ingress
Name:         default-deny-ingress
Namespace:    ${NS}
Spec:
  PodSelector:     <none> (Allowing the specific traffic to all pods in this namespace)
  Allowing ingress traffic:
    <none> (Selected pods are isolated for ingress connectivity)
  Policy Types: Ingress

`;
  if(p.fb) t+=`$ kubectl describe networkpolicy allow-frontend-to-backend
Name:         allow-frontend-to-backend
Namespace:    ${NS}
Spec:
  PodSelector:     app=backend
  Allowing ingress traffic:
    To Port: 5678/TCP
    From:
      PodSelector: app=frontend
  Not affecting egress traffic
  Policy Types: Ingress

`;
  if(p.bd) t+=`$ kubectl describe networkpolicy allow-backend-to-database
Name:         allow-backend-to-database
Namespace:    ${NS}
Spec:
  PodSelector:     app=database
  Allowing ingress traffic:
    To Port: 5678/TCP
    From:
      PodSelector: app=backend
  Not affecting egress traffic
  Policy Types: Ingress

`;
  if(p.ob) t+=`$ kubectl describe networkpolicy allow-other-namespace-to-backend
Name:         allow-other-namespace-to-backend
Namespace:    ${NS}
Spec:
  PodSelector:     app=backend
  Allowing ingress traffic:
    To Port: 5678/TCP
    From:
      NamespaceSelector: kubernetes.io/metadata.name=other-ns
  Not affecting egress traffic
  Policy Types: Ingress

`;
  return t.trimEnd();
}

// ---------- UI ----------
let view = "tests";
let customText = null;

function render(){
  const p = pol();
  const t = $("terminal");
  if(customText!==null){ t.textContent = customText; return; }
  if(view==="tests") t.textContent = resultsText(p);
  if(view==="policies") t.textContent = policiesText(p);
  if(view==="pods") t.textContent = podsText();
  if(view==="describe") t.textContent = describeText(p);
}

function setView(v){
  view=v; customText=null;
  document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active", b.dataset.view===v));
  render();
}

function table(p){
  let html="<tr><th>Test</th><th>Result</th></tr>";
  PAIRS.forEach(([s,d])=>{
    const ok=isAllowed(p,s,d);
    html+=`<tr><td>${s} → ${d}</td><td class="${ok?"ok":"no"}">${ok?"✅ Allowed":"❌ Blocked"}</td></tr>`;
  });
  $("table").innerHTML=html;
}

function highlight(src,dst){
  document.querySelectorAll(".pod").forEach(x=>x.classList.remove("active"));
  $(src).classList.add("active"); $(dst).classList.add("active");
}

function runOne(){
  const p=pol(), s=$("src").value, d=$("dst").value;
  highlight(s,d);
  const ok=isAllowed(p,s,d);
  $("result").className=ok?"ok":"no";
  $("result").textContent=`${s} → ${d}: ${ok?"✅ ALLOWED":"❌ BLOCKED"}`;
  document.querySelectorAll(".tab").forEach(b=>b.classList.remove("active"));
  customText = cmd(s,d)+"\n"+outputFor(p,s,d);
  render();
}

function runAll(){
  customText=null; setView("tests"); table(pol());
}

function setPolicies(o){
  ["denyAll","fb","bd","ob"].forEach(k=>$(k).checked=!!o[k]);
}

["denyAll","fb","bd","ob"].forEach(id=>$(id).addEventListener("change",()=>{ customText=null; render(); table(pol()); }));
$("testBtn").onclick=runOne;
$("allBtn").onclick=runAll;
$("resetBtn").onclick=()=>{ setPolicies({}); $("result").textContent=""; $("table").innerHTML=""; setView("tests"); };
document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>setView(b.dataset.view));

// Use cases
$("uc1").onclick=()=>{
  setPolicies({denyAll:true,fb:true,bd:true,ob:false});
  const p=pol();
  customText = "USE CASE: Restrict traffic between namespaces\n\n" +
    cmd("outsider","backend")+"\n"+outputFor(p,"outsider","backend")+"\n\n"+
    cmd("outsider","database")+"\n"+outputFor(p,"outsider","database")+
    "\n\nThe pod in other-ns is blocked because default-deny covers the namespace\nand no rule allows other-ns.";
  document.querySelectorAll(".tab").forEach(b=>b.classList.remove("active"));
  table(p); render(); $("terminal").scrollIntoView({behavior:"smooth",block:"center"});
};
$("uc2").onclick=()=>{
  setPolicies({denyAll:true,fb:true,bd:true,ob:false});
  customText=null; setView("tests"); table(pol());
  $("terminal").scrollIntoView({behavior:"smooth",block:"center"});
};

// Bottlenecks
$("bn1").onclick=()=>{
  customText=`BOTTLENECK: Policies silently block traffic with confusing symptoms

A blocked request does not say "denied". It just hangs, then times out.
Read the curl exit code:

  Exit code 28  ->  timeout: dropped by NetworkPolicy
  Exit code 7   ->  failed to connect (pod not ready), NOT a policy block
  Exit code 6   ->  DNS / Service name problem
  localhost:8080 refused -> kubectl has no cluster

Other traps:
  - Policies match the container port (5678), not the Service port (80)
  - Labels must match exactly (app=backend)

Diagnose with:
  kubectl get networkpolicy
  kubectl get pods --show-labels
  kubectl describe networkpolicy <name>`;
  document.querySelectorAll(".tab").forEach(b=>b.classList.remove("active"));
  render(); $("terminal").scrollIntoView({behavior:"smooth",block:"center"});
};
$("bn2").onclick=()=>{
  setPolicies({denyAll:true});
  const p=pol();
  customText="BOTTLENECK: Default-deny adoption breaks existing services\n\n"+
    "Only default-deny-ingress is applied. No allow rules yet:\n\n"+
    resultsText(p,[["frontend","backend"],["backend","database"]])+
    "\n\nThe app is now broken. Fix: add allow-frontend-to-backend and\nallow-backend-to-database, then test again.\nSafe order: baseline -> default-deny -> allow rules one by one -> test each.";
  document.querySelectorAll(".tab").forEach(b=>b.classList.remove("active"));
  table(p); render(); $("terminal").scrollIntoView({behavior:"smooth",block:"center"});
};

render();
