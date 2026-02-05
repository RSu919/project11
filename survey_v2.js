import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const supabase = createClient("https://mbdatbwrralhlkhyhxlr.supabase.co", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1iZGF0YndycmFsaGxraHloeGxyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxNjg2OTksImV4cCI6MjA4NTc0NDY5OX0.5kv8UvBRbYfcZGLXdKI_cWtplkN3YT05XC5AUhVtsok");
const QUESTIONNAIRE_ID = "db949a8e-95ad-454e-9fa4-050cf9ed238a";

let respondentId = null;
let blocks = [];
let allQuestions = [];
let currentBlockIndex = 0;
let currentQuestionIndexInBlock = 0;
let answersCache = {}; 
let pageStartTime = null;

const app = document.getElementById("app");

async function initRespondent() {
    const isTablet = window.innerWidth >= 768 && window.innerWidth <= 1024;
    const { data, error } = await supabase.from("respondent").insert({
        questionnaire_id: QUESTIONNAIRE_ID,
        start_time: new Date().toISOString(),
        device_type: isTablet ? "tablet" : "mobile",
        abandoned: true 
    }).select().single();
    return error ? null : data.id;
}

async function logAction(type, targetId = null, metadata = {}) {
    if (!respondentId) return;
    await supabase.from("action_log").insert({
        respondent_id: respondentId, action_type: type, target_id: targetId, metadata: metadata, created_at: new Date().toISOString()
    });
}

async function loadSurveyData() {
    const { data: bData } = await supabase.from("question_block").select("*").eq("questionnaire_id", QUESTIONNAIRE_ID).order("order_index");
    const { data: qData } = await supabase.from("question").select("*").order("order_index");
    blocks = bData;
    allQuestions = qData;
    renderPage();
}

function renderPage() {
    // 建立線性時間軸計算正確題號
    const sortedTimeline = [];
    const sortedBlocks = [...blocks].sort((a, b) => a.order_index - b.order_index);
    
    sortedBlocks.forEach(b => {
        const bQs = allQuestions.filter(item => item.block_id === b.id).sort((a, b) => a.order_index - b.order_index);
        sortedTimeline.push(...bQs);
    });

    const block = sortedBlocks[currentBlockIndex];
    const blockQuestions = allQuestions.filter(q => q.block_id === block.id).sort((a, b) => a.order_index - b.order_index);
    const q = blockQuestions[currentQuestionIndexInBlock];

    if (!q) {
        console.error("找不到題目，可能是索引出錯");
        return;
    }

    const currentQCount = sortedTimeline.findIndex(item => item.id === q.id) + 1;
    const totalQ = sortedTimeline.length;
    const progressPercent = (currentQCount / totalQ) * 100;

    pageStartTime = Date.now();
    const isTextInput = !q.options || q.options.length === 0 || q.options.some(opt => opt.includes("文字") || opt.includes("輸入")) || q.question_text.includes("姓名") || q.question_text.includes("年齡");

    app.innerHTML = `
        <div class="survey-container">
            <div class="progress-container"><div class="progress-bar" style="width: ${progressPercent}%"></div></div>
            <div class="progress-text">Question ${currentQCount} / ${totalQ}</div>
            <div class="question-box">
                <div class="block-tag">${block.block_name}</div>
                <h2 class="question-text">${q.question_text}</h2>
                <div class="audio-section">
                    <button class="audio-btn" onclick="window.playAudio('${q.question_text.replace(/'/g, "\\'")}', 1.0, '${q.id}')">🔊 正常</button>
                    <button class="audio-btn slow" onclick="window.playAudio('${q.question_text.replace(/'/g, "\\'")}', 0.5, '${q.id}')">🐢 龜速</button>
                </div>
                <div class="options-list">
                    ${isTextInput ? `<input type="text" class="text-input" value="${answersCache[q.id] || ''}" oninput="window.saveTextAnswer('${q.id}', this.value)" placeholder="請在此輸入...">` : 
                    q.options.map((opt, idx) => `<div class="opt-item ${answersCache[q.id] === opt ? 'selected' : ''}" onclick="window.selectOption('${q.id}', '${opt}')"><span class="opt-label">${String.fromCharCode(65 + idx)}</span><span class="opt-text">${opt}</span></div>`).join("")}
                </div>
            </div>
            <div class="nav-section">
                ${(currentBlockIndex === 0 && currentQuestionIndexInBlock === 0) ? '' : `<button class="control-btn" style="margin-right:15px" onclick="window.prevPage()">返回</button>`}
                <button class="next-btn" onclick="window.nextPage()">${(currentBlockIndex === blocks.length - 1 && currentQuestionIndexInBlock === blockQuestions.length - 1) ? '提交問卷' : '下一題'}</button>
            </div>
        </div>`;
}

window.selectOption = (qId, opt) => { answersCache[qId] = opt; renderPage(); };
window.saveTextAnswer = (qId, val) => { answersCache[qId] = val; };
window.playAudio = (text, rate = 1.0, qId) => { window.speechSynthesis.cancel(); const utter = new SpeechSynthesisUtterance(text); utter.lang = 'zh-TW'; utter.rate = rate; window.speechSynthesis.speak(utter); logAction(rate < 1.0 ? 'speech_slow' : 'speech_normal', qId); };
window.adjustFontSize = (delta) => { const root = document.documentElement; const currentSize = parseInt(getComputedStyle(root).getPropertyValue('--base-size') || 18); root.style.setProperty('--base-size', (currentSize + delta) + 'px'); logAction('font_scale', null, { size: currentSize + delta }); };

window.prevPage = () => {
    if (currentQuestionIndexInBlock > 0) { 
        currentQuestionIndexInBlock--; 
    } else if (currentBlockIndex > 0) { 
        currentBlockIndex--; 
        const prevBlockQs = allQuestions.filter(q => q.block_id === blocks[currentBlockIndex].id).sort((a, b) => a.order_index - b.order_index); 
        currentQuestionIndexInBlock = prevBlockQs.length - 1; 
    }
    renderPage();
};

window.nextPage = async () => {
    try {
        const block = blocks[currentBlockIndex];
        const blockQuestions = allQuestions.filter(q => q.block_id === block.id).sort((a, b) => a.order_index - b.order_index);
        const q = blockQuestions[currentQuestionIndexInBlock];

        if (!answersCache[q.id] || answersCache[q.id].trim() === "") { alert("請填寫此題。"); return; }

        const reactionTime = Math.round((Date.now() - pageStartTime) / 1000);
        const { error } = await supabase.from("response").insert({ respondent_id: respondentId, question_id: q.id, answer_value: answersCache[q.id], reaction_time_sec: reactionTime });
        
        if (error) { throw error; }

        if (currentQuestionIndexInBlock < blockQuestions.length - 1) {
            currentQuestionIndexInBlock++;
        } else if (currentBlockIndex < blocks.length - 1) {
            if (block.encouragement_text) alert(block.encouragement_text);
            currentBlockIndex++;
            currentQuestionIndexInBlock = 0; // 跨區塊重置索引
        } else {
            await supabase.from("respondent").update({ abandoned: false, end_time: new Date().toISOString() }).eq("id", respondentId);
            app.innerHTML = `<div class="finish-card"><h2>🎉 完成</h2><p>感謝您的參與。</p></div>`;
            return;
        }
        renderPage();
    } catch (err) {
        console.error("發生錯誤:", err);
        alert("資料儲存或換頁發生錯誤，請檢查網路。");
    }
};

(async () => { respondentId = await initRespondent(); if (respondentId) loadSurveyData(); })();