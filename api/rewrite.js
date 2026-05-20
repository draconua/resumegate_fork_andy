import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // CORS заголовки (копируем для стабильности)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { cvText, jobText, analysisResults, token } = req.body;

    // 1. Проверка PRO статуса через Supabase
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (!user || authError) return res.status(401).json({ error: "Unauthorized" });

    const { data: profile } = await supabase.from('profiles').select('is_pro').eq('id', user.id).single();
    if (!profile?.is_pro) return res.status(403).json({ error: "Upgrade to PRO to unlock this feature" });

    // 2. Если пользователь PRO — запускаем мощный рерайт
    const apiKey = process.env.GEMINI_API_KEY;
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    const rewritePrompt = `Act as a Professional Resume Writer. Today's date is ${today}.
    
    CONTEXT FROM ATS SCAN:
    - Current Issues: ${JSON.stringify(analysisResults.issues)}
    - Missing Keywords: ${JSON.stringify(analysisResults.keywordsMissing)}
    
    YOUR TASK: Rewrite the following resume to fix ALL these issues and include the missing keywords. 
    Use strong action verbs and professional business language.
    
    ORIGINAL CV:
    ${cvText}
    
    TARGET JOB DESCRIPTION:
    ${jobText}
    
    Return ONLY the rewritten text of the resume. No commentary. No JSON. Just the improved CV text.`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: rewritePrompt }] }] })
    });

    const data = await response.json();
    const rewrittenText = data.candidates[0].content.parts[0].text.trim();

    res.status(200).json({ rewrittenResume: rewrittenText });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
