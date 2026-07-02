/*MASS-reagent-system-main/enhancements.js*/
/* Multi-campus, location, unit conversion and formula extension. */
let orgData = { campuses: [], groups: [], locations: [] };
let selectedLabel = null;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const api = async (url, options) => { const r=await fetch(API_BASE+url,options); const d=await r.json(); if(!r.ok){const e=new Error(d.error||'操作失敗');Object.assign(e,d,{status:r.status});throw e;} return d; };
const optionHtml = (a, value='ID', label='Name') => a.map(x=>`<option value="${esc(x[value])}">${esc(x[label])}</option>`).join('');
function scoped(path) { const q=new URLSearchParams(); if(currentUser.campusID)q.set('campusID',currentUser.campusID);if(currentUser.groupID)q.set('groupID',currentUser.groupID);return path+(path.includes('?')?'&':'?')+q; }

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('actionButtons').insertAdjacentHTML('beforeend', `<button class="bg-cyan-700 text-white px-5 py-2.5 rounded shadow font-semibold" onclick="openAdvanced()">🏥 組織／位置／複方</button>`);
  document.body.insertAdjacentHTML('beforeend', advancedModal());
  const qrInput=document.getElementById('barcodeText'); qrInput.previousElementSibling.innerText='QR 編碼內容（系統自動產生版本化資料）';
  const unitBlock=document.getElementById('rg_Unit')?.parentElement;
  unitBlock?.insertAdjacentHTML('afterend', `
  <div class="grid grid-cols-1 gap-2 border-t pt-2">
    <label class="font-bold">效期</label>
    <input id="rg_ExpDate" type="date" class="border p-2 rounded">
  
    <label class="font-bold">院區</label>
    <select id="rg_CampusID" class="border p-2 rounded"></select>
  
    <label class="font-bold">組別</label>
    <select id="rg_GroupID" class="border p-2 rounded"></select>
  
    <label class="font-bold">擺放位置</label>
    <select id="rg_LocationID" class="border p-2 rounded"></select>
  </div>`);
  document.getElementById('usr_UserRole')?.parentElement?.insertAdjacentHTML('afterend', `<div><label class="block font-bold text-slate-600">院區</label><select id="usr_CampusID" class="w-full border p-2 rounded"></select></div><div><label class="block font-bold text-slate-600">組別</label><select id="usr_GroupID" class="w-full border p-2 rounded"></select></div>`);
  loadOrg().catch(console.error);
  initQRSelectEnhancement();
});

