// ==MASS-reagent-system-main/app.js===============================================
// ====================================================================
// 1. 全域系統狀態配置管理庫
// ====================================================================
const API_BASE = window.REAGENT_API_BASE || (
    location.protocol === 'file:' || ['localhost', '127.0.0.1'].includes(location.hostname)
        ? 'http://localhost:39280'
        : 'https://reagent-api-1cqo.onrender.com'
);

let currentUser = { account: "", name: "", role: "", loginTime: "" };
let lastActionTime = Date.now();
const AUTO_LOGOUT_MIN = 20; 

let rgCurrentEditMode = "UPDATE";
let usrCurrentEditMode = "UPDATE";
let selectedReagentList = [];
let currentPrintLabelMeta = {
    title: "",
    subtitle: ""
};

// 手機相機全域變數
let html5QrScanner = null;
let currentScannerTarget = null;

// ====================================================================
// 2. 系統初始載入與硬體條碼槍掛載事件
// ====================================================================
window.onload = function() {
    initSystem();
};

function initSystem() {
    fetchStockData();
    
    document.getElementById("txtUserBarcode").addEventListener("keydown", function(e) {
        if (e.key === "Enter" || e.keyCode === 13) {
            e.preventDefault(); 
            handleLoginScan();
        }
    });
    document.getElementById("txtReagentBarcode").addEventListener("keydown", function(e) {
        if (e.key === "Enter") handleTransactionScan();
    });

    document.getElementById("cmbSearchName").addEventListener("input", function(e) {
        loadQRReagentNames(e.target.value);
    });
    document.getElementById("lstReagentName").addEventListener("change", function(e) {
        loadQRCATNO(e.target.value);
    });
    document.getElementById("lstCATNO").addEventListener("change", function(e) {
        loadQRLOTNO(document.getElementById("lstReagentName").value, e.target.value);
    });
    document.getElementById("lstLOTNO").addEventListener("dblclick", function() {
        putBarcodeToPrintLabel();
    });

    window.addEventListener("mousemove", refreshActionTime);
    window.addEventListener("keydown", refreshActionTime);
    setInterval(checkSessionTimeout, 60000); 
}

function refreshActionTime() {
    lastActionTime = Date.now();
}

function checkSessionTimeout() {
    if (!currentUser.account) return;
    const minutesPassed = (Date.now() - lastActionTime) / 1000 / 60;
    if (minutesPassed >= AUTO_LOGOUT_MIN) {
        logout(true); 
    }
}

function logout(isForce = false) {
    currentUser = { account: "", name: "", role: "", loginTime: "" };
    if (isForce) {
        alert(`系統已超過 ${AUTO_LOGOUT_MIN} 分鐘未進行任何操作，安全防護模組已自動將該帳號登出。`);
    } else {
        if (!confirm("確定要登出本系統嗎？")) return;
        alert("已成功登出系統！");
    }
    window.location.reload(); 
}

// ====================================================================
// 3. 視窗控制核心與安全角色控管
// ====================================================================
function openModal(id) {
    refreshActionTime();
    if (id !== 'Login' && id !== 'SelectQR' && id !== 'LabelPreview' && (!currentUser || !currentUser.account)) {
        openModal('Login');
        return;
    }
    const modal = document.getElementById(`modal_${id}`);
    if (modal) {
        modal.classList.remove("hidden");

        if (id === "Login") {
            document.getElementById("txtUserBarcode").value = "";
            if (!/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) {
                document.getElementById("txtUserBarcode").focus();
            }
        }
        if (id === "Tx") {
            document.getElementById("txtReagentBarcode").value = "";
            if (!/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) {
                document.getElementById("txtReagentBarcode").focus();
            }
        }
        if (id === "SelectQR") {
			if (typeof setQRSelectMode === "function") setQRSelectMode("reagent");
			loadQRReagentNames("");
		}
        if (id === "RgStandard") { initRgForm(); searchReagentsList(); }
        if (id === "UserSD") { initUserForm(); searchUsersList(); }
        
        if (id === "Report") {
            const today = new Date().toISOString().split('T')[0];
            document.getElementById("rpt_StartDate").value = today;
            document.getElementById("rpt_EndDate").value = today;
            document.getElementById("reportTableBody").innerHTML = `<tr><td colspan="7" class="p-8 text-slate-400 font-medium">請選擇上方日期區段並點選產生報表...</td></tr>`;
        }
    }
}

function closeModal(id) {
    if ((id === 'Login' || id === 'Tx') && html5QrScanner && html5QrScanner.isScanning) {
        const viewId = id === 'Login' ? 'login-scanner-view' : 'tx-scanner-view';
        html5QrScanner.stop().then(() => {
            document.getElementById(viewId).style.display = "none";
        });
    }
    const modal = document.getElementById(`modal_${id}`);
    if (modal) modal.classList.add("hidden");
}

function applyRoleSecurity() {
    document.getElementById("userInfo").className = "text-sm bg-[#d9eaf7] text-slate-800 p-2 rounded-md font-bold shadow-inner";
    document.getElementById("userInfo").innerText = `登入者：${currentUser.name}（${currentUser.role}） 登入時間：${currentUser.loginTime}`;
    document.getElementById("btn_Logout").classList.remove("hidden");
    
    if (currentUser.role === "Admin" || currentUser.role === "Maintainer") {
        document.getElementById("lblOptAdjust").classList.remove("hidden"); 
    } else {
        document.getElementById("lblOptAdjust").classList.add("hidden");
    }

	if (currentUser.role === "Admin") {
		document.getElementById("lblOptRgImpExp").classList.remove("hidden");
		document.getElementById("rgAdminPanel").classList.remove("hidden");
		document.getElementById("lblOptUserNew").classList.remove("hidden");
		document.getElementById("lblOptUserDel").classList.remove("hidden");
		document.getElementById("btn_togglePassword").classList.remove("hidden");
		document.getElementById("userAdminPanel").classList.remove("hidden");
	} else {
		document.getElementById("lblOptRgImpExp").classList.add("hidden");
		document.getElementById("rgAdminPanel").classList.add("hidden");
		document.getElementById("lblOptUserNew").classList.add("hidden");
		document.getElementById("lblOptUserDel").classList.add("hidden");
		document.getElementById("btn_togglePassword").classList.add("hidden");
		document.getElementById("userAdminPanel").classList.add("hidden");
	}
}

