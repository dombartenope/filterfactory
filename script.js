document.addEventListener("DOMContentLoaded", () => {
  /** DOM refs */
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
  const jsonGutter  = document.getElementById("jsonGutter");   // overlay
  const jsonMeasure = document.getElementById("jsonMeasure");  // hidden mirror
  let lastErrorIndex = null;

  /** ========= Schema and mappings ========= */
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
  const INV_FIELD_MAP = {
    country:"Country", language:"Language", app_version:"AppVersion",
    session_time:"SessionTime", session_count:"SessionCount",
    first_session:"FirstSession", last_session:"LastSession"
  };

    /** Populate Field select (only if the old sidebar select is present) */
if(fieldSel) {
  Object.keys(schema).forEach(k => {
    const o = document.createElement("option");
    o.value = k; o.textContent = k;
    fieldSel.appendChild(o);
  });
}


  /** ========= JSON editor helpers ========= */
  function clearJsonError(){ if (jsonErrorMsg) jsonErrorMsg.textContent=""; }
  function clearGutterDot(){ if (jsonGutter) jsonGutter.innerHTML=""; lastErrorIndex=null; }

  function syncMirrorStyles(){
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
  function esc(str){ return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
  function numericLineHeight(el){
    const cs = getComputedStyle(el);
    let lh = parseFloat(cs.lineHeight);
    if (Number.isNaN(lh)) {
      const fs = parseFloat(cs.fontSize) || 14;
      lh = fs * 1.4;
    }
    return lh;
  }
function initGroupAdder(group){
  const adderRoot = group.querySelector(".group-adder");
  if (!adderRoot) return;

  // Allow "Add" and "Cancel" to bubble up to the delegated listeners,
  // but suppress stray clicks inside the panel from toggling the group.
  adderRoot.addEventListener("click", (e) => {
    if (
      e.target.closest(".adder-add-btn") ||
      e.target.closest(".adder-cancel") ||
      e.target.closest(".adder-collapsed")
    ) {
      return; // let it bubble
    }
    if (e.target.closest(".adder-panel")) {
      e.stopPropagation(); // swallow background panel clicks only
    }
  });

  const sel = group.querySelector(".adder-field");
  const propsHost = group.querySelector(".adder-props");
  if (!sel || !propsHost) return;

  // Populate the field select
  sel.innerHTML = "";
  Object.keys(schema).forEach((k) => {
    const o = document.createElement("option");
    o.value = k; o.textContent = k;
    sel.appendChild(o);
  });
  if (sel.options.length) sel.selectedIndex = 0;

  // Initial props for current field
  renderAdderProps(group, sel.value);

  // Re-render props when swapping fields
  sel.addEventListener("change", () => {
    renderAdderProps(group, sel.value);
  });
}

function renderAdderProps(group, field){
  const host = group.querySelector(".adder-props");
  host.innerHTML = "";
  const spec = schema[field].props;

  const propsGrid = document.createElement("div");
  propsGrid.className = "adder-props-grid";

  // layout via CSS rules above
  Object.entries(spec).forEach(([name, def])=>{
    const wrap = document.createElement("div");
    wrap.className = "form-group";
    wrap.dataset.prop = name;

    const lab = document.createElement("label");
    lab.textContent = name;

    let input;
    if (def.type === "select") {
      input = document.createElement("select");
      input.className = "select";
      input.required = true;
      const ph = document.createElement("option");
      ph.value = ""; ph.textContent = `Select ${name.toLowerCase()}`; ph.disabled = true; ph.selected = true;
      input.appendChild(ph);
      def.options.forEach(opt=>{
        const o = document.createElement("option");
        o.value = opt; o.textContent = opt;
        input.appendChild(o);
      });

      if (name === "Relation") {
        input.addEventListener("change", ()=>{
          toggleAdderValueVisibility(group, field);
        });
      }
    } else {
      input = document.createElement("input");
      input.className = "input";
      input.type = def.type || "text";
      if (def.placeholder) input.placeholder = def.placeholder;
      if (def.min !== undefined) input.min = def.min;
      if (def.step !== undefined) input.step = def.step;
      input.required = true;
    }

    input.dataset.adderProp = name;
    wrap.appendChild(lab);
    wrap.appendChild(input);
    propsGrid.appendChild(wrap);
  });

  host.appendChild(propsGrid);
  toggleAdderValueVisibility(group, field);
}

function toggleAdderValueVisibility(group, field){
  const relSel = group.querySelector('.adder-props [data-adder-prop="Relation"]');
  const valueWrap = Array.from(group.querySelectorAll('.adder-props .form-group')).find(el=>el.dataset.prop === "Value");
  if (!relSel || !valueWrap) return;

  const valueInput = valueWrap.querySelector("input, select");
  const noValueNeeded = field === "Tag" && (relSel.value === "exists" || relSel.value === "doesn't exist");

  if (noValueNeeded) {
    valueWrap.style.display = "none";
    if (valueInput) {
      valueInput.required = false;
      valueInput.disabled = true;
      valueInput.value = "";
    }
  } else {
    valueWrap.style.display = "";
    if (valueInput) {
      valueInput.disabled = false;
      valueInput.required = true;
    }
  }
}

function readAdderProps(group, field){
  const spec = schema[field].props;
  const values = {};
  let ok = true;

  Object.keys(spec).forEach(name=>{
    const el = group.querySelector(`.adder-props [data-adder-prop="${name}"]`);
    if (!el) return;

    const wrap = el.closest(".form-group");
    const hidden = wrap && wrap.style.display === "none";
    if (el.disabled || hidden) return;

    const v = String(el.value || "").trim();
    if (el.required && !v) {
      el.reportValidity();
      ok = false;
      return;
    }
    if (v) values[name] = v;
  });

  return { ok, values };
}

function resetAdderProps(group, field){
  const spec = schema[field].props;
  Object.keys(spec).forEach(name=>{
    const el = group.querySelector(`.adder-props [data-adder-prop="${name}"]`);
    if (!el) return;
    if (el.tagName === "SELECT") {
      if (el.firstElementChild && el.firstElementChild.disabled) el.value = "";
      else el.selectedIndex = 0;
    } else {
      el.value = "";
    }
  });
  toggleAdderValueVisibility(group, field);
}
  function scrollToIndex(idx){
    if (!jsonMeasure || !filtersOutput) return;
    syncMirrorStyles();
    const text = filtersOutput.value;
    const before = esc(text.slice(0, idx));
    const after  = esc(text.slice(idx));
    jsonMeasure.innerHTML = `${before}<span id="__marker__">.</span>${after}`;
    const marker = document.getElementById("__marker__");
    if (!marker) return;

    const lh = numericLineHeight(filtersOutput);
    const markerY = marker.offsetTop; // already inside mirror padding
    const viewTop = filtersOutput.scrollTop;
    const viewBot = viewTop + filtersOutput.clientHeight;

    if (markerY < viewTop + lh) {
      filtersOutput.scrollTop = Math.max(0, markerY - lh);
    } else if (markerY > viewBot - lh) {
      filtersOutput.scrollTop = markerY - (filtersOutput.clientHeight - lh);
    }
  }

  function showDotAtIndex(idx){
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

    const top =
      filtersOutput.offsetTop +
      marker.offsetTop -
      filtersOutput.scrollTop +
      (lh/2) - 4; // center 8px

    const left =
      filtersOutput.offsetLeft +
      Math.max(10, padLeft * 0.6) - 4;

    jsonGutter.innerHTML = "";
    const dot = document.createElement("div");
    dot.className = "dot";
    dot.style.top  = `${Math.round(top)}px`;
    dot.style.left = `${Math.round(left)}px`;
    jsonGutter.appendChild(dot);

    lastErrorIndex = idx;
  }

  function resyncDot(){ if (lastErrorIndex == null) return; showDotAtIndex(lastErrorIndex); }
  window.addEventListener("resize", resyncDot);
  filtersOutput?.addEventListener("scroll", resyncDot);

  function indexOfLineStart(text, targetLine){
    if (targetLine <= 1) return 0;
    let idx = 0, line = 1;
    while (line < targetLine && idx < text.length) {
      const nl = text.indexOf("\n", idx);
      if (nl === -1) return text.length;
      idx = nl + 1; line++;
    }
    return idx;
  }

  // clear visuals on any edit
  filtersOutput?.addEventListener("input", () => { clearGutterDot(); clearJsonError(); });

  // toggle read-only
  if (editToggle && filtersOutput) {
    filtersOutput.readOnly = true;
    editToggle.addEventListener("change", () => {
      filtersOutput.readOnly = !editToggle.checked;
      filtersOutput.classList.toggle("editable", editToggle.checked);
      // Remove glow animation when user interacts with the toggle
      editToggle.closest('.toggle').classList.remove('first-action-glow');
    });
  }

  /** ========= JSON prechecks ========= */
  function detectCommonJsonIssues(fullText){
    const lines = fullText.split(/\r?\n/);

    // A) top-level "filters" must be quoted if present
    const firstIdx = lines.findIndex(l => l.trim().length > 0);
    if (firstIdx !== -1) {
      const firstLine = lines[firstIdx];
      if (/^\s*filters\s*:/.test(firstLine)) {
        return { line:firstIdx+1, message:'Top-level key must be quoted. Use `"filters": [ … ]` or paste just `[ … ]`.' };
      }
    }

    // B) comments (outside strings)
    const cLine = findFirstCommentLine(fullText);
    if (cLine !== null) return { line: cLine+1, message: "Comments are not allowed in JSON. Remove `//` or `/* … */`." };

    // C) trailing comma
    const tLine = findTrailingCommaLine(fullText);
    if (tLine !== null) return { line: tLine+1, message: "Trailing comma before closing bracket/brace. Remove the last comma." };

    return null;
  }

  function findFirstCommentLine(text){
    let inString=false, escp=false, inBlock=false, line=0;
    for (let i=0;i<text.length;i++){
      const ch=text[i], nx=text[i+1];
      if (ch==="\n") line++;
      if (inBlock){ if (ch==="*" && nx==="/"){ inBlock=false; i++; } continue; }
      if (inString){ if (escp) escp=false; else if (ch==="\\") escp=true; else if (ch==='"') inString=false; continue; }
      if (ch==="/" && nx==="/") return line;
      if (ch==="/" && nx==="*"){ inBlock=true; return line; }
      if (ch==='"') inString=true;
    }
    return null;
  }

  function findTrailingCommaLine(text){
    let inString=false, escp=false, inBlock=false, line=0;
    for (let i=0;i<text.length;i++){
      const ch=text[i], nx=text[i+1];
      if (ch==="\n") line++;
      if (inBlock){ if (ch==="*" && nx==="/"){ inBlock=false; i++; } continue; }
      if (inString){ if (escp) escp=false; else if (ch==="\\") escp=true; else if (ch==='"') inString=false; continue; }
      if (ch==="/" && nx==="/"){ while(i<text.length && text[i] !== "\n") i++; continue; }
      if (ch==="/" && nx==="*"){ inBlock=true; continue; }
      if (ch==='"'){ inString=true; continue; }
      if (ch === ","){
        let j=i+1;
        while (j<text.length){
          const c=text[j];
          if (c===" "||c==="\t"||c==="\r"||c==="\n"){ j++; continue; }
          if (c==="]"||c==="}") return line;
          break;
        }
      }
    }
    return null;
  }

  /** ========= Groups and nodes ========= */
  function getGroups(){ return Array.from(nodes.querySelectorAll(".group")); }

  function createRemoveButtonFor(group){
    const btn = document.createElement("button");
    btn.className = "btn btn-sm";
    btn.textContent = "Remove group";
    btn.addEventListener("click", () => {
      group.remove();
      const remaining = getGroups();
      currentGroup = remaining.length ? remaining[remaining.length - 1] : null;
      if (currentGroup) setActiveGroup(currentGroup);
      renumberGroups();
      refreshCodeSample();
            refreshEmptyState();
    });
    return btn;
  }

function createGroup(idx){
  const group = document.createElement("div"); group.className="group";

  const header = document.createElement("div"); header.className="group-header";
  const title = document.createElement("div"); title.className="group-title"; title.textContent=`Condition ${idx}`;
  const count = document.createElement("div"); count.className="group-count"; count.textContent="(0 items)";
  const actions = document.createElement("div"); actions.className="group-actions";
  header.appendChild(title); header.appendChild(count); header.appendChild(actions);

  const body = document.createElement("div"); body.className="group-body";

  // Collapsible inline adder
  const adder = document.createElement("div");
  adder.className = "group-adder";
  adder.innerHTML = `
    <div class="adder-collapsed">
      <span class="plus">+</span>
      <span>Add condition</span>
    </div>

    <div class="adder-panel">
      <div class="adder-form adder--two">
        <div>
          <label>Field</label>
          <select class="select adder-field"></select>
        </div>
        <div class="adder-props"></div>
      </div>
      <div class="adder-actions">
        <button type="button" class="btn btn-sm adder-cancel">Cancel</button>
        <button type="button" class="btn btn-sm adder-add-btn">Add to this condition</button>
      </div>
    </div>
  `;

  group.appendChild(header);
  group.appendChild(body);
  group.appendChild(adder);

  // click to set active
  group.addEventListener("click",(e)=>{
    if (e.target.closest(".group-actions")) return;
    setActiveGroup(group); currentGroup=group;
  });

  // hydrate the adder
  initGroupAdder(group);

  return group;
}

// -- Delegated handlers for Add condition UI (works for all current/future groups)
nodes.addEventListener("click", (e) => {
  const collapsed = e.target.closest(".adder-collapsed");
  if (collapsed) {
    const group = collapsed.closest(".group");
    if (group) {
      group.classList.add("open");
      const sel = group.querySelector(".adder-field");
      if (sel) sel.focus();
    }
    // Remove glow animation when user interacts with the button
    collapsed.classList.remove('first-action-glow');
    e.stopPropagation();
    return;
  }

  const cancel = e.target.closest(".adder-cancel");
  if (cancel) {
    const group = cancel.closest(".group");
    if (group) group.classList.remove("open");
    e.stopPropagation();
    return;
  }

  const addBtn = e.target.closest(".adder-add-btn");
  if (addBtn) {
    const group = addBtn.closest(".group");
    if (!group) return;

    const sel = group.querySelector(".adder-field");
    if (!sel) return;

    const field = sel.value;
    const read = readAdderProps(group, field);

    // validation
    if (!read.ok) {
      group.classList.add("open");
      const firstInvalid = group.querySelector('.adder-props [data-adder-prop]:invalid');
      if (firstInvalid) firstInvalid.focus();
      return;
    }

    // route to proper group (tag auto-split vs. unique fields)
    let target;
    if (field === "Tag") {
      const relApi = REL_MAP[read.values?.Relation || ""] || "=";
      const incoming = {
        field: "tag",
        key: String(read.values.Key ?? ""),
        relation: relApi,
        value: read.values.Value != null ? String(read.values.Value) : undefined
      };
      target = findTargetGroupForTag(incoming, group);
    } else {
      target = findTargetGroupFor(field, group);
    }

    const node = createNodeInGroup(field, read.values, target);
    node.scrollIntoView({ behavior: "smooth", block: "center" });

    resetAdderProps(group, field);
    group.classList.remove("open");
    refreshCodeSample();
            refreshEmptyState();

    e.stopPropagation();
  }
});

  function setActiveGroup(group){ getGroups().forEach(g=>g.classList.remove("active")); if (group) group.classList.add("active"); }
  function updateGroupCount(group){ const n = group.querySelectorAll(".group-body .node").length; group.querySelector(".group-count").textContent=`(${n} item${n===1?"":"s"})`; }

  function renumberGroups(){
    const groups = getGroups();
    groups.forEach((g,i)=>{
      const title=g.querySelector(".group-title"); if (title) title.textContent=`Condition ${i+1}`;
      const actions=g.querySelector(".group-actions");
      if (!actions) return;
      const existing = Array.from(actions.children).find(c=>c.matches("button.btn.btn-sm"));

      if (i===0) {
        // hide remove on first group
        if (existing) existing.remove();
      } else {
        if (!existing) actions.appendChild(createRemoveButtonFor(g));
      }
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

  /** ========= Rules: placement logic ========= */

  function normRel(r){
    if (!r) return "";
    const s=String(r).toLowerCase();
    if (s==="="||s==="is") return "=";
    if (s==="!="||s==="is not") return "!=";
    if (s==="exists") return "exists";
    if (s==="not_exists"||s==="doesn't exist"||s==="does not exist") return "not_exists";
    if (s===">"||s.includes("greater")) return ">";
    if (s==="<"||s.includes("less")) return "<";
    if (s.includes("time_elapsed_gt") || (s.includes("time elapsed") && s.includes("greater"))) return "time_elapsed_gt";
    if (s.includes("time_elapsed_lt") || (s.includes("time elapsed") && s.includes("less"))) return "time_elapsed_lt";
    return s;
  }
  function isTagFilter(obj){ return (obj?.field||"").toLowerCase()==="tag"; }
  function tagKeyOf(obj){ return (obj?.key ?? "").toString(); }

  // Tags: same key rules
// Tags: same-key routing with range-feasibility checks
function findTargetGroupForTag(incoming, preferredGroup) {
  // incoming: { field:'tag', key, relation, value? }
  const groups = getGroups();
  let target = preferredGroup || groups[groups.length - 1] || null;

  if (!target) {
    target = createGroup(1);
    nodes.appendChild(target);
    renumberGroups();
    setActiveGroup(target);
    currentGroup = target;
  }

  const key = (incoming.key ?? "").toString();
  const rel = normRel(incoming.relation);
  const val = incoming.value != null ? String(incoming.value) : null;

  // All existing nodes for this key in the target group
  const sameKeyNodes = Array.from(target.querySelectorAll('[data-field="tag"]'))
    .filter(n => (n.dataset.key || "") === key)
    .map(n => ({ rel: normRel(n.dataset.relation), val: n.dataset.value ?? null }));

  // If none yet, we can try to place it — but still validate ranges when rel is a range
  if (sameKeyNodes.length === 0) {
    if (rel === ">" || rel === "<" || rel === "time_elapsed_gt" || rel === "time_elapsed_lt") {
      // Single bound always OK if numeric; if not numeric, move to a new group for safety
      if (!isNumeric(val)) return createNewGroupAfterLast();
    }
    return target;
  }

  // Quick flags
  const hasIs        = sameKeyNodes.some(x => x.rel === "=");
  const hasNotExists = sameKeyNodes.some(x => x.rel === "not_exists");
  const hasExists    = sameKeyNodes.some(x => x.rel === "exists");

  // Helper: build feasibility against a list + the incoming value
  function feasibleAfterAdding(list, kind /* 'num' or 'time' */) {
    const lowers = [];
    const uppers = [];

    for (const x of list) {
      if (kind === "num") {
        if (x.rel === ">" && isNumeric(x.val)) lowers.push(parseFloat(x.val));
        if (x.rel === "<" && isNumeric(x.val)) uppers.push(parseFloat(x.val));
      } else {
        if (x.rel === "time_elapsed_gt" && isNumeric(x.val)) lowers.push(parseFloat(x.val));
        if (x.rel === "time_elapsed_lt" && isNumeric(x.val)) uppers.push(parseFloat(x.val));
      }
    }

    let maxLower = lowers.length ? Math.max(...lowers) : null;
    let minUpper = uppers.length ? Math.min(...uppers) : null;

    if (maxLower != null && minUpper != null) {
      return maxLower < minUpper; // strictly less is feasible
    }
    return true; // only one side present => feasible
  }

  // 1) Equality logic for same key
  if (rel === "=") {
    if (hasIs) {
      const diffVal = sameKeyNodes.find(x => x.rel === "=" && x.val !== val);
      if (diffVal) return createNewGroupAfterLast(); // conflicting equalities
      return target; // same value equality again is fine (dedupe elsewhere if desired)
    }
    if (hasNotExists || hasExists) return createNewGroupAfterLast();
    // With only comparisons (>, <, time_elapsed_*), we separate equality for clarity
    return createNewGroupAfterLast();
  }

  // 2) Exists vs Not exists for same key
  if (rel === "exists") {
    if (hasNotExists || hasIs) return createNewGroupAfterLast();
    return target;
  }
  if (rel === "not_exists") {
    // cannot mix with any other relation for same key
    return createNewGroupAfterLast();
  }

  // 3) Equality already present and incoming is some other relation -> split
  if (hasIs) return createNewGroupAfterLast();

  // 4) Numeric comparisons for same key: allow multiple but enforce feasibility
  if (rel === ">" || rel === "<") {
    if (!isNumeric(val)) return createNewGroupAfterLast(); // non-numeric bound — separate to be safe

    // Check feasibility including the incoming comparison
    const combined = sameKeyNodes.concat([{ rel, val }]);
    if (!feasibleAfterAdding(combined, "num")) return createNewGroupAfterLast();
    return target;
  }

  // 5) time_elapsed_* comparisons for same key: same feasibility rule on seconds
  if (rel === "time_elapsed_gt" || rel === "time_elapsed_lt") {
    if (!isNumeric(val)) return createNewGroupAfterLast();

    const combined = sameKeyNodes.concat([{ rel, val }]);
    if (!feasibleAfterAdding(combined, "time")) return createNewGroupAfterLast();
    return target;
  }

  // 6) "is not" is always fine (can be multiple) unless equality exists (handled above)
  if (rel === "!=") {
    return target;
  }

  // default
  return target;

  function createNewGroupAfterLast() {
    const g = createGroup(groups.length + 1);
    nodes.appendChild(g);
    renumberGroups();
    setActiveGroup(g);
    currentGroup = g;
    return g;
  }

  function isNumeric(v) {
    if (v == null) return false;
    const n = Number(v);
    return Number.isFinite(n);
  }
}

  // Non-tag fields: allow multiple "is not" in same group; anything else duplicates → new group
  const UNIQUE_FIELDS = new Set([
    "country","language","appversion","sessiontime","sessioncount","firstsession","lastsession","location"
  ]);

  function findTargetGroupFor(fieldName, preferredGroup){
    const field = fieldName.toLowerCase();
    const groups = getGroups();
    let target = preferredGroup || groups[groups.length - 1] || null;

    if (!target) {
      target = createGroup(1);
      nodes.appendChild(target);
      renumberGroups();
      setActiveGroup(target);
      currentGroup = target;
    }

    if (!UNIQUE_FIELDS.has(field)) return target;

    // count existing for this field, and look at relations
    const existingNodes = Array.from(target.querySelectorAll(`[data-field="${CSS.escape(field)}"]`));
    if (existingNodes.length === 0) return target;

    // if incoming relation is "is not", allow multiple "is not" rules to co-exist
    const relSel = document.getElementById("prop-Relation");
    const incomingRelWord = relSel ? relSel.value : ""; // best effort from UI
    const incomingRel = normRel(REL_MAP[incomingRelWord] || incomingRelWord);

    if (incomingRel === "!=") {
      // verify that every existing is also "!="
      const allExistingAreNotEq = existingNodes.every(n => normRel(n.dataset.relation || "") === "!=");
      if (allExistingAreNotEq) return target;
      // otherwise separate
      return createNew();
    }

    // any other duplicate field in same group → new group
    return createNew();

    function createNew(){
      const g = createGroup(groups.length + 1);
      nodes.appendChild(g);
      renumberGroups();
      setActiveGroup(g);
      currentGroup = g;
      return g;
    }
  }

  /** ========= Node creation and export/import ========= */
  function createNodeInGroup(field, values, group){
    const body=group.querySelector(".group-body");
    const node=document.createElement("div"); node.className="node node-ok";
    node.__payload={field, values};

    // dataset markers for routing
    const lower = field.toLowerCase();
    node.dataset.field = lower;
    if (field === "Tag") {
      node.dataset.key = values.Key ?? "";
      node.dataset.relation = (values.Relation ?? "").toLowerCase();
      node.dataset.value = values.Value ?? "";
    } else {
      // store relation where applicable for non-tag routing checks
      node.dataset.relation = (values.Relation ?? "").toLowerCase();
    }

    node.appendChild(nodeContent(field, values));

    const remove=document.createElement("button");
    remove.className="btn btn-sm remove";
    remove.textContent="Remove";
    remove.addEventListener("click",()=>{
            node.remove(); 
            updateGroupCount(group); 
            refreshCodeSample(); 
            refreshEmptyState();
    });
    node.appendChild(remove);
    body.appendChild(node); updateGroupCount(group); return node;
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
    const ui = INV_FIELD_MAP[api];
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
        if (String(entry.operator).toUpperCase()==="OR"){
          const g = createGroup(getGroups().length+1); nodes.appendChild(g); group=g;
        }
        return;
      }
      const parsed=filterToFieldValues(entry||{}); if (!parsed) return;
      const relWord=parsed.values?.Relation||"";

      if (parsed.field === "Tag") {
        const relApi = REL_MAP[relWord] || "=";
        const incoming = {
          field: "tag",
          key: String(parsed.values.Key ?? ""),
          relation: relApi,
          value: parsed.values.Value != null ? String(parsed.values.Value) : undefined
        };
        group = findTargetGroupForTag(incoming, group);
        createNodeInGroup(parsed.field, parsed.values, group);
      } else {
        group = findTargetGroupFor(parsed.field, group);
        createNodeInGroup(parsed.field, parsed.values, group);
      }
    });

    renumberGroups();
    const last=getGroups()[getGroups().length-1]; setActiveGroup(last); currentGroup=last;
    refreshCodeSample();
    refreshEmptyState();
  }

  /** ========= Code sample output ========= */
  function refreshCodeSample(){
    if (!filtersOutput) return;
    const filters = buildFiltersFromDom();

    // Strip stray leading/trailing ORs defensively
    while (filters.length && filters[0]?.operator) filters.shift();
    while (filters.length && filters[filters.length-1]?.operator) filters.pop();

    const json = JSON.stringify({filters}, null, 2);
    const stripped = json.replace(/^{\n?/, "").replace(/}\n?$/, "").trim();
    filtersOutput.value = stripped;
  }

  /** ========= Events ========= */
    if (fieldSel){ 
        fieldSel.addEventListener("change", ()=>renderProps(fieldSel.value));
    }
if (newConditionBtn) {
  newConditionBtn.addEventListener("click", ()=>{
    const g=createGroup(getGroups().length+1);
    nodes.appendChild(g);
    renumberGroups(); setActiveGroup(g); currentGroup=g;
    g.scrollIntoView({behavior:"smooth", block:"center"});
    refreshCodeSample();
  });
}
  // newConditionBtn.addEventListener("click", ()=>{
  //   const g=createGroup(getGroups().length+1); nodes.appendChild(g);
  //   renumberGroups(); setActiveGroup(g); currentGroup=g; g.scrollIntoView({behavior:"smooth", block:"center"});
  //   refreshCodeSample();
  // });

if (form) {
  form.addEventListener("submit", (e)=>{
    e.preventDefault();
    const field=fieldSel.value;
    const payload=readProps(field);
    if (!payload.ok) return;

    let target;
    if (field === "Tag") {
      const relApi = REL_MAP[payload.values?.Relation || ""] || "=";
      const incoming = {
        field:"tag",
        key:String(payload.values.Key ?? ""),
        relation:relApi,
        value: payload.values.Value != null ? String(payload.values.Value) : undefined
      };
      target = findTargetGroupForTag(incoming, currentGroup || getGroups().slice(-1)[0]);
    } else {
      target = findTargetGroupFor(field, currentGroup || getGroups().slice(-1)[0]);
    }

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
    refreshCodeSample();
    refreshEmptyState();
  });
}

  copyBtn?.addEventListener("click", async ()=>{
    filtersOutput.select(); filtersOutput.setSelectionRange(0, filtersOutput.value.length);
    try{
      await navigator.clipboard.writeText(filtersOutput.value);
      const old=copyBtn.textContent; copyBtn.textContent="Copied"; setTimeout(()=>copyBtn.textContent=old, 900);
    }catch{}
  });

  // Apply JSON
  if (applyBtn && filtersOutput) {
    applyBtn.addEventListener("click", () => {
      clearJsonError();
      clearGutterDot();

      const fullText = filtersOutput.value;
      const raw = fullText.trim();
      if (!raw) {
        // If JSON is empty, clear all filters and show empty state
        nodes.innerHTML = "";
        currentGroup = null;
        const g = createGroup(1);
        nodes.appendChild(g);
        setActiveGroup(g);
        currentGroup = g;
        renumberGroups();
        refreshCodeSample();
        refreshEmptyState();
        return;
      }

      // Pre-checks
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
      clearGutterDot();
      clearJsonError();
    });
  }

  // initial render
    if(fieldSel) {
  renderProps(fieldSel.value);
    }
  refreshCodeSample();

  /** ========= Props controls ========= */
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
        function applyTwoColSpan(formEl) {
            const groups = [...formEl.querySelectorAll('.form-group')];
            groups.forEach(g => g.classList.remove('span-all'));
            if (groups.length === 3) groups[2].classList.add('span-all');
        }

        // after rendering your props:
        const formEl = group.querySelector('.adder-form');
        if (formEl) applyTwoColSpan(formEl);
    }


function refreshEmptyState() {
  const empty = document.getElementById('emptyState');
  if (!empty) return;

  // Count all filter nodes across all groups
  const totalNodes = document.querySelectorAll('.group .node').length;

  // Show when there are NO nodes at all, otherwise hide
  empty.style.display = totalNodes === 0 ? 'block' : 'none';
  
  // Manage the glow animation on the first "+ Add Condition" button
  const firstAddButton = document.querySelector('.group-adder .adder-collapsed');
  if (firstAddButton) {
    if (totalNodes === 0) {
      firstAddButton.classList.add('first-action-glow');
    } else {
      firstAddButton.classList.remove('first-action-glow');
    }
  }
  
  // Manage the glow animation on the "Edit" toggle
  const editToggle = document.querySelector('.toggle');
  if (editToggle) {
    if (totalNodes === 0) {
      editToggle.classList.add('first-action-glow');
    } else {
      editToggle.classList.remove('first-action-glow');
    }
  }
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
refreshEmptyState()
});
