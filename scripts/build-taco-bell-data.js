#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(ROOT, "data");
const CACHE_DIR = path.join("/tmp", "taco-bell-calorie-slider-cache");
const MENU_URL = "https://www.tacobell.com/food";
const USER_AGENT = "Mozilla/5.0";

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 140);
}

function fetchText(url, cacheKey) {
  ensureDir(CACHE_DIR);
  const cachePath = path.join(CACHE_DIR, `${cacheKey}.html`);

  if (fs.existsSync(cachePath)) {
    return fs.readFileSync(cachePath, "utf8");
  }

  const output = execFileSync(
    "curl",
    ["-L", "--http1.1", "-A", USER_AGENT, "--max-time", "30", "-fsSL", url],
    { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 }
  );

  fs.writeFileSync(cachePath, output);
  return output;
}

function extractNextData(html) {
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) {
    throw new Error("Could not find __NEXT_DATA__ script tag.");
  }
  return JSON.parse(match[1]);
}

function parseNumber(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function roundMetric(value) {
  return value === null ? null : Math.round(value * 10) / 10;
}

function extractNutritionField(html, key) {
  const match = html.match(new RegExp(`${key}\\s*:\\s*([0-9.]+)`, "i"));
  return match ? parseNumber(match[1]) : null;
}

function extractNutrition(html) {
  return {
    calories: extractNutritionField(html, "valueCalories"),
    protein: extractNutritionField(html, "valueProteins"),
    fiber: extractNutritionField(html, "valueFibers"),
    carbs: extractNutritionField(html, "valueTotalCarb"),
    fat: extractNutritionField(html, "valueTotalFat"),
    sodium: extractNutritionField(html, "valueSodium"),
  };
}

function buildCategoryLookup(menuCategories) {
  const lookup = new Map();
  for (const category of menuCategories) {
    lookup.set(category.code, { code: category.code, label: category.name });
  }
  return lookup;
}

function collectUniqueProductPages(menuCategories) {
  const pages = new Map();

  for (const category of menuCategories) {
    for (const product of category.products || []) {
      if (product.url) {
        pages.set(product.url, {
          url: product.url,
          name: product.name,
          categoryCode: product.primaryCategoryCode || category.code,
          categoryLabel: category.name,
        });
      }

      for (const group of product.productGroups || []) {
        const baseProduct = group.defaultBaseProduct;
        if (baseProduct && baseProduct.url) {
          pages.set(baseProduct.url, {
            url: baseProduct.url,
            name: baseProduct.name,
            categoryCode: category.code,
            categoryLabel: category.name,
          });
        }
      }
    }
  }

  return [...pages.values()].sort((left, right) => left.url.localeCompare(right.url));
}

function makeEntryBase(product, discoveredPage, pageUrl, categoryLookup) {
  const categoryCode = product.primaryCategoryCode || discoveredPage.categoryCode;
  const category = categoryLookup.get(categoryCode);

  return {
    source: "Taco Bell",
    sourceType: "fast-food-menu",
    sourceUrl: pageUrl,
    categoryCode,
    categoryLabel: category ? category.label : discoveredPage.categoryLabel,
    image: product.images && product.images[0] ? product.images[0].url : "",
    price: parseNumber(product.price && product.price.value),
    isVegetarian: Boolean(product.hasAVA),
    isCombo: Boolean(product.isComboALC),
    isDrink: product.productType === "Drink" || product.foodType === "Sellable_drink",
  };
}

function buildEntriesFromProductPage(product, discoveredPage, pageUrl, categoryLookup) {
  const entryBase = makeEntryBase(product, discoveredPage, pageUrl, categoryLookup);
  const entries = [];

  if (Array.isArray(product.variantOptions) && product.variantOptions.length > 0) {
    for (const variant of product.variantOptions) {
      const nutritionUrl = variant.nutritionInfo && variant.nutritionInfo.url;
      const variantCalories =
        parseNumber(variant.calories) ||
        parseNumber(variant.nutritionInfo && variant.nutritionInfo.calorieCount);

      if (!nutritionUrl && variantCalories === null) {
        continue;
      }

      entries.push({
        ...entryBase,
        id: `tb-${variant.code || product.code}`,
        code: String(variant.code || product.code),
        name: variant.name || product.name,
        serving: variant.drinkSize || "",
        nutritionUrl: nutritionUrl || "",
        caloriesHint: variantCalories,
      });
    }
  }

  const topLevelNutritionUrl =
    product.nutritionIXID ||
    (product.nutritionInfo && product.nutritionInfo.url) ||
    "";

  if (entries.length === 0) {
    entries.push({
      ...entryBase,
      id: `tb-${product.code}`,
      code: String(product.code),
      name: product.name,
      serving: "",
      nutritionUrl: topLevelNutritionUrl,
      caloriesHint:
        parseNumber(product.calories) ||
        parseNumber(product.nutritionInfo && product.nutritionInfo.calorieCount),
    });
  }

  return entries;
}

function enrichEntry(entry) {
  let nutrition = {
    calories: entry.caloriesHint,
    protein: null,
    fiber: null,
    carbs: null,
    fat: null,
    sodium: null,
  };

  if (entry.nutritionUrl) {
    const nutritionHtml = fetchText(entry.nutritionUrl, slugify(entry.nutritionUrl));
    nutrition = {
      ...nutrition,
      ...extractNutrition(nutritionHtml),
    };
  }

  return {
    id: entry.id,
    code: entry.code,
    name: entry.name,
    source: entry.source,
    sourceType: entry.sourceType,
    sourceUrl: entry.sourceUrl,
    categoryCode: entry.categoryCode,
    categoryLabel: entry.categoryLabel,
    image: entry.image,
    price: entry.price,
    serving: entry.serving,
    calories: Math.round((nutrition.calories ?? entry.caloriesHint ?? 0)),
    protein: roundMetric(nutrition.protein),
    fiber: roundMetric(nutrition.fiber),
    carbs: roundMetric(nutrition.carbs),
    fat: roundMetric(nutrition.fat),
    sodium: roundMetric(nutrition.sodium),
    isVegetarian: entry.isVegetarian,
    isCombo: entry.isCombo,
    isDrink: entry.isDrink,
  };
}

function main() {
  ensureDir(OUTPUT_DIR);

  const menuHtml = fetchText(MENU_URL, "menu");
  const menuData = extractNextData(menuHtml);
  const menuCategories = menuData.props.pageProps.menuCategoryProps.menuProductCategories || [];
  const categoryLookup = buildCategoryLookup(menuCategories);
  const productPages = collectUniqueProductPages(menuCategories);
  const collectedEntries = [];

  for (const page of productPages) {
    const pageUrl = `https://www.tacobell.com${page.url}`;
    const pageHtml = fetchText(pageUrl, slugify(page.url));
    const pageData = extractNextData(pageHtml);
    const product = pageData.props.pageProps.product;
    const entries = buildEntriesFromProductPage(product, page, pageUrl, categoryLookup);

    for (const entry of entries) {
      try {
        collectedEntries.push(enrichEntry(entry));
      } catch (error) {
        console.error(`Failed to enrich ${entry.name}: ${error.message}`);
      }
    }
  }

  const deduped = new Map();
  for (const entry of collectedEntries) {
    const key = `${entry.name}::${entry.calories}::${entry.categoryCode}`;
    if (!deduped.has(key)) {
      deduped.set(key, entry);
    }
  }

  const items = [...deduped.values()].sort((left, right) => {
    if (left.categoryLabel !== right.categoryLabel) {
      return left.categoryLabel.localeCompare(right.categoryLabel);
    }
    return left.name.localeCompare(right.name);
  });

  const jsonPath = path.join(OUTPUT_DIR, "taco-bell-items.json");
  const jsPath = path.join(OUTPUT_DIR, "taco-bell-items.js");

  fs.writeFileSync(jsonPath, `${JSON.stringify(items, null, 2)}\n`);
  fs.writeFileSync(jsPath, `window.TACO_BELL_ITEMS = ${JSON.stringify(items, null, 2)};\n`);

  const missingMacros = items.filter((item) => item.protein === null || item.fiber === null);

  console.log(
    JSON.stringify(
      {
        categories: menuCategories.length,
        productPages: productPages.length,
        items: items.length,
        missingMacros: missingMacros.length,
        outputs: { jsonPath, jsPath },
      },
      null,
      2
    )
  );
}

main();
