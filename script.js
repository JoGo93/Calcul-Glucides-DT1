const DEFAULT_RECIPES = [
  {id:"pate", name:"Pâté chinois aux patates douces", carbs:7.8, photo:""},
  {id:"macaroni", name:"Salade de macaronis", carbs:21, photo:""},
  {id:"alfredo", name:"Poulet brocoli sauce Alfredo", carbs:3, photo:""},
  {id:"crepe", name:"Crêpe cottage", carbs:7, photo:""},
  {id:"banane", name:"Pain aux bananes protéiné", carbs:11, photo:""},
  {id:"pudding", name:"Pudding santé", carbs:9, photo:""}
];

const LS_RECIPES = "dt1_recipes_v3_secure";
const LS_PIN = "dt1_admin_pin";
const LS_ADMIN = "dt1_admin_unlocked";

let recipes = [];
let currentPhotoData = "";

function loadRecipes(){
  const saved = localStorage.getItem(LS_RECIPES);
  recipes = saved ? JSON.parse(saved) : DEFAULT_RECIPES;
  saveRecipes();
}

function saveRecipes(){
  localStorage.setItem(LS_RECIPES, JSON.stringify(recipes));
}

function getPin(){
  return localStorage.getItem(LS_PIN) || "1234";
}

function isAdmin(){
  return sessionStorage.getItem(LS_ADMIN) === "1";
}

function photoOrPlaceholder(r){
  return r.photo || `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="180" height="120"><rect width="100%" height="100%" rx="14" fill="#ffe8ef"/><text x="50%" y="55%" text-anchor="middle" font-size="46">🍽️</text></svg>`)}`;
}

function renderSelect(){
  const select = document.getElementById("recipeSelect");
  select.innerHTML = "";
  recipes.sort((a,b)=>a.name.localeCompare(b.name,"fr"));
  for(const r of recipes){
    const opt = document.createElement("option");
    opt.value = r.id;
    opt.textContent = r.name;
    select.appendChild(opt);
  }
  updatePreview();
  calculate();
}

function selectedRecipe(){
  const id = document.getElementById("recipeSelect").value;
  return recipes.find(r=>r.id===id) || recipes[0];
}

function calculate(){
  const r = selectedRecipe();
  const weight = parseFloat(document.getElementById("portionWeight").value) || 0;
  const carbs = r ? Math.floor((weight * Number(r.carbs)) / 100) : 0;
  document.getElementById("carbResult").textContent = `${carbs} g`;
}

function updatePreview(){
  const r = selectedRecipe();
  const box = document.getElementById("recipePreview");
  if(!r){ box.classList.add("hidden"); return; }
  document.getElementById("previewImg").src = photoOrPlaceholder(r);
  document.getElementById("previewName").textContent = r.name;
  document.getElementById("previewCarbs").textContent = `${String(r.carbs).replace(".", ",")} g de glucides nets / 100 g`;
  box.classList.remove("hidden");
}

function renderRecipes(){
  const q = document.getElementById("searchRecipe").value.toLowerCase();
  const list = document.getElementById("recipeList");
  list.innerHTML = "";
  recipes
    .filter(r=>r.name.toLowerCase().includes(q))
    .sort((a,b)=>a.name.localeCompare(b.name,"fr"))
    .forEach(r=>{
      const item = document.createElement("div");
      item.className = "recipe-item";
      item.innerHTML = `
        <img src="${photoOrPlaceholder(r)}" alt="">
        <div class="info"><strong>${r.name}</strong><small>${String(r.carbs).replace(".", ",")} g / 100 g</small></div>
        <div class="actions">${isAdmin()?`<button data-edit="${r.id}" title="Modifier">✏️</button><button data-delete="${r.id}" title="Supprimer">🗑️</button>`:""}</div>
      `;
      list.appendChild(item);
    });
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
  renderRecipes();
}

function clearForm(){
  document.getElementById("recipeId").value="";
  document.getElementById("recipeName").value="";
  document.getElementById("recipeCarbs").value="";
  document.getElementById("recipePhoto").value="";
  document.getElementById("photoPreview").classList.add("hidden");
  currentPhotoData="";
  document.getElementById("cancelEditBtn").classList.add("hidden");
}

function editRecipe(id){
  const r = recipes.find(x=>x.id===id);
  if(!r || !isAdmin()) return;
  setTab("admin");
  document.getElementById("recipeId").value = r.id;
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

function deleteRecipe(id){
  if(!isAdmin()) return;
  const r = recipes.find(x=>x.id===id);
  if(!r) return;
  const first = confirm(`Supprimer cette recette ?\n\n${r.name}`);
  if(!first) return;
  const typed = prompt(`Cette action est irréversible.\n\nPour confirmer, tape exactement : SUPPRIMER`);
  if(typed !== "SUPPRIMER") {
    alert("Suppression annulée.");
    return;
  }
  recipes = recipes.filter(x=>x.id!==id);
  saveRecipes();
  renderSelect();
  renderRecipes();
  alert("Recette supprimée.");
}

function exportRecipes(){
  const data = {
    app: "Calcul glucides DT1",
    version: "secure-1.0",
    exportedAt: new Date().toISOString(),
    recipes
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const date = new Date().toISOString().slice(0,10);
  a.href = url;
  a.download = `sauvegarde-recettes-dt1-${date}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function importRecipesFile(file){
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      const imported = Array.isArray(data) ? data : data.recipes;
      if(!Array.isArray(imported)) throw new Error("Format invalide");
      const clean = imported.map((r, idx) => ({
        id: r.id || `import_${Date.now()}_${idx}`,
        name: String(r.name || r.nom || "").trim(),
        carbs: Number(r.carbs ?? r.glucides ?? r.glucidesNets100g),
        photo: r.photo || ""
      })).filter(r => r.name && !isNaN(r.carbs));
      if(clean.length === 0) throw new Error("Aucune recette valide");
      const ok = confirm(`Importer ${clean.length} recette(s) ?\n\nCette action remplacera la banque actuelle sur cet appareil.`);
      if(!ok) return;
      recipes = clean;
      saveRecipes();
      renderSelect();
      renderRecipes();
      alert("Importation terminée.");
    } catch(e) {
      alert("Impossible d'importer ce fichier. Vérifie qu'il s'agit bien d'une sauvegarde JSON valide.");
    }
  };
  reader.readAsText(file);
}