function advancedModal(){return `<div id="modal_Advanced" class="fixed inset-0 bg-slate-900/70 z-50 hidden p-4 overflow-auto"><div class="bg-white max-w-7xl mx-auto my-4 rounded-xl shadow-2xl p-5 space-y-5">
 <div class="flex justify-between border-b pb-3"><h2 class="text-xl font-bold">院區、組別、位置與複方管理</h2><button class="text-3xl" onclick="closeModal('Advanced')">&times;</button></div>
 <div class="grid md:grid-cols-3 gap-4">
  <section class="border rounded p-3"><h3 class="font-bold mb-2">院區</h3><div class="flex gap-2"><input id="advCampusName" class="border p-2 flex-1" placeholder="院區名稱"><button onclick="saveOrg('campus')" class="bg-blue-600 text-white px-3 rounded">新增</button></div><div id="campusList" class="text-sm mt-2"></div></section>
  <section class="border rounded p-3"><h3 class="font-bold mb-2">組別</h3><select id="advGroupCampus" class="border p-2 w-full mb-2"></select><div class="flex gap-2"><input id="advGroupName" class="border p-2 flex-1" placeholder="組別名稱"><button onclick="saveOrg('group')" class="bg-blue-600 text-white px-3 rounded">新增</button></div><div id="groupList" class="text-sm mt-2"></div></section>
  <section class="border rounded p-3"><h3 class="font-bold mb-2">擺放位置</h3><select id="advLocCampus" onchange="refreshOrgSelects()" class="border p-2 w-full mb-2"></select><select id="advLocGroup" class="border p-2 w-full mb-2"></select><div class="flex gap-2"><input id="advLocName" class="border p-2 flex-1" placeholder="如 A櫃/冷藏庫2層"><button onclick="saveOrg('location')" class="bg-blue-600 text-white px-3 rounded">新增</button></div><div id="locationList" class="text-sm mt-2"></div></section>
 </div>
 <section class="border rounded p-4 space-y-3"><div class="flex flex-wrap justify-between gap-2"><h3 class="font-bold text-lg">複方配製標準檔（最多 20 種）</h3><div><button onclick="exportFormula()" class="bg-emerald-600 text-white px-3 py-2 rounded">匯出 CSV</button><label class="bg-indigo-600 text-white px-3 py-2 rounded cursor-pointer">匯入 CSV<input type="file" accept=".csv" hidden onchange="importFormula(this)"></label></div></div>
  <div class="grid md:grid-cols-4 gap-2"><input id="formulaID" type="hidden"><input id="formulaName" class="border p-2" placeholder="配方名稱"><input id="yieldQty" class="border p-2" type="number" value="1" placeholder="產出量"><input id="yieldUnit" class="border p-2" placeholder="產出單位"><button onclick="addComponent()" class="bg-slate-700 text-white rounded">＋成分</button></div>
  <div id="componentRows" class="space-y-2"></div>
  
  <div class="flex flex-wrap gap-2 items-center">
      <button onclick="saveFormula()" class="bg-blue-600 text-white px-4 py-2 rounded">儲存配方</button>
      <button onclick="clearFormula()" class="bg-slate-200 px-4 py-2 rounded">清空</button>
  
      <input id="formulaKeyword"
             class="border p-2 rounded text-sm flex-1 min-w-[180px]"
             placeholder="搜尋複方名稱或代碼"
             oninput="loadFormulas()">
  
      <label class="text-sm font-bold text-slate-600 flex items-center gap-2">
          <input type="checkbox" id="showInactiveFormula" onchange="loadFormulas()">
          顯示停用複方
      </label>
  </div>
  
  <div id="formulaList" class="overflow-auto"></div>
 </section>
 <section class="border rounded p-4"><h3 class="font-bold">刷複方 QR 一次扣除所有成分</h3><div class="flex gap-2 mt-2"><input id="formulaScan" class="border p-2 flex-1 font-mono" placeholder='掃描 {"v":2,"type":"formula","id":"F001"}' onkeydown="if(event.key==='Enter')executeFormulaQR()"><input id="formulaMultiplier" type="number" min="0.001" step="0.001" value="1" class="border p-2 w-28"><button onclick="executeFormulaQR()" class="bg-rose-600 text-white px-4 rounded">配製並扣庫</button></div></section>
 </div></div>`}