// ====================================================================
// 4. 儀表板全自動化數據更新模組 (行內樣式強制加固版)
// ====================================================================
async function fetchStockData() {
    refreshActionTime();
    try {
        const response = await fetch(`${API_BASE}/api/stock`);
        if (!response.ok) throw new Error("向伺服器調閱庫存資料時發生異常");
        const data = await response.json();
        renderDashboard(data);
    } catch (error) {
        console.error("Dashboard數據載入失敗:", error);
    }
}

function renderDashboard(data) {
    const stockTableBody = document.getElementById("stockTableBody");
    const warnTableBody = document.getElementById("warnTableBody");

    stockTableBody.innerHTML = "";
    warnTableBody.innerHTML = "";

    let totalReagent = Array.isArray(data) ? data.length : 0;
    let lowCount = 0;
    let normalCount = 0;

    data.forEach(item => {
        const totalStock = Number(item.TotalStock ?? item.CurrentStock ?? 0);
        const alertQty = Number(item.AlertQty ?? 0);

        // ✅ 前端重新判斷，不完全依賴後端 IsLow
        const isLow = alertQty > 0 && totalStock <= alertQty;

        if (isLow) {
            lowCount++;
        } else {
            normalCount++;
        }

        const tr = document.createElement("tr");
        tr.className = `border-b text-center ${isLow ? "low-stock" : "normal-stock"}`;

        tr.innerHTML = `
            <td class="p-3 text-left font-semibold">${item.ReagentName || ""}</td>
            <td class="p-3 font-mono font-bold">${totalStock}</td>
            <td class="p-3 font-mono font-bold">${alertQty}</td>
            <td class="p-3">${item.Unit || ""}</td>
            <td class="p-3 font-bold">${isLow ? "⚠️ 低庫存" : "🟢 正常"}</td>
        `;

        stockTableBody.appendChild(tr);

        if (isLow) {
            const trWarn = document.createElement("tr");
            trWarn.className = "border-b low-stock text-center font-semibold";

            trWarn.innerHTML = `
                <td class="p-3 text-left">${item.ReagentName || ""}</td>
                <td class="p-3 font-mono">${totalStock}</td>
                <td class="p-3 font-mono">${alertQty}</td>
                <td class="p-3">${item.Unit || ""}</td>
            `;

            warnTableBody.appendChild(trWarn);
        }
    });

    if (lowCount === 0) {
        warnTableBody.innerHTML = `
            <tr>
                <td colspan="4" class="p-5 text-center bg-emerald-50 text-emerald-800 font-bold border border-emerald-200">
                    目前臨床無任何低庫存試劑
                </td>
            </tr>
        `;
    }

    document.getElementById("kpi_total").innerText = totalReagent;
    document.getElementById("kpi_normal").innerText = normalCount;
    document.getElementById("kpi_low").innerText = lowCount;
}


// ====================================================================
// 5. 條碼槍 / 相機登入驗證模組
// ====================================================================
async function handleLoginScan() {
    const barcodeInput = document.getElementById("txtUserBarcode").value.trim();
    if (!barcodeInput) return;
    
    const errMsgDiv = document.getElementById("loginErrMsg");
    errMsgDiv.classList.add("hidden");

    try {
        const response = await fetch(`${API_BASE}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ barcode: barcodeInput })
        });
        const result = await response.json();

        if (response.ok) {
            currentUser = {
                account: result.UserID,
                name: result.UserName,
                role: result.UserRole,
                loginTime: new Date().toLocaleString()
            };
            
            document.getElementById("modal_Login").classList.add("hidden");
            applyRoleSecurity();
            fetchStockData();
        } else {
            errMsgDiv.innerText = result.error || "條碼驗證失敗";
            errMsgDiv.classList.remove("hidden");
            document.getElementById("txtUserBarcode").value = "";
            document.getElementById("txtUserBarcode").focus();
        }
    } catch (err) {
        alert("資料庫通訊線路中斷：" + err.message);
    }
}

// ====================================================================
// 6. 階層下拉關聯選單模組
// ====================================================================
async function loadQRReagentNames(keyword) {
    const res = await fetch(`${API_BASE}/api/qr/reagent-names?keyword=${encodeURIComponent(keyword)}`);
    const names = await res.json();
    const select = document.getElementById("lstReagentName");
    select.innerHTML = "";
    document.getElementById("lstCATNO").innerHTML = "";
    document.getElementById("lstLOTNO").innerHTML = "";
    names.forEach(n => select.options.add(new Option(n.ReagentName, n.ReagentName)));
}

async function loadQRCATNO(reagentName) {
    const res = await fetch(`${API_BASE}/api/qr/catno?reagentName=${encodeURIComponent(reagentName)}`);
    const catnos = await res.json();
    const select = document.getElementById("lstCATNO");
    select.innerHTML = "";
    document.getElementById("lstLOTNO").innerHTML = "";
    catnos.forEach(c => select.options.add(new Option(c.CATNO, c.CATNO)));
}

async function loadQRLOTNO(reagentName, catNo) {
    const res = await fetch(`${API_BASE}/api/qr/lotno?reagentName=${encodeURIComponent(reagentName)}&catNo=${encodeURIComponent(catNo)}`);
    const lotnos = await res.json();
    const select = document.getElementById("lstLOTNO");
    select.innerHTML = "";
    lotnos.forEach(l => select.options.add(new Option(l.LOTNO, l.LOTNO)));
}

function putBarcodeToPrintLabel() {
    const rName = document.getElementById("lstReagentName").value;
    const catNo = document.getElementById("lstCATNO").value;

    const lotSelect = document.getElementById("lstLOTNO");
    const lotRaw = lotSelect.value || "";
    const lotNo = lotRaw.split("|")[0].trim();

    if (!rName || !catNo || !lotNo) {
        alert("防呆機制提示：請確認已完整選取試劑名稱、CATNO 與 LOTNO！");
        return;
    }

    const barcodeText = `${catNo}|${lotNo}`;
    document.getElementById("barcodeText").value = barcodeText;

    currentPrintLabelMeta = {
        title: rName,
        subtitle: `CATNO: ${catNo}  LOTNO: ${lotNo}`
    };

    closeModal("SelectQR");

    if (confirm(`已成功擷取該品項規格資原始碼：\n${barcodeText}\n\n是否立即執行條碼機畫布出圖與精密排版？`)) {
        generateLabelPreview();
    }
}

// ====================================================================
// 7. 臨床交易出入庫掃描模組
// ====================================================================
async function handleTransactionScan() {
    const barcodeInput = document.getElementById("txtReagentBarcode").value.trim();
    if (!barcodeInput) return;

    if (!currentUser || !currentUser.account) {
        alert("資安鎖定：系統偵測到您的操作身分已丟失，請重新掃描識別證！");
        document.getElementById("txtReagentBarcode").value = "";
        openModal("Login");
        return;
    }

    if (!barcodeInput.includes("|")) {
        alert("規格編碼解析失效：條碼內文缺少必要之 [ | ] 分隔標誌，無法拆解 CATNO 與 LOTNO！");
        document.getElementById("txtReagentBarcode").value = "";
        return;
    }

    const [catNo, lotNo] = barcodeInput.split("|").map(s => s.trim());
    const txMode = document.querySelector('input[name="txMode"]:checked').value;

    try {
        const response = await fetch(`${API_BASE}/api/transaction/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                catNo, lotNo, txMode,
                operator: currentUser.account,
                userRole: currentUser.role
            })
        });
        const result = await response.json();

        if (response.ok) {
            alert(result.message);
            fetchStockData(); 
        } else {
            if (result.code === "NEED_MANUAL_QTY") {
                const manualQty = prompt(result.error, "0");
                if (manualQty !== null && parseInt(manualQty) > 0) {
                    executeManualTx(catNo, lotNo, txMode, parseInt(manualQty));
                }
            } else {
                alert("交易中止：" + result.error);
            }
        }
    } catch (err) {
        alert("連線通訊線路異常：" + err.message);
    }
    finally { 
        document.getElementById("txtReagentBarcode").value = "";
        document.getElementById("txtReagentBarcode").focus();
    }
}

