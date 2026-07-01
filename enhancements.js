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
  unitBlock?.insertAdjacentHTML('afterend', `<div class="grid grid-cols-1 gap-2 border-t pt-2"><label class="font-bold">院區</label><select id="rg_CampusID" class="border p-2 rounded"></select><label class="font-bold">組別</label><select id="rg_GroupID" class="border p-2 rounded"></select><label class="font-bold">擺放位置</label><select id="rg_LocationID" class="border p-2 rounded"></select></div>`);
  document.getElementById('usr_UserRole')?.parentElement?.insertAdjacentHTML('afterend', `<div><label class="block font-bold text-slate-600">院區</label><select id="usr_CampusID" class="w-full border p-2 rounded"></select></div><div><label class="block font-bold text-slate-600">組別</label><select id="usr_GroupID" class="w-full border p-2 rounded"></select></div>`);
  loadOrg().catch(console.error);
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
  <div id="componentRows" class="space-y-2"></div><div class="flex gap-2"><button onclick="saveFormula()" class="bg-blue-600 text-white px-4 py-2 rounded">儲存配方</button><button onclick="clearFormula()" class="bg-slate-200 px-4 py-2 rounded">清空</button></div>
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

function reagentOptions(){return (window.advancedReagents||[]).map(r=>`<option value="${r.ID}" data-unit="${esc(r.BaseUnit||r.Unit)}">${esc(r.ReagentName)}｜${esc(r.CATNO)}｜${esc(r.LOTNO)}｜${esc(r.LocationID)} (${r.CurrentStock} ${esc(r.BaseUnit||r.Unit)})</option>`).join('');}
async function addComponent(c={}){if(document.querySelectorAll('.component-row').length>=20)return alert('最多 20 種成分');if(!window.advancedReagents)window.advancedReagents=await api('/api/reagents/search');componentRows.insertAdjacentHTML('beforeend',`<div class="component-row grid grid-cols-[1fr_100px_100px_40px] gap-2"><select class="c-r border p-2">${reagentOptions()}</select><input class="c-q border p-2" type="number" min="0" step="0.001" value="${c.Qty||''}" placeholder="量"><input class="c-u border p-2" value="${esc(c.Unit||'')}" placeholder="單位"><button onclick="this.parentElement.remove()" class="text-red-600">✕</button></div>`);const row=componentRows.lastElementChild;if(c.ReagentID)row.querySelector('.c-r').value=c.ReagentID;if(!c.Unit){const o=row.querySelector('.c-r').selectedOptions[0];row.querySelector('.c-u').value=o?.dataset.unit||'';}row.querySelector('.c-r').onchange=e=>row.querySelector('.c-u').value=e.target.selectedOptions[0]?.dataset.unit||'';}
function clearFormula(){formulaID.value='';formulaName.value='';yieldQty.value=1;yieldUnit.value='';componentRows.innerHTML='';addComponent();}
async function saveFormula(){const Components=[...document.querySelectorAll('.component-row')].map(r=>({ReagentID:r.querySelector('.c-r').value,Qty:Number(r.querySelector('.c-q').value),Unit:r.querySelector('.c-u').value}));const b={ID:formulaID.value,Name:formulaName.value,YieldQty:Number(yieldQty.value),YieldUnit:yieldUnit.value,Components};await api('/api/formulas/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});clearFormula();loadFormulas();}
async function loadFormulas(){const list=await api('/api/formulas');window.formulas=list;formulaList.innerHTML=`<table class="w-full text-sm"><thead><tr class="bg-slate-700 text-white"><th class="p-2">配方</th><th>成分數</th><th>QR 內容</th><th>操作</th></tr></thead><tbody>${list.map(f=>`<tr class="border-b"><td class="p-2">${esc(f.ID)} ${esc(f.Name)}</td><td>${f.Components.length}</td><td class="font-mono text-xs">${esc(JSON.stringify({v:2,type:'formula',id:f.ID}))}</td><td><button class="text-blue-700" onclick="editFormula('${f.ID}')">編輯</button>｜<button class="text-rose-700" onclick="formulaScan.value='${esc(JSON.stringify({v:2,type:'formula',id:f.ID}))}';executeFormulaQR()">配製</button></td></tr>`).join('')}</tbody></table>`;}
async function editFormula(id){const f=window.formulas.find(x=>x.ID===id);formulaID.value=f.ID;formulaName.value=f.Name;yieldQty.value=f.YieldQty;yieldUnit.value=f.YieldUnit;componentRows.innerHTML='';for(const c of f.Components)await addComponent(c);}
async function executeFormulaQR(){try{let p=JSON.parse(formulaScan.value);if(p.type!=='formula')throw new Error('不是複方 QR');const d=await api('/api/formulas/execute',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({formulaID:p.id,multiplier:Number(formulaMultiplier.value),operator:currentUser.account})});alert(d.message);formulaScan.value='';fetchStockData();loadFormulas();}catch(e){alert(e.message);}}
function exportFormula(){location.href=API_BASE+'/api/formulas/export';}async function importFormula(input){const csvData=await input.files[0].text();const d=await api('/api/formulas/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({csvData})});alert(d.message);loadFormulas();input.value='';}

const originalLogin=handleLoginScan;handleLoginScan=async function(){await originalLogin();if(currentUser.account){const u=(await api('/api/users/search?keyword='+encodeURIComponent(currentUser.account))).find(x=>x.UserID===currentUser.account);currentUser.campusID=u?.CampusID||'';currentUser.groupID=u?.GroupID||'';fetchStockData();applyRoleSecurity();}};
const originalApply=applyRoleSecurity;applyRoleSecurity=function(){originalApply();const c=orgData.campuses.find(x=>x.ID===currentUser.campusID)?.Name||currentUser.campusID||'全部院區',g=orgData.groups.find(x=>x.ID===currentUser.groupID)?.Name||currentUser.groupID||'全部組別';userInfo.innerText+=`｜${c}／${g}`;};
const originalLoadRg=loadSelectedRg;loadSelectedRg=function(index){originalLoadRg(index);const x=selectedReagentList[index];if(!x)return;rg_CampusID.value=x.CampusID||'C001';refreshBusinessOrgSelects();rg_GroupID.value=x.GroupID||'G001';refreshBusinessOrgSelects();rg_LocationID.value=x.LocationID||'L001';};
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

    const list = await api(scoped('/api/reagents/search'));

    let r = null;

    // 1. 先用 ID 找
    if (reagentID) {
        r = list.find(x => clean(x.ID) === clean(reagentID));
    }

    // 2. 再用 名稱 + CATNO + LOTNO 找
    if (!r) {
        r = list.find(x =>
            clean(x.ReagentName) === clean(reagentName) &&
            clean(x.CATNO) === clean(catNo) &&
            clean(x.LOTNO) === clean(lotNo)
        );
    }

    // 3. 再放寬：只用 CATNO + LOTNO 找
    if (!r) {
        r = list.find(x =>
            clean(x.CATNO) === clean(catNo) &&
            clean(x.LOTNO) === clean(lotNo)
        );
    }

    if (!r) {
        console.log("找不到試劑，比對資訊：", {
            reagentID,
            reagentName,
            catNo,
            lotNo,
            list
        });

        return alert(
            "找不到試劑\n\n" +
            "目前選擇：\n" +
            "品名：" + reagentName + "\n" +
            "CATNO：" + catNo + "\n" +
            "LOTNO：" + lotNo + "\n\n" +
            "請按 F12 查看 Console 比對資訊。"
        );
    }

    const payload = {
        v: 2,
        type: "reagent",
        id: r.ID,
        cat: r.CATNO,
        lot: r.LOTNO,
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
handleTransactionScan=async function(){const raw=txtReagentBarcode.value.trim();if(!raw)return;const p=parseScan(raw),txMode=document.querySelector('input[name="txMode"]:checked').value;try{if(p.formula){formulaScan.value=raw;openAdvanced();return;}const d=await api('/api/transaction/execute',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...p,txMode,operator:currentUser.account,userRole:currentUser.role})});alert(d.message);fetchStockData();}catch(e){if(e.code==='NEED_MANUAL_QTY'){const value=prompt(e.message,'0');if(value!==null&&Number(value)>=0){try{const d=await api('/api/transaction/execute-manual',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...p,txMode,qty:Number(value),operator:currentUser.account})});alert(d.message);fetchStockData();}catch(x){alert('交易中止：'+x.message);}}}else alert('交易中止：'+e.message);}finally{txtReagentBarcode.value='';}};