async function openAdvanced(){
  if(!currentUser.account){openModal('Login');return;}
  document.getElementById('modal_Advanced').classList.remove('hidden');
  await loadOrg();
  window.advancedReagents=await api(scoped('/api/reagents/search'));
  document.querySelectorAll('.component-row').forEach(row=>{
    const select=row.querySelector('.c-r'),value=select.value;
    select.innerHTML=reagentOptions();
    if([...select.options].some(o=>o.value===value))select.value=value;
  });
  await loadFormulas();
  if(!document.querySelector('.component-row'))await addComponent();
}
async function loadOrg(){orgData=await api('/api/master-data');refreshOrgSelects();if(window.campusList)campusList.innerHTML=orgData.campuses.map(x=>`<div>${esc(x.ID)}－${esc(x.Name)}</div>`).join('');if(window.groupList)groupList.innerHTML=orgData.groups.map(x=>`<div>${esc(x.ID)}－${esc(x.Name)}</div>`).join('');if(window.locationList)locationList.innerHTML=orgData.locations.map(x=>`<div>${esc(x.ID)}－${esc(x.Name)}</div>`).join('');refreshBusinessOrgSelects();}
function refreshOrgSelects(){['advGroupCampus','advLocCampus'].forEach(id=>{const e=document.getElementById(id),v=e.value;e.innerHTML=optionHtml(orgData.campuses);if(v)e.value=v;});const campus=advLocCampus.value;advLocGroup.innerHTML=optionHtml(orgData.groups.filter(x=>!campus||x.CampusID===campus));}
function setOptions(id,rows){const e=document.getElementById(id);if(!e)return;const v=e.value;e.innerHTML=optionHtml(rows);if(rows.some(x=>x.ID===v))e.value=v;}
function refreshBusinessOrgSelects(){setOptions('rg_CampusID',orgData.campuses);setOptions('usr_CampusID',orgData.campuses);const rc=document.getElementById('rg_CampusID')?.value,uc=document.getElementById('usr_CampusID')?.value;setOptions('rg_GroupID',orgData.groups.filter(x=>!rc||x.CampusID===rc));setOptions('usr_GroupID',orgData.groups.filter(x=>!uc||x.CampusID===uc));const rg=document.getElementById('rg_GroupID')?.value;setOptions('rg_LocationID',orgData.locations.filter(x=>(!rc||x.CampusID===rc)&&(!rg||x.GroupID===rg)));}
document.addEventListener('change',e=>{if(['rg_CampusID','rg_GroupID','usr_CampusID'].includes(e.target.id))refreshBusinessOrgSelects();});
async function saveOrg(type){const ids={campus:['advCampusName'],group:['advGroupName','advGroupCampus'],location:['advLocName','advLocCampus','advLocGroup']}[type],Name=document.getElementById(ids[0]).value;const b={type,Name};if(type!=='campus')b.CampusID=document.getElementById(ids[1]).value;if(type==='location')b.GroupID=document.getElementById(ids[2]).value;await api('/api/master-data/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});document.getElementById(ids[0]).value='';await loadOrg();}

let qrSelectMode = "reagent";

function initQRSelectEnhancement() {
    const modal = document.getElementById("modal_SelectQR");
    if (!modal) return;

    // 避免重複插入
    if (document.getElementById("qrModeTabs")) return;

    modal.className =
        "fixed inset-0 bg-slate-900 bg-opacity-60 flex items-start md:items-center justify-center z-40 hidden p-3 overflow-y-auto";

    const panel = modal.querySelector(".bg-white");
    if (panel) {
        panel.className =
            "bg-white p-4 md:p-6 rounded-xl shadow-2xl max-w-5xl w-full space-y-4 max-h-[92vh] overflow-y-auto my-3 md:my-0";
    }

    const title = modal.querySelector("h2");
    if (title) title.innerText = "🔍 選擇 QR Code 條碼來源";

    // ✅ 不再用 Tailwind selector，改用 lstReagentName 往上找 grid
    const reagentGrid = document.getElementById("lstReagentName")?.closest(".grid");
    if (!reagentGrid) {
        console.error("找不到 QR 試劑選擇區塊");
        return;
    }

    reagentGrid.id = "qrReagentPickerGrid";
    reagentGrid.className = "grid grid-cols-1 md:grid-cols-4 gap-3 md:gap-4";

    ["lstReagentName", "lstCATNO", "lstLOTNO"].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.className =
                "w-full border rounded-md p-1 h-40 md:h-72 text-sm focus:ring-2 focus:ring-blue-400 outline-none";
        }
    });

    reagentGrid.insertAdjacentHTML("beforebegin", `
        <div id="qrModeTabs" class="grid grid-cols-2 gap-2 bg-slate-100 p-2 rounded-lg">
            <button id="btnQrModeReagent"
                    type="button"
                    onclick="setQRSelectMode('reagent')"
                    class="bg-blue-600 text-white p-2 rounded-md font-bold text-sm">
                🧪 單一試劑
            </button>
            <button id="btnQrModeFormula"
                    type="button"
                    onclick="setQRSelectMode('formula')"
                    class="bg-white text-slate-700 p-2 rounded-md font-bold text-sm border">
                🧫 複方
            </button>
        </div>
    `);

    reagentGrid.insertAdjacentHTML("afterend", `
        <div id="qrFormulaPickerPanel" class="hidden space-y-3">
            <div class="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-slate-700">
                請選擇要列印 QR Code 的複方。掃描此 QR 後，可進行複方配製扣庫存。
            </div>

            <label class="block text-xs font-bold text-slate-600 uppercase">複方清單</label>
            <select id="lstFormulaQR"
                    size="10"
                    class="w-full border rounded-md p-2 h-56 text-sm focus:ring-2 focus:ring-blue-400 outline-none">
            </select>

            <button onclick="putBarcodeToPrintLabel()"
                    class="w-full bg-blue-600 text-white p-3 rounded-md hover:bg-blue-700 font-bold shadow text-sm transition">
                確認帶入主介面
            </button>
        </div>
    `);
}

