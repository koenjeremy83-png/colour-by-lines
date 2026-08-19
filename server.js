const express = require('express');
const path = require('path');
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PRODUCTS = {
  page1: { name: 'John Deere 8R 250 Tractor', price: '1.00', file: 'page-1.pdf' },
  page2: { name: 'John Deere 7R Tractor', price: '1.00', file: 'page-2.pdf' }
};

async function paypalToken() {
  const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64');
  const base = process.env.PAYPAL_BASE_URL || 'https://api-m.sandbox.paypal.com';
  const r = await fetch(`${base}/v1/oauth2/token`, {
    method:'POST',
    headers:{Authorization:`Basic ${auth}`,'Content-Type':'application/x-www-form-urlencoded'},
    body:'grant_type=client_credentials'
  });
  const data=await r.json();
  if(!r.ok) throw new Error(data.error_description || 'PayPal authentication failed');
  return {token:data.access_token,base};
}

app.post('/api/create-order', async (req,res)=>{
  try{
    const p=PRODUCTS[req.body.product];
    if(!p) return res.status(400).json({error:'Unknown product'});
    const {token,base}=await paypalToken();
    const r=await fetch(`${base}/v2/checkout/orders`,{
      method:'POST',
      headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
      body:JSON.stringify({
        intent:'CAPTURE',
        purchase_units:[{reference_id:req.body.product,description:p.name,amount:{currency_code:'USD',value:p.price}}]
      })
    });
    const data=await r.json();
    if(!r.ok) return res.status(502).json({error:data.message||'PayPal order creation failed'});
    const approval=data.links?.find(x=>x.rel==='approve');
    if(!approval) return res.status(502).json({error:'No PayPal approval link returned'});
    res.json({approvalUrl:approval.href,orderId:data.id});
  }catch(e){res.status(500).json({error:e.message});}
});

app.get('/success', (req,res)=>res.send('<h1>Payment received</h1><p>The next production step is to capture/verify the PayPal order and then securely deliver the purchased PDF.</p>'));
app.listen(process.env.PORT||3000,()=>console.log('Colour by Lines running on port '+(process.env.PORT||3000)));
