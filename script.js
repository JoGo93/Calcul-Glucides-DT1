const DEFAULT_ADMIN_PIN = "112233";
const CENTRAL_DB_URL = "database.json";

const FALLBACK_ITEMS = [
  {id:"banane", name:"Banane", carbs:20.2, category:"Aliment", photo:"", source:"central"},
  {id:"pate", name:"Pâté chinois aux patates douces", carbs:7.8, category:"Recette", photo:"", source:"central"}
];

const LS_CENTRAL_CACHE = "dt1_central_database_cache_v1";
const LS_LOCAL_ITEMS = "dt1_local_family_items_v1";
const OLD_KEYS = ["dt1_items_v5_search","dt1_items_v4_categories","dt1_recipes_v3_secure","dt1_recipes_v2"];
const LS_PIN = "dt1_admin_pin";
const LS_ADMIN = "dt1_admin_unlocked";
const LS_FAVORITES = "dt1_favorite_item_ids_v1";
const LS_RECENTS = "dt1_recent_item_ids_v1";

let centralItems = [];
let localItems = [];
let items = [];
let selectedItemId = "";
let currentPhotoData = "";
let currentFilter = "Tous";
let currentLetterFilter = "Tous";
let favoriteIds = [];
let recentIds = [];

function normalizeItem(r, idx=0, source="local"){
  return {
    id: r.id || `${source}_${Date.now()}_${idx}`,
    name: String(r.name || r.nom || "").trim(),
    carbs: Number(r.carbs ?? r.glucides ?? r.glucidesNets100g),
    category: (r.category === "Aliment" || r.category === "Recette") ? r.category : "Recette",
    photo: r.photo || "",
    source: r.source || source
  };
}

function dedupeByNameAndCategory(list){
  const map = new Map();
  for(const item of list){
    const key = `${item.name.toLowerCase()}|${item.category}`;
    map.set(key, item);
  }
  return [...map.values()];
}

function mergeItems(){
  items = dedupeByNameAndCategory([...centralItems, ...localItems]).filter(x=>x.name && !isNaN(x.carbs));
}

function sortedItems(list=items){
  return [...list].sort((a,b)=>a.name.localeCompare(b.name,"fr",{sensitivity:"base"}));
}

function getPin(){ return localStorage.getItem(LS_PIN) || DEFAULT_ADMIN_PIN; }
function isAdmin(){ return sessionStorage.getItem(LS_ADMIN) === "1"; }

function saveLocalItems(){
  localStorage.setItem(LS_LOCAL_ITEMS, JSON.stringify(localItems));
  mergeItems();
}

function loadLocalItems(){
  const saved = localStorage.getItem(LS_LOCAL_ITEMS);
  if(saved){
    localItems = JSON.parse(saved).map((x,i)=>normalizeItem(x,i,"local")).filter(x=>x.name && !isNaN(x.carbs));
    return;
  }

  let migrated = [];
  for(const key of OLD_KEYS){
    const old = localStorage.getItem(key);
    if(old){
      try{
        migrated = JSON.parse(old).map((x,i)=>normalizeItem(x,i,"local")).filter(x=>x.name && !isNaN(x.carbs));
        break;
      }catch(e){}
    }
  }
  localItems = migrated;
  saveLocalItems();
}

async function loadCentralDatabase(force=false){
  const status = document.getElementById("syncStatus");

  if(!force){
    const cached = localStorage.getItem(LS_CENTRAL_CACHE);
    if(cached){
      try{
        const data = JSON.parse(cached);
        centralItems = (data.items || data.recipes || data).map((x,i)=>normalizeItem(x,i,"central")).filter(x=>x.name && !isNaN(x.carbs));
        mergeItems();
        status.textContent = `Base centrale chargée (${centralItems.length} éléments)`;
        return;
      }catch(e){}
    }
  }

  try{
    status.textContent = "Mise à jour de la base centrale...";
    const res = await fetch(`${CENTRAL_DB_URL}?v=${Date.now()}`, {cache:"no-store"});
    if(!res.ok) throw new Error("database.json introuvable");
    const data = await res.json();
    centralItems = (data.items || data.recipes || data).map((x,i)=>normalizeItem(x,i,"central")).filter(x=>x.name && !isNaN(x.carbs));
    localStorage.setItem(LS_CENTRAL_CACHE, JSON.stringify({items:centralItems, updatedAt:new Date().toISOString()}));
    mergeItems();
    status.textContent = `Base centrale à jour (${centralItems.length} éléments)`;
  }catch(e){
    const cached = localStorage.getItem(LS_CENTRAL_CACHE);
    if(cached){
      const data = JSON.parse(cached);
      centralItems = (data.items || data.recipes || data).map((x,i)=>normalizeItem(x,i,"central")).filter(x=>x.name && !isNaN(x.carbs));
      status.textContent = `Mode hors ligne — base locale (${centralItems.length} éléments)`;
    }else{
      centralItems = FALLBACK_ITEMS;
      status.textContent = "Base minimale chargée";
    }
    mergeItems();
  }
}