function setQRSelectMode(mode) {
    qrSelectMode = mode;

    const reagentGrid = document.getElementById("qrReagentPickerGrid");
    const formulaPanel = document.getElementById("qrFormulaPickerPanel");
    const btnReagent = document.getElementById("btnQrModeReagent");
    const btnFormula = document.getElementById("btnQrModeFormula");

    if (!reagentGrid || !formulaPanel) return;

    if (mode === "formula") {
        reagentGrid.classList.add("hidden");
        formulaPanel.classList.remove("hidden");

        btnReagent.className = "bg-white text-slate-700 p-2 rounded-md font-bold text-sm border";
        btnFormula.className = "bg-blue-600 text-white p-2 rounded-md font-bold text-sm";

        loadQRFormulas();
    } else {
        reagentGrid.classList.remove("hidden");
        formulaPanel.classList.add("hidden");

        btnReagent.className = "bg-blue-600 text-white p-2 rounded-md font-bold text-sm";
        btnFormula.className = "bg-white text-slate-700 p-2 rounded-md font-bold text-sm border";
    }
}

async function loadQRFormulas() {
    const sel = document.getElementById("lstFormulaQR");
    if (!sel) return;

    sel.innerHTML = "";

    const list = await api("/api/formulas");
    window.formulas = list;

    const activeList = Array.isArray(list)
        ? list.filter(f => f.IsActive !== false)
        : [];

    if (activeList.length === 0) {
        sel.add(new Option("目前尚無啟用中的複方資料", ""));
        return;
    }

    activeList.forEach(f => {
        const text = `${f.ID}｜${f.Name}｜成分 ${f.Components?.length || 0} 項`;
        const opt = new Option(text, f.ID);
        opt.dataset.formulaName = f.Name || "";
        sel.add(opt);
    });
}

function reagentOptions(){return (window.advancedReagents||[]).map(r=>`<option value="${r.ID}" data-unit="${esc(r.BaseUnit||r.Unit)}">${esc(r.ReagentName)}｜${esc(r.CATNO)}｜${esc(r.LOTNO)}｜${esc(r.LocationID)} (${r.CurrentStock} ${esc(r.BaseUnit||r.Unit)})</option>`).join('');}
async function addComponent(c={}){if(document.querySelectorAll('.component-row').length>=20)return alert('最多 20 種成分');if(!window.advancedReagents)window.advancedReagents=await api('/api/reagents/search');componentRows.insertAdjacentHTML('beforeend',`<div class="component-row grid grid-cols-[1fr_100px_100px_40px] gap-2"><select class="c-r border p-2">${reagentOptions()}</select><input class="c-q border p-2" type="number" min="0" step="0.001" value="${c.Qty||''}" placeholder="量"><input class="c-u border p-2" value="${esc(c.Unit||'')}" placeholder="單位"><button onclick="this.parentElement.remove()" class="text-red-600">✕</button></div>`);const row=componentRows.lastElementChild;if(c.ReagentID)row.querySelector('.c-r').value=c.ReagentID;if(!c.Unit){const o=row.querySelector('.c-r').selectedOptions[0];row.querySelector('.c-u').value=o?.dataset.unit||'';}row.querySelector('.c-r').onchange=e=>row.querySelector('.c-u').value=e.target.selectedOptions[0]?.dataset.unit||'';}
function clearFormula(){formulaID.value='';formulaName.value='';yieldQty.value=1;yieldUnit.value='';componentRows.innerHTML='';addComponent();}
async function saveFormula() {
    if (!(currentUser.role === "Admin" || currentUser.role === "Maintainer")) {
        alert("權限不足：只有 Admin 或 Maintainer 可以維護複方。");
        return;
    }

    const Components = [...document.querySelectorAll('.component-row')].map(r => ({
        ReagentID: r.querySelector('.c-r').value,
        Qty: Number(r.querySelector('.c-q').value),
        Unit: r.querySelector('.c-u').value
    }));

    if (!formulaName.value.trim()) {
        alert("請輸入配方名稱。");
        return;
    }

    if (Components.length === 0 || Components.some(c => !c.ReagentID || !c.Qty || c.Qty <= 0)) {
        alert("請確認每一項成分都有選擇試劑，且用量大於 0。");
        return;
    }

    const b = {
        ID: formulaID.value,
        Name: formulaName.value.trim(),
        YieldQty: Number(yieldQty.value) || 1,
        YieldUnit: yieldUnit.value.trim(),
        Components,
        reqRole: currentUser.role,
        reqUser: currentUser.account
    };

    await api('/api/formulas/save', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(b)
    });

    alert("複方資料已儲存。");
    clearFormula();
    loadFormulas();
}

