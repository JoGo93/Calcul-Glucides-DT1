const DEFAULT_ITEMS = [
  {id:"pate", name:"Pâté chinois aux patates douces", carbs:7.8, category:"Recette", photo:""},
  {id:"macaroni", name:"Salade de macaronis", carbs:21, category:"Recette", photo:""},
  {id:"alfredo", name:"Poulet brocoli sauce Alfredo", carbs:3, category:"Recette", photo:""},
  {id:"crepe", name:"Crêpe cottage", carbs:7, category:"Recette", photo:""},
  {id:"banane-pain", name:"Pain aux bananes protéiné", carbs:11, category:"Recette", photo:""},
  {id:"pudding", name:"Pudding santé", carbs:9, category:"Recette", photo:""},
  {id:"fraise", name:"Fraises", carbs:5.7, category:"Aliment", photo:""},
  {id:"bleuet", name:"Bleuets", carbs:12.1, category:"Aliment", photo:""},
  {id:"banane", name:"Banane", carbs:20.2, category:"Aliment", photo:""},
  {id:"brocoli", name:"Brocoli cuit", carbs:4, category:"Aliment", photo:""}
];

const LS_RECIPES = "dt1_items_v4_categories";
const LS_PIN = "dt1_admin_pin";
const LS_ADMIN = "dt1_admin_unlocked";

let items = [];
let currentPhotoData = "";
let currentFilter = "Tous";

function normalizeItem(r, idx=0){
  return {
    id: r.id || `item_${Date.now()}_${idx}`,
    name: String(r.name || r.nom || "").trim(),
    carbs: Number(r.carbs ?? r.glucides ?? r.glucidesNets100g),
    category: (r.category === "Aliment" || r.category === "Recette") ? r.category : "Recette",
    photo: r.photo || ""
  };
}

function loadItems(){
  const saved = localStorage.getItem(LS_RECIPES);
  items = saved ? JSON.parse(saved).map(normalizeItem).filter(x=>x.name && !isNaN(x.carbs)) : DEFAULT_ITEMS;
  saveItems();
}

function saveItems(){ localStorage.setItem(LS_RECIPES, JSON.stringify(items)); }
function getPin(){ return localStorage.getItem(LS_PIN) || "1234"; }
function isAdmin(){ return sessionStorage.getItem(LS_ADMIN) === "1"; }
function sortedItems(list=items){ return [...list].sort((a,b)=>a.name.localeCompare(b.name,"fr",{sensitivity:"base"})); }

function photoOrPlaceholder(r){
  const emoji = r.category === "Aliment" ? "🍎" : "🍽️";
  return r.photo || `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="180" height="120"><rect width="100%" height="100%" rx="14" fill="#ffe8ef"/><text x="50%" y="55%" text-anchor="middle" font-size="46">${emoji}</text></svg>`)}`;
}

function renderSelect(){
  const select = document.getElementById("recipeSelect");
  select.innerHTML = "";
  for(const r of sortedItems()){
    const opt = document.createElement("option");
    opt.value = r.id;
    opt.textContent = `${r.name} · ${r.category}`;
    select.appendChild(opt);
  }
  updatePreview();
  calculate();
}

function selectedItem(){
  const id = document.getElementById("recipeSelect").value;
  return items.find(r=>r.id===id) || sortedItems()[0];
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
  box.classList.remove("hidden");
}

function renderRecipes(){
  const q = document.getElementById("searchRecipe").value.toLowerCase();
  const list = document.getElementById("recipeList");
  list.innerHTML = "";

  const filtered = sortedItems().filter(r => {
    const matchesSearch = r.name.toLowerCase().includes(q);
    const matchesFilter = currentFilter === "Tous" || r.category === currentFilter;
    return matchesSearch && matchesFilter;
  });

  if(filtered.length === 0){
    list.innerHTML = `<div class="notice">Aucun élément trouvé.</div>`;
    return;
  }

  filtered.forEach(r=>{
    const item = document.createElement("div");
    item.className = "recipe-item";
    item.innerHTML = `
      <img src="${photoOrPlaceholder(r)}" alt="">
      <div class="info">
        <strong>${r.name}</strong>
        <small>${r.category} · ${String(r.carbs).replace(".", ",")} g / 100 g</small>
      </div>
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
  const r = items.find(x=>x.id===id);
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
  const r = items.find(x=>x.id===id);
  if(!r) return;
  if(!confirm(`Supprimer cet élément ?\n\n${r.name}`)) return;
  const typed = prompt(`Cette action est irréversible.\n\nPour confirmer, tape exactement : SUPPRIMER`);
  if(typed !== "SUPPRIMER"){ alert("Suppression annulée."); return; }
  items = items.filter(x=>x.id!==id);
  saveItems();
  renderSelect();
  renderRecipes();
  alert("Élément supprimé.");
}

function exportItems(){
  const data = {app:"Calcul glucides DT1", version:"categories-1.0", exportedAt:new Date().toISOString(), items};
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `sauvegarde-glucides-dt1-${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

function importItemsFile(file){
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const data = JSON.parse(reader.result);
      const imported = data.items || data.recipes || data;
      if(!Array.isArray(imported)) throw new Error("Format invalide");
      const clean = imported.map(normalizeItem).filter(r=>r.name && !isNaN(r.carbs));
      if(clean.length === 0) throw new Error("Aucun élément valide");
      if(!confirm(`Importer ${clean.length} élément(s) ?\n\nCela remplacera la banque actuelle sur cet appareil.`)) return;
      items = clean;
      saveItems();
      renderSelect();
      renderRecipes();
      alert("Importation terminée.");
    }catch(e){
      alert("Impossible d'importer ce fichier JSON.");
    }
  };
  reader.readAsText(file);
}

document.addEventListener("DOMContentLoaded", ()=>{
  loadItems();
  renderSelect();
  renderAdmin();

  document.getElementById("recipeSelect").addEventListener("change", ()=>{updatePreview(); calculate();});
  document.getElementById("portionWeight").addEventListener("input", calculate);
  document.getElementById("searchRecipe").addEventListener("input", renderRecipes);

  document.querySelectorAll(".tabs button").forEach(b=>b.addEventListener("click",()=>setTab(b.dataset.tab)));

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
    const id = document.getElementById("recipeId").value || `item_${Date.now()}`;
    const category = document.getElementById("recipeCategory").value;
    const name = document.getElementById("recipeName").value.trim();
    const carbs = parseFloat(document.getElementById("recipeCarbs").value);
    if(!name || isNaN(carbs)){ alert("Entre un nom et une valeur de glucides valide."); return; }
    const existing = items.find(r=>r.id===id);
    if(existing){
      existing.name = name;
      existing.carbs = carbs;
      existing.category = category;
      existing.photo = currentPhotoData;
    }else{
      items.push({id,name,carbs,category,photo:currentPhotoData});
    }
    saveItems();
    clearForm();
    renderSelect();
    renderRecipes();
    alert("Élément enregistré.");
  });

  document.getElementById("cancelEditBtn").addEventListener("click", clearForm);
  document.getElementById("exportBtn").addEventListener("click", exportItems);
  document.getElementById("importFile").addEventListener("change", e=>{
    const file = e.target.files[0];
    if(file) importItemsFile(file);
    e.target.value = "";
  });

  document.getElementById("recipeList").addEventListener("click", e=>{
    if(e.target.dataset.edit) editItem(e.target.dataset.edit);
    if(e.target.dataset.delete) deleteItem(e.target.dataset.delete);
  });

  if("serviceWorker" in navigator){
    navigator.serviceWorker.register("sw.js").catch(()=>{});
  }
});