function loadFavoritesAndRecents(){
  try{ favoriteIds = JSON.parse(localStorage.getItem(LS_FAVORITES) || "[]"); }catch(e){ favoriteIds = []; }
  try{ recentIds = JSON.parse(localStorage.getItem(LS_RECENTS) || "[]"); }catch(e){ recentIds = []; }
}

function saveFavorites(){
  favoriteIds = favoriteIds.filter((id, index, arr) => arr.indexOf(id) === index);
  localStorage.setItem(LS_FAVORITES, JSON.stringify(favoriteIds));
}

function saveRecents(){
  recentIds = recentIds.filter((id, index, arr) => arr.indexOf(id) === index).slice(0,10);
  localStorage.setItem(LS_RECENTS, JSON.stringify(recentIds));
}

function isFavorite(id){
  return favoriteIds.includes(id);
}

function itemById(id){
  return items.find(x => x.id === id);
}

function toggleFavorite(id){
  if(!id) return;
  if(isFavorite(id)){
    favoriteIds = favoriteIds.filter(x => x !== id);
  }else{
    favoriteIds.unshift(id);
  }
  saveFavorites();
  updatePreview();
  renderQuickAccess();
  renderRecipes();
}

function addRecent(id){
  if(!id) return;
  recentIds = [id, ...recentIds.filter(x => x !== id)].slice(0,10);
  saveRecents();
  renderQuickAccess();
}

function priorityScore(item, q){
  const name = item.name.toLowerCase();
  let score = 0;
  if(name === q) score += 1000;
  if(name.startsWith(q)) score += 500;
  if(name.includes(q)) score += 100;
  if(isFavorite(item.id)) score += 80;
  if(recentIds.includes(item.id)) score += 40;
  if(item.category === "Recette") score += 5;
  return score;
}

function renderQuickAccess(){
  // Favoris visibles uniquement dans le filtre Favoris du registre.
}

