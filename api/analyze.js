export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { cvText, jobText } = req.body;

    if (!cvText) {
      return res.status(400).json({ error: 'No CV text provided' });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    const prompt = `You are an expert ATS (Applicant Tracking System) specialist and career coach.
Analyze the following CV${jobText ? ' against the job description' : ''} and return ONLY a valid JSON object with this EXACT structure:

{
  "score": <integer 0-100>,
  "verdict": "<3-6 word punchy verdict>",
  "summary": "<2 sentences explaining the score>",
  "subScores": {
    "formatting": <0-100>,
    "keywords": <0-100>,
    "readability": <0-100>,
    "completeness": <0-100>
  },
  "keywordsFound": ["word1", "word2"],
  "keywordsMissing": ["word1", "word2"],
  "issues": [
    {"severity": "critical", "text": "issue description"},
    {"severity": "warning", "text": "issue description"},
    {"severity": "info", "text": "issue description"}
  ],
  "recommendations": [
    {"title": "Short title", "detail": "1-2 sentence actionable advice."}
  ]
}

Rules:
- keywordsFound: 6-12 important keywords that ARE present in the CV
- keywordsMissing: 6-12 important keywords that are ABSENT${jobText ? ' based on the job description' : ' (industry-standard terms)'}
- issues: 4-7 issues with mix of critical/warning/info severities
- recommendations: exactly 5 specific prioritized action items
- Return ONLY the JSON object, no markdown, no explanation, no code blocks

CV:
${cvText}

${jobText ? `Job Description:\n${jobText}` : ''}`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.3,
          },
        }),
      }
    );

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error.message || 'Gemini API error');
    }

    const rawText = data.candidates[0].content.parts[0].text.trim();
    const cleaned = rawText.replace(/```json|```/g, '').trim();
    const result = JSON.parse(cleaned);

    return res.status(200).json(result);

  } catch (error) {
    console.error('Handler error:', error);
    return res.status(500).json({ error: error.message });
  }
}