document.addEventListener("DOMContentLoaded", ()=>{
  loadRecipes();
  renderSelect();
  renderAdmin();

  document.getElementById("recipeSelect").addEventListener("change", ()=>{updatePreview(); calculate();});
  document.getElementById("portionWeight").addEventListener("input", calculate);
  document.getElementById("searchRecipe").addEventListener("input", renderRecipes);

  document.querySelectorAll(".tabs button").forEach(b=>b.addEventListener("click",()=>setTab(b.dataset.tab)));

  document.getElementById("unlockBtn").addEventListener("click",()=>{
    if(document.getElementById("adminPin").value === getPin()){
      sessionStorage.setItem(LS_ADMIN,"1");
      document.getElementById("adminPin").value="";
      renderAdmin();
    }else alert("Code incorrect.");
  });

  document.getElementById("lockBtn").addEventListener("click",()=>{
    sessionStorage.removeItem(LS_ADMIN);
    renderAdmin();
  });

  document.getElementById("changePinBtn").addEventListener("click",()=>{
    const p = document.getElementById("newPin").value.trim();
    if(p.length < 4){ alert("Choisis un code d'au moins 4 chiffres/caractères."); return; }
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
    const id = document.getElementById("recipeId").value || `r_${Date.now()}`;
    const name = document.getElementById("recipeName").value.trim();
    const carbs = parseFloat(document.getElementById("recipeCarbs").value);
    if(!name || isNaN(carbs)){ alert("Entre un nom et une valeur de glucides valide."); return; }
    const existing = recipes.find(r=>r.id===id);
    if(existing){
      existing.name = name;
      existing.carbs = carbs;
      existing.photo = currentPhotoData;
    }else{
      recipes.push({id,name,carbs,photo:currentPhotoData});
    }
    saveRecipes();
    clearForm();
    renderSelect();
    renderRecipes();
    alert("Recette enregistrée.");
  });

  document.getElementById("cancelEditBtn").addEventListener("click", clearForm);
  document.getElementById("exportBtn").addEventListener("click", exportRecipes);
  document.getElementById("importFile").addEventListener("change", e=>{
    const file = e.target.files[0];
    if(file) importRecipesFile(file);
    e.target.value = "";
  });

  document.getElementById("recipeList").addEventListener("click", e=>{
    const edit = e.target.dataset.edit;
    const del = e.target.dataset.delete;
    if(edit) editRecipe(edit);
    if(del) deleteRecipe(del);
  });

  if("serviceWorker" in navigator){
    navigator.serviceWorker.register("sw.js").catch(()=>{});
  }
});
