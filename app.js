const STAPLES = [
  {
    id: "staple-nurri",
    code: "staple-nurri",
    name: "Nurri Protein Shake",
    source: "Staples",
    sourceType: "staple",
    sourceUrl: "",
    categoryCode: "protein-shakes",
    categoryLabel: "Staples",
    image: "",
    price: null,
    serving: "1 bottle",
    calories: 150,
    protein: 30,
    fiber: 0,
    carbs: null,
    fat: null,
    sodium: null,
    isVegetarian: true,
    isCombo: false,
    isDrink: true,
  },
  {
    id: "staple-mission-zero",
    code: "staple-mission-zero",
    name: "Mission Zero Tortilla",
    source: "Staples",
    sourceType: "staple",
    sourceUrl: "",
    categoryCode: "tortillas",
    categoryLabel: "Staples",
    image: "",
    price: null,
    serving: "1 tortilla",
    calories: 25,
    protein: 2,
    fiber: 7,
    carbs: null,
    fat: null,
    sodium: null,
    isVegetarian: true,
    isCombo: false,
    isDrink: false,
  },
  {
    id: "staple-oikos-triple-zero",
    code: "staple-oikos-triple-zero",
    name: "Oikos Triple Zero Yogurt",
    source: "Staples",
    sourceType: "staple",
    sourceUrl: "",
    categoryCode: "yogurt",
    categoryLabel: "Staples",
    image: "",
    price: null,
    serving: "1 cup",
    calories: 90,
    protein: 15,
    fiber: 0,
    carbs: null,
    fat: null,
    sodium: null,
    isVegetarian: true,
    isCombo: false,
    isDrink: false,
  },
];

const sliderConfig = [
  {
    key: "calories",
    label: "Calories",
    min: 150,
    max: 2400,
    step: 25,
    suffix: "cal",
    caption: "Budget for the meal or day block you’re solving for.",
  },
  {
    key: "protein",
    label: "Protein",
    min: 0,
    max: 220,
    step: 5,
    suffix: "g",
    caption: "Protein target. The matcher rewards combos that clear it.",
  },
  {
    key: "fiber",
    label: "Fiber",
    min: 0,
    max: 45,
    step: 1,
    suffix: "g",
    caption: "Fiber target so the result isn’t just lean, but satisfying.",
  },
];

const sourceMeta = [
  { key: "Taco Bell", label: "Taco Bell" },
  { key: "Staples", label: "Staples" },
];

const COMBOS_PER_VIEW = 6;
const DEALS_PER_VIEW = 60;
const MAX_PINNED_QUANTITY = 9;

const state = {
  calories: 700,
  protein: 45,
  fiber: 10,
  search: "",
  includeBreakfast: false,
  sources: new Set(["Taco Bell", "Staples"]),
  pinnedCounts: new Map(),
  rollOffset: 0,
};

const els = {
  heroStats: document.getElementById("heroStats"),
  sliderGrid: document.getElementById("sliderGrid"),
  sourceChips: document.getElementById("sourceChips"),
  availabilityChips: document.getElementById("availabilityChips"),
  selectionSentinel: document.getElementById("selectionSentinel"),
  selectionSection: document.getElementById("selectionSection"),
  selectionSummary: document.getElementById("selectionSummary"),
  pinnedGrid: document.getElementById("pinnedGrid"),
  comboGrid: document.getElementById("comboGrid"),
  comboSummary: document.getElementById("comboSummary"),
  itemGrid: document.getElementById("itemGrid"),
  dealGrid: document.getElementById("dealGrid"),
  dealSummary: document.getElementById("dealSummary"),
  searchInput: document.getElementById("searchInput"),
  itemResults: document.getElementById("itemResults"),
};

let renderFrame = null;
let latestVisibleCombos = [];
let latestAllCombos = [];
let numberInputTimer = null;

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function maybeNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function roundToStep(value, min, step) {
  return Math.round((value - min) / step) * step + min;
}

function sliderByKey(key) {
  return sliderConfig.find((slider) => slider.key === key);
}

function coerceSliderValue(key, rawValue) {
  const slider = sliderByKey(key);
  if (!slider) {
    return 0;
  }
  const rounded = roundToStep(number(rawValue), slider.min, slider.step);
  return clamp(rounded, slider.min, slider.max);
}

function isBreakfastItem(item) {
  const name = (item.name || "").toLowerCase();
  const categoryCode = (item.categoryCode || "").toLowerCase();
  const categoryLabel = (item.categoryLabel || "").toLowerCase();
  const sourceUrl = (item.sourceUrl || "").toLowerCase();

  return (
    categoryCode === "breakfast" ||
    categoryLabel === "breakfast" ||
    sourceUrl.includes("/breakfast/") ||
    name.includes("breakfast")
  );
}