function photoOrPlaceholder(r){
  const emoji = r.category === "Aliment" ? "🍎" : "🍽️";
  return r.photo || `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="180" height="120"><rect width="100%" height="100%" rx="14" fill="#ffe8ef"/><text x="50%" y="55%" text-anchor="middle" font-size="46">${emoji}</text></svg>`)}`;
}

function selectedItem(){
  return items.find(r=>r.id===selectedItemId) || null;
}

function selectItem(id){
  const r = items.find(x=>x.id===id);
  if(!r) return;
  selectedItemId = r.id;
  document.getElementById("itemSearch").value = r.name;
  hideSuggestions();
  updatePreview();
  calculate();
  addRecent(id);
}

function calculate(){
  const r = selectedItem();
  const weight = parseFloat(document.getElementById("portionWeight").value) || 0;
  const carbs = r ? Math.floor((weight * Number(r.carbs)) / 100) : 0;
  document.getElementById("carbResult").textContent = `${carbs} g`;
}

function updatePreview(){
  const r = selectedItem();
  const box = document.getElementById("recipePreview");
  if(!r){ box.classList.add("hidden"); return; }
  document.getElementById("previewImg").src = photoOrPlaceholder(r);
  document.getElementById("previewName").textContent = r.name;
  document.getElementById("previewCarbs").textContent = `${String(r.carbs).replace(".", ",")} g de glucides nets / 100 g`;
  document.getElementById("previewCategory").textContent = r.category;
  document.getElementById("previewSource").textContent = r.source === "central" ? "Base centrale" : "Familial";
  const favBtn = document.getElementById("favoriteToggle");
  favBtn.textContent = isFavorite(r.id) ? "★ Favori" : "☆ Ajouter aux favoris";
  favBtn.classList.toggle("active", isFavorite(r.id));
  box.classList.remove("hidden");
}

function renderSuggestions(){
  const input = document.getElementById("itemSearch");
  const box = document.getElementById("suggestions");
  const q = input.value.trim().toLowerCase();

  if(!q){
    box.classList.add("hidden");
    box.innerHTML = "";
    selectedItemId = "";
    updatePreview();
    calculate();
    return;
  }

  const matches = sortedItems()
    .filter(r => r.name.toLowerCase().includes(q))
    .sort((a,b) => priorityScore(b,q) - priorityScore(a,q) || a.name.localeCompare(b.name,"fr",{sensitivity:"base"}))
    .slice(0,3);

  if(matches.length === 0){
    box.innerHTML = `<button class="suggestion" type="button"><div><strong>Aucun résultat</strong><small>Essaie un autre mot.</small></div></button>`;
    box.classList.remove("hidden");
    selectedItemId = "";
    updatePreview();
    calculate();
    return;
  }

  box.innerHTML = matches.map(r => `
    <button class="suggestion" type="button" data-id="${r.id}">
      <img src="${photoOrPlaceholder(r)}" alt="">
      <div>
        <strong>${r.name}</strong>
        <small>${r.category} · ${String(r.carbs).replace(".", ",")} g / 100 g ${isFavorite(r.id) ? '<span class="badge">⭐</span>' : ''}${recentIds.includes(r.id) ? '<span class="badge">🕒</span>' : ''}</small>
      </div>
    </button>
  `).join("");
  box.classList.remove("hidden");
}

function hideSuggestions(){
  document.getElementById("suggestions").classList.add("hidden");
}


function firstLetterNormalized(text){
  const normalized = (text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
  const first = normalized.charAt(0);
  return /^[A-Z]$/.test(first) ? first : "#";
}

function renderRecipes(){
  const q = document.getElementById("searchRecipe").value.toLowerCase();
  const list = document.getElementById("recipeList");
  list.innerHTML = "";

  const filtered = sortedItems().filter(r => {
    const matchesSearch = r.name.toLowerCase().includes(q);
    const matchesFilter = currentFilter === "Tous" || r.category === currentFilter || (currentFilter === "Favoris" && isFavorite(r.id));
    const matchesLetter = currentLetterFilter === "Tous" || firstLetterNormalized(r.name) === currentLetterFilter;
    return matchesSearch && matchesFilter && matchesLetter;
  });

  if(filtered.length === 0){
    list.innerHTML = `<div class="notice">Aucun élément trouvé.</div>`;
    return;
  }

  filtered.slice(0,300).forEach(r=>{
    const item = document.createElement("div");
    item.className = "recipe-item";
    const canEdit = isAdmin() && r.source !== "central";
    item.innerHTML = `
      <img src="${photoOrPlaceholder(r)}" alt="">
      <div class="info">
        <strong>${r.name}</strong>
        <small>${r.category} · ${String(r.carbs).replace(".", ",")} g / 100 g · ${r.source === "central" ? "Base centrale" : "Familial"}</small>
      </div>
      <div class="actions">
        <button data-fav="${r.id}" title="Favori">${isFavorite(r.id) ? "★" : "☆"}</button>
        ${canEdit?`<button data-edit="${r.id}" title="Modifier">✏️</button><button data-delete="${r.id}" title="Supprimer">🗑️</button>`:""}
      </div>
    `;
    list.appendChild(item);
  });

  if(filtered.length > 300){
    const more = document.createElement("div");
    more.className = "notice";
    more.textContent = `${filtered.length - 300} autres résultats masqués. Utilise la recherche pour préciser.`;
    list.appendChild(more);
  }
}

function setTab(tab){
  document.querySelectorAll(".screen").forEach(s=>s.classList.remove("active"));
  document.querySelectorAll(".tabs button").forEach(b=>b.classList.remove("active"));
  document.getElementById(`screen-${tab}`).classList.add("active");
  document.querySelector(`[data-tab="${tab}"]`).classList.add("active");
  if(tab==="recipes") renderRecipes();
  if(tab==="admin") renderAdmin();
}

function renderAdmin(){
  const unlocked = isAdmin();
  document.getElementById("lockedPanel").classList.toggle("hidden", unlocked);
  document.getElementById("adminPanel").classList.toggle("hidden", !unlocked);
  document.getElementById("adminStatus").textContent = unlocked ? "Mode administrateur déverrouillé" : "Mode protégé";
}

function clearForm(){
  document.getElementById("recipeId").value="";
  document.getElementById("recipeCategory").value="Aliment";
  document.getElementById("recipeName").value="";
  document.getElementById("recipeCarbs").value="";
  document.getElementById("recipePhoto").value="";
  document.getElementById("photoPreview").classList.add("hidden");
  currentPhotoData="";
  document.getElementById("cancelEditBtn").classList.add("hidden");
}

function editItem(id){
  const r = localItems.find(x=>x.id===id);
  if(!r || !isAdmin()) return;
  setTab("admin");
  document.getElementById("recipeId").value = r.id;
  document.getElementById("recipeCategory").value = r.category || "Recette";
  document.getElementById("recipeName").value = r.name;
  document.getElementById("recipeCarbs").value = r.carbs;
  currentPhotoData = r.photo || "";
  if(currentPhotoData){
    document.getElementById("photoPreview").src = currentPhotoData;
    document.getElementById("photoPreview").classList.remove("hidden");
  } else {
    document.getElementById("photoPreview").classList.add("hidden");
  }
  document.getElementById("cancelEditBtn").classList.remove("hidden");
}

function deleteItem(id){
  if(!isAdmin()) return;
  const r = localItems.find(x=>x.id===id);
  if(!r) return;
  if(!confirm(`Supprimer cet élément familial ?\n\n${r.name}`)) return;
  const typed = prompt(`Cette action est irréversible.\n\nPour confirmer, tape exactement : SUPPRIMER`);
  if(typed !== "SUPPRIMER"){ alert("Suppression annulée."); return; }
  localItems = localItems.filter(x=>x.id!==id);
  if(selectedItemId === id){
    selectedItemId = "";
    document.getElementById("itemSearch").value = "";
  }
  saveLocalItems();
  renderRecipes();
  updatePreview();
  calculate();
  alert("Élément supprimé.");
}

function exportLocalItems(){
  const data = {app:"Calcul glucides DT1", version:"local-family-1.0", exportedAt:new Date().toISOString(), items:localItems};
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `elements-familiaux-dt1-${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

function importLocalItemsFile(file){
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const data = JSON.parse(reader.result);
      const imported = data.items || data.recipes || data;
      if(!Array.isArray(imported)) throw new Error("Format invalide");
      const clean = imported.map((x,i)=>normalizeItem(x,i,"local")).filter(r=>r.name && !isNaN(r.carbs));
      if(clean.length === 0) throw new Error("Aucun élément valide");
      if(!confirm(`Importer ${clean.length} élément(s) familial(aux) ?`)) return;
      localItems = clean;
      saveLocalItems();
      renderRecipes();
      alert("Importation terminée.");
    }catch(e){
      alert("Impossible d'importer ce fichier JSON.");
    }
  };
  reader.readAsText(file);
}

