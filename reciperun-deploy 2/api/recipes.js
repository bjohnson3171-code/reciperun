// Serverless function — runs on Vercel, NOT in the browser.
// Holds the Spoonacular key secretly via process.env.SPOONACULAR_KEY.
// The front-end calls THIS (/api/recipes), which calls Spoonacular.
// The key is never sent to the browser.

export default async function handler(req, res) {
  const KEY = process.env.SPOONACULAR_KEY;
  if (!KEY) {
    return res.status(500).json({ error: "Recipe service isn't configured yet." });
  }

  const { action = "search", query = "", diet = "", intolerances = "", id = "", number = "12" } = req.query;

  try {
    let url;

    if (action === "search") {
      // Complex search with dietary filters. Returns recipes + basic info.
      const params = new URLSearchParams({
        apiKey: KEY,
        number,
        addRecipeInformation: "true",
        fillIngredients: "true",
        instructionsRequired: "true",
      });
      if (query) params.set("query", query);
      if (diet) params.set("diet", diet);              // e.g. "ketogenic", "vegan"
      if (intolerances) params.set("intolerances", intolerances); // e.g. "peanut,shellfish"
      url = `https://api.spoonacular.com/recipes/complexSearch?${params}`;
    } else if (action === "details") {
      if (!id) return res.status(400).json({ error: "Missing recipe id." });
      url = `https://api.spoonacular.com/recipes/${encodeURIComponent(id)}/information?apiKey=${KEY}&includeNutrition=false`;
    } else {
      return res.status(400).json({ error: "Unknown action." });
    }

    const r = await fetch(url);
    if (!r.ok) {
      // 402 = out of daily points; surface a friendly message.
      if (r.status === 402) return res.status(200).json({ results: [], limit: true });
      return res.status(r.status).json({ error: "Recipe service error." });
    }
    const data = await r.json();

    // Normalize search results into a small, clean shape for the app.
    if (action === "search") {
      const results = (data.results || []).map((rec) => ({
        id: rec.id,
        title: rec.title,
        image: rec.image,
        readyInMinutes: rec.readyInMinutes,
        servings: rec.servings,
        diets: rec.diets || [],
        ingredients: (rec.extendedIngredients || []).map((ing) => ({
          name: ing.nameClean || ing.name,
          amount: ing.amount,
          unit: ing.unit,
          original: ing.original,
        })),
      }));
      return res.status(200).json({ results });
    }

    // details → normalized single recipe with ingredient list
    return res.status(200).json({
      id: data.id,
      title: data.title,
      image: data.image,
      readyInMinutes: data.readyInMinutes,
      servings: data.servings,
      diets: data.diets || [],
      ingredients: (data.extendedIngredients || []).map((ing) => ({
        name: ing.nameClean || ing.name,
        amount: ing.amount,
        unit: ing.unit,
        original: ing.original,
      })),
    });
  } catch (e) {
    return res.status(500).json({ error: "Couldn't reach the recipe service." });
  }
}