function isOfficialDealItem(item) {
  const name = (item.name || "").toLowerCase();
  const categoryCode = (item.categoryCode || "").toLowerCase();
  const categoryLabel = (item.categoryLabel || "").toLowerCase();

  return (
    item.source === "Taco Bell" &&
    (categoryCode === "deals-and-combos" ||
      categoryCode === "party-packs" ||
      categoryLabel.includes("deals") ||
      categoryLabel.includes("combos") ||
      categoryLabel.includes("party") ||
      /\b(combo|box|pack|cravings|luxe)\b/.test(name))
  );
}

function normalizeFood(item, fallbackSource) {
  const normalized = {
    ...item,
    source: item.source || fallbackSource,
    categoryLabel: item.categoryLabel || fallbackSource,
    calories: number(item.calories),
    protein: maybeNumber(item.protein),
    fiber: maybeNumber(item.fiber),
    carbs: maybeNumber(item.carbs),
    fat: maybeNumber(item.fat),
    sodium: maybeNumber(item.sodium),
    isBreakfast: isBreakfastItem(item),
  };

  normalized.isOfficialDeal = isOfficialDealItem(normalized);
  return normalized;
}

const tacoBellFoods = (window.TACO_BELL_ITEMS || []).map((item) =>
  normalizeFood(item, "Taco Bell")
);
const allFoods = [...STAPLES.map((item) => normalizeFood(item, "Staples")), ...tacoBellFoods];
const trackedFoods = allFoods.filter((item) => item.protein != null && item.fiber != null);
const officialDeals = allFoods.filter((item) => item.isOfficialDeal);
const foodsById = new Map(allFoods.map((item) => [item.id, item]));

const trackedByProteinEfficiency = [...trackedFoods].sort(
  (a, b) => proteinEfficiency(b) - proteinEfficiency(a)
);
const trackedByFiberEfficiency = [...trackedFoods].sort(
  (a, b) => fiberEfficiency(b) - fiberEfficiency(a)
);
const trackedByCalories = [...trackedFoods].sort((a, b) => a.calories - b.calories);

function caloriesTolerance() {
  return Math.max(60, Math.round(state.calories * 0.12));
}

function overUnderLabel(delta) {
  if (delta === 0) {
    return "right on target";
  }
  return delta > 0 ? `+${delta} calorie surplus` : `${delta} calorie deficit`;
}

function overUnderClass(delta) {
  return Math.abs(delta) <= caloriesTolerance() ? "good" : "warn";
}

function formatMacro(value, suffix) {
  if (value == null) {
    return `—${suffix}`;
  }
  return `${Math.round(value * 10) / 10}${suffix}`;
}

function sourceLine(items) {
  const uniqueSources = [...new Set(items.map((item) => item.source))];
  return uniqueSources.join(" + ");
}

function formatCost(value) {
  return value == null ? "price varies" : `$${value.toFixed(2)}`;
}

function totalCostFromEntries(entries) {
  return entries.reduce((sum, entry) => {
    const price = entry.item.price == null ? 0 : entry.item.price;
    return sum + price * entry.quantity;
  }, 0);
}

function formatMealCost(entries) {
  const total = totalCostFromEntries(entries);
  const hasUnknownCost = entries.some((entry) => entry.item.price == null);
  return hasUnknownCost ? `known $${total.toFixed(2)}+` : `$${total.toFixed(2)} total`;
}

function totalQuantity(counts) {
  return [...counts.values()].reduce((sum, quantity) => sum + quantity, 0);
}

function pinnedEntries() {
  return [...state.pinnedCounts.entries()]
    .map(([id, quantity]) => ({ item: foodsById.get(id), quantity }))
    .filter((entry) => entry.item && entry.quantity > 0)
    .sort((left, right) => left.item.name.localeCompare(right.item.name));
}

function totalsFromEntries(entries) {
  return entries.reduce(
    (totals, entry) => ({
      calories: totals.calories + entry.item.calories * entry.quantity,
      protein: totals.protein + entry.item.protein * entry.quantity,
      fiber: totals.fiber + entry.item.fiber * entry.quantity,
    }),
    { calories: 0, protein: 0, fiber: 0 }
  );
}

function filteredFoods() {
  const query = state.search.trim().toLowerCase();

  return allFoods.filter((item) => {
    if (!state.sources.has(item.source)) {
      return false;
    }

    if (!state.includeBreakfast && item.isBreakfast) {
      return false;
    }

    if (!query) {
      return true;
    }

    const haystack = [item.name, item.categoryLabel, item.source].join(" ").toLowerCase();
    return haystack.includes(query);
  });
}

function trackedFoodsOnly(foods) {
  return foods.filter((item) => item.protein != null && item.fiber != null);
}

