# Calorie Slider Prototype

Files:
- `index.html`: standalone prototype page
- `app.js`: slider UI, filtering, and combo logic
- `styles.css`: visual system and layout
- `data/taco-bell-items.json`: scraped Taco Bell nutrition dataset
- `data/taco-bell-items.js`: browser-ready Taco Bell dataset
- `scripts/build-taco-bell-data.js`: scraper that rebuilds the Taco Bell data files

To refresh Taco Bell data:
- Run `node scripts/build-taco-bell-data.js`

Current notes:
- The app mixes Taco Bell with three starter staples: Nurri Protein Shake, Mission Zero Tortilla, and Oikos Triple Zero Yogurt.
- Taco Bell currently exposes complete protein and fiber data for most, but not all, menu pages. The prototype hides entries with missing macro fields from combo scoring so it does not fake `0g` values.
