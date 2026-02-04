import { createClient } from
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const supabase = createClient(
  "https://mbdatbwrralhlkhyhxlr.supabase.co",
  "sb_publishable_XXXX"   // ← 你的 publishable key
);

// ⚠️ 換成你真的 questionnaire.id
const QUESTIONNAIRE_ID = "請貼上你的 questionnaire UUID";

const app = document.getElementById("app");

let respondentId = null;
let blocks = [];
let currentBlockIndex = 0;

/* ===============================
   Step 1：建立 respondent
================================ */
async function createRespondent() {
  const { data, error } = await supabase
    .from("respondent")
    .insert({
      questionnaire_id: QUESTIONNAIRE_ID,
      start_time: new Date().toISOString(),
      device_type: "tablet"
    })
    .select()
    .single();

  if (error) {
    app.innerHTML = "❌ 無法建立填答者，請看 Console";
    console.error(error);
    return;
  }

  respondentId = data.id;
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

  if (error) {
    app.innerHTML = "❌ 無法載入問卷區塊";
    console.error(error);
    return;
  }

  blocks = data;
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

  if (error) {
    app.innerHTML = "❌ 無法載入題目";
    console.error(error);
    return;
  }

  renderQuestion(data[0]); // 先畫第一題（APS1）
}

/* ===============================
   Step 4：畫單題畫面（暫時）
================================ */
function renderQuestion(q) {
  app.innerHTML = `
    <h2>${q.question_text}</h2>
    <ul>
      ${q.options.map(opt => `<li>${opt}</li>`).join("")}
    </ul>
    <button id="nextBtn">下一題</button>
  `;
}

/* ===============================
   啟動
================================ */
createRespondent();