async function loadFormulas() {
    const showInactive = document.getElementById("showInactiveFormula")?.checked === true;
    const keyword = document.getElementById("formulaKeyword")?.value?.trim() || "";

    const params = new URLSearchParams();
    if (keyword) params.set("keyword", keyword);
    if (showInactive) params.set("includeInactive", "1");

    const list = await api('/api/formulas' + (params.toString() ? '?' + params.toString() : ''));
    window.formulas = list;

    const canMaintainFormula =
        currentUser.role === "Admin" || currentUser.role === "Maintainer";

    if (!Array.isArray(list) || list.length === 0) {
        formulaList.innerHTML = `
            <div class="p-4 text-center text-slate-500 bg-slate-50 border rounded">
                查無符合條件的複方資料
            </div>
        `;
        return;
    }

    formulaList.innerHTML = `
        <table class="w-full text-sm">
            <thead>
                <tr class="bg-slate-700 text-white">
                    <th class="p-2">狀態</th>
                    <th class="p-2">配方</th>
                    <th>產出</th>
                    <th>成分數</th>
                    <th>QR 內容</th>
                    <th>操作</th>
                </tr>
            </thead>
            <tbody>
                ${list.map(f => {
                    const isActive = f.IsActive !== false;
                    const payload = JSON.stringify({v:2,type:'formula',id:f.ID});

                    return `
                        <tr class="border-b hover:bg-slate-50 ${isActive ? "" : "bg-slate-100 text-slate-400"}">
                            <td class="p-2 text-center font-bold">
                                ${isActive ? "🟢 啟用" : "🔴 停用"}
                            </td>

                            <td class="p-2 font-bold">
                                <div>${esc(f.ID)} ${esc(f.Name)}</div>
                            </td>

                            <td class="p-2 text-center">
                                ${esc(f.YieldQty ?? "")} ${esc(f.YieldUnit ?? "")}
                            </td>

                            <td class="p-2 text-center">
                                ${f.Components?.length || 0}
                            </td>

                            <td class="p-2 font-mono text-xs break-all">
                                ${esc(payload)}
                            </td>

                            <td class="p-2 text-center whitespace-nowrap">
                                <button class="text-blue-700 font-bold"
                                        onclick="editFormula('${f.ID}')">
                                    編輯
                                </button>
                                ｜
                                <button class="text-indigo-700 font-bold"
                                        onclick="copyFormula('${f.ID}')">
                                    複製
                                </button>
                                ｜
                                ${isActive ? `
                                    <button class="text-emerald-700 font-bold"
                                            onclick="formulaScan.value='${esc(payload)}';executeFormulaQR()">
                                        配製
                                    </button>
                                ` : `
                                    <span class="text-slate-400">不可配製</span>
                                `}
                                ${canMaintainFormula ? `
                                    ｜
                                    <button class="${isActive ? "text-rose-700" : "text-green-700"} font-bold"
                                            onclick="setFormulaActive('${f.ID}', ${!isActive})">
                                        ${isActive ? "停用" : "啟用"}
                                    </button>
                                ` : ""}
                            </td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;
}

async function editFormula(id){const f=window.formulas.find(x=>x.ID===id);formulaID.value=f.ID;formulaName.value=f.Name;yieldQty.value=f.YieldQty;yieldUnit.value=f.YieldUnit;componentRows.innerHTML='';for(const c of f.Components)await addComponent(c);}


async function copyFormula(id) {
    if (!(currentUser.role === "Admin" || currentUser.role === "Maintainer")) {
        alert("權限不足：只有 Admin 或 Maintainer 可以複製複方。");
        return;
    }

    const f = window.formulas?.find(x => String(x.ID) === String(id));

    if (!f) {
        alert("找不到要複製的複方。");
        return;
    }

    formulaID.value = "";
    formulaName.value = `${f.Name} - Copy`;
    yieldQty.value = f.YieldQty || 1;
    yieldUnit.value = f.YieldUnit || "";

    componentRows.innerHTML = "";

    for (const c of f.Components || []) {
        await addComponent(c);
    }

    alert("已複製到編輯區，請確認名稱後按「儲存配方」。");
}

async function deleteFormula(id) {
    if (!(currentUser.role === "Admin" || currentUser.role === "Maintainer")) {
        alert("權限不足：只有 Admin 或 Maintainer 可以停用複方。");
        return;
    }

    const f = window.formulas?.find(x => String(x.ID) === String(id));
    const name = f ? f.Name : id;

    if (!confirm(`確定要停用複方？\n\n${id} ${name}\n\n停用後將不再出現在複方清單。`)) {
        return;
    }

    const d = await api('/api/formulas/delete', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            id,
            reqRole: currentUser.role,
            reqUser: currentUser.account
        })
    });

    alert(d.message || "複方已停用");
    clearFormula();
    loadFormulas();
}

