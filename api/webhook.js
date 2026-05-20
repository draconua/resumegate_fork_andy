import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // Проверяем, что это POST запрос (Lemon Squeezy присылает именно его)
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  // 1. Настройка Supabase с "секретным" ключом
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body = req.body;
    const eventName = body.meta.event_name; // Что произошло?
    const userEmail = body.data.attributes.user_email; // Кто оплатил?

    console.log(`Event: ${eventName}, User: ${userEmail}`);

    // 2. Если оплата прошла успешно (создан заказ или подписка)
    if (eventName === 'order_created' || eventName === 'subscription_created') {
      
      // Обновляем статус is_pro в таблице profiles
      const { error } = await supabase
        .from('profiles')
        .update({ is_pro: true })
        .eq('email', userEmail);

      if (error) throw error;
      
      console.log(`User ${userEmail} is now PRO!`);
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('Webhook error:', err.message);
    res.status(400).json({ error: err.message });
  }
}
