
const DEFAULT_ADMIN_PIN="112233";
const APP_VERSION="3.1.2";
const VERSION_URL="version.json";
const CENTRAL_DB_URL="database.json";
const FALLBACK_ITEMS=[{id:"banane",name:"Banane",category:"Aliment",carbs:20.2,photo:"",source:"central"}];
const LS_CENTRAL_CACHE="dt1_central_database_cache_v312";
const LS_LOCAL_ITEMS="dt1_local_family_items_v1";
const OLD_KEYS=["dt1_items_v5_search","dt1_items_v4_categories","dt1_recipes_v3_secure","dt1_recipes_v2"];
const LS_PIN="dt1_admin_pin"; const LS_ADMIN="dt1_admin_unlocked"; const LS_FAVORITES="dt1_favorite_item_ids_v1"; const LS_RECENTS="dt1_recent_item_ids_v1";
let centralItems=[], localItems=[], items=[], selectedItemId="", currentFilter="Tous", currentLetterFilter="Tous", favoriteIds=[], recentIds=[];
let currentRecipeIngredient=null, recipeIngredients=[], createdRecipePhotoData="", productPhotoData="", editingRecipeId="", currentDetailItemId="";
function normalizeItem(r,idx=0,source="local"){return{id:r.id||`${source}_${Date.now()}_${idx}`,name:String(r.name||r.nom||"").trim(),carbs:Number(r.carbs??r.glucides??r.glucidesNets100g),category:(r.category==="Aliment"||r.category==="Recette")?r.category:"Recette",photo:r.photo||"",source:r.source||source,aliases:r.aliases||r.alias||"",group:r.group||r.cnfGroup||"",subgroup:r.subgroup||"",ingredients:r.ingredients||[],totalCarbs:r.totalCarbs,finalWeight:r.finalWeight,label:r.label};}
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
function smartSearchScore(item,query){const q=normalizeSearchText(query), name=normalizeSearchText(item.name), alias=normalizeSearchText(item.aliases||""), meta=normalizeSearchText(`${item.group||""} ${item.subgroup||""}`), hay=`${name} ${alias} ${meta}`.trim(), terms=expandSearchTerms(query); let score=0; if(!q)return 0; if(name===q)score+=2000; if(name.startsWith(q))score+=1200; if(name.includes(q))score+=800; if(alias.includes(q))score+=650; if(meta.includes(q))score+=180; for(const t of terms){if(name.split(" ").includes(t))score+=260; else if(name.includes(t))score+=140; else if(alias.includes(t))score+=130; else if(meta.includes(t))score+=70; else if(hay.split(" ").some(w=>levenshtein(w,t)<=1&&t.length>=4))score+=80} if(isFavorite(item.id))score+=180; if(recentIds.includes(item.id))score+=90; if(item.category==="Recette")score+=30; return score}
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



/* === v2.8 : calculateur simplifié + version sans bouton update === */
const LIVIA_APP_VERSION = "3.1.2";
const LIVIA_VERSION_DATE = "2026-07-01";

function liviaGoToRegistryFromSearch(){
  if(typeof setTab === "function") setTab("recipes");
  if(typeof renderRecipes === "function") renderRecipes();
}

function liviaClearCalculatorSelection(){
  try{
    if(typeof selectedItemId !== "undefined") selectedItemId = "";
    const search = document.getElementById("itemSearch");
    if(search) search.value = "";
    const weight = document.getElementById("portionWeight");
    if(weight) weight.value = "";
    const result = document.getElementById("carbResult");
    if(result) result.textContent = "0 g";
    const preview = document.getElementById("recipePreview");
    if(preview) preview.classList.add("hidden");
    const suggestions = document.getElementById("suggestions");
    if(suggestions){ suggestions.innerHTML = ""; suggestions.classList.add("hidden"); }
    if(typeof calculate === "function") calculate();
    if(typeof updatePreview === "function") updatePreview();
  }catch(e){}
}