function remainingTargets() {
  const pinnedTotals = totalsFromEntries(pinnedEntries());

  return {
    calories: Math.max(0, state.calories - pinnedTotals.calories),
    protein: Math.max(0, state.protein - pinnedTotals.protein),
    fiber: Math.max(0, state.fiber - pinnedTotals.fiber),
  };
}

function proteinEfficiency(item) {
  return item.protein / Math.max(item.calories, 1);
}

function fiberEfficiency(item) {
  return item.fiber / Math.max(item.calories, 1);
}

function itemMatchScore(item) {
  const remaining = remainingTargets();
  const targetCalories = Math.max(120, remaining.calories * 0.48 || state.calories * 0.32);
  const targetProtein = remaining.protein;
  const targetFiber = remaining.fiber;

  return (
    Math.abs(item.calories - targetCalories) * 0.42 +
    Math.max(0, targetProtein * 0.45 - item.protein) * 5 +
    Math.max(0, targetFiber * 0.55 - item.fiber) * 4
  );
}

function shortlistFoods(foods) {
  const seen = new Map();
  const candidates = trackedFoodsOnly(foods).filter(
    (item) => item.source === "Staples" || item.calories >= 25
  );
  const candidateSet = new Set(candidates.map((item) => item.id));
  const inCandidates = (item) => candidateSet.has(item.id);

  const buckets = [
    [...candidates].sort((a, b) => itemMatchScore(a) - itemMatchScore(b)).slice(0, 28),
    trackedByProteinEfficiency.filter(inCandidates).slice(0, 14),
    trackedByFiberEfficiency.filter(inCandidates).slice(0, 14),
    trackedByCalories.filter(inCandidates).slice(0, 14),
  ];

  for (const bucket of buckets) {
    for (const item of bucket) {
      seen.set(item.id, item);
    }
  }

  return [...seen.values()].slice(0, 36);
}

function duplicateLimit(item) {
  if (item.isCombo) {
    return 1;
  }
  if (item.source === "Staples") {
    return 4;
  }
  if (item.calories <= 220) {
    return 4;
  }
  if (item.calories <= 360) {
    return 3;
  }
  return 2;
}

function scoreTotals(calories, protein, fiber, itemCount) {
  const delta = calories - state.calories;
  const surplus = Math.max(0, delta);
  const deficit = Math.max(0, -delta);
  const proteinGap = Math.max(0, state.protein - protein);
  const fiberGap = Math.max(0, state.fiber - fiber);
  const proteinBoost = Math.max(0, protein - state.protein);
  const fiberBoost = Math.max(0, fiber - state.fiber);

  return (
    surplus * 1.2 +
    deficit * 0.9 +
    proteinGap * 16 +
    fiberGap * 13 +
    itemCount * 7 -
    Math.min(proteinBoost, 20) * 0.8 -
    Math.min(fiberBoost, 12) * 1.1
  );
}

function stateSignature(comboState) {
  return [...comboState.counts.entries()]
    .sort(([leftId], [rightId]) => leftId.localeCompare(rightId))
    .map(([id, quantity]) => `${id}:${quantity}`)
    .join("|");
}

function uniqueStates(states) {
  const map = new Map();

  for (const comboState of states) {
    const signature = stateSignature(comboState);
    if (!map.has(signature) || comboState.score < map.get(signature).score) {
      map.set(signature, comboState);
    }
  }

  return [...map.values()];
}

function makeBaseComboState() {
  const entries = pinnedEntries();
  const totals = totalsFromEntries(entries);

  return {
    counts: new Map(state.pinnedCounts),
    lastIndex: 0,
    calories: totals.calories,
    protein: totals.protein,
    fiber: totals.fiber,
    itemCount: totalQuantity(state.pinnedCounts),
    score: scoreTotals(totals.calories, totals.protein, totals.fiber, totalQuantity(state.pinnedCounts)),
  };
}

function materializeCombo(comboState) {
  const entries = [...comboState.counts.entries()]
    .map(([id, quantity]) => ({ item: foodsById.get(id), quantity }))
    .filter((entry) => entry.item && entry.quantity > 0)
    .sort(
      (left, right) =>
        right.item.protein - left.item.protein || left.item.name.localeCompare(right.item.name)
    );

  const additions = entries
    .map((entry) => ({
      item: entry.item,
      quantity: Math.max(0, entry.quantity - (state.pinnedCounts.get(entry.item.id) || 0)),
    }))
    .filter((entry) => entry.quantity > 0);

  return {
    signature: stateSignature(comboState),
    entries,
    additions,
    calories: comboState.calories,
    protein: comboState.protein,
    fiber: comboState.fiber,
    itemCount: comboState.itemCount,
    deltaCalories: comboState.calories - state.calories,
    sourceMix: sourceLine(entries.map((entry) => entry.item)),
    cost: totalCostFromEntries(entries),
    costLabel: formatMealCost(entries),
    score: comboState.score,
  };
}

