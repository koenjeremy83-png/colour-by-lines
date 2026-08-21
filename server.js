const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

const PRODUCTS = {
  page1: {
  name: "John Deere 8R 250 Tractor",
  price: "1.00",
  file: "page-1.png"
},
page2: {
  name: "John Deere 7R Tractor",
  price: "1.00",
  file: "page-2.png"
}   
};

const PAYPAL_BASE =
  process.env.PAYPAL_BASE_URL ||
  "https://api-m.sandbox.paypal.com";
console.log("PayPal Client ID loaded:", !!process.env.PAYPAL_CLIENT_ID);
console.log("PayPal Secret loaded:", !!process.env.PAYPAL_CLIENT_SECRET);
console.log("PayPal Base URL:", PAYPAL_BASE);

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    service: "Colour by Lines"
  });
});

// Create PayPal order
app.post("/api/create-order", async (req, res) => {
  try {
    const productId = req.body.product;

    const product = PRODUCTS[productId];

    if (!product) {
      return res.status(400).json({
        error: "Product not found."
      });
    }

    const clientId = process.env.PAYPAL_CLIENT_ID;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

    const paypalBase =
      process.env.PAYPAL_BASE_URL ||
      "https://api-m.sandbox.paypal.com";

    if (!clientId || !clientSecret) {
      console.error("PayPal credentials are missing.");

      return res.status(500).json({
        error: "PayPal is not configured."
      });
    }

    console.log("Creating PayPal order for:", productId);

    // Get PayPal access token
    const auth = Buffer
      .from(`${clientId}:${clientSecret}`)
      .toString("base64");

    const tokenResponse = await fetch(
      `${paypalBase}/v1/oauth2/token`,
      {
        method: "POST",
        headers: {
          "Authorization": `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: "grant_type=client_credentials"
      }
    );

    const tokenText = await tokenResponse.text();

    let tokenData;

    try {
      tokenData = JSON.parse(tokenText);
    } catch {
      console.error("PayPal token response:", tokenText);

      return res.status(502).json({
        error: "PayPal returned an invalid authentication response."
      });
    }

    if (!tokenResponse.ok) {
      console.error(
        "PayPal authentication failed:",
        tokenData
      );

      return res.status(502).json({
        error: "PayPal authentication failed."
      });
    }

    const accessToken = tokenData.access_token;

    // Create PayPal order
    const orderResponse = await fetch(
      `${paypalBase}/v2/checkout/orders`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          intent: "CAPTURE",

          purchase_units: [
            {
              description: product.name,

              amount: {
                currency_code: "USD",
                value: Number(product.price).toFixed(2)
              }
            }
          ],

          application_context: {
            brand_name: "Colour by Lines",
            landing_page: "LOGIN",
            user_action: "PAY_NOW",

            return_url:
              `${process.env.APP_URL || "https://colour-by-lines-1.onrender.com"}/paypal-success`,

            cancel_url:
              `${process.env.APP_URL || "https://colour-by-lines-1.onrender.com"}/paypal-cancel`
          }
        })
      }
    );

    const orderText = await orderResponse.text();

    let orderData;

    try {
      orderData = JSON.parse(orderText);
    } catch {
      console.error(
        "PayPal order response:",
        orderText
      );

      return res.status(502).json({
        error: "PayPal returned an invalid order response."
      });
    }

    if (!orderResponse.ok) {
      console.error(
        "PayPal order creation failed:",
        orderData
      );

      return res.status(502).json({
        error:
          orderData?.details?.[0]?.description ||
          "PayPal could not create the order."
      });
    }

    const approvalLink = orderData.links?.find(
      link => link.rel === "approve"
    );

    if (!approvalLink) {
      console.error(
        "PayPal approval link missing:",
        orderData
      );

      return res.status(502).json({
        error: "PayPal checkout link was not returned."
      });
    }

    console.log(
      "PayPal order created:",
      orderData.id
    );

    res.json({
      success: true,
      orderId: orderData.id,
      approvalUrl: approvalLink.href
    });

  } catch (error) {

    console.error(
      "Create PayPal order error:",
      error
    );

    res.status(500).json({
      error: "Unable to start PayPal checkout."
    });
  }
});
app.get("/paypal-cancel", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Payment Cancelled | Colour by Lines</title>
</head>

<body style="font-family:Arial;text-align:center;padding:50px;">

<h1>Payment Cancelled</h1>

<p>No payment was taken.</p>

<a href="/">
Return to Colour by Lines
</a>

</body>
</html>
  `);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `Colour by Lines running on port ${PORT}`
  );
});
