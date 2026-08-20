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

    if (
      !process.env.PAYPAL_CLIENT_ID ||
      !process.env.PAYPAL_CLIENT_SECRET
    ) {
      return res.status(503).json({
        error: "PayPal is not connected yet."
      });
    }

    const credentials = Buffer.from(
      process.env.PAYPAL_CLIENT_ID +
      ":" +
      process.env.PAYPAL_CLIENT_SECRET
    ).toString("base64");

    // Get PayPal access token
    const tokenResponse = await fetch(
      `${PAYPAL_BASE}/v1/oauth2/token`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type":
            "application/x-www-form-urlencoded"
        },
        body: "grant_type=client_credentials"
      }
    );

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error("PayPal authentication error:", tokenData);

      return res.status(502).json({
        error:
          tokenData.error_description ||
          "PayPal authentication failed."
      });
    }

    // Create order
    const orderResponse = await fetch(
      `${PAYPAL_BASE}/v2/checkout/orders`,
      {
        method: "POST",
        headers: {
          Authorization:
            `Bearer ${tokenData.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          intent: "CAPTURE",

          purchase_units: [
            {
              reference_id: productId,
              description: product.name,

              amount: {
                currency_code: "USD",
                value: product.price
              }
            }
          ],

          application_context: {
            brand_name: "Colour by Lines",
            user_action: "PAY_NOW",
            return_url:
              "https://colour-by-lines.onrender.com/paypal-success",
            cancel_url:
              "https://colour-by-lines.onrender.com/paypal-cancel"
          }
        })
      }
    );

    const orderData = await orderResponse.json();

    if (!orderResponse.ok) {
      console.error(
        "PayPal order error:",
        orderData
      );

      return res.status(502).json({
        error:
          orderData.message ||
          "PayPal order creation failed."
      });
    }

    const approvalLink =
      orderData.links?.find(
        link => link.rel === "approve"
      );

    if (!approvalLink) {
      return res.status(502).json({
        error:
          "PayPal did not return a checkout link."
      });
    }

    res.json({
      approvalUrl: approvalLink.href,
      orderId: orderData.id
    });

  } catch (error) {

    console.error(
      "Create order error:",
      error
    );

    res.status(500).json({
      error:
        "Could not create PayPal order."
    });
  }
});


// PayPal sends the customer here after approval
app.get(
  "/paypal-success",
  async (req, res) => {

    try {

      const orderId = req.query.token;

      if (!orderId) {
        return res.status(400).send(
          "Missing PayPal order ID."
        );
      }

      if (
        !process.env.PAYPAL_CLIENT_ID ||
        !process.env.PAYPAL_CLIENT_SECRET
      ) {
        return res.status(503).send(
          "PayPal is not configured."
        );
      }

      const credentials = Buffer.from(
        process.env.PAYPAL_CLIENT_ID +
        ":" +
        process.env.PAYPAL_CLIENT_SECRET
      ).toString("base64");

      // Get access token
      const tokenResponse = await fetch(
        `${PAYPAL_BASE}/v1/oauth2/token`,
        {
          method: "POST",
          headers: {
            Authorization:
              `Basic ${credentials}`,
            "Content-Type":
              "application/x-www-form-urlencoded"
          },
          body:
            "grant_type=client_credentials"
        }
      );

      const tokenData =
        await tokenResponse.json();

      if (!tokenResponse.ok) {
        console.error(
          "Token error:",
          tokenData
        );

        return res.status(502).send(
          "PayPal authentication failed."
        );
      }

      // Capture approved payment
      const captureResponse = await fetch(
        `${PAYPAL_BASE}/v2/checkout/orders/${orderId}/capture`,
        {
          method: "POST",
          headers: {
            Authorization:
              `Bearer ${tokenData.access_token}`,
            "Content-Type":
              "application/json"
          }
        }
      );

      const captureData =
        await captureResponse.json();

      if (!captureResponse.ok) {
        console.error(
          "Capture error:",
          captureData
        );

        return res.status(502).send(
          "PayPal payment could not be completed."
        );
      }

      const paymentStatus =
        captureData.status;

      if (paymentStatus !== "COMPLETED") {
        return res.status(400).send(`
          <h1>Payment not completed</h1>
          <p>Your PayPal payment has not completed.</p>
          <p>Status: ${paymentStatus}</p>
        `);
      }

      const purchaseUnit =
        captureData.purchase_units?.[0];

      const productId =
        purchaseUnit?.reference_id;

      const product =
        PRODUCTS[productId];

      if (!product) {
        return res.status(400).send(
          "Product information could not be found."
        );
      }

      // Successful payment page
      res.send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport"
content="width=device-width,initial-scale=1">

<title>Payment Complete | Colour by Lines</title>

<style>

body {
  font-family: Arial, sans-serif;
  background: #f7f8f4;
  text-align: center;
  padding: 40px 20px;
  color: #202820;
}

.box {
  max-width: 600px;
  margin: auto;
  background: white;
  padding: 40px;
  border-radius: 20px;
  box-shadow: 0 5px 25px rgba(0,0,0,.08);
}

h1 {
  font-size: 36px;
}

.success {
  font-size: 60px;
}

.download {
  display: inline-block;
  margin-top: 25px;
  padding: 16px 28px;
  background: #202820;
  color: white;
  text-decoration: none;
  border-radius: 10px;
  font-weight: bold;
}

</style>
</head>

<body>

<div class="box">

<div class="success">✅</div>

<h1>Payment Complete!</h1>

<p>
Thank you for your purchase from
<strong>Colour by Lines</strong>.
</p>

<p>
Your colouring page is ready.
</p>

<a
class="download"
href="/${product.file}"
download
>
Download Your Colouring Page
</a>

</div>

</body>
</html>
      `);

    } catch (error) {

      console.error(
        "PayPal success error:",
        error
      );

      res.status(500).send(
        "There was a problem completing your payment."
      );
    }
  }
);


// Customer cancelled PayPal checkout
app.get(
  "/paypal-cancel",
  (req, res) => {

    res.send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport"
content="width=device-width,initial-scale=1">

<title>Payment Cancelled</title>

<style>

body {
  font-family: Arial, sans-serif;
  background: #f7f8f4;
  text-align: center;
  padding: 50px 20px;
  color: #202820;
}

.box {
  max-width: 600px;
  margin: auto;
  background: white;
  padding: 40px;
  border-radius: 20px;
}

a {
  display: inline-block;
  margin-top: 20px;
  padding: 14px 25px;
  background: #202820;
  color: white;
  text-decoration: none;
  border-radius: 10px;
  font-weight: bold;
}

</style>
</head>

<body>

<div class="box">

<h1>Payment Cancelled</h1>

<p>
No payment was taken.
</p>

<a href="/">
Return to Colour by Lines
</a>

</div>

</body>
</html>
    `);
  }
);


app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `Colour by Lines running on port ${PORT}`
    );
  }
);