function buildCombos(foods) {
  const candidates = shortlistFoods(foods);
  const baseState = makeBaseComboState();
  const maxCalories = state.calories + Math.max(220, caloriesTolerance() + 120);
  const beamWidth = 120;
  const maxAdditionalItems = Math.max(0, 6 - baseState.itemCount);
  const allStates = [];

  let beam = [baseState];

  for (let depth = 0; depth < maxAdditionalItems; depth += 1) {
    const expanded = [];

    for (const current of beam) {
      for (let index = current.lastIndex; index < candidates.length; index += 1) {
        const item = candidates[index];
        const currentCount = current.counts.get(item.id) || 0;

        if (currentCount >= duplicateLimit(item)) {
          continue;
        }

        const nextCalories = current.calories + item.calories;
        if (nextCalories > maxCalories) {
          continue;
        }

        const nextCounts = new Map(current.counts);
        nextCounts.set(item.id, currentCount + 1);

        const nextState = {
          counts: nextCounts,
          lastIndex: index,
          calories: nextCalories,
          protein: current.protein + item.protein,
          fiber: current.fiber + item.fiber,
          itemCount: current.itemCount + 1,
        };

        nextState.score = scoreTotals(
          nextState.calories,
          nextState.protein,
          nextState.fiber,
          nextState.itemCount
        );

        expanded.push(nextState);
        allStates.push(nextState);
      }
    }

    beam = uniqueStates(expanded).sort((a, b) => a.score - b.score).slice(0, beamWidth);
  }

  return uniqueStates(allStates)
    .filter((comboState) => comboState.itemCount > baseState.itemCount)
    .sort((a, b) => a.score - b.score)
    .slice(0, 24)
    .map(materializeCombo);
}

function itemLibraryScore(item) {
  const remaining = remainingTargets();
  const targetCalories = Math.max(50, remaining.calories * 0.65 || state.calories * 0.25);
  const delta = Math.abs(item.calories - targetCalories);

  return (
    delta * 0.55 +
    Math.max(0, remaining.protein - item.protein) * 4.5 +
    Math.max(0, remaining.fiber - item.fiber) * 4 -
    item.protein * 1.3 -
    item.fiber * 1.2
  );
}

function singleItems(foods) {
  const remaining = remainingTargets();
  const maxCalories = Math.max(80, remaining.calories + caloriesTolerance());

  return trackedFoodsOnly(foods)
    .filter((item) => item.calories <= maxCalories)
    .sort((a, b) => itemLibraryScore(a) - itemLibraryScore(b))
    .slice(0, 18);
}

function filteredOfficialDeals(foods) {
  const foodIds = new Set(foods.map((item) => item.id));

  return officialDeals
    .filter((item) => foodIds.has(item.id))
    .sort((a, b) => {
      const aTracked = a.protein != null && a.fiber != null && a.calories > 0 ? 0 : 1;
      const bTracked = b.protein != null && b.fiber != null && b.calories > 0 ? 0 : 1;
      return (
        aTracked - bTracked ||
        (a.price ?? 999) - (b.price ?? 999) ||
        a.name.localeCompare(b.name)
      );
    })
    .slice(0, DEALS_PER_VIEW);
}

function syncSliderCards() {
  for (const slider of sliderConfig) {
    const range = document.querySelector(`[data-slider-key="${slider.key}"]`);
    const numeric = document.querySelector(`[data-slider-number="${slider.key}"]`);
    const fill = document.querySelector(`[data-slider-fill="${slider.key}"]`);
    const percent = ((state[slider.key] - slider.min) / (slider.max - slider.min)) * 100;

    if (range) {
      range.value = state[slider.key];
    }
    if (numeric) {
      numeric.value = state[slider.key];
    }
    if (fill) {
      fill.style.width = `${percent}%`;
    }
  }
}

function renderHeroStats() {
  const macroGapCount = allFoods.length - trackedFoods.length;
  els.heroStats.innerHTML = `
    <article class="stat-card">
      <span class="stat-label">Food entries loaded</span>
      <span class="stat-value">${allFoods.length}</span>
    </article>
    <article class="stat-card">
      <span class="stat-label">Fully tracked macros</span>
      <span class="stat-value">${trackedFoods.length}</span>
    </article>
    <article class="stat-card">
      <span class="stat-label">Current target</span>
      <span class="stat-value">${state.calories} cal / ${state.protein}p / ${state.fiber}f</span>
    </article>
    <article class="stat-card">
      <span class="stat-label">Official gaps to fill</span>
      <span class="stat-value">${macroGapCount}</span>
    </article>
  `;
}

