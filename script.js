const APP_VERSION = "2.8.0";

const DEFAULT_ADMIN_PIN="112233";
const APP_VERSION="2.1.0";
const VERSION_URL="version.json";
const CENTRAL_DB_URL="database.json";
const FALLBACK_ITEMS=[{id:"banane",name:"Banane",category:"Aliment",carbs:20.2,photo:"",source:"central"}];
const LS_CENTRAL_CACHE="dt1_central_database_cache_v1";
const LS_LOCAL_ITEMS="dt1_local_family_items_v1";
const OLD_KEYS=["dt1_items_v5_search","dt1_items_v4_categories","dt1_recipes_v3_secure","dt1_recipes_v2"];
const LS_PIN="dt1_admin_pin"; const LS_ADMIN="dt1_admin_unlocked"; const LS_FAVORITES="dt1_favorite_item_ids_v1"; const LS_RECENTS="dt1_recent_item_ids_v1";
let centralItems=[], localItems=[], items=[], selectedItemId="", currentFilter="Tous", currentLetterFilter="Tous", favoriteIds=[], recentIds=[];
let currentRecipeIngredient=null, recipeIngredients=[], createdRecipePhotoData="", productPhotoData="", editingRecipeId="", currentDetailItemId="";
function normalizeItem(r,idx=0,source="local"){return{id:r.id||`${source}_${Date.now()}_${idx}`,name:String(r.name||r.nom||"").trim(),carbs:Number(r.carbs??r.glucides??r.glucidesNets100g),category:(r.category==="Aliment"||r.category==="Recette")?r.category:"Recette",photo:r.photo||"",source:r.source||source,ingredients:r.ingredients||[],totalCarbs:r.totalCarbs,finalWeight:r.finalWeight,label:r.label};}
function dedupeByNameAndCategory(list){const m=new Map(); for(const it of list){const k=`${it.name.toLowerCase()}|${it.category}`; m.set(k,it)} return [...m.values()];}
function mergeItems(){items=dedupeByNameAndCategory([...centralItems,...localItems]).filter(x=>x.name&&!isNaN(x.carbs));}
function sortedItems(list=items){return[...list].sort((a,b)=>a.name.localeCompare(b.name,"fr",{sensitivity:"base"}));}
function getPin(){return localStorage.getItem(LS_PIN)||DEFAULT_ADMIN_PIN} function isAdmin(){return sessionStorage.getItem(LS_ADMIN)==="1"}
function saveLocalItems(){localStorage.setItem(LS_LOCAL_ITEMS,JSON.stringify(localItems)); mergeItems();}
function loadLocalItems(){const saved=localStorage.getItem(LS_LOCAL_ITEMS); if(saved){localItems=JSON.parse(saved).map((x,i)=>normalizeItem(x,i,"local")).filter(x=>x.name&&!isNaN(x.carbs));return} let migrated=[]; for(const k of OLD_KEYS){const old=localStorage.getItem(k); if(old){try{migrated=JSON.parse(old).map((x,i)=>normalizeItem(x,i,"local")).filter(x=>x.name&&!isNaN(x.carbs));break}catch(e){}}} localItems=migrated; saveLocalItems();}
async function loadCentralDatabase(force=false){const status=document.getElementById("syncStatus"); if(!force){const cached=localStorage.getItem(LS_CENTRAL_CACHE); if(cached){try{const data=JSON.parse(cached); centralItems=(data.items||data.recipes||data).map((x,i)=>normalizeItem(x,i,"central")).filter(x=>x.name&&!isNaN(x.carbs)); mergeItems(); status.textContent=`Base centrale chargée (${centralItems.length} éléments)`; return}catch(e){}}} try{status.textContent="Mise à jour de la base centrale..."; const res=await fetch(`${CENTRAL_DB_URL}?v=${Date.now()}`,{cache:"no-store"}); if(!res.ok)throw new Error(); const data=await res.json(); centralItems=(data.items||data.recipes||data).map((x,i)=>normalizeItem(x,i,"central")).filter(x=>x.name&&!isNaN(x.carbs)); localStorage.setItem(LS_CENTRAL_CACHE,JSON.stringify({items:centralItems,updatedAt:new Date().toISOString()})); mergeItems(); status.textContent=`Base centrale à jour (${centralItems.length} éléments)`}catch(e){const cached=localStorage.getItem(LS_CENTRAL_CACHE); if(cached){const data=JSON.parse(cached); centralItems=(data.items||data.recipes||data).map((x,i)=>normalizeItem(x,i,"central")).filter(x=>x.name&&!isNaN(x.carbs)); status.textContent=`Mode hors ligne — base locale (${centralItems.length} éléments)`}else{centralItems=FALLBACK_ITEMS; status.textContent="Base minimale chargée"} mergeItems();}}
function normalizeSearchText(text){return(text||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/œ/g,"oe").replace(/[^a-z0-9\s]/g," ").replace(/\s+/g," ").trim()}
const SEARCH_SYNONYMS={"farine blanche":["farine","blanche","tout usage","ble","enrichie","all purpose flour"],"farine":["farine","ble","tout usage","blanche"],"sucre blanc":["sucre","granule","blanc"],"cassonade":["cassonade","sucre brun"],"beurre":["beurre","butter"],"lait":["lait","milk"],"oeuf":["oeuf","oeufs","egg"],"banane":["banane","banana"],"pomme":["pomme","apple"],"riz blanc":["riz","blanc"],"pates":["pates","pasta","spaghetti","macaroni"],"cheerios":["cheerios","cereales"]};
function expandSearchTerms(q){const base=normalizeSearchText(q), terms=base.split(" ").filter(Boolean); for(const key in SEARCH_SYNONYMS){if(base.includes(key)||key.includes(base)){terms.push(...SEARCH_SYNONYMS[key].map(normalizeSearchText).flatMap(x=>x.split(" ")))}} return[...new Set(terms.filter(Boolean))]}
function levenshtein(a,b){a=normalizeSearchText(a);b=normalizeSearchText(b); if(!a||!b)return Math.max(a.length,b.length); const dp=Array.from({length:a.length+1},()=>Array(b.length+1).fill(0)); for(let i=0;i<=a.length;i++)dp[i][0]=i; for(let j=0;j<=b.length;j++)dp[0][j]=j; for(let i=1;i<=a.length;i++){for(let j=1;j<=b.length;j++){dp[i][j]=Math.min(dp[i-1][j]+1,dp[i][j-1]+1,dp[i-1][j-1]+(a[i-1]===b[j-1]?0:1))}} return dp[a.length][b.length]}
function smartSearchScore(item,query){const q=normalizeSearchText(query), name=normalizeSearchText(item.name), terms=expandSearchTerms(query); let score=0; if(!q)return 0; if(name===q)score+=2000; if(name.startsWith(q))score+=1200; if(name.includes(q))score+=800; for(const t of terms){if(name.split(" ").includes(t))score+=260; else if(name.includes(t))score+=140; else if(name.split(" ").some(w=>levenshtein(w,t)<=1&&t.length>=4))score+=80} if(isFavorite(item.id))score+=180; if(recentIds.includes(item.id))score+=90; if(item.category==="Recette")score+=30; return score}
function loadFavoritesAndRecents(){try{favoriteIds=JSON.parse(localStorage.getItem(LS_FAVORITES)||"[]")}catch(e){favoriteIds=[]} try{recentIds=JSON.parse(localStorage.getItem(LS_RECENTS)||"[]")}catch(e){recentIds=[]}}
function saveFavorites(){favoriteIds=favoriteIds.filter((id,i,a)=>a.indexOf(id)===i); localStorage.setItem(LS_FAVORITES,JSON.stringify(favoriteIds))} function saveRecents(){recentIds=recentIds.filter((id,i,a)=>a.indexOf(id)===i).slice(0,10); localStorage.setItem(LS_RECENTS,JSON.stringify(recentIds))} function isFavorite(id){return favoriteIds.includes(id)} function itemById(id){return items.find(x=>x.id===id)}
function toggleFavorite(id){if(!id)return; favoriteIds=isFavorite(id)?favoriteIds.filter(x=>x!==id):[id,...favoriteIds]; saveFavorites(); updatePreview(); renderRecipes()}
function addRecent(id){if(!id)return; recentIds=[id,...recentIds.filter(x=>x!==id)].slice(0,10); saveRecents()}
function photoOrPlaceholder(r){const emoji=r.category==="Aliment"?"🍎":"🍽️"; return r.photo||`data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="180" height="120"><rect width="100%" height="100%" rx="14" fill="#ffe8ef"/><text x="50%" y="55%" text-anchor="middle" font-size="46">${emoji}</text></svg>`)}`}
function selectedItem(){return items.find(r=>r.id===selectedItemId)||null} function selectItem(id){const r=items.find(x=>x.id===id); if(!r)return; selectedItemId=r.id; document.getElementById("itemSearch").value=r.name; hideSuggestions(); updatePreview(); calculate(); addRecent(id)}
function calculate(){const r=selectedItem(), w=parseFloat(document.getElementById("portionWeight").value)||0, carbs=r?Math.floor((w*Number(r.carbs))/100):0; document.getElementById("carbResult").textContent=`${carbs} g`}
function updatePreview(){const r=selectedItem(), box=document.getElementById("recipePreview"); if(!r){box.classList.add("hidden");return} document.getElementById("previewImg").src=photoOrPlaceholder(r); document.getElementById("previewName").textContent=r.name; document.getElementById("previewCarbs").textContent=`${String(r.carbs).replace(".",",")} g de glucides nets / 100 g`; document.getElementById("previewCategory").textContent=r.category; document.getElementById("previewSource").textContent=r.source==="central"?"Base centrale":"Familial"; const fav=document.getElementById("favoriteToggle"); fav.textContent=isFavorite(r.id)?"★ Favori":"☆ Ajouter aux favoris"; fav.classList.toggle("active",isFavorite(r.id)); box.classList.remove("hidden")}
function renderSuggestions(){const input=document.getElementById("itemSearch"), box=document.getElementById("suggestions"), q=input.value.trim(); if(!q){box.classList.add("hidden");box.innerHTML="";selectedItemId="";updatePreview();calculate();return} const matches=sortedItems().filter(r=>smartSearchScore(r,q)>0).sort((a,b)=>smartSearchScore(b,q)-smartSearchScore(a,q)||a.name.localeCompare(b.name,"fr",{sensitivity:"base"})).slice(0,3); if(!matches.length){box.innerHTML=`<button class="suggestion" type="button"><div><strong>Aucun résultat</strong><small>Essaie un autre mot.</small></div></button>`;box.classList.remove("hidden");return} box.innerHTML=matches.map(r=>`<button class="suggestion" type="button" data-id="${r.id}"><img src="${photoOrPlaceholder(r)}" alt=""><div><strong>${r.name}</strong><small>${r.category} · ${String(r.carbs).replace(".",",")} g / 100 g ${isFavorite(r.id)?"⭐":""}${recentIds.includes(r.id)?" 🕒":""}</small></div></button>`).join(""); box.classList.remove("hidden")}
function hideSuggestions(){document.getElementById("suggestions").classList.add("hidden")}
function firstLetterNormalized(text){const n=(text||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toUpperCase(); const f=n.charAt(0); return /^[A-Z]$/.test(f)?f:"#"}
function renderRecipes(){const q=document.getElementById("searchRecipe").value.toLowerCase(), list=document.getElementById("recipeList"); list.innerHTML=""; const filtered=sortedItems().filter(r=>{const ms=r.name.toLowerCase().includes(q), mf=currentFilter==="Tous"||r.category===currentFilter||(currentFilter==="Favoris"&&isFavorite(r.id)), ml=currentLetterFilter==="Tous"||firstLetterNormalized(r.name)===currentLetterFilter; return ms&&mf&&ml}); if(!filtered.length){list.innerHTML=`<div class="notice">Aucun élément trouvé.</div>`;return} filtered.slice(0,300).forEach(r=>{const item=document.createElement("div");item.className="recipe-item";item.dataset.itemId=r.id; const canEdit=isAdmin()&&r.source!=="central"; item.innerHTML=`<img src="${photoOrPlaceholder(r)}" alt=""><div class="info"><strong>${r.name}</strong><small>${r.category} · ${String(r.carbs).replace(".",",")} g / 100 g · ${r.source==="central"?"Base centrale":"Familial"}</small></div><div class="actions"><button data-fav="${r.id}">${isFavorite(r.id)?"★":"☆"}</button>${canEdit?`<button data-edit="${r.id}">✏️</button><button data-delete="${r.id}">🗑️</button>`:""}</div>`; list.appendChild(item)}); if(filtered.length>300){const more=document.createElement("div");more.className="notice";more.textContent=`${filtered.length-300} autres résultats masqués. Utilise la recherche pour préciser.`;list.appendChild(more)}}
function setTab(tab){document.querySelectorAll(".screen").forEach(s=>s.classList.remove("active"));document.querySelectorAll(".tabs button").forEach(b=>b.classList.remove("active")); const screen=document.getElementById(`screen-${tab}`); if(screen)screen.classList.add("active"); const btn=document.querySelector(`[data-tab="${tab}"]`); if(btn)btn.classList.add("active"); if(tab==="recipes")renderRecipes(); if(tab==="admin")renderAdmin()}
function renderAdmin(){const u=isAdmin(); document.getElementById("lockedPanel").classList.toggle("hidden",u); document.getElementById("adminPanel").classList.toggle("hidden",!u); document.getElementById("adminStatus").textContent=u?"Mode administrateur déverrouillé":"Mode protégé"}
function unitToApproxGrams(qty,unit){const q=Number(qty)||0; return q*({g:1,ml:1,tasse:250,"demi-tasse":125,"c-soupe":15,"c-the":5}[unit]||1)} function unitLabel(unit){return {g:"g",ml:"ml",tasse:"tasse","demi-tasse":"1/2 tasse","c-soupe":"c. à soupe","c-the":"c. à thé"}[unit]||unit}
function readImageFileToDataUrl(file,cb){if(!file)return; const r=new FileReader(); r.onload=()=>cb(r.result); r.readAsDataURL(file)}
function renderIngredientSuggestions(){const input=document.getElementById("ingredientSearch"), box=document.getElementById("ingredientSuggestions"), q=input.value.trim(); if(!q){box.classList.add("hidden");box.innerHTML="";return} const matches=sortedItems().filter(r=>r.category==="Aliment"&&smartSearchScore(r,q)>0).sort((a,b)=>smartSearchScore(b,q)-smartSearchScore(a,q)||a.name.localeCompare(b.name,"fr",{sensitivity:"base"})).slice(0,3); box.innerHTML=matches.length?matches.map(r=>`<button class="suggestion" type="button" data-ing-id="${r.id}"><img src="${photoOrPlaceholder(r)}"><div><strong>${r.name}</strong><small>${String(r.carbs).replace(".",",")} g / 100 g</small></div></button>`).join(""):`<button class="suggestion"><div><strong>Aucun résultat</strong><small>Essaie un autre mot.</small></div></button>`; box.classList.remove("hidden")}
function selectRecipeIngredient(id){const it=items.find(x=>x.id===id); if(!it)return; currentRecipeIngredient=it; document.getElementById("ingredientSearch").value=it.name; document.getElementById("ingredientSuggestions").classList.add("hidden"); document.getElementById("selectedIngredientName").textContent=it.name; document.getElementById("selectedIngredientCarbs").textContent=`${String(it.carbs).replace(".",",")} g de glucides nets / 100 g`; document.getElementById("selectedIngredientBox").classList.remove("hidden")}
function addIngredientToRecipe(){if(!currentRecipeIngredient){alert("Choisis d’abord un ingrédient.");return} const qty=parseFloat(document.getElementById("ingredientQty").value), unit=document.getElementById("ingredientUnit").value; if(isNaN(qty)||qty<=0){alert("Entre une quantité valide.");return} const grams=unitToApproxGrams(qty,unit), carbs=Number(currentRecipeIngredient.carbs)*grams/100; recipeIngredients.push({id:currentRecipeIngredient.id,name:currentRecipeIngredient.name,carbsPer100:Number(currentRecipeIngredient.carbs),qty,unit,grams,carbs}); currentRecipeIngredient=null; document.getElementById("ingredientSearch").value=""; document.getElementById("ingredientQty").value=""; document.getElementById("selectedIngredientBox").classList.add("hidden"); renderRecipeBuilder()}
function renderRecipeBuilder(){const list=document.getElementById("ingredientList"); if(recipeIngredients.length===0)list.innerHTML=`<div class="notice mini">Aucun ingrédient ajouté.</div>`; else list.innerHTML=recipeIngredients.map((ing,idx)=>`<div class="ingredient-row"><div><strong>${ing.name}</strong><small>${ing.qty} ${unitLabel(ing.unit)} ≈ ${Math.round(ing.grams)} g · ${Number(ing.carbs).toFixed(1).replace(".",",")} g glucides</small></div><button data-remove-ing="${idx}">×</button></div>`).join(""); const total=recipeIngredients.reduce((s,i)=>s+Number(i.carbs||0),0), fw=parseFloat(document.getElementById("finalRecipeWeight").value)||0, p=fw>0?total/fw*100:0; document.getElementById("recipeTotalCarbs").textContent=`${total.toFixed(1).replace(".",",")} g`; document.getElementById("recipeCarbsPer100").textContent=`${p.toFixed(1).replace(".",",")} g`}
function clearRecipeBuilder(){recipeIngredients=[];currentRecipeIngredient=null;createdRecipePhotoData="";editingRecipeId="";["newRecipeName","finalRecipeWeight","ingredientSearch","ingredientQty"].forEach(id=>{const e=document.getElementById(id); if(e)e.value=""}); document.getElementById("selectedIngredientBox").classList.add("hidden"); document.getElementById("createdRecipePhoto").value=""; document.getElementById("createdRecipePhotoPreview").classList.add("hidden"); document.getElementById("saveCreatedRecipeBtn").textContent="Enregistrer dans le registre"; renderRecipeBuilder()}
function saveCreatedRecipe(){const name=document.getElementById("newRecipeName").value.trim(), fw=parseFloat(document.getElementById("finalRecipeWeight").value)||0, total=recipeIngredients.reduce((s,i)=>s+Number(i.carbs||0),0); if(!name){alert("Entre le nom de la recette.");return} if(!recipeIngredients.length){alert("Ajoute au moins un ingrédient.");return} if(fw<=0){alert("Entre le poids final de la recette complète en grammes.");return} const per100=total/fw*100; if(editingRecipeId){const ex=localItems.find(x=>x.id===editingRecipeId); if(ex){Object.assign(ex,{name,carbs:Math.round(per100*10)/10,category:"Recette",photo:createdRecipePhotoData||ex.photo||"",source:"local",ingredients:recipeIngredients,totalCarbs:Math.round(total*10)/10,finalWeight:fw}); saveLocalItems(); const id=ex.id; clearRecipeBuilder(); renderRecipes(); selectItem(id); setTab("calc"); alert("Recette modifiée."); return}} const id=`local_recipe_${Date.now()}`; localItems.push({id,name,carbs:Math.round(per100*10)/10,category:"Recette",photo:createdRecipePhotoData||"",source:"local",ingredients:recipeIngredients,totalCarbs:Math.round(total*10)/10,finalWeight:fw}); saveLocalItems(); clearRecipeBuilder(); renderRecipes(); selectItem(id); setTab("calc"); alert("Recette enregistrée dans le registre.")}
function switchCreateMode(mode){const r=mode==="recipe"; document.getElementById("recipeModePanel").classList.toggle("hidden",!r); document.getElementById("productModePanel").classList.toggle("hidden",r); document.getElementById("modeRecipeBtn").classList.toggle("active",r); document.getElementById("modeProductBtn").classList.toggle("active",!r)}
function renderProductCalc(){const c=parseFloat(document.getElementById("productCarbs").value)||0, f=parseFloat(document.getElementById("productFiber").value)||0, s=parseFloat(document.getElementById("productServing").value)||0, net=Math.max(0,c-f), p=s>0?net/s*100:0; document.getElementById("productNetCarbs").textContent=`${net.toFixed(1).replace(".",",")} g`; document.getElementById("productCarbsPer100").textContent=`${p.toFixed(1).replace(".",",")} g`}
function clearProductBuilder(){["productName","productCarbs","productFiber","productServing"].forEach(id=>document.getElementById(id).value=""); productPhotoData=""; document.getElementById("productPhoto").value=""; document.getElementById("productPhotoPreview").classList.add("hidden"); renderProductCalc()}
function saveProduct(){const name=document.getElementById("productName").value.trim(), c=parseFloat(document.getElementById("productCarbs").value)||0, f=parseFloat(document.getElementById("productFiber").value)||0, s=parseFloat(document.getElementById("productServing").value)||0; if(!name){alert("Entre le nom du produit.");return} if(s<=0){alert("Entre la portion indiquée en grammes.");return} const net=Math.max(0,c-f), per100=net/s*100, id=`local_product_${Date.now()}`; localItems.push({id,name,carbs:Math.round(per100*10)/10,category:"Aliment",photo:productPhotoData||"",source:"local",label:{carbs:c,fiber:f,serving:s,net}}); saveLocalItems(); clearProductBuilder(); renderRecipes(); selectItem(id); setTab("calc"); alert("Produit enregistré dans le registre.")}
function openDetail(id){const it=items.find(x=>x.id===id); if(!it)return; currentDetailItemId=id; document.getElementById("detailTitle").textContent=it.category==="Recette"?"Fiche recette":"Fiche aliment"; document.getElementById("detailName").textContent=it.name; document.getElementById("detailCategory").textContent=it.category; document.getElementById("detailSource").textContent=it.source==="central"?"Base centrale":"Familial"; document.getElementById("detailCarbsPer100").textContent=`${String(it.carbs).replace(".",",")} g`; const photo=document.getElementById("detailPhoto"); if(it.photo){photo.src=it.photo;photo.classList.remove("hidden")}else photo.classList.add("hidden"); const total=it.totalCarbs||(it.ingredients&&it.ingredients.length?it.ingredients.reduce((s,i)=>s+Number(i.carbs||0),0):null); document.getElementById("detailTotalCarbs").textContent=(total!==null&&!isNaN(total))?`${Number(total).toFixed(1).replace(".",",")} g`:"—"; const block=document.getElementById("detailIngredientsBlock"), list=document.getElementById("detailIngredientsList"); if(it.ingredients&&it.ingredients.length){list.innerHTML=it.ingredients.map(ing=>`<div class="detail-ingredient"><strong>${ing.name}</strong><small>${ing.qty||""} ${unitLabel(ing.unit||"g")} ≈ ${Math.round(ing.grams||0)} g · ${Number(ing.carbs||0).toFixed(1).replace(".",",")} g glucides</small></div>`).join(""); block.classList.remove("hidden")}else if(it.label){list.innerHTML=`<div class="detail-ingredient"><strong>Valeurs nutritives</strong><small>${it.label.carbs} g glucides - ${it.label.fiber} g fibres = ${it.label.net} g nets pour ${it.label.serving} g</small></div>`; block.classList.remove("hidden")}else{list.innerHTML="";block.classList.add("hidden")} document.getElementById("detailEditBtn").classList.toggle("hidden",!(it.source!=="central"&&it.category==="Recette"&&isAdmin())); setTab("detail")}
function editRecipeFromDetail(){const it=localItems.find(x=>x.id===currentDetailItemId); if(!it||it.category!=="Recette"){alert("Seules les recettes familiales peuvent être modifiées ici.");return} if(!isAdmin()){alert("Déverrouille les paramètres avec le code admin pour modifier une recette.");return} editingRecipeId=it.id; recipeIngredients=JSON.parse(JSON.stringify(it.ingredients||[])); createdRecipePhotoData=it.photo||""; document.getElementById("newRecipeName").value=it.name; document.getElementById("finalRecipeWeight").value=it.finalWeight||""; if(createdRecipePhotoData){document.getElementById("createdRecipePhotoPreview").src=createdRecipePhotoData;document.getElementById("createdRecipePhotoPreview").classList.remove("hidden")} document.getElementById("saveCreatedRecipeBtn").textContent="Enregistrer les modifications"; switchCreateMode("recipe"); renderRecipeBuilder(); setTab("create")}
function exportLocalItems(){const data={app:"Calcul glucides DT1",version:"local-family-2.1",exportedAt:new Date().toISOString(),items:localItems}; const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"}); const url=URL.createObjectURL(blob), a=document.createElement("a"); a.href=url; a.download=`elements-familiaux-dt1-${new Date().toISOString().slice(0,10)}.json`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)}
function importLocalItemsFile(file){const reader=new FileReader(); reader.onload=()=>{try{const data=JSON.parse(reader.result), arr=data.items||data.recipes||data; if(!Array.isArray(arr))throw new Error(); const clean=arr.map((x,i)=>normalizeItem(x,i,"local")).filter(r=>r.name&&!isNaN(r.carbs)); if(!confirm(`Importer ${clean.length} élément(s) familial(aux) ?`))return; localItems=clean; saveLocalItems(); renderRecipes(); alert("Importation terminée.")}catch(e){alert("Impossible d'importer ce fichier JSON.")}}; reader.readAsText(file)}
async function checkForAppUpdate(show=false){const status=document.getElementById("updateStatusText"); try{const res=await fetch(`${VERSION_URL}?v=${Date.now()}`,{cache:"no-store"}); if(!res.ok)throw new Error(); const data=await res.json(); if(data.version&&data.version!==APP_VERSION){status.textContent=`Nouvelle version disponible : ${data.version}`; document.getElementById("updateNowBtn").classList.remove("hidden"); if(show)alert(`Nouvelle version disponible : ${data.version}`); return true} status.textContent="L’application est à jour."; document.getElementById("updateNowBtn").classList.add("hidden"); if(show)alert("L’application est déjà à jour."); return false}catch(e){status.textContent="Impossible de vérifier les mises à jour."; if(show)alert("Impossible de vérifier les mises à jour pour le moment."); return false}}
function backupLocalDataBeforeUpdate(){const backup={}; for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i); backup[k]=localStorage.getItem(k)} sessionStorage.setItem("dt1_pre_update_backup",JSON.stringify(backup))} function restoreLocalDataAfterUpdate(){try{const raw=sessionStorage.getItem("dt1_pre_update_backup"); if(!raw)return; const backup=JSON.parse(raw); Object.keys(backup).forEach(k=>{if(localStorage.getItem(k)===null)localStorage.setItem(k,backup[k])}); sessionStorage.removeItem("dt1_pre_update_backup")}catch(e){}}
async function applyAppUpdate(){backupLocalDataBeforeUpdate(); try{if("serviceWorker" in navigator){const reg=await navigator.serviceWorker.getRegistration(); if(reg)await reg.update()} if("caches" in window){const keys=await caches.keys(); await Promise.all(keys.map(k=>caches.delete(k)))}}catch(e){} window.location.reload()}
async function refreshAll(force=false){loadLocalItems(); await loadCentralDatabase(force); mergeItems(); renderRecipes(); renderSuggestions(); if(selectedItemId){updatePreview();calculate()}else{document.getElementById("itemSearch").value=""; updatePreview(); calculate()}}
document.addEventListener("DOMContentLoaded",async()=>{restoreLocalDataAfterUpdate(); loadFavoritesAndRecents(); await refreshAll(false); renderAdmin(); renderRecipeBuilder(); renderProductCalc(); document.getElementById("itemSearch").addEventListener("input",renderSuggestions); document.getElementById("itemSearch").addEventListener("focus",renderSuggestions); document.getElementById("portionWeight").addEventListener("input",calculate); document.getElementById("searchRecipe").addEventListener("input",renderRecipes); document.getElementById("letterFilter").addEventListener("change",e=>{currentLetterFilter=e.target.value;renderRecipes()}); document.getElementById("suggestions").addEventListener("click",e=>{const b=e.target.closest("[data-id]"); if(b)selectItem(b.dataset.id)}); document.addEventListener("click",e=>{if(!e.target.closest(".search-block"))hideSuggestions(); if(!e.target.closest(".ingredient-search-block"))document.getElementById("ingredientSuggestions").classList.add("hidden")}); document.querySelectorAll(".tabs button").forEach(b=>b.addEventListener("click",()=>setTab(b.dataset.tab))); document.getElementById("helpTopBtn").addEventListener("click",()=>setTab("help")); document.getElementById("adminTopBtn").addEventListener("click",()=>setTab("admin")); document.querySelectorAll(".filter").forEach(btn=>btn.addEventListener("click",()=>{document.querySelectorAll(".filter").forEach(b=>b.classList.remove("active")); btn.classList.add("active"); currentFilter=btn.dataset.filter; renderRecipes()})); document.getElementById("favoriteToggle").addEventListener("click",()=>{const r=selectedItem(); if(r)toggleFavorite(r.id)}); document.getElementById("unlockBtn").addEventListener("click",()=>{if(document.getElementById("adminPin").value===getPin()){sessionStorage.setItem(LS_ADMIN,"1");document.getElementById("adminPin").value="";renderAdmin();renderRecipes()}else alert("Code incorrect.")}); document.getElementById("lockBtn").addEventListener("click",()=>{sessionStorage.removeItem(LS_ADMIN);renderAdmin();renderRecipes()}); document.getElementById("forceSyncBtn").addEventListener("click",async()=>{await loadCentralDatabase(true);mergeItems();renderRecipes();alert("Base centrale rechargée.")}); document.getElementById("changePinBtn").addEventListener("click",()=>{const p=document.getElementById("newPin").value.trim(); if(p.length<4){alert("Choisis un code d'au moins 4 caractères.");return} localStorage.setItem(LS_PIN,p); document.getElementById("newPin").value=""; alert("Code modifié.")}); document.getElementById("exportBtn").addEventListener("click",exportLocalItems); document.getElementById("importFile").addEventListener("change",e=>{const f=e.target.files[0]; if(f)importLocalItemsFile(f); e.target.value=""}); document.getElementById("recipeList").addEventListener("click",e=>{if(e.target.dataset.fav){toggleFavorite(e.target.dataset.fav);return} if(e.target.dataset.delete){return} const row=e.target.closest(".recipe-item"); if(row&&row.dataset.itemId)openDetail(row.dataset.itemId)}); document.getElementById("ingredientSearch").addEventListener("input",renderIngredientSuggestions); document.getElementById("ingredientSearch").addEventListener("focus",renderIngredientSuggestions); document.getElementById("ingredientSuggestions").addEventListener("click",e=>{const b=e.target.closest("[data-ing-id]"); if(b)selectRecipeIngredient(b.dataset.ingId)}); document.getElementById("addIngredientBtn").addEventListener("click",addIngredientToRecipe); document.getElementById("finalRecipeWeight").addEventListener("input",renderRecipeBuilder); document.getElementById("ingredientList").addEventListener("click",e=>{if(e.target.dataset.removeIng!==undefined){recipeIngredients.splice(Number(e.target.dataset.removeIng),1);renderRecipeBuilder()}}); document.getElementById("saveCreatedRecipeBtn").addEventListener("click",saveCreatedRecipe); document.getElementById("clearCreatedRecipeBtn").addEventListener("click",clearRecipeBuilder); document.getElementById("createdRecipePhoto").addEventListener("change",e=>readImageFileToDataUrl(e.target.files[0],d=>{createdRecipePhotoData=d;document.getElementById("createdRecipePhotoPreview").src=d;document.getElementById("createdRecipePhotoPreview").classList.remove("hidden")})); document.getElementById("modeRecipeBtn").addEventListener("click",()=>switchCreateMode("recipe")); document.getElementById("modeProductBtn").addEventListener("click",()=>switchCreateMode("product")); ["productCarbs","productFiber","productServing"].forEach(id=>document.getElementById(id).addEventListener("input",renderProductCalc)); document.getElementById("productPhoto").addEventListener("change",e=>readImageFileToDataUrl(e.target.files[0],d=>{productPhotoData=d;document.getElementById("productPhotoPreview").src=d;document.getElementById("productPhotoPreview").classList.remove("hidden")})); document.getElementById("saveProductBtn").addEventListener("click",saveProduct); document.getElementById("clearProductBtn").addEventListener("click",clearProductBuilder); document.getElementById("detailBackBtn").addEventListener("click",()=>setTab("recipes")); document.getElementById("detailUseBtn").addEventListener("click",()=>{if(currentDetailItemId){selectItem(currentDetailItemId);setTab("calc")}}); document.getElementById("detailEditBtn").addEventListener("click",editRecipeFromDetail); document.getElementById("checkUpdateBtn").addEventListener("click",()=>checkForAppUpdate(true)); document.getElementById("updateNowBtn").addEventListener("click",applyAppUpdate); document.getElementById("appVersionLabel").textContent=APP_VERSION; checkForAppUpdate(false); if("serviceWorker" in navigator)navigator.serviceWorker.register("sw.js").catch(()=>{}); if(navigator.storage&&navigator.storage.persist)navigator.storage.persist().catch(()=>{})});


/* === Désactivation des 3 propositions sous Rechercher === */
function renderSuggestions(){
  const box = document.getElementById("suggestions");
  if(box){
    box.innerHTML = "";
    box.classList.add("hidden");
  }
}

function hideSuggestions(){
  const box = document.getElementById("suggestions");
  if(box){
    box.innerHTML = "";
    box.classList.add("hidden");
  }
}


/* === v2.7 complete : aide valeurs nutritives + conversion automatique === */
function v27UnitToApproxGrams(qty, unit){
  const q = Number(qty) || 0;
  const factors = {
    "g": 1,
    "ml": 1,
    "tasse": 250,
    "demi-tasse": 125,
    "quart-tasse": 60,
    "c-soupe": 15,
    "c-the": 5,
    "biscuit": 15,
    "tranche": 30,
    "barre": 45,
    "morceau": 20,
    "unite": 100,
    "autre": 1
  };
  return q * (factors[unit] || 1);
}

function v27SyncProductServing(autoFill){
  const qtyEl = document.getElementById("productServingQty");
  const unitEl = document.getElementById("productServingUnit");
  const gramsEl = document.getElementById("productServingGrams");
  const hiddenServing = document.getElementById("productServing");
  if(!qtyEl || !unitEl || !gramsEl) return;

  const qty = parseFloat(qtyEl.value) || 0;
  const unit = unitEl.value || "g";

  if(autoFill && qty > 0){
    const estimated = v27UnitToApproxGrams(qty, unit);
    if(estimated > 0){
      gramsEl.value = Math.round(estimated * 10) / 10;
    }
  }

  if(hiddenServing){
    hiddenServing.value = gramsEl.value || "";
    hiddenServing.dispatchEvent(new Event("input", {bubbles:true}));
  }

  if(typeof renderProductCalc === "function"){
    renderProductCalc();
  }
}

function setupNutritionHelpV27Complete(){
  const helpBtn = document.getElementById("nutritionHelpBtn");
  const modal = document.getElementById("nutritionHelpModal");
  const closeBtn = document.getElementById("closeNutritionHelpBtn");

  if(helpBtn && modal && !helpBtn.dataset.v27Bound){
    helpBtn.dataset.v27Bound = "1";
    helpBtn.addEventListener("click", () => modal.classList.remove("hidden"));
  }
  if(closeBtn && modal && !closeBtn.dataset.v27Bound){
    closeBtn.dataset.v27Bound = "1";
    closeBtn.addEventListener("click", () => modal.classList.add("hidden"));
  }
  if(modal && !modal.dataset.v27Bound){
    modal.dataset.v27Bound = "1";
    modal.addEventListener("click", (e) => { if(e.target === modal) modal.classList.add("hidden"); });
  }

  const qtyEl = document.getElementById("productServingQty");
  const unitEl = document.getElementById("productServingUnit");
  const gramsEl = document.getElementById("productServingGrams");
  const saveBtn = document.getElementById("saveProductBtn");

  if(qtyEl && !qtyEl.dataset.v27Bound){
    qtyEl.dataset.v27Bound = "1";
    qtyEl.addEventListener("input", () => v27SyncProductServing(true));
    qtyEl.addEventListener("change", () => v27SyncProductServing(true));
  }
  if(unitEl && !unitEl.dataset.v27Bound){
    unitEl.dataset.v27Bound = "1";
    unitEl.addEventListener("input", () => v27SyncProductServing(true));
    unitEl.addEventListener("change", () => v27SyncProductServing(true));
  }
  if(gramsEl && !gramsEl.dataset.v27Bound){
    gramsEl.dataset.v27Bound = "1";
    gramsEl.addEventListener("input", () => v27SyncProductServing(false));
    gramsEl.addEventListener("change", () => v27SyncProductServing(false));
  }
  if(saveBtn && !saveBtn.dataset.v27Bound){
    saveBtn.dataset.v27Bound = "1";
    saveBtn.addEventListener("click", () => v27SyncProductServing(false), true);
  }

  v27SyncProductServing(false);
}

document.addEventListener("DOMContentLoaded", () => setTimeout(setupNutritionHelpV27Complete, 120));




/* === v2.8 : choisir dans le registre + bouton + + 4 récents === */
function v28GetItemById(id){
  if(typeof items === "undefined") return null;
  return items.find(x => String(x.id) === String(id));
}

function v28SafePhoto(item){
  try{
    if(typeof photoOrPlaceholder === "function") return photoOrPlaceholder(item);
  }catch(e){}
  return item && item.photo ? item.photo : "";
}

function v28SetSelectedItem(id){
  const item = v28GetItemById(id);
  if(!item) return;

  // Keep compatibility with the existing calculator variables/functions.
  if(typeof selectedItemId !== "undefined"){
    selectedItemId = item.id;
  }

  const searchInput = document.getElementById("itemSearch");
  if(searchInput) searchInput.value = item.name;

  if(typeof addRecent === "function"){
    addRecent(item.id);
  }else{
    v28AddRecentFallback(item.id);
  }

  if(typeof updatePreview === "function") updatePreview();
  if(typeof calculate === "function") calculate();

  v28RenderSelectedCard();
  v28RenderRecentUsed();
  v28ShowToast(`✓ ${item.name} sélectionné`);
}

function v28AddRecentFallback(id){
  try{
    let arr = JSON.parse(localStorage.getItem("recentIds") || "[]");
    arr = arr.filter(x => String(x) !== String(id));
    arr.unshift(id);
    arr = arr.slice(0,10);
    localStorage.setItem("recentIds", JSON.stringify(arr));
    if(typeof recentIds !== "undefined") recentIds = arr;
  }catch(e){}
}

function v28CurrentRecentIds(){
  if(typeof recentIds !== "undefined" && Array.isArray(recentIds)) return recentIds;
  try{
    return JSON.parse(localStorage.getItem("recentIds") || "[]");
  }catch(e){
    return [];
  }
}

function v28RenderSelectedCard(){
  const item = typeof selectedItemId !== "undefined" ? v28GetItemById(selectedItemId) : null;
  const card = document.getElementById("selectedCalcItemCard");
  const img = document.getElementById("selectedCalcItemPhoto");
  const name = document.getElementById("selectedCalcItemName");
  const info = document.getElementById("selectedCalcItemInfo");
  const change = document.getElementById("changeCalcItemBtn");

  if(!card || !name || !info) return;

  if(!item){
    card.classList.add("empty");
    name.textContent = "Aucun";
    info.textContent = "Choisissez un aliment ou une recette dans le registre.";
    if(img) img.classList.add("hidden");
    if(change) change.classList.add("hidden");
    return;
  }

  card.classList.remove("empty");
  name.textContent = item.name;
  info.textContent = `${item.category || ""} · ${String(item.carbs).replace(".", ",")} g glucides nets / 100 g`;

  if(img){
    const src = v28SafePhoto(item);
    if(src){
      img.src = src;
      img.classList.remove("hidden");
    }else{
      img.classList.add("hidden");
    }
  }
  if(change) change.classList.remove("hidden");
}

function v28RenderRecentUsed(){
  const block = document.getElementById("recentUsedBlock");
  const grid = document.getElementById("recentUsedGrid");
  if(!block || !grid) return;

  const recentItems = v28CurrentRecentIds()
    .map(id => v28GetItemById(id))
    .filter(Boolean)
    .slice(0,4);

  if(recentItems.length === 0){
    block.classList.add("hidden");
    grid.innerHTML = "";
    return;
  }

  grid.innerHTML = recentItems.map(item => `
    <div class="recent-card">
      <img src="${v28SafePhoto(item)}" alt="">
      <strong>${item.name}</strong>
      <button type="button" data-v28-recent-add="${item.id}">+</button>
    </div>
  `).join("");

  block.classList.remove("hidden");
}

function v28GoToRegistry(){
  if(typeof setTab === "function"){
    setTab("recipes");
  }
  if(typeof renderRecipes === "function"){
    renderRecipes();
  }
  setTimeout(v28AddPlusButtonsToRegistry, 80);
}

function v28ShowToast(text){
  const old = document.querySelector(".selection-toast");
  if(old) old.remove();

  const t = document.createElement("div");
  t.className = "selection-toast";
  t.textContent = text;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 900);
}

function v28FindItemIdFromRecipeRow(row){
  if(!row) return "";
  if(row.dataset.itemId) return row.dataset.itemId;

  const fav = row.querySelector("[data-fav]");
  if(fav && fav.dataset.fav) return fav.dataset.fav;

  const edit = row.querySelector("[data-edit]");
  if(edit && edit.dataset.edit) return edit.dataset.edit;

  const del = row.querySelector("[data-delete]");
  if(del && del.dataset.delete) return del.dataset.delete;

  return "";
}

function v28AddPlusButtonsToRegistry(){
  const list = document.getElementById("recipeList");
  if(!list) return;

  list.querySelectorAll(".recipe-item").forEach(row => {
    if(row.dataset.v28plus === "1") return;

    const id = v28FindItemIdFromRecipeRow(row);
    if(!id) return;

    row.dataset.itemId = id;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "quick-add";
    btn.dataset.v28QuickAdd = id;
    btn.textContent = "+";
    btn.setAttribute("aria-label", "Ajouter au calculateur");

    const actions = row.querySelector(".actions");
    if(actions){
      actions.prepend(btn);
    }else{
      row.appendChild(btn);
    }

    row.dataset.v28plus = "1";
  });
}

// Wrap renderRecipes so the + buttons are added after each refresh/filter.
if(typeof renderRecipes === "function" && !window.__v28RenderRecipesWrapped){
  window.__v28RenderRecipesWrapped = true;
  const originalRenderRecipesV28 = renderRecipes;
  renderRecipes = function(){
    originalRenderRecipesV28();
    setTimeout(v28AddPlusButtonsToRegistry, 0);
  };
}

function v28Setup(){
  document.getElementById("chooseFromRegistryBtn")?.addEventListener("click", v28GoToRegistry);
  document.getElementById("changeCalcItemBtn")?.addEventListener("click", v28GoToRegistry);

  document.getElementById("recentUsedGrid")?.addEventListener("click", e => {
    const btn = e.target.closest("[data-v28-recent-add]");
    if(btn){
      v28SetSelectedItem(btn.dataset.v28RecentAdd);
    }
  });

  document.getElementById("recipeList")?.addEventListener("click", e => {
    const btn = e.target.closest("[data-v28-quick-add]");
    if(btn){
      e.preventDefault();
      e.stopPropagation();
      v28SetSelectedItem(btn.dataset.v28QuickAdd);
      if(typeof setTab === "function") setTab("calc");
      v28RenderRecentUsed();
    }
  }, true);

  // Keep card in sync when calculations happen.
  if(typeof calculate === "function" && !window.__v28CalculateWrapped){
    window.__v28CalculateWrapped = true;
    const originalCalculateV28 = calculate;
    calculate = function(){
      originalCalculateV28();
      v28RenderSelectedCard();
      v28RenderRecentUsed();
    };
  }

  v28RenderSelectedCard();
  v28RenderRecentUsed();
  setTimeout(v28AddPlusButtonsToRegistry, 300);
}

document.addEventListener("DOMContentLoaded", () => {
  setTimeout(v28Setup, 150);
});