async function liviaRenderVersionInfo(){
  Array.from(document.querySelectorAll("button")).forEach(b => {
    const t = (b.textContent || "").toLowerCase();
    if(t.includes("mettre à jour") || t.includes("mettre a jour")) b.remove();
  });

  const old = document.getElementById("liviaVersionPanel");
  if(old) old.remove();

  let latestVersion = LIVIA_APP_VERSION;
  let latestDate = LIVIA_VERSION_DATE;
  try{
    const res = await fetch("version.json?v=" + Date.now(), {cache:"no-store"});
    if(res.ok){
      const data = await res.json();
      latestVersion = data.version || latestVersion;
      latestDate = data.releasedAt ? String(data.releasedAt).slice(0,10) : (data.date || latestDate);
    }
  }catch(e){}

  const panel = document.createElement("div");
  panel.id = "liviaVersionPanel";
  panel.className = "version-panel";
  const isCurrent = latestVersion === LIVIA_APP_VERSION;
  panel.innerHTML = `
    <div><strong>Version installée :</strong> v${LIVIA_APP_VERSION.replace(/^v/i,"")}</div>
    <div><strong>Dernière version disponible :</strong> v${String(latestVersion).replace(/^v/i,"")}</div>
    <div><strong>Date :</strong> ${latestDate}</div>
    <div class="${isCurrent ? "version-status-ok" : "version-status-new"}">
      ${isCurrent ? "Votre application est à jour." : "Une version plus récente est disponible sur GitHub."}
    </div>`;

  const target = document.getElementById("lockedPanel") || document.getElementById("screen-admin") || document.body;
  target.appendChild(panel);
}

function liviaSetupV28(){
  const search = document.getElementById("itemSearch");
  if(search){
    search.setAttribute("readonly","readonly");
    search.placeholder = "Choisir dans le registre";
    search.addEventListener("click", liviaGoToRegistryFromSearch);
    search.addEventListener("focus", () => { search.blur(); liviaGoToRegistryFromSearch(); });
  }
  const clearBtn = document.getElementById("clearCalcSelectionBtn");
  if(clearBtn) clearBtn.addEventListener("click", liviaClearCalculatorSelection);
  liviaRenderVersionInfo();
}
document.addEventListener("DOMContentLoaded", () => setTimeout(liviaSetupV28,150));



/* === v2.9 : bouton + dans le Registre === */
function v29Toast(text){
  const old = document.querySelector(".selection-toast");
  if(old) old.remove();
  const t = document.createElement("div");
  t.className = "selection-toast";
  t.textContent = text;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 900);
}

function v29GetItemIdFromRow(row){
  if(!row) return "";
  if(row.dataset.itemId) return row.dataset.itemId;
  const fav = row.querySelector("[data-fav]");
  if(fav && fav.dataset.fav) return fav.dataset.fav;
  const edit = row.querySelector("[data-edit]");
  if(edit && edit.dataset.edit) return edit.dataset.edit;
  const del = row.querySelector("[data-delete]");
  if(del && del.dataset.delete) return del.dataset.delete;
  const title = row.querySelector("strong, h3, .item-name, .recipe-name")?.textContent?.trim();
  if(title && typeof items !== "undefined"){
    const found = items.find(x => x.name === title);
    if(found) return found.id;
  }
  return "";
}

function v29AddPlusButtons(){
  const list = document.getElementById("recipeList");
  if(!list) return;
  const rows = list.querySelectorAll(".recipe-item, .recipe-row, .registry-item, .item-row");
  rows.forEach(row => {
    if(row.dataset.v29plus === "1") return;
    const id = v29GetItemIdFromRow(row);
    if(!id) return;
    row.dataset.itemId = id;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "add-to-calculator-btn";
    btn.dataset.v29Add = id;
    btn.textContent = "+";
    btn.setAttribute("aria-label", "Ajouter au calculateur");
    const star = row.querySelector("[data-fav]");
    const actions = row.querySelector(".actions, .recipe-actions, .item-actions");
    if(actions){
      actions.prepend(btn);
    }else if(star && star.parentElement){
      star.parentElement.insertBefore(btn, star);
    }else{
      row.appendChild(btn);
    }
    row.dataset.v29plus = "1";
  });
}

if(typeof renderRecipes === "function" && !window.__v29RenderWrapped){
  window.__v29RenderWrapped = true;
  const oldRenderRecipesV29 = renderRecipes;
  renderRecipes = function(){
    oldRenderRecipesV29();
    setTimeout(v29AddPlusButtons, 0);
  };
}

