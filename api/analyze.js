export default async function handler(req, res) {
  // CORS заголовки (оставляем твои, чтобы сайт работал без ошибок)
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
    
    // Динамические даты (твоя отличная идея!)
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const currentYear = new Date().getFullYear();
    
    const systemPrompt = `You are an expert ATS (Applicant Tracking System) specialist and career coach. 
IMPORTANT CONTEXT: Today's date is ${today}. Do NOT flag employment dates up to ${currentYear} as being in the future.

STEP 1: Analyze the CV against the job description.
STEP 2: Rewrite the ENTIRE resume to be ATS-optimized with professional language and strong action verbs.

Return ONLY valid JSON with this exact structure:
{
  "score": 85,
  "verdict": "Strong ATS performance",
  "summary": "Your explanation.",
  "subScores": { "formatting": 90, "keywords": 80, "readability": 85, "completeness": 90 },
  "keywordsFound": ["kw1"],
  "keywordsMissing": ["kw2"],
  "issues": [ { "severity": "warning", "text": "description" } ],
  "recommendations": [ { "title": "Action", "detail": "Advice" } ],
  "rewrittenResume": "The full improved text of the CV"
}
Return ONLY JSON. No markdown.`;

    const userPrompt = `CV: ${cvText || 'Empty'}\n\nJob Description: ${jobText || 'General Scan'}`;

    // Используем стабильную версию 1.5 Flash
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
    
    // Возвращаем результат в том же формате, что ждет твой фронтенд
    res.status(200).json({ choices: [{ message: { content: rawOutput } }] });
    
  } catch (error) {
    console.error("API Error:", error);
    const errorJson = { 
      score: 0, verdict: "Error", summary: `Error: ${error.message}`, 
      subScores: { formatting: 0, keywords: 0, readability: 0, completeness: 0 },
      keywordsFound: [], keywordsMissing: [], issues: [], recommendations: [],
      rewrittenResume: "Sorry, could not rewrite the CV due to an error."
    };
    res.status(200).json({ choices: [{ message: { content: JSON.stringify(errorJson) } }] });
  }
}
