// Junta el estado del envio (iComfly) con el valor a pagar (Shopify).
// Variables en Vercel: SHOPIFY_ADMIN_TOKEN (obligatoria), SHOPIFY_STORE_DOMAIN y SHOPIFY_API_VERSION (opcionales).
const QUERY = `query($q: String!) {
  orders(first: 5, query: $q) {
    nodes {
      currentTotalPriceSet { shopMoney { amount } }
      fulfillments { trackingInfo { number } }
    }
  }
}`;

async function buscarValor(guia) {
  const token = process.env.SHOPIFY_ADMIN_TOKEN;
  if (!token) return null;
  const tienda = process.env.SHOPIFY_STORE_DOMAIN || 'lobixshop.myshopify.com';
  const version = process.env.SHOPIFY_API_VERSION || '2026-07';
  const r = await fetch(`https://${tienda}/admin/api/${version}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({ query: QUERY, variables: { q: guia } })
  });
  if (!r.ok) throw new Error(`Shopify ${r.status}`);
  const json = await r.json();
  const pedidos = (json.data && json.data.orders && json.data.orders.nodes) || [];
  // La busqueda de Shopify es por texto: solo vale el pedido que tiene exactamente esta guia.
  const pedido = pedidos.find((o) => (o.fulfillments || []).some((f) => (f.trackingInfo || []).some((t) => t.number === guia)));
  return pedido ? Number(pedido.currentTotalPriceSet.shopMoney.amount) : null;
}

module.exports = async function handler(req, res) {
  const guia = String(req.query.guia || '').trim();
  if (!/^[0-9A-Za-z-]{4,30}$/.test(guia)) return res.status(404).json({});
  try {
    const r = await fetch(`https://api.icomfly.com/api/public/tracking/${encodeURIComponent(guia)}`);
    if (r.status === 404) return res.status(404).json({});
    if (!r.ok) return res.status(502).json({});
    const data = await r.json();
    delete data.branding;
    try {
      data.amount_due = await buscarValor(guia);
    } catch (e) {
      console.error('No se pudo leer el valor en Shopify:', e.message);
      data.amount_due = null;
    }
    res.setHeader('Cache-Control', 's-maxage=60');
    return res.status(200).json(data);
  } catch (e) {
    console.error('No se pudo leer el rastreo:', e.message);
    return res.status(502).json({});
  }
};