async function executeManualTx(catNo, lotNo, txMode, qty) {
    try {
        const response = await fetch(`${API_BASE}/api/transaction/execute-manual`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ catNo, lotNo, txMode, qty, operator: currentUser.account })
        });
        const result = await response.json();
        alert(result.message || result.error);
        fetchStockData();
    } catch (e) {
        alert("手動異動執行失敗");
    }
}

// ====================================================================
// 8. 試劑規格主檔基本資料 CRUD 控制模組 (全功能完全體・防禦加固版)
// ====================================================================

function initRgForm() {
    const unitSel = document.getElementById("rg_Unit");
    if (unitSel && unitSel.options.length === 0) {
        unitSel.innerHTML = "";
        unitSel.options.add(new Option("ml (毫升)", "ml"));
        unitSel.options.add(new Option("ul (微升)", "ul"));
        unitSel.options.add(new Option("tube (管)", "tube"));
        unitSel.options.add(new Option("kit (盒/組)", "kit"));
        unitSel.options.add(new Option("bottle (瓶)", "bottle"));
        unitSel.options.add(new Option("test (測試人份)", "test"));
    }
    // 預設將編輯模式切回第一個「修改現有檔」
    const defaultRadio = document.querySelector('input[name="rgEditMode"][value="UPDATE"]');
    if (defaultRadio) defaultRadio.checked = true;
    setRgFormMode("UPDATE");
}

function setRgFormMode(mode) {
    rgCurrentEditMode = mode;
    
    // 取得表單元件控制鎖
    const txtId = document.getElementById("rg_ID");
    const txtName = document.getElementById("rg_ReagentName");
    const txtBrand = document.getElementById("rg_BrandName");
    const txtCat = document.getElementById("rg_CATNO");
    const txtLot = document.getElementById("rg_LOTNO");
    const txtStock = document.getElementById("rg_CurrentStock");
    const txtAlert = document.getElementById("rg_AlertQty");
    const cmbUnit = document.getElementById("rg_Unit");
    const chkActive = document.getElementById("rg_IsActive");
    const btnSave = document.getElementById("btn_rgSave");

    if (!btnSave) return; // 安全閥門

    // 依據不同維護情境進行表單輸入控制鎖(鎖定或解鎖核心欄位)
    if (mode === "UPDATE") {
        btnSave.innerText = "儲存現有檔權限變更";
        if(txtId) txtId.disabled = true;
        if(txtName) txtName.disabled = false;
        if(txtBrand) txtBrand.disabled = false;
        if(txtCat) txtCat.disabled = true;  // 修改主檔時，CATNO與LOTNO做為聯合主鍵通常不允許隨意塗改
        if(txtLot) txtLot.disabled = true;
        if(txtStock) txtStock.disabled = false;
        if(txtAlert) txtAlert.disabled = false;
        if(cmbUnit) cmbUnit.disabled = false;
        if(chkActive) chkActive.disabled = false;
    } 
    else if (mode === "NEWLOT") {
        btnSave.innerText = "確認追加此品項新批號";
        if(txtId) txtId.value = "";
        if(txtCat) txtCat.disabled = false;
        if(txtLot) txtLot.disabled = false;
        if(txtStock) txtStock.value = "0";
        if(chkActive) chkActive.checked = true;
    } 
    else if (mode === "NEWCATNO") {
        btnSave.innerText = "確認追加廠牌全新規格";
        if(txtId) txtId.value = "";
        if(txtCat) txtCat.disabled = false;
        if(txtLot) txtLot.disabled = false;
        if(txtStock) txtStock.value = "0";
        if(chkActive) chkActive.checked = true;
    } 
    else if (mode === "NEW") {
        btnSave.innerText = "確認全新試劑建檔";
        clearRgFields();
        if(txtCat) txtCat.disabled = false;
        if(txtLot) txtLot.disabled = false;
    }
}

function clearRgFields() {
    const ids = ["rg_ID", "rg_ReagentName", "rg_BrandName", "rg_CATNO", "rg_LOTNO", "rg_FixInQty", "rg_FixOutQty", "rg_CurrentStock", "rg_AlertQty"];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = (id.includes("Qty") || id.includes("Stock")) ? "0" : "";
    });
    const chkActive = document.getElementById("rg_IsActive");
    if (chkActive) chkActive.checked = true;
}