async function setFormulaActive(id, isActive) {
    if (!(currentUser.role === "Admin" || currentUser.role === "Maintainer")) {
        alert("權限不足：只有 Admin 或 Maintainer 可以變更複方狀態。");
        return;
    }

    const actionText = isActive ? "啟用" : "停用";

    if (!confirm(`確定要${actionText}此複方？\n\n${id}`)) {
        return;
    }

    const d = await api('/api/formulas/status', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            id,
            isActive,
            reqRole: currentUser.role,
            reqUser: currentUser.account
        })
    });

    alert(d.message || `複方已${actionText}`);
    clearFormula();
    loadFormulas();
}

async function executeFormulaQR(){try{let p=JSON.parse(formulaScan.value);if(p.type!=='formula')throw new Error('不是複方 QR');const d=await api('/api/formulas/execute',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({formulaID:p.id,multiplier:Number(formulaMultiplier.value),operator:currentUser.account})});alert(d.message);formulaScan.value='';fetchStockData();loadFormulas();}catch(e){alert(e.message);}}
function exportFormula(){location.href=API_BASE+'/api/formulas/export';}async function importFormula(input){const csvData=await input.files[0].text();const d=await api('/api/formulas/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({csvData})});alert(d.message);loadFormulas();input.value='';}

const originalLogin=handleLoginScan;handleLoginScan=async function(){await originalLogin();if(currentUser.account){const u=(await api('/api/users/search?keyword='+encodeURIComponent(currentUser.account))).find(x=>x.UserID===currentUser.account);currentUser.campusID=u?.CampusID||'';currentUser.groupID=u?.GroupID||'';fetchStockData();applyRoleSecurity();}};
const originalApply=applyRoleSecurity;applyRoleSecurity=function(){originalApply();const c=orgData.campuses.find(x=>x.ID===currentUser.campusID)?.Name||currentUser.campusID||'全部院區',g=orgData.groups.find(x=>x.ID===currentUser.groupID)?.Name||currentUser.groupID||'全部組別';userInfo.innerText+=`｜${c}／${g}`;};
const originalLoadRg=loadSelectedRg;
loadSelectedRg=function(index){
    originalLoadRg(index);

    const x=selectedReagentList[index];
    if(!x)return;

    const exp = document.getElementById('rg_ExpDate');
    if (exp) exp.value = x.ExpDate || '';

    rg_CampusID.value=x.CampusID||'C001';
    refreshBusinessOrgSelects();
    rg_GroupID.value=x.GroupID||'G001';
    refreshBusinessOrgSelects();
    rg_LocationID.value=x.LocationID||'L001';
};
fetchStockData=async function(){try{const data=await api(scoped('/api/stock'));renderDashboard(data);}catch(e){console.error(e);}};

loadQRReagentNames=async function(keyword){const names=await api(scoped('/api/qr/reagent-names?keyword='+encodeURIComponent(keyword)));lstReagentName.innerHTML='';lstCATNO.innerHTML='';lstLOTNO.innerHTML='';names.forEach(n=>lstReagentName.add(new Option(n.ReagentName,n.ReagentName)));};
loadQRCATNO=async function(name){const a=await api(scoped('/api/qr/catno?reagentName='+encodeURIComponent(name)));lstCATNO.innerHTML='';lstLOTNO.innerHTML='';a.forEach(x=>lstCATNO.add(new Option(x.CATNO,x.CATNO)));};
loadQRLOTNO = async function(name, cat) {
    const a = await api(scoped('/api/qr/lotno?reagentName=' + encodeURIComponent(name) + '&catNo=' + encodeURIComponent(cat)));

    lstLOTNO.innerHTML = "";

    a.forEach(x => {
        const o = new Option(`${x.LOTNO}｜位置 ${x.LocationID}`, x.LOTNO);

        // 重要：不要用 Object.assign(o.dataset, x)
        // 改成自己明確存欄位，避免大小寫變形
        o.dataset.reagentId = x.ReagentID || x.ID || "";
        o.dataset.lotNo = x.LOTNO || "";
        o.dataset.locationId = x.LocationID || "";

        lstLOTNO.add(o);
    });
};
putBarcodeToPrintLabel = async function() {

    // =========================
    // 複方 QR
    // =========================
    if (qrSelectMode === "formula") {
        const sel = document.getElementById("lstFormulaQR");
        const formulaID = sel?.value || "";

        if (!formulaID) {
            return alert("請先選擇複方。");
        }

        const list = window.formulas || await api("/api/formulas");
        const f = list.find(x => String(x.ID) === String(formulaID));

        if (!f) {
            return alert("找不到複方資料。");
        }

        const payload = {
            v: 2,
            type: "formula",
            id: f.ID
        };

        barcodeText.value = JSON.stringify(payload);

        selectedLabel = {
            LabelType: "formula",
            ID: f.ID,
            Name: f.Name
        };

        closeModal("SelectQR");
        generateLabelPreview();
        return;
    }

    // =========================
    // 單一試劑 QR
    // =========================
    const o = lstLOTNO.selectedOptions[0];

    if (!o) {
        return alert("請選擇批號與位置");
    }

    const clean = v => String(v ?? "")
        .replace(/\u3000/g, " ")
        .trim()
        .toUpperCase();

    const reagentID = o.dataset.reagentId;
    const reagentName = lstReagentName.value;
    const catNo = lstCATNO.value;
    const lotNo = o.dataset.lotNo || o.value;

    const list = await api(scoped("/api/reagents/search"));

    let r = null;

    if (reagentID) {
        r = list.find(x => clean(x.ID) === clean(reagentID));
    }

    if (!r) {
        r = list.find(x =>
            clean(x.ReagentName) === clean(reagentName) &&
            clean(x.CATNO) === clean(catNo) &&
            clean(x.LOTNO) === clean(lotNo)
        );
    }

    if (!r) {
        r = list.find(x =>
            clean(x.CATNO) === clean(catNo) &&
            clean(x.LOTNO) === clean(lotNo)
        );
    }

    if (!r) {
        return alert("找不到試劑");
    }

  const payload = {
      v: 2,
      type: "reagent",
      id: r.ID,
      cat: r.CATNO,
      lot: r.LOTNO,
      exp: r.ExpDate || "",
      campus: r.CampusID,
      group: r.GroupID,
      location: r.LocationID
  };

    barcodeText.value = JSON.stringify(payload);
    selectedLabel = r;

    closeModal("SelectQR");
    generateLabelPreview();
};




function parseScan(raw){try{const p=JSON.parse(raw);if(p.v===2&&p.type==='reagent')return{reagentId:p.id,campusID:p.campus,groupID:p.group,locationID:p.location,catNo:p.cat,lotNo:p.lot};if(p.type==='formula')return{formula:p};}catch{}const [catNo,lotNo]=raw.split('|').map(x=>x.trim());return{catNo,lotNo,campusID:currentUser.campusID,groupID:currentUser.groupID};}
handleTransactionScan=async function(){const raw=txtReagentBarcode.value.trim();if(!raw)return;const p=parseScan(raw),txMode=document.querySelector('input[name="txMode"]:checked').value;try{
  if (p.formula) {
      if (txMode !== "OUT") {
          alert("複方 QR 僅可用於【出庫】扣庫。\n\n若要入庫或調整庫存，請至複方維護區調整配方，或針對單一試劑操作。");
          return;
      }
  
      if (!confirm(`確認執行複方出庫？\n\n複方代碼：${p.formula.id}`)) {
          return;
      }
  
      const d = await api('/api/formulas/execute', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({
              formulaID: p.formula.id,
              multiplier: 1,
              operator: currentUser.account
          })
      });
  
      alert(d.message);
      fetchStockData();
      return;
  }
  const d=await api('/api/transaction/execute',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...p,txMode,operator:currentUser.account,userRole:currentUser.role})});alert(d.message);fetchStockData();}catch(e){if(e.code==='NEED_MANUAL_QTY'){const value=prompt(e.message,'0');if(value!==null&&Number(value)>=0){try{const d=await api('/api/transaction/execute-manual',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...p,txMode,qty:Number(value),operator:currentUser.account})});alert(d.message);fetchStockData();}catch(x){alert('交易中止：'+x.message);}}}else alert('交易中止：'+e.message);}finally{txtReagentBarcode.value='';}};

