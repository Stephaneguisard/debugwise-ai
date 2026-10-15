"use strict";
(() => {
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const words = s => (s || "").trim().split(/\s+/).filter(Boolean).length;
const lines = s => (s || "").split("\n").map(x => x.replace(/\r$/, "")).filter((x, i, a) => x !== "" || i < a.length - 1);
const clock = t => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const since = (t, start) => { const s = Math.max(0, Math.round((t - start) / 1000)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
const hash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(36); };
let toastT;
function toast(msg) { const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 3000); }
const smooth = () => matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";

/* ---------------- preset assignments (Python) ---------------- */
const PRESETS = [
  {
    id: "longest-word", title: "Longest word", preset: true,
    problem: "longest_word(words) takes a list of words and returns the longest one.",
    instructions: "Find out why the function crashes, fix it, and explain the cause in your own words. Do not rewrite the function from scratch.",
    expected: 'longest_word(["cat", "horse", "ox"]) returns "horse".',
    criteria: ["Hypothesis identifies which index values the loop visits", "At least one experiment that traces the loop", "Explanation refers to valid list indexes", "Transfer prediction is justified"],
    code: 'def longest_word(words):\n    longest = ""\n    for i in range(len(words) + 1):\n        if len(words[i]) > len(longest):\n            longest = words[i]\n    return longest',
    tests: [{ call: 'longest_word(["cat", "horse", "ox"])', expect: '"horse"' }, { call: 'longest_word(["a"])', expect: '"a"' }, { call: 'longest_word(["hi", "hey"])', expect: '"hey"' }],
    transfer: { code: 'def last_item(items):\n    return items[len(items)]', call: 'last_item(["red", "green", "blue"])', question: 'What does last_item(["red", "green", "blue"]) do? Why?' }
  },
  {
    id: "class-average", title: "Class average", preset: true,
    problem: "average(scores) returns the mean of a list of test scores.",
    instructions: "The function runs without errors but gives wrong answers for some lists. Find the cause, fix it with the smallest change you can, and explain what the variables held at each pass of the loop.",
    expected: "average([80, 90, 100]) returns 90.",
    criteria: ["Hypothesis says what total holds after each pass", "Experiment traces total across iterations", "Explanation refers to when the starting value is assigned", "Reflection names a check for next time"],
    code: 'def average(scores):\n    count = 0\n    for score in scores:\n        total = 0\n        total = total + score\n        count += 1\n    return total / count',
    tests: [{ call: "average([80, 90, 100])", expect: "90" }, { call: "average([50])", expect: "50" }, { call: "average([70, 80])", expect: "75" }],
    transfer: { code: 'def count_passed(scores):\n    for score in scores:\n        passed = 0\n        if score >= 50:\n            passed += 1\n    return passed', call: "count_passed([40, 70, 90])", question: "What does count_passed([40, 70, 90]) return? Is that correct? Which part of your earlier fix applies here?" }
  },
  {
    id: "study-minutes", title: "Study minutes", preset: true,
    problem: "total_minutes(entries) adds up study minutes typed into a form. Form fields always give back text.",
    instructions: "The function crashes. Find the cause, fix it, and explain the difference between what you expected and what Python did.",
    expected: 'total_minutes(["30", "45", "20"]) returns 95.',
    criteria: ["Hypothesis considers the type of each value", "Experiment checks the type of the values", "Explanation names text vs number", "Transfer prediction is justified"],
    code: 'def total_minutes(entries):\n    # entries come from a form, e.g. ["30", "45", "20"]\n    total = 0\n    for entry in entries:\n        total = total + entry\n    return total',
    tests: [{ call: 'total_minutes(["30", "45", "20"])', expect: "95" }, { call: "total_minutes([])", expect: "0" }, { call: 'total_minutes(["5"])', expect: "5" }],
    transfer: { code: 'def average_age(ages):\n    # ages come from a form, e.g. ["18", "20", "22"]\n    total = 0\n    for age in ages:\n        total += age\n    return total / len(ages)', call: 'average_age(["18", "20", "22"])', question: 'What happens when you call average_age(["18", "20", "22"])? Which fix from before applies?' }
  },
  {
    id: "has-negative", title: "Has a negative number", preset: true,
    problem: "has_negative(numbers) returns True if any number in the list is below zero, otherwise False.",
    instructions: "The function gives the wrong answer for some lists, and no error appears. Find out why, fix it, and explain what happens after the first item.",
    expected: "has_negative([3, -1, 4]) returns True; has_negative([]) returns False.",
    criteria: ["Hypothesis says how many items the loop looks at", "Experiment uses a list where the negative is not first", "Explanation says what return does to the whole function", "Reflection names a check for next time"],
    code: 'def has_negative(numbers):\n    for n in numbers:\n        if n < 0:\n            return True\n        else:\n            return False',
    tests: [{ call: "has_negative([3, -1, 4])", expect: "True" }, { call: "has_negative([-2, 5])", expect: "True" }, { call: "has_negative([1, 2, 3])", expect: "False" }, { call: "has_negative([])", expect: "False" }],
    transfer: { code: 'def all_positive(numbers):\n    for n in numbers:\n        if n > 0:\n            return True\n    return False', call: "all_positive([5, -3, 2])", question: "What does all_positive([5, -3, 2]) return? Is that right, and which rule about return applies?" }
  }
];

/* ---------------- storage ---------------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};
const K = { tasks: "dw2.tasks", prog: "dw2.progress", recs: "dw2.records", name: "dw2.name", task: "dw2.task", key: "dw2.aiKey", model: "dw2.aiModel", intro: "dw2.intro" };
let customTasks = store.get(K.tasks, []);
let progressAll = store.get(K.prog, {});
let savedRecs = store.get(K.recs, []);
const allTasks = () => PRESETS.concat(customTasks);
const taskById = id => allTasks().find(t => t.id === id);
let curTaskId = (() => { const s = store.get(K.task, null); return s && taskById(s) ? s : PRESETS[0].id; })();
const blankProgress = () => ({
  startedAt: Date.now(), hypotheses: [], experiments: [], hints: [], asks: [], revised: taskById(curTaskId).code,
  tests: null, testRuns: 0, explanation: "", explFeedback: null,
  transfer: { prediction: "", result: null, matched: "", why: "" }, ref: { a: "", b: "", c: "" }, flags: [], diagnosis: null
});
const P = () => { if (!progressAll[curTaskId]) progressAll[curTaskId] = blankProgress(); return progressAll[curTaskId]; };
const save = () => store.set(K.prog, progressAll);
let svT; const saveSoon = () => { clearTimeout(svT); svT = setTimeout(save, 400); };

/* ---------------- Python in a Web Worker (Pyodide) ---------------- */
const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/";
const WORKER_SRC = `
importScripts(${JSON.stringify(PYODIDE + "pyodide.js")});
const ENGINE = ${JSON.stringify(ENGINE_PY)};
let py = null;
const ready = (async () => { py = await loadPyodide({ indexURL: ${JSON.stringify(PYODIDE)} }); py.runPython(ENGINE); postMessage({ ready: true }); })();
ready.catch(e => postMessage({ fatal: String(e) }));
onmessage = async (e) => {
  const { id, payload } = e.data;
  try { await ready; const f = py.globals.get("dw_dispatch"); const r = f(JSON.stringify(payload)); f.destroy && f.destroy(); postMessage({ id, result: JSON.parse(r) }); }
  catch (err) { postMessage({ id, result: { internal: true, error: String(err) } }); }
};`;
let workerURL = null, worker = null, workerReady = Promise.resolve(false), readyRes = null, pyReady = false, seq = 0;
const pending = new Map();
function setPy(state, extra) {
  const pill = $("pyPill");
  pill.className = "pill " + (state === "ready" ? "live" : state === "error" ? "err" : "busy");
  $("pyPillText").textContent = state === "ready" ? "Python ready" : state === "error" ? "Python failed to load" : (extra || "Starting Python…");
  if (state === "ready") { renderLadder(); }
}
function startWorker() {
  pyReady = false; setPy("busy");
  workerReady = new Promise(res => { readyRes = res; });
  try {
    if (!workerURL) workerURL = URL.createObjectURL(new Blob([WORKER_SRC], { type: "text/javascript" }));
    worker = new Worker(workerURL);
  } catch (e) { setPy("error"); readyRes(false); return; }
  worker.onmessage = e => {
    const d = e.data;
    if (d.ready) { pyReady = true; setPy("ready"); readyRes(true); return; }
    if (d.fatal) { setPy("error"); readyRes(false); return; }
    const cb = pending.get(d.id); if (cb) { pending.delete(d.id); cb(d.result); }
  };
  worker.onerror = () => { setPy("error"); readyRes(false); };
}
async function py(payload, ms) {
  ms = ms || 7000;
  const ok = await workerReady;
  if (!ok) return { internal: true, error: "Python could not be loaded. Check your internet connection and reload the page." };
  return new Promise(resolve => {
    const id = ++seq; let done = false;
    const t = setTimeout(() => { if (done) return; done = true; pending.delete(id); worker.terminate(); startWorker(); resolve({ timeout: true, limit: Math.round(ms / 1000) }); }, ms);
    pending.set(id, r => { if (done) return; done = true; clearTimeout(t); resolve(r); });
    worker.postMessage({ id, payload });
  });
}

/* ---------------- optional Claude (bring your own key) ---------------- */
/* ---------------- DebugWise Pro: optional backend ---------------- */
const SERVER = { server: false, ai: false, invite_required: false };
let teacherAuth = store.get("dw2.teacher", null);   // {token, email, class_code}
let serverRecs = [];
async function api(path, opts) {
  opts = opts || {};
  const headers = { "content-type": "application/json" };
  if (opts.auth && teacherAuth) headers.authorization = "Bearer " + teacherAuth.token;
  const r = await fetch(path, { method: opts.method || "GET", headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  let j = null; try { j = await r.json(); } catch (e) {}
  if (!r.ok) { const err = new Error((j && j.detail) || r.status); err.status = r.status; throw err; }
  return j;
}
let aiKey = store.get(K.key, "");
const aiOn = () => !!aiKey || SERVER.ai;
let aiModel = store.get(K.model, "claude-sonnet-5-5");
function renderAiPill() {
  const pill = $("aiPill");
  pill.classList.toggle("live", aiOn());
  $("aiPillText").textContent = aiKey ? "AI: Claude (your key)" : SERVER.ai ? "AI: Claude (school server)" : "AI: built-in diagnosis";
  const note = $("askNote"), btn = $("askBtn");
  if (aiOn()) { note.textContent = "Claude answers with guiding questions and will not go beyond the hint level you have unlocked."; btn.disabled = false; }
  else { note.textContent = "Follow-up questions need Claude. Add your own API key under AI settings. The three-level ladder above works without it."; btn.disabled = true; }
}
async function claudeText(prompt, max) {
  if (!aiKey && SERVER.ai) { const j = await api("/api/claude", { method: "POST", body: { prompt, max_tokens: Math.min(max || 900, 1200), model: aiModel } }); return j.text; }
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": aiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
    body: JSON.stringify({ model: aiModel, max_tokens: max || 900, messages: [{ role: "user", content: prompt }] })
  });
  if (!r.ok) { let m = ""; try { m = (await r.json()).error.message; } catch (e) {} throw new Error(r.status + (m ? " " + m : "")); }
  const j = await r.json();
  return (j.content || []).map(c => c.text || "").join("");
}
const parseJSON = t => { const m = t.match(/\{[\s\S]*\}/); return JSON.parse(m ? m[0] : t); };
const numbered = code => code.split("\n").map((l, i) => String(i + 1).padStart(2, " ") + "  " + l).join("\n");

/* ---------------- diagnosis, hints, flags ---------------- */
const diagCache = {}, failCache = {};
let loadP = Promise.resolve();
function failText(id) {
  const f = failCache[id]; if (!f) return "(not run yet)";
  let s = "> " + f.call + "\n";
  if (f.out) s += f.out.trim() + "\n";
  s += f.err ? f.err.tb : "result: " + f.got;
  if (f.call !== "(run the program)") s += "\nexpected: " + f.expect;
  return s;
}
const FLAG_LABEL = { low_conf: "Low-confidence diagnosis", rapid: "Rapid hint requests", early_fix: "Early jump to fix", off_track_fix: "Fix reached with off-track hypothesis", thin_expl: "Thin explanation" };
function addFlag(p, type, msg) { if (!p.flags.some(f => f.type === type)) p.flags.push({ type, msg, at: Date.now() }); }
function hypStatus(text, diag) {
  const t = (text || "").toLowerCase();
  let hits = (diag.keywords || []).filter(k => t.includes(String(k).toLowerCase())).length;
  if (diag.line && new RegExp("\\b" + diag.line + "\\b").test(t)) hits += 1;
  return hits >= 3 ? "on_track" : hits >= 1 ? "partly" : "off_track";
}
const STATUS_COPY = {
  on_track: "Your hypothesis is pointing in the right direction. Use your next experiment to confirm it.",
  partly: "Part of your hypothesis is useful. Narrow it down: which exact value is wrong, and on which line does it go wrong?",
  off_track: "Your hypothesis does not match the evidence yet. Compare what you expected with what your experiment actually returned."
};
function engineHint(diag, level, hyp) {
  const st = hypStatus(hyp, diag);
  return { category: diag.category, misconception: diag.misconception, confidence: diag.confidence, hypothesis_status: st,
    hypothesis_feedback: STATUS_COPY[st], support: level < 3 ? diag["l" + level] : "", fix_lines: level === 3 ? diag.l3 : "", source: "engine" };
}
async function claudeHint(task, level, prog) {
  const hyps = prog.hypotheses.map((h, i) => `${i + 1}. ${h.text}`).join("\n") || "(none)";
  const exps = prog.experiments.map((x, i) => `${i + 1}. ran ${x.call || "the program"} on ${x.target === "orig" ? "original" : "revised"} code; expected ${x.expect || "(not stated)"}; got ${x.result}; student note: ${x.note}`).join("\n") || "(none)";
  const prev = prog.hints.map(h => `Level ${h.level}: ${h.payload.support || h.payload.fix_lines}`).join("\n") || "(none)";
  const prompt = `You are DebugWise AI, a debugging tutor for undergraduate novice programmers learning Python. You support the student's own diagnosis with tiered scaffolding. Never return a full corrected program.

ASSIGNMENT: ${task.title}
Problem: ${task.problem}
Expected behaviour: ${task.expected || "(not given)"}

ORIGINAL CODE (Python, line-numbered):
${numbered(task.code)}

OBSERVED FAILURE:
${failText(task.id)}

STUDENT HYPOTHESES (oldest first):
${hyps}

STUDENT EXPERIMENTS:
${exps}

HINTS ALREADY GIVEN:
${prev}

The student is requesting support LEVEL ${level} of 3.
- Level 1: name the likely bug category and the misconception behind it, and ask ONE diagnostic question that makes the student inspect program state. No line number, no fix.
- Level 2: a narrowed hint that points to the relevant line range and says what to trace or print. No corrected code.
- Level 3: a minimal possible fix: only the changed line(s), with one sentence on why. Never the whole program.
Also judge the student's LATEST hypothesis against the real bug and give 1-2 sentences of feedback that reveal no more than the current level allows.
Set confidence honestly from 0 to 1: how sure you are that your diagnosis is the real cause. Use below 0.6 if the code or failure is ambiguous.

Reply with only JSON:
{"category": string, "misconception": string, "confidence": number, "hypothesis_status": "on_track"|"partly"|"off_track", "hypothesis_feedback": string, "support": string, "fix_lines": string}
For levels 1 and 2, fix_lines must be "". For level 3, support may be "".`;
  const r = parseJSON(await claudeText(prompt, 900));
  const conf = Number(r.confidence);
  return { category: String(r.category || "Unclassified"), misconception: String(r.misconception || ""),
    confidence: isFinite(conf) ? Math.max(0, Math.min(1, conf)) : 0.5,
    hypothesis_status: ["on_track", "partly", "off_track"].includes(r.hypothesis_status) ? r.hypothesis_status : "partly",
    hypothesis_feedback: String(r.hypothesis_feedback || ""), support: String(r.support || ""),
    fix_lines: level === 3 ? String(r.fix_lines || "") : "", source: "claude" };
}

/* ---------------- running + rendering helpers ---------------- */
function termHTML(call, r, expect) {
  let h = `<span class="dim">&gt;&gt;&gt; ${esc(call || "run program")}</span>\n`;
  if (r.timeout) return h + `<span class="err">Stopped after ${r.limit} seconds. The code may be stuck in an infinite loop.</span>`;
  if (r.internal) return h + `<span class="err">${esc(r.error)}</span>`;
  if (r.out) h += esc(r.out.replace(/\n$/, "")) + "\n";
  if (r.ok) { if (r.has_value) h += esc(r.value); else if (!r.out) h += `<span class="dim">(no output)</span>`; }
  else h += `<span class="err">${esc(r.err.tb)}</span>`;
  if (expect) h += `\n<span class="dim">expected: ${esc(expect)}</span>`;
  return h;
}
function failHTML(f) {
  if (!f) return "No failing test found.";
  const isRun = f.call === "(run the program)";
  let h = `<span class="dim">&gt;&gt;&gt; ${esc(isRun ? "run program" : f.call)}</span>\n`;
  if (f.out) h += esc(f.out.replace(/\n$/, "")) + "\n";
  if (f.err) h += `<span class="err">${esc(f.err.tb)}</span>`;
  else h += esc(f.got);
  if (!isRun) h += `\n<span class="dim">expected: ${esc(f.expect)}</span>`;
  return h;
}
const codeHTML = code => code.split("\n").map((l, i) => `<span class="ln"><i>${i + 1}</i>${esc(l) || " "}</span>`).join("");

/* ---------------- student rendering ---------------- */
function renderTaskSelect() {
  const own = customTasks.filter(t => t.origin === "own"), lnk = customTasks.filter(t => t.origin !== "own");
  const opt = t => `<option value="${esc(t.id)}"${t.id === curTaskId ? " selected" : ""}>${esc(t.title)}</option>`;
  $("taskSel").innerHTML = `<optgroup label="Sample tasks">${PRESETS.map(opt).join("")}</optgroup>`
    + (lnk.length ? `<optgroup label="Teacher assignments">${lnk.map(opt).join("")}</optgroup>` : "")
    + (own.length ? `<optgroup label="My own code">${own.map(opt).join("")}</optgroup>` : "");
}
function renderBrief() {
  const t = taskById(curTaskId);
  const tag = t.preset ? "Sample task" : t.origin === "own" ? "My own code" : "Teacher assignment";
  $("brief").innerHTML = `<div class="row" style="justify-content:space-between"><h2>${esc(t.title)}</h2><span class="chip info">${tag}</span></div>
  <dl>
    <div><dt>Problem</dt><dd>${esc(t.problem)}</dd></div>
    ${t.instructions ? `<div><dt>Instructions</dt><dd>${esc(t.instructions)}</dd></div>` : ""}
    ${t.expected ? `<div><dt>Expected behaviour</dt><dd>${esc(t.expected)}</dd></div>` : ""}
    ${t.criteria && t.criteria.length ? `<div><dt>Assessed on</dt><dd><ul>${t.criteria.map(c => `<li>${esc(c)}</li>`).join("")}</ul></dd></div>` : ""}
  </dl>`;
  $("origCode").innerHTML = codeHTML(t.code);
}
function loadTask() {
  const id = curTaskId, t = taskById(id);
  $("failOut").textContent = pyReady ? "Running…" : "Starting Python… (the first visit downloads about 10 MB)";
  loadP = (async () => {
    const r = await py({ type: "tests", code: t.code, tests: t.tests || [], stdin: lines(t.stdin || "") }, 9000);
    if (id !== curTaskId) return;
    if (r.timeout || r.internal || !r.rows) { $("failOut").innerHTML = termHTML("", r.rows ? {} : r); return; }
    const f = r.rows.find(x => !x.pass) || r.rows[0];
    failCache[id] = f;
    $("failOut").innerHTML = failHTML(f);
    if (!$("expCall").value && f && f.call !== "(run the program)") $("expCall").value = f.call;
    const d = await py({ type: "diagnose", code: t.code, failure: f && !f.pass ? { call: f.call, err: f.err, got: f.got, expect: f.expect } : null });
    if (d && d.category) diagCache[id] = d;
    if (id === curTaskId) renderLadder();
  })();
  return loadP;
}
function renderHyps() {
  const p = P();
  $("hypList").innerHTML = p.hypotheses.slice().reverse().map((h, i) => `<li class="hyp"><div class="meta">Hypothesis ${p.hypotheses.length - i} · ${since(h.at, p.startedAt)} in</div>${esc(h.text)}</li>`).join("");
}
function renderExps() {
  const p = P();
  $("expList").innerHTML = p.experiments.slice().reverse().map((x, i) => `<li><div class="meta">Experiment ${p.experiments.length - i} · ${x.target === "orig" ? "original" : "revision"} · ${since(x.at, p.startedAt)} in</div><code>${esc(x.call || "run program")}</code> → <code>${esc(x.result)}</code>${x.expect ? ` <span class="muted small">(expected ${esc(x.expect)})</span>` : ""}<div>${esc(x.note)}</div></li>`).join("");
}
function gate(p) {
  const last = p.hints.length ? p.hints[p.hints.length - 1].at : 0;
  const h = p.hypotheses.filter(x => x.at > last), e = p.experiments.filter(x => x.at > last);
  return { hyp: h.length > 0, exp: e.length > 0, hypText: h.length ? h[h.length - 1].text : "" };
}
let hintBusy = false, hintErr = "";
function renderLadder() {
  const p = P(), t = taskById(curTaskId); if (!t) return;
  const g = gate(p), next = p.hints.length + 1;
  const names = ["Bug category + diagnostic question", "Narrowed hint", "Possible fix (changed lines only)"];
  const loaded = !!diagCache[curTaskId];
  let h = "";
  const d = p.diagnosis;
  if (d && d.confidence < 0.6) h += `<div class="notice warn"><b>DebugWise is not sure about this diagnosis</b> (confidence ${Math.round(d.confidence * 100)}%). Treat the hints as suggestions and check them with your own experiments. It is flagged for your teacher to review.</div>`;
  for (let L = 1; L <= 3; L++) {
    const got = p.hints.find(x => x.level === L);
    if (got) {
      const y = got.payload;
      h += `<div class="rung open"><h3><span class="lvl">L${L}</span>${names[L - 1]}<span class="chip ${y.source === "claude" ? "info" : "ok"}">${y.source === "claude" ? "Claude" : "built-in"}</span></h3>
        ${L === 1 ? `<div class="small"><span class="label">Likely category</span><br>${esc(y.category)}</div><div class="small"><span class="label">Possible misconception</span><br>${esc(y.misconception)}</div>` : ""}
        ${y.support ? `<div>${esc(y.support).replace(/\n/g, "<br>")}</div>` : ""}
        ${y.fix_lines ? `<pre class="term">${esc(y.fix_lines)}</pre>` : ""}
        ${y.hypothesis_feedback ? `<div class="notice ${y.hypothesis_status === "on_track" ? "ok" : y.hypothesis_status === "off_track" ? "bad" : "info"} small"><b>On your hypothesis:</b> ${esc(y.hypothesis_feedback)}</div>` : ""}
        ${y.note ? `<div class="small muted">${esc(y.note)}</div>` : ""}
      </div>`;
    } else if (L === next) {
      const ready = g.hyp && g.exp && (loaded || aiOn());
      h += `<div class="rung"><h3><span class="lvl">L${L}</span>${names[L - 1]}</h3>
        <ul class="checks"><li class="${g.hyp ? "met" : ""}">A new hypothesis${p.hints.length ? " since your last hint" : ""}</li><li class="${g.exp ? "met" : ""}">A new logged experiment${p.hints.length ? " since your last hint" : ""}</li></ul>
        <div class="row"><button class="btn primary" id="hintReq" ${ready && !hintBusy ? "" : "disabled"}>${hintBusy ? "Thinking…" : `Unlock level ${L}`}</button>
        <span class="small muted">${!(g.hyp && g.exp) ? "Complete both steps above first." : !ready ? "Waiting for Python to finish loading…" : ""}</span></div>
        ${hintErr ? `<div class="notice bad small">${esc(hintErr)}</div>` : ""}
      </div>`;
    } else {
      h += `<div class="rung"><h3><span class="lvl">L${L}</span><span class="muted">${names[L - 1]}</span><span class="chip">locked</span></h3></div>`;
    }
  }
  $("ladder").innerHTML = h;
  const btn = $("hintReq"); if (btn) btn.onclick = requestHint;
}
async function requestHint() {
  const p = P(), t = taskById(curTaskId), g = gate(p);
  if (!(g.hyp && g.exp) || hintBusy) return;
  const level = p.hints.length + 1;
  hintBusy = true; hintErr = ""; renderLadder();
  await loadP;
  const diag = diagCache[curTaskId];
  let payload = null;
  if (aiOn()) {
    try { payload = await claudeHint(t, level, p); }
    catch (e) {
      const msg = /401|403/.test(e.message) ? "Claude rejected the API key" : /429/.test(e.message) ? "Claude is rate-limited right now" : "Claude could not be reached";
      if (diag) { payload = engineHint(diag, level, g.hypText); payload.note = msg + ", so this hint comes from the built-in diagnosis."; }
      else hintErr = msg + ". Check AI settings and try again.";
    }
  } else if (diag) payload = engineHint(diag, level, g.hypText);
  hintBusy = false;
  if (!payload) { renderLadder(); return; }
  const now = Date.now(), prevAt = p.hints.length ? p.hints[p.hints.length - 1].at : null;
  p.hints.push({ level, at: now, payload });
  if (level === 1 || !p.diagnosis) p.diagnosis = { category: payload.category, confidence: payload.confidence };
  else p.diagnosis.confidence = Math.min(p.diagnosis.confidence, payload.confidence);
  if (payload.confidence < 0.6) addFlag(p, "low_conf", `Diagnosis confidence ${Math.round(payload.confidence * 100)}% (${payload.category}).`);
  if (prevAt && now - prevAt < 60000) addFlag(p, "rapid", `Level ${level} requested ${Math.round((now - prevAt) / 1000)} s after level ${level - 1}.`);
  if (level === 3 && now - p.startedAt < 4 * 60000) addFlag(p, "early_fix", `Reached the fix level ${since(now, p.startedAt)} after starting.`);
  if (level === 3 && payload.hypothesis_status === "off_track") addFlag(p, "off_track_fix", "Latest hypothesis was off track when the fix was shown; the misconception may persist.");
  save(); renderAll();
}

/* follow-up questions (Claude only) */
function renderAsks() {
  const p = P();
  $("askList").innerHTML = (p.asks || []).map(a => `<div class="qa"><div class="q">You: ${esc(a.q)}</div>${esc(a.a)}</div>`).join("");
}
async function askQuestion() {
  const p = P(), t = taskById(curTaskId), q = $("askText").value.trim();
  if (!aiOn()) return;
  if (!p.hints.length) { $("askMsg").textContent = "Unlock level 1 first."; return; }
  if (words(q) < 4) { $("askMsg").textContent = "Write your question in a full sentence."; return; }
  if ((p.asks || []).length >= 6) { $("askMsg").textContent = "You have used the 6 follow-up questions for this task. Try another experiment."; return; }
  $("askMsg").textContent = "Thinking…"; $("askBtn").disabled = true;
  const hyps = p.hypotheses.map((h, i) => `${i + 1}. ${h.text}`).join("\n");
  const prompt = `You are DebugWise AI, a Socratic Python debugging tutor for novices. The student has unlocked support level ${p.hints.length} of 3 (1 = category and question, 2 = narrowed hint, 3 = changed lines only). Answer their follow-up question in under 120 words. Do not reveal more than level ${p.hints.length} allows. Never write a corrected program. Prefer a guiding question or a small experiment they can run.

ORIGINAL CODE:
${numbered(t.code)}

OBSERVED FAILURE:
${failText(t.id)}

STUDENT HYPOTHESES:
${hyps || "(none)"}

QUESTION: ${q}`;
  try {
    const a = (await claudeText(prompt, 500)).trim();
    p.asks = p.asks || []; p.asks.push({ q, a, at: Date.now(), level: p.hints.length });
    $("askText").value = ""; $("askMsg").textContent = ""; save(); renderAsks();
  } catch (e) { $("askMsg").textContent = /401|403/.test(e.message) ? "Claude rejected the API key. Check AI settings." : "Claude could not be reached. Try again."; }
  $("askBtn").disabled = !aiOn();
}

/* tests */
function renderTests() {
  const p = P(), t = taskById(curTaskId);
  if (!p.tests) { $("testOut").innerHTML = ""; $("testSummary").textContent = t.tests && t.tests.length ? `${t.tests.length} tests ready` : "The program should run without errors"; return; }
  const pass = p.tests.filter(r => r.pass).length;
  $("testSummary").innerHTML = `<span class="chip ${pass === p.tests.length ? "ok" : "bad"}">${pass} / ${p.tests.length} passing</span>`;
  $("testOut").innerHTML = `<table><thead><tr><th>Call</th><th>Expected</th><th>Got</th><th></th></tr></thead><tbody>${p.tests.map(r => `<tr><td class="mono">${esc(r.call)}</td><td class="mono">${esc(r.expect)}</td><td class="mono">${esc(r.got)}${r.out ? `<div class="muted">${esc(r.out.trim()).replace(/\n/g, "<br>")}</div>` : ""}</td><td>${r.pass ? '<span class="chip ok">pass</span>' : '<span class="chip bad">fail</span>'}</td></tr>`).join("")}</tbody></table>`;
}
async function runTests() {
  const p = P(), t = taskById(curTaskId), btn = $("runTests");
  p.revised = $("revCode").value; btn.disabled = true; btn.textContent = "Running…";
  const r = await py({ type: "tests", code: p.revised, tests: t.tests || [], stdin: lines(t.stdin || "") }, 9000);
  btn.disabled = false; btn.textContent = "Run tests";
  if (r.timeout) { $("testSummary").innerHTML = `<span class="chip bad">Stopped after ${r.limit} s: possible infinite loop</span>`; return; }
  if (r.internal || !r.rows) { $("testSummary").textContent = r.error || "Could not run the tests."; return; }
  p.tests = r.rows.map(x => ({ call: x.call, expect: x.expect, got: x.got, pass: x.pass, out: x.out }));
  p.testRuns++; save(); renderTests(); renderTransfer(); renderSteps(); renderRecord();
}

/* explanation */
function renderExplFb() {
  const f = P().explFeedback;
  $("explFb").innerHTML = f ? `<div class="notice ${f.kind}"><b>${f.source === "claude" ? "Claude’s feedback" : "Checklist feedback"}:</b> ${esc(f.text)}</div>` : "";
}
async function checkExplanation() {
  const p = P(), t = taskById(curTaskId), text = $("explText").value.trim();
  if (words(text) < 15) { $("explMsg").textContent = "Write at least 15 words first."; return; }
  $("explMsg").textContent = "";
  const btn = $("explCheck"); btn.disabled = true; btn.textContent = "Checking…";
  await loadP;
  try {
    if (aiOn()) {
      const r = parseJSON(await claudeText(`You are a Python debugging tutor. A novice fixed a bug and explained it. Judge only the explanation of WHY the original code failed. Do not give corrected code.

Original code:
${numbered(t.code)}

Observed failure:
${failText(t.id)}

Student explanation:
${text}

Reply with only JSON: {"rating": "strong"|"partial"|"weak", "feedback": string (max 60 words: what is accurate, and what is missing about program state or Python's rules)}`, 400));
      p.explFeedback = { source: "claude", kind: r.rating === "strong" ? "ok" : r.rating === "weak" ? "bad" : "info", text: String(r.feedback || "") };
    } else {
      const d = diagCache[curTaskId], st = d ? hypStatus(text, d) : "partly";
      const msg = st === "on_track" ? "Your explanation names the key idea. Check that it also says what value the program actually had when it failed, and which Python rule produced that."
        : st === "partly" ? "You touch on the cause. Add what the program state was (which variable, which value) and which Python rule explains it."
        : "The explanation does not yet name the cause. Describe what the program did step by step, compared with what you expected.";
      p.explFeedback = { source: "engine", kind: st === "on_track" ? "ok" : st === "off_track" ? "bad" : "info", text: msg };
    }
  } catch (e) { $("explMsg").textContent = "Claude could not be reached. Try again, or remove the key in AI settings."; }
  btn.disabled = false; btn.textContent = "Get feedback on my explanation";
  save(); renderExplFb();
}

/* transfer */
function renderTransfer() {
  const p = P(), t = taskById(curTaskId);
  const passing = p.tests && p.tests.length && p.tests.every(r => r.pass);
  const tr = t.transfer, generic = !tr;
  $("s6").classList.toggle("locked", !passing);
  if (!passing) { $("transferBody").innerHTML = `<div class="notice info small">Unlocks when all tests pass in Step 4.</div>`; return; }
  const q = generic ? "Write a new input that would have exposed the bug in the original code. Predict what the original returns for it, then run it to check." : tr.question;
  $("transferBody").innerHTML = `
    ${generic ? "" : `<pre class="codeview">${codeHTML(tr.code)}</pre>`}
    <p><b>${esc(q)}</b></p>
    <label class="field"><span>Your prediction (before running)</span><textarea id="trPredict" placeholder="I predict … because …">${esc(p.transfer.prediction)}</textarea></label>
    <div class="row">${generic ? `<input type="text" id="trCall" class="mono grow" value="${esc(p.transfer.call || (t.tests && t.tests[0] ? t.tests[0].call : ""))}" aria-label="Call to run">` : ""}<button class="btn" id="trRun">Run to check</button></div>
    ${p.transfer.result ? `<pre class="term">${p.transfer.result}</pre>
    <div class="row"><span class="small">Did your prediction match?</span>
      <div class="seg" role="group" aria-label="Prediction matched"><button id="trYes" aria-pressed="${p.transfer.matched === "yes"}">Yes</button><button id="trNo" aria-pressed="${p.transfer.matched === "no"}">No</button></div></div>
    <label class="field"><span>Which debugging principle from this task applies here?</span><textarea id="trWhy">${esc(p.transfer.why)}</textarea></label>` : ""}`;
  $("trPredict").oninput = e => { p.transfer.prediction = e.target.value; saveSoon(); };
  $("trRun").onclick = async () => {
    if (words(p.transfer.prediction) < 4) { toast("Write your prediction before running."); return; }
    const call = generic ? $("trCall").value : tr.call;
    p.transfer.call = call;
    const r = await py({ type: "run", code: generic ? t.code : tr.code, call, stdin: lines(t.stdin || "") });
    p.transfer.result = termHTML(call, r); p.transfer.ranAt = Date.now();
    save(); renderTransfer(); renderSteps();
  };
  if ($("trYes")) {
    $("trYes").onclick = () => { p.transfer.matched = "yes"; save(); renderTransfer(); renderSteps(); };
    $("trNo").onclick = () => { p.transfer.matched = "no"; save(); renderTransfer(); renderSteps(); };
    $("trWhy").oninput = e => { p.transfer.why = e.target.value; saveSoon(); renderStepsSoon(); };
  }
}

/* steps + record */
const STEP_NAMES = ["Hypothesis", "Experiment", "Support", "Revise", "Explain", "Transfer", "Reflect"];
function stepDone(p) {
  return [p.hypotheses.length > 0, p.experiments.length > 0, p.hints.length > 0, !!(p.tests && p.tests.length && p.tests.every(r => r.pass)),
    words(p.explanation) >= 15, !!(p.transfer.result && p.transfer.matched && words(p.transfer.why) >= 5),
    words(p.ref.a) >= 5 && words(p.ref.b) >= 5 && words(p.ref.c) >= 5];
}
function renderSteps() {
  const d = stepDone(P());
  $("steps").innerHTML = STEP_NAMES.map((n, i) => `<a href="#s${i + 1}" class="${d[i] ? "done" : ""}"><b>${i + 1}</b>${n}</a>`).join("");
  $("steps").querySelectorAll("a").forEach(a => a.onclick = e => { e.preventDefault(); const el = document.querySelector(a.getAttribute("href")); el && el.scrollIntoView({ behavior: smooth(), block: "start" }); });
}
let stT; function renderStepsSoon() { clearTimeout(stT); stT = setTimeout(() => { renderSteps(); renderRecord(); }, 400); }
function renderRecord() {
  const p = P(), pass = p.tests ? p.tests.filter(r => r.pass).length + "/" + p.tests.length : "not run";
  $("recordSummary").innerHTML = `<div class="scroll-x"><table><tbody>
    <tr><th>Hypotheses</th><td>${p.hypotheses.length}</td><th>Experiments</th><td>${p.experiments.length}</td></tr>
    <tr><th>Hint levels used</th><td>${p.hints.length} of 3</td><th>Tests passing</th><td>${pass}</td></tr>
    <tr><th>Diagnosis</th><td colspan="3">${p.diagnosis ? esc(p.diagnosis.category) + ` <span class="muted">(${Math.round(p.diagnosis.confidence * 100)}% confidence)</span>` : '<span class="muted">No hints requested</span>'}</td></tr>
    ${p.flags.length ? `<tr><th>Review flags</th><td colspan="3">${p.flags.map(f => `<span class="chip warn">${esc(FLAG_LABEL[f.type] || f.type)}</span>`).join(" ")}</td></tr>` : ""}
  </tbody></table></div>`;
}
function recordMarkdown(p, t, name) {
  const L = [];
  L.push(`# DebugWise learning record: ${t.title}`, "", `Student: ${name || "(not given)"}  `, `Started: ${new Date(p.startedAt).toLocaleString()}`, "");
  L.push("## Original code", "```python", t.code, "```", "");
  L.push("## Hypotheses"); p.hypotheses.forEach((h, i) => L.push(`${i + 1}. (${since(h.at, p.startedAt)}) ${h.text}`)); L.push("");
  L.push("## Experiments"); p.experiments.forEach((x, i) => L.push(`${i + 1}. (${since(x.at, p.startedAt)}) \`${x.call || "run program"}\` on ${x.target === "orig" ? "original" : "revision"} → \`${x.result}\`; expected ${x.expect || "-"}. Note: ${x.note}`)); L.push("");
  L.push("## Hints used"); p.hints.forEach(h => L.push(`- Level ${h.level} (${since(h.at, p.startedAt)}, ${h.payload.source}): ${(h.payload.support || h.payload.fix_lines).replace(/\n/g, " ")}`)); L.push("");
  if ((p.asks || []).length) { L.push("## Follow-up questions"); p.asks.forEach(a => L.push(`- Q: ${a.q}`, `  A: ${a.a.replace(/\n/g, " ")}`)); L.push(""); }
  L.push("## Revised code", "```python", p.revised, "```", `Tests: ${p.tests ? p.tests.filter(r => r.pass).length + "/" + p.tests.length + " passing" : "not run"}`, "");
  L.push("## Explanation", p.explanation || "-", "");
  L.push("## Transfer", `Prediction: ${p.transfer.prediction || "-"}`, `Matched: ${p.transfer.matched || "-"}`, `Principle: ${p.transfer.why || "-"}`, "");
  L.push("## Reflection", `- First guess and change: ${p.ref.a || "-"}`, `- Hint level needed: ${p.ref.b || "-"}`, `- Next time: ${p.ref.c || "-"}`, "");
  if (p.flags.length) { L.push("## Flags for instructor review"); p.flags.forEach(f => L.push(`- ${FLAG_LABEL[f.type] || f.type}: ${f.msg}`)); }
  return L.join("\n");
}
function renderAll() {
  const p = P(), t = taskById(curTaskId);
  renderTaskSelect(); renderBrief(); renderHyps(); renderExps(); renderLadder(); renderAsks(); renderTests(); renderExplFb(); renderTransfer(); renderSteps(); renderRecord(); renderAiPill();
  if ($("revCode").dataset.task !== curTaskId) {
    $("revCode").value = p.revised; $("revCode").dataset.task = curTaskId;
    $("explText").value = p.explanation; $("ref1").value = p.ref.a; $("ref2").value = p.ref.b; $("ref3").value = p.ref.c;
    $("expCall").value = failCache[curTaskId] && failCache[curTaskId].call !== "(run the program)" ? failCache[curTaskId].call : "";
    $("expExpect").value = ""; $("expStdin").value = t.stdin || ""; $("expOut").hidden = true; $("expNoteWrap").hidden = true; $("hypText").value = ""; $("hypMsg").textContent = ""; $("shareMsg").textContent = "";
  }
}
function switchTask(id) {
  hintBusy = false; hintErr = ""; curTaskId = id; store.set(K.task, id);
  $("revCode").dataset.task = "";
  renderAll(); loadTask();
}

/* ---------------- student events ---------------- */
$("taskSel").onchange = e => switchTask(e.target.value);
let resetArmed = false;
$("resetTask").onclick = () => {
  const b = $("resetTask");
  if (!resetArmed) { resetArmed = true; b.textContent = "Click again to erase this task’s work"; setTimeout(() => { resetArmed = false; b.textContent = "Start over"; }, 3500); return; }
  resetArmed = false; b.textContent = "Start over";
  delete progressAll[curTaskId]; save(); $("revCode").dataset.task = ""; renderAll(); toast("Task reset");
};
$("hypSave").onclick = () => {
  const p = P(), txt = $("hypText").value.trim(), last = p.hypotheses[p.hypotheses.length - 1];
  if (words(txt) < 10) { $("hypMsg").textContent = `Write at least 10 words (${words(txt)} so far). Say what is wrong and why you think so.`; return; }
  if (last && last.text.trim().toLowerCase() === txt.toLowerCase()) { $("hypMsg").textContent = "This is the same as your last hypothesis. Update it with what your experiment showed."; return; }
  p.hypotheses.push({ text: txt, at: Date.now() });
  $("hypText").value = ""; $("hypMsg").textContent = "Saved.";
  save(); renderHyps(); renderLadder(); renderSteps(); renderRecord();
};
let lastExp = null;
$("expRun").onclick = async () => {
  const t = taskById(curTaskId), call = $("expCall").value.trim(), target = $("expTarget").value, btn = $("expRun");
  btn.disabled = true; btn.textContent = "Running…";
  const r = await py({ type: "run", code: target === "orig" ? t.code : $("revCode").value, call, stdin: lines($("expStdin").value) });
  btn.disabled = false; btn.textContent = "Run experiment";
  const result = r.timeout ? `stopped after ${r.limit} s (possible infinite loop)` : r.internal ? r.error : r.ok ? (r.has_value ? r.value : r.out ? r.out.trim().split("\n").slice(-1)[0] : "(no output)") : r.err.type + ": " + r.err.msg;
  lastExp = { call, target, expect: $("expExpect").value.trim(), result };
  $("expOut").innerHTML = termHTML(call, r); $("expOut").hidden = false;
  $("expNoteWrap").hidden = false; $("expMsg").textContent = ""; $("expNote").focus();
};
$("expLog").onclick = () => {
  const p = P(), note = $("expNote").value.trim();
  if (!lastExp) return;
  if (words(note) < 5) { $("expMsg").textContent = "Write at least 5 words about what the result means."; return; }
  p.experiments.push(Object.assign({}, lastExp, { note, at: Date.now() }));
  lastExp = null; $("expNote").value = ""; $("expNoteWrap").hidden = true; $("expOut").hidden = true;
  save(); renderExps(); renderLadder(); renderSteps(); renderRecord();
};
$("revCode").oninput = e => { P().revised = e.target.value; saveSoon(); };
$("runTests").onclick = runTests;
$("revReset").onclick = () => { const t = taskById(curTaskId); $("revCode").value = t.code; P().revised = t.code; save(); };
$("explText").oninput = e => { P().explanation = e.target.value; saveSoon(); renderStepsSoon(); };
$("explCheck").onclick = checkExplanation;
$("askBtn").onclick = askQuestion;
["ref1", "ref2", "ref3"].forEach((id, i) => $(id).oninput = e => { P().ref["abc"[i]] = e.target.value; saveSoon(); renderStepsSoon(); });
$("studentName").value = store.get(K.name, "");
$("studentName").oninput = e => store.set(K.name, e.target.value);
document.addEventListener("keydown", e => {
  if (e.key === "Tab" && !e.shiftKey && e.target.tagName === "TEXTAREA" && e.target.classList.contains("code")) {
    e.preventDefault(); const el = e.target; el.setRangeText("    ", el.selectionStart, el.selectionEnd, "end"); el.dispatchEvent(new Event("input", { bubbles: true }));
  }
});

/* sharing: tasks and records are packed into the URL, so no server is needed */
const b64u = u8 => { let s = ""; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const unb64u = s => { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
async function pack(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  if (window.CompressionStream) {
    const cs = new CompressionStream("deflate-raw"), w = cs.writable.getWriter(); w.write(bytes); w.close();
    return "z" + b64u(new Uint8Array(await new Response(cs.readable).arrayBuffer()));
  }
  return "r" + b64u(bytes);
}
async function unpack(s) {
  const mode = s[0], u = unb64u(s.slice(1));
  if (mode === "z") {
    const ds = new DecompressionStream("deflate-raw"), w = ds.writable.getWriter(); w.write(u); w.close();
    return JSON.parse(new TextDecoder().decode(await new Response(ds.readable).arrayBuffer()));
  }
  if (mode === "r") return JSON.parse(new TextDecoder().decode(u));
  throw new Error("bad link");
}
const baseURL = () => location.origin === "null" || location.protocol === "file:" ? location.href.split("#")[0] : location.origin + location.pathname;
const recordObj = (p, t, name) => ({ v: 1, student: name, taskId: t.id, taskTitle: t.title, sharedAt: Date.now(), code: t.code, task: t.preset ? null : { title: t.title, problem: t.problem }, progress: p });
function download(filename, text, type) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
$("shareRec").onclick = async () => {
  const p = P(), t = taskById(curTaskId), name = $("studentName").value.trim();
  if (!name) { $("shareMsg").textContent = "Add your name first."; return; }
  if (words(p.explanation) < 15) addFlag(p, "thin_expl", "Shared with an explanation under 15 words.");
  save(); renderRecord();
  const rec = recordObj(p, t, name), url = baseURL() + "#record=" + await pack(rec);
  addSavedRec(rec);
  const cc = $("classCode").value.trim().toUpperCase();
  if (SERVER.server && cc) {
    try { await api("/api/records", { method: "POST", body: { class_code: cc, record: rec } }); store.set("dw2.classCode", cc); $("shareMsg").textContent = "Submitted to your teacher's class " + cc + "."; return; }
    catch (e) { $("shareMsg").textContent = (e.status === 404 ? "That class code does not exist." : "Could not submit: " + e.message) + " A share link is copied instead."; }
  }
  try { await navigator.clipboard.writeText(url); $("shareMsg").textContent = `Link copied (${url.length} characters). Send it to your teacher.` + (url.length > 7000 ? " It is long: if your chat app cuts it off, use Download (.json) instead." : ""); }
  catch (e) { const f = $("recFallback"); f.value = url; f.hidden = false; f.select(); $("shareMsg").textContent = "Copy this link and send it to your teacher."; }
};
$("copyRec").onclick = async () => {
  const md = recordMarkdown(P(), taskById(curTaskId), $("studentName").value.trim());
  try { await navigator.clipboard.writeText(md); toast("Record copied"); }
  catch (e) { const f = $("recFallback"); f.value = md; f.hidden = false; f.select(); toast("Select the text below and copy it"); }
};
$("dlRec").onclick = () => { const t = taskById(curTaskId); download(`DebugWise_${t.id}_learning-record.md`, recordMarkdown(P(), t, $("studentName").value.trim()), "text/markdown"); };
$("dlJson").onclick = () => { const t = taskById(curTaskId); download(`DebugWise_${t.id}_learning-record.json`, JSON.stringify(recordObj(P(), t, $("studentName").value.trim())), "application/json"); };

/* ---------------- own code / assignment creation ---------------- */
function parseTests(src) {
  const out = [], bad = [];
  (src || "").split("\n").map(s => s.trim()).filter(Boolean).forEach(line => {
    const i = line.lastIndexOf("=>");
    if (i < 0 || !line.slice(0, i).trim() || !line.slice(i + 2).trim()) bad.push(line); else out.push({ call: line.slice(0, i).trim(), expect: line.slice(i + 2).trim() });
  });
  return { out, bad };
}
async function buildTask(f, origin) {
  const { out: tests, bad } = parseTests(f.testsSrc);
  if (bad.length) return { error: `Could not read this test line: ${bad[0]}. Use: call => expected value, for example  total([1, 2]) => 3` };
  const r = await py({ type: "tests", code: f.code, tests, stdin: lines(f.stdin || "") }, 9000);
  if (r.timeout) return { error: "The code ran for more than 9 seconds. Check for an infinite loop." };
  if (r.internal || !r.rows) return { error: r.error || "Python is not ready yet. Wait a moment and try again." };
  const badExp = r.rows.find(x => x.bad_expect);
  if (badExp) return { error: `The expected value in "${badExp.call}" is not valid Python. Strings need quotes, e.g. "horse".` };
  if (r.rows.every(x => x.pass)) return { error: tests.length ? "All tests already pass on this code, so there is no bug to debug. Add a test that shows the wrong behaviour." : "The program runs without errors. Add a test line (call => expected) that shows the wrong behaviour." };
  const t = { id: (origin === "own" ? "m-" : "t-") + hash(JSON.stringify([f.title, f.code, tests]) + (origin === "own" ? Date.now() : "")), title: f.title, origin, problem: f.problem, instructions: f.instructions || "", expected: f.expected || "", criteria: f.criteria || [], code: f.code, tests, stdin: f.stdin || "" };
  return { task: t };
}
$("ownBtn").onclick = () => { $("ownPanel").hidden = !$("ownPanel").hidden; if (!$("ownPanel").hidden) $("ownCode").focus(); };
$("ownCancel").onclick = () => { $("ownPanel").hidden = true; };
$("ownPanel").onsubmit = async e => {
  e.preventDefault(); $("ownMsg").textContent = "Checking your code…";
  const code = $("ownCode").value.replace(/\s+$/, "");
  const title = ($("ownProblem").value.trim().split("\n")[0] || "My code").slice(0, 40);
  const r = await buildTask({ title, problem: $("ownProblem").value.trim(), code, testsSrc: $("ownTests").value, stdin: $("ownStdin").value }, "own");
  if (r.error) { $("ownMsg").textContent = r.error; return; }
  customTasks.push(r.task); store.set(K.tasks, customTasks);
  $("ownMsg").textContent = ""; $("ownPanel").hidden = true; e.target.reset();
  switchTask(r.task.id); window.scrollTo({ top: 0, behavior: smooth() });
};
function importTask(o) {
  if (!o || !o.code || !o.title || !Array.isArray(o.tests)) throw new Error("bad task");
  const id = "t-" + hash(JSON.stringify([o.title, o.code, o.tests]));
  let t = customTasks.find(x => x.id === id) || PRESETS.find(x => x.id === id);
  if (!t) { t = { id, title: String(o.title), origin: "link", problem: String(o.problem || ""), instructions: String(o.instructions || ""), expected: String(o.expected || ""), criteria: (o.criteria || []).map(String), code: String(o.code), tests: o.tests.map(x => ({ call: String(x.call), expect: String(x.expect) })), stdin: String(o.stdin || "") }; customTasks.push(t); store.set(K.tasks, customTasks); }
  return t;
}

/* ---------------- teacher view ---------------- */
const EX0 = Date.now() - 3 * 86400000;
const EXAMPLES = [
  { id: "ex1", example: true, student: "Example student A", taskTitle: "Longest word", sharedAt: EX0 + 1500000, code: PRESETS[0].code,
    progress: { startedAt: EX0, hypotheses: [{ text: "I think words[i] does not exist at some point because the error says list index out of range.", at: EX0 + 90000 }, { text: "I think the loop runs one time too many because range(len(words) + 1) makes i reach 3 when there are only 3 words, and words[3] does not exist.", at: EX0 + 520000 }],
      experiments: [{ call: 'longest_word(["cat"])', target: "orig", expect: '"cat"', result: "IndexError: list index out of range", note: "Even one word crashes, so it is not about which word is longest.", at: EX0 + 200000 }, { call: 'longest_word(["cat", "horse", "ox"])', target: "rev", expect: "prints 0,1,2", result: '"horse"', note: "With print(i) I saw i reached 3 and words[3] failed right after.", at: EX0 + 480000 }],
      hints: [{ level: 1, at: EX0 + 260000, payload: { source: "engine", category: "Off-by-one / index out of range", support: "If words has 3 items, which values does i take in the loop?", confidence: 0.92 } }],
      asks: [], tests: [{ pass: true }, { pass: true }, { pass: true }], explanation: "The loop used len(words) + 1 so i reached len(words), which is one past the last index. words[3] does not exist so Python raised IndexError.",
      transfer: { prediction: "It raises IndexError because items[len(items)] is one past the end.", matched: "yes", why: "The last valid index is len - 1." },
      ref: { a: "I first thought the comparison was wrong, the print showed the index went too far.", b: "Only level 1. I think I could have found it with print alone.", c: "Check the loop bounds against the last valid index." }, flags: [], diagnosis: { category: "Off-by-one / index out of range", confidence: 0.92 } } },
  { id: "ex2", example: true, student: "Example student B", taskTitle: "Study minutes", sharedAt: EX0 + 86400000 + 400000, code: PRESETS[2].code,
    progress: { startedAt: EX0 + 86400000, hypotheses: [{ text: "I think the loop is wrong because the program crashes and I do not know why it happens here.", at: EX0 + 86400000 + 40000 }, { text: "Maybe the for loop does not work and something is going wrong with the total variable here.", at: EX0 + 86400000 + 75000 }, { text: "I think the loop is wrong and total is not being added properly in the loop each time it runs.", at: EX0 + 86400000 + 110000 }],
      experiments: [{ call: 'total_minutes(["30"])', target: "orig", expect: "30", result: "TypeError: unsupported operand type(s) for +: 'int' and 'str'", note: "it is wrong still the same error", at: EX0 + 86400000 + 50000 }, { call: 'total_minutes(["1"])', target: "orig", expect: "1", result: "TypeError: unsupported operand type(s) for +: 'int' and 'str'", note: "still wrong error for one item", at: EX0 + 86400000 + 85000 }, { call: 'total_minutes(["1","2"])', target: "orig", expect: "3", result: "TypeError: unsupported operand type(s) for +: 'int' and 'str'", note: "wrong again not adding numbers", at: EX0 + 86400000 + 115000 }],
      hints: [{ level: 1, at: EX0 + 86400000 + 60000, payload: { source: "engine", category: "Type mismatch in an operation", support: "What is the type of each value in the operation on line 5?", confidence: 0.88 } }, { level: 2, at: EX0 + 86400000 + 95000, payload: { source: "engine", support: "Try type(...) on both sides of the operation.", confidence: 0.88 } }, { level: 3, at: EX0 + 86400000 + 125000, payload: { source: "engine", fix_lines: "Line 5 -> total = total + int(entry)", confidence: 0.88, hypothesis_status: "off_track" } }],
      asks: [], tests: [{ pass: true }, { pass: true }, { pass: true }], explanation: "I added int and it works now.",
      transfer: { prediction: "20", matched: "no", why: "" }, ref: { a: "", b: "", c: "" },
      flags: [{ type: "rapid", msg: "Level 2 requested 35 s after level 1.", at: 0 }, { type: "early_fix", msg: "Reached the fix level 2:05 after starting.", at: 0 }, { type: "off_track_fix", msg: "Latest hypothesis was off track when the fix was shown; the misconception may persist.", at: 0 }, { type: "thin_expl", msg: "Shared with an explanation under 15 words.", at: 0 }],
      diagnosis: { category: "Type mismatch in an operation", confidence: 0.88 } } },
  { id: "ex3", example: true, student: "Example student C", taskTitle: "My own code", sharedAt: EX0 + 2 * 86400000, code: "def score(grades):\n    return sum(grades) * weight(grades)",
    progress: { startedAt: EX0 + 2 * 86400000 - 900000, hypotheses: [{ text: "I think weight is wrong because the result is not what I expected for these grades.", at: EX0 + 2 * 86400000 - 800000 }],
      experiments: [{ call: "score([1, 2])", target: "orig", expect: "3", result: "NameError: name 'weight' is not defined", note: "Even a tiny list gives the same error so it is not about the values.", at: EX0 + 2 * 86400000 - 700000 }],
      hints: [{ level: 1, at: EX0 + 2 * 86400000 - 600000, payload: { source: "engine", category: "Name used before it exists", support: "On which line is weight first given a value?", confidence: 0.55 } }],
      asks: [], tests: [{ pass: false }, { pass: false }], explanation: "", transfer: { prediction: "", matched: "", why: "" }, ref: { a: "", b: "", c: "" },
      flags: [{ type: "low_conf", msg: "Diagnosis confidence 55% (Name used before it exists).", at: 0 }], diagnosis: { category: "Name used before it exists", confidence: 0.55 } } }
];
let tTab = "records", selRec = null;
function addSavedRec(rec) {
  const id = "r" + hash(JSON.stringify([rec.student, rec.taskId, rec.sharedAt]));
  rec = Object.assign({}, rec, { id });
  savedRecs = savedRecs.filter(r => r.id !== id).concat(rec).slice(-40);
  store.set(K.recs, savedRecs); return id;
}
const allRecs = () => serverRecs.concat(savedRecs.slice().reverse(), EXAMPLES);
function renderTeacher() {
  $("tabRecords").setAttribute("aria-selected", tTab === "records"); $("tabTasks").setAttribute("aria-selected", tTab === "tasks");
  $("paneRecords").hidden = tTab !== "records"; $("paneTasks").hidden = tTab !== "tasks";
  if (tTab === "records") renderRecords(); else renderTaskAdmin();
}
function renderRecords() {
  const recs = allRecs(), flagged = recs.filter(r => r.progress.flags.length);
  const avg = recs.length ? (recs.reduce((s, r) => s + r.progress.hints.length, 0) / recs.length).toFixed(1) : "0";
  const low = recs.filter(r => r.progress.flags.some(f => f.type === "low_conf")).length;
  $("stats").innerHTML = `<div class="stat"><span class="label">Records</span><b>${recs.length}</b><span class="small muted">${serverRecs.length} from class, ${savedRecs.length} imported, ${EXAMPLES.length} examples</span></div>
    <div class="stat"><span class="label">Need review</span><b>${flagged.length}</b><span class="small muted">at least one flag</span></div>
    <div class="stat"><span class="label">Low-confidence AI</span><b>${low}</b><span class="small muted">check the diagnosis</span></div>
    <div class="stat"><span class="label">Avg hint levels</span><b>${avg}</b><span class="small muted">of 3 per record</span></div>`;
  const list = $("onlyFlagged").checked ? flagged : recs;
  if (!selRec || !recs.find(r => r.id === selRec)) selRec = (serverRecs.length || savedRecs.length ? allRecs()[0] : flagged[0] || recs[0] || {}).id;
  $("recList").innerHTML = list.map(r => {
    const p = r.progress, pass = p.tests ? p.tests.filter(x => x.pass).length + "/" + p.tests.length : "–";
    return `<button class="rec" data-id="${esc(r.id)}" aria-current="${r.id === selRec}">
      <div class="top-line"><b>${esc(r.student)}</b>${r.example ? '<span class="example-tag">EXAMPLE</span>' : `<span class="small muted">${clock(r.sharedAt)}</span>`}</div>
      <div class="small muted">${esc(r.taskTitle)} · hints ${p.hints.length}/3 · tests ${pass}</div>
      ${p.flags.length ? `<div class="chips">${p.flags.map(f => `<span class="chip ${f.type === "low_conf" || f.type === "off_track_fix" ? "bad" : "warn"}">${esc(FLAG_LABEL[f.type] || f.type)}</span>`).join("")}</div>` : '<div class="chips"><span class="chip ok">No flags</span></div>'}
    </button>`;
  }).join("") || `<div class="panel small muted">No records match.</div>`;
  $("recList").querySelectorAll(".rec").forEach(b => b.onclick = () => { selRec = b.dataset.id; renderRecords(); });
  renderRecDetail(recs.find(r => r.id === selRec));
}
function renderRecDetail(r) {
  if (!r) { $("recDetail").innerHTML = ""; return; }
  const p = r.progress, st = p.startedAt, ev = [];
  p.hypotheses.forEach((h, i) => ev.push({ at: h.at, kind: "hyp", label: `Hypothesis ${i + 1}`, html: esc(h.text) }));
  p.experiments.forEach((x, i) => ev.push({ at: x.at, kind: "exp", label: `Experiment ${i + 1}`, html: `<code>${esc(x.call || "run program")}</code> → <code>${esc(x.result)}</code><div class="muted">${esc(x.note)}</div>` }));
  p.hints.forEach(h => ev.push({ at: h.at, kind: "hint", label: `Hint level ${h.level}`, html: esc(h.payload.support || h.payload.fix_lines || "") + (h.payload.confidence != null ? ` <span class="muted small">(${Math.round(h.payload.confidence * 100)}% confidence)</span>` : "") }));
  (p.asks || []).forEach((a, i) => ev.push({ at: a.at, kind: "hint", label: `Question ${i + 1}`, html: `<b>${esc(a.q)}</b><div class="muted">${esc(a.a)}</div>` }));
  ev.sort((a, b) => a.at - b.at);
  const conf = p.diagnosis ? Math.round(p.diagnosis.confidence * 100) : null;
  $("recDetail").innerHTML = `<div class="panel">
    <div class="row" style="justify-content:space-between"><h2>${esc(r.student)} · ${esc(r.taskTitle)}</h2>${r.example ? '<span class="example-tag">EXAMPLE DATA</span>' : ""}</div>
    ${p.flags.length ? p.flags.map(f => `<div class="notice ${f.type === "low_conf" || f.type === "off_track_fix" ? "bad" : "warn"} small"><b>${esc(FLAG_LABEL[f.type] || f.type)}.</b> ${esc(f.msg)}</div>`).join("") : '<div class="notice ok small">No guardrail flags on this record.</div>'}
    ${p.diagnosis ? `<p class="small"><span class="label">AI diagnosis</span><br>${esc(p.diagnosis.category)} <span class="chip ${conf < 60 ? "bad" : "ok"}">${conf}% confidence</span></p>` : ""}
    <h3>Process</h3>
    <ol class="timeline">${ev.map(e => `<li><span class="t">${e.at ? since(e.at, st) : "–"}</span><div><div class="kind k-${e.kind}">${e.label}</div>${e.html}</div></li>`).join("") || '<li class="muted small">No steps logged.</li>'}</ol>
    <h3>Explanation</h3><p>${p.explanation ? esc(p.explanation) : '<span class="muted">Not written</span>'}</p>
    <div class="two">
      <div><h3>Transfer</h3><p class="small">Prediction: ${esc(p.transfer.prediction || "–")}<br>Matched: ${esc(p.transfer.matched || "–")}<br>Principle: ${esc(p.transfer.why || "–")}</p></div>
      <div><h3>Reflection</h3><p class="small">${[p.ref.a, p.ref.b, p.ref.c].filter(Boolean).map(esc).join("<br>") || '<span class="muted">Not written</span>'}</p></div>
    </div>
    ${r.code ? `<h3>Original code</h3><pre class="codeview">${codeHTML(r.code)}</pre>` : ""}
    ${p.revised ? `<h3>Revised code</h3><pre class="codeview">${codeHTML(p.revised)}</pre>` : ""}
  </div>`;
}
async function importRecordText(s) {
  s = s.trim(); let obj;
  const m = s.match(/#record=([A-Za-z0-9_\-]+)/);
  if (m) obj = await unpack(m[1]); else if (s[0] === "{") obj = JSON.parse(s); else obj = await unpack(s);
  if (!obj || !obj.progress || !obj.progress.hypotheses || !obj.taskTitle) throw new Error("bad record");
  const id = addSavedRec(obj); selRec = id; return obj;
}
$("recOpen").onclick = async () => {
  try { const o = await importRecordText($("recPaste").value); $("recPaste").value = ""; $("recMsg").textContent = `Opened ${o.student}’s record.`; renderRecords(); }
  catch (e) { $("recMsg").textContent = "That does not look like a DebugWise record link or file."; }
};
$("recFile").onchange = async e => {
  let n = 0;
  for (const f of e.target.files) { try { await importRecordText(await f.text()); n++; } catch (err) {} }
  $("recMsg").textContent = n ? `Opened ${n} record${n > 1 ? "s" : ""}.` : "No valid record in the selected file(s)."; e.target.value = ""; renderRecords();
};
function renderTaskAdmin() {
  const mine = customTasks.filter(t => t.origin === "teacher");
  $("taskList").innerHTML = (mine.length ? "" : `<div class="panel small muted">Assignments you create appear here with a link to give your students.</div>`)
    + mine.concat(PRESETS).map(t => `<div class="panel">
    <div class="row" style="justify-content:space-between"><h3>${esc(t.title)}</h3><span class="chip ${t.preset ? "info" : "ok"}">${t.preset ? "sample" : "yours"}</span></div>
    <p class="small muted">${esc(t.problem)}</p>
    <div class="row"><button class="btn ghost small" data-copy="${esc(t.id)}">Copy student link</button>
      <button class="btn ghost small" data-open="${esc(t.id)}">Open as student</button>
      ${t.preset ? "" : `<button class="btn ghost small" data-del="${esc(t.id)}">Delete</button>`}</div>
  </div>`).join("");
  $("taskList").querySelectorAll("[data-copy]").forEach(b => b.onclick = async () => {
    const t = taskById(b.dataset.copy);
    const o = { v: 1, title: t.title, problem: t.problem, instructions: t.instructions, expected: t.expected, criteria: t.criteria, code: t.code, tests: t.tests, stdin: t.stdin || "" };
    const url = baseURL() + "#task=" + await pack(o);
    try { await navigator.clipboard.writeText(url); toast("Student link copied"); } catch (e) { $("tfMsg").textContent = url; }
  });
  $("taskList").querySelectorAll("[data-open]").forEach(b => b.onclick = () => { setRole("student"); switchTask(b.dataset.open); window.scrollTo(0, 0); });
  $("taskList").querySelectorAll("[data-del]").forEach(b => b.onclick = () => {
    if (b.dataset.armed) { customTasks = customTasks.filter(t => t.id !== b.dataset.del); store.set(K.tasks, customTasks); if (curTaskId === b.dataset.del) switchTask(PRESETS[0].id); renderTaskAdmin(); return; }
    b.dataset.armed = "1"; b.textContent = "Click again to delete";
  });
}
$("taskForm").onsubmit = async e => {
  e.preventDefault(); $("tfMsg").textContent = "Checking the code…";
  const r = await buildTask({ title: $("tfTitle").value.trim(), problem: $("tfProblem").value.trim(), instructions: $("tfInstr").value.trim(), expected: $("tfExpected").value.trim(),
    criteria: $("tfCriteria").value.split("\n").map(s => s.trim()).filter(Boolean), code: $("tfCode").value.replace(/\s+$/, ""), testsSrc: $("tfTests").value }, "teacher");
  if (r.error) { $("tfMsg").textContent = r.error; return; }
  customTasks.push(r.task); store.set(K.tasks, customTasks);
  e.target.reset(); $("tfMsg").textContent = "Created. Use “Copy student link” to share it."; renderTaskAdmin(); renderTaskSelect();
};
$("tabRecords").onclick = () => { tTab = "records"; renderTeacher(); };
$("tabTasks").onclick = () => { tTab = "tasks"; renderTeacher(); };
$("onlyFlagged").onchange = renderRecords;

/* ---------------- teacher account (backend) ---------------- */
function renderAuth() {
  const box = $("authBox");
  if (!SERVER.server) { box.hidden = true; return; }
  box.hidden = false;
  if (teacherAuth) {
    $("authIn").hidden = true; $("authOut").hidden = false;
    $("authWho").textContent = teacherAuth.email; $("authCode").textContent = teacherAuth.class_code;
  } else { $("authIn").hidden = false; $("authOut").hidden = true; $("authInvite").hidden = !SERVER.invite_required; }
}
async function loadServerRecs() {
  if (!SERVER.server || !teacherAuth) { serverRecs = []; return; }
  try { serverRecs = (await api("/api/records", { auth: true })).records; }
  catch (e) { if (e.status === 401) { teacherAuth = null; store.del("dw2.teacher"); renderAuth(); } serverRecs = []; }
}
async function authSubmit(kind) {
  $("authMsg").textContent = "";
  try {
    const j = await api("/api/teacher/" + kind, { method: "POST", body: { email: $("authEmail").value, password: $("authPass").value, invite: $("authInvite").value } });
    teacherAuth = j; store.set("dw2.teacher", j); $("authPass").value = "";
    await loadServerRecs(); renderAuth(); renderTeacher();
  } catch (e) { $("authMsg").textContent = e.message; }
}
$("authLogin").onclick = () => authSubmit("login");
$("authRegister").onclick = () => authSubmit("register");
$("authLogout").onclick = () => { teacherAuth = null; store.del("dw2.teacher"); serverRecs = []; renderAuth(); renderTeacher(); };
$("authRefresh").onclick = async () => { await loadServerRecs(); renderTeacher(); toast("Class records refreshed"); };

/* ---------------- role switch, settings, routing ---------------- */
function setRole(role) {
  $("roleStudent").setAttribute("aria-pressed", role === "student"); $("roleTeacher").setAttribute("aria-pressed", role === "teacher");
  $("studentView").hidden = role !== "student"; $("teacherView").hidden = role !== "teacher";
  if (role === "teacher") { savedRecs = store.get(K.recs, savedRecs); renderTeacher(); loadServerRecs().then(renderTeacher); }
}
$("roleStudent").onclick = () => setRole("student");
$("roleTeacher").onclick = () => setRole("teacher");
$("aiPill").onclick = () => { $("aiKey").value = aiKey; $("aiModel").value = aiModel; $("aiDialog").showModal(); };
$("aiSave").onclick = () => { aiKey = $("aiKey").value.trim(); aiModel = $("aiModel").value; store.set(K.key, aiKey); store.set(K.model, aiModel); renderAiPill(); renderLadder(); toast(aiKey ? "Claude is on for diagnosis and follow-ups" : "Using built-in diagnosis"); };
$("aiRemove").onclick = () => { aiKey = ""; store.del(K.key); $("aiKey").value = ""; renderAiPill(); renderLadder(); $("aiDialog").close(); toast("Key removed from this browser"); };
$("introClose").onclick = () => { $("intro").hidden = true; store.set(K.intro, 1); };
if (!store.get(K.intro, 0)) $("intro").hidden = false;

async function handleHash() {
  const h = location.hash.slice(1);
  if (!h) return;
  try {
    if (h === "teacher") setRole("teacher");
    else if (h.startsWith("task=")) { const t = importTask(await unpack(h.slice(5))); setRole("student"); switchTask(t.id); toast(`Assignment loaded: ${t.title}`); }
    else if (h.startsWith("record=")) { await importRecordText("#" + h); tTab = "records"; setRole("teacher"); toast("Record opened"); }
  } catch (e) { toast("That link could not be read. Ask for a new one."); }
  if (h !== "teacher") history.replaceState(null, "", location.pathname + location.search);
}
window.addEventListener("hashchange", handleHash);

startWorker();
renderAll(); loadTask();
handleHash();
api("/api/config").then(c => {
  Object.assign(SERVER, c);
  renderAiPill(); renderLadder(); renderAuth();
  const cc = store.get("dw2.classCode", ""); if (cc && $("classCode")) $("classCode").value = cc;
  $("classRow").hidden = false;
}).catch(() => {});
})();
