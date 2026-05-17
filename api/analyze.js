export default async function handler(req, res) {
  // Разрешаем нашему сайту на github.io делать запросы к этому бэкенду
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

    // Сюда Vercel подставит наш секретный ключ, который никто не увидит
    const apiKey = process.env.OPENAI_API_KEY;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an expert ATS (Applicant Tracking System) optimizer. Analyze the CV against the job description. Provide scores, missing keywords, and structural feedback.'
          },
          {
            role: 'user',
            content: `CV Text:\n${cvText}\n\nJob Description:\n${jobText || 'General ATS Scan'}`
          }
        ],
        temperature: 0.3
      })
    });

    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
