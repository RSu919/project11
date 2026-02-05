import { createClient } from
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const supabase = createClient(
  "https://mbdatbwrralhlkhyhxlr.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1iZGF0YndycmFsaGxraHloeGxyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxNjg2OTksImV4cCI6MjA4NTc0NDY5OX0.5kv8UvBRbYfcZGLXdKI_cWtplkN3YT05XC5AUhVtsok"   // ← 你的 publishable key
);

// ⚠️ 換成你真的 questionnaire.id（UUID）
const QUESTIONNAIRE_ID = "db949a8e-95ad-454e-9fa4-050cf9ed238a";

const app = document.getElementById("app");

// ⚠️ 我們自己產生 respondent_id（避免 SELECT）
const respondentId = crypto.randomUUID();

let blocks = [];
let currentBlockIndex = 0;

/* ===============================
   Step 1：建立 respondent（只 INSERT）
================================ */
async function createRespondent() {
  const { error } = await supabase
    .from("respondent")
    .insert({
      id: respondentId,
      questionnaire_id: QUESTIONNAIRE_ID,
      start_time: new Date().toISOString(),
      device_type: "tablet"
    });

  if (error) {
    app.innerHTML = "❌ 無法建立填答者，請看 Console";
    console.error("respondent insert error:", error);
    return;
  }

  console.log("✅ respondent 建立成功:", respondentId);
  loadBlocks();
}

/* ===============================
   Step 2：抓 question_block
================================ */
async function loadBlocks() {
  const { data, error } = await supabase
    .from("question_block")
    .select("*")
    .eq("questionnaire_id", QUESTIONNAIRE_ID)
    .order("order_index");

  if (error || !data || data.length === 0) {
    app.innerHTML = "❌ 無法載入問卷區塊";
    console.error("block load error:", error);
    return;
  }

  blocks = data;
  currentBlockIndex = 0;
  loadQuestions(blocks[0].id);
}

/* ===============================
   Step 3：抓該 block 的題目
================================ */
async function loadQuestions(blockId) {
  const { data, error } = await supabase
    .from("question")
    .select("*")
    .eq("block_id", blockId)
    .order("order_index");

  if (error || !data || data.length === 0) {
    app.innerHTML = "❌ 無法載入題目";
    console.error("question load error:", error);
    return;
  }

  renderQuestion(data[0]); // 先畫第一題
}

/* ===============================
   Step 4：畫單題畫面（單頁式）
================================ */
function renderQuestion(q) {
  const options = Array.isArray(q.options)
    ? q.options
    : [];

  app.innerHTML = `
    <h2>${q.question_text}</h2>
    <ul>
      ${options.map(opt => `<li>${opt}</li>`).join("")}
    </ul>
    <button id="nextBtn">下一題</button>
  `;

  document.getElementById("nextBtn").onclick = () => {
    alert("下一步：記錄反應時間 / 寫 response / ui_event_log");
  };
}

/* ===============================
   啟動
================================ */
createRespondent();


