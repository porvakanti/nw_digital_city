/* The agent.
 *
 * An agent is not a chat box bolted onto a chart. It is something with tools
 * and the freedom to decide which to call and in what order. So the tools are
 * real functions over the city data, the decision about which to call is made
 * here, and the calls are shown on screen as they happen, because "trust me,
 * it's thinking" is not an argument anyone in a 400-person room has to accept.
 *
 * This layer is deliberately deterministic. When the model endpoint lands it
 * takes over the parsing and the wording, calling exactly these tools through
 * exactly this interface. If the endpoint is unreachable on the day, this is
 * what runs instead, and the demo still works.
 */
(function () {
  "use strict";

  const CITY = window.NW_CITY;
  const CITYVIEW = window.NWCity;

  // ------------------------------------------------------------- text tools
  const norm = (s) =>
    String(s || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

  const words = (s) => norm(s).split(" ").filter(Boolean);

  const STOP = new Set([
    "the", "a", "an", "of", "and", "or", "for", "in", "on", "to", "is", "are",
    "how", "what", "whats", "show", "me", "we", "our", "us", "doing", "with",
    "about", "tell", "give", "get", "look", "at", "go", "category", "categories",
    "please", "can", "you", "it", "this", "that", "do", "does", "did",
  ]);

  const meaningful = (s) => words(s).filter((w) => !STOP.has(w));

  function bigrams(s) {
    const t = norm(s);
    const out = new Set();
    for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
    return out;
  }

  /** 0..1 similarity between a loose query and a name in the city.
   *
   * Token overlap is scored both ways on purpose. Measuring only how much of
   * the query matched makes "how is energy doing" resolve to a category whose
   * name merely contains the word, because one matched token out of one looks
   * perfect. Weighing how much of the *target* was covered lets the district
   * actually called Energy win, which is what the question meant.
   */
  function similarity(query, text) {
    const q = norm(query);
    const t = norm(text);
    if (!q || !t) return 0;
    if (q === t) return 1;

    const qt = new Set(meaningful(query));
    const tt = new Set(words(text));
    let shared = 0;
    for (const w of qt) if (tt.has(w)) shared++;
    const precision = qt.size ? shared / qt.size : 0;
    const recall = tt.size ? shared / tt.size : 0;
    const overlap = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;

    const qb = bigrams(query);
    const tb = bigrams(text);
    let common = 0;
    for (const g of qb) if (tb.has(g)) common++;
    const dice = qb.size + tb.size ? (2 * common) / (qb.size + tb.size) : 0;

    // A short exact phrase inside a longer name is still a strong signal.
    const containment = t.includes(q) ? 0.72 + 0.2 * (q.length / t.length) : 0;

    return Math.max(overlap * 0.97, dice, containment);
  }

  // ------------------------------------------------------------------ index
  const categories = CITY.categories;
  const byCode = new Map(categories.map((c) => [c.code.toUpperCase(), c]));
  const districts = [...new Set(categories.map((c) => c.district))];
  const plots = [...new Set(categories.map((c) => c.plot))];
  const markets = CITY.meta.markets;

  const euro = (n) =>
    n >= 1e6 ? `€${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}m`
      : n > 0 ? `€${Math.round(n / 1e3)}k` : "no recorded spend";

  const plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + "s"}`;

  // ------------------------------------------------------------------ tools
  // Each returns a plain result plus a short string for the trace panel.
  const tools = {
    /** Resolve messy text to something in the city. */
    find_category(query) {
      const code = norm(query).toUpperCase().replace(/\s/g, "");
      if (byCode.has(code)) {
        return { kind: "category", hit: byCode.get(code), confidence: 1, label: code };
      }

      const scored = [];
      for (const c of categories) {
        scored.push({
          kind: "category",
          hit: c,
          score: Math.max(similarity(query, c.name), similarity(query, `${c.code} ${c.name}`)),
        });
      }
      for (const d of districts) scored.push({ kind: "district", hit: d, score: similarity(query, d) });
      for (const p of plots) scored.push({ kind: "plot", hit: p, score: similarity(query, p) });
      for (const m of markets) scored.push({ kind: "market", hit: m, score: similarity(query, m) });

      scored.sort((a, b) => b.score - a.score);
      const best = scored[0];
      if (!best || best.score < 0.34) return { kind: "none", confidence: 0, label: "no match" };

      const rival = scored.find((s) => s.kind !== best.kind || s.hit !== best.hit);
      const ambiguous = rival && best.score - rival.score < 0.06;
      return {
        kind: best.kind,
        hit: best.hit,
        alternative: ambiguous ? rival : null,
        confidence: best.score,
        label: best.kind === "category" ? best.hit.code : best.hit,
      };
    },

    get_metrics(code) {
      const c = byCode.get(String(code).toUpperCase());
      if (!c) return null;
      return {
        category: c,
        label: `${plural(c.metrics.market_reach, "market")} · ${euro(c.metrics.spend_eur)}`,
      };
    },

    /** Categories in a scope, ordered by a metric. */
    rank(scope, metric, direction) {
      let pool = categories;
      // Ranking within a single category is meaningless, so a category scope is
      // read as the district it sits in.
      if (scope && scope.kind === "category") {
        pool = pool.filter((c) => c.district === scope.hit.district);
      }
      if (scope && scope.kind === "district") pool = pool.filter((c) => c.district === scope.hit);
      if (scope && scope.kind === "plot") pool = pool.filter((c) => c.plot === scope.hit);
      if (scope && scope.kind === "market") {
        pool = pool.filter((c) => c.markets.includes(scope.hit));
      }
      const sorted = pool.slice().sort((a, b) => {
        const d = (b.metrics[metric] || 0) - (a.metrics[metric] || 0);
        return direction === "asc" ? -d : d;
      });
      return { list: sorted, label: `${sorted.length} in scope` };
    },

    /** The plots with real money on them and nothing built. */
    find_gaps(scope) {
      const ranked = tools.rank(scope, "spend_eur", "desc").list;
      const gaps = ranked.filter((c) => c.blueprint_state === "none");
      return { list: gaps, label: `${gaps.length} bare` };
    },

    summarise(scope) {
      const pool = tools.rank(scope, "spend_eur", "desc").list;
      const built = pool.filter((c) => c.blueprint_state !== "none");
      const spend = pool.reduce((sum, c) => sum + c.metrics.spend_eur, 0);
      return {
        count: pool.length,
        built: built.length,
        bare: pool.length - built.length,
        spend,
        label: `${built.length}/${pool.length} built · ${euro(spend)}`,
      };
    },

    /** Drive the city. The visualisation is the agent's output surface. */
    render(action, argument) {
      if (action === "focus") return CITYVIEW.focus(argument) ? "flying" : "not found";
      if (action === "district") return CITYVIEW.focusDistrict(argument) ? "flying" : "not found";
      if (action === "potential") {
        const shown = CITYVIEW.potential(true);
        return `${shown.lots} lots raised`;
      }
      if (action === "night") {
        CITYVIEW.night(true);
        return "after dark";
      }
      CITYVIEW.potential(false);
      CITYVIEW.night(false);
      CITYVIEW.reset();
      return "wide";
    },
  };

  // ------------------------------------------------------------------ trace
  const traceEl = document.getElementById("trace");
  const callsEl = document.getElementById("calls");

  function resetTrace() {
    callsEl.innerHTML = "";
    traceEl.classList.add("on");
  }

  /** Arguments are shown, so they have to read as something, not as JSON. */
  function describe(value) {
    if (value === undefined || value === null) return "";
    if (typeof value === "string") {
      return `"${value.length > 24 ? value.slice(0, 23) + "…" : value}"`;
    }
    if (value.kind === "category") return value.hit.code;
    if (value.kind) return `"${value.hit}"`;
    return String(value);
  }

  function logCall(fn, args, out) {
    const row = document.createElement("div");
    row.className = "call";
    const shown = args.map(describe).filter(Boolean).join(", ");
    row.innerHTML = `<span class="fn">${fn}(${shown})</span><span class="out">${out}</span>`;
    callsEl.appendChild(row);
  }

  // Tool calls are near-instant over 145 rows, which makes the panel unreadable.
  // The pause is presentation rather than fake work. The calls below are real, and
  // when the model is wired in its latency replaces this entirely.
  const beat = (ms) => new Promise((r) => setTimeout(r, ms));

  async function call(fn, ...args) {
    const result = tools[fn](...args);
    const out = result && result.label ? result.label
      : typeof result === "string" ? result
        : result ? "ok" : "none";
    logCall(fn, args, out);
    await beat(240);
    return result;
  }

  // ----------------------------------------------------------------- intents
  const WORST = /\b(worst|weakest|behind|lagging|lowest|least|poorest)\b/;
  const BEST = /\b(best|strongest|biggest|largest|most|top|highest|leading)\b/;
  const GAPS = /\b(gap|gaps|empty|bare|gaps|undeveloped|missing|nothing|unbuilt|opportunit\w*)\b/;
  const SUMMARY = /\b(how many|summary|overview|overall|status|count|total)\b/;
  const RESET = /\b(reset|whole city|zoom out|everything|all of it|back|daylight)\b/;
  const COULD_BE = /\b(could|potential|opportunit\w*|what if|unbuilt|upside|if we built)\b/;
  const AFTER_DARK = /\b(night|dark|readiness|autonom\w*|ai.?ready|reactors?|rfps?)\b/;

  /** City-wide questions accept a place as scope, never a single category.
   *  Without this, "what could we build?" latches onto whichever category name
   *  scores highest against the question and scopes the answer to it. */
  function placeScope(found) {
    if (!found || found.kind === "none" || found.kind === "category") return null;
    return found;
  }

  function scopeText(scope) {
    if (!scope || scope.kind === "none") return "Networks";
    return scope.kind === "category" ? scope.hit.name : scope.hit;
  }

  async function ask(text) {
    const query = String(text || "").trim();
    if (!query) return;
    resetTrace();

    if (RESET.test(query.toLowerCase())) {
      await call("render", "reset");
      CITYVIEW.speak(null, null);
      return;
    }

    if (AFTER_DARK.test(query.toLowerCase())) {
      await call("render", "night");
      const lit = categories.filter((c) => c.metrics.ai_rfps_sample > 0).length;
      CITYVIEW.speak(
        `${lit} of ${categories.length} categories have started any AI-generated RFPs. The lit rooftops are where the rules are structured enough to try.`,
        "The dark roofs are the work still to do."
      );
      return;
    }

    const found = await call("find_category", query);

    // Ranking, gaps and summaries operate on whatever scope was named.
    const lower = query.toLowerCase();
    const scope = found.kind === "none" ? null : found;

    if (COULD_BE.test(lower)) {
      const gaps = await call("find_gaps", placeScope(found));
      const raised = await call("render", "potential");
      const drafted = categories.filter((c) => c.blueprint_state === "draft").length;
      const unbuiltSpend = gaps.list.reduce((sum, c) => sum + c.metrics.spend_eur, 0);
      CITYVIEW.speak(
        `${drafted} drafts waiting to go active, and ${gaps.list.length} lots with no blueprint carrying ${euro(unbuiltSpend)} between them. This is the skyline if we built them.`,
        "This is what the record says we could build."
      );
      return;
    }

    if (GAPS.test(lower)) {
      const gaps = await call("find_gaps", placeScope(found));
      const top = gaps.list[0];
      if (scope && scope.kind === "district") await call("render", "district", scope.hit);
      else if (top) await call("render", "focus", top.code);
      if (!top) {
        CITYVIEW.speak(`Every lot in ${scopeText(scope)} has a blueprint.`, "Nothing bare here.");
        return;
      }
      CITYVIEW.speak(
        `${gaps.list.length} empty lots in ${scopeText(scope)}. The biggest is ${top.code} ${top.name}, worth ${euro(top.metrics.spend_eur)}, with no blueprint.`,
        `${top.name} is the most valuable empty lot here.`
      );
      return;
    }

    if (SUMMARY.test(lower)) {
      const s = await call("summarise", placeScope(found));
      if (scope && scope.kind === "district") await call("render", "district", scope.hit);
      CITYVIEW.speak(
        `${scopeText(scope)}: ${s.built} of ${s.count} lots built, ${s.bare} still empty, ${euro(s.spend)} of spend.`,
        `${s.bare} lots here are still empty ground.`
      );
      return;
    }

    if (WORST.test(lower) || BEST.test(lower)) {
      const direction = WORST.test(lower) ? "asc" : "desc";
      const metric = /spend|value|money|euro/.test(lower) ? "spend_eur" : "market_reach";
      const ranked = await call("rank", scope, metric, direction);
      const pick = direction === "asc"
        ? ranked.list.find((c) => c.blueprint_state === "none") || ranked.list[0]
        : ranked.list[0];
      await call("render", "focus", pick.code);
      const reach = pick.metrics.market_reach;
      CITYVIEW.speak(
        direction === "asc"
          ? `${pick.code} ${pick.name} is the weakest lot in ${scopeText(scope)}: ${euro(pick.metrics.spend_eur)}, ${reach === 0 ? "and no blueprint at all" : plural(reach, "market")}.`
          : `${pick.code} ${pick.name} leads ${scopeText(scope)}: ${plural(reach, "market")}, ${euro(pick.metrics.spend_eur)}.`,
        direction === "asc" ? "This is where I'd start." : "This is the one to copy."
      );
      return;
    }

    if (found.kind === "none") {
      CITYVIEW.speak(
        `I can't find that in the city. Try a category code, a category name, a district or a market.`,
        "I don't know that one."
      );
      return;
    }

    if (found.kind === "category") {
      await call("get_metrics", found.hit.code);
      await call("render", "focus", found.hit.code);
      // the renderer's own narrator writes the line for a single category
      return;
    }

    if (found.kind === "district") {
      const s = await call("summarise", found);
      await call("render", "district", found.hit);
      CITYVIEW.speak(
        `${found.hit}: ${s.built} of ${s.count} lots built, ${euro(s.spend)} of spend.`,
        `${found.hit}: ${s.bare} lots still empty.`
      );
      return;
    }

    if (found.kind === "plot") {
      const inPlot = categories.filter((c) => c.plot === found.hit);
      const lead = inPlot.slice().sort((a, b) => b.metrics.market_reach - a.metrics.market_reach)[0];
      await call("render", "focus", lead.code);
      CITYVIEW.speak(
        `${found.hit} holds ${plural(inPlot.length, "category", "categories")}. ${lead.code} ${lead.name} is the most adopted.`,
        `${found.hit}: ${plural(inPlot.length, "building")}.`
      );
      return;
    }

    if (found.kind === "market") {
      const inMarket = categories.filter((c) => c.markets.includes(found.hit));
      const lead = inMarket.slice().sort((a, b) => b.metrics.spend_eur - a.metrics.spend_eur)[0];
      if (!lead) {
        CITYVIEW.speak(`${found.hit} has no blueprints in this extract.`, "Nothing here yet.");
        return;
      }
      await call("render", "focus", lead.code);
      CITYVIEW.speak(
        `${found.hit} has adopted ${plural(inMarket.length, "blueprint")}. The largest is ${lead.code} ${lead.name}.`,
        `${found.hit} is building in ${plural(inMarket.length, "category", "categories")}.`
      );
    }
  }

  // --------------------------------------------------------------------- UI
  const input = document.getElementById("askInput");
  const go = document.getElementById("askGo");

  let busy = false;
  async function submit(text) {
    if (busy) return;
    busy = true;
    go.disabled = true;
    try {
      await ask(text);
    } finally {
      busy = false;
      go.disabled = false;
    }
  }

  go.addEventListener("click", () => submit(input.value));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit(input.value);
  });

  // Preset chips for the beats that have to land. Typing on stage is dead air;
  // these make the scripted moments one click while the box stays open for
  // whatever the room shouts out.
  const PRESETS = [
    "Spring 2/R",
    "batteries",
    "Where are the biggest gaps?",
    "What could we build?",
    "Show me AI readiness",
    "How is Energy doing?",
  ];
  const chips = document.getElementById("chips");
  for (const preset of PRESETS) {
    const button = document.createElement("button");
    button.textContent = preset;
    button.addEventListener("click", () => {
      input.value = preset;
      submit(preset);
    });
    chips.appendChild(button);
  }

  window.NWAgent = { ask: submit, tools, similarity };
})();