function renderSliders() {
  els.sliderGrid.innerHTML = sliderConfig
    .map((slider) => {
      const percent = ((state[slider.key] - slider.min) / (slider.max - slider.min)) * 100;
      return `
        <div class="slider-card">
          <div class="slider-topline">
            <span class="slider-label">${slider.label}</span>
            <div class="slider-value-group">
              <input
                class="slider-number"
                type="number"
                inputmode="numeric"
                min="${slider.min}"
                max="${slider.max}"
                step="${slider.step}"
                value="${state[slider.key]}"
                data-slider-number="${slider.key}"
              />
              <span class="slider-suffix">${slider.suffix}</span>
            </div>
          </div>
          <p class="slider-caption">${slider.caption}</p>
          <div class="slider-track">
            <div class="slider-fill" data-slider-fill="${slider.key}" style="width:${percent}%"></div>
          </div>
          <input
            class="range-input"
            type="range"
            min="${slider.min}"
            max="${slider.max}"
            step="${slider.step}"
            value="${state[slider.key]}"
            data-slider-key="${slider.key}"
          />
        </div>
      `;
    })
    .join("");
}

function renderSourceChips() {
  els.sourceChips.innerHTML = sourceMeta
    .map(
      (source) => `
        <button class="chip ${state.sources.has(source.key) ? "active" : ""}" data-source-key="${source.key}" type="button">
          ${source.label}
        </button>
      `
    )
    .join("");
}

function renderAvailabilityChips() {
  els.availabilityChips.innerHTML = `
    <button class="chip ${state.includeBreakfast ? "active" : ""}" data-toggle-breakfast="true" type="button">
      ${state.includeBreakfast ? "Breakfast On" : "Breakfast Off"}
    </button>
  `;
}

function renderPinnedSection() {
  const entries = pinnedEntries();
  const totals = totalsFromEntries(entries);
  const delta = totals.calories - state.calories;
  const hasPins = entries.length > 0;
  const hiddenBreakfastNote = state.includeBreakfast
    ? "Breakfast items are currently eligible."
    : "Breakfast items stay out of suggestions unless you turn them on.";
  const canRoll = latestAllCombos.length > COMBOS_PER_VIEW;
  const currentPage = canRoll ? Math.floor(state.rollOffset / COMBOS_PER_VIEW) + 1 : 1;
  const totalPages = canRoll ? Math.ceil(latestAllCombos.length / COMBOS_PER_VIEW) : 1;

  els.selectionSummary.innerHTML = `
    <div class="selection-summary ${hasPins ? "" : "empty-state"}">
      <div class="selection-summary-main">
        <h3 class="selection-title">${hasPins ? "Pinned meal builder" : "No pinned items yet"}</h3>
        <p class="selection-caption">
          ${hasPins ? "Locked items stay fixed while the app fills around them." : "Pin a chalupa, taco, shake, or anything else, then roll again to build around it."}
        </p>
        <div class="selection-macro-row">
          <span class="macro-pill">${totals.calories} cal</span>
          <span class="macro-pill">${formatMacro(totals.protein, "g protein")}</span>
          <span class="macro-pill">${formatMacro(totals.fiber, "g fiber")}</span>
          <span class="delta-pill ${overUnderClass(delta)}">${overUnderLabel(delta)}</span>
          <span class="macro-pill">${formatMealCost(entries)}</span>
        </div>
        <p class="selection-caption">${hiddenBreakfastNote}</p>
      </div>
      <div class="selection-actions">
        <button class="action-button" type="button" data-selection-action="roll" ${!canRoll ? 'disabled aria-disabled="true"' : ""}>Roll Again${canRoll ? ` (${currentPage}/${totalPages})` : ""}</button>
        <button class="ghost-button" type="button" data-selection-action="clear">Clear Pins</button>
      </div>
    </div>
  `;

  els.pinnedGrid.innerHTML = hasPins
    ? entries
        .map(
          (entry) => `
            <article class="selection-card">
              <div class="selection-card-top">
                <div>
                  <div class="selection-item-name">${entry.item.name}</div>
                  <div class="item-meta">
                    <span>${entry.item.source}</span>
                    <span>${entry.item.categoryLabel}</span>
                    ${entry.item.serving ? `<span>${entry.item.serving}</span>` : ""}
                  </div>
                </div>
                <button class="ghost-button small" type="button" data-remove-item-id="${entry.item.id}">Remove</button>
              </div>
              <div class="qty-row">
                <div class="qty-stepper">
                  <button class="icon-button small" type="button" data-adjust-item-id="${entry.item.id}" data-adjust-by="-1">−</button>
                  <input class="qty-input" type="number" min="0" max="${MAX_PINNED_QUANTITY}" step="1" value="${entry.quantity}" data-quantity-input-id="${entry.item.id}" />
                  <button class="icon-button small" type="button" data-adjust-item-id="${entry.item.id}" data-adjust-by="1">+</button>
                </div>
                <span class="delta-pill ${overUnderClass(entry.item.calories * entry.quantity - state.calories)}">
                  ${entry.item.calories * entry.quantity} cal
                </span>
              </div>
              <div class="card-footer">
                <span class="mini-chip">${formatMacro(entry.item.protein * entry.quantity, "g protein")}</span>
                <span class="mini-chip">${formatMacro(entry.item.fiber * entry.quantity, "g fiber")}</span>
                ${entry.item.price != null ? `<span class="mini-chip">$${(entry.item.price * entry.quantity).toFixed(2)}</span>` : ""}
              </div>
            </article>
          `
        )
        .join("")
    : `<div class="empty-state"><p>Nothing is pinned yet. Use the Pin buttons in the combo cards or food library to anchor the meal.</p></div>`;
}

