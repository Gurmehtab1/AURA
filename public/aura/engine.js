/* AURA engine: storage, Signal Fusion and priority assessment.
   All "AI" here is transparent rule-based JavaScript. Outputs are ESTIMATES. */
window.AURA_ENGINE = (function () {
  const D = window.AURA_DATA;
  const KEY = "aura_state_v1";

  const STOP = new Set("a an the and or of to in on at near is are was were has have had it its this that from for with by be been some there their they them i we my our me up out after".split(" "));
  const STATUSES = ["Reported", "Under Review", "Verified", "Responder Assigned", "En Route", "Resolved"];
  const CRITICAL_WORDS = ["unconscious", "trapped", "bleeding", "explosion", "not breathing", "collapsed", "spreading", "critical", "overturned", "drowning", "weapon", "many injured", "heavy smoke", "severe burn", "gas leak", "building collapse", "person pinned", "multiple casualties"];
  const VAGUE_REPORTS = /^(help|accident|big accident|emergency|fire|crash|something happened|need help|urgent|danger|incident|please help)[.!\s]*$/i;
  const INJURY_WORDS = { bleeding: "Bleeding / lacerations", unconscious: "Loss of consciousness", "not breathing": "Respiratory distress", collapsed: "Collapse / cardiac risk", trapped: "Entrapment injuries", injured: "Unspecified injuries", smoke: "Smoke inhalation", burn: "Burns", "heat stroke": "Heat stroke", drowning: "Drowning risk", critical: "Critical injuries reported" };

  const RESOURCES = {
    "Medical Emergency": ["Medical"],
    "Fire": ["Fire", "Medical"],
    "Road Accident": ["Medical", "Police"],
    "Flood": ["Flood Response", "Rescue"],
    "Public Safety Threat": ["Police"],
    "Other Emergency": ["Rescue"],
  };

  function tokens(s) {
    return (s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
  }
  function jaccard(a, b) {
    const A = new Set(tokens(a)), B = new Set(tokens(b));
    if (!A.size || !B.size) return 0;
    let i = 0; A.forEach((w) => B.has(w) && i++);
    return i / (A.size + B.size - i);
  }
  function distKm(a, b) {
    const R = 6371, toR = Math.PI / 180;
    const dLat = (b.lat - a.lat) * toR, dLng = (b.lng - a.lng) * toR;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  const rid = (p) => p + "-" + Math.random().toString(36).slice(2, 6).toUpperCase() + (Date.now() % 1000).toString().padStart(3, "0");

  /* ---------- SIGNAL FUSION ---------- */
  function fusionScore(report, incident, reportsById) {
    const reps = incident.reportIds.map((id) => reportsById[id]).filter(Boolean);
    const cat = report.type === incident.type ? 1 : 0;
    const d = distKm(report, incident);
    const prox = Math.max(0, 1 - d / 1.0); // within 1 km
    const dt = Math.abs(report.time - incident.lastUpdate) / 60000;
    const timeS = Math.max(0, 1 - dt / 90); // within 90 min
    const text = reps.length ? Math.max(...reps.map((r) => jaccard(r.desc, report.desc))) : 0;
    const score = 0.35 * cat + 0.3 * prox + 0.15 * timeS + 0.2 * Math.min(1, text * 2.5);
    return { score, cat, prox, timeS, text, d };
  }

  function fuse(state, report) {
    const byId = Object.fromEntries(state.reports.map((r) => [r.id, r]));
    let best = null;
    state.incidents.forEach((inc) => {
      if (inc.status === "Resolved") return;
      const s = fusionScore(report, inc, byId);
      if (s.cat && s.score >= 0.62 && (!best || s.score > best.s.score)) best = { inc, s };
    });
    if (best) {
      const inc = best.inc;
      inc.reportIds.push(report.id);
      inc.people = Math.max(inc.people, report.people);
      inc.lastUpdate = report.time;
      // shift centroid
      const reps = inc.reportIds.map((id) => (id === report.id ? report : byId[id])).filter(Boolean);
      inc.lat = reps.reduce((a, r) => a + r.lat, 0) / reps.length;
      inc.lng = reps.reduce((a, r) => a + r.lng, 0) / reps.length;
      inc.history.push({ t: report.time, msg: `Signal Fusion merged report ${report.id} (match ${(best.s.score * 100).toFixed(0)}%)` });
      report.incidentId = inc.id;
      report.match = best.s;
      return { incident: inc, merged: true };
    }
    const inc = {
      id: "INC-" + (1000 + state.seq++),
      type: report.type,
      location: report.location,
      lat: report.lat, lng: report.lng,
      createdAt: report.time, lastUpdate: report.time,
      reportIds: [report.id],
      people: report.people,
      verified: false,
      status: "Reported",
      responders: [],
      history: [{ t: report.time, msg: `Incident created from citizen report ${report.id}` }],
    };
    state.incidents.unshift(inc);
    report.incidentId = inc.id;
    return { incident: inc, merged: false };
  }

  /* ---------- PRIORITY ASSESSMENT ---------- */
  function assess(state, inc) {
    const reps = inc.reportIds.map((id) => state.reports.find((r) => r.id === id)).filter(Boolean);
    const text = reps.map((r) => (r.desc || "").split("Reporter safety answers:")[0].toLowerCase()).join(" ");
    const reasons = [];
    let score = D.TYPES[inc.type].base;
    reasons.push(`${inc.type} base risk +${score}`);
    const hits = CRITICAL_WORDS.filter((w) => text.includes(w));
    const kw = Math.min(30, hits.length * 8);
    if (kw) { score += kw; reasons.push(`Potential life-threat indicators (${hits.slice(0, 4).join(", ")}) +${kw}`); }
    const pp = Math.min(22, Math.round(Math.sqrt(inc.people) * 5));
    if (pp) { score += pp; reasons.push(`${inc.people} people affected +${pp}`); }
    const rc = Math.min(16, (reps.length - 1) * 4);
    if (rc) { score += rc; reasons.push(`${reps.length} corroborating reports +${rc}`); }
    if (inc.verified) { score += 6; reasons.push("Verified by coordinator +6"); }
    score = Math.min(100, score);
    const injuries = Object.keys(INJURY_WORDS).filter((k) => text.includes(k)).map((k) => INJURY_WORDS[k]);
    const missing = [];
    if (!reps.some((r) => r.image)) missing.push("No photo evidence (optional)");
    const hasInjuryEvidence = ["bleeding", "unconscious", "not breathing", "collapsed", "trapped", "injured", "burn", "heat stroke", "drowning", "critical"].some((w) => text.includes(w));
    if (!hasInjuryEvidence && inc.type !== "Other Emergency" && !/(?:injury|immediate danger)=(?:yes|no)/i.test(reps.map((r) => r.desc || "").join(" "))) missing.push("Injury / immediate danger status unclear");
    if (!inc.people) missing.push("Number of people affected unknown");
    if (reps.length < 2) missing.push("Single uncorroborated source");
    if (!inc.verified) missing.push("Not verified by coordinator");
    const joined = reps.map((r) => (r.desc || "").split("Reporter safety answers:")[0]).join(" ").trim();
    const answers = reps.map((r) => r.desc || "").join(" ").toLowerCase();
    const unknownAnswers = /(?:injury|trapped|immediate danger)=unknown/.test(answers);
    const vague = joined.length < 28 || VAGUE_REPORTS.test(joined) || /\b(unknown|not sure|dont know|don't know|not mentioned)\b/i.test(joined) || unknownAnswers;
    const explicitLifeThreat = hits.some((w) => ["unconscious", "trapped", "bleeding", "explosion", "not breathing", "collapsed", "spreading", "drowning", "weapon", "many injured", "heavy smoke", "severe burn", "gas leak", "building collapse", "person pinned", "multiple casualties"].includes(w)) || /(?:trapped|immediate danger)=yes/.test(answers);
    let severity = explicitLifeThreat || score >= 70 ? "Critical" : score >= 50 || /injury=yes/.test(answers) ? "High" : score >= 32 ? "Medium" : "Low";
    // Missing evidence is not evidence of safety. Keep serious incident types visible for assessment.
    const needsAssessment = vague || (missing.includes("Injury / immediate danger status unclear") && ["Medical Emergency", "Fire", "Road Accident", "Flood"].includes(inc.type));
    if (needsAssessment && !explicitLifeThreat && severity !== "Critical") severity = ["Medical Emergency", "Fire", "Road Accident", "Flood"].includes(inc.type) ? "High" : severity;
    if (inc.type === "Fire" && /\b(smoke|flame|burning|fire)\b/i.test(text) && severity !== "Critical") severity = "High";
    const priorityState = needsAssessment && !explicitLifeThreat ? "Needs Assessment" : inc.verified ? "Coordinator reviewed" : "Provisional estimate";
    if (/road blocked=yes/.test(answers) && severity === "Low") severity = "Medium";
    const confidence = Math.max(18, Math.min(96, 35 + reps.length * 9 + (inc.verified ? 22 : 0) + (reps.some((r) => r.image) ? 6 : 0) - (needsAssessment ? 20 : 0)));
    if (needsAssessment) reasons.unshift("Insufficient detail: request follow-up / human review; do not interpret missing details as 'no danger'");
    // keywords summary
    const freq = {};
    reps.forEach((r) => new Set(tokens(r.desc)).forEach((w) => (freq[w] = (freq[w] || 0) + 1)));
    const top = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 5).map((x) => x[0]);
    const summary = `${reps.length} citizen report${reps.length > 1 ? "s" : ""} describe${reps.length > 1 ? "" : "s"} a ${inc.type.toLowerCase()} near ${inc.location}. ` +
      (top.length ? `Common signals: ${top.join(", ")}. ` : "") +
      (inc.people ? `Up to ${inc.people} people may be affected.` : "");
    const needs = RESOURCES[inc.type].slice();
    if (inc.type === "Road Accident" && text.includes("trapped")) needs.push("Rescue");
    if (inc.type === "Fire" && inc.people > 20) needs.push("Rescue");
    const recommended = recommend(state, inc, needs);
    return { score, severity, confidence, priorityState, needsAssessment, injuries, missing, summary, reasons, needs, recommended, reports: reps };
  }

  function recommend(state, inc, needs) {
    return needs.map((cap) => {
      const cands = state.responders.filter((r) => r.cap === cap && r.available && !r.assignment)
        .map((r) => ({ r, d: distKm(r, inc) })).sort((a, b) => a.d - b.d);
      return { cap, responder: cands[0] ? cands[0].r : null, d: cands[0] ? cands[0].d : null };
    });
  }

  /* ---------- STORAGE ---------- */
  function fresh() {
    const state = { seq: 1, reports: [], incidents: [], responders: JSON.parse(JSON.stringify(D.RESPONDERS)).map((r) => ({ ...r, assignment: null, ack: false })), notifications: [], currentResponder: "R-101" };
    D.SEED_REPORTS.slice().sort((a, b) => b.ago - a.ago).forEach((s) => {
      const L = D.LOCATIONS[s.loc];
      const rep = { id: rid("RPT"), type: s.type, desc: s.desc, location: L.name, lat: L.lat + (Math.random() - .5) * .002, lng: L.lng + (Math.random() - .5) * .002, people: s.people, time: D.mins(s.ago), image: null, source: "seed" };
      state.reports.push(rep);
      fuse(state, rep);
    });
    // Pre-seed some workflow states
    const inc = state.incidents;
    const tree = inc.find((i) => i.type === "Other Emergency");
    if (tree) { tree.status = "Resolved"; tree.verified = true; tree.history.push({ t: D.mins(100), msg: "Resolved by municipal crew" }); }
    const fire = inc.find((i) => i.type === "Fire");
    if (fire) { fire.verified = true; fire.status = "En Route"; fire.responders = ["R-202"]; const r = state.responders.find((x) => x.id === "R-202"); r.assignment = fire.id; r.ack = true; r.available = true; r.status = "En Route"; fire.history.push({ t: D.mins(40), msg: "Fire Engine 7 assigned and en route" }); }
    const threat = inc.find((i) => i.type === "Public Safety Threat");
    if (threat) { threat.status = "Under Review"; threat.history.push({ t: D.mins(60), msg: "Moved to Under Review" }); }
    return state;
  }
  function load() {
    try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.incidents) return s; } catch (e) {}
    const s = fresh(); save(s); return s;
  }
  function save(s) {
    try { localStorage.setItem(KEY, JSON.stringify(s)); }
    catch (e) { // quota – drop images
      s.reports.forEach((r) => (r.image = r.image ? "[image removed]" : null));
      try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e2) {}
    }
  }

  return { STATUSES, tokens, jaccard, distKm, rid, fuse, assess, recommend, load, save, fresh, fusionScore };
})();