// 🌟 核心失蹤復活：負責將後端資料庫撈出，並依據 IsActive 標記綠燈/紅燈的關鍵渲染引擎
async function searchReagentsList() {
    const tbody = document.getElementById("rgMasterTableBody");
    if (!tbody) {
        alert("找不到 rgMasterTableBody，請確認 index.html 是否有主檔表格 tbody。");
        return;
    }

    tbody.innerHTML = `
        <tr>
            <td colspan="6" class="p-4 text-center text-slate-400">
                主檔資料載入中...
            </td>
        </tr>
    `;

    try {
        const kwEl = document.getElementById("txtRgKeyword");
        const kw = kwEl ? kwEl.value.trim() : "";

        const res = await fetch(`${API_BASE}/api/reagents/search?keyword=${encodeURIComponent(kw)}`);
        if (!res.ok) throw new Error(`/api/reagents/search 連線失敗，HTTP ${res.status}`);

        const data = await res.json();

        if (!Array.isArray(data)) {
            throw new Error("後端回傳格式不是陣列，請檢查 /api/reagents/search");
        }

        selectedReagentList = data;
        tbody.innerHTML = "";

        if (data.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="p-4 text-center text-rose-600 font-bold bg-rose-50">
                        查無任何試劑主檔資料
                    </td>
                </tr>
            `;
            return;
        }

        data.forEach((item, index) => {
            const tr = document.createElement("tr");
            tr.className = "border-b hover:bg-slate-200 text-center cursor-pointer transition";
            tr.onclick = () => loadSelectedRg(index);

            const isActive = item.IsActive !== false;
            const statusIcon = isActive ? "🟢" : "🔴";

            tr.innerHTML = `
                <td class="p-2.5 text-left font-semibold">${statusIcon} ${item.ReagentName || ""}</td>
                <td class="p-2.5 font-mono">${item.CATNO || ""}</td>
                <td class="p-2.5 font-mono">${item.LOTNO || ""}</td>
                <td class="p-2.5 font-mono font-bold">${item.CurrentStock ?? 0}</td>
                <td class="p-2.5">${item.BrandName || ""}</td>
                <td class="p-2.5">${item.Unit || ""}</td>
            `;

            tbody.appendChild(tr);
        });

    } catch (err) {
        console.error("searchReagentsList 錯誤：", err);
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="p-4 text-center text-rose-700 font-bold bg-rose-50">
                    主檔資料載入失敗：${err.message}
                </td>
            </tr>
        `;
    }
}

function loadSelectedRg(index) {

    const item = selectedReagentList[index];

    if (!item) return;

    document.getElementById("rg_ID").value = item.ID ?? "";
    document.getElementById("rg_ReagentName").value = item.ReagentName || "";
    document.getElementById("rg_BrandName").value = item.BrandName || "";
    document.getElementById("rg_CATNO").value = item.CATNO || "";
    document.getElementById("rg_LOTNO").value = item.LOTNO || "";
    document.getElementById("rg_FixInQty").value = item.FixInQty || 0;
    document.getElementById("rg_FixOutQty").value = item.FixOutQty || 0;
    document.getElementById("rg_CurrentStock").value = item.CurrentStock || 0;
    document.getElementById("rg_AlertQty").value = item.AlertQty || 0;

	const unitObj = document.getElementById("rg_Unit");
	if (unitObj) {
	    const u = String(item.Unit || item.BaseUnit || "ml").toLowerCase();
	    unitObj.value = u;
	}

    // 效期帶回
    const expObj = document.getElementById("rg_ExpDate");
    if (expObj) {
        expObj.value = item.ExpDate || "";
    }

    // 院區 / 組別 / 位置帶回
    const campusObj = document.getElementById("rg_CampusID");
    const groupObj = document.getElementById("rg_GroupID");
    const locationObj = document.getElementById("rg_LocationID");

    if (campusObj) campusObj.value = item.CampusID || "C001";

    if (typeof refreshBusinessOrgSelects === "function") {
        refreshBusinessOrgSelects();
    }

    if (groupObj) groupObj.value = item.GroupID || "G001";

    if (typeof refreshBusinessOrgSelects === "function") {
        refreshBusinessOrgSelects();
    }

    if (locationObj) locationObj.value = item.LocationID || "L001";

    const chk = document.getElementById("rg_IsActive");
    if (chk) {
        chk.checked = item.IsActive !== false;
    }

    const updateRadio =
        document.querySelector('input[name="rgEditMode"][value="UPDATE"]');

    if (updateRadio) {
        updateRadio.checked = true;
    }

    setRgFormMode("UPDATE");
}

async function saveReagentMaster() {
    try {
        const isActiveEl = document.getElementById("rg_IsActive");
        const currentIsActive = isActiveEl ? isActiveEl.checked : true;

        const payload = {
            id: document.getElementById("rg_ID").value,
            reagentName: document.getElementById("rg_ReagentName").value.trim(),
            brandName: document.getElementById("rg_BrandName").value.trim(),
            catNo: document.getElementById("rg_CATNO").value.trim(),
            lotNo: document.getElementById("rg_LOTNO").value.trim(),
            fixInQty: parseFloat(document.getElementById("rg_FixInQty").value) || 0,
            fixOutQty: parseFloat(document.getElementById("rg_FixOutQty").value) || 0,
            currentStock: parseFloat(document.getElementById("rg_CurrentStock").value) || 0,
            alertQty: parseFloat(document.getElementById("rg_AlertQty").value) || 0,
            unit: document.getElementById("rg_Unit").value,
			baseUnit: document.getElementById("rg_Unit").value,
            campusID: document.getElementById("rg_CampusID")?.value || "C001",
            groupID: document.getElementById("rg_GroupID")?.value || "G001",
            locationID: document.getElementById("rg_LocationID")?.value || "L001",
			expDate: document.getElementById("rg_ExpDate")?.value || "",
            isActive: currentIsActive, 
            editMode: rgCurrentEditMode
        };

        if (!payload.reagentName || !payload.catNo || !payload.lotNo) {
            alert("輸入防呆欄位警告：名稱、CATNO、LOTNO 為必要核心規格，不可為空！");
            return;
        }

        const res = await fetch(`${API_BASE}/api/reagents/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`連線中斷或後端拒絕交易 (${res.status}): ${errText}`);
        }

        const result = await res.json();
        if (result.error) throw new Error(result.error);

        alert(result.message || "試劑主檔配置更新成功！");
        searchReagentsList();
        fetchStockData();
        
    } catch (err) {
        console.error("儲存程序發生異常:", err);
        alert("❌ 存檔失敗！異常回報：\n" + err.message);
    }
}

// 🌟 管理員批次公用程式復活區
function exportReagentMaster() {
    if (currentUser.role !== "Admin") {
        alert("權限不足：只有系統管理主管(Admin)可以執行主檔資料庫外銷作業。");
        return;
    }
    window.open(`${API_BASE}/api/reagents/export`, "_blank");
}

function importReagentMaster(input) {
    if (currentUser.role !== "Admin") {
        alert("權限不足：微調核心主檔匯入僅限 Admin 進行控管。");
        input.value = "";
        return;
    }
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const text = e.target.result;
            const res = await fetch(`${API_BASE}/api/reagents/import`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ csvData: text })
            });
            const json = await res.json();
            alert(json.message || json.error);
            searchReagentsList();
            fetchStockData();
        } catch(err) {
            alert("批次導入出錯：" + err.message);
        } finally {
            input.value = "";
        }
    };
    reader.readAsText(file);
}

// 🌟 條碼機出圖規格公用程式復活
function applyPrinterProfile() {
    const profile = document.getElementById("printerProfile").value;
    const txtX = document.getElementById("offsetX");
    const txtY = document.getElementById("offsetY");
    if(!txtX || !txtY) return;

    if (profile === "tsc_lab_a") {
        txtX.value = "0.5"; txtY.value = "-0.2";
    } else if (profile === "godex_blood") {
        txtX.value = "-0.8"; txtY.value = "0.4";
    } else if (profile === "zebra_bch") {
        txtX.value = "0.0"; txtY.value = "0.1";
    } else {
        txtX.value = "0.0"; txtY.value = "0.0";
    }
}

// ====================================================================
// 9. 實驗室人員權限帳號 CRUD 控制模組
// ====================================================================
function initUserForm() {
    const roleSel = document.getElementById("usr_UserRole");
    roleSel.innerHTML = "";
    roleSel.options.add(new Option("User (一般操作人員)", "User"));
    roleSel.options.add(new Option("Maintainer (庫存維護員)", "Maintainer"));
    if (currentUser.role === "Admin") roleSel.options.add(new Option("Admin (系統管理員)", "Admin"));
    setUserFormMode("UPDATE");
}

function setUserFormMode(mode) {
    usrCurrentEditMode = mode;
    document.getElementById("usr_UserID").disabled = (mode !== "NEW");
    document.getElementById("btn_userSave").innerText = mode === "NEW" ? "確認建立新帳號檔" : (mode === "DELETE" ? "註銷此人員權限" : "儲存核心權限變更");
}

async function searchUsersList() {
    const kw = document.getElementById("txtUsrKeyword").value;
    const res = await fetch(`${API_BASE}/api/users/search?keyword=${encodeURIComponent(kw)}&reqRole=${currentUser.role}&reqUser=${currentUser.account}`);
    const data = await res.json();
    
    const tbody = document.getElementById("userMasterTableBody");
    if (!tbody) {
        console.error("錯誤：找不到 id='userMasterTableBody' 的表格節點，請確認 index.html 是否正確替換！");
        return;
    }
    tbody.innerHTML = "";
    
    data.forEach(u => {
        const tr = document.createElement("tr");
        tr.className = "border-b hover:bg-slate-200 text-center text-xs cursor-pointer";
        tr.onclick = function() {
            document.getElementById("usr_UserID").value = u.UserID;
            document.getElementById("usr_UserName").value = u.UserName;
            document.getElementById("usr_UserRole").value = u.UserRole;
            document.getElementById("usr_Account").value = u.Account;
            const campusSelect = document.getElementById("usr_CampusID");
            const groupSelect = document.getElementById("usr_GroupID");
            if (campusSelect) campusSelect.value = u.CampusID || "C001";
            if (typeof refreshBusinessOrgSelects === "function") refreshBusinessOrgSelects();
            if (groupSelect) groupSelect.value = u.GroupID || "G001";
            document.getElementById("usr_Account").type = "password"; 
            document.getElementById("usr_IsActive").checked = (u.IsActive == 1 || u.IsActive == true);
            document.getElementById("lblCreateTime").innerText = u.CreateTime || "-";
            document.getElementById("lblUpdateTime").innerText = u.UpdateTime || "-";
            document.getElementById("lblLastLoginTime").innerText = u.LastLoginTime || "-";
            setUserFormMode("UPDATE");
        };
        tr.innerHTML = `<td class="p-2 font-mono font-bold">${u.UserID}</td><td class="p-2">${u.UserName}</td><td class="p-2">${u.UserRole}</td><td class="p-2">${u.IsActive ? '🟢 准許存取':'🔴 停用註銷'}</td>`;
        tbody.appendChild(tr);
    });
}

function togglePasswordVisibility() {
    const pwdInput = document.getElementById("usr_Account");
    if (pwdInput.type === "password") {
        pwdInput.type = "text";
    } else {
        pwdInput.type = "password";
    }
}

async function saveUserMaster() {
    const payload = {
        userID: document.getElementById("usr_UserID").value.trim(),
        userName: document.getElementById("usr_UserName").value.trim(),
        userRole: document.getElementById("usr_UserRole").value,
        account: document.getElementById("usr_Account").value.trim(),
        isActive: document.getElementById("usr_IsActive").checked,
        editMode: usrCurrentEditMode,
        reqRole: currentUser.role,
        reqUser: currentUser.account
        ,campusID: document.getElementById("usr_CampusID")?.value || "C001"
        ,groupID: document.getElementById("usr_GroupID")?.value || "G001"
    };

    if (!payload.userID || !payload.userName || !payload.account) {
        alert("防呆欄位校正：人員UserID、姓名與條碼代碼皆為不可缺少欄位！");
        return;
    }

    const res = await fetch(`${API_BASE}/api/users/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    const result = await res.json();
    alert(result.message || result.error);
    searchUsersList();
}

function exportUserMaster() {
    if (currentUser.role !== "Admin") {
        alert("權限不足：只有 Admin 可以匯出人員清單。");
        return;
    }

    window.open(`${API_BASE}/api/users/export`, "_blank");
}

function importUserMaster(input) {
    if (currentUser.role !== "Admin") {
        alert("權限不足：只有 Admin 可以匯入人員清單。");
        return;
    }

    if (!input.files || !input.files[0]) return;

    const file = input.files[0];
    const reader = new FileReader();

    reader.onload = async function(e) {
        const text = e.target.result;

        const res = await fetch(`${API_BASE}/api/users/import`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                csvData: text,
                reqRole: currentUser.role
            })
        });

        const json = await res.json();
        alert(json.message || json.error);

        input.value = "";
        searchUsersList();
    };

    reader.readAsText(file);
}

