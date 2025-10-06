document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("filterForm");
  const fieldSel = document.getElementById("field");
  const propsBox = document.getElementById("props");
  const nodes = document.getElementById("nodes");
  const newConditionBtn = document.getElementById("newConditionBtn");
  const copyBtn = document.getElementById("copyCodeBtn");

  // JSON editor bits
  const filtersOutput = document.getElementById("filtersOutput");
  const applyBtn = document.getElementById("applyJsonBtn");
  const jsonErrorMsg = document.getElementById("jsonErrorMsg");
  const editToggle = document.getElementById("editJsonToggle");

  // Gutter + mirror for exact wrapped-line positioning
  const jsonGutter  = document.getElementById("jsonGutter");   // absolutely-positioned overlay
  const jsonMeasure = document.getElementById("jsonMeasure");  // hidden mirror matching the textarea
  let lastErrorIndex = null;

  /* ----------------------------- JSON editor helpers ----------------------------- */

  function clearJsonError() {
    if (jsonErrorMsg) jsonErrorMsg.textContent = "";
  }
  function clearGutterDot() {
    if (jsonGutter) jsonGutter.innerHTML = "";
    lastErrorIndex = null;
  }

  // sync mirror styles with the textarea so wrapping is identical
  function syncMirrorStyles() {
    if (!jsonMeasure || !filtersOutput) return;
    const s = getComputedStyle(filtersOutput);

    jsonMeasure.style.top       = filtersOutput.offsetTop + "px";
    jsonMeasure.style.left      = filtersOutput.offsetLeft + "px";
    jsonMeasure.style.width     = filtersOutput.clientWidth + "px";

    jsonMeasure.style.fontFamily   = s.fontFamily;
    jsonMeasure.style.fontSize     = s.fontSize;
    jsonMeasure.style.lineHeight   = s.lineHeight;
    jsonMeasure.style.letterSpacing= s.letterSpacing;

    jsonMeasure.style.paddingTop    = s.paddingTop;
    jsonMeasure.style.paddingRight  = s.paddingRight;
    jsonMeasure.style.paddingBottom = s.paddingBottom;
    jsonMeasure.style.paddingLeft   = s.paddingLeft;

    jsonMeasure.style.borderTopWidth    = s.borderTopWidth;
    jsonMeasure.style.borderRightWidth  = s.borderRightWidth;
    jsonMeasure.style.borderBottomWidth = s.borderBottomWidth;
    jsonMeasure.style.borderLeftWidth   = s.borderLeftWidth;
    jsonMeasure.style.borderStyle       = "solid";
    jsonMeasure.style.borderColor       = "transparent";
  }


// Convert CSS line-height to a number
function numericLineHeight(el) {
  const cs = getComputedStyle(el);
  let lh = parseFloat(cs.lineHeight);
  if (Number.isNaN(lh)) {
    const fs = parseFloat(cs.fontSize) || 14;
    lh = fs * 1.4;
  }
  return lh;
}

/** Ensure the character index is visible in the textarea viewport.
 *  Uses the mirror to find the exact wrapped line offset and adjusts scrollTop.
 */
function scrollToIndex(idx) {
  if (!jsonMeasure || !filtersOutput) return;

  syncMirrorStyles();

  const text = filtersOutput.value;
  const before = esc(text.slice(0, idx));
  const after  = esc(text.slice(idx));
  jsonMeasure.innerHTML = `${before}<span id="__marker__">.</span>${after}`;

  const marker = document.getElementById("__marker__");
  if (!marker) return;

  const lh = numericLineHeight(filtersOutput);

  // Important: marker.offsetTop already includes the mirror padding
  const markerY = marker.offsetTop;

  const viewTop = filtersOutput.scrollTop;
  const viewBot = viewTop + filtersOutput.clientHeight;

  if (markerY < viewTop + lh) {
    filtersOutput.scrollTop = Math.max(0, markerY - lh);
  } else if (markerY > viewBot - lh) {
    filtersOutput.scrollTop = markerY - (filtersOutput.clientHeight - lh);
  }
}

  function esc(str) {
    return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  }

  // place a small red dot next to the visual line that contains the character at `idx`