function labelCaption(){if(!selectedLabel)return barcodeText.value;const r=selectedLabel,c=orgData.campuses.find(x=>x.ID===r.CampusID)?.Name||r.CampusID,g=orgData.groups.find(x=>x.ID===r.GroupID)?.Name||r.GroupID,l=orgData.locations.find(x=>x.ID===r.LocationID)?.Name||r.LocationID;return `${r.BrandName||''} ${r.CATNO}｜LOT ${r.LOTNO}\n${c}｜${g}｜${l}`;}
buildLabelInnerHTML = function(layoutType, qrUrl) {
    const text = labelCaption();
    const lines = String(text || "")
        .replace(/｜/g, "\n")
        .split(/\r?\n/)
        .map(x => x.trim())
        .filter(Boolean);

    const mainText = esc(lines.slice(0, 4).join("\n"));
    const smallText = esc(lines.slice(0, 4).join("\n"));

    const bigBlock = `
        <div style="
            width:24mm;
            height:28mm;
            display:flex;
            flex-direction:column;
            align-items:center;
            justify-content:flex-start;
            overflow:hidden;
            text-align:center;
        ">
            <img src="${qrUrl}" style="width:19mm;height:19mm;margin-top:1mm;">
            <div style="
                width:23mm;
                font-size:4.6pt;
                font-weight:700;
                line-height:1.05;
                white-space:pre-line;
                word-break:break-all;
                margin-top:0.6mm;
                overflow:hidden;
            ">${mainText}</div>
        </div>
    `;

    const smallBlock = `
        <div style="
            width:21mm;
            height:13.5mm;
            display:grid;
            grid-template-columns:7.5mm 13mm;
            column-gap:0.5mm;
            align-items:center;
            overflow:hidden;
            box-sizing:border-box;
        ">
            <img src="${qrUrl}" style="width:7.5mm;height:7.5mm;">
            <div style="
                font-size:3.4pt;
                font-weight:700;
                line-height:1.0;
                white-space:pre-line;
                word-break:break-all;
                text-align:left;
                overflow:hidden;
            ">${smallText}</div>
        </div>
    `;

    if (layoutType === "一大") {
        return `
            <div style="
                width:50mm;
                height:30mm;
                display:flex;
                flex-direction:column;
                align-items:center;
                justify-content:flex-start;
                overflow:hidden;
                text-align:center;
            ">
                <img src="${qrUrl}" style="width:18mm;height:18mm;margin-top:1mm;">
                <div style="
                    width:46mm;
                    font-size:5.2pt;
                    font-weight:700;
                    line-height:1.15;
                    white-space:pre-line;
                    word-break:break-all;
                    margin-top:0.8mm;
                    overflow:hidden;
                ">${mainText}</div>
            </div>
        `;
    }

    if (layoutType === "左1右2") {
        return `
            <div style="
                width:50mm;
                height:30mm;
                display:grid;
                grid-template-columns:25mm 22mm;
                column-gap:2mm;
                padding:0.5mm 0.5mm;
                box-sizing:border-box;
                overflow:hidden;
            ">
                ${bigBlock}

                <div style="
                    width:22mm;
                    height:28mm;
                    display:grid;
                    grid-template-rows:13.5mm 1mm 13.5mm;
                    overflow:hidden;
                ">
                    ${smallBlock}
                    <div style="border-top:1px dashed #bbb;width:100%;"></div>
                    ${smallBlock}
                </div>
            </div>
        `;
    }

    if (layoutType === "左1右3") {
        const tinyBlock = `
            <div style="
                width:21mm;
                height:8.8mm;
                display:grid;
                grid-template-columns:6.2mm 14mm;
                column-gap:0.5mm;
                align-items:center;
                overflow:hidden;
                box-sizing:border-box;
            ">
                <img src="${qrUrl}" style="width:6.2mm;height:6.2mm;">
                <div style="
                    font-size:2.9pt;
                    font-weight:700;
                    line-height:0.95;
                    white-space:pre-line;
                    word-break:break-all;
                    text-align:left;
                    overflow:hidden;
                ">${smallText}</div>
            </div>
        `;

        return `
            <div style="
                width:50mm;
                height:30mm;
                display:grid;
                grid-template-columns:25mm 22mm;
                column-gap:2mm;
                padding:0.5mm 0.5mm;
                box-sizing:border-box;
                overflow:hidden;
            ">
                ${bigBlock}

                <div style="
                    width:22mm;
                    height:28mm;
                    display:grid;
                    grid-template-rows:8.8mm 0.8mm 8.8mm 0.8mm 8.8mm;
                    overflow:hidden;
                ">
                    ${tinyBlock}
                    <div style="border-top:1px dashed #bbb;width:100%;"></div>
                    ${tinyBlock}
                    <div style="border-top:1px dashed #bbb;width:100%;"></div>
                    ${tinyBlock}
                </div>
            </div>
        `;
    }

    return "";
};