function v29SelectForCalculator(id){
  let item = null;
  if(typeof items !== "undefined"){
    item = items.find(x => String(x.id) === String(id));
  }
  if(typeof selectItem === "function"){
    selectItem(id);
  }else{
    if(typeof selectedItemId !== "undefined") selectedItemId = id;
    const input = document.getElementById("itemSearch");
    if(input && item) input.value = item.name;
    if(typeof updatePreview === "function") updatePreview();
    if(typeof calculate === "function") calculate();
  }
  if(typeof setTab === "function"){
    setTab("calc");
  }
  if(item){
    v29Toast(`✓ ${item.name} ajouté au calculateur`);
  }
}

function v29Setup(){
  const list = document.getElementById("recipeList");
  if(list && !list.dataset.v29Bound){
    list.dataset.v29Bound = "1";
    list.addEventListener("click", e => {
      const btn = e.target.closest("[data-v29-add]");
      if(!btn) return;
      e.preventDefault();
      e.stopPropagation();
      v29SelectForCalculator(btn.dataset.v29Add);
    }, true);
  }
  setTimeout(v29AddPlusButtons, 250);
}

document.addEventListener("DOMContentLoaded", () => {
  setTimeout(v29Setup, 150);
});


/* === v3.0 : nouvelle base officielle DT1 simplifiee + version 3.0 === */


