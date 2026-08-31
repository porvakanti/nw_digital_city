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
  /** How much of the query appears in a longer piece of prose, 0..1.
   *
   * similarity() is the wrong tool for a definition. It measures both
   * directions, so a two-word question against a twenty-word sentence scores
   * badly however well those two words match: "lead acid" covers a tenth of
   * what D504's definition says, and gets marked as a poor answer for it.
   *
   * Against prose the only question worth asking is whether the words someone
   * typed are in there.
   */
  function mentions(query, text) {
    const asked = meaningful(query);
    if (!asked.length) return 0;
    const t = norm(text);
    if (t.includes(norm(query))) return 1;
    // Whole words only. Allowing a substring match let "kit" find any
    // definition containing those three letters inside a longer word, which
    // is how "radio kit" stopped finding the plot called Radio Equipment.
    const have = new Set(words(text));
    const found = asked.filter((w) => have.has(w)).length;
    return found / asked.length;
  }

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
          score: Math.max(similarity(query, c.name),
                          similarity(query, `${c.code} ${c.name}`)),
        });
      }
      for (const d of districts) scored.push({ kind: "district", hit: d, score: similarity(query, d) });
      for (const p of plots) scored.push({ kind: "plot", hit: p, score: similarity(query, p) });
      for (const m of markets) scored.push({ kind: "market", hit: m, score: similarity(query, m) });

      scored.sort((a, b) => b.score - a.score);

      /* Definitions are a net under the names, never a rival to them.
       *
       * Nobody types "Batteries" when they mean the thing that keeps a radio
       * site up in a power cut. They type "lead acid", which is the first two
       * words of what the workbook says D504 actually is. Every category has a
       * definition and we were not reading any of them.
       *
       * But only when the names have already failed. Consulted alongside them,
       * "fibre optic" stops finding the plot called Fibre Optic Network and
       * starts finding whichever category's definition mentions fibre, which
       * is a worse answer arrived at more cleverly. So this runs only when
       * nothing was recognised by name, and it requires every word you typed
       * to appear: one word in common is a coincidence, all of them is a
       * reason.
       */
      const NAMED_ENOUGH = 0.55;
      if (!scored[0] || scored[0].score < NAMED_ENOUGH) {
        for (const c of categories) {
          if (!c.definition || mentions(query, c.definition) < 1) continue;
          // Below any name match that got close, and above the floor where
          // the agent gives up. A weak recognition of a real name still beats
          // a definition: "radio kit" should find the Radio Equipment plot,
          // not the cable category whose description happens to say both
          // words somewhere in a numbered list.
          scored.push({
            kind: "category", hit: c, score: 0.45, viaDefinition: true,
          });
        }
        scored.sort((a, b) => b.score - a.score);
      }

      const best = scored[0];
      if (!best || best.score < 0.34) return { kind: "none", confidence: 0, label: "no match" };

      const rival = scored.find((s) => s.kind !== best.kind || s.hit !== best.hit);
      const ambiguous = rival && best.score - rival.score < 0.06;
      return {
        kind: best.kind,
        hit: best.hit,
        alternative: ambiguous ? rival : null,
        confidence: best.score,
        viaDefinition: !!best.viaDefinition,
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
      // Anything other than the projection itself ends the projection. Without
      // this, flying to a category while "what we could be" was on left the
      // whole city greyed out with no way to tell why.
      if (action !== "potential") CITYVIEW.potential(false);
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
      if (action === "asks") {
        CITYVIEW.asks(true);
        return "the four asks";
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
  const BEST = /\b(best|strongest|biggest|largest|most|top|highest|lead|leads|leading|ahead)\b/;
  const GAPS = /\b(gap|gaps|empty|bare|undeveloped|missing|nothing|unbuilt|opportunit\w*)\b|no blueprint|without a blueprint/;
  const SUMMARY = /\b(how many|summary|overview|overall|status|count|total)\b/;
  const RESET = /\b(reset|whole city|zoom out|everything|all of it|back|daylight)\b/;
  const COULD_BE = /\b(could|potential|opportunit\w*|what if|unbuilt|upside|if we built)\b/;
  const AFTER_DARK = /\b(night|dark|readiness|autonom\w*|ai.?ready|reactors?|rfps?)\b|lights? (off|out)/;
  const ASKS = /\b(asks?|asking|takeaways?|actions?|next steps?)\b|call to action|what (should|do|are) (we|i|you)/;

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

  // ------------------------------------------------------------- the actions
  // One function per thing the city can be asked to do. Both the local rules
  // and the model endpoint end up here, so the two paths cannot drift.
  async function runGaps(scope) {
    const gaps = await call("find_gaps", scope);
    const top = gaps.list[0];
    if (scope && scope.kind === "district") await call("render", "district", scope.hit);
    else if (top) await call("render", "focus", top.code);
    if (!top) {
      CITYVIEW.speak(`Every lot in ${scopeText(scope)} has a blueprint.`, "Nothing empty here.");
      return;
    }
    CITYVIEW.speak(
      `${gaps.list.length} empty lots in ${scopeText(scope)}. The biggest is ${top.code} ${top.name}, worth ${euro(top.metrics.spend_eur)}, with no blueprint.`,
      `${top.name} is the most valuable empty lot here.`
    );
  }

  async function runSummary(scope) {
    const s = await call("summarise", scope);
    if (scope && scope.kind === "district") await call("render", "district", scope.hit);
    CITYVIEW.speak(
      `${scopeText(scope)}: ${s.built} of ${s.count} lots built, ${s.bare} still empty, ${euro(s.spend)} of spend.`,
      `${s.bare} lots here are still empty ground.`
    );
  }

  async function runRank(scope, metric, direction) {
    const ranked = await call("rank", scope, metric, direction);
    const pick = direction === "asc"
      ? ranked.list.find((c) => c.blueprint_state === "none") || ranked.list[0]
      : ranked.list[0];
    if (!pick) {
      CITYVIEW.speak(`Nothing to rank in ${scopeText(scope)}.`, "Nothing here.");
      return;
    }
    await call("render", "focus", pick.code);
    const reach = pick.metrics.market_reach;
    CITYVIEW.speak(
      direction === "asc"
        ? `${pick.code} ${pick.name} is the weakest lot in ${scopeText(scope)}: ${euro(pick.metrics.spend_eur)}, ${reach === 0 ? "and no blueprint at all" : plural(reach, "market")}.`
        : `${pick.code} ${pick.name} leads ${scopeText(scope)}: ${plural(reach, "market")}, ${euro(pick.metrics.spend_eur)}.`,
      direction === "asc" ? "This is where I would start." : "This is the one to copy."
    );
  }

  async function runCouldBe(scope) {
    const gaps = await call("find_gaps", scope);
    await call("render", "potential");
    const drafted = categories.filter((c) => c.blueprint_state === "draft").length;
    const unbuilt = gaps.list.reduce((sum, c) => sum + c.metrics.spend_eur, 0);
    CITYVIEW.speak(
      `${drafted} drafts waiting to go active, and ${gaps.list.length} lots with no blueprint carrying ${euro(unbuilt)} between them. This is the skyline if we built them.`,
      "This is what the record says we could build."
    );
  }

  /* The closing beat. Four things the room is being asked to go and do, taken
   * straight from the narrative, so the session ends on an instruction rather
   * than on a picture. */
  async function runAsks() {
    await call("render", "asks");
    // The card carries the words; a caption underneath would only repeat them.
    CITYVIEW.speak(null, "Blueprints today. Smart procurement tomorrow.");
  }

  async function runNight() {
    await call("render", "night");
    const lit = categories.filter((c) => c.metrics.ai_rfps_sample > 0).length;
    CITYVIEW.speak(
      `${lit} of ${categories.length} categories have started any AI-generated RFPs. The lit rooftops are where the rules are structured enough to try.`,
      "The dark roofs are the work still to do."
    );
  }

  async function runReset() {
    await call("render", "reset");
    CITYVIEW.speak(null, null);
  }

  async function runPlace(found) {
    if (found.kind === "category") {
      await call("get_metrics", found.hit.code);
      await call("render", "focus", found.hit.code);
      return; // the renderer's narrator writes the line for a single category
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
      return;
    }
    CITYVIEW.speak(
      "I cannot find that in the city. Try a category code, a category name, a district or a market.",
      "I do not know that one."
    );
  }

  // ------------------------------------------------------------- the model
  // The endpoint is optional. Without it the rules below run, which is also
  // what happens if the endpoint is slow, unreachable or unsure, so the demo
  // never depends on a network call succeeding.
  //
  // Nothing has to be typed to wire it up. Served by app/server.py the page
  // and the agent share an origin, so the page just asks its own address.
  // Opened from a file there is no address to ask, and the local rules run.
  function resolveEndpoint() {
    const asked = new URLSearchParams(location.search).get("agent");
    if (asked) return asked === "off" ? "" : asked;
    if (window.NW_AGENT_ENDPOINT) return window.NW_AGENT_ENDPOINT;
    if (location.protocol === "http:" || location.protocol === "https:") {
      return location.origin;
    }
    return "";
  }

  const ENDPOINT = resolveEndpoint();

  /* Ask the service what it is running so the badge states a fact rather than
   * an assumption. A page opened from a file skips this and says so. */
  function badgeSays(text, live) {
    const badge = document.getElementById("modelBadge");
    if (!badge) return;
    badge.textContent = text;
    badge.dataset.live = live ? "yes" : "no";
    badge.hidden = false;
  }

  async function probe() {
    const badge = document.getElementById("modelBadge");
    if (!badge) return;
    const show = badgeSays;
    if (!ENDPOINT) return show("local rules, no model", false);
    try {
      const reply = await fetch(`${ENDPOINT.replace(/\/$/, "")}/health`, {
        signal: AbortSignal.timeout(3000),
      });
      const health = await reply.json();
      if (!health.ready) return show(`${health.provider}: ${health.detail}`, false);
      show(health.provider === "mock" ? "local rules, no model" : `${health.model}`,
           health.provider !== "mock");
    } catch (err) {
      show("local rules, model unreachable", false);
    }
  }

  function vocabulary() {
    return {
      categories: categories.map((c) => `${c.code} ${c.name}`),
      districts,
      plots,
      markets,
    };
  }

  /* Six seconds, and not a second more.
   *
   * The service will wait half a minute for a model, because on a command line
   * waiting is free. On a stage it is not: six seconds of a still city with 400
   * people watching is already too long, and the local rules answer instantly.
   * So the browser gives up early and lets them. */
  const PATIENCE = 6000;

  async function remotePlan(question) {
    if (!ENDPOINT) return null;
    const controller = new AbortController();
    const giveUp = setTimeout(() => controller.abort(), PATIENCE);
    try {
      const reply = await fetch(`${ENDPOINT.replace(/\/$/, "")}/plan`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question, names: vocabulary() }),
        signal: controller.signal,
      });
      if (!reply.ok) return null;
      const plan = await reply.json();
      badgeSays(plan && plan.source && plan.source !== "error"
        ? `${plan.source}` : "model did not answer", plan && plan.source !== "error");
      return plan;
    } catch (err) {
      // The badge said a model was wired up. If it is not answering, the badge
      // has to stop saying so: claiming a model that is silent is worse than
      // admitting the city is on its own rules.
      badgeSays("model did not answer", false);
      return null;
    } finally {
      clearTimeout(giveUp);
    }
  }

  /** Turn a plan's target back into the scope shape the tools expect. */
  function scopeFromPlan(plan) {
    const kind = plan.target && plan.target.kind;
    const value = plan.target && plan.target.value;
    if (!kind || kind === "none" || !value) return null;
    if (kind === "category") {
      const hit = byCode.get(String(value).toUpperCase());
      return hit ? { kind, hit } : null;
    }
    return { kind, hit: value };
  }

  async function ask(text) {
    const query = String(text || "").trim();
    if (!query) return;
    resetTrace();

    const plan = await remotePlan(query);
    if (plan && plan.intent && plan.intent !== "unknown") {
      logCall("plan", [query], `${plan.intent} via ${plan.source}`);
      await beat(200);
      const scope = scopeFromPlan(plan);
      if (plan.preamble) CITYVIEW.speak(null, plan.preamble);
      switch (plan.intent) {
        case "gaps": return runGaps(scope);
        case "summary": return runSummary(scope);
        case "rank": return runRank(scope, plan.metric, plan.direction);
        case "could_be": return runCouldBe(scope);
        case "night": return runNight();
        case "asks": return runAsks();
        case "reset": return runReset();
        default: return runPlace(scope || { kind: "none" });
      }
    }
    if (plan) logCall("plan", [query], "no decision, using local rules");

    const lower = query.toLowerCase();
    if (RESET.test(lower)) return runReset();
    if (ASKS.test(lower)) return runAsks();
    if (AFTER_DARK.test(lower)) return runNight();

    const found = await call("find_category", query);
    const scope = placeScope(found);
    if (COULD_BE.test(lower)) return runCouldBe(scope);
    if (GAPS.test(lower)) return runGaps(scope);
    if (SUMMARY.test(lower)) return runSummary(scope);
    if (WORST.test(lower) || BEST.test(lower)) {
      const direction = WORST.test(lower) ? "asc" : "desc";
      const metric = /spend|value|money|euro/.test(lower) ? "spend_eur" : "market_reach";
      return runRank(scope, metric, direction);
    }
    return runPlace(found);
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

  /* ------------------------------------------------- what you can ask for
   *
   * The resolver is forgiving, but on a stage the failure mode that matters is
   * typing four letters of a name nobody can quite remember and getting
   * nothing. Showing what those letters already match turns a guess into a
   * choice, and it teaches the vocabulary of the city while you use it.
   */
  const suggestEl = document.getElementById("suggest");
  // The preset chips sit exactly where the suggestions appear, so one gets out
  // of the way of the other.
  const showChips = (on) => {
    const el = document.getElementById("chips");
    if (el) el.style.visibility = on ? "" : "hidden";
  };
  let suggestions = [];
  let picked = -1;

  const POOLS = [
    { kind: "category", label: "lot", items: () => categories },
    { kind: "district", label: "district", items: () => districts },
    { kind: "plot", label: "plot", items: () => plots },
    { kind: "market", label: "market", items: () => markets },
  ];

  function suggestFor(text) {
    const query = String(text || "").trim();
    if (query.length < 2) return [];
    const found = [];
    for (const pool of POOLS) {
      for (const item of pool.items()) {
        const name = pool.kind === "category" ? `${item.code} ${item.name}` : item;
        const score = similarity(query, name);
        if (score > 0.24) {
          found.push({ kind: pool.kind, label: pool.label, score, item, name });
        }
      }
    }
    found.sort((a, b) => b.score - a.score);
    return found.slice(0, 5);
  }

  function renderSuggestions(text) {
    suggestions = suggestFor(text);
    picked = -1;
    if (!suggestions.length) {
      closeSuggestions();
      suggestEl.innerHTML = "";
      return;
    }
    suggestEl.innerHTML = suggestions.map((s, i) => {
      const code = s.kind === "category"
        ? `<span class="code">${s.item.code}</span>` : "";
      const name = s.kind === "category" ? s.item.name : s.item;
      return `<button data-i="${i}">${code}<span>${name}</span>` +
        `<span class="kind">${s.label}</span></button>`;
    }).join("");
    suggestEl.classList.add("on");
    showChips(false);
  }

  function closeSuggestions() {
    suggestEl.classList.remove("on");
    showChips(true);
    picked = -1;
  }

  function highlight() {
    suggestEl.querySelectorAll("button").forEach((button, i) => {
      button.classList.toggle("pick", i === picked);
    });
  }

  function take(index) {
    const choice = suggestions[index];
    if (!choice) return false;
    const text = choice.kind === "category" ? choice.item.code : choice.item;
    input.value = text;
    closeSuggestions();
    submit(text);
    return true;
  }

  suggestEl.addEventListener("click", (e) => {
    const button = e.target.closest("button");
    if (button) take(Number(button.dataset.i));
  });

  input.addEventListener("input", () => renderSuggestions(input.value));
  input.addEventListener("blur", () => setTimeout(closeSuggestions, 150));

  go.addEventListener("click", () => {
    closeSuggestions();
    submit(input.value);
  });

  input.addEventListener("keydown", (e) => {
    const open = suggestEl.classList.contains("on");
    if (open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      picked = (picked + step + suggestions.length + 1) % (suggestions.length + 1) - 1;
      if (picked < -1) picked = suggestions.length - 1;
      highlight();
      return;
    }
    if (e.key === "Escape") return closeSuggestions();
    if (e.key === "Enter") {
      if (open && picked >= 0 && take(picked)) return;
      closeSuggestions();
      submit(input.value);
    }
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
    "What are we asking people to do?",
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

  probe();

  /* ------------------------------------------------------------- the tour
   *
   * The same sequence does three jobs. It introduces the city to somebody
   * seeing it for the first time, it is the run of show on stage, and it is
   * the end-to-end test: walk it through and every part of the application
   * has been exercised in a sensible order.
   *
   * It advances on a click, never on a timer. Nobody wants a demo running
   * ahead of them while a room is asking a question.
   */
  const TOUR = [
    {
      title: "One city, one org.",
      body: "Eight coloured blocks, one for each L2 area in Networks. Inside a block are its plots, and inside a plot are the lots, one for every L4 category. A block is as big as the number of categories it holds, so Access Radio/Fixed is the largest and Transmission Infrastructure is among the smallest. The green between the blocks is parkland, not part of any district.",
      run: () => CITYVIEW.reset(),
    },
    {
      title: "Ask it about a category.",
      body: "That word was typed in plain English. The agent worked out which of the 145 lots was meant, looked up its figures, sent the builder and rebuilt the lot in front of you. Watch the order it builds in: foundation, then the building, then the property, then the roof.",
      run: () => submit("batteries"),
    },
    {
      title: "Four measures, in the order they are built.",
      body: "The foundation is whether the blueprint exists. The height of the building is how widely it has been adopted. The green houses and the red hotel are the spend behind it, exactly as in Monopoly. The light on the roof is AI readiness. The panel on the right is every tool the agent called to get here, in order.",
      run: () => {},
    },
    {
      title: "Where the work is.",
      body: "Eighty-nine of the 145 lots are still empty ground, and some of them carry serious money. The agent ranks them and flies to the biggest.",
      run: () => submit("Where are the biggest gaps?"),
    },
    {
      title: "The city we could be.",
      body: "Everything already built goes grey, and the lots that could be built rise in their place, each one only as tall as its own record justifies. Nothing here is a forecast. It is what is already on the sheet.",
      run: () => submit("What could we build?"),
    },
    {
      title: "After dark.",
      body: "The lights go down and the only thing left glowing is the readiness layer: the categories where the rules are structured enough that an AI-generated RFP has actually been started. The dark roofs are the work still to do.",
      run: () => submit("Show me AI readiness"),
    },
    {
      title: "What we are asking for.",
      body: "Four things, and they are the reason for all of the above.",
      run: () => submit("What are we asking people to do?"),
    },
    {
      title: "Over to you.",
      body: "Type a category code like A221, a category name, a district, or a whole question. Click any building to inspect it. Drag to pan, scroll to zoom, press R to come back here.",
      run: () => CITYVIEW.reset(),
    },
  ];

  const tourEl = document.getElementById("tour");
  const welcomeEl = document.getElementById("welcome");
  let tourStep = -1;

  function showTourStep(index) {
    tourStep = index;
    if (index < 0 || index >= TOUR.length) return endTour();
    const step = TOUR[index];
    tourEl.querySelector(".step").textContent = `Step ${index + 1} of ${TOUR.length}`;
    tourEl.querySelector("h3").textContent = step.title;
    tourEl.querySelector("p").textContent = step.body;
    document.getElementById("tourNext").textContent =
      index === TOUR.length - 1 ? "Finish" : "Next";
    tourEl.classList.add("on");
    step.run();
  }

  function startTour() {
    welcomeEl.classList.remove("on");
    showTourStep(0);
  }

  function endTour() {
    tourStep = -1;
    tourEl.classList.remove("on");
  }

  document.getElementById("tourNext").addEventListener("click", () => showTourStep(tourStep + 1));
  document.getElementById("tourExit").addEventListener("click", endTour);
  document.getElementById("welcomeTour").addEventListener("click", startTour);
  document.getElementById("welcomeSkip").addEventListener("click", () => {
    welcomeEl.classList.remove("on");
  });

  window.addEventListener("keydown", (e) => {
    const el = e.target;
    const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA"
      || el.isContentEditable);
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "t" || e.key === "T") return startTour();
    if (tourStep < 0) return;
    if (e.key === "Escape") endTour();
    // Space, the arrow keys and Page Up / Page Down, because a presenter
    // clicker sends the page keys and nobody wants to be at the laptop.
    if (e.key === " " || e.key === "ArrowRight" || e.key === "PageDown") {
      e.preventDefault();
      showTourStep(tourStep + 1);
    }
    if (e.key === "ArrowLeft" || e.key === "PageUp") {
      e.preventDefault();
      showTourStep(Math.max(0, tourStep - 1));
    }
  });

  /* Offered once. Somebody rehearsing does not want to dismiss a welcome card
   * every time they reload, and on the day it must not be on screen at all. */
  function offerWelcome() {
    let seen = null;
    try {
      seen = window.localStorage.getItem("nw-city-welcomed");
    } catch (err) {
      seen = null; // a file:// origin or blocked storage; show it and move on
    }
    if (seen) return;
    welcomeEl.classList.add("on");
    try {
      window.localStorage.setItem("nw-city-welcomed", "1");
    } catch (err) {
      /* nothing to remember it with, which is survivable */
    }
  }

  if (!new URLSearchParams(location.search).has("clean")) offerWelcome();

  window.NWAgent = {
    ask: submit, tools, similarity, endpoint: ENDPOINT,
    tour: startTour, tourStep: () => tourStep,
  };
})();