function comboCard(combo, index) {
  const entriesToShow = combo.additions.length > 0 ? combo.additions : combo.entries;
  const listLabel = combo.additions.length > 0 ? "Suggested additions" : "Suggested meal";

  return `
    <article class="combo-card ${index === 0 ? "best" : ""}">
      <div class="combo-topline">
        <div>
          <span class="rank-badge">#${state.rollOffset + index + 1}</span>
          <p class="addition-note">${listLabel}</p>
        </div>
        <div class="selection-actions">
          <span class="delta-pill ${overUnderClass(combo.deltaCalories)}">${overUnderLabel(combo.deltaCalories)}</span>
          <button class="action-button" type="button" data-use-combo-index="${index}">Use Combo</button>
        </div>
      </div>
      <ul class="combo-list">
        ${entriesToShow
          .map(
            (entry) => `
              <li>
                <div class="combo-item-main">
                  <div class="item-name-line">${entry.quantity > 1 ? `${entry.quantity}x ` : ""}${entry.item.name}</div>
                  <div class="item-meta">
                    <span>${entry.item.source}</span>
                    <span>${entry.item.categoryLabel}</span>
                  </div>
                  <div class="selection-actions">
                    <button class="pin-button small" type="button" data-add-item-id="${entry.item.id}" data-add-amount="1">Pin One</button>
                    ${entry.quantity > 1 ? `<button class="ghost-button small" type="button" data-add-item-id="${entry.item.id}" data-add-amount="${entry.quantity}">Pin All ${entry.quantity}</button>` : ""}
                  </div>
                </div>
                <div class="item-meta">
                  <span>${entry.item.calories * entry.quantity} cal</span>
                  <span>${formatMacro(entry.item.protein * entry.quantity, "g p")}</span>
                  <span>${formatMacro(entry.item.fiber * entry.quantity, "g f")}</span>
                </div>
              </li>
            `
          )
          .join("")}
      </ul>
      <div class="card-footer">
        <span class="macro-pill">Meal total: ${combo.calories} cal</span>
        <span class="macro-pill">${formatMacro(combo.protein, "g protein")}</span>
        <span class="macro-pill">${formatMacro(combo.fiber, "g fiber")}</span>
        <span class="macro-pill">${combo.costLabel}</span>
      </div>
      <div class="source-line">${combo.sourceMix}</div>
    </article>
  `;
}

function itemCard(item) {
  const delta = item.calories - state.calories;
  return `
    <article class="item-card">
      <div class="item-topline">
        <div>
          <h3 class="item-title">${item.name}</h3>
          <div class="item-meta">
            <span>${item.source}</span>
            <span>${item.categoryLabel}</span>
            ${item.serving ? `<span>${item.serving}</span>` : ""}
          </div>
        </div>
        <span class="delta-pill ${overUnderClass(delta)}">${item.calories} cal</span>
      </div>
      <div class="card-footer">
        <span class="mini-chip">${formatMacro(item.protein, "g protein")}</span>
        <span class="mini-chip">${formatMacro(item.fiber, "g fiber")}</span>
        ${item.price != null ? `<span class="mini-chip">$${item.price.toFixed(2)}</span>` : ""}
      </div>
      <div class="selection-actions">
        <button class="pin-button" type="button" data-add-item-id="${item.id}" data-add-amount="1">Pin Item</button>
      </div>
    </article>
  `;
}