/* === v3.1 : gestion base officielle, mesures usuelles, edition admin et poids recette auto === */
const LS_DELETED_CENTRAL_IDS_V31 = "dt1_deleted_central_item_ids_v31";
function v31DeletedIds(){try{return JSON.parse(localStorage.getItem(LS_DELETED_CENTRAL_IDS_V31)||"[]")}catch(e){return[]}}
function v31SaveDeletedIds(ids){localStorage.setItem(LS_DELETED_CENTRAL_IDS_V31, JSON.stringify([...new Set(ids)]));}
function v31Round1(n){return Math.round((Number(n)||0)*10)/10}
function v31Escape(s){return String(s??"").replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function v31IsCentral(it){return it && (it.source||"").includes("base-officielle") || (it && it.source==="central")}

if(typeof normalizeItem === "function" && !window.__v31NormalizeWrapped){
  window.__v31NormalizeWrapped=true;
  const oldNormalizeV31 = normalizeItem;
  normalizeItem = function(r,idx=0,source="local"){
    const it = oldNormalizeV31(r,idx,source);
    it.brand = r.brand || it.brand || "";
    it.commonMeasures = Array.isArray(r.commonMeasures) ? r.commonMeasures : (Array.isArray(r.measures)?r.measures:[]);
    it.notes = r.notes || it.notes || "";
    it.status = r.status || it.status || "";
    it.priority = r.priority || it.priority || "";
    return it;
  }
}

function mergeItems(){
  const deleted = new Set(v31DeletedIds());
  const map = new Map();
  for(const it of centralItems){ if(it && it.id && !deleted.has(it.id)) map.set(String(it.id), it); }
  for(const it of localItems){ if(it && it.id) map.set(String(it.id), it); }
  const byName = new Map();
  for(const it of map.values()){
    if(!it.name || isNaN(it.carbs)) continue;
    const k = `${normalizeSearchText(it.name)}|${it.category}`;
    byName.set(k,it);
  }
  items = [...byName.values()];
}

function v31MeasureButtonsHtml(it){
  if(!it || !Array.isArray(it.commonMeasures) || !it.commonMeasures.length) return "";
  return `<div id="commonMeasuresBox" class="common-measures"><small>Mesures usuelles</small><div>${it.commonMeasures.map(m=>`<button type="button" data-measure-grams="${Number(m.grams)||0}">${v31Escape(m.label)} (${String(m.grams).replace('.',',')} g)</button>`).join("")}</div></div>`;
}

if(typeof updatePreview === "function" && !window.__v31PreviewWrapped){
  window.__v31PreviewWrapped=true;
  const oldUpdatePreviewV31=updatePreview;
  updatePreview=function(){
    oldUpdatePreviewV31();
    const r=selectedItem();
    const box=document.getElementById("recipePreview");
    if(!box) return;
    const old=document.getElementById("commonMeasuresBox");
    if(old) old.remove();
    if(r && Array.isArray(r.commonMeasures) && r.commonMeasures.length){
      box.insertAdjacentHTML("beforeend", v31MeasureButtonsHtml(r));
    }
  }
}

document.addEventListener("click", e=>{
  const m=e.target.closest("[data-measure-grams]");
  if(!m) return;
  const grams=parseFloat(m.dataset.measureGrams)||0;
  const w=document.getElementById("portionWeight");
  if(w){w.value=grams; if(typeof calculate==="function") calculate();}
});

function v31AutoWeightFromIngredients(){
  const total = (recipeIngredients||[]).reduce((s,i)=>s+(Number(i.grams)||0),0);
  const fw=document.getElementById("finalRecipeWeight");
  if(!fw) return;
  if(!fw.dataset.userEdited || fw.value==="") fw.value = total ? v31Round1(total) : "";
}

if(typeof renderRecipeBuilder === "function" && !window.__v31RecipeBuilderWrapped){
  window.__v31RecipeBuilderWrapped=true;
  const oldRenderRecipeBuilderV31=renderRecipeBuilder;
  renderRecipeBuilder=function(){
    v31AutoWeightFromIngredients();
    oldRenderRecipeBuilderV31();
  }
}

function v31SetupRecipeWeightAuto(){
  const fw=document.getElementById("finalRecipeWeight");
  if(fw && !fw.dataset.v31Bound){
    fw.dataset.v31Bound="1";
    fw.addEventListener("input",()=>{fw.dataset.userEdited="1";});
  }
  const add=document.getElementById("addIngredientBtn");
  if(add && !add.dataset.v31Bound){
    add.dataset.v31Bound="1";
    add.addEventListener("click",()=>setTimeout(()=>{v31AutoWeightFromIngredients(); if(typeof renderRecipeBuilder==="function") renderRecipeBuilder();},50));
  }
  const list=document.getElementById("ingredientList");
  if(list && !list.dataset.v31Bound){
    list.dataset.v31Bound="1";
    list.addEventListener("click",()=>setTimeout(()=>{v31AutoWeightFromIngredients(); if(typeof renderRecipeBuilder==="function") renderRecipeBuilder();},50));
  }
}

document.addEventListener("DOMContentLoaded",()=>setTimeout(v31SetupRecipeWeightAuto,250));

function v31CreateEditModal(){
  if(document.getElementById("v31EditModal")) return;
  document.body.insertAdjacentHTML("beforeend", `
  <div id="v31EditModal" class="modal hidden">
    <div class="modal-content edit-modal-content">
      <button id="v31EditClose" class="modal-close" type="button">×</button>
      <h2>Modifier l'élément</h2>
      <input id="v31EditId" type="hidden">
      <label>Nom</label><input id="v31EditName">
      <label>Type</label><select id="v31EditCategory"><option>Aliment</option><option>Recette</option></select>
      <label>Glucides nets / 100 g</label><input id="v31EditCarbs" type="number" step="0.1" inputmode="decimal">
      <label>Alias de recherche</label><textarea id="v31EditAliases" rows="2"></textarea>
      <label>Groupe / catégorie</label><input id="v31EditGroup">
      <label>Notes</label><textarea id="v31EditNotes" rows="3"></textarea>
      <button id="v31EditSave" class="primary" type="button">Enregistrer</button>
      <button id="v31EditCancel" class="secondary" type="button">Annuler</button>
    </div>
  </div>`);
  document.getElementById("v31EditClose").onclick=()=>document.getElementById("v31EditModal").classList.add("hidden");
  document.getElementById("v31EditCancel").onclick=()=>document.getElementById("v31EditModal").classList.add("hidden");
  document.getElementById("v31EditSave").onclick=v31SaveEdit;
}
function v31OpenEditItem(id){
  if(!isAdmin()){alert("Déverrouille les paramètres avec le code admin pour modifier."); return;}
  const it=itemById(id); if(!it) return;
  v31CreateEditModal();
  document.getElementById("v31EditId").value=it.id;
  document.getElementById("v31EditName").value=it.name||"";
  document.getElementById("v31EditCategory").value=it.category||"Aliment";
  document.getElementById("v31EditCarbs").value=it.carbs||0;
  document.getElementById("v31EditAliases").value=it.aliases||"";
  document.getElementById("v31EditGroup").value=it.group||"";
  document.getElementById("v31EditNotes").value=it.notes||"";
  document.getElementById("v31EditModal").classList.remove("hidden");
}
function v31SaveEdit(){
  const id=document.getElementById("v31EditId").value;
  const original=itemById(id); if(!original) return;
  const name=document.getElementById("v31EditName").value.trim();
  const carbs=parseFloat(document.getElementById("v31EditCarbs").value);
  if(!name){alert("Entre un nom."); return;}
  if(isNaN(carbs)){alert("Entre les glucides nets / 100 g."); return;}
  const updated={...original, id, name, carbs:v31Round1(carbs), category:document.getElementById("v31EditCategory").value, aliases:document.getElementById("v31EditAliases").value.trim(), group:document.getElementById("v31EditGroup").value.trim(), notes:document.getElementById("v31EditNotes").value.trim(), source:"local"};
  const idx=localItems.findIndex(x=>String(x.id)===String(id));
  if(idx>=0) localItems[idx]=updated; else localItems.push(updated);
  saveLocalItems();
  document.getElementById("v31EditModal").classList.add("hidden");
  if(typeof renderRecipes==="function") renderRecipes();
  if(currentDetailItemId===id && typeof openDetail==="function") openDetail(id);
  alert("Modification enregistrée localement.");
}
function v31DeleteItem(id){
  if(!isAdmin()){alert("Déverrouille les paramètres avec le code admin pour supprimer."); return;}
  const it=itemById(id); if(!it) return;
  if(!confirm(`Supprimer « ${it.name} » du registre sur cet appareil?`)) return;
  localItems=localItems.filter(x=>String(x.id)!==String(id));
  if(v31IsCentral(it)){
    const ids=v31DeletedIds(); ids.push(it.id); v31SaveDeletedIds(ids);
  }
  saveLocalItems(); mergeItems(); renderRecipes();
  alert("Élément supprimé localement.");
}

if(typeof renderRecipes === "function" && !window.__v31RenderWrapped){
  window.__v31RenderWrapped=true;
  const oldRenderRecipesV31=renderRecipes;
  renderRecipes=function(){
    oldRenderRecipesV31();
    if(!isAdmin()) return;
    document.querySelectorAll("#recipeList .recipe-item").forEach(row=>{
      const id=row.dataset.itemId || v29GetItemIdFromRow(row); if(!id) return;
      const actions=row.querySelector(".actions"); if(!actions) return;
      if(!actions.querySelector(`[data-v31-edit="${CSS.escape(id)}"]`)){
        actions.insertAdjacentHTML("beforeend", `<button type="button" data-v31-edit="${v31Escape(id)}">✏️</button><button type="button" data-v31-delete="${v31Escape(id)}">🗑️</button>`);
      }
    });
  }
}

document.addEventListener("click", e=>{
  const edit=e.target.closest("[data-v31-edit],[data-edit]");
  if(edit){e.preventDefault(); e.stopPropagation(); v31OpenEditItem(edit.dataset.v31Edit||edit.dataset.edit); return;}
  const del=e.target.closest("[data-v31-delete],[data-delete]");
  if(del){e.preventDefault(); e.stopPropagation(); v31DeleteItem(del.dataset.v31Delete||del.dataset.delete); return;}
}, true);

if(typeof openDetail === "function" && !window.__v31DetailWrapped){
  window.__v31DetailWrapped=true;
  const oldOpenDetailV31=openDetail;
  openDetail=function(id){
    oldOpenDetailV31(id);
    const it=itemById(id); if(!it) return;
    const block=document.getElementById("detailIngredientsBlock"), list=document.getElementById("detailIngredientsList");
    let extra="";
    if(Array.isArray(it.commonMeasures) && it.commonMeasures.length){
      extra += `<div class="detail-ingredient"><strong>Mesures usuelles</strong><small>${it.commonMeasures.map(m=>`${v31Escape(m.label)} = ${String(m.grams).replace('.',',')} g`).join(" · ")}</small></div>`;
    }
    if(it.brand){extra += `<div class="detail-ingredient"><strong>Marque</strong><small>${v31Escape(it.brand)}</small></div>`;}
    if(extra){list.insertAdjacentHTML("beforeend", extra); block.classList.remove("hidden");}
    const editBtn=document.getElementById("detailEditBtn");
    if(editBtn){editBtn.classList.toggle("hidden", !isAdmin()); editBtn.textContent="Modifier cet élément"; editBtn.onclick=()=>v31OpenEditItem(id);}
  }
}