function showDotAtIndex(idx) {
  if (!jsonGutter || !jsonMeasure || !filtersOutput) return;

  syncMirrorStyles();

  const text = filtersOutput.value;
  const before = esc(text.slice(0, idx));
  const after  = esc(text.slice(idx));
  jsonMeasure.innerHTML = `${before}<span id="__marker__">.</span>${after}`;

  const marker = document.getElementById("__marker__");
  if (!marker) return;

  const lh = numericLineHeight(filtersOutput);
  const padLeft = parseFloat(getComputedStyle(filtersOutput).paddingLeft) || 12;

  // Center the 8px dot on the marker's wrapped line inside the editor
  const top =
    filtersOutput.offsetTop +
    marker.offsetTop -                  // already relative to mirror padding
    filtersOutput.scrollTop +
    (lh / 2) - 4;                       // center the 8px dot

  const left =
    filtersOutput.offsetLeft +
    Math.max(10, padLeft * 0.6) - 4;    // keep dot inside left padding

  jsonGutter.innerHTML = "";
  const dot = document.createElement("div");
  dot.className = "dot";
  dot.style.top  = `${Math.round(top)}px`;
  dot.style.left = `${Math.round(left)}px`;
  jsonGutter.appendChild(dot);

  lastErrorIndex = idx;
}

  // keep dot aligned on scroll/resize
function resyncDot() {
  if (lastErrorIndex == null) return;
  // Just redraw the dot at the stored index; do NOT call scrollToIndex here
  showDotAtIndex(lastErrorIndex);
}

