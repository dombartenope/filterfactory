document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("filterForm");
  const fieldSel = document.getElementById("field");
  const propsBox = document.getElementById("props");
  const nodes = document.getElementById("nodes");
  const newConditionBtn = document.getElementById("newConditionBtn");
  const copyBtn = document.getElementById("copyCodeBtn");
  const filtersOutput = document.getElementById("filtersOutput");

  // -----------------------
  // Schema from your spec
  // -----------------------
  const schema = {
    Country: {
      props: {
        Relation: { type: "select", options: ["is", "is not"] },
        Value: { type: "text", placeholder: "United States" }
      }
    },
    Tag: {
      props: {
        Key: { type: "text", placeholder: "plan, tier, cohort" },
        Relation: { type: "select", options: ["is", "is not", "exists", "doesn't exist", "is greater than", "is less than", "time elapsed since is greater than", "time elapsed since is less than"] },
        Value: { type: "text", placeholder: "pro, gold, vip" }
      }
    },
    Location: {
      props: {
        Radius: { type: "number", placeholder: "km", min: 0 },
        Lat: { type: "number", step: "any", placeholder: "37.7749" },
        Long: { type: "number", step: "any", placeholder: "-122.4194" }
      }
    },
    AppVersion: {
      props: {
        Relation: { type: "select", options: ["is", "is not", "is greater than", "is less than"] },
        Value: { type: "text", placeholder: "1.2.3" }
      }
    },
    Language: {
      props: {
        Relation: { type: "select", options: ["is", "is not"] },
        Value: { type: "text", placeholder: "en, es, fr" }
      }
    },
    SessionTime: {
      props: {
        Relation: { type: "select", options: ["is greater than", "is less than"] },
        Value: { type: "number", placeholder: "seconds", min: 0 }
      }
    },
    SessionCount: {
      props: {
        Relation: { type: "select", options: ["is greater than", "is less than"] },
        Value: { type: "number", placeholder: "count", min: 0 }
      }
    },
    FirstSession: {
      props: {
        Relation: { type: "select", options: ["is greater than", "is less than"] },
        HoursAgo: { type: "number", placeholder: "hours", min: 0 }
      }
    },
    LastSession: {
      props: {
        Relation: { type: "select", options: ["is greater than", "is less than"] },
        HoursAgo: { type: "number", placeholder: "hours", min: 0 }
      }
    }
  };

  // -----------------------------------
  // Relation and field key translations
  // -----------------------------------
  const REL_MAP = {
    "is": "=",
    "is not": "!=",
    "is greater than": ">",
    "is less than": "<",
    "time elapsed since is greater than": "time_elapsed_gt",
    "time elapsed since is less than": "time_elapsed_lt",
    "exists": "exists",
    "doesn't exist": "not_exists"
  };

  const FIELD_MAP = {
    Country: "country",
    Tag: "tag",
    Location: "location",
    AppVersion: "app_version",
    Language: "language",
    SessionTime: "session_time",
    SessionCount: "session_count",
    FirstSession: "first_session",
    LastSession: "last_session"
  };

  // -----------------------
  // Populate field select
  // -----------------------
  Object.keys(schema).forEach(key => {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = key;
    fieldSel.appendChild(opt);
  });

  // -----------------------
  // Group helpers
  // -----------------------
  let currentGroup = null;

  function getGroups() {
    return Array.from(nodes.querySelectorAll(".group"));
  }

  function createRemoveButtonFor(group) {
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

  function renumberGroups() {
    const groups = getGroups();
    groups.forEach((g, i) => {
      const title = g.querySelector(".group-title");
      if (title) title.textContent = `Condition ${i + 1}`;

      const actions = g.querySelector(".group-actions");
      if (!actions) return;

      // find any existing remove button
      const existingBtn = Array.from(actions.children).find(el => el.matches("button.btn.btn-sm"));

      if (i === 0) {
        // Condition 1 must not have a remove button
        if (existingBtn) existingBtn.remove();
      } else {
        if (!existingBtn) actions.appendChild(createRemoveButtonFor(g));
      }
    });
  }

  function createGroup(idx) {
    const group = document.createElement("div");
    group.className = "group";

    const header = document.createElement("div");
    header.className = "group-header";

    const title = document.createElement("div");
    title.className = "group-title";
    title.textContent = `Condition ${idx}`;

    const count = document.createElement("div");
    count.className = "group-count";
    count.textContent = "(0 items)";

    const actions = document.createElement("div");
    actions.className = "group-actions";

    // add a button by default, renumberGroups will hide it for Condition 1
    actions.appendChild(createRemoveButtonFor(group));

    header.appendChild(title);
    header.appendChild(count);
    header.appendChild(actions);

    const body = document.createElement("div");
    body.className = "group-body";

    group.appendChild(header);
    group.appendChild(body);

    // click to activate
    group.addEventListener("click", (e) => {
      // avoid toggling when clicking the remove button
      if (e.target.closest(".group-actions")) return;
      setActiveGroup(group);
      currentGroup = group;
    });

    return group;
  }

  function setActiveGroup(group) {
    getGroups().forEach(g => g.classList.remove("active"));
    if (group) group.classList.add("active");
  }

  function updateGroupCount(group) {
    const n = group.querySelectorAll(".group-body .node").length;
    group.querySelector(".group-count").textContent = `(${n} item${n === 1 ? "" : "s"})`;
  }

  // Ensure Condition 1 exists on load
  if (getGroups().length === 0) {
    const g = createGroup(1);
    nodes.appendChild(g);
    setActiveGroup(g);
    currentGroup = g;
  }
  renumberGroups();

  // -----------------------
  // Dynamic props UI
  // -----------------------
  function renderProps(field) {
    propsBox.innerHTML = "";
    const spec = schema[field].props;

    Object.entries(spec).forEach(([name, def]) => {
      const group = document.createElement("div");
      group.className = "form-group";
      group.dataset.prop = name;

      const label = document.createElement("label");
      label.setAttribute("for", `prop-${name}`);
      label.textContent = name;

      let input;
      if (def.type === "select") {
        input = document.createElement("select");
        input.className = "select";
        input.id = `prop-${name}`;
        input.required = true;

        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = `Select ${name.toLowerCase()}`;
        placeholder.disabled = true;
        placeholder.selected = true;
        input.appendChild(placeholder);

        def.options.forEach(opt => {
          const o = document.createElement("option");
          o.value = opt;
          o.textContent = opt;
          input.appendChild(o);
        });

        if (name === "Relation") {
          input.addEventListener("change", () => toggleValueVisibility(field));
        }
      } else {
        input = document.createElement("input");
        input.className = "input";
        input.id = `prop-${name}`;
        input.required = true;
        input.type = def.type || "text";
        if (def.placeholder) input.placeholder = def.placeholder;
        if (def.min !== undefined) input.min = def.min;
        if (def.step !== undefined) input.step = def.step;
      }

      group.appendChild(label);
      group.appendChild(input);
      propsBox.appendChild(group);
    });

    toggleValueVisibility(field);
  }

  function toggleValueVisibility(field) {
    const relSel = document.getElementById("prop-Relation");
    const valueGroup = document.querySelector('[data-prop="Value"]');
    if (!relSel || !valueGroup) return;

    const valueInput = valueGroup.querySelector("input");
    const noValueNeeded =
      field === "Tag" &&
      (relSel.value === "exists" || relSel.value === "doesn't exist");

    if (noValueNeeded) {
      valueGroup.style.display = "none";
      if (valueInput) {
        valueInput.required = false;
        valueInput.disabled = true;
        valueInput.value = "";
      }
    } else {
      valueGroup.style.display = "";
      if (valueInput) {
        valueInput.disabled = false;
        valueInput.required = true;
      }
    }
  }

  function readProps(field) {
    const spec = schema[field].props;
    const values = {};
    for (const name of Object.keys(spec)) {
      const el = document.getElementById(`prop-${name}`);
      if (!el) continue;

      const container = el.closest("[data-prop]");
      const hidden = container && container.style.display === "none";
      if (el.disabled || hidden) continue;

      const v = String(el.value || "").trim();
      if (el.required && !v) {
        el.reportValidity();
        return { ok: false };
      }
      if (v) values[name] = v;
    }
    return { ok: true, values };
  }

  // -----------------------
  // Node and code builder
  // -----------------------
  function pill(text) {
    return `<span class="node-pill">${escapeHtml(String(text))}</span>`;
  }

function nodeContent(field, values) {
  const wrap = document.createElement("div");

  const title = document.createElement("div");
  title.className = "node-title";
  title.textContent = field;
  wrap.appendChild(title);

  const meta = document.createElement("div");
  meta.className = "node-meta";

  for (const [k, v] of Object.entries(values)) {
    const label = document.createElement("span");
    label.textContent = `${k} `;
    meta.appendChild(label);

    const pill = document.createElement("span");
    pill.className = "node-pill";
    pill.textContent = String(v); // textContent prevents HTML injection
    meta.appendChild(pill);

    // small spacer
    const spacer = document.createTextNode(" ");
    meta.appendChild(spacer);
  }

  wrap.appendChild(meta);
  return wrap;
}

  function nodeToFilter(field, values) {
    const f = FIELD_MAP[field];

    if (field === "Tag") {
      const rel = REL_MAP[values.Relation];
      if (!values.Key) return null;

      if (rel === "exists" || rel === "not_exists") {
        return { field: "tag", key: String(values.Key), relation: rel };
      }
      if (rel === "time_elapsed_gt" || rel === "time_elapsed_lt") {
        return {
          field: "tag",
          key: String(values.Key),
          relation: rel,
          value: String(values.Value || "0")
        };
      }
      return {
        field: "tag",
        key: String(values.Key),
        relation: rel || "=",
        value: String(values.Value ?? "")
      };
    }

    if (field === "Location") {
      return {
        field: "location",
        lat: String(values.Lat ?? ""),
        long: String(values.Long ?? ""),
        radius: String(values.Radius ?? "")
      };
    }

    if (field === "FirstSession" || field === "LastSession") {
      return {
        field: f,
        relation: REL_MAP[values.Relation] || ">",
        hours_ago: String(values.HoursAgo ?? "")
      };
    }

    const rel = REL_MAP[values.Relation] || "=";
    const out = { field: f, relation: rel };
    if (values.Value !== undefined) out.value = String(values.Value);
    return out;
  }

function buildFiltersFromDom() {
  const groups = getGroups();
  const filters = [];

  groups.forEach((g, gi) => {
    const items = Array.from(g.querySelectorAll(".group-body .node"));
    if (items.length === 0) return;

    items.forEach((node, ni) => {
      const payload = node.__payload;
      if (!payload) return;
      const obj = nodeToFilter(payload.field, payload.values);
      if (!obj) return;

      if (gi > 0 && ni === 0) {
        // Only add OR between groups (before the first node of each group after group 0)
        filters.push({ operator: "OR" });
      }

      // Push the actual filter object
      filters.push(obj);
    });
  });

  return filters;
}

function refreshCodeSample() {
  if (!filtersOutput) return;
  const filters = buildFiltersFromDom();
  // Create string like: "filters": [ ... ]
  const json = JSON.stringify({ filters }, null, 2);
  // Strip the outer braces
  const stripped = json.replace(/^{\n?/, "").replace(/}\n?$/, "").trim();
  filtersOutput.value = stripped;
}

  // -----------------------
  // Events
  // -----------------------
  fieldSel.addEventListener("change", () => renderProps(fieldSel.value));

  newConditionBtn.addEventListener("click", () => {
    const g = createGroup(getGroups().length + 1);
    nodes.appendChild(g);
    renumberGroups();
    setActiveGroup(g);
    currentGroup = g;
    g.scrollIntoView({ behavior: "smooth", block: "center" });
    refreshCodeSample();
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const field = fieldSel.value;
    const payload = readProps(field);
    if (!payload.ok) return;

    const group = currentGroup || getGroups().slice(-1)[0];
    if (!group) return;

    const body = group.querySelector(".group-body");

    const node = document.createElement("div");
    node.className = "node node-ok";
    node.appendChild(nodeContent(field, payload.values));

    // attach structured payload for the code builder
    node.__payload = { field, values: payload.values };

    const remove = document.createElement("button");
    remove.className = "btn btn-sm remove";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      node.remove();
      updateGroupCount(group);
      refreshCodeSample();
    });

    node.appendChild(remove);
    body.appendChild(node);
    updateGroupCount(group);
    node.scrollIntoView({ behavior: "smooth", block: "center" });

    // reset current field inputs but keep field selection
    propsBox.querySelectorAll("input, select").forEach(el => {
      if (el.tagName === "SELECT") {
        if (el.firstElementChild && el.firstElementChild.disabled) el.value = "";
      } else {
        el.value = "";
      }
    });
    toggleValueVisibility(field);

    refreshCodeSample();
  });

  if (copyBtn && filtersOutput) {
    copyBtn.addEventListener("click", async () => {
      filtersOutput.select();
      filtersOutput.setSelectionRange(0, filtersOutput.value.length);
      try {
        await navigator.clipboard.writeText(filtersOutput.value);
        const old = copyBtn.textContent;
        copyBtn.textContent = "Copied";
        setTimeout(() => (copyBtn.textContent = old), 900);
      } catch {
        // noop, manual copy still possible
      }
    });
  }

  // Initial UI
  renderProps(fieldSel.value);
  refreshCodeSample();

  // -----------------------
  // Utils
  // -----------------------
  function escapeHtml(str) {
    return str.replace(/[&<>"']/g, ch => ({
      "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
    }[ch]));
  }
});
