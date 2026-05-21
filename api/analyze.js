import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const userIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';

  try {
    const { cvText, jobText, token } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    // 1. Проверка лимитов (оставляем твою рабочую логику)
    let canScan = true;
    let userIdentifier = null;
    try {
      if (token) {
        const { data: { user } } = await supabase.auth.getUser(token);
        if (user) {
          userIdentifier = { type: 'member', id: user.id };
          const { data: profile } = await supabase.from('profiles').select('is_pro, scans_count').eq('id', user.id).maybeSingle();
          if (profile && !profile.is_pro && (profile.scans_count || 0) >= 3) canScan = false;
        }
      } else {
        const { data: anonData } = await supabase.from('anonymous_scans').select('scans_count').eq('ip_address', userIP).maybeSingle();
        userIdentifier = { type: 'anon', ip: userIP, count: anonData ? anonData.scans_count : 0 };
        if (anonData && anonData.scans_count >= 3) canScan = false;
      }
    } catch (e) { console.log("DB check skipped"); }

    if (!canScan) {
      return res.status(403).json({ error: "LIMIT_EXCEEDED", message: "Limit reached." });
    }

    // 2. ЖЕСТКИЙ ПРОМПТ ДЛЯ GEMINI 2.5 FLASH
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    
    const systemPrompt = `You are a professional ATS scanner. Today is ${today}.
    Analyze this CV against the Job Description.
    
    You MUST return ONLY a JSON object with this EXACT structure (no other keys):
    {
      "score": 85,
      "verdict": "Text verdict",
      "summary": "Short summary",
      "subScores": { "impact": 80, "brevity": 70, "style": 90, "soft_skills": 85 },
      "keywordsFound": ["keyword1", "keyword2"],
      "keywordsMissing": ["keyword3"],
      "issues": [ { "text": "Issue description", "severity": "warning" } ],
      "recommendations": [ { "title": "Rec title", "detail": "Rec detail" } ]
    }
    
    Severity for issues must be 'critical', 'warning', or 'info'.
    Return ONLY JSON. No markdown.`;

    const userPrompt = `CV TEXT: ${cvText}\n\nJOB DESCRIPTION: ${jobText}`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.2 }
      })
    });

    const aiData = await response.json();
    if (aiData.error) throw new Error(aiData.error.message);

    // Берем текст и убираем лишнее
    let cleanJson = aiData.candidates[0].content.parts[0].text.replace(/```json|```/g, '').trim();

    // 3. Обновляем счетчик в фоне
    if (userIdentifier) {
      if (userIdentifier.type === 'member') {
        supabase.rpc('increment_scan_count', { user_id: userIdentifier.id }).then(()=>{});
      } else {
        supabase.from('anonymous_scans').upsert({ ip_address: userIdentifier.ip, scans_count: userIdentifier.count + 1 }).then(()=>{});
      }
    }

    // Отправляем результат
    res.status(200).json({ content: cleanJson });
    
  } catch (error) {
    console.error("API ERROR:", error.message);
    res.status(200).json({ error: error.message });
  }
}