function labelCaption() {
    if (!selectedLabel) return barcodeText.value;

    if (selectedLabel.LabelType === "formula") {
        return `${selectedLabel.Name}\n複方 QR\n${selectedLabel.ID}`;
    }

    const r = selectedLabel;
    const c = orgData.campuses.find(x => x.ID === r.CampusID)?.Name || r.CampusID;
    const g = orgData.groups.find(x => x.ID === r.GroupID)?.Name || r.GroupID;
    const l = orgData.locations.find(x => x.ID === r.LocationID)?.Name || r.LocationID;

    const exp = r.ExpDate ? `\nEXP ${r.ExpDate}` : "";

    return `${r.ReagentName || r.BrandName || ""} ${r.CATNO}｜LOT ${r.LOTNO}${exp}\n${c}｜${g}｜${l}`;
}

buildLabelInnerHTML = function(layoutType, qrUrl) {
    const text = labelCaption();
    const lines = String(text || "")
        .replace(/｜/g, "\n")
        .split(/\r?\n/)
        .map(x => x.trim())
        .filter(Boolean);

    const mainText = esc(lines.slice(0, 4).join("\n"));
    const smallText = esc(lines.slice(0, 4).join("\n"));

    if (layoutType === "一大") {
        return `
            <div style="grid-column:1/-1;position:relative;width:50mm;height:30mm;overflow:hidden;text-align:center;">
                <img src="${qrUrl}" style="position:absolute;left:17mm;top:1.2mm;width:16mm;height:16mm;">
                <div style="position:absolute;left:2mm;top:18.2mm;width:46mm;font-size:5.2pt;font-weight:700;line-height:1.15;white-space:pre-line;word-break:break-all;">
                    ${mainText}
                </div>
            </div>
        `;
    }

    if (layoutType === "左1右2") {
        return `
            <div style="grid-column:1/-1;position:relative;width:50mm;height:30mm;overflow:hidden;">
                <!-- 左側大標籤 -->
                <img src="${qrUrl}" style="position:absolute;left:1mm;top:2mm;width:18mm;height:18mm;">
                <div style="position:absolute;left:1mm;top:20.5mm;width:23mm;text-align:center;font-size:4.4pt;font-weight:700;line-height:1.08;white-space:pre-line;word-break:break-all;">
                    ${mainText}
                </div>

                <!-- 中間分隔線 -->
                <div style="position:absolute;left:25mm;top:1mm;height:28mm;border-left:1px dashed #bbb;"></div>

                <!-- 右上小標籤 -->
                <img src="${qrUrl}" style="position:absolute;left:27mm;top:2mm;width:8mm;height:8mm;">
                <div style="position:absolute;left:35.5mm;top:1.8mm;width:13.5mm;font-size:3.3pt;font-weight:700;line-height:1.05;white-space:pre-line;word-break:break-all;">
                    ${smallText}
                </div>

                <div style="position:absolute;left:27mm;top:14.8mm;width:21.5mm;border-top:1px dashed #bbb;"></div>

                <!-- 右下小標籤 -->
                <img src="${qrUrl}" style="position:absolute;left:27mm;top:16.5mm;width:8mm;height:8mm;">
                <div style="position:absolute;left:35.5mm;top:16.2mm;width:13.5mm;font-size:3.3pt;font-weight:700;line-height:1.05;white-space:pre-line;word-break:break-all;">
                    ${smallText}
                </div>
            </div>
        `;
    }

    if (layoutType === "左1右3") {
        return `
            <div style="grid-column:1/-1;position:relative;width:50mm;height:30mm;overflow:hidden;">
                <!-- 左側大標籤 -->
                <img src="${qrUrl}" style="position:absolute;left:1mm;top:2mm;width:17mm;height:17mm;">
                <div style="position:absolute;left:1mm;top:20mm;width:23mm;text-align:center;font-size:4.1pt;font-weight:700;line-height:1.05;white-space:pre-line;word-break:break-all;">
                    ${mainText}
                </div>

                <!-- 中間分隔線 -->
                <div style="position:absolute;left:25mm;top:1mm;height:28mm;border-left:1px dashed #bbb;"></div>

                <!-- 右側三小標籤 -->
                ${[0, 1, 2].map(i => {
                    const top = 1.5 + i * 9.2;
                    const lineTop = top + 8.7;
                    return `
                        <img src="${qrUrl}" style="position:absolute;left:27mm;top:${top}mm;width:6.8mm;height:6.8mm;">
                        <div style="position:absolute;left:34.2mm;top:${top - 0.2}mm;width:14.5mm;font-size:2.85pt;font-weight:700;line-height:0.98;white-space:pre-line;word-break:break-all;">
                            ${smallText}
                        </div>
                        ${i < 2 ? `<div style="position:absolute;left:27mm;top:${lineTop}mm;width:21.5mm;border-top:1px dashed #bbb;"></div>` : ""}
                    `;
                }).join("")}
            </div>
        `;
    }

    return "";
};
