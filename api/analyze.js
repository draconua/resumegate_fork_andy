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

    let canScan = true;
    let userIdentifier = null;
    try {
      if (token) {
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
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
      // Это ошибка клиента (код 403 - запрещено), здесь всё правильно
      return res.status(403).json({ error: "LIMIT_EXCEEDED", message: "Limit reached." });
    }

    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    
    const systemPrompt = `You are a professional ATS scanner. Today is ${today}.
    Analyze this CV against the Job Description.
    You MUST return ONLY a JSON object with this EXACT structure:
    {
      "score": 85,
      "verdict": "Text verdict",
      "summary": "Short summary",
      "subScores": { "impact": 80, "brevity": 70, "style": 90, "soft_skills": 85 },
      "keywordsFound": ["keyword1", "keyword2"],
      "keywordsMissing": ["keyword3"],
      "issues": [ { "text": "Issue description", "severity": "warning" } ],
      "recommendations": [ { "title": "Rec title", "detail": "Rec detail" } ]
    }`;

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

    // --- ПРАВКА 1: Если сам Google вернул ошибку ---
    if (aiData.error) {
      console.error("Gemini direct error:", aiData.error);
      return res.status(500).json({ error: aiData.error.message }); 
    }

    // --- ПРАВКА 2: Надежная очистка текста (Клод советовал) ---
    // Сначала убеждаемся, что ответ вообще есть
    if (!aiData.candidates || !aiData.candidates[0]) {
      return res.status(500).json({ error: "AI returned empty response" });
    }

    let rawText = aiData.candidates[0].content.parts[0].text;
    let cleanJson = rawText.replace(/```json|```/g, '').trim();

    // Увеличение счетчика в фоне
    if (userIdentifier) {
      if (userIdentifier.type === 'member') {
        supabase.rpc('increment_scan_count', { user_id: userIdentifier.id }).then(()=>{});
      } else {
        supabase.from('anonymous_scans').upsert({ ip_address: userIdentifier.ip, scans_count: userIdentifier.count + 1 }).then(()=>{});
      }
    }

    // Отправляем успешный результат (200)
    res.status(200).json({ content: cleanJson });
    
  } catch (error) {
    console.error("CRITICAL API ERROR:", error.message);
    // --- ПРАВКА 3: При любой системной ошибке возвращаем 500 ---
    res.status(500).json({ error: error.message });
  }
}