async function refreshAll(force=false){
  loadLocalItems();
  await loadCentralDatabase(force);
  mergeItems();
  renderRecipes();
  renderQuickAccess();
  renderSuggestions();
  if(selectedItemId){
    updatePreview();
    calculate();
  } else {
    document.getElementById("itemSearch").value = "";
    updatePreview();
    calculate();
  }
}

document.addEventListener("DOMContentLoaded", async ()=>{
  loadFavoritesAndRecents();
  await refreshAll(false);
  renderQuickAccess();
  renderAdmin();

  document.getElementById("itemSearch").addEventListener("input", renderSuggestions);
  document.getElementById("itemSearch").addEventListener("focus", renderSuggestions);
  document.getElementById("portionWeight").addEventListener("input", calculate);
  document.getElementById("searchRecipe").addEventListener("input", renderRecipes);

  document.getElementById("letterFilter").addEventListener("change", e=>{
    currentLetterFilter = e.target.value;
    renderRecipes();
  });

  document.getElementById("suggestions").addEventListener("click", e=>{
    const btn = e.target.closest("[data-id]");
    if(btn) selectItem(btn.dataset.id);
  });

  document.getElementById("favoriteToggle").addEventListener("click",()=>{
    const r = selectedItem();
    if(r) toggleFavorite(r.id);
  });

  document.addEventListener("click", e=>{
    if(!e.target.closest(".search-block")) hideSuggestions();
  });

  document.querySelectorAll(".tabs button").forEach(b=>b.addEventListener("click",()=>setTab(b.dataset.tab)));

  document.getElementById("floatingAdminBtn").addEventListener("click",()=>{
    setTab("admin");
  });

  document.querySelectorAll(".filter").forEach(btn=>{
    btn.addEventListener("click",()=>{
      document.querySelectorAll(".filter").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      currentFilter = btn.dataset.filter;
      renderRecipes();
    });
  });

  document.getElementById("unlockBtn").addEventListener("click",()=>{
    if(document.getElementById("adminPin").value === getPin()){
      sessionStorage.setItem(LS_ADMIN,"1");
      document.getElementById("adminPin").value="";
      renderAdmin();
      renderRecipes();
    }else alert("Code incorrect.");
  });

  document.getElementById("lockBtn").addEventListener("click",()=>{
    sessionStorage.removeItem(LS_ADMIN);
    renderAdmin();
    renderRecipes();
  });

  document.getElementById("forceSyncBtn").addEventListener("click",async ()=>{
    await loadCentralDatabase(true);
    mergeItems();
    renderRecipes();
    renderSuggestions();
    alert("Base centrale rechargée.");
  });

  document.getElementById("changePinBtn").addEventListener("click",()=>{
    const p = document.getElementById("newPin").value.trim();
    if(p.length < 4){ alert("Choisis un code d'au moins 4 caractères."); return; }
    localStorage.setItem(LS_PIN,p);
    document.getElementById("newPin").value="";
    alert("Code modifié.");
  });

  document.getElementById("recipePhoto").addEventListener("change", e=>{
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      currentPhotoData = reader.result;
      document.getElementById("photoPreview").src = currentPhotoData;
      document.getElementById("photoPreview").classList.remove("hidden");
    };
    reader.readAsDataURL(file);
  });

  document.getElementById("saveRecipeBtn").addEventListener("click",()=>{
    if(!isAdmin()) return;
    const id = document.getElementById("recipeId").value || `local_${Date.now()}`;
    const category = document.getElementById("recipeCategory").value;
    const name = document.getElementById("recipeName").value.trim();
    const carbs = parseFloat(document.getElementById("recipeCarbs").value);
    if(!name || isNaN(carbs)){ alert("Entre un nom et une valeur de glucides valide."); return; }

    const existing = localItems.find(r=>r.id===id);
    if(existing){
      existing.name = name;
      existing.carbs = carbs;
      existing.category = category;
      existing.photo = currentPhotoData;
      existing.source = "local";
    }else{
      localItems.push({id,name,carbs,category,photo:currentPhotoData,source:"local"});
    }

    saveLocalItems();
    clearForm();
    renderRecipes();
    selectItem(id);
    alert("Élément familial enregistré.");
  });

  document.getElementById("cancelEditBtn").addEventListener("click", clearForm);
  document.getElementById("exportBtn").addEventListener("click", exportLocalItems);
  document.getElementById("importFile").addEventListener("change", e=>{
    const file = e.target.files[0];
    if(file) importLocalItemsFile(file);
    e.target.value = "";
  });

  document.getElementById("recipeList").addEventListener("click", e=>{
    if(e.target.dataset.fav) toggleFavorite(e.target.dataset.fav);
    if(e.target.dataset.edit) editItem(e.target.dataset.edit);
    if(e.target.dataset.delete) deleteItem(e.target.dataset.delete);
  });

  if("serviceWorker" in navigator){
    navigator.serviceWorker.register("sw.js").catch(()=>{});
  }

  if(navigator.storage && navigator.storage.persist){
    navigator.storage.persist().catch(()=>{});
  }
});