function dealCard(item, index) {
  const isTracked = item.protein != null && item.fiber != null && item.calories > 0;
  const macroNote = isTracked
    ? "Full macros available, so this deal can be pinned directly."
    : "Official price is available, but Taco Bell does not expose complete protein/fiber for this deal yet.";

  return `
    <article class="deal-card ${index === 0 ? "featured" : ""}">
      <div class="item-topline">
        <div>
          <h3 class="deal-title">${item.name}</h3>
          <div class="item-meta">
            <span>${item.categoryLabel}</span>
            ${item.serving ? `<span>${item.serving}</span>` : ""}
          </div>
        </div>
        <span class="delta-pill good">${formatCost(item.price)}</span>
      </div>
      <div class="card-footer">
        <span class="mini-chip">${item.calories || "varies"} cal</span>
        <span class="mini-chip">${formatMacro(item.protein, "g protein")}</span>
        <span class="mini-chip">${formatMacro(item.fiber, "g fiber")}</span>
      </div>
      <p class="deal-note">${macroNote}</p>
      <div class="selection-actions">
        <button class="pin-button" type="button" data-add-item-id="${item.id}" data-add-amount="1" ${isTracked ? "" : 'disabled aria-disabled="true"'}>${isTracked ? "Pin Deal" : "Macro data needed"}</button>
      </div>
    </article>
  `;
}

function renderResults() {
  const foods = filteredFoods();
  const trackableFoods = trackedFoodsOnly(foods);
  const hiddenCount = foods.length - trackableFoods.length;

  latestAllCombos = buildCombos(foods);
  latestVisibleCombos = latestAllCombos.slice(state.rollOffset, state.rollOffset + COMBOS_PER_VIEW);
  const items = singleItems(foods);
  const deals = filteredOfficialDeals(foods);
  const trackedDeals = deals.filter(
    (item) => item.protein != null && item.fiber != null && item.calories > 0
  ).length;
  const tolerance = caloriesTolerance();
  const breakfastNote = state.includeBreakfast ? "Breakfast is included." : "Breakfast is excluded by default.";

  els.comboSummary.textContent = hiddenCount
    ? `Showing the closest matches within about ${tolerance} calories of wiggle room. ${breakfastNote} ${hiddenCount} current items are hidden from scoring because Taco Bell does not expose full protein and fiber data on those pages yet.`
    : `Showing the closest matches within about ${tolerance} calories of wiggle room. ${breakfastNote}`;

  els.comboGrid.innerHTML = latestVisibleCombos.length
    ? latestVisibleCombos.map(comboCard).join("")
    : `<div class="empty-state"><p>No combos matched those filters yet. Try widening the sliders, pinning fewer items, or re-enabling a source.</p></div>`;

  els.itemGrid.innerHTML = items.length
    ? items.map(itemCard).join("")
    : `<div class="empty-state"><p>No fully tracked single items fit that search and source mix.</p></div>`;

  els.dealSummary.textContent = `Showing official Taco Bell deal prices from the menu feed. ${trackedDeals} of ${deals.length} visible deals include enough macro data to pin directly.`;
  els.dealGrid.innerHTML = deals.length
    ? deals.map(dealCard).join("")
    : `<div class="empty-state"><p>No Taco Bell boxes or combos match the current filters.</p></div>`;
}

function renderDynamicSections() {
  renderHeroStats();
  renderResults();
  renderPinnedSection();
}

function scheduleDynamicRender() {
  if (renderFrame) {
    return;
  }

  renderFrame = window.requestAnimationFrame(() => {
    renderFrame = null;
    renderDynamicSections();
  });
}

function resetRoll() {
  state.rollOffset = 0;
}

function clampRollOffset() {
  if (latestAllCombos.length > 0 && state.rollOffset >= latestAllCombos.length) {
    state.rollOffset = 0;
  }
}

function addPinnedItem(id, amount = 1) {
  const item = foodsById.get(id);
  if (!item || item.protein == null || item.fiber == null) {
    return;
  }

  const current = state.pinnedCounts.get(id) || 0;
  const next = clamp(current + amount, 0, MAX_PINNED_QUANTITY);

  if (next <= 0) {
    state.pinnedCounts.delete(id);
  } else {
    state.pinnedCounts.set(id, next);
  }

  resetRoll();
  renderDynamicSections();
}

function setPinnedQuantity(id, nextQuantity) {
  const item = foodsById.get(id);
  if (!item) {
    return;
  }

  const quantity = clamp(number(nextQuantity), 0, MAX_PINNED_QUANTITY);

  if (quantity <= 0) {
    state.pinnedCounts.delete(id);
  } else {
    state.pinnedCounts.set(id, quantity);
  }

  resetRoll();
  renderDynamicSections();
}

function useCombo(index) {
  const combo = latestVisibleCombos[index];
  if (!combo) {
    return;
  }

  for (const entry of combo.entries) {
    state.pinnedCounts.set(entry.item.id, clamp(entry.quantity, 0, MAX_PINNED_QUANTITY));
  }

  resetRoll();
  renderDynamicSections();
}

function rollAgain() {
  if (latestAllCombos.length <= COMBOS_PER_VIEW) {
    return;
  }
  state.rollOffset = (state.rollOffset + COMBOS_PER_VIEW) % latestAllCombos.length;
  renderDynamicSections();
}