// ====================================================================
// 10. 手機版/電腦版智慧相機動態解碼控制引擎 (雙模一體化)
// ====================================================================
function toggleMobileScanner(inputId, elementId) {
    const scannerDiv = document.getElementById(elementId);
    
    if (html5QrScanner && html5QrScanner.isScanning) {
        html5QrScanner.stop().then(() => {
            scannerDiv.style.display = "none";
            currentScannerTarget = null;
        });
        return;
    }

    scannerDiv.style.display = "block";
    currentScannerTarget = inputId;
    html5QrScanner = new Html5Qrcode(elementId);
    
    html5QrScanner.start(
        { facingMode: "environment" }, 
        {
            fps: 25, 
            videoConstraints: {
                width: { ideal: 1920 },
                height: { ideal: 1080 },
                facingMode: "environment"
            },
            qrbox: function(width, height) {
                if (inputId === "txtUserBarcode") {
                    return { width: Math.min(width * 0.85, 300), height: 90 }; 
                }
                return { width: Math.min(width * 0.8), height: Math.min(height * 0.6, 160) };
            }
        },
        (decodedText) => {
            document.getElementById(currentScannerTarget).value = decodedText;
            if (navigator.vibrate) navigator.vibrate(100);
            
            html5QrScanner.stop().then(() => {
                scannerDiv.style.display = "none";
                if (currentScannerTarget === "txtUserBarcode") {
                    handleLoginScan();
                } else if (currentScannerTarget === "txtReagentBarcode") {
                    handleTransactionScan();
                }
                currentScannerTarget = null;
            });
        },
        (errorMessage) => {}
    ).catch(err => {
        alert("相機啟動失敗！行動裝置請確認：\n1. 院內網址必須為安全加密之 https:// 開頭。\n2. 已在手機設定中核准瀏覽器的「相機存取權限」。");
    });
}

