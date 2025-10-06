document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("filterForm");
    const fieldSel = document.getElementById("field");
    const propsBox = document.getElementById("props");
    const nodes = document.getElementById("nodes");
    const newConditionBtn = document.getElementById("newConditionBtn");
    const copyBtn = document.getElementById("copyCodeBtn");
    const filtersOutput = document.getElementById("filtersOutput");
    const applyBtn = document.getElementById("applyJsonBtn");
    const jsonErrorMsg = document.getElementById("jsonErrorMsg");
    const jsonHighlights = document.getElementById("jsonHighlights");

    //Clear JSON error message if any
    let jsonHasError = false;

    function clearHighlights() {
        if (jsonHighlights) jsonHighlights.innerHTML = "";
        jsonHasError = false;
    }
    function clearJsonError() {
        jsonErrorMsg.textContent = "";
    }

    // Toggle editability
    const editToggle = document.getElementById("editJsonToggle");
    if (editToggle && filtersOutput) {
        filtersOutput.readOnly = true;
        editToggle.addEventListener("change", () => {
            filtersOutput.readOnly = !editToggle.checked;
            filtersOutput.classList.toggle("editable", editToggle.checked);
        });
    }


    // Apply JSON to rebuild UI
    if (applyBtn && filtersOutput) {
        applyBtn.addEventListener("click", () => {
            clearJsonError();
            if (jsonHighlights) jsonHighlights.innerHTML = ""; // clear any old highlights
            const raw = filtersOutput.value.trim();
            if (!raw) return;

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

                // ✅ parsed successfully → remove any previous highlight + error
                clearHighlights();
                clearJsonError();
            } catch (e) {
                // ❌ draw highlight for the error line
                jsonHasError = true;

                const match = e.message.match(/position\s(\d+)/i);
                if (match) {
                    const pos = parseInt(match[1], 10);
                    const before = filtersOutput.value.slice(0, pos);
                    const lineNum = before.split(/\r?\n/).length;

                    const lines = filtersOutput.value.split(/\r?\n/);
                    const highlighted = lines
                    .map((line, idx) =>
                        idx + 1 === lineNum ? `<mark>${line || " "}</mark>` : line
                    )
                    .join("\n");
                    if (jsonHighlights) jsonHighlights.innerHTML = highlighted;

                    jsonErrorMsg.textContent = `❌ Invalid JSON on line ${lineNum}: ${e.message}`;
                } else {
                    if (jsonHighlights) jsonHighlights.innerHTML = "";
                    jsonErrorMsg.textContent = `❌ Invalid JSON: ${e.message}`;
                }
                return;
            }
            // ✅ Valid JSON → continue
            if (!Array.isArray(arr)) {
                jsonErrorMsg.textContent =
                    '❌ Expected a JSON array or "filters": [ ... ]';
                return;
            }

            // Clean up stray ORs
            while (arr.length && arr[0]?.operator) arr.shift();
            while (arr.length && arr[arr.length - 1]?.operator) arr.pop();

            filtersToDom(arr); // ← this stays where it was before
        });
        filtersOutput.addEventListener("input", () => {
            // As soon as user types, remove any old red highlight & error text
            if (jsonHasError) {
                clearHighlights();        // remove red line highlight
                clearJsonError();         // clear the message below
            }
        });

        // Keep overlay scrolling in sync with textarea
        filtersOutput.addEventListener("scroll", () => {
            if (!jsonHighlights) return;
            jsonHighlights.scrollTop = filtersOutput.scrollTop;
            jsonHighlights.scrollLeft = filtersOutput.scrollLeft;
        });
    }

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
    const REL_MAP_INV = {
        "=": "is",
        "!=": "is not",
        ">": "is greater than",
        "<": "is less than",
        "time_elapsed_gt": "time elapsed since is greater than",
        "time_elapsed_lt": "time elapsed since is less than",
        "exists": "exists",
        "not_exists": "doesn't exist"
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
    // Create a node in a given group from field+values and attach payload
    function createNodeInGroup(field, values, group) {
        const body = group.querySelector(".group-body");

        const node = document.createElement("div");
        node.className = "node node-ok";
        node.appendChild(nodeContent(field, values));
        node.__payload = { field, values };

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
        return node;
    }

    // Per-group limits: Tag unlimited, everything else max 1
    const PER_GROUP_LIMITS = new Proxy({}, {
        get: (_, field) => (field === "Tag" ? Infinity : 1)
    });

    function countFieldInGroup(group, field) {
        return Array.from(group.querySelectorAll(".group-body .node"))
            .filter(n => n.__payload && n.__payload.field === field).length;
    }
    /** Is this relation "definitive" for conflict purposes? */
    function isDefinitiveRelation(field, relationWord) {
        // Start simple: "is" dominates other relations of the same field
        return relationWord === "is";
    }

    /** Scan a single group and add/remove conflict styles */
    function updateConflictHighlightsForGroup(group) {
        const nodesInGroup = Array.from(group.querySelectorAll(".group-body .node"));

        // Map field -> { hasDefinitive: bool, nodes: Node[] }
        const fieldMap = new Map();
        nodesInGroup.forEach(n => {
            const p = n.__payload;
            if (!p) return;

            // ⬇️ Skip Tag entirely
            if (p.field === "Tag") return;

            const list = fieldMap.get(p.field) || { hasDefinitive: false, nodes: [] };
            list.nodes.push(n);
            const relWord = p.values?.Relation || "";
            if (isDefinitiveRelation(p.field, relWord)) list.hasDefinitive = true;
            fieldMap.set(p.field, list);
        });

        // Apply classes based on map (unchanged)
        fieldMap.forEach(({ hasDefinitive, nodes }) => {
            if (!hasDefinitive || nodes.length <= 1) {
                nodes.forEach(n => n.classList.remove("node-conflict"));
                return;
            }
            nodes.forEach(n => {
                const relWord = n.__payload?.values?.Relation || "";
                const conflicted = !isDefinitiveRelation(n.__payload.field, relWord);
                n.classList.toggle("node-conflict", conflicted);
            });
        });

        // Ensure warning pill exists; it will only show on .node-conflict
        nodesInGroup.forEach(n => {
            if (n.__payload?.field === "Tag") return; // ⬅️ don't add warnings to Tag nodes
            let warn = n.querySelector(".node-warning");
            if (!warn) {
                warn = document.createElement("span");
                warn.className = "node-warning";
                warn.textContent = "overridden by 'is' in this group";
                const meta = n.querySelector(".node-meta") || n.firstElementChild || n;
                meta.appendChild(warn);
            }
        });
    }

    /** Run for all groups */
    function updateAllConflictHighlights() {
        getGroups().forEach(updateConflictHighlightsForGroup);
    }

    // Decide which group to add to; create a new one if the limit would be exceeded
    function findTargetGroupFor(field, preferredGroup) {
        const limit = PER_GROUP_LIMITS[field];
        const groups = getGroups();
        const fallback = groups[groups.length - 1] || null;
        const chosen = preferredGroup || fallback;

        if (!chosen) {
            // No groups yet; create Condition 1
            const g = createGroup(1);
            nodes.appendChild(g);
            renumberGroups();
            setActiveGroup(g);
            currentGroup = g;
            return g;
        }

        // If adding this field would exceed the limit, create a new group
        if (countFieldInGroup(chosen, field) >= limit) {
            const g = createGroup(groups.length + 1);
            nodes.appendChild(g);
            renumberGroups();
            setActiveGroup(g);
            currentGroup = g;
            return g;
        }

        return chosen;
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

    // Tag is unlimited in a group; some fields allow multiple when Relation is "is not"
    // Fields that may repeat in a group when Relation is "is not"
    const MULTI_NEGATION_FIELDS = new Set(["Country", "Language", "AppVersion"]);

    /**
 * Whether a field may appear multiple times in the same group,
 * given the human-readable relation word from the UI/JSON.
 *
 * Rules:
 * - Tag: unlimited
 * - Any field with "is greater than" or "is less than": unlimited
 * - Country/Language/AppVersion with "is not": unlimited
 * - Everything else: max 1 per group
 */
    function allowsMultipleInGroup(field, relationWord) {
        if (field === "Tag") return true;

        if (relationWord === "is greater than" || relationWord === "is less than") {
            return true; // new rule: gt/lt ignore max limits for all fields
        }

        if (relationWord === "is not" && MULTI_NEGATION_FIELDS.has(field)) {
            return true; // multiple negations allowed for these specific fields
        }

        return false; // otherwise, cap at 1 per group
    }

    function countFieldInGroup(group, field) {
        return Array.from(group.querySelectorAll(".group-body .node"))
            .filter(n => n.__payload && n.__payload.field === field).length;
    }

    /**
 * Decide which group to add to; create a new group if the per-group rule
 * would be violated. relationWord is the UI word, e.g., "is", "is not"
 */
    function findTargetGroupFor(field, relationWord, preferredGroup) {
        const groups = getGroups();
        const fallback = groups[groups.length - 1] || null;
        const chosen = preferredGroup || fallback;

        // ensure at least one group exists
        if (!chosen) {
            const g = createGroup(1);
            nodes.appendChild(g);
            renumberGroups();
            setActiveGroup(g);
            currentGroup = g;
            return g;
        }

        // If multiples are NOT allowed and we already have one, create a new group
        if (!allowsMultipleInGroup(field, relationWord) &&
            countFieldInGroup(chosen, field) >= 1) {
            const g = createGroup(groups.length + 1);
            nodes.appendChild(g);
            renumberGroups();
            setActiveGroup(g);
            currentGroup = g;
            return g;
        }

        return chosen;
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
            pill.textContent = String(v);
            meta.appendChild(pill);

            meta.appendChild(document.createTextNode(" "));
        }

        // placeholder for warning pill (created dynamically if needed)
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

    function filterToFieldValues(filterObj) {
        // Decide field by "field" key
        const apiField = String(filterObj.field || "").toLowerCase();

        // Tag
        if (apiField === "tag") {
            const key = filterObj.key ?? filterObj.tag_key; // some users paste tag_key
            const relWord = REL_MAP_INV[String(filterObj.relation || "")] || "is";
            const values = { Key: String(key ?? "") };

            // exists / not_exists have no Value
            if (filterObj.relation === "exists" || filterObj.relation === "not_exists") {
                values.Relation = relWord;
                return { field: "Tag", values };
            }

            // time elapsed variants
            if (filterObj.relation === "time_elapsed_gt" || filterObj.relation === "time_elapsed_lt") {
                values.Relation = relWord;
                values.Value = String(filterObj.value ?? "");
                return { field: "Tag", values };
            }

            // normal equals/gt/lt etc
            values.Relation = relWord;
            values.Value = String(filterObj.value ?? "");
            return { field: "Tag", values };
        }

        // Location
        if (apiField === "location") {
            return {
                field: "Location",
                values: {
                    Radius: String(filterObj.radius ?? ""),
                    Lat: String(filterObj.lat ?? ""),
                    Long: String(filterObj.long ?? "")
                }
            };
        }

        // First/Last session
        if (apiField === "first_session" || apiField === "last_session") {
            const field = apiField === "first_session" ? "FirstSession" : "LastSession";
            return {
                field,
                values: {
                    Relation: REL_MAP_INV[String(filterObj.relation || ">")] || "is greater than",
                    HoursAgo: String(filterObj.hours_ago ?? "")
                }
            };
        }

        // Country, Language, AppVersion, SessionTime, SessionCount
        // Map API field back to our UI field name
        const FIELD_MAP_INV = {
            country: "Country",
            language: "Language",
            app_version: "AppVersion",
            session_time: "SessionTime",
            session_count: "SessionCount"
        };

        const uiField = FIELD_MAP_INV[apiField];
        if (uiField) {
            return {
                field: uiField,
                values: {
                    Relation: REL_MAP_INV[String(filterObj.relation || "=")] || "is",
                    Value: String(filterObj.value ?? "")
                }
            };
        }

        // Unknown field, skip by returning null
        return null;
    }

    function buildFiltersFromDom() {
        const groups = getGroups();
        const filters = [];

        groups.forEach((g, gi) => {
            const items = Array.from(g.querySelectorAll(".group-body .node"));
            if (items.length === 0) return;

            // Skip if group 0 (Condition 1) is empty but a later group exists
            if (gi > 0 && filters.length === 0) {
                // Don’t prepend an OR if no valid filters exist yet
            } else if (gi > 0 && items.length > 0) {
                // Add OR before each new valid group after group 0
                filters.push({ operator: "OR" });
            }

            items.forEach((node) => {
                const payload = node.__payload;
                if (!payload) return;
                const obj = nodeToFilter(payload.field, payload.values);
                if (!obj) return;
                filters.push(obj);
            });
        });

        return filters;
    }

    function filtersToDom(filters) {
        // Clear and start fresh
        nodes.innerHTML = "";
        currentGroup = null;

        // Always begin with Condition 1
        let group = createGroup(1);
        nodes.appendChild(group);

        filters.forEach((entry) => {
            if (entry && typeof entry === "object" && "operator" in entry) {
                // Explicit OR starts a new group
                if (String(entry.operator).toUpperCase() === "OR") {
                    const g = createGroup(getGroups().length + 1);
                    nodes.appendChild(g);
                    group = g;
                }
                return;
            }

            const parsed = filterToFieldValues(entry || {});
            if (!parsed) return;

            // Determine relation word for per-group rule
            const relWord = parsed.values?.Relation || "";

            // Choose the correct group. If the rule would be violated, this may create a new group.
            const target = findTargetGroupFor(parsed.field, relWord, group);

            // Add node to the chosen group
            createNodeInGroup(parsed.field, parsed.values, target);

            // If a new group was created by enforcement, continue adding into that group
            group = target;
        });

        renumberGroups();
        const last = getGroups()[getGroups().length - 1];
        setActiveGroup(last);
        currentGroup = last;
        refreshCodeSample();
        updateAllConflictHighlights();

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

        const relationWord = payload.values?.Relation || "";
        const targetGroup = findTargetGroupFor(
            field,
            relationWord,
            currentGroup || getGroups().slice(-1)[0]
        );
        if (!targetGroup) return;

        const body = targetGroup.querySelector(".group-body");

        const node = document.createElement("div");
        node.className = "node node-ok";
        node.appendChild(nodeContent(field, payload.values));

        // Store the payload for later (used in JSON export/import and warnings)
        node.__payload = { field, values: payload.values };

        // Create the remove button
        const remove = document.createElement("button");
        remove.className = "btn btn-sm remove";
        remove.textContent = "Remove";

        // ⬇️ This is where that snippet goes
        remove.addEventListener("click", () => {
            node.remove();
            updateGroupCount(targetGroup);
            refreshCodeSample();
            updateAllConflictHighlights();   // new: highlight logic after removal
        });

        node.appendChild(remove);
        body.appendChild(node);

        updateGroupCount(targetGroup);
        node.scrollIntoView({ behavior: "smooth", block: "center" });

        // reset inputs but keep field selection
        propsBox.querySelectorAll("input, select").forEach(el => {
            if (el.tagName === "SELECT") {
                if (el.firstElementChild && el.firstElementChild.disabled) el.value = "";
            } else {
                el.value = "";
            }
        });
        toggleValueVisibility(field);

        refreshCodeSample();
        updateAllConflictHighlights();   // also run after adding
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
