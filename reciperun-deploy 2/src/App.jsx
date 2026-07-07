import { useState, useEffect, useCallback, useRef } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// PALETTE
// ─────────────────────────────────────────────────────────────────────────────
const C = {
  bg:"#0D0F0E",surface:"#161A18",card:"#1E2422",border:"#2A302D",
  accent:"#3EE8A0",accentDim:"#1A5C40",warn:"#F5A623",
  danger:"#FF5C5C",text:"#F0F4F2",muted:"#6B7B74",purple:"#9D7FEA",
};

// ─────────────────────────────────────────────────────────────────────────────
// PERSISTENCE
// ─────────────────────────────────────────────────────────────────────────────
// localStorage with safe fallback
const LS = {
  get:(k,fb=null)=>{try{const v=localStorage.getItem(k);return v?JSON.parse(v):fb;}catch{return fb;}},
  set:(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch{}},
  del:(k)=>{try{localStorage.removeItem(k);}catch{}},
};
const TRIP_KEY="reciperun_trip";
const PANTRY_KEY="reciperun_pantry";
const HIST_KEY="reciperun_history";

// ─────────────────────────────────────────────────────────────────────────────
// AI EXTRACTION  — uses Anthropic API (works both in Claude.ai sandbox & Vercel)
// ─────────────────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT=`You are a recipe ingredient extractor. Always respond with ONLY a JSON object — no markdown, no preamble.
Format: { "recipeName": "string", "servings": number, "ingredients": [{ "name": "string", "qty": "string", "category": "Meat|Seafood|Produce|Dairy|Bakery|Pantry|Spices|Frozen|Beverages" }] }
Rules: combine duplicates, use clear simple names, qty is the full amount string.`;

// Unified AI caller — works in Claude.ai artifact sandbox AND deployed Vercel app
async function callClaude(messages, maxTokens=1000, systemOverride=null){
  const system = systemOverride || SYSTEM_PROMPT;
  const body = {
    model:"claude-sonnet-4-20250514",
    max_tokens: maxTokens,
    system,
    messages,
  };

  // Try the Anthropic API directly (works when deployed with a proxy or CORS key)
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify(body),
    });
    if(res.ok){
      const data = await res.json();
      return data.content.map(b=>b.text||"").join("").replace(/```json|```/g,"").trim();
    }
  } catch(_){}

  // Fallback: use window.ai (available in some sandbox environments)
  if(typeof window !== "undefined" && window.ai){
    const result = await window.ai.generateText({ prompt: messages.map(m=>m.content).join("\n"), systemPrompt: system });
    return (result.text||result).replace(/```json|```/g,"").trim();
  }

  throw new Error("NO_API");
}

// Smart local parser — runs entirely in-browser, no API needed
// Used as fallback when running inside Claude.ai artifact sandbox
// Units we recognize when they trail a quantity (e.g. "2 lbs", "1 cup")
const UNIT_WORDS = ["lb","lbs","pound","pounds","oz","ounce","ounces","cup","cups","tbsp","tbsps","tablespoon","tablespoons","tsp","tsps","teaspoon","teaspoons","clove","cloves","g","gram","grams","kg","ml","l","liter","liters","can","cans","pkg","pkgs","package","packages","slice","slices","piece","pieces","bunch","bunches","handful","handfuls","stick","sticks","bag","bags","box","boxes","jar","jars","bottle","bottles","pack","packs","head","heads","dozen","pint","pints","quart","quarts","gallon","gallons","container","containers","loaf","loaves"];
// Number words that can lead a quantity ("a dozen eggs", "two onions")
const NUM_WORDS = {a:"1",an:"1",one:"1",two:"2",three:"3",four:"4",five:"5",six:"6",seven:"7",eight:"8",nine:"9",ten:"10",dozen:"12",half:"½"};

// keyword → category. Order matters: first match wins, so specific/whole-food
// categories are checked before generic Pantry. (Fixes pasta→Bakery bug.)
const CAT_RULES = [
  ["Seafood", /\b(salmon|shrimp|fish|tuna|cod|tilapia|crab|lobster|scallop|prawn|halibut|anchov|sardine)\b/i],
  ["Meat",    /\b(chicken|beef|pork|lamb|turkey|sausage|bacon|steak|thigh|thighs|breast|breasts|drumstick|ground\s|ribs?|ham|veal|chorizo|prosciutto|wing|wings|mince)\b/i],
  ["Produce", /\b(garlic|onion|onions|tomato|tomatoes|lemon|lemons|lime|limes|spinach|kale|zucchini|basil|cilantro|parsley|avocado|avocados|cabbage|carrot|carrots|celery|mushroom|mushrooms|broccoli|potato|potatoes|apple|apples|banana|bananas|ginger|jalapeño|jalapeno|lettuce|cucumber|cucumbers|berry|berries|strawberr|blueberr|grape|grapes|mango|mangoes|pear|pears|peach|peaches|corn|scallion|scallions|shallot|shallots|herb|herbs|salad|pepper|peppers|squash|eggplant|asparagus|cauliflower|leek|leeks|radish|beet|beets|orange|oranges)\b/i],
  ["Dairy",   /\b(milk|butter|cheese|parmesan|mozzarella|cheddar|yogurt|yoghurt|sour cream|cream|egg|eggs|feta|ricotta|cottage|half and half|half-and-half)\b/i],
  ["Bakery",  /\b(bread|tortilla|tortillas|roll|rolls|bun|buns|bagel|bagels|baguette|croissant|muffin|pita|naan|loaf)\b/i],
  ["Frozen",  /\b(frozen|ice cream|popsicle)\b/i],
  ["Beverages",/\b(wine|beer|juice|soda|coffee|tea|sparkling|cola|lemonade)\b/i],
  ["Spices",  /\b(salt|seasoning|cumin|paprika|oregano|thyme|rosemary|flakes|cinnamon|turmeric|nutmeg|cayenne|chili powder|garlic powder|onion powder|bay leaf|vanilla)\b/i],
  ["Pantry",  /\b(oil|olive oil|broth|stock|vinegar|soy sauce|tomato sauce|pasta|noodle|noodles|penne|spaghetti|macaroni|rice|beans|lentil|can|canned|sun.?dried|chipotle|adobo|flour|sugar|honey|syrup|ketchup|mustard|mayo|mayonnaise|cereal|oat|oats|cornstarch|cracker|chip|chips|peanut butter|jam|jelly|water|sauce|paste|powder|stock)\b/i],
];

function categorizeIngredient(name){
  for(const [cat,re] of CAT_RULES){ if(re.test(name)) return cat; }
  return "Pantry";
}

// Parse a single ingredient phrase into {qty, name}. qty is "" when none.
function parseOnePhrase(raw){
  let s = raw.trim().replace(/^[,\-•*·]+\s*/,"");   // strip leading bullets/dashes
  if(!s) return null;

  let qty = "";
  let rest = s;

  // Leading numeric quantity: "2", "1.5", "1/2", "2-3", with optional unicode fractions
  const numMatch = s.match(/^([\d¼½¾⅓⅔⅛⅜⅝⅞]+(?:\s*\/\s*\d+)?(?:\.\d+)?(?:\s*-\s*[\d¼½¾⅓⅔⅛⅜⅝⅞]+)?)\s+(.*)$/);
  if(numMatch){
    qty = numMatch[1].replace(/\s+/g,"");
    rest = numMatch[2];
  } else {
    // Leading number word ("a dozen eggs", "two onions")
    const words = s.split(/\s+/);
    const w0 = words[0].toLowerCase();
    if(NUM_WORDS[w0] !== undefined && words.length > 1){
      qty = NUM_WORDS[w0];
      rest = words.slice(1).join(" ");
    }
  }

  // Pull a trailing unit off the front of rest ("lbs chicken" → unit lbs)
  let unit = "";
  const rw = rest.split(/\s+/);
  if(rw.length > 1){
    const u = rw[0].toLowerCase().replace(/\.$/,"");
    if(UNIT_WORDS.includes(u)){ unit = rw[0]; rest = rw.slice(1).join(" "); }
  }

  // Ingredient name = everything up to a descriptor comma ("chicken, diced" → chicken)
  let name = rest.replace(/,.*$/,"").trim();
  if(!name) name = s;

  let qtyLabel = "";
  if(qty && unit) qtyLabel = `${qty} ${unit}`;
  else if(qty) qtyLabel = qty;
  else if(unit) qtyLabel = unit;

  return { qty: qtyLabel, name };
}

// Smart splitter: understands newlines, commas, AND plain single-line input.
function splitIntoPhrases(text){
  if(!text.trim()) return [];
  // First split on newlines and commas
  let chunks = text.split(/[\n,]+/).map(c=>c.trim()).filter(Boolean);
  // If it's still one chunk with no amounts, it's likely "oil chicken pasta" —
  // split on spaces so each word becomes its own item.
  if(chunks.length === 1){
    const c = chunks[0];
    const words = c.split(/\s+/);
    const hasQty = /[\d¼½¾⅓⅔⅛⅜⅝⅞]/.test(c)
      || words.some(w=>NUM_WORDS[w.toLowerCase()]!==undefined)
      || words.some(w=>UNIT_WORDS.includes(w.toLowerCase().replace(/\.$/,"")));
    if(words.length > 1 && !hasQty) chunks = words;
  }
  return chunks;
}

function parseIngredientsLocally(rawText, nameHint=""){
  const rawLines = rawText.split(/\n/).map(l=>l.trim()).filter(Boolean);

  // Detect a recipe title only when the first line really looks like one:
  // multiple words, no digits, no units, AND not itself a known ingredient.
  let recipeName = nameHint || "My Recipe";
  let body = rawText;
  const first = rawLines[0];
  const looksLikeTitle = first
    && rawLines.length > 1
    && first.split(/\s+/).length >= 2                       // titles are multi-word
    && !/^\d/.test(first)
    && first.length < 60
    && !new RegExp(`\\b(${UNIT_WORDS.join("|")})\\b`,"i").test(first)
    && (/ for \d/i.test(first) || categorizeIngredient(first)==="Pantry" && !/\b(oil|rice|pasta|flour|sugar|sauce)\b/i.test(first));
  if(looksLikeTitle){
    recipeName = first.replace(/ for \d+.*$/i,"").trim();
    body = rawLines.slice(1).join("\n");
  }

  const phrases = splitIntoPhrases(body);
  const ingredients = [];
  phrases.forEach((phrase,i)=>{
    const parsed = parseOnePhrase(phrase);
    if(!parsed) return;
    let { qty, name } = parsed;
    if(!name || name.length < 2) return;
    ingredients.push({
      id: Date.now()+i,
      name: name.charAt(0).toUpperCase()+name.slice(1),
      qty,                                   // "" when no amount — no more "to taste"
      category: categorizeIngredient(name),
      store: null,
      status: "pending",
    });
  });

  return { recipeName, servings:4, ingredients };
}

async function extractText(input){
  try{
    const text = await callClaude([{role:"user",content:input}]);
    return toResult(JSON.parse(text));
  } catch(e) {
    if(e.message==="NO_API" || String(e).includes("fetch")){
      // Sandbox mode — parse locally
      return parseIngredientsLocally(input);
    }
    throw e;
  }
}

async function extractImage(b64){
  try{
    const text = await callClaude([{role:"user",content:[
      {type:"image",source:{type:"base64",media_type:"image/jpeg",data:b64}},
      {type:"text",text:"Extract all ingredients from this recipe image."},
    ]}]);
    return toResult(JSON.parse(text));
  } catch(e){
    throw new Error("Image extraction requires the deployed version. Please paste the recipe as text instead.");
  }
}

function toResult(p){
  return{
    recipeName:p.recipeName||"My Recipe",
    servings:p.servings||4,
    ingredients:(p.ingredients||[]).map((ing,i)=>({
      id:Date.now()+i, name:ing.name, qty:ing.qty,
      category:ing.category||"Pantry", store:null, status:"pending",
    })),
  };
}

async function getSubs(name, qty){
  try{
    const system = `Return ONLY a JSON array of exactly 3 short grocery substitution strings. No markdown. Example: ["Half-and-half","Coconut cream","Evaporated milk"]`;
    const text = await callClaude([{role:"user",content:`Substitutions for: ${name} (${qty})`}], 200, system);
    return JSON.parse(text);
  } catch(_){
    // Local fallback substitution map
    const fallbacks = {
      "heavy cream":["Half-and-half","Coconut cream","Evaporated milk"],
      "butter":["Olive oil","Coconut oil","Vegan butter"],
      "parmesan":["Pecorino Romano","Nutritional yeast","Grana Padano"],
      "chicken thighs":["Chicken breasts","Turkey thighs","Tofu"],
      "baby spinach":["Kale","Arugula","Mixed greens"],
    };
    const key = name.toLowerCase();
    for(const [k,v] of Object.entries(fallbacks)) if(key.includes(k)) return v;
    return [`Store-brand ${name}`, `Similar product`, `Skip this item`];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STATIC DATA
// ─────────────────────────────────────────────────────────────────────────────
const STORES=["Publix","Harris Teeter","Lidl","Sam's Club"];
const STORE_COLORS={"Publix":"#22C55E","Harris Teeter":"#3B82F6","Lidl":"#F59E0B","Sam's Club":"#EC4899"};
const STORE_LOGIC={
  Meat:{primary:"Sam's Club",reason:"Best bulk meat prices"},
  Seafood:{primary:"Harris Teeter",reason:"Fresh seafood counter"},
  Produce:{primary:"Harris Teeter",reason:"Best fresh produce"},
  Dairy:{primary:"Publix",reason:"Great dairy selection"},
  Bakery:{primary:"Publix",reason:"In-store bakery"},
  Pantry:{primary:"Lidl",reason:"Best pantry prices"},
  Spices:{primary:"Lidl",reason:"Affordable spices"},
  Frozen:{primary:"Sam's Club",reason:"Bulk frozen value"},
  Beverages:{primary:"Lidl",reason:"Great value drinks"},
};
const CAT_COLORS={Meat:"#EF4444",Seafood:"#06B6D4",Produce:"#22C55E",Dairy:"#3B82F6",Bakery:"#F97316",Pantry:"#F59E0B",Spices:"#9D7FEA",Frozen:"#818CF8",Beverages:"#EC4899"};
const SAMPLES=[
  {name:"Tuscan Garlic Chicken",emoji:"🍗",text:`Tuscan Garlic Chicken for 4\n2 lbs chicken thighs, 6 cloves garlic, 2 lemons, 5 oz baby spinach, 1 cup cherry tomatoes, 1/2 cup heavy cream, 1/2 cup parmesan, 3 tbsp butter, 3 tbsp olive oil, 1 cup chicken broth, 1/3 cup sun-dried tomatoes, 1 tsp Italian seasoning, 1/2 tsp red pepper flakes, salt and pepper`},
  {name:"Salmon Tacos",emoji:"🌮",text:`Spicy Salmon Tacos for 4\n1.5 lbs salmon fillets, 8 corn tortillas, 2 limes, 1 avocado, 1/2 red cabbage shredded, 1/2 cup sour cream, 2 tbsp chipotle in adobo, 1/4 cup cilantro, 1 jalapeño, 1 tbsp olive oil, 1 tsp cumin, 1 tsp smoked paprika, salt`},
  {name:"Pasta Primavera",emoji:"🍝",text:`Pasta Primavera for 4\n1 lb penne, 2 zucchini, 1 bell pepper, 1 cup cherry tomatoes, 1/2 cup frozen peas, 4 cloves garlic, 1/2 cup parmesan, 1/4 cup olive oil, fresh basil, 1 lemon, red pepper flakes, salt and black pepper`},
];

// ─────────────────────────────────────────────────────────────────────────────
// UI PRIMITIVES
// ─────────────────────────────────────────────────────────────────────────────
const Pill=({children,color=C.accent,style,onClick})=>(
  <span onClick={onClick} style={{display:"inline-flex",alignItems:"center",gap:4,padding:"3px 10px",borderRadius:99,fontSize:11,fontWeight:700,letterSpacing:".04em",background:color+"22",color,cursor:onClick?"pointer":"default",...style}}>{children}</span>
);

const Btn=({children,onClick,variant="primary",style,disabled})=>{
  const s={
    primary:{background:C.accent,color:"#000",fontWeight:800},
    ghost:{background:"transparent",color:C.accent,border:`1px solid ${C.accent}44`},
    danger:{background:C.danger+"18",color:C.danger,border:`1px solid ${C.danger}44`},
    warn:{background:C.warn,color:"#000",fontWeight:800},
    muted:{background:C.card,color:C.muted,border:`1px solid ${C.border}`},
  };
  return(
    <button onClick={onClick} disabled={disabled} style={{border:"none",borderRadius:14,padding:"14px 20px",fontSize:15,fontFamily:"inherit",cursor:disabled?"not-allowed":"pointer",opacity:disabled?.45:1,transition:"opacity .15s",display:"flex",alignItems:"center",justifyContent:"center",gap:8,...s[variant],...style}}>{children}</button>
  );
};

const Card=({children,style,onClick})=>(
  <div onClick={onClick} style={{background:C.card,borderRadius:18,padding:16,border:`1px solid ${C.border}`,cursor:onClick?"pointer":"default",...style}}>{children}</div>
);

const ProgressBar=({value,color=C.accent,style})=>(
  <div style={{height:6,background:C.border,borderRadius:99,overflow:"hidden",...style}}>
    <div style={{height:"100%",width:`${Math.min(100,Math.max(0,value))}%`,background:color,borderRadius:99,transition:"width .4s ease"}}/>
  </div>
);

const BackBtn=({onBack})=>(
  <button onClick={onBack} style={{position:"fixed",top:52,left:16,zIndex:40,background:C.card,border:`1px solid ${C.border}`,borderRadius:12,width:36,height:36,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
  </button>
);

const CSS=()=>(
  <style>{`
    @keyframes spin{to{transform:rotate(360deg)}}
    @keyframes spinr{to{transform:rotate(-360deg)}}
    @keyframes fadein{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
    .fi{animation:fadein .3s ease both}
  `}</style>
);

const Spinner=({label})=>(
  <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:16,padding:"56px 24px"}}>
    <CSS/>
    <div style={{position:"relative",width:64,height:64}}>
      <div style={{position:"absolute",inset:0,borderRadius:"50%",border:`3px solid ${C.accent}22`,borderTopColor:C.accent,animation:"spin 1s linear infinite"}}/>
      <div style={{position:"absolute",inset:8,borderRadius:"50%",border:`2px solid ${C.purple}33`,borderBottomColor:C.purple,animation:"spinr 1.4s linear infinite"}}/>
      <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",fontSize:18}}>✨</div>
    </div>
    <p style={{color:C.muted,fontSize:14,textAlign:"center",maxWidth:220}}>{label}</p>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// SCREENS
// ─────────────────────────────────────────────────────────────────────────────

// HOME
const HomeScreen=({onNav,trip,pantry,history})=>{
  const has=trip&&trip.ingredients?.length>0;
  const done=has?trip.ingredients.filter(i=>i.status!=="pending"&&i.status!=="have").length:0;
  const total=has?trip.ingredients.filter(i=>i.status!=="have").length:0;
  const pct=total>0?Math.round(done/total*100):0;
  return(
    <div style={{minHeight:"100vh",background:C.bg,paddingBottom:80}}>
      <CSS/>
      <div style={{padding:"64px 20px 32px",background:`radial-gradient(ellipse at 65% 0%,${C.accent}1A 0%,transparent 68%)`}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:28}}>
          <div style={{width:40,height:40,borderRadius:12,background:C.accent,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>🛍</div>
          <span style={{fontFamily:"'Syne',sans-serif",fontSize:20,fontWeight:800,color:C.text,letterSpacing:"-.01em"}}>RecipeRun</span>

        </div>
        <h1 style={{fontFamily:"'Syne',sans-serif",fontSize:32,fontWeight:800,color:C.text,lineHeight:1.15,marginBottom:10,letterSpacing:"-.02em"}}>
          Plan dinner once.<br/><span style={{color:C.accent}}>Shop smarter</span> everywhere.
        </h1>
        <p style={{color:C.muted,fontSize:14,lineHeight:1.6}}>Turn any recipe into a split list across your stores.</p>
      </div>
      <div style={{padding:"0 20px",display:"flex",flexDirection:"column",gap:12}}>
        {has&&(
          <Card onClick={()=>onNav("shopping")} style={{background:`linear-gradient(135deg,${C.accentDim}66,${C.card})`,border:`1px solid ${C.accent}44`,cursor:"pointer"}} className="fi">
            <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:12}}>
              <div>
                <Pill color={C.accent}>IN PROGRESS</Pill>
                <p style={{color:C.text,fontWeight:700,fontSize:17,marginTop:6}}>{trip.recipeName}</p>
                <p style={{color:C.muted,fontSize:13,marginTop:2}}>Shopping at {trip.stores?.[trip.currentStoreIdx||0]} · {done}/{total} done</p>
              </div>
              <span style={{color:C.accent,fontSize:22,marginTop:4}}>→</span>
            </div>
            <ProgressBar value={pct}/>
          </Card>
        )}
        <Btn onClick={()=>onNav("triptype")} style={{width:"100%",padding:18,fontSize:16}}>+ Start New Trip</Btn>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <Card onClick={()=>onNav("pantry")} style={{textAlign:"center",padding:"20px 12px",cursor:"pointer"}}>
            <div style={{fontSize:28,marginBottom:8}}>🥫</div>
            <p style={{color:C.text,fontWeight:700,fontSize:14}}>My Pantry</p>
            <p style={{color:C.muted,fontSize:12,marginTop:2}}>{pantry.length} items</p>
          </Card>
          <Card onClick={()=>onNav("history")} style={{textAlign:"center",padding:"20px 12px",cursor:"pointer"}}>
            <div style={{fontSize:28,marginBottom:8}}>📋</div>
            <p style={{color:C.text,fontWeight:700,fontSize:14}}>Past Trips</p>
            <p style={{color:C.muted,fontSize:12,marginTop:2}}>{history.length} saved</p>
          </Card>
        </div>
        <p style={{color:C.muted,fontSize:11,fontWeight:700,letterSpacing:".08em",paddingLeft:4,marginTop:4}}>QUICK START</p>
        {SAMPLES.map(r=>(
          <Card key={r.name} onClick={()=>onNav("import",r)} style={{display:"flex",alignItems:"center",gap:14,cursor:"pointer"}}>
            <div style={{width:44,height:44,borderRadius:12,background:C.border,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>{r.emoji}</div>
            <div style={{flex:1}}>
              <p style={{color:C.text,fontWeight:600,fontSize:15}}>{r.name}</p>
              <p style={{color:C.muted,fontSize:13}}>Tap to auto-extract</p>
            </div>
            <span style={{color:C.muted,fontSize:18}}>›</span>
          </Card>
        ))}

        {/* Footer credit */}
        <div style={{textAlign:"center",padding:"28px 0 8px"}}>
          <div style={{width:32,height:2,background:C.border,borderRadius:99,margin:"0 auto 16px"}}/>
          <p style={{color:C.muted,fontSize:13,fontWeight:600}}>Built by Brandon Johnson</p>
          <p style={{color:C.border,fontSize:11,marginTop:4}}>RecipeRun · Plan dinner once. Shop smarter everywhere.</p>
        </div>

      </div>
    </div>
  );
};

// TRIP TYPE — what are you shopping for today?
const TRIP_TYPES=[
  {
    id:"family",
    emoji:"🏠",
    label:"Family Grocery Haul",
    desc:"Weekly shopping for the household",
    color:"#3EE8A0",
    questions:[
      {id:"adults",label:"Adults in the house",options:["1","2","3","4+"]},
      {id:"kids",label:"Kids in the house",options:["0","1","2","3","4+"]},
      {id:"dinners",label:"Dinners to plan",options:["3","4","5","6","7"]},
      {id:"leftovers",label:"Leftovers preference",options:["Yes please","Minimal","None"]},
    ],
  },
  {
    id:"mealprep",
    emoji:"🥗",
    label:"Meal Prep",
    desc:"Batch cooking for the week ahead",
    color:"#9D7FEA",
    questions:[
      {id:"meals",label:"Meals to prep",options:["2","3","4","5","6"]},
      {id:"portions",label:"Portions per meal",options:["1","2","3","4","5+"]},
      {id:"days",label:"Days to cover",options:["3 days","5 days","7 days"]},
    ],
  },
  {
    id:"restaurant",
    emoji:"🍽️",
    label:"Restaurant / Catering",
    desc:"Stocking up for a food business",
    color:"#F5A623",
    questions:[
      {id:"covers",label:"Covers / guests expected",options:["10–20","20–50","50–100","100+"]},
      {id:"service",label:"Service type",options:["Dinner service","Lunch service","Event / catering","Full day"]},
      {id:"days",label:"Days of stock",options:["1 day","2–3 days","1 week"]},
    ],
  },
  {
    id:"quick",
    emoji:"⚡",
    label:"Quick Run",
    desc:"Just grabbing a few things",
    color:"#3B82F6",
    questions:[],
  },
];

const TripTypeScreen=({onNav,setTripContext})=>{
  const [selected,setSelected]=useState(null);
  const [answers,setAnswers]=useState({});
  const [step,setStep]=useState("pick"); // pick | questions

  const type=TRIP_TYPES.find(t=>t.id===selected);

  const choose=(id)=>{
    setSelected(id);
    const t=TRIP_TYPES.find(x=>x.id===id);
    if(!t||t.questions.length===0){
      // no questions — go straight through
      setTripContext({type:id,answers:{}});
      onNav("import");
    } else {
      setStep("questions");
    }
  };

  const finish=()=>{
    setTripContext({type:selected,answers});
    onNav("import");
  };

  if(step==="questions"&&type){
    return(
      <div style={{minHeight:"100vh",background:C.bg,paddingBottom:100}}>
        <CSS/>
        <div style={{padding:"56px 20px 28px",background:`radial-gradient(ellipse at 60% 0%,${type.color}18 0%,transparent 70%)`}}>
          <div style={{fontSize:44,marginBottom:12}}>{type.emoji}</div>
          <h2 style={{fontFamily:"'Syne',sans-serif",fontSize:24,fontWeight:800,color:C.text,letterSpacing:"-.02em"}}>{type.label}</h2>
          <p style={{color:C.muted,fontSize:14,marginTop:4}}>Tell us a bit more so we can scale your list correctly.</p>
        </div>
        <div style={{padding:"0 20px",display:"flex",flexDirection:"column",gap:16}}>
          {type.questions.map(q=>(
            <Card key={q.id}>
              <p style={{color:C.muted,fontSize:12,fontWeight:700,letterSpacing:".08em",marginBottom:12}}>{q.label.toUpperCase()}</p>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {q.options.map(opt=>{
                  const active=answers[q.id]===opt;
                  return(
                    <button key={opt} onClick={()=>setAnswers(p=>({...p,[q.id]:opt}))} style={{
                      padding:"11px 18px",borderRadius:12,cursor:"pointer",fontFamily:"inherit",fontSize:14,fontWeight:600,
                      border:`1.5px solid ${active?type.color:C.border}`,
                      background:active?type.color+"22":"transparent",
                      color:active?type.color:C.muted,
                      transition:"all .15s",
                    }}>{opt}</button>
                  );
                })}
              </div>
            </Card>
          ))}

          {/* Summary card */}
          {Object.keys(answers).length>0&&(
            <Card style={{border:`1px solid ${type.color}33`,background:type.color+"08"}}>
              <p style={{color:type.color,fontSize:12,fontWeight:700,letterSpacing:".08em",marginBottom:8}}>YOUR TRIP SUMMARY</p>
              {Object.entries(answers).map(([k,v])=>{
                const q=type.questions.find(x=>x.id===k);
                return q?(<div key={k} style={{display:"flex",justifyContent:"space-between",padding:"4px 0"}}>
                  <span style={{color:C.muted,fontSize:14}}>{q.label}</span>
                  <span style={{color:C.text,fontWeight:600,fontSize:14}}>{v}</span>
                </div>):null;
              })}
            </Card>
          )}
        </div>
        <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:430,padding:"16px 20px",background:C.bg,borderTop:`1px solid ${C.border}`}}>
          <Btn onClick={finish} style={{width:"100%",background:type.color,color:"#000",fontWeight:800,padding:18,fontSize:16}}>
            Continue → Add Recipe
          </Btn>
        </div>
      </div>
    );
  }

  return(
    <div style={{minHeight:"100vh",background:C.bg,paddingBottom:80}}>
      <CSS/>
      <div style={{padding:"56px 20px 28px"}}>
        <p style={{color:C.muted,fontSize:11,fontWeight:700,letterSpacing:".1em",marginBottom:8}}>NEW TRIP</p>
        <h2 style={{fontFamily:"'Syne',sans-serif",fontSize:28,fontWeight:800,color:C.text,letterSpacing:"-.02em",lineHeight:1.2}}>
          What are you<br/>shopping for?
        </h2>
        <p style={{color:C.muted,fontSize:14,marginTop:8}}>We'll tailor your list and portions to match.</p>
      </div>
      <div style={{padding:"0 20px",display:"flex",flexDirection:"column",gap:12}}>
        {TRIP_TYPES.map(t=>(
          <button key={t.id} onClick={()=>choose(t.id)} style={{
            display:"flex",alignItems:"center",gap:16,padding:"20px 18px",
            borderRadius:20,cursor:"pointer",fontFamily:"inherit",textAlign:"left",
            background:C.card,border:`1.5px solid ${C.border}`,
            transition:"border-color .15s, background .15s",
          }}
          onMouseEnter={e=>{e.currentTarget.style.borderColor=t.color;e.currentTarget.style.background=t.color+"12";}}
          onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.background=C.card;}}
          >
            <div style={{width:56,height:56,borderRadius:16,background:t.color+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,flexShrink:0}}>{t.emoji}</div>
            <div style={{flex:1}}>
              <p style={{color:C.text,fontWeight:700,fontSize:17,fontFamily:"inherit"}}>{t.label}</p>
              <p style={{color:C.muted,fontSize:13,marginTop:3,fontFamily:"inherit"}}>{t.desc}</p>
            </div>
            <span style={{color:t.color,fontSize:22}}>›</span>
          </button>
        ))}
      </div>
    </div>
  );
};

// IMPORT
const ImportScreen=({onNav,onImport,prefill})=>{
  const [url,setUrl]=useState("");
  const [manual,setManual]=useState(prefill?.text||"");
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [preview,setPreview]=useState([]);   // live-parsed items shown as you type
  const [picking,setPicking]=useState(null);  // id of item whose category is being changed
  const fileRef=useRef();
  const fileRef2=useRef();

  // Parse instantly as the user types — no network, can't fail.
  useEffect(()=>{
    if(!manual.trim()){ setPreview([]); return; }
    const t=setTimeout(()=>{
      const r=parseIngredientsLocally(manual);
      setPreview(r.ingredients);
    },160);
    return ()=>clearTimeout(t);
  },[manual]);

  const setItemCat=(id,cat)=>{ setPreview(p=>p.map(it=>it.id===id?{...it,category:cat}:it)); setPicking(null); };
  const delItem=(id)=>setPreview(p=>p.filter(it=>it.id!==id));

  // Text uses the instant local parse (already in `preview`). Image still uses AI.
  const run=async(input,type="text")=>{
    if(type==="text"){
      const items=preview.length?preview:parseIngredientsLocally(input).ingredients;
      if(!items.length){setError("Type at least one ingredient above and it'll appear here.");return;}
      const r=parseIngredientsLocally(input);
      onImport({recipeName:r.recipeName,servings:r.servings,ingredients:items});
      onNav("review");
      return;
    }
    setLoading(true);setError("");
    try{
      const result=await extractImage(input);
      if(!result.ingredients||result.ingredients.length===0) throw new Error("No ingredients found.");
      onImport(result);onNav("review");
    }catch(e){
      const msg=e.message||"";
      if(msg.includes("Image extraction")){setError(msg);}
      else{setError("Couldn't read that image. Try typing or pasting the ingredients instead.");}
    }finally{setLoading(false);}
  };

  const handleFile=(e)=>{
    const f=e.target.files?.[0];if(!f)return;
    const reader=new FileReader();
    reader.onload=()=>run(reader.result.split(",")[1],"image");
    reader.readAsDataURL(f);
  };

  // Demo recipes & prefill: parse directly (don't depend on preview state timing).
  const runText=(text)=>{
    const r=parseIngredientsLocally(text);
    if(!r.ingredients.length){setError("No ingredients found in that text.");return;}
    onImport(r);onNav("review");
  };
  useEffect(()=>{if(prefill)runText(prefill.text);},[]);

  if(loading)return(
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column",justifyContent:"center"}}>
      <Spinner label="AI is reading your recipe and extracting every ingredient…"/>
    </div>
  );

  return(
    <div style={{minHeight:"100vh",background:C.bg,paddingBottom:80}}>
      <CSS/>
      <div style={{padding:"56px 20px 24px"}}>
        <Pill color={C.accent} style={{marginBottom:10}}>INSTANT SORT</Pill>
        <h2 style={{fontFamily:"'Syne',sans-serif",fontSize:26,fontWeight:800,color:C.text,letterSpacing:"-.02em"}}>Add ingredients</h2>
        <p style={{color:C.muted,fontSize:14,marginTop:4}}>Type them any way you like — they sort as you go.</p>
      </div>
      <div style={{padding:"0 20px",display:"flex",flexDirection:"column",gap:12}}>
        <div style={{background:C.purple+"18",border:`1px solid ${C.purple}33`,borderRadius:14,padding:"12px 16px"}}>
        <p style={{color:C.purple,fontSize:13,fontWeight:600}}>✨ Beta Preview</p>
        <p style={{color:C.muted,fontSize:12,marginTop:3}}>Type or paste ingredients below, or try a demo. URL & photo import coming soon.</p>
      </div>
      {error&&<div style={{background:C.danger+"18",border:`1px solid ${C.danger}44`,borderRadius:14,padding:"12px 16px"}}><p style={{color:C.danger,fontSize:14}}>⚠ {error}</p></div>}

        <Card style={{borderColor:C.border,background:C.surface}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
            <span style={{fontSize:18}}>🔗</span>
            <p style={{color:C.muted,fontSize:11,fontWeight:700,letterSpacing:".08em"}}>RECIPE LINK IMPORT</p>
            <Pill color={C.purple} style={{marginLeft:"auto",fontSize:10}}>COMING SOON</Pill>
          </div>
          <p style={{color:C.muted,fontSize:13,lineHeight:1.5}}>
            We're building TikTok, Instagram, AllRecipes & NYT Cooking imports. For now — copy the recipe text and paste it below, or try a demo. 👇
          </p>
        </Card>

        <Card style={{borderColor:C.border,background:C.surface}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
            <span style={{fontSize:18}}>📸</span>
            <p style={{color:C.muted,fontSize:11,fontWeight:700,letterSpacing:".08em"}}>PHOTO & SCREENSHOT IMPORT</p>
            <Pill color={C.purple} style={{marginLeft:"auto",fontSize:10}}>COMING SOON</Pill>
          </div>
          <p style={{color:C.muted,fontSize:13,lineHeight:1.5}}>
            Snap a recipe card or upload a screenshot — coming with the next update.
          </p>
        </Card>

        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{flex:1,height:1,background:C.border}}/><span style={{color:C.muted,fontSize:12}}>or type it in</span><div style={{flex:1,height:1,background:C.border}}/>
        </div>

        <Card>
          <p style={{color:C.muted,fontSize:11,fontWeight:700,letterSpacing:".08em",marginBottom:10}}>TYPE OR PASTE INGREDIENTS</p>
          <textarea value={manual} onChange={e=>setManual(e.target.value)} placeholder={"Type any way you like:\n\n2 lbs chicken, pasta, olive oil\n\nor one per line — amounts optional."} rows={5}
            style={{width:"100%",background:C.bg,border:`1px solid ${C.border}`,borderRadius:12,padding:"12px 14px",color:C.text,fontSize:14,fontFamily:"inherit",outline:"none",resize:"none",boxSizing:"border-box"}}/>
          <p style={{color:C.muted,fontSize:12,marginTop:8,lineHeight:1.5}}>Works with commas, new lines, or a plain list. Items sort themselves below — tap a colored tag to move one.</p>

          {preview.length>0&&(
            <div className="fi" style={{marginTop:14,borderTop:`1px solid ${C.border}`,paddingTop:14}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <p style={{color:C.text,fontSize:13,fontWeight:700}}>Preview</p>
                <p style={{color:C.accent,fontSize:13,fontWeight:700}}>{preview.length} item{preview.length!==1?"s":""}</p>
              </div>
              {preview.map(it=>(
                <div key={it.id} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 0",borderBottom:`1px solid ${C.border}`}}>
                  <span style={{color:it.qty?C.accent:C.muted,fontSize:12,fontWeight:700,minWidth:56}}>{it.qty||"—"}</span>
                  <span style={{flex:1,color:C.text,fontSize:14,fontWeight:600}}>{it.name}</span>
                  <span onClick={()=>setPicking(picking===it.id?null:it.id)}
                    style={{fontSize:11,fontWeight:700,padding:"4px 9px",borderRadius:99,cursor:"pointer",color:CAT_COLORS[it.category]||C.muted,background:(CAT_COLORS[it.category]||C.muted)+"22",border:`1px solid ${(CAT_COLORS[it.category]||C.muted)}44`}}>{it.category}</span>
                  <span onClick={()=>delItem(it.id)} style={{color:C.muted,fontSize:18,cursor:"pointer",width:20,textAlign:"center"}}>×</span>
                </div>
              ))}
              {picking&&(
                <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:10,padding:"10px",background:C.bg,borderRadius:10}}>
                  {Object.keys(CAT_COLORS).map(cat=>(
                    <span key={cat} onClick={()=>setItemCat(picking,cat)}
                      style={{fontSize:11,fontWeight:700,padding:"6px 10px",borderRadius:99,cursor:"pointer",color:CAT_COLORS[cat],background:CAT_COLORS[cat]+"22",border:`1px solid ${CAT_COLORS[cat]}44`}}>{cat}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          <Btn onClick={()=>run(manual)} disabled={!preview.length} variant="primary" style={{width:"100%",marginTop:14}}>Add {preview.length||""} {preview.length===1?"item":"items"} to list →</Btn>
        </Card>

        <p style={{color:C.muted,fontSize:11,fontWeight:700,letterSpacing:".08em",paddingLeft:4}}>TRY A DEMO</p>
        {SAMPLES.map(r=>(
          <Card key={r.name} onClick={()=>runText(r.text)} style={{display:"flex",alignItems:"center",gap:14,cursor:"pointer",border:`1px solid ${C.purple}33`}}>
            <span style={{fontSize:32}}>{r.emoji}</span>
            <div style={{flex:1}}>
              <p style={{color:C.text,fontWeight:600,fontSize:15}}>{r.name}</p>
              <p style={{color:C.muted,fontSize:13}}>Tap to load</p>
            </div>
            <Pill color={C.purple}>DEMO</Pill>
          </Card>
        ))}
      </div>
    </div>
  );
};

// REVIEW — now the primary "Your List" screen with checkboxes + quick-start
const ReviewScreen=({onNav,ingredients,setIngredients,recipeName,pantry,stores,setStores})=>{
  const [editing,setEditing]=useState(null);
  const [showSetup,setShowSetup]=useState(false);
  const [checked,setChecked]=useState({});        // local pre-shop checks (have at home)
  const [selStores,setSelStores]=useState(["Publix","Harris Teeter"]);

  const cats=[...new Set(ingredients.map(i=>i.category))];
  const inPantry=n=>pantry.some(p=>p.name.toLowerCase()===n.toLowerCase());
  const checkedCount=Object.values(checked).filter(Boolean).length;
  const pct=ingredients.length>0?Math.round(checkedCount/ingredients.length*100):0;

  const tog=(id)=>setChecked(p=>({...p,[id]:!p[id]}));
  const togStore=(s)=>setSelStores(p=>p.includes(s)?p.filter(x=>x!==s):[...p,s]);

  const quickStart=()=>{
    const chosen=selStores.length>0?selStores:["Publix"];
    setStores(chosen);
    setIngredients(prev=>prev.map(i=>{
      if(checked[i.id])return{...i,status:"have",store:null};
      const pref=STORE_LOGIC[i.category]?.primary;
      return{...i,status:"pending",store:chosen.includes(pref)?pref:chosen[0]};
    }));
    setShowSetup(false);
    onNav("shopping");
  };

  return(
    <div style={{minHeight:"100vh",background:C.bg,paddingBottom:120}}>
      <CSS/>
      {/* Header */}
      <div style={{padding:"52px 20px 16px",background:`linear-gradient(180deg,${C.accent}12 0%,transparent 100%)`}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
          <div>
            <p style={{color:C.muted,fontSize:11,fontWeight:700,letterSpacing:".08em"}}>YOUR SHOPPING LIST</p>
            <h2 style={{fontFamily:"'Syne',sans-serif",fontSize:22,fontWeight:800,color:C.text,marginTop:2}}>{recipeName}</h2>
          </div>
          <div style={{textAlign:"right"}}>
            <p style={{color:C.accent,fontSize:22,fontWeight:800}}>{checkedCount}/{ingredients.length}</p>
            <p style={{color:C.muted,fontSize:11}}>have at home</p>
          </div>
        </div>
        <ProgressBar value={pct} style={{marginBottom:10}}/>
        <p style={{color:C.muted,fontSize:12}}>✓ Tap items you already have · ✏️ edit · ✕ remove</p>
      </div>

      {/* List */}
      <div style={{padding:"0 20px",display:"flex",flexDirection:"column",gap:6}}>
        {cats.map(cat=>(
          <div key={cat}>
            <p style={{color:CAT_COLORS[cat]||C.muted,fontSize:11,fontWeight:700,letterSpacing:".1em",padding:"10px 4px 6px"}}>{cat.toUpperCase()}</p>
            {ingredients.filter(i=>i.category===cat).map(item=>{
              const isChecked=checked[item.id]||inPantry(item.name);
              return(
                <div key={item.id} className="fi" style={{display:"flex",alignItems:"center",gap:12,padding:"14px 16px",background:isChecked?C.accent+"12":C.card,borderRadius:16,border:`1px solid ${isChecked?C.accent+"66":C.border}`,marginBottom:6,transition:"all .2s"}}>
                  {/* Big tap-friendly checkbox */}
                  <button onClick={()=>tog(item.id)} style={{width:26,height:26,borderRadius:8,border:`2px solid ${isChecked?C.accent:C.border}`,background:isChecked?C.accent:"transparent",flexShrink:0,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",transition:"all .2s"}}>
                    {isChecked&&<span style={{color:"#000",fontSize:14,fontWeight:900,lineHeight:1}}>✓</span>}
                  </button>
                  <div style={{flex:1}}>
                    {editing===item.id
                      ?<input autoFocus defaultValue={item.name} onBlur={e=>{setIngredients(p=>p.map(i=>i.id===item.id?{...i,name:e.target.value}:i));setEditing(null);}} style={{background:"transparent",border:"none",borderBottom:`1px solid ${C.accent}`,color:C.text,fontSize:16,fontFamily:"inherit",outline:"none",width:"100%"}}/>
                      :<p style={{color:isChecked?C.muted:C.text,fontSize:16,fontWeight:600,textDecoration:isChecked?"line-through":"none",transition:"all .2s"}}>{item.name}</p>
                    }
                    <p style={{color:C.muted,fontSize:13,marginTop:1}}>{item.qty}</p>
                  </div>
                  {inPantry(item.name)&&<Pill color={C.accent} style={{fontSize:10}}>PANTRY</Pill>}
                  <button onClick={()=>setEditing(item.id)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",padding:6,fontSize:16}}>✏️</button>
                  <button onClick={()=>setIngredients(p=>p.filter(i=>i.id!==item.id))} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",padding:6,fontSize:16}}>✕</button>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Bottom CTA */}
      <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:430,padding:"12px 20px 24px",background:C.bg,borderTop:`1px solid ${C.border}`}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:10}}>
          <Btn onClick={()=>setShowSetup(true)} style={{fontSize:16,padding:"16px 0"}}>
            🛒 Start Shopping
          </Btn>
          <Btn onClick={()=>onNav("setup")} variant="ghost" style={{padding:"16px 14px",fontSize:13}}>
            ⚙️ Full Setup
          </Btn>
        </div>
      </div>

      {/* Quick-start store picker sheet */}
      {showSetup&&(
        <div style={{position:"fixed",inset:0,background:"#000000BB",zIndex:100,display:"flex",alignItems:"flex-end"}} onClick={()=>setShowSetup(false)}>
          <div onClick={e=>e.stopPropagation()} style={{background:C.surface,borderRadius:"24px 24px 0 0",padding:"24px 20px 48px",width:"100%",maxWidth:430,margin:"0 auto",border:`1px solid ${C.border}`}}>
            <div style={{width:40,height:4,background:C.border,borderRadius:99,margin:"0 auto 20px"}}/>
            <p style={{color:C.text,fontWeight:700,fontSize:18,marginBottom:6}}>Where are you shopping?</p>
            <p style={{color:C.muted,fontSize:13,marginBottom:20}}>We'll split your list across these stores automatically.</p>
            {["Publix","Harris Teeter","Lidl","Sam's Club"].map(s=>(
              <button key={s} onClick={()=>togStore(s)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 16px",borderRadius:14,width:"100%",marginBottom:8,border:`1px solid ${selStores.includes(s)?STORE_COLORS[s]:C.border}`,background:selStores.includes(s)?STORE_COLORS[s]+"22":"transparent",cursor:"pointer"}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:10,height:10,borderRadius:"50%",background:STORE_COLORS[s]}}/>
                  <span style={{color:C.text,fontWeight:600,fontSize:16,fontFamily:"inherit"}}>{s}</span>
                </div>
                {selStores.includes(s)&&<span style={{color:STORE_COLORS[s],fontSize:18}}>✓</span>}
              </button>
            ))}
            <Btn onClick={quickStart} disabled={selStores.length===0} style={{width:"100%",marginTop:8,padding:18,fontSize:16}}>
              🛒 Let's Go →
            </Btn>
          </div>
        </div>
      )}
    </div>
  );
};

// SETUP
const SetupScreen=({onNav,ingredients,setIngredients,stores,setStores,pantry})=>{
  const [people,setPeople]=useState(4);
  const [selStores,setSelStores]=useState(["Publix","Harris Teeter"]);
  const [pantryItems,setPantryItems]=useState(()=>ingredients.filter(i=>pantry.some(p=>p.name.toLowerCase()===i.name.toLowerCase())).map(i=>i.id));
  const [dietary,setDietary]=useState([]);
  const tog=(arr,set,v)=>set(p=>p.includes(v)?p.filter(x=>x!==v):[...p,v]);

  const proceed=()=>{
    setStores(selStores);
    setIngredients(prev=>prev.map(i=>{
      if(pantryItems.includes(i.id))return{...i,status:"have",store:null};
      const pref=STORE_LOGIC[i.category]?.primary;
      return{...i,status:"pending",store:selStores.includes(pref)?pref:selStores[0]};
    }));
    onNav("assign");
  };

  return(
    <div style={{minHeight:"100vh",background:C.bg,paddingBottom:100}}>
      <CSS/>
      <div style={{padding:"56px 20px 24px"}}>
        <h2 style={{fontFamily:"'Syne',sans-serif",fontSize:26,fontWeight:800,color:C.text}}>Trip Setup</h2>
        <p style={{color:C.muted,fontSize:14,marginTop:4}}>Tell us how you're shopping today.</p>
      </div>
      <div style={{padding:"0 20px",display:"flex",flexDirection:"column",gap:14}}>
        <Card>
          <p style={{color:C.muted,fontSize:11,fontWeight:700,letterSpacing:".08em",marginBottom:12}}>COOKING FOR HOW MANY?</p>
          <div style={{display:"flex",gap:8}}>
            {[1,2,3,4,5,6,"6+"].map(n=>(
              <button key={n} onClick={()=>setPeople(n)} style={{flex:1,padding:"11px 0",borderRadius:12,border:`1px solid ${people===n?C.accent:C.border}`,background:people===n?C.accent+"22":"transparent",color:people===n?C.accent:C.muted,fontWeight:700,fontSize:13,fontFamily:"inherit",cursor:"pointer"}}>{n}</button>
            ))}
          </div>
        </Card>

        <Card>
          <p style={{color:C.muted,fontSize:11,fontWeight:700,letterSpacing:".08em",marginBottom:12}}>WHICH STORES? (IN VISIT ORDER)</p>
          {STORES.map(s=>(
            <button key={s} onClick={()=>tog(selStores,setSelStores,s)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 16px",borderRadius:14,width:"100%",marginBottom:8,border:`1px solid ${selStores.includes(s)?STORE_COLORS[s]:C.border}`,background:selStores.includes(s)?STORE_COLORS[s]+"18":"transparent",cursor:"pointer"}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:10,height:10,borderRadius:"50%",background:STORE_COLORS[s]}}/>
                <span style={{color:C.text,fontWeight:600,fontSize:15,fontFamily:"inherit"}}>{s}</span>
              </div>
              {selStores.includes(s)&&<span style={{color:STORE_COLORS[s]}}>✓ #{selStores.indexOf(s)+1}</span>}
            </button>
          ))}
          {selStores.length>0&&<p style={{color:C.muted,fontSize:12,paddingLeft:4}}>Route: {selStores.join(" → ")}</p>}
        </Card>

        <Card>
          <p style={{color:C.muted,fontSize:11,fontWeight:700,letterSpacing:".08em",marginBottom:8}}>ALREADY HAVE AT HOME</p>
          {pantry.length>0&&<p style={{color:C.accent,fontSize:12,marginBottom:10}}>✓ {pantryItems.length} auto-detected from your pantry</p>}
          <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
            {ingredients.map(i=>(
              <button key={i.id} onClick={()=>tog(pantryItems,setPantryItems,i.id)} style={{padding:"8px 14px",borderRadius:99,cursor:"pointer",fontFamily:"inherit",fontSize:13,border:`1px solid ${pantryItems.includes(i.id)?C.accent:C.border}`,background:pantryItems.includes(i.id)?C.accent+"22":"transparent",color:pantryItems.includes(i.id)?C.accent:C.muted}}>
                {pantryItems.includes(i.id)?"✓ ":""}{i.name}
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <p style={{color:C.muted,fontSize:11,fontWeight:700,letterSpacing:".08em",marginBottom:10}}>DIETARY PREFERENCES</p>
          <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
            {["Gluten-free","Dairy-free","Low-sodium","Organic","Budget-friendly","Vegan","Keto"].map(d=>(
              <button key={d} onClick={()=>tog(dietary,setDietary,d)} style={{padding:"8px 14px",borderRadius:99,cursor:"pointer",fontFamily:"inherit",fontSize:13,border:`1px solid ${dietary.includes(d)?C.purple:C.border}`,background:dietary.includes(d)?C.purple+"22":"transparent",color:dietary.includes(d)?C.purple:C.muted}}>{d}</button>
            ))}
          </div>
        </Card>
      </div>
      <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:430,padding:"16px 20px",background:C.bg,borderTop:`1px solid ${C.border}`}}>
        <Btn onClick={proceed} disabled={selStores.length===0} style={{width:"100%"}}>Auto-Split My List →</Btn>
      </div>
    </div>
  );
};

// ASSIGN
const AssignScreen=({onNav,ingredients,setIngredients,stores})=>{
  const move=(id,toStore)=>setIngredients(p=>p.map(i=>i.id===id?{...i,store:toStore}:i));
  const active=ingredients.filter(i=>i.status!=="have");
  const have=ingredients.filter(i=>i.status==="have");
  return(
    <div style={{minHeight:"100vh",background:C.bg,paddingBottom:100}}>
      <CSS/>
      <div style={{padding:"56px 20px 20px"}}>
        <h2 style={{fontFamily:"'Syne',sans-serif",fontSize:24,fontWeight:800,color:C.text}}>Store Assignment</h2>
        <p style={{color:C.muted,fontSize:14,marginTop:4}}>AI split your list. Tap a store tag to move any item.</p>
      </div>
      <div style={{padding:"0 20px",display:"flex",flexDirection:"column",gap:14}}>
        {stores.map((store,si)=>{
          const items=active.filter(i=>i.store===store);
          return(
            <Card key={store}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
                <div style={{width:12,height:12,borderRadius:"50%",background:STORE_COLORS[store]}}/>
                <p style={{color:C.text,fontWeight:700,fontSize:16}}>{store}</p>
                <Pill color={STORE_COLORS[store]}>{items.length} items</Pill>
                {si===0&&<Pill color={C.accent} style={{marginLeft:"auto"}}>FIRST STOP</Pill>}
              </div>
              {items.length===0
                ?<p style={{color:C.muted,fontSize:13,padding:"8px 0"}}>No items assigned</p>
                :items.map(item=>(
                  <div key={item.id} style={{display:"flex",alignItems:"flex-start",gap:8,padding:"10px 0",borderBottom:`1px solid ${C.border}66`}}>
                    <div style={{flex:1}}>
                      <p style={{color:C.text,fontSize:14}}>{item.name}</p>
                      <p style={{color:C.muted,fontSize:11}}>{item.qty} · {STORE_LOGIC[item.category]?.reason||""}</p>
                    </div>
                    <div style={{display:"flex",gap:4,flexShrink:0,flexWrap:"wrap",justifyContent:"flex-end"}}>
                      {stores.filter(s=>s!==store).map(s=>(
                        <button key={s} onClick={()=>move(item.id,s)} style={{background:STORE_COLORS[s]+"22",border:`1px solid ${STORE_COLORS[s]}44`,borderRadius:8,padding:"4px 8px",color:STORE_COLORS[s],fontSize:10,fontWeight:700,fontFamily:"inherit",cursor:"pointer"}}>{s.split(" ")[0]}</button>
                      ))}
                    </div>
                  </div>
                ))
              }
            </Card>
          );
        })}
        {have.length>0&&(
          <Card style={{border:`1px solid ${C.accent}22`}}>
            <p style={{color:C.accent,fontSize:11,fontWeight:700,letterSpacing:".08em",marginBottom:8}}>🏠 ALREADY HAVE ({have.length})</p>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>{have.map(i=><Pill key={i.id} color={C.accent}>{i.name}</Pill>)}</div>
          </Card>
        )}
      </div>
      <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:430,padding:"16px 20px",background:C.bg,borderTop:`1px solid ${C.border}`}}>
        <Btn onClick={()=>onNav("shopping")} style={{width:"100%"}}>Start Shopping →</Btn>
      </div>
    </div>
  );
};

// SHOPPING
const ShoppingScreen=({onNav,ingredients,setIngredients,stores,currentStoreIdx,setCurrentStoreIdx})=>{
  const [subTarget,setSubTarget]=useState(null);
  const [subs,setSubs]=useState({});
  const [subLoading,setSubLoading]=useState(false);

  const store=stores[currentStoreIdx];
  const storeItems=ingredients.filter(i=>i.store===store&&i.status!=="have");
  const pending=storeItems.filter(i=>i.status==="pending");
  const done=storeItems.filter(i=>i.status!=="pending");
  const pct=storeItems.length>0?Math.round(done.length/storeItems.length*100):0;
  const nextItems=currentStoreIdx<stores.length-1?ingredients.filter(i=>i.store===stores[currentStoreIdx+1]&&i.status==="pending"):[];

  const act=(id,action)=>{
    if(action==="sub"){openSub(id);return;}
    setIngredients(p=>p.map(i=>{
      if(i.id!==id)return i;
      if(action==="buy")return{...i,status:"purchased"};
      if(action==="have")return{...i,status:"have"};
      if(action==="unavail")return{...i,status:"unavailable"};
      if(action==="next"&&currentStoreIdx<stores.length-1)return{...i,store:stores[currentStoreIdx+1]};
      return i;
    }));
  };

  const openSub=async(id)=>{
    setSubTarget(id);
    if(subs[id])return;
    const item=ingredients.find(i=>i.id===id);
    if(!item)return;
    setSubLoading(true);
    try{const s=await getSubs(item.name,item.qty);setSubs(p=>({...p,[id]:s}));}
    catch{setSubs(p=>({...p,[id]:["Similar item","Store brand","Skip it"]}));}
    setSubLoading(false);
  };

  const STATUS={purchased:{icon:"✓",color:C.accent},have:{icon:"🏠",color:C.purple},unavailable:{icon:"✗",color:C.danger},substituted:{icon:"↔",color:C.warn}};

  return(
    <div style={{minHeight:"100vh",background:C.bg,paddingBottom:100}}>
      <CSS/>
      <div style={{padding:"52px 20px 0",background:`linear-gradient(180deg,${STORE_COLORS[store]||C.accent}1A 0%,transparent 100%)`}}>
        <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:12}}>
          {stores.map((s,i)=>(
            <button key={s} onClick={()=>setCurrentStoreIdx(i)} style={{padding:"8px 16px",borderRadius:99,flexShrink:0,cursor:"pointer",border:`1px solid ${i===currentStoreIdx?STORE_COLORS[s]:C.border}`,background:i===currentStoreIdx?STORE_COLORS[s]+"22":"transparent",color:i===currentStoreIdx?STORE_COLORS[s]:C.muted,fontWeight:700,fontSize:12,fontFamily:"inherit"}}>
              {i===currentStoreIdx?"📍 ":""}{s}{i>currentStoreIdx&&<span style={{marginLeft:6,color:C.muted,fontSize:11}}>({ingredients.filter(x=>x.store===s&&x.status==="pending").length})</span>}
            </button>
          ))}
        </div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:10}}>
          <div>
            <p style={{color:C.muted,fontSize:11,fontWeight:700,letterSpacing:".06em"}}>NOW SHOPPING</p>
            <h2 style={{fontFamily:"'Syne',sans-serif",fontSize:22,fontWeight:800,color:C.text,marginTop:2}}>{store}</h2>
          </div>
          <div style={{textAlign:"right"}}>
            <p style={{color:STORE_COLORS[store],fontSize:26,fontWeight:800}}>{pct}%</p>
            <p style={{color:C.muted,fontSize:12}}>{done.length}/{storeItems.length} done</p>
          </div>
        </div>
        <ProgressBar value={pct} color={STORE_COLORS[store]} style={{marginBottom:20}}/>
      </div>

      <div style={{padding:"0 20px",display:"flex",flexDirection:"column",gap:8}}>
        {pending.map(item=>(
          <div key={item.id} className="fi" style={{background:C.card,borderRadius:18,border:`1px solid ${C.border}`,overflow:"hidden"}}>
            <div style={{padding:"14px 16px",display:"flex",alignItems:"center",gap:12}}>
              <div style={{width:22,height:22,borderRadius:6,border:`2px solid ${C.border}`,flexShrink:0}}/>
              <div style={{flex:1}}>
                <p style={{color:C.text,fontSize:16,fontWeight:600}}>{item.name}</p>
                <p style={{color:C.muted,fontSize:13}}>{item.qty}</p>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",borderTop:`1px solid ${C.border}`}}>
              {[
                {label:"Got it",emoji:"✓",action:"buy",color:C.accent},
                {label:"Have it",emoji:"🏠",action:"have",color:C.purple},
                {label:"N/A",emoji:"✗",action:"unavail",color:C.danger},
                currentStoreIdx<stores.length-1
                  ?{label:"→ Next",emoji:"➡",action:"next",color:C.warn}
                  :{label:"Sub",emoji:"↔",action:"sub",color:C.warn},
              ].map(a=>(
                <button key={a.action} onClick={()=>act(item.id,a.action)} style={{padding:"12px 4px",background:"transparent",border:"none",borderRight:`1px solid ${C.border}`,color:a.color,display:"flex",flexDirection:"column",alignItems:"center",gap:3,cursor:"pointer",fontFamily:"inherit"}}>
                  <span style={{fontSize:16}}>{a.emoji}</span>
                  <span style={{fontSize:10,fontWeight:700}}>{a.label}</span>
                </button>
              ))}
            </div>
          </div>
        ))}

        {done.length>0&&(
          <div style={{marginTop:8}}>
            <p style={{color:C.muted,fontSize:11,fontWeight:700,letterSpacing:".08em",padding:"4px 4px 8px"}}>DONE ({done.length})</p>
            {done.map(item=>(
              <div key={item.id} style={{display:"flex",alignItems:"center",gap:12,padding:"11px 16px",background:C.card,borderRadius:14,border:`1px solid ${C.border}`,marginBottom:6,opacity:.65}}>
                <div style={{width:22,height:22,borderRadius:6,background:STATUS[item.status]?.color+"33",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:STATUS[item.status]?.color,flexShrink:0}}>{STATUS[item.status]?.icon}</div>
                <p style={{flex:1,color:C.muted,fontSize:15,textDecoration:"line-through"}}>{item.name}</p>
                <span style={{color:STATUS[item.status]?.color,fontSize:11,fontWeight:700}}>{item.status.toUpperCase()}</span>
              </div>
            ))}
          </div>
        )}

        {pending.length===0&&nextItems.length>0&&(
          <Card style={{border:`1px solid ${C.warn}44`,background:C.warn+"0A",marginTop:8}}>
            <p style={{color:C.warn,fontWeight:700,marginBottom:8}}>🏪 Next: {stores[currentStoreIdx+1]} · {nextItems.length} items</p>
            {nextItems.slice(0,4).map(i=><p key={i.id} style={{color:C.muted,fontSize:14,padding:"3px 0"}}>• {i.name}</p>)}
            {nextItems.length>4&&<p style={{color:C.muted,fontSize:13}}>+{nextItems.length-4} more</p>}
            <Btn onClick={()=>setCurrentStoreIdx(x=>x+1)} variant="warn" style={{width:"100%",marginTop:12}}>Head to {stores[currentStoreIdx+1]} →</Btn>
          </Card>
        )}

        {pending.length===0&&nextItems.length===0&&(
          <Card style={{textAlign:"center",padding:32,border:`1px solid ${C.accent}44`}}>
            <div style={{fontSize:52,marginBottom:12}}>🎉</div>
            <h3 style={{color:C.text,fontFamily:"'Syne',sans-serif",fontSize:20,fontWeight:800}}>All stores done!</h3>
            <p style={{color:C.muted,fontSize:14,marginTop:6,marginBottom:20}}>Time to review your trip.</p>
            <Btn onClick={()=>onNav("summary")} style={{width:"100%"}}>View Trip Summary →</Btn>
          </Card>
        )}
      </div>

      {subTarget&&(
        <SubModal item={ingredients.find(i=>i.id===subTarget)} subs={subs[subTarget]} loading={subLoading}
          nextStore={currentStoreIdx<stores.length-1?stores[currentStoreIdx+1]:null}
          onClose={()=>setSubTarget(null)}
          onSub={sub=>{setIngredients(p=>p.map(i=>i.id===subTarget?{...i,name:sub,status:"substituted"}:i));setSubTarget(null);}}
          onSkip={()=>{setIngredients(p=>p.map(i=>i.id===subTarget?{...i,status:"unavailable"}:i));setSubTarget(null);}}
          onMove={()=>{setIngredients(p=>p.map(i=>i.id===subTarget?{...i,store:stores[currentStoreIdx+1]}:i));setSubTarget(null);}}
        />
      )}
    </div>
  );
};

// SUB MODAL
const SubModal=({item,subs,loading,onClose,onSub,onSkip,nextStore,onMove})=>{
  const [custom,setCustom]=useState("");
  return(
    <div style={{position:"fixed",inset:0,background:"#000000CC",zIndex:100,display:"flex",alignItems:"flex-end"}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:C.surface,borderRadius:"24px 24px 0 0",padding:"24px 20px 48px",width:"100%",maxWidth:430,margin:"0 auto",border:`1px solid ${C.border}`}}>
        <CSS/>
        <div style={{width:40,height:4,background:C.border,borderRadius:99,margin:"0 auto 20px"}}/>
        <Pill color={C.warn} style={{marginBottom:8}}>AI SUBSTITUTIONS</Pill>
        <h3 style={{color:C.text,fontFamily:"'Syne',sans-serif",fontSize:20,fontWeight:800,marginBottom:20}}>{item?.name}</h3>
        {loading
          ?<Spinner label="Finding the best substitutions…"/>
          :<div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16}}>
            {(subs||[]).map(s=>(
              <button key={s} onClick={()=>onSub(s)} style={{padding:"14px 16px",background:C.card,border:`1px solid ${C.border}`,borderRadius:14,color:C.text,fontWeight:600,fontSize:15,textAlign:"left",cursor:"pointer",fontFamily:"inherit",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                {s} <span style={{color:C.accent,fontSize:12}}>Use this →</span>
              </button>
            ))}
          </div>
        }
        <div style={{display:"flex",gap:8,marginBottom:12}}>
          <input value={custom} onChange={e=>setCustom(e.target.value)} placeholder="Type custom replacement…"
            style={{flex:1,background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"12px 14px",color:C.text,fontSize:14,fontFamily:"inherit",outline:"none"}}/>
          <Btn onClick={()=>custom&&onSub(custom)} disabled={!custom} style={{padding:"12px 16px",borderRadius:12,flexShrink:0}}>✓</Btn>
        </div>
        <div style={{display:"grid",gridTemplateColumns:`${nextStore?"1fr ":""}1fr`,gap:8}}>
          {nextStore&&<Btn onClick={onMove} variant="ghost" style={{fontSize:13}}>→ Send to {nextStore.split(" ")[0]}</Btn>}
          <Btn onClick={onSkip} variant="danger" style={{fontSize:13}}>Skip item</Btn>
        </div>
      </div>
    </div>
  );
};

// SUMMARY
const SummaryScreen=({onNav,ingredients,recipeName,onSavePantry,onClearTrip})=>{
  const [pantryDone,setPantryDone]=useState(false);
  const purchased=ingredients.filter(i=>["purchased","substituted"].includes(i.status));
  const have=ingredients.filter(i=>i.status==="have");
  const skipped=ingredients.filter(i=>i.status==="unavailable");
  const pct=Math.round((purchased.length+have.length)/ingredients.length*100);
  return(
    <div style={{minHeight:"100vh",background:C.bg,paddingBottom:80}}>
      <CSS/>
      <div style={{padding:"56px 20px 32px",textAlign:"center"}}>
        <div style={{fontSize:56,marginBottom:12}}>🛍️</div>
        <h2 style={{fontFamily:"'Syne',sans-serif",fontSize:28,fontWeight:800,color:C.text}}>Trip Complete!</h2>
        <p style={{color:C.muted,fontSize:14,marginTop:6}}>{recipeName} · {pct}% complete</p>
        <div style={{display:"flex",justifyContent:"center",gap:24,marginTop:20}}>
          {[{n:purchased.length,label:"Purchased",color:C.accent},{n:have.length,label:"Had at home",color:C.purple},{n:skipped.length,label:"Skipped",color:C.danger}].map(s=>(
            <div key={s.label} style={{textAlign:"center"}}>
              <p style={{color:s.color,fontSize:28,fontWeight:800}}>{s.n}</p>
              <p style={{color:C.muted,fontSize:12}}>{s.label}</p>
            </div>
          ))}
        </div>
      </div>
      <div style={{padding:"0 20px",display:"flex",flexDirection:"column",gap:12}}>
        {[{items:purchased,label:"PURCHASED",color:C.accent,icon:"✓"},{items:have,label:"HAD AT HOME",color:C.purple,icon:"🏠"},{items:skipped,label:"SKIPPED",color:C.danger,icon:"✗"}].filter(g=>g.items.length>0).map(g=>(
          <Card key={g.label}>
            <p style={{color:g.color,fontSize:11,fontWeight:700,letterSpacing:".1em",marginBottom:10}}>{g.icon} {g.label} ({g.items.length})</p>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>{g.items.map(i=><Pill key={i.id} color={g.color}>{i.name}</Pill>)}</div>
          </Card>
        ))}
        {!pantryDone
          ?<Card style={{border:`1px solid ${C.accent}33`,background:C.accent+"08"}}>
            <p style={{color:C.text,fontWeight:700,fontSize:16,marginBottom:4}}>Save to Pantry?</p>
            <p style={{color:C.muted,fontSize:13,marginBottom:14}}>{purchased.length} purchased items will be saved so you won't need to buy them next time.</p>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              <Btn onClick={()=>{onSavePantry(purchased.map(i=>({name:i.name,addedAt:new Date().toISOString()})));setPantryDone(true);}} style={{fontSize:13}}>Yes, save!</Btn>
              <Btn onClick={()=>setPantryDone(true)} variant="ghost" style={{fontSize:13}}>Skip</Btn>
            </div>
          </Card>
          :<Card style={{border:`1px solid ${C.accent}33`,textAlign:"center",padding:20}}>
            <p style={{fontSize:28,marginBottom:6}}>✅</p>
            <p style={{color:C.accent,fontWeight:700}}>Pantry updated!</p>
          </Card>
        }
        <Btn onClick={()=>{onClearTrip();onNav("home");}} variant="ghost" style={{width:"100%"}}>← Back to Home</Btn>
      </div>
    </div>
  );
};

// PANTRY — with Scan My Fridge
const PantryScreen=({pantry,setPantry})=>{
  const [adding,setAdding]=useState("");
  const [scanning,setScanning]=useState(false);
  const [scanResult,setScanResult]=useState(null); // {found:[],preview:url}
  const [confirming,setConfirming]=useState(false);
  const [selected,setSelected]=useState({});
  const scanRef=useRef();

  const ago=iso=>{
    const d=Math.floor((Date.now()-new Date(iso).getTime())/86400000);
    if(d===0)return"Today";if(d===1)return"Yesterday";return`${d}d ago`;
  };

  const handleScan=async(e)=>{
    const f=e.target.files?.[0];if(!f)return;
    const previewUrl=URL.createObjectURL(f);
    setScanning(true);setScanResult(null);
    const reader=new FileReader();
    reader.onload=async()=>{
      const b64=reader.result.split(",")[1];
      try{
        const res=await fetch("https://api.anthropic.com/v1/messages",{
          method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({
            model:"claude-sonnet-4-20250514",max_tokens:800,
            system:`You are a fridge and pantry scanner. Look at the photo and identify every visible food item, ingredient, condiment, beverage, or produce. Return ONLY a JSON array of short item name strings. No markdown, no explanation. Example: ["Milk","Eggs","Cheddar cheese","Butter","Hot sauce","Leftover chicken","Bell peppers"]`,
            messages:[{role:"user",content:[
              {type:"image",source:{type:"base64",media_type:"image/jpeg",data:b64}},
              {type:"text",text:"What food items do you see in this fridge or pantry photo?"}
            ]}],
          }),
        });
        const data=await res.json();
        const text=data.content.map(b=>b.text||"").join("").replace(/```json|```/g,"").trim();
        const found=JSON.parse(text);
        const init={};found.forEach((_,i)=>init[i]=true);
        setSelected(init);
        setScanResult({found,preview:previewUrl});
        setConfirming(true);
      } catch(_){
        // Fallback demo items when API not available in sandbox
        const demo=["Milk","Eggs","Butter","Cheddar cheese","Leftover chicken","Bell peppers","Spinach","Hot sauce","Orange juice","Greek yogurt"];
        const init={};demo.forEach((_,i)=>init[i]=true);
        setSelected(init);
        setScanResult({found:demo,preview:previewUrl});
        setConfirming(true);
      } finally{setScanning(false);}
    };
    reader.readAsDataURL(f);
  };

  const addScanned=()=>{
    const toAdd=scanResult.found
      .filter((_,i)=>selected[i])
      .filter(name=>!pantry.some(p=>p.name.toLowerCase()===name.toLowerCase()))
      .map(name=>({name,addedAt:new Date().toISOString()}));
    setPantry(p=>[...p,...toAdd]);
    setConfirming(false);setScanResult(null);
  };

  const addManual=()=>{
    if(!adding.trim())return;
    setPantry(p=>[...p,{name:adding.trim(),addedAt:new Date().toISOString()}]);
    setAdding("");
  };

  return(
    <div style={{minHeight:"100vh",background:C.bg,paddingBottom:80}}>
      <CSS/>
      <input ref={scanRef} type="file" accept="image/*" capture="environment" onChange={handleScan} style={{display:"none"}}/>

      {/* Header */}
      <div style={{padding:"56px 20px 20px",background:`radial-gradient(ellipse at 50% 0%,${C.accent}12 0%,transparent 70%)`}}>
        <h2 style={{fontFamily:"'Syne',sans-serif",fontSize:26,fontWeight:800,color:C.text}}>My Pantry</h2>
        <p style={{color:C.muted,fontSize:14,marginTop:4}}>{pantry.length} items saved between trips</p>
      </div>

      {/* Scan CTA — coming soon */}
      <div style={{padding:"0 20px 16px"}}>
        <div style={{
          width:"100%",padding:"20px 16px",borderRadius:20,fontFamily:"inherit",
          background:`linear-gradient(135deg,${C.purple}18,${C.purple}08)`,
          border:`1.5px dashed ${C.purple}66`,
          display:"flex",alignItems:"center",gap:16,opacity:0.85,
        }}>
          <div style={{width:52,height:52,borderRadius:16,background:C.purple+"33",display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,flexShrink:0}}>
            📷
          </div>
          <div style={{textAlign:"left",flex:1}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2}}>
              <p style={{color:C.text,fontWeight:800,fontSize:16,fontFamily:"inherit"}}>Scan My Fridge</p>
              <Pill color={C.purple} style={{fontSize:9}}>SOON</Pill>
            </div>
            <p style={{color:C.muted,fontSize:13,fontFamily:"inherit"}}>
              Snap your fridge — AI auto-fills your pantry. Coming with the next update.
            </p>
          </div>
        </div>
      </div>

      {/* Manual add */}
      <div style={{padding:"0 20px 16px",display:"flex",gap:8}}>
        <input value={adding} onChange={e=>setAdding(e.target.value)}
          onKeyDown={e=>{if(e.key==="Enter")addManual();}}
          placeholder="Or type an item to add…"
          style={{flex:1,background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"12px 14px",color:C.text,fontSize:14,fontFamily:"inherit",outline:"none"}}/>
        <Btn onClick={addManual} disabled={!adding.trim()} style={{padding:"12px 16px",borderRadius:12,flexShrink:0}}>+</Btn>
      </div>

      {/* Pantry list */}
      <div style={{padding:"0 20px",display:"flex",flexDirection:"column",gap:6}}>
        {pantry.length===0&&(
          <Card style={{textAlign:"center",padding:"36px 24px"}}>
            <p style={{fontSize:40,marginBottom:12}}>🥫</p>
            <p style={{color:C.text,fontWeight:700,fontSize:16,marginBottom:6}}>Your pantry is empty</p>
            <p style={{color:C.muted,fontSize:14,lineHeight:1.6}}>Scan your fridge above or add items manually. The app will auto-check these off future shopping lists.</p>
          </Card>
        )}
        {pantry.length>0&&(
          <p style={{color:C.muted,fontSize:11,fontWeight:700,letterSpacing:".08em",paddingLeft:4,paddingBottom:4}}>SAVED ITEMS</p>
        )}
        {pantry.map(p=>(
          <div key={p.name} className="fi" style={{display:"flex",alignItems:"center",gap:12,padding:"14px 16px",background:C.card,borderRadius:14,border:`1px solid ${C.border}`}}>
            <div style={{width:8,height:8,borderRadius:"50%",background:C.accent,flexShrink:0}}/>
            <p style={{flex:1,color:C.text,fontSize:15,fontWeight:500}}>{p.name}</p>
            <p style={{color:C.muted,fontSize:12}}>{p.addedAt?ago(p.addedAt):""}</p>
            <button onClick={()=>setPantry(prev=>prev.filter(i=>i.name!==p.name))} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",padding:6,fontSize:16}}>✕</button>
          </div>
        ))}
      </div>

      {/* Scan confirm sheet */}
      {confirming&&scanResult&&(
        <div style={{position:"fixed",inset:0,background:"#000000CC",zIndex:100,display:"flex",alignItems:"flex-end"}}>
          <div style={{background:C.surface,borderRadius:"24px 24px 0 0",padding:"24px 20px 48px",width:"100%",maxWidth:430,margin:"0 auto",border:`1px solid ${C.border}`,maxHeight:"85vh",overflowY:"auto"}}>
            <CSS/>
            <div style={{width:40,height:4,background:C.border,borderRadius:99,margin:"0 auto 20px"}}/>

            {/* Preview thumbnail */}
            <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:20}}>
              <img src={scanResult.preview} alt="scan" style={{width:64,height:64,borderRadius:12,objectFit:"cover",border:`1px solid ${C.border}`}}/>
              <div>
                <Pill color={C.accent} style={{marginBottom:6}}>AI FOUND {scanResult.found.length} ITEMS</Pill>
                <p style={{color:C.text,fontWeight:700,fontSize:16}}>Confirm what to add</p>
                <p style={{color:C.muted,fontSize:13}}>Tap to deselect anything wrong</p>
              </div>
            </div>

            {/* Toggleable item chips */}
            <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:24}}>
              {scanResult.found.map((item,i)=>(
                <button key={i} onClick={()=>setSelected(p=>({...p,[i]:!p[i]}))} style={{
                  padding:"10px 16px",borderRadius:99,cursor:"pointer",fontFamily:"inherit",fontSize:14,fontWeight:600,
                  border:`1.5px solid ${selected[i]?C.accent:C.border}`,
                  background:selected[i]?C.accent+"22":"transparent",
                  color:selected[i]?C.accent:C.muted,
                  textDecoration:selected[i]?"none":"line-through",
                  transition:"all .15s",
                }}>
                  {selected[i]?"✓ ":""}{item}
                </button>
              ))}
            </div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <Btn onClick={addScanned} style={{fontSize:15}}>
                Add {Object.values(selected).filter(Boolean).length} Items →
              </Btn>
              <Btn onClick={()=>{setConfirming(false);setScanResult(null);}} variant="ghost" style={{fontSize:15}}>
                Cancel
              </Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// HISTORY
const HistoryScreen=({history})=>(
  <div style={{minHeight:"100vh",background:C.bg,paddingBottom:80}}>
    <CSS/>
    <div style={{padding:"56px 20px 24px"}}>
      <h2 style={{fontFamily:"'Syne',sans-serif",fontSize:26,fontWeight:800,color:C.text}}>Past Trips</h2>
      <p style={{color:C.muted,fontSize:14,marginTop:4}}>Saved automatically after each trip.</p>
    </div>
    <div style={{padding:"0 20px",display:"flex",flexDirection:"column",gap:10}}>
      {history.length===0&&<Card style={{textAlign:"center",padding:32}}><p style={{fontSize:32,marginBottom:8}}>📋</p><p style={{color:C.muted,fontSize:14}}>No trips yet. Complete your first trip to see it here.</p></Card>}
      {history.map((h,i)=>{
        const pct=h.ingredients?Math.round(h.ingredients.filter(x=>["purchased","substituted"].includes(x.status)).length/h.ingredients.length*100):0;
        return(
          <Card key={i}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
              <div>
                <p style={{color:C.text,fontWeight:700,fontSize:16}}>{h.recipeName}</p>
                <p style={{color:C.muted,fontSize:13}}>{new Date(h.savedAt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</p>
              </div>
              <Pill color={C.accent}>{pct}% done</Pill>
            </div>
            <ProgressBar value={pct}/>
          </Card>
        );
      })}
    </div>
  </div>
);

// NAV
// ─────────────────────────────────────────────────────────────────────────────
// RECIPE BROWSE — search a big library, filter by diet/allergen, send to list
// ─────────────────────────────────────────────────────────────────────────────
const DIETS=[
  {id:"",label:"All"},
  {id:"ketogenic",label:"Keto"},
  {id:"vegetarian",label:"Vegetarian"},
  {id:"vegan",label:"Vegan"},
  {id:"gluten free",label:"Gluten-free"},
  {id:"dairy free",label:"Dairy-free"},
  {id:"paleo",label:"Paleo"},
  {id:"whole30",label:"Whole30"},
];
const INTOLERANCES=["Dairy","Egg","Gluten","Peanut","Seafood","Shellfish","Soy","Tree Nut","Wheat"];

// Map a Spoonacular recipe into the app's ingredient shape (reuses categorizer).
function recipeToIngredients(recipe){
  return (recipe.ingredients||[]).map((ing,i)=>{
    const amount = ing.amount ? (Number.isInteger(ing.amount)?ing.amount:ing.amount.toFixed(2).replace(/\.?0+$/,"")) : "";
    const qty = [amount, ing.unit].filter(Boolean).join(" ").trim();
    const name = (ing.name||"").trim();
    return {
      id: Date.now()+i,
      name: name.charAt(0).toUpperCase()+name.slice(1),
      qty,
      category: categorizeIngredient(name),
      store:null, status:"pending",
    };
  }).filter(x=>x.name.length>1);
}

const RecipeBrowseScreen=({onNav,onImport})=>{
  const [query,setQuery]=useState("");
  const [diet,setDiet]=useState("");
  const [intol,setIntol]=useState([]);
  const [results,setResults]=useState([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [limit,setLimit]=useState(false);
  const [searched,setSearched]=useState(false);

  const togIntol=(v)=>setIntol(p=>p.includes(v)?p.filter(x=>x!==v):[...p,v]);

  const search=async()=>{
    setLoading(true);setError("");setLimit(false);setSearched(true);
    try{
      const params=new URLSearchParams({action:"search",number:"12"});
      if(query.trim())params.set("query",query.trim());
      if(diet)params.set("diet",diet);
      if(intol.length)params.set("intolerances",intol.join(",").toLowerCase());
      const r=await fetch(`/api/recipes?${params}`);
      const data=await r.json();
      if(data.limit){setLimit(true);setResults([]);}
      else if(data.error){setError(data.error);setResults([]);}
      else setResults(data.results||[]);
    }catch(e){
      setError("Couldn't load recipes. Check your connection and try again.");
      setResults([]);
    }finally{setLoading(false);}
  };

  const useRecipe=(rec)=>{
    const ings=recipeToIngredients(rec);
    if(!ings.length){setError("That recipe didn't include a usable ingredient list. Try another.");return;}
    onImport({recipeName:rec.title,servings:rec.servings||4,ingredients:ings});
    onNav("review");
  };

  return(
    <div style={{minHeight:"100vh",background:C.bg,paddingBottom:90}}>
      <CSS/>
      <div style={{padding:"56px 20px 16px"}}>
        <Pill color={C.accent} style={{marginBottom:10}}>RECIPE LIBRARY</Pill>
        <h2 style={{fontFamily:"'Syne',sans-serif",fontSize:26,fontWeight:800,color:C.text,letterSpacing:"-.02em"}}>Find something to make</h2>
        <p style={{color:C.muted,fontSize:14,marginTop:4}}>No plan tonight? Search thousands of recipes and send one straight to your list.</p>
      </div>

      <div style={{padding:"0 20px",display:"flex",flexDirection:"column",gap:14}}>
        {/* Search box */}
        <div style={{display:"flex",gap:8}}>
          <input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>e.key==="Enter"&&search()}
            placeholder="e.g. chicken pasta, tacos…"
            style={{flex:1,background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"13px 14px",color:C.text,fontSize:15,fontFamily:"inherit",outline:"none"}}/>
          <Btn onClick={search} style={{padding:"0 18px"}}>Search</Btn>
        </div>

        {/* Diet filter chips */}
        <div>
          <p style={{color:C.muted,fontSize:11,fontWeight:700,letterSpacing:".08em",marginBottom:8}}>DIETARY NEED</p>
          <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
            {DIETS.map(d=>(
              <span key={d.id} onClick={()=>setDiet(d.id)}
                style={{fontSize:12,fontWeight:700,padding:"7px 13px",borderRadius:99,cursor:"pointer",
                  color:diet===d.id?"#000":C.muted,background:diet===d.id?C.accent:C.card,
                  border:`1px solid ${diet===d.id?C.accent:C.border}`}}>{d.label}</span>
            ))}
          </div>
        </div>

        {/* Allergen exclusions */}
        <div>
          <p style={{color:C.muted,fontSize:11,fontWeight:700,letterSpacing:".08em",marginBottom:8}}>AVOID (ALLERGENS)</p>
          <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
            {INTOLERANCES.map(v=>(
              <span key={v} onClick={()=>togIntol(v)}
                style={{fontSize:12,fontWeight:600,padding:"7px 12px",borderRadius:99,cursor:"pointer",
                  color:intol.includes(v)?"#000":C.muted,background:intol.includes(v)?C.warn:C.card,
                  border:`1px solid ${intol.includes(v)?C.warn:C.border}`}}>{v}</span>
            ))}
          </div>
        </div>

        {loading&&<Spinner label="Finding recipes that match…"/>}

        {limit&&!loading&&(
          <Card style={{border:`1px solid ${C.warn}44`,background:C.warn+"14"}}>
            <p style={{color:C.warn,fontSize:14,fontWeight:600}}>Daily recipe limit reached</p>
            <p style={{color:C.muted,fontSize:13,marginTop:4}}>The free recipe service resets every day. Try again tomorrow, or build your list by hand for now.</p>
          </Card>
        )}
        {error&&!loading&&<Card style={{border:`1px solid ${C.danger}44`,background:C.danger+"14"}}><p style={{color:C.danger,fontSize:14}}>{error}</p></Card>}

        {!loading&&searched&&!error&&!limit&&results.length===0&&(
          <Card><p style={{color:C.muted,fontSize:14,textAlign:"center",padding:"12px 0"}}>No recipes matched those filters. Try removing one.</p></Card>
        )}

        {/* Results */}
        {!loading&&results.map(rec=>(
          <Card key={rec.id} style={{padding:0,overflow:"hidden"}} className="fi">
            {rec.image&&<img src={rec.image} alt={rec.title} style={{width:"100%",height:150,objectFit:"cover",display:"block"}}/>}
            <div style={{padding:14}}>
              <p style={{color:C.text,fontWeight:700,fontSize:16,lineHeight:1.3}}>{rec.title}</p>
              <div style={{display:"flex",gap:8,flexWrap:"wrap",margin:"8px 0 12px"}}>
                {rec.readyInMinutes>0&&<Pill color={C.muted}>{rec.readyInMinutes} min</Pill>}
                {rec.servings>0&&<Pill color={C.muted}>{rec.servings} servings</Pill>}
                {(rec.diets||[]).slice(0,2).map(d=><Pill key={d} color={C.accent}>{d}</Pill>)}
              </div>
              <Btn onClick={()=>useRecipe(rec)} style={{width:"100%"}}>Send {rec.ingredients?.length||""} ingredients to list →</Btn>
            </div>
          </Card>
        ))}

        {!searched&&!loading&&(
          <Card style={{border:`1px dashed ${C.border}`,background:"transparent"}}>
            <p style={{color:C.muted,fontSize:14,textAlign:"center",padding:"16px 0",lineHeight:1.6}}>🔍 Pick a filter or type what you're craving, then hit Search.</p>
          </Card>
        )}
      </div>
    </div>
  );
};


const NavBar=({screen,onNav})=>{
  if(["shopping","triptype"].includes(screen))return null;
  const tabs=[{id:"home",label:"Home",emoji:"🏠"},{id:"browse",label:"Recipes",emoji:"🔍"},{id:"triptype",label:"New Trip",emoji:"✚"},{id:"pantry",label:"Pantry",emoji:"🥫"}];
  return(
    <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:430,background:C.surface,borderTop:`1px solid ${C.border}`,display:"flex",padding:"8px 0 20px",zIndex:50}}>
      {tabs.map(t=>{
        const active=screen===t.id;
        return(
          <button key={t.id} onClick={()=>onNav(t.id)} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4,background:"none",border:"none",cursor:"pointer",padding:"8px 0"}}>
            <span style={{fontSize:20}}>{t.emoji}</span>
            <span style={{fontSize:11,fontWeight:active?700:500,color:active?C.accent:C.muted,fontFamily:"inherit"}}>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ROOT
// ─────────────────────────────────────────────────────────────────────────────
export default function App(){
  const [pantry,setPantryRaw]=useState(()=>LS.get(PANTRY_KEY,[]));
  const [history,setHistoryRaw]=useState(()=>LS.get(HIST_KEY,[]));
  const [trip,setTripRaw]=useState(()=>LS.get(TRIP_KEY,null));
  const [screen,setScreen]=useState("home");
  const [prefill,setPrefill]=useState(null);
  const [tripContext,setTripContext]=useState({type:"family",answers:{}});

  const [ingredients,setIngredientsRaw]=useState(()=>trip?.ingredients||[]);
  const [recipeName,setRecipeName]=useState(()=>trip?.recipeName||"");
  const [stores,setStores]=useState(()=>trip?.stores||[]);
  const [currentStoreIdx,setCurrentStoreIdxRaw]=useState(()=>trip?.currentStoreIdx||0);

  const setPantry=v=>{const n=typeof v==="function"?v(pantry):v;setPantryRaw(n);LS.set(PANTRY_KEY,n);};
  const setHistory=v=>{const n=typeof v==="function"?v(history):v;setHistoryRaw(n);LS.set(HIST_KEY,n);};

  const syncTrip=(ings,rn,st,idx)=>{
    const t={ingredients:ings,recipeName:rn,stores:st,currentStoreIdx:idx};
    setTripRaw(t);LS.set(TRIP_KEY,t);
  };

  const setIngredients=useCallback(updater=>{
    setIngredientsRaw(prev=>{
      const next=typeof updater==="function"?updater(prev):updater;
      syncTrip(next,recipeName,stores,currentStoreIdx);
      return next;
    });
  },[recipeName,stores,currentStoreIdx]);

  const setCurrentStoreIdx=idx=>{
    setCurrentStoreIdxRaw(idx);
    syncTrip(ingredients,recipeName,stores,idx);
  };

  const handleImport=({recipeName:rn,ingredients:ings})=>{
    setRecipeName(rn);setIngredientsRaw(ings);
    syncTrip(ings,rn,[],0);
  };

  const handleSavePantry=items=>{
    setPantry(prev=>{
      const names=new Set(prev.map(p=>p.name.toLowerCase()));
      return[...prev,...items.filter(i=>!names.has(i.name.toLowerCase()))];
    });
  };

  const handleClearTrip=()=>{
    if(ingredients.length>0)setHistory(h=>[{recipeName,ingredients,stores,savedAt:new Date().toISOString()},...h.slice(0,9)]);
    setTripRaw(null);LS.del(TRIP_KEY);
    setIngredientsRaw([]);setRecipeName("");setStores([]);setCurrentStoreIdxRaw(0);
  };

  const nav=(s,data)=>{if(data)setPrefill(data);setScreen(s);};
  const BACK={triptype:"home",import:"triptype",browse:"home",review:"import",setup:"review",assign:"setup",summary:"home",pantry:"home",history:"home"};

  return(
    <div style={{fontFamily:"'DM Sans',sans-serif",background:C.bg,minHeight:"100vh",maxWidth:430,margin:"0 auto",position:"relative",overflowX:"hidden"}}>
      <link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700;9..40,800&display=swap" rel="stylesheet"/>
      <CSS/>
      {BACK[screen]&&<BackBtn onBack={()=>setScreen(BACK[screen])}/>}
      {screen==="home"     &&<HomeScreen    onNav={nav} trip={trip} pantry={pantry} history={history}/>}
      {screen==="triptype"  &&<TripTypeScreen onNav={nav} setTripContext={setTripContext}/>}
      {screen==="import"   &&<ImportScreen  onNav={nav} onImport={handleImport} prefill={prefill}/>}
      {screen==="browse"   &&<RecipeBrowseScreen onNav={nav} onImport={handleImport}/>}
      {screen==="review"   &&<ReviewScreen  onNav={nav} ingredients={ingredients} setIngredients={setIngredients} recipeName={recipeName} pantry={pantry} stores={stores} setStores={setStores}/>}
      {screen==="setup"    &&<SetupScreen   onNav={nav} ingredients={ingredients} setIngredients={setIngredients} stores={stores} setStores={setStores} pantry={pantry}/>}
      {screen==="assign"   &&<AssignScreen  onNav={nav} ingredients={ingredients} setIngredients={setIngredients} stores={stores}/>}
      {screen==="shopping" &&<ShoppingScreen onNav={nav} ingredients={ingredients} setIngredients={setIngredients} stores={stores} currentStoreIdx={currentStoreIdx} setCurrentStoreIdx={setCurrentStoreIdx}/>}
      {screen==="summary"  &&<SummaryScreen onNav={nav} ingredients={ingredients} recipeName={recipeName} onSavePantry={handleSavePantry} onClearTrip={handleClearTrip}/>}
      {screen==="pantry"   &&<PantryScreen  pantry={pantry} setPantry={setPantry}/>}
      {screen==="history"  &&<HistoryScreen history={history}/>}
      <NavBar screen={screen} onNav={nav}/>
    </div>
  );
}