// ====================================================================
// 11. 精密列印出圖引擎 (動態樣式微調模組)
// ====================================================================
function updateDynamicPrintStyle(widthMm, heightMm, offsetX, offsetY, layoutType) {
    let dynamicStyle = document.getElementById("dynamicPrintStyle");
    if (!dynamicStyle) {
        dynamicStyle = document.createElement("style");
        dynamicStyle.id = "dynamicPrintStyle";
        document.head.appendChild(dynamicStyle);
    }

    widthMm = parseFloat(widthMm);
    heightMm = parseFloat(heightMm);
    offsetX = parseFloat(offsetX) || 0;
    offsetY = parseFloat(offsetY) || 0;

    let layoutOffsetX = 0.0;
    let layoutOffsetY = 0.0;

    const finalX = offsetX + layoutOffsetX;
    const finalY = offsetY + layoutOffsetY;

    let gridRule = `
        display: grid !important;
        grid-template-columns: 1fr !important;
    `;

    let subLayoutRule = "";

    if (layoutType === "左1右2") {
        const leftWidth = (widthMm * 0.55).toFixed(1);
        const rightWidth = (widthMm * 0.45).toFixed(1);
        const rowHeight = (heightMm / 2).toFixed(1);

        gridRule = `
            display: grid !important;
            grid-template-columns: ${leftWidth}mm ${rightWidth}mm !important;
        `;

        subLayoutRule = `
            #printCanvas .col-left,
            #previewCanvasContainer .col-left {
                height: 100% !important;
                align-self: stretch !important;
                align-items: flex-start !important;
                justify-content: center !important;
                box-sizing: border-box !important;
                overflow: hidden !important;
            }

            #printCanvas .col-right,
            #previewCanvasContainer .col-right {
                display: grid !important;
                grid-template-rows: ${rowHeight}mm ${rowHeight}mm !important;
                height: 100% !important;
                align-self: stretch !important;
                align-items: stretch !important;
                justify-items: stretch !important;
                box-sizing: border-box !important;
                overflow: hidden !important;
            }

            #printCanvas .col-right > div,
            #previewCanvasContainer .col-right > div {
                height: 100% !important;
                width: 100% !important;
                align-items: flex-start !important;
                justify-content: center !important;
                box-sizing: border-box !important;
                overflow: hidden !important;
            }
        `;
    } else if (layoutType === "左1右3") {
        const leftWidth = (widthMm * 0.50).toFixed(1);
        const rightWidth = (widthMm * 0.50).toFixed(1);
        const rowHeight = (heightMm / 3).toFixed(1);

        gridRule = `
            display: grid !important;
            grid-template-columns: ${leftWidth}mm ${rightWidth}mm !important;
        `;

        subLayoutRule = `
            #printCanvas .col-left,
            #previewCanvasContainer .col-left {
                height: 100% !important;
                align-self: stretch !important;
                align-items: flex-start !important;
                justify-content: center !important;
                box-sizing: border-box !important;
                overflow: hidden !important;
            }

            #printCanvas .col-right,
            #previewCanvasContainer .col-right {
                display: grid !important;
                grid-template-rows: ${rowHeight}mm ${rowHeight}mm ${rowHeight}mm !important;
                height: 100% !important;
                align-self: stretch !important;
                align-items: stretch !important;
                justify-items: stretch !important;
                box-sizing: border-box !important;
                overflow: hidden !important;
            }

            #printCanvas .col-right > div,
            #previewCanvasContainer .col-right > div {
                height: 100% !important;
                width: 100% !important;
                align-items: flex-start !important;
                justify-content: center !important;
                box-sizing: border-box !important;
                overflow: hidden !important;
            }
        `;
    }

    dynamicStyle.innerHTML = `
        #previewCanvasContainer .label-page {
            ${gridRule}
            width: 100% !important;
            height: 100% !important;
            transform: translate(${finalX}mm, ${finalY}mm) !important;
            transform-origin: top left !important;
            box-sizing: border-box !important;
            overflow: hidden !important;
            align-items: stretch !important;
            justify-items: stretch !important;
            page-break-after: avoid !important;
            break-after: avoid !important;
        }

        @media print {
            @page {
                size: ${widthMm}mm ${heightMm}mm !important;
                margin: 0 !important;
            }

            html,
            body {
                width: ${widthMm}mm !important;
                height: ${heightMm}mm !important;
                margin: 0 !important;
                padding: 0 !important;
                overflow: hidden !important;
                background: #fff !important;
            }

            .print-area {
                display: block !important;
                width: ${widthMm}mm !important;
                height: ${heightMm}mm !important;
                margin: 0 !important;
                padding: 0 !important;
                overflow: hidden !important;
            }

            .label-page {
                ${gridRule}
                width: ${widthMm}mm !important;
                height: ${heightMm}mm !important;
                transform: translate(${finalX}mm, ${finalY}mm) !important;
                transform-origin: top left !important;
                box-sizing: border-box !important;
                overflow: hidden !important;
                align-items: stretch !important;
                justify-items: stretch !important;
                page-break-after: avoid !important;
                break-after: avoid !important;
            }
        }

        ${subLayoutRule}
    `;
}