function updateStickySelectionMode() {
  if (!els.selectionSection || !els.selectionSentinel) {
    return;
  }

  const sentinelTop = els.selectionSentinel.getBoundingClientRect().top;
  els.selectionSection.classList.toggle("is-compact", window.scrollY > 0 && sentinelTop <= 12);
}

function scrollToItemResults() {
  if (!els.itemResults) {
    return;
  }

  window.requestAnimationFrame(() => {
    els.itemResults.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function renderStatic() {
  renderSliders();
  renderSourceChips();
  renderAvailabilityChips();
  renderDynamicSections();
  updateStickySelectionMode();
}

els.sliderGrid.addEventListener("input", (event) => {
  const sliderKey = event.target.dataset.sliderKey;
  const numberKey = event.target.dataset.sliderNumber;

  if (sliderKey && event.target.value !== "") {
    state[sliderKey] = coerceSliderValue(sliderKey, event.target.value);
    syncSliderCards();
    resetRoll();
    scheduleDynamicRender();
    return;
  }

  if (numberKey && event.target.value !== "") {
    clearTimeout(numberInputTimer);
    numberInputTimer = setTimeout(() => {
      state[numberKey] = coerceSliderValue(numberKey, event.target.value);
      syncSliderCards();
      resetRoll();
      renderDynamicSections();
    }, 300);
  }
});

els.sliderGrid.addEventListener("change", (event) => {
  const key = event.target.dataset.sliderKey || event.target.dataset.sliderNumber;
  if (!key) {
    return;
  }

  state[key] = coerceSliderValue(key, event.target.value || state[key]);
  syncSliderCards();
  resetRoll();
  renderDynamicSections();
});

els.sourceChips.addEventListener("click", (event) => {
  const sourceKey = event.target.dataset.sourceKey;
  if (!sourceKey) {
    return;
  }

  if (state.sources.has(sourceKey)) {
    state.sources.delete(sourceKey);
  } else {
    state.sources.add(sourceKey);
  }

  if (state.sources.size === 0) {
    state.sources.add(sourceKey);
  }

  resetRoll();
  renderSourceChips();
  renderDynamicSections();
});

els.availabilityChips.addEventListener("click", (event) => {
  if (!event.target.dataset.toggleBreakfast) {
    return;
  }

  state.includeBreakfast = !state.includeBreakfast;
  resetRoll();
  renderAvailabilityChips();
  renderDynamicSections();
});

els.selectionSummary.addEventListener("click", (event) => {
  const action = event.target.dataset.selectionAction;
  if (!action) {
    return;
  }

  if (action === "roll") {
    rollAgain();
  }

  if (action === "clear") {
    state.pinnedCounts.clear();
    resetRoll();
    renderDynamicSections();
  }
});

els.pinnedGrid.addEventListener("click", (event) => {
  const adjustId = event.target.dataset.adjustItemId;
  const adjustBy = event.target.dataset.adjustBy;
  const removeId = event.target.dataset.removeItemId;

  if (adjustId && adjustBy) {
    addPinnedItem(adjustId, number(adjustBy));
    return;
  }

  if (removeId) {
    state.pinnedCounts.delete(removeId);
    resetRoll();
    renderDynamicSections();
  }
});

els.pinnedGrid.addEventListener("change", (event) => {
  const quantityId = event.target.dataset.quantityInputId;
  if (!quantityId) {
    return;
  }
  setPinnedQuantity(quantityId, event.target.value);
});

els.comboGrid.addEventListener("click", (event) => {
  const addItemId = event.target.dataset.addItemId;
  const addAmount = event.target.dataset.addAmount;
  const useComboIndex = event.target.dataset.useComboIndex;

  if (addItemId) {
    addPinnedItem(addItemId, number(addAmount || 1));
    return;
  }

  if (useComboIndex !== undefined) {
    useCombo(number(useComboIndex));
  }
});

els.itemGrid.addEventListener("click", (event) => {
  const addItemId = event.target.dataset.addItemId;
  if (!addItemId) {
    return;
  }
  addPinnedItem(addItemId, number(event.target.dataset.addAmount || 1));
});

els.dealGrid.addEventListener("click", (event) => {
  const addItemId = event.target.dataset.addItemId;
  if (!addItemId) {
    return;
  }
  addPinnedItem(addItemId, number(event.target.dataset.addAmount || 1));
});

window.addEventListener("scroll", updateStickySelectionMode, { passive: true });
window.addEventListener("resize", updateStickySelectionMode);

els.searchInput.addEventListener("input", (event) => {
  state.search = event.target.value;
  resetRoll();
  renderDynamicSections();
});

els.searchInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") {
    return;
  }

  event.preventDefault();
  state.search = event.target.value;
  resetRoll();
  renderDynamicSections();
  scrollToItemResults();
});

renderStatic();
