import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const supabase = createClient("https://mbdatbwrralhlkhyhxlr.supabase.co", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1iZGF0YndycmFsaGxraHloeGxyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxNjg2OTksImV4cCI6MjA4NTc0NDY5OX0.5kv8UvBRbYfcZGLXdKI_cWtplkN3YT05XC5AUhVtsok");
const QUESTIONNAIRE_ID = "db949a8e-95ad-454e-9fa4-050cf9ed238a";

// --- 狀態管理 ---
let respondentId = null;
let blocks = [];
let questions = [];
let currentBlockIndex = 0;
let currentPageInBlock = 0;
let answersCache = {}; 
let pageStartTime = null;

const app = document.getElementById("app");

// --- 初始化填答者 (UI 研究紀錄) ---
async function initRespondent() {
    const isTablet = window.innerWidth >= 768 && window.innerWidth <= 1024;
    const { data, error } = await supabase
        .from("respondent")
        .insert({
            questionnaire_id: QUESTIONNAIRE_ID,
            start_time: new Date().toISOString(),
            device_type: isTablet ? "tablet" : "mobile",
            abandoned: true 
        })
        .select().single();

    if (error) {
        console.error("無法建立填答者:", error);
        return null;
    }
    console.log("✅ respondent created:", data.id);
    return data.id;
}

// --- 行為紀錄函式 (UI/UX 分析用) ---
async function logAction(type, targetId = null, metadata = {}) {
    if (!respondentId) return;
    await supabase.from("action_log").insert({
        respondent_id: respondentId,
        action_type: type,
        target_id: targetId,
        metadata: metadata,
        created_at: new Date().toISOString()
    });
}

// --- 載入問卷資料 ---
async function loadSurveyData() {
    // 1. 抓取所有區塊
    const { data: blockData, error: bError } = await supabase
        .from("question_block")
        .select("*")
        .eq("questionnaire_id", QUESTIONNAIRE_ID)
        .order("order_index");

    if (bError || !blockData.length) {
        app.innerHTML = "❌ 無法載入問卷區塊，請確認資料庫資料。";
        return;
    }
    blocks = blockData;

    // 2. 抓取所有題目
    const { data: qData, error: qError } = await supabase
        .from("question")
        .select("*")
        .order("order_index");

    if (qError) return;
    questions = qData;

    renderPage();
}

// --- 渲染畫面 ---
function renderPage() {
    const block = blocks[currentBlockIndex];
    const perPage = block.questions_per_page || 1; // 
    const blockQuestions = questions.filter(q => q.block_id === block.id);
    const startIdx = currentPageInBlock * perPage;
    const pageQuestions = blockQuestions.slice(startIdx, startIdx + perPage);

    pageStartTime = Date.now();

    let html = `
        <div class="block-header">
            <h3>${block.block_name || '問卷進行中'}</h3>
            <p>進度：區塊 ${currentBlockIndex + 1} / ${blocks.length}</p>
        </div>
    `;

    pageQuestions.forEach(q => {
        html += `
            <div class="question-box" id="q-${q.id}">
                <p><strong>${q.question_text}</strong></p>
                <div class="audio-controls">
                    <button onclick="window.playAudio('${q.question_text}', 1.0, '${q.id}')">🔊 正常</button>
                    <button onclick="window.playAudio('${q.question_text}', 0.5, '${q.id}')">🐢 龜速</button>
                </div>
                <div class="options-container">
                    ${q.options.map(opt => `
                        <button class="opt-btn ${answersCache[q.id] === opt ? 'selected' : ''}" 
                                onclick="window.selectOption('${q.id}', '${opt}')">
                            ${opt}
                        </button>
                    `).join("")}
                </div>
            </div>
        `;
    });

    html += `
        <div class="nav-btns">
            ${(currentBlockIndex === 0 && currentPageInBlock === 0) ? '' : '<button onclick="window.prevPage()">返回</button>'}
            <button onclick="window.nextPage()">${isLastPage() ? '送出問卷' : '下一頁'}</button>
        </div>
    `;

    app.innerHTML = html;
}

// --- 互動邏輯 ---
window.selectOption = (qId, opt) => {
    answersCache[qId] = opt;
    const btns = document.querySelectorAll(`#q-${qId} .opt-btn`);
    btns.forEach(b => b.classList.remove('selected'));
    event.target.classList.add('selected');
};

window.playAudio = (text, rate = 1.0, qId) => {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'zh-TW';
    utter.rate = rate;
    window.speechSynthesis.speak(utter);
    logAction(rate < 1.0 ? 'speech_slow' : 'speech_normal', qId);
};

window.adjustFontSize = (delta) => {
    const root = document.documentElement;
    const currentSize = parseInt(getComputedStyle(root).getPropertyValue('--base-size') || 18);
    root.style.setProperty('--base-size', (currentSize + delta) + 'px');
    logAction('font_scale', null, { size: currentSize + delta });
};

window.nextPage = async () => {
    const block = blocks[currentBlockIndex];
    const blockQuestions = questions.filter(q => q.block_id === block.id);
    const perPage = block.questions_per_page || 1;

    // 儲存答案與反應時間
    const pageTime = Math.round((Date.now() - pageStartTime) / 1000);
    await logAction('page_submit', block.id, { duration_sec: pageTime });

    if ((currentPageInBlock + 1) * perPage < blockQuestions.length) {
        currentPageInBlock++;
        renderPage();
    } else {
        // 區塊結束，顯示鼓勵詞 
        if (block.encouragement_text) {
            alert(block.encouragement_text);
        }
        
        if (currentBlockIndex < blocks.length - 1) {
            currentBlockIndex++;
            currentPageInBlock = 0;
            renderPage();
        } else {
            completeSurvey();
        }
    }
};

function isLastPage() {
    return currentBlockIndex === blocks.length - 1; 
}

async function completeSurvey() {
    await supabase.from("respondent").update({ abandoned: false, end_time: new Date().toISOString() }).eq("id", respondentId);
    app.innerHTML = `
        <div class="finish-msg">
            <h2>睡眠狀況探討</h2>
            <p>我們已經收到您回覆的表單，感謝您的參與。</p>
        </div>
    `;
}

// --- 啟動 ---
(async () => {
    respondentId = await initRespondent();
    if (respondentId) loadSurveyData();
})();