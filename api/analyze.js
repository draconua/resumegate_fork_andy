export default async function handler(req, res) {
  // Твои проверенные CORS заголовки
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  try {
    const { cvText, jobText } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;
    
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const currentYear = new Date().getFullYear();
    
    // Промпт теперь сфокусирован ТОЛЬКО на анализе
    const systemPrompt = `You are an expert ATS (Applicant Tracking System) specialist and career coach. 
IMPORTANT CONTEXT: Today's date is ${today}. Do NOT flag employment dates up to ${currentYear} as being in the future.

YOUR TASK: Analyze the CV against the job description for ATS compatibility, keyword density, and professional impact.

Return ONLY valid JSON with this exact structure:
{
  "score": 85,
  "verdict": "Strong ATS performance",
  "summary": "Your explanation.",
  "subScores": { "formatting": 90, "keywords": 80, "readability": 85, "completeness": 90 },
  "keywordsFound": ["kw1"],
  "keywordsMissing": ["kw2"],
  "issues": [ { "severity": "warning", "text": "description" } ],
  "recommendations": [ { "title": "Action", "detail": "Advice" } ]
}
Return ONLY JSON. No markdown.`;

    const userPrompt = `CV: ${cvText || 'Empty'}\n\nJob Description: ${jobText || 'General Scan'}`;

    // Используем стабильную версию 2.5 Flash 
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${systemPrompt}\n\nUser Request:\n${userPrompt}` }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.3
        }
      })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    
    const rawOutput = data.candidates[0].content.parts[0].text.trim();
    
    // Возвращаем результат в формате для фронтенда
    res.status(200).json({ choices: [{ message: { content: rawOutput } }] });
    
  } catch (error) {
    console.error("API Error:", error);
    const errorJson = { 
      score: 0, verdict: "Error", summary: `Error: ${error.message}`, 
      subScores: { formatting: 0, keywords: 0, readability: 0, completeness: 0 },
      keywordsFound: [], keywordsMissing: [], issues: [], recommendations: []
    };
    res.status(200).json({ choices: [{ message: { content: JSON.stringify(errorJson) } }] });
  }
}