filtersOutput.addEventListener("scroll", resyncDot);
window.addEventListener("resize", resyncDot);

  // convenience: convert a 1-based line to char index for prechecks
  function indexOfLineStart(text, targetLine) {
    if (targetLine <= 1) return 0;
    let idx = 0, line = 1;
    while (line < targetLine && idx < text.length) {
      const nl = text.indexOf("\n", idx);
      if (nl === -1) return text.length;
      idx = nl + 1; line++;
    }
    return idx;
  }

  // Clear dot and message on any input (until Apply is clicked again)
  filtersOutput?.addEventListener("input", () => {
    clearGutterDot();
    clearJsonError();
  });

  // toggle read-only with the “Edit” switch
  if (editToggle && filtersOutput) {
    filtersOutput.readOnly = true;
    editToggle.addEventListener("change", () => {
      filtersOutput.readOnly = !editToggle.checked;
      filtersOutput.classList.toggle("editable", editToggle.checked);
    });
  }

  /* ---------------------- Pre-checks for common JSON issues ---------------------- */

  function detectCommonJsonIssues(fullText) {
    const lines = fullText.split(/\r?\n/);

    // A) unquoted top-level "filters"
    const firstIdx = lines.findIndex(l => l.trim().length > 0);
    if (firstIdx !== -1) {
      const firstLine = lines[firstIdx];
      if (/^\s*filters\s*:/.test(firstLine)) {
        return {
          line: firstIdx + 1,
          message: 'Top-level key must be quoted. Use `"filters": [ … ]` or paste just `[ … ]`.'
        };
      }
    }

    // B) comments (outside strings)
    const cLine = findFirstCommentLine(fullText);
    if (cLine !== null) {
      return { line: cLine + 1, message: "Comments are not allowed in JSON. Remove `//` or `/* … */`." };
    }

    // C) trailing comma before ] or } (outside strings)
    const tLine = findTrailingCommaLine(fullText);
    if (tLine !== null) {
      return { line: tLine + 1, message: "Trailing comma before closing bracket/brace. Remove the last comma." };
    }

    return null;
  }

  // return 0-based line index of first comment outside strings, else null
  function findFirstCommentLine(text) {
    let inString = false, escp = false, inBlock = false, line = 0;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i], nx = text[i+1];
      if (ch === "\n") line++;

      if (inBlock) { if (ch === "*" && nx === "/") { inBlock = false; i++; } continue; }
      if (inString) { if (escp) escp = false; else if (ch === "\\") escp = true; else if (ch === '"') inString = false; continue; }

      if (ch === "/" && nx === "/") return line;
      if (ch === "/" && nx === "*") { inBlock = true; return line; }
      if (ch === '"') inString = true;
    }
    return null;
  }

  // return 0-based line index of trailing comma outside strings/comments, else null
  function findTrailingCommaLine(text) {
    let inString = false, escp = false, inBlock = false, line = 0;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i], nx = text[i+1];
      if (ch === "\n") line++;

      if (inBlock) { if (ch === "*" && nx === "/") { inBlock = false; i++; } continue; }
      if (inString) { if (escp) escp = false; else if (ch === "\\") escp = true; else if (ch === '"') inString = false; continue; }

      if (ch === "/" && nx === "/") { while (i < text.length && text[i] !== "\n") i++; continue; }
      if (ch === "/" && nx === "*") { inBlock = true; continue; }
      if (ch === '"') { inString = true; continue; }

      if (ch === ",") {
        let j = i + 1;
        while (j < text.length) {
          const c = text[j];
          if (c === " " || c === "\t" || c === "\r" || c === "\n") { j++; continue; }
          if (c === "]" || c === "}") return line;
          break;
        }
      }
    }
    return null;
  }

  /* ------------------------------ Apply JSON button ------------------------------ */

  if (applyBtn && filtersOutput) {
    applyBtn.addEventListener("click", () => {
      clearJsonError();
      clearGutterDot();

      const fullText = filtersOutput.value;  // for prechecks and line->index mapping
      const raw = fullText.trim();           // for JSON.parse
      if (!raw) return;

      // Pre-checks (line-number based) → convert to char index for accurate dot
// Pre-check errors
const pre = detectCommonJsonIssues(fullText);
if (pre) {
  const idx = indexOfLineStart(fullText, pre.line);
  scrollToIndex(idx);
  showDotAtIndex(idx);
  jsonErrorMsg.textContent = `❌ ${pre.message}`;
  return;
}

      // Parse
      let arr = null;
      try {
        if (raw.startsWith('"filters"') || raw.startsWith("'filters'")) {
          const wrapped = `{${raw}}`;
          const obj = JSON.parse(wrapped);
          arr = obj.filters;
        } else {
          const parsed = JSON.parse(raw);
          arr = Array.isArray(parsed) ? parsed : parsed.filters;
        }
// Parse errors
} catch (e) {
  const m = e.message.match(/position\s(\d+)/i);
  if (m) {
    const pos = parseInt(m[1], 10);
    scrollToIndex(pos);
    showDotAtIndex(pos);
    const line = fullText.slice(0, pos).split(/\r?\n/).length;
    jsonErrorMsg.textContent = `❌ Invalid JSON on line ${line}: ${e.message}`;
  } else {
    scrollToIndex(0);
    showDotAtIndex(0);
    jsonErrorMsg.textContent = `❌ Invalid JSON: ${e.message}`;
  }
  return;
}

      if (!Array.isArray(arr)) {
        jsonErrorMsg.textContent = '❌ Expected a JSON array or "filters": [ … ]';
        return;
      }

      // strip stray ORs at the ends (safety)
      while (arr.length && arr[0]?.operator) arr.shift();
      while (arr.length && arr[arr.length - 1]?.operator) arr.pop();

      filtersToDom(arr);
      // Success → clear dot/message (if any remained)
      clearGutterDot();
      clearJsonError();
    });
  }

  /* ----------------------------- Filter builder logic ---------------------------- */
  // Schema
  const schema = {
    Country:{props:{Relation:{type:"select",options:["is","is not"]},Value:{type:"text",placeholder:"United States"}}},
    Tag:{props:{Key:{type:"text",placeholder:"plan, tier, cohort"},Relation:{type:"select",options:["is","is not","exists","doesn't exist","is greater than","is less than","time elapsed since is greater than","time elapsed since is less than"]},Value:{type:"text",placeholder:"pro, gold, vip"}}},
    Location:{props:{Radius:{type:"number",placeholder:"km",min:0},Lat:{type:"number",step:"any",placeholder:"37.7749"},Long:{type:"number",step:"any",placeholder:"-122.4194"}}},
    AppVersion:{props:{Relation:{type:"select",options:["is","is not","is greater than","is less than"]},Value:{type:"text",placeholder:"1.2.3"}}},
    Language:{props:{Relation:{type:"select",options:["is","is not"]},Value:{type:"text",placeholder:"en, es, fr"}}},
    SessionTime:{props:{Relation:{type:"select",options:["is greater than","is less than"]},Value:{type:"number",placeholder:"seconds",min:0}}},
    SessionCount:{props:{Relation:{type:"select",options:["is greater than","is less than"]},Value:{type:"number",placeholder:"count",min:0}}},
    FirstSession:{props:{Relation:{type:"select",options:["is greater than","is less than"]},HoursAgo:{type:"number",placeholder:"hours",min:0}}},
    LastSession:{props:{Relation:{type:"select",options:["is greater than","is less than"]},HoursAgo:{type:"number",placeholder:"hours",min:0}}}
  };

  // Relation maps
  const REL_MAP = {
    "is":"=","is not":"!=",
    "is greater than":">","is less than":"<",
    "time elapsed since is greater than":"time_elapsed_gt",
    "time elapsed since is less than":"time_elapsed_lt",
    "exists":"exists","doesn't exist":"not_exists"
  };
  const REL_MAP_INV = {
    "=":"is","!=":"is not",
    ">":"is greater than","<":"is less than",
    "time_elapsed_gt":"time elapsed since is greater than",
    "time_elapsed_lt":"time elapsed since is less than",
    "exists":"exists","not_exists":"doesn't exist"
  };

  const FIELD_MAP = {
    Country:"country", Tag:"tag", Location:"location", AppVersion:"app_version",
    Language:"language", SessionTime:"session_time", SessionCount:"session_count",
    FirstSession:"first_session", LastSession:"last_session"
  };

  // populate Field select
  Object.keys(schema).forEach(k => {
    const o = document.createElement("option"); o.value = k; o.textContent = k; fieldSel.appendChild(o);
  });

  /* ----------------------------- Group/node utilities ---------------------------- */

  function getGroups(){ return Array.from(nodes.querySelectorAll(".group")); }

  function createRemoveButtonFor(group){
    const btn = document.createElement("button");
    btn.className = "btn btn-sm";
    btn.textContent = "Remove group";
    btn.addEventListener("click", () => {
      const wasActive = group.classList.contains("active");
      group.remove();
      if (wasActive) {
        const remaining = getGroups();
        currentGroup = remaining.length ? remaining[remaining.length - 1] : null;
        if (currentGroup) setActiveGroup(currentGroup);
      }
      renumberGroups();
      refreshCodeSample();
    });
    return btn;
  }

  function createGroup(idx){
    const group = document.createElement("div"); group.className="group";
    const header = document.createElement("div"); header.className="group-header";
    const title = document.createElement("div"); title.className="group-title"; title.textContent=`Condition ${idx}`;
    const count = document.createElement("div"); count.className="group-count"; count.textContent="(0 items)";
    const actions = document.createElement("div"); actions.className="group-actions";
    actions.appendChild(createRemoveButtonFor(group));
    header.appendChild(title); header.appendChild(count); header.appendChild(actions);
    const body = document.createElement("div"); body.className="group-body";
    group.appendChild(header); group.appendChild(body);
    group.addEventListener("click",(e)=>{ if (e.target.closest(".group-actions")) return; setActiveGroup(group); currentGroup=group; });
    return group;
  }

  function setActiveGroup(group){ getGroups().forEach(g=>g.classList.remove("active")); if (group) group.classList.add("active"); }
  function updateGroupCount(group){ const n = group.querySelectorAll(".group-body .node").length; group.querySelector(".group-count").textContent=`(${n} item${n===1?"":"s"})`; }
  function renumberGroups(){
    const groups = getGroups();
    groups.forEach((g,i)=>{
      const title=g.querySelector(".group-title"); if (title) title.textContent=`Condition ${i+1}`;
      const actions=g.querySelector(".group-actions"); if (!actions) return;
      const existing = Array.from(actions.children).find(c=>c.matches("button.btn.btn-sm"));
      if (i===0) { if (existing) existing.remove(); } else { if (!existing) actions.appendChild(createRemoveButtonFor(g)); }
    });
  }

  let currentGroup = null;
  if (getGroups().length === 0) {
    const g = createGroup(1); nodes.appendChild(g); setActiveGroup(g); currentGroup=g;
  }
  renumberGroups();

  function pill(text){ const s=document.createElement("span"); s.className="node-pill"; s.textContent=String(text); return s; }
  function nodeContent(field, values){
    const wrap=document.createElement("div");
    const title=document.createElement("div"); title.className="node-title"; title.textContent=field; wrap.appendChild(title);
    const meta=document.createElement("div"); meta.className="node-meta";
    for (const [k,v] of Object.entries(values)){ const lbl=document.createElement("span"); lbl.textContent=`${k} `; meta.appendChild(lbl); meta.appendChild(pill(v)); meta.appendChild(document.createTextNode(" ")); }
    wrap.appendChild(meta); return wrap;
  }

  // conflict highlighting (skip Tag)
  function isDefinitiveRelation(field, relWord){ return relWord === "is"; }
  function updateConflictHighlightsForGroup(group){
    const nodesInGroup = Array.from(group.querySelectorAll(".group-body .node"));
    const map = new Map();
    nodesInGroup.forEach(n=>{
      const p=n.__payload; if (!p || p.field==="Tag") return;
      const entry = map.get(p.field) || {hasDef:false, nodes:[]};
      entry.nodes.push(n); if (isDefinitiveRelation(p.field, p.values?.Relation||"")) entry.hasDef=true;
      map.set(p.field, entry);
    });
    map.forEach(({hasDef,nodes})=>{
      if (!hasDef || nodes.length<=1){ nodes.forEach(n=>n.classList.remove("node-conflict")); return; }
      nodes.forEach(n=>{
        const rel = n.__payload?.values?.Relation || "";
        n.classList.toggle("node-conflict", !isDefinitiveRelation(n.__payload.field, rel));
      });
    });
    nodesInGroup.forEach(n=>{
      if (n.__payload?.field==="Tag") return;
      let warn=n.querySelector(".node-warning");
      if (!warn){ warn=document.createElement("span"); warn.className="node-warning"; warn.textContent="overridden by 'is' in this group"; (n.querySelector(".node-meta")||n).appendChild(warn); }
    });
  }
  function updateAllConflictHighlights(){ getGroups().forEach(updateConflictHighlightsForGroup); }

  // per-group limits
  const MULTI_NEGATION_FIELDS = new Set(["Country","Language","AppVersion"]);
  function allowsMultipleInGroup(field, relationWord){
    if (field==="Tag") return true;
    if (relationWord==="is greater than" || relationWord==="is less than") return true;
    if (relationWord==="is not" && MULTI_NEGATION_FIELDS.has(field)) return true;
    return false;
  }
  function countFieldInGroup(group, field){
    return Array.from(group.querySelectorAll(".group-body .node"))
      .filter(n=>n.__payload && n.__payload.field===field).length;
  }
  function findTargetGroupFor(field, relationWord, preferredGroup){
    const groups=getGroups(); const fallback=groups[groups.length-1]||null; const chosen=preferredGroup||fallback;
    if (!chosen){ const g=createGroup(1); nodes.appendChild(g); renumberGroups(); setActiveGroup(g); currentGroup=g; return g; }
    if (!allowsMultipleInGroup(field, relationWord) && countFieldInGroup(chosen, field)>=1){
      const g=createGroup(groups.length+1); nodes.appendChild(g); renumberGroups(); setActiveGroup(g); currentGroup=g; return g;
    }
    return chosen;
  }

  function nodeToFilter(field, values){
    const f = FIELD_MAP[field];
    if (field==="Tag"){
      const rel = REL_MAP[values.Relation];
      if (!values.Key) return null;
      if (rel==="exists" || rel==="not_exists") return {field:"tag", key:String(values.Key), relation:rel};
      if (rel==="time_elapsed_gt" || rel==="time_elapsed_lt") return {field:"tag", key:String(values.Key), relation:rel, value:String(values.Value||"0")};
      return {field:"tag", key:String(values.Key), relation:rel||"=", value:String(values.Value??"")};
    }
    if (field==="Location") return {field:"location", lat:String(values.Lat??""), long:String(values.Long??""), radius:String(values.Radius??"")};
    if (field==="FirstSession" || field==="LastSession") return {field:f, relation:REL_MAP[values.Relation]||">", hours_ago:String(values.HoursAgo??"")};
    const rel=REL_MAP[values.Relation]||"="; const out={field:f, relation:rel}; if (values.Value!==undefined) out.value=String(values.Value); return out;
  }

  function filterToFieldValues(filter){
    const api=(filter.field||"").toLowerCase();
    if (api==="tag"){
      const key=filter.key ?? filter.tag_key;
      const relWord = REL_MAP_INV[String(filter.relation||"")] || "is";
      const v={ Key:String(key??"") };
      if (filter.relation==="exists" || filter.relation==="not_exists") { v.Relation=relWord; return {field:"Tag", values:v}; }
      if (filter.relation==="time_elapsed_gt" || filter.relation==="time_elapsed_lt"){ v.Relation=relWord; v.Value=String(filter.value??""); return {field:"Tag", values:v}; }
      v.Relation=relWord; v.Value=String(filter.value??""); return {field:"Tag", values:v};
    }
    if (api==="location") return {field:"Location", values:{Radius:String(filter.radius??""), Lat:String(filter.lat??""), Long:String(filter.long??"")}};
    if (api==="first_session" || api==="last_session"){
      const f = api==="first_session" ? "FirstSession" : "LastSession";
      return {field:f, values:{Relation:REL_MAP_INV[String(filter.relation||">")]||"is greater than", HoursAgo:String(filter.hours_ago??"")}};
    }
    const INV = {country:"Country", language:"Language", app_version:"AppVersion", session_time:"SessionTime", session_count:"SessionCount"};
    const ui = INV[api];
    if (ui) return {field:ui, values:{Relation:REL_MAP_INV[String(filter.relation||"=")]||"is", Value:String(filter.value??"")}};
    return null;
  }

  function buildFiltersFromDom(){
    const groups=getGroups(); const filters=[];
    groups.forEach((g,gi)=>{
      const items=Array.from(g.querySelectorAll(".group-body .node")); if (!items.length) return;
      if (gi>0) filters.push({operator:"OR"});
      items.forEach(n=>{ const p=n.__payload; if (!p) return; const obj=nodeToFilter(p.field,p.values); if (obj) filters.push(obj); });
    });
    return filters;
  }

  function filtersToDom(filters){
    nodes.innerHTML=""; currentGroup=null;
    let group = createGroup(1); nodes.appendChild(group);
    filters.forEach(entry=>{
      if (entry && typeof entry==="object" && "operator" in entry){
        if (String(entry.operator).toUpperCase()==="OR"){ const g=createGroup(getGroups().length+1); nodes.appendChild(g); group=g; }
        return;
      }
      const parsed=filterToFieldValues(entry||{}); if (!parsed) return;
      const relWord=parsed.values?.Relation||"";
      const target=findTargetGroupFor(parsed.field, relWord, group);
      createNodeInGroup(parsed.field, parsed.values, target);
      group = target;
    });
    renumberGroups(); const last=getGroups()[getGroups().length-1]; setActiveGroup(last); currentGroup=last;
    refreshCodeSample(); updateAllConflictHighlights();
  }

  function createNodeInGroup(field, values, group){
    const body=group.querySelector(".group-body");
    const node=document.createElement("div"); node.className="node node-ok";
    node.appendChild(nodeContent(field, values)); node.__payload={field, values};
    const remove=document.createElement("button"); remove.className="btn btn-sm remove"; remove.textContent="Remove";
    remove.addEventListener("click",()=>{
      node.remove(); updateGroupCount(group); refreshCodeSample(); updateAllConflictHighlights();
    });
    node.appendChild(remove); body.appendChild(node); updateGroupCount(group); return node;
  }

  function refreshCodeSample(){
    if (!filtersOutput) return;
    const filters = buildFiltersFromDom();
    const json = JSON.stringify({filters}, null, 2);
    const stripped = json.replace(/^{\n?/, "").replace(/}\n?$/, "").trim();
    filtersOutput.value = stripped;
  }

  /* ---------------------------------- Events ---------------------------------- */

  fieldSel.addEventListener("change", ()=>renderProps(fieldSel.value));

  newConditionBtn.addEventListener("click", ()=>{
    const g=createGroup(getGroups().length+1); nodes.appendChild(g);
    renumberGroups(); setActiveGroup(g); currentGroup=g; g.scrollIntoView({behavior:"smooth", block:"center"});
    refreshCodeSample();
  });

  form.addEventListener("submit", (e)=>{
    e.preventDefault();
    const field=fieldSel.value;
    const payload=readProps(field);
    if (!payload.ok) return;

    const relWord=payload.values?.Relation||"";
    const target=findTargetGroupFor(field, relWord, currentGroup || getGroups().slice(-1)[0]);
    if (!target) return;

    const node=createNodeInGroup(field, payload.values, target);
    node.scrollIntoView({behavior:"smooth", block:"center"});

    // reset inputs but keep field selection
    propsBox.querySelectorAll("input, select").forEach(el=>{
      if (el.tagName==="SELECT"){
        if (el.firstElementChild && el.firstElementChild.disabled) el.value="";
      } else {
        el.value="";
      }
    });
    toggleValueVisibility(field);
    refreshCodeSample(); updateAllConflictHighlights();
  });

  copyBtn?.addEventListener("click", async ()=>{
    filtersOutput.select(); filtersOutput.setSelectionRange(0, filtersOutput.value.length);
    try{
      await navigator.clipboard.writeText(filtersOutput.value);
      const old=copyBtn.textContent; copyBtn.textContent="Copied"; setTimeout(()=>copyBtn.textContent=old, 900);
    }catch{}
  });

  // initial render
  renderProps(fieldSel.value);
  refreshCodeSample();

  /* ------------------------------- Props controls ------------------------------- */

  function renderProps(field){
    propsBox.innerHTML=""; const spec=schema[field].props;
    Object.entries(spec).forEach(([name,def])=>{
      const grp=document.createElement("div"); grp.className="form-group"; grp.dataset.prop=name;
      const lab=document.createElement("label"); lab.setAttribute("for",`prop-${name}`); lab.textContent=name;

      let input;
      if (def.type==="select"){
        input=document.createElement("select"); input.className="select"; input.id=`prop-${name}`; input.required=true;
        const ph=document.createElement("option"); ph.value=""; ph.textContent=`Select ${name.toLowerCase()}`; ph.disabled=true; ph.selected=true; input.appendChild(ph);
        def.options.forEach(opt=>{ const o=document.createElement("option"); o.value=opt; o.textContent=opt; input.appendChild(o); });
        if (name==="Relation"){ input.addEventListener("change", ()=>toggleValueVisibility(field)); }
      }else{
        input=document.createElement("input"); input.className="input"; input.id=`prop-${name}`; input.required=true; input.type=def.type||"text";
        if (def.placeholder) input.placeholder=def.placeholder;
        if (def.min!==undefined) input.min=def.min;
        if (def.step!==undefined) input.step=def.step;
      }

      grp.appendChild(lab); grp.appendChild(input); propsBox.appendChild(grp);
    });
    toggleValueVisibility(field);
  }

  function toggleValueVisibility(field){
    const relSel=document.getElementById("prop-Relation");
    const valueGroup=document.querySelector('[data-prop="Value"]');
    if (!relSel || !valueGroup) return;

    const valueInput=valueGroup.querySelector("input");
    const noValueNeeded = field==="Tag" && (relSel.value==="exists" || relSel.value==="doesn't exist");
    if (noValueNeeded){
      valueGroup.style.display="none";
      if (valueInput){ valueInput.required=false; valueInput.disabled=true; valueInput.value=""; }
    }else{
      valueGroup.style.display="";
      if (valueInput){ valueInput.disabled=false; valueInput.required=true; }
    }
  }

  function readProps(field){
    const spec=schema[field].props; const values={};
    for (const name of Object.keys(spec)){
      const el=document.getElementById(`prop-${name}`); if (!el) continue;
      const container=el.closest("[data-prop]"); const hidden=container && container.style.display==="none";
      if (el.disabled || hidden) continue;
      const v=String(el.value||"").trim();
      if (el.required && !v){ el.reportValidity(); return {ok:false}; }
      if (v) values[name]=v;
    }
    return {ok:true, values};
  }

});
