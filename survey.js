import { createClient } from
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const supabase = createClient(
  "https://mbdatbwrralhlkhyhxlr.supabase.co",
  "sb_publishable_XXXX"
);

async function testInsert() {
  const { data, error } = await supabase
    .from("respondent")
    .insert({
      questionnaire_id: "你的 questionnaire_id",
      start_time: new Date().toISOString(),
      device_type: "tablet"
    });

  console.log(data, error);
}

testInsert();