// ====================================================================
// 12. 試劑歷史異動歷史區段報表模組 (全面對齊標準傳遞格式)
// ====================================================================
async function fetchTransactionReport() {
    const startDate = document.getElementById("rpt_StartDate").value;
    let endDate = document.getElementById("rpt_EndDate").value;
    
    if (!startDate || !endDate) {
        alert("報表查詢中止：請確認已完整選取起始與結束日期！");
        return;
    }
    
    const queryStartDate = `${startDate} 00:00:00`;
    const queryEndDate = `${endDate} 23:59:59`;
    
    try {
        let res = await fetch(`${API_BASE}/api/transactions/report?startDate=${encodeURIComponent(queryStartDate)}&endDate=${encodeURIComponent(queryEndDate)}`);
        if (!res.ok && res.status === 404) {
            res = await fetch(`${API_BASE}/api/transaction/report?startDate=${encodeURIComponent(queryStartDate)}&endDate=${encodeURIComponent(queryEndDate)}`);
        }
        if (!res.ok) throw new Error("後端資料庫連線或報表路由異常");
        
        const data = await res.json();
        const tbody = document.getElementById("reportTableBody");
        tbody.innerHTML = "";
        
        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-rose-600 font-bold bg-rose-50 border border-rose-100 rounded-md">💡 該日期區段內，現場查無任何出入庫與異動紀錄</td></tr>`;
            return;
        }
        
        data.forEach(log => {
            let modeBadge = "";
            if (log.TxMode === "IN" || log.ActionType === "IN") {
                modeBadge = `<span class="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold">📥 入庫</span>`;
            } else if (log.TxMode === "OUT" || log.ActionType === "OUT") {
                modeBadge = `<span class="bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-bold">📤 出庫</span>`;
            } else {
                modeBadge = `<span class="bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-bold">⚙️ 校正</span>`;
            }

            const tr = document.createElement("tr");
            tr.className = "border-b hover:bg-slate-100 transition text-slate-700 font-medium text-center text-xs";
            tr.innerHTML = `
                <td class="p-2.5 text-left font-mono text-[11px] text-slate-500">${log.Timestamp || log.TxDate || ''}</td>
                <td class="p-2.5 text-left font-semibold">${log.ReagentName || '未知品項'}</td>
                <td class="p-2.5 font-mono">${log.CATNO || ''}</td>
                <td class="p-2.5 font-mono">${log.LOTNO || ''}</td>
                <td class="p-2.5">${modeBadge}</td>
                <td class="p-2.5 font-mono font-bold text-slate-800">${log.Qty || 0}</td>
                <td class="p-2.5 font-mono">${log.Operator || ''}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        alert("報表加載失敗：" + err.message);
    }
}

// 🌟 核心追加功能：匯出歷史區段異動紀錄明細 CSV 引擎 (內建 Excel 繁體中文 BOM 防護)
async function exportTransactionReport() {
    const startDate = document.getElementById("rpt_StartDate").value;
    const endDate = document.getElementById("rpt_EndDate").value;
    
    if (!startDate || !endDate) {
        alert("報表匯出中止：請確認已完整選取起始與結束日期！");
        return;
    }
    
    const queryStartDate = `${startDate} 00:00:00`;
    const queryEndDate = `${endDate} 23:59:59`;
    
    try {
        let res = await fetch(`${API_BASE}/api/transactions/report?startDate=${encodeURIComponent(queryStartDate)}&endDate=${encodeURIComponent(queryEndDate)}`);
        if (!res.ok && res.status === 404) {
            res = await fetch(`${API_BASE}/api/transaction/report?startDate=${encodeURIComponent(queryStartDate)}&endDate=${encodeURIComponent(queryEndDate)}`);
        }
        if (!res.ok) throw new Error("無法從後端獲取欲匯出的報表數據包");
        
        const data = await res.json();
        if (data.length === 0) {
            alert("💡 提示：該日期區段內查無任何出入庫歷史紀錄，故取消 CSV 檔案導出。");
            return;
        }
        
        // 1. 初始化建立帶有 \uFEFF 簽名的 CSV 字串標頭 (徹底杜絕 Excel 開啟變亂碼的通病)
        let csvString = "\uFEFF異動簽核時間,試劑品名規格,目錄號(CATNO),生產批號(LOTNO),異動類別,異動數量,經手人代碼\n";
        
        // 2. 逐行解析與轉檔，並對文字欄位補上安全雙引號，防範儲存格因英文逗號或特殊符號破碎化
        data.forEach(log => {
            let typeText = "校正";
            if (log.TxMode === "IN" || log.ActionType === "IN") typeText = "入庫";
            else if (log.TxMode === "OUT" || log.ActionType === "OUT") typeText = "出庫";
            
            const timeStr = log.Timestamp || log.TxDate || "";
            const nameStr = (log.ReagentName || "未知品項").replace(/"/g, '""');
            const catStr = (log.CATNO || "").replace(/"/g, '""');
            const lotStr = (log.LOTNO || "").replace(/"/g, '""');
            const qtyNum = log.Qty || 0;
            const userStr = log.Operator || "";
            
            csvString += `"${timeStr}","${nameStr}","${catStr}","${lotStr}","${typeText}",${qtyNum},"${userStr}"\n`;
        });
        
        // 3. 虛擬節點流體式直接觸發瀏覽器下載機制
        const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        
        link.setAttribute("href", url);
        link.setAttribute("download", `臨床試劑歷史異動明細報表_${startDate}_至_${endDate}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
    } catch (err) {
        alert("匯出 CSV 報表作業失敗：" + err.message);
    }
}

// ====================================================================
// 13. 精密列印與預覽出圖渲染核心模組
// ====================================================================
function generateLabelPreview() {
    const layoutType = document.getElementById("layoutType").value;
    const barcodeText = document.getElementById("barcodeText").value.trim();
    const pageSize = document.getElementById("pageSize").value;
    const offsetX = parseFloat(document.getElementById("offsetX").value) || 0;
    const offsetY = parseFloat(document.getElementById("offsetY").value) || 0;

    if (!barcodeText) {
        alert("預覽中止：請先掃描或選擇欲產生之試劑條碼內文！");
        return;
    }

    const [widthMm, heightMm] = pageSize.split("x");
    const qrUrl = `https://quickchart.io/qr?text=${encodeURIComponent(barcodeText)}&size=300&margin=0&ecLevel=Q`;

    updateDynamicPrintStyle(widthMm, heightMm, offsetX, offsetY, layoutType);

    const container = document.getElementById("previewCanvasContainer");
    container.innerHTML = "";
    container.style.width = `${widthMm}mm`;
    container.style.height = `${heightMm}mm`;

    const labelPage = document.createElement("div");
    labelPage.className = `label-page layout-${layoutType}`;
    labelPage.innerHTML = buildLabelInnerHTML(layoutType, qrUrl);
    container.appendChild(labelPage);

    openModal('LabelPreview');
}

function triggerLabelPrint() {
    const layoutType = document.getElementById("layoutType").value;
    const barcodeText = document.getElementById("barcodeText").value.trim();
    const pageSize = document.getElementById("pageSize").value;
    const offsetX = parseFloat(document.getElementById("offsetX").value) || 0;
    const offsetY = parseFloat(document.getElementById("offsetY").value) || 0;

    if (!barcodeText) {
        alert("列印中止：請先掃描或選擇欲產生之試劑條碼內文！");
        return;
    }

    const [widthMm, heightMm] = pageSize.split("x");
    const qrUrl = `https://quickchart.io/qr?text=${encodeURIComponent(barcodeText)}&size=300&margin=0&ecLevel=Q`;

    updateDynamicPrintStyle(widthMm, heightMm, offsetX, offsetY, layoutType);

    const printCanvas = document.getElementById("printCanvas");
    printCanvas.innerHTML = "";
    
    const labelPage = document.createElement("div");
    labelPage.className = `label-page layout-${layoutType}`;
    labelPage.innerHTML = buildLabelInnerHTML(layoutType, qrUrl);
    printCanvas.appendChild(labelPage);

    window.print();
}

function buildLabelCaptionHTML() {
    const title = currentPrintLabelMeta.title || "";
    const subtitle = currentPrintLabelMeta.subtitle || "";

    if (!title && !subtitle) return "";

    return `
        <div style="
            width: 100%;
            text-align: center;
            font-size: 6px;
            line-height: 1.1;
            font-weight: 700;
            margin-top: 0.5mm;
            word-break: break-all;
        ">
            <div>${title}</div>
            <div style="font-size:5px;font-weight:500;">${subtitle}</div>
        </div>
    `;
}

function buildLabelInnerHTML(layoutType, qrUrl) {

    if (layoutType === "一大") {
        return `
            <div class="flex flex-col items-center justify-start h-full w-full">
                <img src="${qrUrl}" style="width:68%;height:auto;" />
                ${buildLabelCaptionHTML()}
            </div>
        `;
    }

    if (layoutType === "左1右2") {
        return `
            <div class="col-left flex flex-col items-center justify-start border-r border-dashed border-slate-300">
                <img src="${qrUrl}" style="width:65%;height:auto;" />
                ${buildLabelCaptionHTML()}
            </div>

            <div class="col-right h-full">
                <div class="flex flex-col items-center justify-start border-b border-dashed border-slate-300">
                    <img src="${qrUrl}" style="width:35%;height:auto;" />
                    ${buildLabelCaptionHTML()}
                </div>

                <div class="flex flex-col items-center justify-start">
                    <img src="${qrUrl}" style="width:35%;height:auto;" />
                    ${buildLabelCaptionHTML()}
                </div>
            </div>
        `;
    }

    if (layoutType === "左1右3") {
        return `
            <div class="col-left flex flex-col items-center justify-start border-r border-dashed border-slate-300">
                <img src="${qrUrl}" style="width:65%;height:auto;" />
                ${buildLabelCaptionHTML()}
            </div>

            <div class="col-right h-full">
                <div class="flex flex-col items-center justify-start border-b border-dashed border-slate-300">
                    <img src="${qrUrl}" style="width:30%;height:auto;" />
                    ${buildLabelCaptionHTML()}
                </div>

                <div class="flex flex-col items-center justify-start border-b border-dashed border-slate-300">
                    <img src="${qrUrl}" style="width:30%;height:auto;" />
                    ${buildLabelCaptionHTML()}
                </div>

                <div class="flex flex-col items-center justify-start">
                    <img src="${qrUrl}" style="width:30%;height:auto;" />
                    ${buildLabelCaptionHTML()}
                </div>
            </div>
        `;
    }

    return "";
}
